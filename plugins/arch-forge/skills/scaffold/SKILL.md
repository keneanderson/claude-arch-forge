---
name: scaffold
description: 確定済みの docs/architecture/decision.json から、アーキテクチャに沿ったディレクトリとサンプル実装を生成し、ビルド・テスト・依存方向チェックまで行う。/arch-forge:design で設計を確定した後に生成だけをやり直したいとき、特定のユニットだけ生成したいときに使う。
argument-hint: "[ユニット名 ...（省略時は全ユニット）]"
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, AskUserQuestion, Workflow, Agent, Bash(ls:*), Bash(git status:*)
---

# arch-forge: scaffold

対象ユニット: $ARGUMENTS（空なら全ユニット）

## 現在の状態（自動取得）

- decision.json: !`ls docs/architecture/decision.json 2>/dev/null || echo "(なし)"`
- 未コミットの変更: !`git status --porcelain 2>/dev/null | head -20 || true`

## 手順

1. `docs/architecture/decision.json` が無ければ「先に `/arch-forge:design` でアーキテクチャを確定してください」と伝えて終了する
2. decision.json を Read し、スキーマ（`${CLAUDE_PLUGIN_ROOT}/templates/decision.schema.json`）の必須項目が揃っているか確認する
3. 対象ユニットを決める。$ARGUMENTS が指定されていれば一致する `units[].name` のみ。存在しない名前があれば一覧を示して確認する
4. 生成先に既存ファイルがある場合（各ユニットの `path` を `ls`）や未コミットの変更がある場合は、上書きの可能性を伝え AskUserQuestion で続行を確認する
5. Workflow ツールで起動する:
   ```json
   {
     "scriptPath": "${CLAUDE_PLUGIN_ROOT}/workflows/scaffold.js",
     "args": {
       "pluginRoot": "${CLAUDE_PLUGIN_ROOT}",
       "docsDir": "docs/architecture",
       "units": [{ "name": "<unit>", "language": "<go|php|rust>", "path": "<path>" }]
     }
   }
   ```
   Workflow ツールが使えない場合は、Agent ツールで `arch-forge:foundation-builder` → 各ユニットの `arch-forge:<language>-scaffolder`（並列）→ `arch-forge:scaffold-verifier` → `arch-forge:architecture-critic`（conformance モード）を順に実行する
6. 完了通知を待ち、ユニットごとの passed / failed / skipped、未解決事項、適合チェックの違反数を報告する。失敗が残っていれば修正するか確認する
