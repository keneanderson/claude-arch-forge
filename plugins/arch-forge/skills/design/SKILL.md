---
name: design
description: 新規アプリケーションのアーキテクチャを決めるワークフロー（Go / PHP / Rust）。要件ヒアリング → 要件分析 → モノリス / モジュラーモノリス / マイクロサービスの判断 → 複数案の設計とレッドチームレビュー → ユーザーが確定 → ADR と decision.json を作成 → ディレクトリとサンプル実装を生成・検証する。「アーキテクチャを決めたい」「新規開発の構成を考えて」「マイクロサービスにすべきか」「プロジェクトの雛形を作りたい」と言われたときに使う。
argument-hint: "[作りたいアプリケーションの説明]"
allowed-tools: Read, Write, Edit, Glob, Grep, AskUserQuestion, Workflow, Agent, Bash(mkdir:*), Bash(date:*), Bash(ls:*), Bash(node:*), Bash(python3:*)
---

# arch-forge: アーキテクチャ設計ワークフロー

ユーザーの依頼: $ARGUMENTS

## 現在の状態（自動取得）

- 既存の設計ドキュメント: !`ls -1 docs/architecture 2>/dev/null || echo "(なし)"`
- 利用可能なツールチェーン: !`(go version 2>/dev/null || echo "go: なし"); (php -r 'echo "php ".PHP_VERSION.PHP_EOL;' 2>/dev/null || echo "php: なし"); (cargo --version 2>/dev/null || echo "cargo: なし")`
- 既存のソースコード: !`ls -1 go.mod composer.json Cargo.toml package.json 2>/dev/null || echo "(マニフェストなし = 新規プロジェクト)"`

## 定数

- `PLUGIN_ROOT` = `${CLAUDE_PLUGIN_ROOT}`
- `DOCS` = `docs/architecture`
- decision スキーマ: `${CLAUDE_PLUGIN_ROOT}/templates/decision.schema.json`
- ADR テンプレート: `${CLAUDE_PLUGIN_ROOT}/templates/adr.md`

## 全体の流れ

```
Step 0 再開判定 → Step 1 ヒアリング → Step 2 brief 作成
→ Step 3 propose ワークフロー（バックグラウンド・複数サブエージェント）
→ Step 4 提案の提示とユーザー確定 → Step 5 decision.json + ADR
→ Step 6 scaffold ワークフロー → Step 7 完了報告
```

ユーザーへの質問は必ず AskUserQuestion で行う（1 回 4 問まで、各 2〜4 択、推奨には「（推奨）」を付けて先頭に置く）。
すべての出力・ドキュメントはユーザーの言語で書く。

---

## Step 0. 再開判定

上の「既存の設計ドキュメント」を見て分岐する:

- `decision.json` がある → AskUserQuestion: 「生成（scaffold）に進む」/「設計をやり直す」/「現状を表示して終了」
- `05-proposal.md` があり `decision.json` がない → Step 4 から再開
- `00-brief.md` だけある → Step 3 から再開するか、ヒアリングし直すか確認
- 何もない → Step 1

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
2. 重視する品質特性（multiSelect）: 開発スピード / 性能・低レイテンシ / 可用性・障害分離 / 長期的な変更容易性
3. データ: RDB 1 つで十分 / 読み書き非対称・検索が重い / 監査証跡・履歴の再現が必要 / 未定
4. デプロイ先: コンテナ（Cloud Run / ECS / Kubernetes）/ VM・オンプレ / サーバーレス / 未定

**ラウンド 3（必要な場合のみ）**: 外部連携、非同期処理の要否、独立リリースの必要性、納期、規制・コンプライアンス、既存インフラ。ラウンド 1〜2 の回答で判断が割れる点だけ聞く。

## Step 2. brief の作成

`mkdir -p docs/architecture/03-options docs/architecture/adr` を実行し、`docs/architecture/00-brief.md` を書く:

```
# ヒアリング結果（brief）
## プロダクト概要（ユーザーの説明をそのまま + 要約）
## 回答一覧（質問 → 回答の表）
## 既存環境（ツールチェーン、既存コード）
## 明示された制約
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

- 起動したらユーザーに「要件分析 → トポロジー判断 → 2〜3 案の並列設計 → レビュー → 提案書」を実行中であることを 1〜2 行で伝え、完了通知を待つ（ポーリングしない）
- 内部では次のサブエージェントが動く: requirements-analyst（sonnet）→ topology-strategist（opus）→ solution-architect ×2〜3 並列（opus）→ architecture-critic（sonnet）→ 必要なら solution-architect で修正 → proposal-writer（sonnet）

**フォールバック**（Workflow ツールが無い・無効化されている・起動エラーの場合）: Agent ツールで同じ順序を手動実行する。

1. `subagent_type: "arch-forge:requirements-analyst"`
2. `subagent_type: "arch-forge:topology-strategist"`（プロンプトに `pluginRoot=${CLAUDE_PLUGIN_ROOT}` を含める）
3. `subagent_type: "arch-forge:solution-architect"` を案ごとに **1 メッセージで並列に** 呼ぶ（案 ID と方針: option-a = pragmatic、option-b = evolutionary、規模 L 以上またはモノリス以外なら option-c = scale-first）
4. `subagent_type: "arch-forge:architecture-critic"`（proposal モード）。critical 指摘がある案は solution-architect で改訂
5. `subagent_type: "arch-forge:proposal-writer"`（`pluginRoot` を渡す）

## Step 4. 提案の提示と確定

1. `05-proposal.md` と `decision.draft.json` を Read する
2. ユーザーに次をまとめて提示する（長文の貼り付けではなく要約）:
   - 規模クラスと推奨トポロジー、その根拠
   - 案の比較表（案 / トポロジー / 内部パターン / 言語・FW / 主な利点 / 主なリスク）
   - 推奨案と理由 3 点
   - ワークフロー結果の `openQuestions`（未解決の質問）
   - 詳細は `docs/architecture/05-proposal.md` と `03-options/` にあると案内
3. AskUserQuestion で確定する:
   - Q1. 採用する案: 推奨案（推奨）/ 他の案 / 調整したい
   - Q2. サンプル機能（全層を貫通する 1 機能）: draft の提案 / 別の機能を指定
   - Q3. 生成オプション（multiSelect）: Docker・docker-compose / GitHub Actions CI / 依存方向 lint（推奨）
   - 必要に応じ Q4. Go module path または PHP 名前空間（draft の値を推奨として提示）
4. 「調整したい」場合は変更点を聞き、`decision.draft.json` を直接修正するか、変更が大きければ `arch-forge:solution-architect` に該当案の改訂を依頼してから再提示する。**ユーザーが明示的に確定するまで Step 5 に進まない**

## Step 5. decision.json と ADR の確定

1. 選ばれた案とユーザーの調整を反映して `docs/architecture/decision.json` を書く（スキーマに厳密に準拠。`version: 1`、`adr` に ADR のパス）
2. スキーマ検証: `node` か `python3` が使えれば必須フィールドと enum を簡易チェックする。違反があれば修正する
3. `date +%F` で日付を取得し、ADR テンプレートから `docs/architecture/adr/0001-application-architecture.md` を作る
   - コンテキスト / 検討した選択肢（全案）/ 決定 / 構成図 / 依存ルール / 結果 / 見直しトリガー をすべて埋める
   - ステータスは「承認済み」、決定者はユーザー
4. ユーザーに decision.json の要点（ユニット一覧とパス）と ADR のパスを伝える

## Step 6. scaffold ワークフローの実行

AskUserQuestion: 「今すぐディレクトリとサンプル実装を生成しますか？」— 生成する（推奨）/ 後で（`/arch-forge:scaffold` で再開できると伝えて終了）

生成する場合、decision.json の `units` から `{ name, language, path }` の配列を作り、Workflow ツールで起動する:

```json
{
  "scriptPath": "${CLAUDE_PLUGIN_ROOT}/workflows/scaffold.js",
  "args": {
    "pluginRoot": "${CLAUDE_PLUGIN_ROOT}",
    "docsDir": "docs/architecture",
    "units": [{ "name": "<unit>", "language": "go|php|rust", "path": "<path>" }]
  }
}
```

内部では foundation-builder（sonnet）→ ユニットごとに言語別 scaffolder（sonnet）→ scaffold-verifier（haiku）→ 失敗時は scaffolder で 1 回修正 → foundation-builder（sync モード）でドキュメントを実態に同期 → architecture-critic の conformance チェック（sonnet）が動く。

**フォールバック**: Agent ツールで `arch-forge:foundation-builder` → 各ユニットの `arch-forge:<language>-scaffolder`（ユニットが複数なら 1 メッセージで並列）→ `arch-forge:scaffold-verifier`（失敗があれば scaffolder で 1 回修正して再検証）→ `arch-forge:foundation-builder`（sync モード）→ `arch-forge:architecture-critic`（conformance モード）の順に実行する。

## Step 7. 完了報告

ワークフローの結果をもとに報告する:

- ユニットごとの結果（passed / failed、skipped の検証とその理由、未解決事項）
- 適合チェックの違反数（`docs/architecture/07-conformance.md`）
- 生成された主要ファイル（ルート CLAUDE.md、architecture.md、ADR、各ユニットの README）
- 起動方法（`make up` / `make test` など、実際に生成されたものだけ）
- 次の一手: 失敗や違反が残っていれば修正するか確認する。新しい設計判断が出たら `docs/architecture/adr/` に ADR を追加すること、規約チェックは `/arch-forge:check` で再実行できることを伝える

失敗や skipped を「成功」と報告しない。検証できなかったものは検証できなかったと書く。
