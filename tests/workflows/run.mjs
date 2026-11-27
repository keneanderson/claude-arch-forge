// Tests for the arch-forge workflows (Node standard library only)
//
// node tests/workflows/run.mjs
//
// Mocks the Workflow runtime's agent / parallel / pipeline / phase / log and checks
// the scripts' control flow (branches, revisions, fix loops, input validation).
// The mock pipeline calls stage1 with (item, index) and later stages with (prev, item, index).

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const WF = join(ROOT, 'plugins', 'arch-forge', 'workflows')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

function load(name) {
  const src = readFileSync(join(WF, name), 'utf8').replace(/^export const meta/m, 'const meta')
  const fn = new AsyncFunction('args', 'agent', 'parallel', 'pipeline', 'phase', 'log', src)
  return async (args, responder) => {
    const calls = []
    const agent = async (prompt, opts = {}) => {
      calls.push({ prompt, ...opts })
      return responder(opts, prompt, calls)
    }
    const parallel = async thunks => Promise.all(thunks.map(t => t().catch(() => null)))
    const pipeline = async (items, ...stages) =>
      Promise.all(
        items.map(async (item, i) => {
          try {
            let prev = await stages[0](item, i)
            for (const s of stages.slice(1)) prev = await s(prev, item, i)
            return prev
          } catch {
            return null
          }
        }),
      )
    const result = await fn(args, agent, parallel, pipeline, () => {}, () => {})
    return { result, calls }
  }
}

const tests = []
const test = (name, fn) => tests.push({ name, fn })

// ---------------------------------------------------------------- propose.js

const propose = load('propose.js')

function proposeResponder({ scaleClass = 'M', topology = 'modular-monolith', critical = {}, blocking = [], factsFail = false } = {}) {
  return (opts, prompt) => {
    switch (opts.agentType) {
      case 'arch-forge:requirements-analyst':
        return { scaleClass, score: 12, contexts: ['ordering'], topQualities: ['modifiability'], openQuestions: ['SLA?'], blockingQuestions: blocking }
      case 'arch-forge:stack-researcher':
        if (factsFail) return null  // the runtime returns null on failure or skip
        return { libraries: [{ name: 'github.com/go-chi/chi/v5', latest: 'v5.2.3', status: 'active', source: 'https://proxy.golang.org/' }], unverified: [] }
      case 'arch-forge:topology-strategist':
        return { recommended: topology, units: [{ name: 'app', kind: 'app', responsibility: 'everything' }], rationale: 'r', risks: [] }
      case 'arch-forge:solution-architect': {
        const id = /Option ID: (\S+)/.exec(prompt)[1]
        return {
          id,
          name: id,
          topology,
          summary: 's',
          units: [{ name: 'app', language: 'go', pattern: 'clean', framework: 'chi', libraries: { db: 'sqlc+pgx' } }],
          weaknesses: [],
        }
      }
      case 'arch-forge:architecture-critic': {
        const ids = [...prompt.matchAll(/03-options\/(option-[a-z])\.md/g)].map(m => m[1])
        const refs = /Comparison-only options: ([^.]+)\./.exec(prompt)
        const refIds = refs ? refs[1].split(', ') : []
        return {
          options: ids.map(id => ({
            id,
            critical: critical[id] ?? 0,
            major: 0,
            verdict: refIds.includes(id) ? 'reference' : 'adopt',
            topIssues: ['x'],
          })),
        }
      }
      case 'arch-forge:proposal-writer':
        return { recommendedOption: 'option-a', reasons: ['a'], decisionsNeeded: [] }
      default:
        throw new Error(`unexpected agentType ${opts.agentType}`)
    }
  }
}

test('propose: with a monolith recommendation at scale S there are 2 options', async () => {
  const { result, calls } = await propose({ pluginRoot: '/p', docsDir: 'docs/architecture' }, proposeResponder({ scaleClass: 'S', topology: 'monolith' }))
  assert.deepEqual(result.options.map(o => o.id), ['option-a', 'option-b'])
  assert.equal(calls.filter(c => c.agentType === 'arch-forge:solution-architect').length, 2)
})

test('propose: at scale L, option-c is added', async () => {
  const { result } = await propose({ pluginRoot: '/p' }, proposeResponder({ scaleClass: 'L', topology: 'monolith' }))
  assert.deepEqual(result.options.map(o => o.id), ['option-a', 'option-b', 'option-c'])
})

test('propose: only options with critical findings are revised', async () => {
  const { result, calls } = await propose({ pluginRoot: '/p' }, proposeResponder({ critical: { 'option-b': 2 } }))
  assert.deepEqual(result.revised, ['option-b'])
  assert.ok(calls.some(c => c.label === 'option-b (revise)'))
  assert.ok(!calls.some(c => c.label === 'option-a (revise)'))
})

test('propose: works when args is a JSON string', async () => {
  const { result } = await propose(JSON.stringify({ pluginRoot: '/p', docsDir: 'docs/arch' }), proposeResponder())
  assert.equal(result.docsDir, 'docs/arch')
})

test('propose: rejects path traversal in docsDir', async () => {
  await assert.rejects(propose({ docsDir: '../etc' }, proposeResponder()), /invalid docsDir/)
})

test('propose: includes each option\'s framework and major libraries in the result', async () => {
  const { result, calls } = await propose({ pluginRoot: '/p' }, proposeResponder())
  assert.deepEqual(result.options[0].stacks, [{ unit: 'app', language: 'go', framework: 'chi', libraries: { db: 'sqlc+pgx' } }])
  const architect = calls.find(c => c.agentType === 'arch-forge:solution-architect')
  assert.ok(architect.schema.properties.units.items.required.includes('framework'))
  assert.match(architect.prompt, /frameworks\.md/)
})

test('propose: with high-impact unknowns, returns needs-input instead of designing', async () => {
  const blocking = [{ question: 'How many concurrent chat connections?', why: 'Changes how persistent connections are handled', choices: ['up to 100', 'up to 10k'] }]
  const { result, calls } = await propose({ pluginRoot: '/p' }, proposeResponder({ blocking }))
  assert.equal(result.status, 'needs-input')
  assert.deepEqual(result.blockingQuestions, blocking)
  assert.ok(!calls.some(c => c.agentType === 'arch-forge:topology-strategist'))
})

test('propose: when re-run with clarified, goes to the end even if unknowns remain', async () => {
  const blocking = [{ question: 'q', why: 'w', choices: ['a', 'b'] }]
  const { result } = await propose({ pluginRoot: '/p', clarified: true }, proposeResponder({ blocking }))
  assert.equal(result.status, 'ok')
  assert.equal(result.recommendedOption, 'option-a')
})

test('propose: checks library facts once before designing, and has every option cite them', async () => {
  const { result, calls } = await propose({ pluginRoot: '/p' }, proposeResponder())
  const facts = calls.filter(c => c.agentType === 'arch-forge:stack-researcher')
  assert.equal(facts.length, 1)
  const factsIdx = calls.indexOf(facts[0])
  const architects = calls.filter(c => c.agentType === 'arch-forge:solution-architect')
  for (const a of architects) {
    assert.ok(calls.indexOf(a) > factsIdx)
    assert.match(a.prompt, /from \S*02b-stack-facts\.md and do not re-check/)
  }
  assert.equal(result.stackFacts.checked, 1)
})

test('propose: if the fact check fails, passes the source rules and continues designing', async () => {
  const { result, calls } = await propose({ pluginRoot: '/p' }, proposeResponder({ factsFail: true }))
  assert.equal(result.status, 'ok')
  assert.equal(result.stackFacts, null)
  assert.match(calls.find(c => c.agentType === 'arch-forge:solution-architect').prompt, /no aggregator sites/)
})

test('propose: for a modular monolith at scale M, option-c is comparison-only and not revised even if critical', async () => {
  const { result, calls } = await propose({ pluginRoot: '/p' }, proposeResponder({ critical: { 'option-c': 3 } }))
  const c = result.options.find(o => o.id === 'option-c')
  assert.equal(c.comparisonOnly, true)
  assert.deepEqual(result.revised, [])
  assert.match(calls.find(x => x.label === 'option-c').prompt, /This option is comparison-only/)
  assert.match(calls.find(x => x.label === 'red-team review').prompt, /option-c/)
  assert.match(calls.find(x => x.label === 'proposal').prompt, /reference options/)
})

test('propose: at scale L, option-c is a candidate (not comparison-only)', async () => {
  const { result } = await propose({ pluginRoot: '/p' }, proposeResponder({ scaleClass: 'L', topology: 'microservices' }))
  assert.equal(result.options.find(o => o.id === 'option-c').comparisonOnly, false)
})

test('propose: passes document length limits to every stage', async () => {
  const { calls } = await propose({ pluginRoot: '/p' }, proposeResponder())
  assert.match(calls.find(c => c.label === 'option-a').prompt, /within 350 lines/)
  assert.match(calls.find(c => c.label === 'red-team review').prompt, /within 250 lines/)
  assert.match(calls.find(c => c.label === 'proposal').prompt, /within 250 lines/)
})

test('propose: every subagent is called with a schema', async () => {
  const { calls } = await propose({ pluginRoot: '/p' }, proposeResponder())
  for (const c of calls) assert.ok(c.schema, `${c.label} has no schema`)
})

// ---------------------------------------------------------------- scaffold.js

const scaffold = load('scaffold.js')

function scaffoldResponder({ failFirst = [] } = {}) {
  const verified = {}
  return opts => {
    if (opts.agentType === 'arch-forge:foundation-builder') return 'ok'
    if (opts.agentType === 'arch-forge:architecture-critic') return { violations: [], summary: 'no violations' }
    if (opts.agentType === 'arch-forge:scaffold-verifier') {
      const unit = opts.label.split(' ')[0]  // "api+worker" for a shared build unit
      verified[unit] = (verified[unit] ?? 0) + 1
      const fail = failFirst.includes(unit) && verified[unit] === 1
      return {
        unit,
        allPassed: !fail,
        results: [{ command: 'test', status: fail ? 'failed' : 'passed', detail: fail ? 'boom' : '' }, { command: 'arch-lint', status: 'skipped' }],
      }
    }
    if (/scaffolder$/.test(opts.agentType)) {
      return opts.schema ? { unit: opts.label.split(' ')[0], filesCreated: 10, checks: [], unresolved: [] } : 'fixed'
    }
    throw new Error(`unexpected agentType ${opts.agentType}`)
  }
}

const UNITS = [
  { name: 'order', language: 'go', path: 'services/order' },
  { name: 'billing', language: 'php', path: 'services/billing' },
  { name: 'catalog', language: 'rust', path: 'services/catalog' },
]

test('scaffold: picks a scaffolder per language, and every unit passes', async () => {
  const { result, calls } = await scaffold({ pluginRoot: '/p', units: UNITS }, scaffoldResponder())
  assert.deepEqual(result.units.map(u => u.status), ['passed', 'passed', 'passed'])
  for (const t of ['go', 'php', 'rust']) assert.ok(calls.some(c => c.agentType === `arch-forge:${t}-scaffolder`))
  assert.deepEqual(result.units[0].skipped, ['arch-lint'])
})

test('scaffold: on verification failure, fixes once and re-verifies', async () => {
  const { result, calls } = await scaffold({ pluginRoot: '/p', units: UNITS }, scaffoldResponder({ failFirst: ['billing'] }))
  const billing = result.units.find(u => u.unit === 'billing')
  assert.equal(billing.status, 'passed')
  assert.equal(billing.fixedOnce, true)
  assert.equal(calls.filter(c => c.label === 'billing fix').length, 1)
  assert.equal(calls.filter(c => c.label === 'order fix').length, 0)
})

test('scaffold: passes the used languages\' rules to Foundation, and has Sync create per-unit rules', async () => {
  const { calls } = await scaffold({ pluginRoot: '/p', units: UNITS }, scaffoldResponder())
  const foundation = calls.find(c => c.label === 'foundation')
  assert.match(foundation.prompt, /go, php, rust/)
  const sync = calls.find(c => c.label === 'docs sync')
  assert.match(sync.prompt, /units\/<unit>\.md/)
})

test('scaffold: rejects path traversal, invalid unit names and unsupported languages', async () => {
  await assert.rejects(scaffold({ units: [{ name: 'x', language: 'go', path: '../x' }] }, scaffoldResponder()), /invalid path/)
  await assert.rejects(scaffold({ units: [{ name: 'x', language: 'go', path: '/abs' }] }, scaffoldResponder()), /invalid path/)
  await assert.rejects(scaffold({ units: [{ name: 'X Y', language: 'go', path: 'x' }] }, scaffoldResponder()), /invalid unit name/)
  await assert.rejects(scaffold({ units: [{ name: 'x', language: 'java', path: 'x' }] }, scaffoldResponder()), /unsupported language/)
  await assert.rejects(scaffold({ units: [] }, scaffoldResponder()), /args.units is empty/)
})

test('scaffold: accepts a unit at the root (path=.)', async () => {
  const { result, calls } = await scaffold(JSON.stringify({ units: [{ name: 'app', language: 'go', path: '.' }] }), scaffoldResponder())
  assert.equal(result.units[0].status, 'passed')
  assert.match(calls.find(c => c.label === 'app (go)').prompt, /Do not overwrite/)
})

const SHARED = [
  { name: 'api', language: 'go', path: '.', entrypoint: 'cmd/api' },
  { name: 'chat', language: 'go', path: '.', entrypoint: 'cmd/chat' },
  { name: 'worker', language: 'go', path: './', entrypoint: 'cmd/worker' },
]

test('scaffold: units sharing a path are generated in order and verified once', async () => {
  const order = []
  const base = scaffoldResponder()
  const { result, calls } = await scaffold({ pluginRoot: '/p', units: SHARED }, (opts, prompt, all) => {
    if (opts.agentType === 'arch-forge:go-scaffolder') order.push(opts.label)
    return base(opts, prompt, all)
  })
  assert.deepEqual(order, ['api (go)', 'chat (go)', 'worker (go)'])
  assert.equal(calls.filter(c => c.agentType === 'arch-forge:scaffold-verifier').length, 1)
  assert.match(calls.find(c => c.label === 'api (go)').prompt, /You are the first in charge, so build the shared parts/)
  assert.match(calls.find(c => c.label === 'chat (go)').prompt, /do not rebuild them/)
  assert.deepEqual(result.units.map(u => u.status), ['passed', 'passed', 'passed'])
  assert.deepEqual(result.units[0].sharedWith, ['chat', 'worker'])
  assert.match(calls.find(c => c.label === 'foundation').prompt, /one build unit shared by units api\+chat\+worker/)
})

test('scaffold: when a shared build unit fails verification, fixes them together once', async () => {
  const { result, calls } = await scaffold({ pluginRoot: '/p', units: SHARED }, scaffoldResponder({ failFirst: ['api+chat+worker'] }))
  const fixes = calls.filter(c => c.label === 'api+chat+worker fix')
  assert.equal(fixes.length, 1)
  assert.match(fixes[0].prompt, /sharing the build unit \S+ together/)
  assert.ok(result.units.every(u => u.status === 'passed' && u.fixedOnce))
})

test('scaffold: a shared build unit requires entrypoints and cannot mix languages', async () => {
  await assert.rejects(
    scaffold({ units: [{ name: 'a', language: 'go', path: '.' }, { name: 'b', language: 'go', path: '.' }] }, scaffoldResponder()),
    /each need a distinct entrypoint/,
  )
  await assert.rejects(
    scaffold({ units: [{ name: 'a', language: 'go', path: 'x', entrypoint: 'cmd/a' }, { name: 'b', language: 'go', path: 'x', entrypoint: 'cmd/a' }] }, scaffoldResponder()),
    /each need a distinct entrypoint/,
  )
  await assert.rejects(
    scaffold({ units: [{ name: 'a', language: 'go', path: 'x', entrypoint: 'cmd/a' }, { name: 'b', language: 'php', path: 'x', entrypoint: 'bin/b' }] }, scaffoldResponder()),
    /have different languages/,
  )
  await assert.rejects(scaffold({ units: [{ name: 'a', language: 'go', path: '.', entrypoint: '../x' }] }, scaffoldResponder()), /invalid entrypoint/)
})

test('scaffold: passes the detected toolchain PATH to both generation and verification, and rejects invalid values', async () => {
  const toolchainPath = '/Users/me/.goenv/versions/1.26.2/bin:/Users/me/go/bin'
  const { calls } = await scaffold({ units: UNITS.slice(0, 1), toolchainPath }, scaffoldResponder())
  assert.match(calls.find(c => c.label === 'order (go)').prompt, /export PATH="\/Users\/me\/\.goenv/)
  assert.match(calls.find(c => c.label === 'order verify').prompt, /export PATH=/)
  await assert.rejects(scaffold({ units: UNITS.slice(0, 1), toolchainPath: '/x; rm -rf /' }, scaffoldResponder()), /invalid toolchainPath/)
  await assert.rejects(scaffold({ units: UNITS.slice(0, 1), toolchainPath: 'relative/bin' }, scaffoldResponder()), /invalid toolchainPath/)
})

test('scaffold: the fix instructions forbid passing by weakening checks', async () => {
  const { calls } = await scaffold({ units: UNITS, pluginRoot: '/p' }, scaffoldResponder({ failFirst: ['order'] }))
  assert.match(calls.find(c => c.label === 'order fix').prompt, /passes by weakening/)
})

// ---------------------------------------------------------------- Run

let failed = 0
for (const t of tests) {
  try {
    await t.fn()
    console.log(`ok   ${t.name}`)
  } catch (e) {
    failed++
    console.log(`FAIL ${t.name}\n     ${e.message}`)
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`)
process.exit(failed ? 1 : 0)
