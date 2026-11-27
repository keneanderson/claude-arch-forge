export const meta = {
  name: 'scaffold',
  description: 'From the confirmed docs/architecture/decision.json, generates the repository foundation and each unit\'s directories and sample implementation in parallel, then runs build/test verification and a dependency-direction conformance check',
  whenToUse: 'Started by the arch-forge:design or arch-forge:scaffold skill after the architecture is confirmed. args: { pluginRoot, docsDir, toolchainPath?, units: [{ name, language, path, entrypoint? }] }. Units with the same path are generated in order as one build unit',
  phases: [
    { title: 'Foundation', detail: 'Root layout, API contracts, CI, AGENTS.md / CLAUDE.md, common rules', model: 'sonnet' },
    { title: 'Scaffold', detail: 'Per build unit: generate with the language scaffolder → verify → fix (units sharing a path go in order)', model: 'sonnet' },
    { title: 'Sync', detail: 'Align AGENTS.md / architecture.md / per-unit rules with the generated code', model: 'sonnet' },
    { title: 'Conformance', detail: 'Conformance check against the ADRs and dependency rules', model: 'sonnet' },
  ],
}

// ---- Input -------------------------------------------------------------------
// Depending on the caller, args may arrive as a JSON string, so accept both
const ARGS = typeof args === 'string' ? (() => { try { return JSON.parse(args) } catch (e) { return {} } })() : (args ?? {})
const docs = ARGS.docsDir ?? 'docs/architecture'
const pluginRoot = ARGS.pluginRoot ?? ''
const units = Array.isArray(ARGS.units) ? ARGS.units : []
if (units.length === 0) {
  throw new Error('args.units is empty. Pass an array of { name, language, path, entrypoint } from the units in decision.json')
}

// Names and paths are used as file paths in agent prompts. Reject values that escape the directory
const SAFE_NAME = /^[a-z][a-z0-9-]*$/
const SAFE_PATH = /^(\.|[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*)$/
const isSafePath = p => typeof p === 'string' && SAFE_PATH.test(p) && !p.split('/').includes('..')
const normPath = p => (p === './' ? '.' : p.replace(/^\.\//, '').replace(/\/$/, '') || '.')
if (!isSafePath(docs)) throw new Error(`invalid docsDir: ${JSON.stringify(docs)}`)

// Toolchain directories found by the detection script (scripts/detect-toolchains.sh --env).
// Even where go and friends on PATH fail through shims (goenv / asdf), subagents use the same real binaries
const toolchainPath = typeof ARGS.toolchainPath === 'string' ? ARGS.toolchainPath : ''
const SAFE_BINPATH = /^\/[A-Za-z0-9._@+\/-]+(:\/[A-Za-z0-9._@+\/-]+)*$/
if (toolchainPath && (!SAFE_BINPATH.test(toolchainPath) || toolchainPath.split(/[/:]/).includes('..'))) {
  throw new Error(`invalid toolchainPath: ${JSON.stringify(toolchainPath)} (absolute paths joined with colons)`)
}

const SCAFFOLDER = {
  go: 'arch-forge:go-scaffolder',
  php: 'arch-forge:php-scaffolder',
  rust: 'arch-forge:rust-scaffolder',
}
for (const u of units) {
  if (!u || !SAFE_NAME.test(u.name || '')) throw new Error(`invalid unit name: ${JSON.stringify(u && u.name)} (must match ${SAFE_NAME})`)
  if (typeof u.path !== 'string' || !isSafePath(normPath(u.path))) throw new Error(`invalid path for unit ${u.name}: ${JSON.stringify(u.path)} (a relative path inside the repository)`)
  if (!SCAFFOLDER[u.language]) throw new Error(`unsupported language: ${u.name} (${u.language})`)
  if (u.entrypoint !== undefined && u.entrypoint !== '' && !isSafePath(u.entrypoint)) {
    throw new Error(`invalid entrypoint for unit ${u.name}: ${JSON.stringify(u.entrypoint)}`)
  }
}
const languages = [...new Set(units.map(u => u.language))]

// Units with the same path share one build unit (go.mod / composer.json / Cargo workspace).
// Generating them in parallel would make writes to shared files collide, so a group is built in order and verified once
const groups = []
for (const u of units) {
  const key = normPath(u.path)
  let g = groups.find(x => x.path === key)
  if (!g) groups.push((g = { path: key, units: [] }))
  g.units.push(u)
}
for (const g of groups) {
  if (g.units.length < 2) continue
  const langs = new Set(g.units.map(u => u.language))
  if (langs.size > 1) throw new Error(`units sharing path ${g.path} have different languages: ${g.units.map(u => `${u.name}(${u.language})`).join(', ')}`)
  const eps = g.units.map(u => u.entrypoint || '')
  if (eps.some(e => !e) || new Set(eps).size !== eps.length) {
    throw new Error(`units sharing path ${g.path} each need a distinct entrypoint: ${g.units.map(u => `${u.name}=${u.entrypoint || '(none)'}`).join(', ')}`)
  }
}
const groupLabel = g => g.units.map(u => u.name).join('+')

const toolchainNote = toolchainPath
  ? `In this environment go and friends on PATH do not work. When running build or verification commands with Bash, first run export PATH="${toolchainPath}:$PATH" (Claude Code asks for approval each time; not needed once the project has .go-version or similar and go on PATH works).`
  : ''
const ctx =
  `Work in the working directory (the project root). The confirmed architecture is in ${docs}/decision.json and ${docs}/adr/. pluginRoot=${pluginRoot}. ` +
  'Write documents, comments and the final response in the user\'s language (the language of decision.json / the ADRs). ' +
  'Do not edit accepted ADRs or decision.json. Run the verification commands before reporting completion, and return the results as evidence. ' +
  toolchainNote

const SCAFFOLD_RESULT = {
  type: 'object',
  required: ['unit', 'filesCreated', 'checks', 'unresolved'],
  properties: {
    unit: { type: 'string' },
    filesCreated: { type: 'integer' },
    checks: { type: 'array', items: { type: 'string' }, description: 'The verification commands run and their results (e.g. "go test ./...: passed")' },
    unresolved: { type: 'array', items: { type: 'string' }, description: 'Failures that could not be fixed, unverified items, points needing a decision' },
  },
}

const VERIFY_RESULT = {
  type: 'object',
  required: ['unit', 'allPassed', 'results'],
  properties: {
    unit: { type: 'string' },
    allPassed: { type: 'boolean', description: 'true if nothing failed (skipped is allowed)' },
    results: {
      type: 'array',
      items: {
        type: 'object',
        required: ['command', 'status'],
        properties: {
          command: { type: 'string' },
          status: { enum: ['passed', 'failed', 'skipped'] },
          detail: { type: 'string' },
        },
      },
    },
  },
}

const CONFORMANCE_RESULT = {
  type: 'object',
  required: ['violations', 'summary'],
  properties: {
    violations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['location', 'rule', 'fix'],
        properties: { location: { type: 'string' }, rule: { type: 'string' }, fix: { type: 'string' } },
      },
    },
    summary: { type: 'string' },
  },
}

// ---- 1. Foundation ---------------------------------------------------------------------
phase('Foundation')
const sharedNote = groups
  .filter(g => g.units.length > 1)
  .map(g => `path ${g.path} is one build unit shared by units ${groupLabel(g)} (one manifest; list it only once in go.work / workspace members; CI jobs are per build unit too)`)
  .join('. ')
await agent(`${ctx}\nGenerate the repository foundation according to decision.json. Units: ${JSON.stringify(units)}\n${sharedNote ? sharedNote + '.\n' : ''}Copy common plus the rules for these languages into .claude/rules/arch-forge/: ${languages.join(', ')}`, {
  agentType: 'arch-forge:foundation-builder',
  model: 'sonnet',
  effort: 'medium',
  label: 'foundation',
})

// ---- 2. Per build unit: generate → verify → fix (build units run concurrently without a barrier) -------------
const rootGuard = path =>
  path === '.'
    ? 'This unit\'s path is the repository root. Do not overwrite the README.md / AGENTS.md / CLAUDE.md / Makefile / .github / deploy / api already created by foundation-builder; only append to them if needed.'
    : `This unit\'s path is ${path}. Do not change any other path.`

// Role within the group. The first builds the shared parts; later ones add only their own entrypoint
const roleNote = (g, i) => {
  if (g.units.length < 2) return ''
  const others = g.units.filter((_, j) => j !== i).map(u => `${u.name} (${u.entrypoint})`).join(', ')
  const me = g.units[i]
  return i === 0
    ? `This unit shares the build unit at path ${g.path} with ${others}. You are the first in charge, so build the shared parts (the manifest such as go.mod, shared packages such as platform and config, the build unit\'s Makefile, lint settings and Dockerfile) and your own entrypoint ${me.entrypoint}. Do not create the other units\' entrypoints. Build the shared parts on the assumption that every unit uses them.`
    : `This unit shares the build unit at path ${g.path} with ${others}. The shared parts were already created by the earlier unit, so do not rebuild them. Add your own entrypoint ${me.entrypoint} and the packages only this unit uses. If the shared parts need changes, keep them to minimal additions and write the reason in unresolved in your final response.`
}

const NO_WEAKEN =
  'Never make a fix that passes by weakening verification or checks (tests, lint settings, arch-lint settings, the minimum-version check script) by reducing their targets, weakening conditions or adding skips. ' +
  'If it cannot be fixed without weakening, do not fix it; write "checks would need to be weakened: <reason>" in unresolved and leave the decision to the user.'

const verify = (g, label) =>
  agent(
    `Verify the build unit ${g.path} (language: ${g.units[0].language}, units: ${g.units.map(u => u.name + (u.entrypoint ? `=${u.entrypoint}` : '')).join(', ')}). pluginRoot=${pluginRoot}. ${toolchainNote}`,
    { agentType: 'arch-forge:scaffold-verifier', model: 'haiku', effort: 'low', schema: VERIFY_RESULT, label, phase: 'Scaffold' },
  )

const groupResults = await pipeline(
  groups,
  // stage 1: generate (in order within a group)
  async g => {
    const scaffolded = []
    for (let i = 0; i < g.units.length; i++) {
      const u = g.units[i]
      const r = await agent(`${ctx}\nAssigned unit: ${u.name}\n${rootGuard(g.path)}\n${roleNote(g, i)}`, {
        agentType: SCAFFOLDER[u.language],
        model: 'sonnet',
        effort: 'medium',
        schema: SCAFFOLD_RESULT,
        label: `${u.name} (${u.language})`,
        phase: 'Scaffold',
      })
      scaffolded.push(r)
    }
    return scaffolded
  },
  // stage 2: verify (once per group)
  (scaffolded, g) => verify(g, `${groupLabel(g)} verify`).then(v => ({ scaffolded, verified: v })),
  // stage 3: only on failure, fix once and re-verify
  async (prev, g) => {
    if (prev.verified && prev.verified.allPassed) return { ...prev, fixed: false }
    const failures = (prev.verified ? prev.verified.results : [])
      .filter(r => r.status === 'failed')
      .map(r => `- ${r.command}: ${r.detail ?? ''}`)
      .join('\n')
    const u = g.units[0]
    const scope = g.units.length > 1 ? `Fix the units ${groupLabel(g)} sharing the build unit ${g.path} together.` : ''
    await agent(`${ctx}\nAssigned unit: ${u.name}\n${rootGuard(g.path)}\n${scope}\nVerification reported the following failures. Find the cause, fix it, and get the build and tests passing again:\n${failures}\n${NO_WEAKEN}`, {
      agentType: SCAFFOLDER[u.language],
      model: 'sonnet',
      effort: 'high',
      label: `${groupLabel(g)} fix`,
      phase: 'Scaffold',
    })
    const reverified = await verify(g, `${groupLabel(g)} re-verify`)
    return { scaffolded: prev.scaffolded, verified: reverified, fixed: true }
  },
)

// ---- 3. Document sync -----------------------------------------------------------
phase('Sync')
await agent(`${ctx}\nRun in sync mode. Update AGENTS.md / architecture.md / README.md to match the actual structure of the generated units ${units.map(u => u.name).join(', ')}, and generate .claude/rules/arch-forge/units/<unit>.md.`, {
  agentType: 'arch-forge:foundation-builder',
  model: 'sonnet',
  effort: 'medium',
  label: 'docs sync',
})

// ---- 4. Conformance check -------------------------------------------------------------
phase('Conformance')
const conformance = await agent(
  `${ctx}\nIn conformance mode, check whether the generated code conforms to decision.json and the ADRs\' dependency rules, and write the result to ${docs}/07-conformance.md.`,
  { agentType: 'arch-forge:architecture-critic', model: 'sonnet', effort: 'high', schema: CONFORMANCE_RESULT, label: 'conformance' },
)

const summary = units.map(u => {
  const gi = groups.findIndex(g => g.units.includes(u))
  const g = groups[gi]
  const r = groupResults[gi]
  const shared = g.units.length > 1 ? { buildUnit: g.path, sharedWith: g.units.filter(x => x !== u).map(x => x.name) } : {}
  if (!r) return { unit: u.name, status: 'error', note: 'the agent failed (check the log)', ...shared }
  const results = r.verified ? r.verified.results : []
  const mine = (r.scaffolded || [])[g.units.indexOf(u)]
  return {
    unit: u.name,
    language: u.language,
    path: u.path,
    ...(u.entrypoint ? { entrypoint: u.entrypoint } : {}),
    ...shared,
    status: r.verified && r.verified.allPassed ? 'passed' : 'failed',
    fixedOnce: r.fixed,
    failed: results.filter(x => x.status === 'failed').map(x => x.command),
    skipped: results.filter(x => x.status === 'skipped').map(x => x.command),
    unresolved: mine ? mine.unresolved : ['no result from the generation agent'],
  }
})

return {
  docsDir: docs,
  units: summary,
  conformance: conformance
    ? { violations: conformance.violations.length, summary: conformance.summary }
    : { violations: null, summary: 'the conformance check was skipped or failed' },
}
