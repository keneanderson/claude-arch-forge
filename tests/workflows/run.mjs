// arch-forge workflows のテスト（Node 標準ライブラリのみ）
//
// node tests/workflows/run.mjs
//
// Workflow ランタイムの agent / parallel / pipeline / phase / log をモックし、
// スクリプトの制御フロー（分岐・改訂・修正ループ・入力検証）を検査する。
// モックの pipeline は「stage1 は (item, index)、以降は (prev, item, index)」で呼ぶ。

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
        return { scaleClass, score: 12, contexts: ['ordering'], topQualities: ['変更容易性'], openQuestions: ['SLA は?'], blockingQuestions: blocking }
      case 'arch-forge:stack-researcher':
        if (factsFail) return null  // ランタイムは失敗・スキップ時に null を返す
        return { libraries: [{ name: 'github.com/go-chi/chi/v5', latest: 'v5.2.3', status: 'active', source: 'https://proxy.golang.org/' }], unverified: [] }
      case 'arch-forge:topology-strategist':
        return { recommended: topology, units: [{ name: 'app', kind: 'app', responsibility: '全体' }], rationale: 'r', risks: [] }
      case 'arch-forge:solution-architect': {
        const id = /案 ID: (\S+)/.exec(prompt)[1]
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
        const refs = /比較用（comparison-only）の案: ([^。]+)。/.exec(prompt)
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

test('propose: モノリス推奨・規模 S では案は 2 つ', async () => {
  const { result, calls } = await propose({ pluginRoot: '/p', docsDir: 'docs/architecture' }, proposeResponder({ scaleClass: 'S', topology: 'monolith' }))
  assert.deepEqual(result.options.map(o => o.id), ['option-a', 'option-b'])
  assert.equal(calls.filter(c => c.agentType === 'arch-forge:solution-architect').length, 2)
})

test('propose: 規模 L では option-c を追加する', async () => {
  const { result } = await propose({ pluginRoot: '/p' }, proposeResponder({ scaleClass: 'L', topology: 'monolith' }))
  assert.deepEqual(result.options.map(o => o.id), ['option-a', 'option-b', 'option-c'])
})

test('propose: critical 指摘のある案だけ改訂する', async () => {
  const { result, calls } = await propose({ pluginRoot: '/p' }, proposeResponder({ critical: { 'option-b': 2 } }))
  assert.deepEqual(result.revised, ['option-b'])
  assert.ok(calls.some(c => c.label === 'option-b (revise)'))
  assert.ok(!calls.some(c => c.label === 'option-a (revise)'))
})

test('propose: args が JSON 文字列でも動く', async () => {
  const { result } = await propose(JSON.stringify({ pluginRoot: '/p', docsDir: 'docs/arch' }), proposeResponder())
  assert.equal(result.docsDir, 'docs/arch')
})

test('propose: docsDir のパストラバーサルを拒否する', async () => {
  await assert.rejects(propose({ docsDir: '../etc' }, proposeResponder()), /docsDir が不正/)
})

test('propose: 案ごとのフレームワーク・主要ライブラリを結果に含める', async () => {
  const { result, calls } = await propose({ pluginRoot: '/p' }, proposeResponder())
  assert.deepEqual(result.options[0].stacks, [{ unit: 'app', language: 'go', framework: 'chi', libraries: { db: 'sqlc+pgx' } }])
  const architect = calls.find(c => c.agentType === 'arch-forge:solution-architect')
  assert.ok(architect.schema.properties.units.items.required.includes('framework'))
  assert.match(architect.prompt, /frameworks\.md/)
})

test('propose: 影響の大きい未知の項目があれば、設計に進まず needs-input を返す', async () => {
  const blocking = [{ question: 'チャットの同時接続数は?', why: '常駐接続の方式が変わる', choices: ['〜100', '〜1万'] }]
  const { result, calls } = await propose({ pluginRoot: '/p' }, proposeResponder({ blocking }))
  assert.equal(result.status, 'needs-input')
  assert.deepEqual(result.blockingQuestions, blocking)
  assert.ok(!calls.some(c => c.agentType === 'arch-forge:topology-strategist'))
})

test('propose: clarified で再実行したら、未知の項目が残っていても最後まで進む', async () => {
  const blocking = [{ question: 'q', why: 'w', choices: ['a', 'b'] }]
  const { result } = await propose({ pluginRoot: '/p', clarified: true }, proposeResponder({ blocking }))
  assert.equal(result.status, 'ok')
  assert.equal(result.recommendedOption, 'option-a')
})

test('propose: 案の設計の前にライブラリの事実確認を 1 回だけ行い、各案に引用させる', async () => {
  const { result, calls } = await propose({ pluginRoot: '/p' }, proposeResponder())
  const facts = calls.filter(c => c.agentType === 'arch-forge:stack-researcher')
  assert.equal(facts.length, 1)
  const factsIdx = calls.indexOf(facts[0])
  const architects = calls.filter(c => c.agentType === 'arch-forge:solution-architect')
  for (const a of architects) {
    assert.ok(calls.indexOf(a) > factsIdx)
    assert.match(a.prompt, /02b-stack-facts\.md から引用/)
  }
  assert.equal(result.stackFacts.checked, 1)
})

test('propose: 事実確認が失敗しても、出典ルールを渡して設計を続ける', async () => {
  const { result, calls } = await propose({ pluginRoot: '/p' }, proposeResponder({ factsFail: true }))
  assert.equal(result.status, 'ok')
  assert.equal(result.stackFacts, null)
  assert.match(calls.find(c => c.agentType === 'arch-forge:solution-architect').prompt, /集計サイトは使わない/)
})

test('propose: 規模 M のモジュラーモノリスでは option-c を比較用にし、critical でも改訂しない', async () => {
  const { result, calls } = await propose({ pluginRoot: '/p' }, proposeResponder({ critical: { 'option-c': 3 } }))
  const c = result.options.find(o => o.id === 'option-c')
  assert.equal(c.comparisonOnly, true)
  assert.deepEqual(result.revised, [])
  assert.match(calls.find(x => x.label === 'option-c').prompt, /比較用（comparison-only）/)
  assert.match(calls.find(x => x.label === 'red-team review').prompt, /option-c/)
  assert.match(calls.find(x => x.label === 'proposal').prompt, /参考案/)
})

test('propose: 規模 L では option-c は採用候補（比較用にしない）', async () => {
  const { result } = await propose({ pluginRoot: '/p' }, proposeResponder({ scaleClass: 'L', topology: 'microservices' }))
  assert.equal(result.options.find(o => o.id === 'option-c').comparisonOnly, false)
})

test('propose: 各段に文書の長さの上限を渡す', async () => {
  const { calls } = await propose({ pluginRoot: '/p' }, proposeResponder())
  assert.match(calls.find(c => c.label === 'option-a').prompt, /350 行以内/)
  assert.match(calls.find(c => c.label === 'red-team review').prompt, /250 行以内/)
  assert.match(calls.find(c => c.label === 'proposal').prompt, /250 行以内/)
})

test('propose: 全サブエージェントが schema 付きで呼ばれる', async () => {
  const { calls } = await propose({ pluginRoot: '/p' }, proposeResponder())
  for (const c of calls) assert.ok(c.schema, `${c.label} に schema が無い`)
})

// ---------------------------------------------------------------- scaffold.js

const scaffold = load('scaffold.js')

function scaffoldResponder({ failFirst = [] } = {}) {
  const verified = {}
  return opts => {
    if (opts.agentType === 'arch-forge:foundation-builder') return 'ok'
    if (opts.agentType === 'arch-forge:architecture-critic') return { violations: [], summary: '違反なし' }
    if (opts.agentType === 'arch-forge:scaffold-verifier') {
      const unit = opts.label.split(' ')[0]  // 共有ビルド単位では "api+worker" 
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

test('scaffold: 言語ごとに scaffolder を選び、全ユニット passed', async () => {
  const { result, calls } = await scaffold({ pluginRoot: '/p', units: UNITS }, scaffoldResponder())
  assert.deepEqual(result.units.map(u => u.status), ['passed', 'passed', 'passed'])
  for (const t of ['go', 'php', 'rust']) assert.ok(calls.some(c => c.agentType === `arch-forge:${t}-scaffolder`))
  assert.deepEqual(result.units[0].skipped, ['arch-lint'])
})

test('scaffold: 検証失敗時は 1 回だけ修正して再検証する', async () => {
  const { result, calls } = await scaffold({ pluginRoot: '/p', units: UNITS }, scaffoldResponder({ failFirst: ['billing'] }))
  const billing = result.units.find(u => u.unit === 'billing')
  assert.equal(billing.status, 'passed')
  assert.equal(billing.fixedOnce, true)
  assert.equal(calls.filter(c => c.label === 'billing fix').length, 1)
  assert.equal(calls.filter(c => c.label === 'order fix').length, 0)
})

test('scaffold: Foundation に使う言語の rules を渡し、Sync でユニット別 rules を作らせる', async () => {
  const { calls } = await scaffold({ pluginRoot: '/p', units: UNITS }, scaffoldResponder())
  const foundation = calls.find(c => c.label === 'foundation')
  assert.match(foundation.prompt, /go, php, rust/)
  const sync = calls.find(c => c.label === 'docs sync')
  assert.match(sync.prompt, /units\/<unit>\.md/)
})

test('scaffold: パストラバーサル・不正なユニット名・未対応言語を拒否する', async () => {
  await assert.rejects(scaffold({ units: [{ name: 'x', language: 'go', path: '../x' }] }, scaffoldResponder()), /path が不正/)
  await assert.rejects(scaffold({ units: [{ name: 'x', language: 'go', path: '/abs' }] }, scaffoldResponder()), /path が不正/)
  await assert.rejects(scaffold({ units: [{ name: 'X Y', language: 'go', path: 'x' }] }, scaffoldResponder()), /ユニット名が不正/)
  await assert.rejects(scaffold({ units: [{ name: 'x', language: 'java', path: 'x' }] }, scaffoldResponder()), /未対応の言語/)
  await assert.rejects(scaffold({ units: [] }, scaffoldResponder()), /args.units が空/)
})

test('scaffold: ルートに置くユニット（path=.）を受け付ける', async () => {
  const { result, calls } = await scaffold(JSON.stringify({ units: [{ name: 'app', language: 'go', path: '.' }] }), scaffoldResponder())
  assert.equal(result.units[0].status, 'passed')
  assert.match(calls.find(c => c.label === 'app (go)').prompt, /上書きせず/)
})

const SHARED = [
  { name: 'api', language: 'go', path: '.', entrypoint: 'cmd/api' },
  { name: 'chat', language: 'go', path: '.', entrypoint: 'cmd/chat' },
  { name: 'worker', language: 'go', path: './', entrypoint: 'cmd/worker' },
]

test('scaffold: 同じ path を共有するユニットは順番に生成し、検証は 1 回にする', async () => {
  const order = []
  const base = scaffoldResponder()
  const { result, calls } = await scaffold({ pluginRoot: '/p', units: SHARED }, (opts, prompt, all) => {
    if (opts.agentType === 'arch-forge:go-scaffolder') order.push(opts.label)
    return base(opts, prompt, all)
  })
  assert.deepEqual(order, ['api (go)', 'chat (go)', 'worker (go)'])
  assert.equal(calls.filter(c => c.agentType === 'arch-forge:scaffold-verifier').length, 1)
  assert.match(calls.find(c => c.label === 'api (go)').prompt, /最初の担当なので、共通部分/)
  assert.match(calls.find(c => c.label === 'chat (go)').prompt, /作り直さない/)
  assert.deepEqual(result.units.map(u => u.status), ['passed', 'passed', 'passed'])
  assert.deepEqual(result.units[0].sharedWith, ['chat', 'worker'])
  assert.match(calls.find(c => c.label === 'foundation').prompt, /api\+chat\+worker が共有する 1 つのビルド単位/)
})

test('scaffold: 共有ビルド単位の検証が失敗したら、まとめて 1 回だけ直す', async () => {
  const { result, calls } = await scaffold({ pluginRoot: '/p', units: SHARED }, scaffoldResponder({ failFirst: ['api+chat+worker'] }))
  const fixes = calls.filter(c => c.label === 'api+chat+worker fix')
  assert.equal(fixes.length, 1)
  assert.match(fixes[0].prompt, /まとめて直す/)
  assert.ok(result.units.every(u => u.status === 'passed' && u.fixedOnce))
})

test('scaffold: 共有ビルド単位では entrypoint が必須で、言語を混ぜられない', async () => {
  await assert.rejects(
    scaffold({ units: [{ name: 'a', language: 'go', path: '.' }, { name: 'b', language: 'go', path: '.' }] }, scaffoldResponder()),
    /entrypoint が必要/,
  )
  await assert.rejects(
    scaffold({ units: [{ name: 'a', language: 'go', path: 'x', entrypoint: 'cmd/a' }, { name: 'b', language: 'go', path: 'x', entrypoint: 'cmd/a' }] }, scaffoldResponder()),
    /entrypoint が必要/,
  )
  await assert.rejects(
    scaffold({ units: [{ name: 'a', language: 'go', path: 'x', entrypoint: 'cmd/a' }, { name: 'b', language: 'php', path: 'x', entrypoint: 'bin/b' }] }, scaffoldResponder()),
    /言語が異なる/,
  )
  await assert.rejects(scaffold({ units: [{ name: 'a', language: 'go', path: '.', entrypoint: '../x' }] }, scaffoldResponder()), /entrypoint が不正/)
})

test('scaffold: 検出したツールチェーンの PATH を生成・検証の両方に渡し、不正な値は拒否する', async () => {
  const toolchainPath = '/Users/me/.goenv/versions/1.26.2/bin:/Users/me/go/bin'
  const { calls } = await scaffold({ units: UNITS.slice(0, 1), toolchainPath }, scaffoldResponder())
  assert.match(calls.find(c => c.label === 'order (go)').prompt, /export PATH="\/Users\/me\/\.goenv/)
  assert.match(calls.find(c => c.label === 'order verify').prompt, /export PATH=/)
  await assert.rejects(scaffold({ units: UNITS.slice(0, 1), toolchainPath: '/x; rm -rf /' }, scaffoldResponder()), /toolchainPath が不正/)
  await assert.rejects(scaffold({ units: UNITS.slice(0, 1), toolchainPath: 'relative/bin' }, scaffoldResponder()), /toolchainPath が不正/)
})

test('scaffold: 修正の指示で、検査を緩めて通すことを禁じる', async () => {
  const { calls } = await scaffold({ units: UNITS, pluginRoot: '/p' }, scaffoldResponder({ failFirst: ['order'] }))
  assert.match(calls.find(c => c.label === 'order fix').prompt, /緩めて通す修正/)
})

// ---------------------------------------------------------------- 実行

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
