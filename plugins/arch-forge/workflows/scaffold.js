export const meta = {
  name: 'scaffold',
  description: '確定した docs/architecture/decision.json から、リポジトリの土台・ユニットごとのディレクトリとサンプル実装を並列生成し、ビルド/テスト検証と依存方向の適合チェックまで行う',
  whenToUse: 'arch-forge:design または arch-forge:scaffold スキルが、アーキテクチャ確定後に起動する。args: { pluginRoot, docsDir, toolchainPath?, units: [{ name, language, path, entrypoint? }] }。同じ path のユニットは 1 つのビルド単位として順番に生成する',
  phases: [
    { title: 'Foundation', detail: 'ルート構成・API 契約・CI・AGENTS.md / CLAUDE.md・共通 rules', model: 'sonnet' },
    { title: 'Scaffold', detail: 'ビルド単位ごとに言語別 scaffolder で生成 → 検証 → 修正（同じ path を共有するユニットは順番に）', model: 'sonnet' },
    { title: 'Sync', detail: 'AGENTS.md / architecture.md / ユニット別 rules を生成コードの実態に合わせる', model: 'sonnet' },
    { title: 'Conformance', detail: 'ADR と依存ルールへの適合チェック', model: 'sonnet' },
  ],
}

// ---- 入力 -------------------------------------------------------------------
// args は呼び出し側によって JSON 文字列のまま届くことがあるので、両方を受け付ける
const ARGS = typeof args === 'string' ? (() => { try { return JSON.parse(args) } catch (e) { return {} } })() : (args ?? {})
const docs = ARGS.docsDir ?? 'docs/architecture'
const pluginRoot = ARGS.pluginRoot ?? ''
const units = Array.isArray(ARGS.units) ? ARGS.units : []
if (units.length === 0) {
  throw new Error('args.units が空。decision.json の units から { name, language, path, entrypoint } の配列を渡すこと')
}

// 名前とパスはエージェントのプロンプト内でファイルパスとして使われる。ディレクトリの外に出る値を拒否する
const SAFE_NAME = /^[a-z][a-z0-9-]*$/
const SAFE_PATH = /^(\.|[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*)$/
const isSafePath = p => typeof p === 'string' && SAFE_PATH.test(p) && !p.split('/').includes('..')
const normPath = p => (p === './' ? '.' : p.replace(/^\.\//, '').replace(/\/$/, '') || '.')
if (!isSafePath(docs)) throw new Error(`docsDir が不正: ${JSON.stringify(docs)}`)

// 検出スクリプト（scripts/detect-toolchains.sh --env）が見つけたツールチェーンのディレクトリ。
// PATH の go などがシム（goenv / asdf）で失敗する環境でも、サブエージェントが同じ実体を使うようにする
const toolchainPath = typeof ARGS.toolchainPath === 'string' ? ARGS.toolchainPath : ''
const SAFE_BINPATH = /^\/[A-Za-z0-9._@+\/-]+(:\/[A-Za-z0-9._@+\/-]+)*$/
if (toolchainPath && (!SAFE_BINPATH.test(toolchainPath) || toolchainPath.split(/[/:]/).includes('..'))) {
  throw new Error(`toolchainPath が不正: ${JSON.stringify(toolchainPath)}（絶対パスをコロンでつないだもの）`)
}

const SCAFFOLDER = {
  go: 'arch-forge:go-scaffolder',
  php: 'arch-forge:php-scaffolder',
  rust: 'arch-forge:rust-scaffolder',
}
for (const u of units) {
  if (!u || !SAFE_NAME.test(u.name || '')) throw new Error(`ユニット名が不正: ${JSON.stringify(u && u.name)}（${SAFE_NAME} に一致させる）`)
  if (typeof u.path !== 'string' || !isSafePath(normPath(u.path))) throw new Error(`ユニット ${u.name} の path が不正: ${JSON.stringify(u.path)}（リポジトリ内の相対パス）`)
  if (!SCAFFOLDER[u.language]) throw new Error(`未対応の言語: ${u.name} (${u.language})`)
  if (u.entrypoint !== undefined && u.entrypoint !== '' && !isSafePath(u.entrypoint)) {
    throw new Error(`ユニット ${u.name} の entrypoint が不正: ${JSON.stringify(u.entrypoint)}`)
  }
}
const languages = [...new Set(units.map(u => u.language))]

// 同じ path を持つユニットは 1 つのビルド単位（go.mod / composer.json / Cargo workspace）を共有する。
// 並列に生成すると共通ファイルの書き込みが衝突するので、グループ内は順番に作り、検証はグループで 1 回にする
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
  if (langs.size > 1) throw new Error(`path ${g.path} を共有するユニットの言語が異なる: ${g.units.map(u => `${u.name}(${u.language})`).join(', ')}`)
  const eps = g.units.map(u => u.entrypoint || '')
  if (eps.some(e => !e) || new Set(eps).size !== eps.length) {
    throw new Error(`path ${g.path} を共有するユニットには、互いに異なる entrypoint が必要: ${g.units.map(u => `${u.name}=${u.entrypoint || '(なし)'}`).join(', ')}`)
  }
}
const groupLabel = g => g.units.map(u => u.name).join('+')

const toolchainNote = toolchainPath
  ? `この環境では PATH の go などが動かない。Bash でビルド・検証コマンドを実行するときは、先に export PATH="${toolchainPath}:$PATH" を行う（Claude Code では毎回承認が必要になる。プロジェクトに .go-version などが置かれて PATH の go が動くようになっていれば不要）。`
  : ''
const ctx =
  `作業ディレクトリ（プロジェクトルート）で作業する。確定アーキテクチャは ${docs}/decision.json と ${docs}/adr/ にある。pluginRoot=${pluginRoot}。` +
  'ドキュメント・コメント・最終応答はユーザーの言語（decision.json / ADR の言語）で書く。' +
  '承認済み ADR と decision.json は編集しない。完了を報告する前に検証コマンドを実行し、結果を証拠として返す。' +
  toolchainNote

const SCAFFOLD_RESULT = {
  type: 'object',
  required: ['unit', 'filesCreated', 'checks', 'unresolved'],
  properties: {
    unit: { type: 'string' },
    filesCreated: { type: 'integer' },
    checks: { type: 'array', items: { type: 'string' }, description: '実行した検証コマンドと結果（例: "go test ./...: passed"）' },
    unresolved: { type: 'array', items: { type: 'string' }, description: '直せなかった失敗、未検証の項目、判断が必要な点' },
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
const sharedNote = groups
  .filter(g => g.units.length > 1)
  .map(g => `path ${g.path} はユニット ${groupLabel(g)} が共有する 1 つのビルド単位（マニフェストは 1 つ。go.work / workspace の members にも 1 回だけ書く。CI の job もビルド単位ごと）`)
  .join('。')
await agent(`${ctx}\ndecision.json に従いリポジトリの土台を生成する。ユニット一覧: ${JSON.stringify(units)}\n${sharedNote ? sharedNote + '。\n' : ''}.claude/rules/arch-forge/ には common と次の言語のルールをコピーする: ${languages.join(', ')}`, {
  agentType: 'arch-forge:foundation-builder',
  model: 'sonnet',
  effort: 'medium',
  label: 'foundation',
})

// ---- 2. ビルド単位ごとに 生成 → 検証 → 修正（ビルド単位間はバリアなしで並行） -------------
const rootGuard = path =>
  path === '.'
    ? 'このユニットの path はリポジトリルート。foundation-builder が作成済みの README.md / AGENTS.md / CLAUDE.md / Makefile / .github / deploy / api は上書きせず、必要なら追記だけ行う。'
    : `このユニットの path は ${path}。それ以外のパスは変更しない。`

// グループ内での役割。1 番目が共通部分を作り、2 番目以降は自分の起動点だけを足す
const roleNote = (g, i) => {
  if (g.units.length < 2) return ''
  const others = g.units.filter((_, j) => j !== i).map(u => `${u.name}（${u.entrypoint}）`).join(', ')
  const me = g.units[i]
  return i === 0
    ? `このユニットは path ${g.path} のビルド単位を ${others} と共有する。あなたが最初の担当なので、共通部分（go.mod などのマニフェスト、platform・config などの共通パッケージ、ビルド単位の Makefile・lint 設定・Dockerfile）と、自分の起動点 ${me.entrypoint} を作る。他のユニットの起動点は作らない。共通部分はすべてのユニットが使う前提で作る。`
    : `このユニットは path ${g.path} のビルド単位を ${others} と共有する。共通部分は先の担当が作成済みなので作り直さない。自分の起動点 ${me.entrypoint} と、このユニットだけが使うパッケージを追加する。共通部分の変更が必要なら最小の追記にとどめ、最終応答の unresolved に理由を書く。`
}

const NO_WEAKEN =
  '検証・検査（テスト、lint 設定、arch-lint 設定、バージョン下限の検査スクリプト）を緩めて通す修正（対象を減らす、条件を弱める、skip を足す）はしない。' +
  '緩める以外に直せない場合は修正せず、unresolved に「検査を緩める必要がある: 理由」と書いてユーザーの判断に回す。'

const verify = (g, label) =>
  agent(
    `ビルド単位 ${g.path}（言語: ${g.units[0].language}、ユニット: ${g.units.map(u => u.name + (u.entrypoint ? `=${u.entrypoint}` : '')).join(', ')}）を検証する。pluginRoot=${pluginRoot}。${toolchainNote}`,
    { agentType: 'arch-forge:scaffold-verifier', model: 'haiku', effort: 'low', schema: VERIFY_RESULT, label, phase: 'Scaffold' },
  )

const groupResults = await pipeline(
  groups,
  // stage 1: 生成（グループ内は順番に）
  async g => {
    const scaffolded = []
    for (let i = 0; i < g.units.length; i++) {
      const u = g.units[i]
      const r = await agent(`${ctx}\n担当ユニット: ${u.name}\n${rootGuard(g.path)}\n${roleNote(g, i)}`, {
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
  // stage 2: 検証（グループで 1 回）
  (scaffolded, g) => verify(g, `${groupLabel(g)} verify`).then(v => ({ scaffolded, verified: v })),
  // stage 3: 失敗時のみ 1 回修正して再検証
  async (prev, g) => {
    if (prev.verified && prev.verified.allPassed) return { ...prev, fixed: false }
    const failures = (prev.verified ? prev.verified.results : [])
      .filter(r => r.status === 'failed')
      .map(r => `- ${r.command}: ${r.detail ?? ''}`)
      .join('\n')
    const u = g.units[0]
    const scope = g.units.length > 1 ? `ビルド単位 ${g.path} を共有するユニット ${groupLabel(g)} をまとめて直す。` : ''
    await agent(`${ctx}\n担当ユニット: ${u.name}\n${rootGuard(g.path)}\n${scope}\n検証で次の失敗が出た。原因を調べて修正し、再度ビルドとテストを通すこと:\n${failures}\n${NO_WEAKEN}`, {
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

// ---- 3. ドキュメント同期 -----------------------------------------------------------
phase('Sync')
await agent(`${ctx}\nsync モードで実行する。生成されたユニット ${units.map(u => u.name).join(', ')} の実際の構成に合わせて AGENTS.md / architecture.md / README.md を更新し、.claude/rules/arch-forge/units/<unit>.md を生成する。`, {
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

const summary = units.map(u => {
  const gi = groups.findIndex(g => g.units.includes(u))
  const g = groups[gi]
  const r = groupResults[gi]
  const shared = g.units.length > 1 ? { buildUnit: g.path, sharedWith: g.units.filter(x => x !== u).map(x => x.name) } : {}
  if (!r) return { unit: u.name, status: 'error', note: 'エージェントが失敗した（ログを確認）', ...shared }
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
    unresolved: mine ? mine.unresolved : ['生成エージェントの結果が無い'],
  }
})

return {
  docsDir: docs,
  units: summary,
  conformance: conformance
    ? { violations: conformance.violations.length, summary: conformance.summary }
    : { violations: null, summary: '適合チェックはスキップまたは失敗した' },
}
