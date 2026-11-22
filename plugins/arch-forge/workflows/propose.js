export const meta = {
  name: 'propose',
  description: 'ヒアリング結果からアーキテクチャ案を作る: 要件分析 → トポロジー判断 → 複数案の並列設計 → レッドチームレビュー → 比較提案書と decision ドラフト',
  whenToUse: 'arch-forge:design スキルがヒアリング完了後に起動する。docs/architecture/00-brief.md が存在すること。args: { pluginRoot, docsDir }',
  phases: [
    { title: 'Analyze', detail: '要件を品質特性シナリオ・規模クラスに構造化', model: 'sonnet' },
    { title: 'Topology', detail: 'モノリス / モジュラーモノリス / マイクロサービスの判断', model: 'opus' },
    { title: 'Design', detail: '方針の異なるアーキテクチャ案を並列に設計', model: 'opus' },
    { title: 'Review', detail: 'レッドチームレビューと critical 指摘の修正', model: 'sonnet' },
    { title: 'Propose', detail: '比較提案書と decision.draft.json の作成', model: 'sonnet' },
  ],
}

// ---- 入力 -------------------------------------------------------------------
const input = args ?? {}
const docs = input.docsDir ?? 'docs/architecture'
const pluginRoot = input.pluginRoot ?? ''
const ctx = `作業ディレクトリ（プロジェクトルート）で作業する。ドキュメントは ${docs}/ 配下。pluginRoot=${pluginRoot}。出力はユーザーの言語（brief の言語）で書く。`

// ---- スキーマ -------------------------------------------------------------------
const ANALYSIS = {
  type: 'object',
  required: ['scaleClass', 'score', 'contexts', 'topQualities', 'openQuestions'],
  properties: {
    scaleClass: { enum: ['S', 'M', 'L', 'XL'] },
    score: { type: 'integer' },
    contexts: { type: 'array', items: { type: 'string' } },
    topQualities: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
}

const TOPOLOGY = {
  type: 'object',
  required: ['recommended', 'units', 'rationale', 'risks'],
  properties: {
    recommended: { enum: ['monolith', 'modular-monolith', 'microservices'] },
    units: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'kind', 'responsibility'],
        properties: { name: { type: 'string' }, kind: { type: 'string' }, responsibility: { type: 'string' } },
      },
    },
    rationale: { type: 'string' },
    risks: { type: 'array', items: { type: 'string' } },
  },
}

const OPTION = {
  type: 'object',
  required: ['id', 'name', 'topology', 'summary', 'units', 'weaknesses'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    topology: { enum: ['monolith', 'modular-monolith', 'microservices'] },
    summary: { type: 'string' },
    units: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'language', 'pattern'],
        properties: {
          name: { type: 'string' },
          language: { enum: ['go', 'php', 'rust'] },
          pattern: { type: 'string' },
          framework: { type: 'string' },
        },
      },
    },
    weaknesses: { type: 'array', items: { type: 'string' } },
  },
}

const REVIEW = {
  type: 'object',
  required: ['options'],
  properties: {
    options: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'critical', 'major', 'verdict', 'topIssues'],
        properties: {
          id: { type: 'string' },
          critical: { type: 'integer' },
          major: { type: 'integer' },
          verdict: { enum: ['adopt', 'adopt-with-fixes', 'reject'] },
          topIssues: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

const PROPOSAL = {
  type: 'object',
  required: ['recommendedOption', 'reasons', 'decisionsNeeded'],
  properties: {
    recommendedOption: { type: 'string' },
    reasons: { type: 'array', items: { type: 'string' } },
    decisionsNeeded: { type: 'array', items: { type: 'string' } },
  },
}

// ---- 1. 要件分析 ---------------------------------------------------------------
phase('Analyze')
const analysis = await agent(
  `${ctx}\n${docs}/00-brief.md を読み、要件分析を行って ${docs}/01-requirements.md を書く。`,
  { agentType: 'arch-forge:requirements-analyst', model: 'sonnet', effort: 'medium', schema: ANALYSIS, label: 'requirements' },
)
if (!analysis) throw new Error('要件分析が完了しなかった（スキップまたはエラー）')
log(`規模クラス: ${analysis.scaleClass}（${analysis.score} 点） / コンテキスト候補: ${analysis.contexts.length} 個`)

// ---- 2. トポロジー判断 ---------------------------------------------------------
phase('Topology')
const topology = await agent(
  `${ctx}\n00-brief.md と 01-requirements.md を読み、デプロイトポロジーを判断して ${docs}/02-topology.md を書く。`,
  { agentType: 'arch-forge:topology-strategist', model: 'opus', effort: 'high', schema: TOPOLOGY, label: 'topology' },
)
if (!topology) throw new Error('トポロジー判断が完了しなかった（スキップまたはエラー）')
log(`推奨トポロジー: ${topology.recommended}（ユニット ${topology.units.length} 個）`)

// ---- 3. 複数案の並列設計 -------------------------------------------------------
phase('Design')
const strategies = [
  { id: 'option-a', stance: 'pragmatic: 要件を満たす最もシンプルな構成。トポロジー推奨より 1 段シンプルでも要件を満たせるならそれを選ぶ。複雑さを足す箇所はすべて要件で正当化する' },
  { id: 'option-b', stance: `evolutionary: 推奨トポロジー（${topology.recommended}）に沿い、見直しトリガーと進化パスまで設計した構成` },
]
if (analysis.scaleClass === 'L' || analysis.scaleClass === 'XL' || topology.recommended !== 'monolith') {
  strategies.push({
    id: 'option-c',
    stance: 'scale-first: 独立デプロイ・独立スケール・障害分離を最優先した構成（トポロジー推奨より 1 段分散寄り）。運用コストとチーム要件を正直に書く',
  })
}

const options = (
  await parallel(
    strategies.map(s => () =>
      agent(
        `${ctx}\n案 ID: ${s.id}\n設計方針: ${s.stance}\n00〜02 のドキュメントを読み、案を設計して ${docs}/03-options/${s.id}.md に書く。`,
        { agentType: 'arch-forge:solution-architect', model: 'opus', effort: 'high', schema: OPTION, label: s.id, phase: 'Design' },
      ),
    ),
  )
).filter(Boolean)

if (options.length === 0) {
  throw new Error('アーキテクチャ案を 1 つも作成できなかった')
}

// ---- 4. レビューと critical 修正 -----------------------------------------------
phase('Review')
const review = await agent(
  `${ctx}\nproposal モードでレビューする。対象: ${options.map(o => `${docs}/03-options/${o.id}.md`).join(', ')}。結果を ${docs}/04-review.md に書く。`,
  { agentType: 'arch-forge:architecture-critic', model: 'sonnet', effort: 'high', schema: REVIEW, label: 'red-team review' },
)
if (!review) throw new Error('レビューが完了しなかった（スキップまたはエラー）')

const needsFix = review.options.filter(r => r.critical > 0 && r.verdict !== 'reject')
if (needsFix.length > 0) {
  await parallel(
    needsFix.map(r => () => {
      const strategy = strategies.find(s => s.id === r.id)
      return agent(
        `${ctx}\n案 ID: ${r.id}\n設計方針: ${strategy ? strategy.stance : '元の方針を維持'}\n` +
          `${docs}/04-review.md の ${r.id} に対する critical / major 指摘を解消するよう ${docs}/03-options/${r.id}.md を改訂する。` +
          `改訂箇所には「レビュー対応」と注記する。主な指摘: ${r.topIssues.join(' / ')}`,
        { agentType: 'arch-forge:solution-architect', model: 'opus', effort: 'high', schema: OPTION, label: `${r.id} (revise)`, phase: 'Review' },
      )
    }),
  )
}

// ---- 5. 比較提案書 -------------------------------------------------------------
phase('Propose')
const proposal = await agent(
  `${ctx}\n01〜04 と 03-options/*.md を統合して ${docs}/05-proposal.md と ${docs}/decision.draft.json（${pluginRoot}/templates/decision.schema.json に準拠）を書く。`,
  { agentType: 'arch-forge:proposal-writer', model: 'sonnet', effort: 'medium', schema: PROPOSAL, label: 'proposal' },
)
if (!proposal) throw new Error('提案書の作成が完了しなかった（スキップまたはエラー）')

return {
  docsDir: docs,
  scaleClass: analysis.scaleClass,
  topology: topology.recommended,
  options: options.map(o => ({ id: o.id, name: o.name, topology: o.topology, summary: o.summary })),
  review: review.options.map(r => ({ id: r.id, verdict: r.verdict, critical: r.critical, major: r.major })),
  revised: needsFix.map(r => r.id),
  recommendedOption: proposal.recommendedOption,
  reasons: proposal.reasons,
  openQuestions: analysis.openQuestions,
  decisionsNeeded: proposal.decisionsNeeded,
}
