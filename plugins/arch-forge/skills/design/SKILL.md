---
name: design
description: 新規アプリケーションのアーキテクチャを決めるワークフロー（Go / PHP / Rust）。要件ヒアリング → 要件分析 → モノリス / モジュラーモノリス / マイクロサービスの判断 → フレームワーク・主要ライブラリの選定を含む複数案の設計とレッドチームレビュー → ユーザーが確定 → ADR と decision.json を作成 → ディレクトリとサンプル実装を生成・検証する。「アーキテクチャを決めたい」「新規開発の構成を考えて」「マイクロサービスにすべきか」「フレームワークを選びたい」「プロジェクトの雛形を作りたい」と言われたときに使う。 Architecture design workflow for new Go / PHP / Rust applications. Interviews you, analyzes requirements, decides monolith vs. modular monolith vs. microservices, designs and red-team reviews several options including framework and library choices, and after you confirm writes an ADR and decision.json and scaffolds the project. Use when asked to decide an architecture, choose a framework, or set up a new project.
argument-hint: "[作りたいアプリケーションの説明]"
allowed-tools: Read, Write, Edit, Glob, Grep, AskUserQuestion, Workflow, Agent, Bash(mkdir *), Bash(date *), Bash(ls *), Bash(node *), Bash(python3 *), Bash(bash ${CLAUDE_PLUGIN_ROOT}/scripts/detect-toolchains.sh *)
---

# arch-forge: アーキテクチャ設計ワークフロー

ユーザーの依頼: $ARGUMENTS

## 現在の状態（自動取得）

- 既存の設計ドキュメント: !`ls -1 docs/architecture 2>/dev/null || echo "(なし)"`
- 利用可能なツールチェーン（PATH に加え goenv / asdf / mise / /usr/local/go / Homebrew も探した結果）:
!`bash ${CLAUDE_PLUGIN_ROOT}/scripts/detect-toolchains.sh report`
- 既存のソースコード: !`ls -1 go.mod composer.json Cargo.toml package.json 2>/dev/null || echo "(マニフェストなし = 新規プロジェクト)"`

## 定数

- `PLUGIN_ROOT` = `${CLAUDE_PLUGIN_ROOT}`
- `DOCS` = `docs/architecture`
- decision スキーマ: `${CLAUDE_PLUGIN_ROOT}/templates/decision.schema.json`
- ADR テンプレート: `${CLAUDE_PLUGIN_ROOT}/templates/adr.md`
- フレームワーク選定ガイド: `${CLAUDE_PLUGIN_ROOT}/skills/architecture-patterns/references/frameworks.md`

## 全体の流れ

```
Step 0 再開判定 → Step 1 ヒアリング → Step 2 brief 作成
→ Step 3 propose ワークフロー（バックグラウンド・複数サブエージェント。前提が足りなければ Step 3b 追加ヒアリング → 再実行）
→ Step 4 提案の提示とユーザー確定（調整したら Step 4b 改訂レビュー）→ Step 5 decision.json + ADR
→ Step 6 scaffold ワークフロー → Step 7 完了報告
```

ユーザーへの質問は必ず AskUserQuestion で行う（1 回 4 問まで、各 2〜4 択、推奨には「（推奨）」を付けて先頭に置く）。
すべての出力・ドキュメントはユーザーの言語で書く。

<HARD-GATE>
ユーザーが Step 4 で案を明示的に確定するまで、decision.json・ADR・コード・ディレクトリを作らない。
「規模が小さいから」「要件が明らかだから」でも、ヒアリング（Step 1）と案の比較（Step 3〜4）を飛ばさない。小さい案件は質問と案を短くするだけにする。
</HARD-GATE>

## 危険信号（こう考えたら止まる）

| 考え | 実際 |
|---|---|
| 「要件は明らかなのでヒアリングは不要」 | 規模・チーム・品質特性が無いとトポロジーを判断できない。分かっている項目を飛ばし、残りだけ聞く |
| 「マイクロサービスが流行っているので推奨しよう」 | 推奨は規模スコアと補正ルールで決める。1 チームなら第一推奨にしない |
| 「案は 1 つで十分」 | 比較が無いと、ユーザーは何を捨てたか分からない。最低 2 案を出す |
| 「ユーザーは急いでいるので確定を待たずに生成しよう」 | HARD-GATE。確定前に生成しない |
| 「サブエージェントが成功と言ったので完了」 | 生成物（ファイル・検証結果）を確認してから報告する |
| 「ワークフローを起動したのでターンを終えて待とう」 | 完了通知が来るまで結果を推測して報告しない。進捗だけ伝える |
| 「go version が失敗したので Go は無い」 | シム（goenv / asdf）が版未設定で失敗しているだけのことがある。上の検出結果の実体を使う。検出でも無いときは、生成の前にユーザーに確認する |
| 「ユーザーの調整は小さいのでレビューは不要」 | 調整後の案は未レビュー。Step 4b で差分だけ critic に見せる |

---

## Step 0. 再開判定

上の「既存の設計ドキュメント」を見て分岐する:

- `decision.json` がある → AskUserQuestion: 「生成（scaffold）に進む」/「フレームワーク・主要ライブラリを見直す」/「設計をやり直す」/「現状を表示して終了」
  - 「見直す」→ 下の「Step 0b. 技術スタックの見直し」
- `05-proposal.md` があり `decision.json` がない → Step 4 から再開
- `00-brief.md` だけある → Step 3 から再開するか、ヒアリングし直すか確認
- 何もない → Step 1

### Step 0b. 技術スタックの見直し（decision.json がある場合）

1. 何を変えたいか（どのユニットのどの役割か、理由）を普通の文章で尋ねる
2. Agent ツールで `arch-forge:stack-researcher` を呼び、変えたい役割の現行と候補だけを確認して `02b-stack-facts.md` を更新させる。完了通知を受け取ってから、`arch-forge:solution-architect` を呼ぶ。案 ID は `stack-review`、方針は「現行の decision.json の構成は変えず、指定された役割のフレームワーク・ライブラリだけを frameworks.md の評価軸で現行と候補 2〜3 個を比較する。移行コスト（変わる層・ファイルの範囲）を書く。版と保守状況は 02b-stack-facts.md から引用する」
3. `03-options/stack-review.md` を要約して提示し、AskUserQuestion で「推奨どおり変更する」/「現行のままにする」を確認する
4. 変更する場合だけ: 新しい ADR（`adr/` の次の番号）を書き、元の ADR のどの部分を置き換えるかを明記する（元の ADR は書き換えない）。decision.json の `framework` / `libraries` と `adr`（新 ADR のパス）を更新し、`/arch-forge:rules` で units ルールを再生成する。既存コードの移行は自動で行わないので、移行は別作業になることと `/arch-forge:check` での再検査を案内する

## Step 1. ヒアリング

$ARGUMENTS が空なら、まず「どんなアプリケーションを作りたいか（目的・利用者・主な機能）」を普通の文章で尋ねる。
その後、AskUserQuestion を 2〜3 ラウンド行う。**$ARGUMENTS や既存回答から明らかな項目は質問しない。**

**ラウンド 1（必須）**
1. アプリケーション種別: Web API / Web アプリ（画面あり）/ イベント駆動・バッチ / BFF・API ゲートウェイ（multiSelect 可）
2. 言語: Go / PHP / Rust / 未定（要件から推奨してほしい）— 利用可能なツールチェーンを参考に推奨を付ける
3. 想定規模: 社内・小規模（〜1万ユーザー、〜50 RPS）/ 中規模（〜50万ユーザー、〜500 RPS）/ 大規模（それ以上、ピーク数千 RPS）
4. 開発体制: 1〜3 人 / 1 チーム（4〜8 人）/ 2〜3 チーム / 4 チーム以上

**ラウンド 2（必須）**
1. ドメインの複雑さ: CRUD 中心 / 業務ルールが中程度 / 複雑（専門家との対話が必要、状態遷移が多い）
2. 最も重視する品質特性（1 つ）: 開発スピード / 性能・低レイテンシ / 可用性・障害分離 / 長期的な変更容易性（multiSelect にしない。全部を選べると優先順位が決まらない）
3. データ: RDB 1 つで十分 / 読み書き非対称・検索が重い / 監査証跡・履歴の再現が必要 / 未定
4. デプロイ先: コンテナ（Cloud Run / ECS / Kubernetes）/ VM・オンプレ / サーバーレス / 未定

**ラウンド 3**
1. （必須）フレームワーク・主要ライブラリ: 要件から推奨してほしい（推奨）/ チームが慣れたものを優先したい / 社内標準・指定がある
   - 「推奨してほしい」以外なら、使いたい・使えないフレームワークやライブラリ（ORM、キュー等）を普通の文章で尋ねる
2. （必須）2 番目に重視する品質特性: ラウンド 2 で選ばれなかった 3 つ（＋「特になし」）から 1 つ
3. （必要な場合のみ）外部連携、非同期処理の要否、独立リリースの必要性、納期、規制・コンプライアンス、既存インフラ。ラウンド 1〜2 の回答で判断が割れる点だけ聞く

## Step 2. brief の作成

`mkdir -p docs/architecture/03-options docs/architecture/adr` を実行し、`docs/architecture/00-brief.md` を書く:

```
# ヒアリング結果（brief）
## プロダクト概要（ユーザーの説明をそのまま + 要約）
## 回答一覧（質問 → 回答の表）
## 品質特性の優先順位（1 位・2 位。3 位以下は要件分析で推定）
## 既存環境（ツールチェーンの検出結果をそのまま。実体のパスと版、PATH の go が失敗する場合はその旨、補助ツールの版。既存コード）
## 明示された制約
## 技術スタックの希望・制約（使いたい / 使えないフレームワーク・ライブラリと理由。無ければ「推奨に任せる」）
## ユーザーが言及した懸念・希望
```

## Step 3. propose ワークフローの実行

Workflow ツールで起動する（バックグラウンドで実行され、完了時に結果が届く）:

```json
{
  "scriptPath": "${CLAUDE_PLUGIN_ROOT}/workflows/propose.js",
  "args": { "pluginRoot": "${CLAUDE_PLUGIN_ROOT}", "docsDir": "docs/architecture" }
}
```

- 起動したらユーザーに「要件分析 → トポロジー判断 → ライブラリの事実確認 → 2〜3 案の並列設計 → レビュー → 提案書」を実行中であることを 1〜2 行で伝え、完了通知を待つ（ポーリングしない）
- 内部では次のサブエージェントが動く: requirements-analyst（sonnet）→ topology-strategist（opus）→ stack-researcher（sonnet。`02b-stack-facts.md` を 1 回だけ作り、各案はそれを引用する）→ solution-architect ×2〜3 並列（opus）→ architecture-critic（sonnet）→ 必要なら solution-architect で修正 → proposal-writer（sonnet）
- 規模が L 未満で推奨がマイクロサービスでなければ、option-c は **比較用（comparison-only）** になる。比較用の案は critical の件数に数えず、改訂もしない
- 結果の `status` が `needs-input` なら Step 3b へ。`ok` なら Step 4 へ

**フォールバック**（Workflow ツールが無い・無効化されている・起動エラーの場合）: Agent ツールで同じ順序を手動実行する。

- **Agent は非同期で返ることがある**（起動した時点ではまだ結果が無く、完了は通知で届く）。次の段は前の段の完了通知を受け取ってから起動する。通知を待つ間は、どの段まで終わったかを 1 行で伝えてターンを終えてよい（ポーリングしない、結果を推測しない）
- 往復を減らすため、互いに依存しない段は **1 メッセージでまとめて** 起動する（案の設計 ×2〜3、案の改訂 ×N）。通知はまとめて待ち、全部そろってから次の段に進む
- 各プロンプトには、ワークフローと同じ指示（`pluginRoot`、ユーザーの言語、長さの上限、比較用かどうか、02b-stack-facts.md を引用すること）を書く

1. `subagent_type: "arch-forge:requirements-analyst"`。`blockingQuestions` があり、まだ追加ヒアリングをしていなければ Step 3b へ
2. `subagent_type: "arch-forge:topology-strategist"`（プロンプトに `pluginRoot=${CLAUDE_PLUGIN_ROOT}` を含める）
3. `subagent_type: "arch-forge:stack-researcher"`（`02b-stack-facts.md` を作る）
4. `subagent_type: "arch-forge:solution-architect"` を案ごとに **1 メッセージで並列に** 呼ぶ（案 ID と方針: option-a = pragmatic、option-b = evolutionary、規模 L 以上またはモノリス以外なら option-c = scale-first。規模 L 未満で推奨がマイクロサービスでなければ option-c は比較用）
5. `subagent_type: "arch-forge:architecture-critic"`（proposal モード）。critical 指摘がある案（比較用を除く）は solution-architect で改訂（1 メッセージで並列に）
6. `subagent_type: "arch-forge:proposal-writer"`（`pluginRoot` を渡す）

## Step 3b. 追加ヒアリング（前提が足りない場合だけ、1 回）

1. 結果の `blockingQuestions`（最大 4 個）を AskUserQuestion で聞く。選択肢は `choices` に「不明（推定で進める）」を加えたもの。`why`（答えで何が変わるか）を質問文に短く入れる
2. `00-brief.md` の末尾に「## 追加ヒアリング」節を足し、質問・回答・推定で進めた項目を書く
3. propose ワークフローを `"clarified": true` を足した args で再実行する（2 回目は止まらずに最後まで進む。残った未知の項目は openQuestions に残る）

## Step 4. 提案の提示と確定

1. `05-proposal.md` と `decision.draft.json` を Read する
2. ユーザーに次をまとめて提示する（長文の貼り付けではなく要約）:
   - 規模クラスと推奨トポロジー、その根拠
   - 案の比較表（案 / トポロジー / 内部パターン / 言語・FW / 主な利点 / 主なリスク）
   - 推奨案のフレームワーク・主要ライブラリ（ユニット × 役割ごとに採用と次点。ワークフロー結果の `options[].stacks` と 05-proposal.md の選定表）
   - 推奨案と理由 3 点
   - ワークフロー結果の `openQuestions`（未解決の質問）
   - 詳細は `docs/architecture/05-proposal.md` と `03-options/` にあると案内
3. AskUserQuestion で確定する（2 回に分ける）:
   - 1 回目
     - Q1. 採用する案: 推奨案（推奨）/ 他の案 / 調整したい
     - Q2. フレームワーク・主要ライブラリ: 提案どおり（推奨）/ 次点に変えたい箇所がある / 別のものを指定したい
   - 2 回目（1 回目の調整を反映した後）
     - Q3. サンプル機能（全層を貫通する 1 機能）: draft の提案 / 別の機能を指定
     - Q4. 生成オプション（multiSelect）: Docker・docker-compose / GitHub Actions CI / 依存方向 lint（推奨）/ Claude Code の設定（`.claude/settings.json` に make・ビルド・テストの権限 allowlist と `.env` の読み取り禁止）
     - コード生成（sqlc / oapi-codegen など）は、ライブラリに生成ツールがあれば既定で実行する（`scaffold.codegen: true`）。ユーザーが不要と言った場合だけ false にする
     - 必要に応じ Q5. Go module path または PHP 名前空間（draft の値を推奨として提示。1 回 4 問を超える場合は Q3 と入れ替えず、もう 1 回に分ける）
4. フレームワークを変える場合は、変更先が `frameworks.md` の生成サポート × なら「雛形は最小構成で未検証になる」ことを伝えてから確定する
5. 「調整したい」場合は変更点を聞き、`decision.draft.json` を直接修正するか、変更が大きければ `arch-forge:solution-architect` に該当案の改訂（該当節だけを Edit で直す）を依頼する。その後 **Step 4b** を行ってから再提示する。**ユーザーが明示的に確定するまで Step 5 に進まない**

### Step 4b. 改訂のレビュー（調整した場合は必ず）

1. `arch-forge:architecture-critic` を **revision モード** で呼ぶ。プロンプトには、変更点（ユーザーの調整内容と、変えたファイル・節）と `04-review.md` のパスを書き、差分に関係する観点だけを検査させる
2. critical があれば、修正するか、リスクを受け入れるかをユーザーに確認する
3. `05-proposal.md` の該当箇所を更新し、「未レビュー」の記載を残さない（レビュー済みの版と、レビューの追記箇所を書く）

## Step 5. decision.json と ADR の確定

1. 選ばれた案とユーザーの調整を反映して `docs/architecture/decision.json` を書く（スキーマに厳密に準拠。`version: 1`、`adr` に ADR のパス `docs/architecture/adr/0001-application-architecture.md`）
   - 案ドキュメントにある次の内容も、スキーマの項目に写す: `packaging`、`entrypoint`（同じ path を共有するユニットでは必須）、`modules[].cqrs`、`platform`（共通パッケージの許可リスト）、`conventions`（実装規約 C1〜）
   - draft の `sampleFeature` の名前が 01-requirements.md / 03-options/ に無い名前なら、設計文書にある名前に直す
   - 実装規約の ID（C1〜）は decision.json を正にする。案ドキュメントの改訂で番号がずれたら、ADR に対応表を書くのではなく、案ドキュメント側の番号を decision.json に合わせて直す
2. スキーマ検証: `node` か `python3` が使えれば必須フィールドと enum を簡易チェックする。違反があれば修正する
3. `date +%F` で日付を取得し、ADR テンプレートから `docs/architecture/adr/0001-application-architecture.md` を作る
   - コンテキスト / 検討した選択肢（全案）/ 決定 / フレームワーク・主要ライブラリ（採用・次点・理由）/ 構成図 / 依存ルール / 結果 / 見直しトリガー をすべて埋める
   - ステータスは「承認済み」、決定者はユーザー
4. ユーザーに decision.json の要点（ユニット一覧とパス）と ADR のパスを伝える

## Step 6. scaffold ワークフローの実行

**事前確認**（生成の前に必ず行う）:

1. `bash ${CLAUDE_PLUGIN_ROOT}/scripts/detect-toolchains.sh report` を実行し、decision.json の言語のツールチェーンがあるか確認する
   - **無い言語がある場合**: AskUserQuestion で「インストールしてから生成する（推奨）」/「場所を指定する」/「検証なしで生成する（ビルド・テスト・整形は未検証になる）」を確認する。「場所を指定する」なら、そのパスで検出をやり直す
   - **「直し方（推奨）」が出た場合**（PATH の go が goenv / asdf のシムで失敗している）: AskUserQuestion で「プロジェクトに版のファイルを置く（推奨）」/「PATH で渡す（コマンドごとに承認が必要）」を確認する。置く場合は `bash ${CLAUDE_PLUGIN_ROOT}/scripts/detect-toolchains.sh --pin` の出力（ファイル名とタブ区切りの 1 行）どおりに Write する（`.tool-versions` が既にあれば行を足す）。もう一度 `report` を実行し、PATH の go が動くことを確認する。PATH を書き換える方法は、`export PATH=...` や絶対パスでの実行が Claude Code では毎回承認の対象になり、go-arch-lint も PATH の go を呼ぶため、最後の手段にする
2. 補助ツールの版で、生成物が動かない組み合わせを伝える（例: Docker Compose が古い、golangci-lint が decision.json の Go より古い Go でビルドされている）。生成物は手元の版に合わせるか、必要な最低版を README に書く方針で進めることを 1〜2 行で伝える
3. **PATH の go などが動かないままの場合だけ**、`bash ${CLAUDE_PLUGIN_ROOT}/scripts/detect-toolchains.sh --env` の出力（`export PATH="..."`）から、引用符の中のコロン区切りのディレクトリ（`:$PATH` を除く）を `toolchainPath` として控える。PATH の go が動くなら `toolchainPath` は渡さない
4. 生成中は、サブエージェントが `.claude/`（rules と settings.json）への書き込みや go / make の実行で承認を求めることがあると、1 行で伝える

AskUserQuestion: 「今すぐディレクトリとサンプル実装を生成しますか？」— 生成する（推奨）/ 後で（`/arch-forge:scaffold` で再開できると伝えて終了）

生成する場合、decision.json の `units` から `{ name, language, path, entrypoint }` の配列を作り、Workflow ツールで起動する。**同じ path を持つユニットは 1 つのビルド単位** としてワークフローが順番に生成し、検証は 1 回にまとめる（並列に作ると go.mod などの共通ファイルが衝突するため）:

```json
{
  "scriptPath": "${CLAUDE_PLUGIN_ROOT}/workflows/scaffold.js",
  "args": {
    "pluginRoot": "${CLAUDE_PLUGIN_ROOT}",
    "docsDir": "docs/architecture",
    "toolchainPath": "<事前確認 3 のディレクトリ。無ければ省略>",
    "units": [{ "name": "<unit>", "language": "go|php|rust", "path": "<path>", "entrypoint": "<entrypoint>" }]
  }
}
```

内部では foundation-builder（sonnet。AGENTS.md / CLAUDE.md と `.claude/rules/arch-forge/` の共通・言語別ルールも作る）→ ビルド単位ごとに言語別 scaffolder（sonnet。共有するユニットは 1 番目が共通部分、2 番目以降が自分の起動点だけを作る）→ scaffold-verifier（haiku）→ 失敗時は scaffolder で 1 回修正 → foundation-builder（sync モード。ドキュメントを実態に同期し、ユニット別ルール `units/<unit>.md` を作る）→ architecture-critic の conformance チェック（sonnet）が動く。

**フォールバック**: Agent ツールで `arch-forge:foundation-builder` → ビルド単位ごとに `arch-forge:<language>-scaffolder`（別々のビルド単位は 1 メッセージで並列。**同じ path を共有するユニットは完了通知を待って 1 つずつ**、ワークフローと同じ役割の指示を付ける）→ ビルド単位ごとに `arch-forge:scaffold-verifier`（失敗があれば scaffolder で 1 回修正して再検証）→ `arch-forge:foundation-builder`（sync モード）→ `arch-forge:architecture-critic`（conformance モード）の順に実行する。Agent が非同期で返る場合の進め方は Step 3 のフォールバックと同じ。各プロンプトに `toolchainPath` の `export PATH=...` の指示を入れる。

## Step 7. 完了報告

報告の前に **hooks の動作確認** を行う: `python3 -I ${CLAUDE_PLUGIN_ROOT}/hooks/arch_hooks.py doctor` を実行する。decision.json の読み込み、セッション開始時に注入される文脈、ドメイン層の検出（依存方向チェックの対象になるディレクトリ）が表示される。失敗や「検出なし」があれば、そのまま報告に書く（hooks が動くと書かない）。

ワークフローの結果をもとに報告する:

- ユニットごとの結果（passed / failed、skipped の検証とその理由、未解決事項）
- 適合チェックの違反数（`docs/architecture/07-conformance.md`）
- 生成された主要ファイル（ルートの AGENTS.md / CLAUDE.md、`.claude/rules/arch-forge/`、architecture.md、ADR、各ユニットの README）
- hooks の動作確認の結果。確認できた場合だけ「以降のセッションでは arch-forge の hooks が decision.json を読み、セッション開始時の文脈注入・承認済み ADR の保護・編集時の依存方向チェックを行う」と書く（プロファイルは `/plugin` の設定で minimal / standard / strict / off を選べる）
- 起動方法（`make up` / `make test` など、実際に生成されたものだけ）
- 次の一手: 失敗や違反が残っていれば修正するか確認する。新しい設計判断が出たら `docs/architecture/adr/` に ADR を追加すること、規約チェックは `/arch-forge:check` で再実行できることを伝える

失敗や skipped を「成功」と報告しない。検証できなかったものは検証できなかったと書く（`arch-forge:verification-before-completion` の基準に従う）。
