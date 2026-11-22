export const meta = {
  name: 'scaffold',
  description: '確定した docs/architecture/decision.json から、リポジトリの土台・ユニットごとのディレクトリとサンプル実装を並列生成し、ビルド/テスト検証と依存方向の適合チェックまで行う',
  whenToUse: 'arch-forge:design または arch-forge:scaffold スキルが、アーキテクチャ確定後に起動する。args: { pluginRoot, docsDir, units: [{ name, language, path }] }',
  phases: [
    { title: 'Foundation', detail: 'ルート構成・API 契約・CI・CLAUDE.md', model: 'sonnet' },
    { title: 'Scaffold', detail: 'ユニットごとに言語別 scaffolder で生成 → 検証 → 修正', model: 'sonnet' },
    { title: 'Sync', detail: 'CLAUDE.md / architecture.md を生成コードの実態に合わせる', model: 'sonnet' },
    { title: 'Conformance', detail: 'ADR と依存ルールへの適合チェック', model: 'sonnet' },
  ],
}

// ---- 入力 -------------------------------------------------------------------
const input = args ?? {}
const docs = input.docsDir ?? 'docs/architecture'
const pluginRoot = input.pluginRoot ?? ''
const units = Array.isArray(input.units) ? input.units : []
if (units.length === 0) {
  throw new Error('args.units が空。decision.json の units から { name, language, path } の配列を渡すこと')
}

const SCAFFOLDER = {
  go: 'arch-forge:go-scaffolder',
  php: 'arch-forge:php-scaffolder',
  rust: 'arch-forge:rust-scaffolder',
}
for (const u of units) {
  if (!SCAFFOLDER[u.language]) throw new Error(`未対応の言語: ${u.name} (${u.language})`)
}

const ctx =
  `作業ディレクトリ（プロジェクトルート）で作業する。確定アーキテクチャは ${docs}/decision.json と ${docs}/adr/ にある。pluginRoot=${pluginRoot}。` +
  'ドキュメントやコメントはユーザーの言語（decision.json / ADR の言語）で書く。'

const SCAFFOLD_RESULT = {
  type: 'object',
  required: ['unit', 'filesCreated', 'checks', 'unresolved'],
  properties: {
    unit: { type: 'string' },
    filesCreated: { type: 'integer' },
    checks: { type: 'array', items: { type: 'string' } },
    unresolved: { type: 'array', items: { type: 'string' } },
  },
}

const VERIFY_RESULT = {
  type: 'object',
  required: ['unit', 'allPassed', 'results'],
  properties: {
    unit: { type: 'string' },
    allPassed: { type: 'boolean', description: 'failed が 1 つも無ければ true（skipped は許容）' },
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

// ---- 1. 土台 ---------------------------------------------------------------------
phase('Foundation')
await agent(`${ctx}\ndecision.json に従いリポジトリの土台を生成する。ユニット一覧: ${JSON.stringify(units)}`, {
  agentType: 'arch-forge:foundation-builder',
  model: 'sonnet',
  effort: 'medium',
  label: 'foundation',
})

// ---- 2. ユニットごとに 生成 → 検証 → 修正（ユニット間はバリアなしで並行） -------------
const rootGuard = u =>
  u.path === '.' || u.path === './'
    ? 'このユニットの path はリポジトリルート。foundation-builder が作成済みの README.md / CLAUDE.md / Makefile / .github / deploy / api は上書きせず、必要なら追記だけ行う。'
    : `このユニットの path は ${u.path}。それ以外のパスは変更しない。`

const verify = (u, label) =>
  agent(`ユニット ${u.name}（言語: ${u.language}、パス: ${u.path}）を検証する。`, {
    agentType: 'arch-forge:scaffold-verifier',
    model: 'haiku',
    effort: 'low',
    schema: VERIFY_RESULT,
    label,
    phase: 'Scaffold',
  })

const unitResults = await pipeline(
  units,
  // stage 1: 生成
  u =>
    agent(`${ctx}\n担当ユニット: ${u.name}\n${rootGuard(u)}`, {
      agentType: SCAFFOLDER[u.language],
      model: 'sonnet',
      effort: 'medium',
      schema: SCAFFOLD_RESULT,
      label: `${u.name} (${u.language})`,
      phase: 'Scaffold',
    }),
  // stage 2: 検証
  (scaffolded, u) => verify(u, `${u.name} verify`).then(v => ({ scaffolded, verified: v })),
  // stage 3: 失敗時のみ 1 回修正して再検証
  async (prev, u) => {
    if (prev.verified && prev.verified.allPassed) return { unit: u.name, ...prev, fixed: false }
    const failures = (prev.verified ? prev.verified.results : [])
      .filter(r => r.status === 'failed')
      .map(r => `- ${r.command}: ${r.detail ?? ''}`)
      .join('\n')
    await agent(`${ctx}\n担当ユニット: ${u.name}\n${rootGuard(u)}\n検証で次の失敗が出た。原因を調べて修正し、再度ビルドとテストを通すこと:\n${failures}`, {
      agentType: SCAFFOLDER[u.language],
      model: 'sonnet',
      effort: 'high',
      label: `${u.name} fix`,
      phase: 'Scaffold',
    })
    const reverified = await verify(u, `${u.name} re-verify`)
    return { unit: u.name, scaffolded: prev.scaffolded, verified: reverified, fixed: true }
  },
)

// ---- 3. ドキュメント同期 -----------------------------------------------------------
phase('Sync')
await agent(`${ctx}\nsync モードで実行する。生成されたユニット ${units.map(u => u.name).join(', ')} の実際の構成に合わせて CLAUDE.md / architecture.md / README.md を更新する。`, {
  agentType: 'arch-forge:foundation-builder',
  model: 'sonnet',
  effort: 'medium',
  label: 'docs sync',
})

// ---- 4. 適合チェック -------------------------------------------------------------
phase('Conformance')
const conformance = await agent(
  `${ctx}\nconformance モードで、生成されたコードが decision.json と ADR の依存ルールに適合しているか検査し ${docs}/07-conformance.md に書く。`,
  { agentType: 'arch-forge:architecture-critic', model: 'sonnet', effort: 'high', schema: CONFORMANCE_RESULT, label: 'conformance' },
)

const summary = units.map((u, i) => {
  const r = unitResults[i]
  if (!r) return { unit: u.name, status: 'error', note: 'エージェントが失敗した（ログを確認）' }
  const failed = (r.verified ? r.verified.results : []).filter(x => x.status === 'failed').map(x => x.command)
  const skipped = (r.verified ? r.verified.results : []).filter(x => x.status === 'skipped').map(x => x.command)
  return {
    unit: u.name,
    language: u.language,
    path: u.path,
    status: r.verified && r.verified.allPassed ? 'passed' : 'failed',
    fixedOnce: r.fixed,
    failed,
    skipped,
    unresolved: r.scaffolded ? r.scaffolded.unresolved : [],
  }
})

return {
  docsDir: docs,
  units: summary,
  conformance: conformance
    ? { violations: conformance.violations.length, summary: conformance.summary }
    : { violations: null, summary: '適合チェックはスキップまたは失敗した' },
}
