---
name: scaffold
description: 確定済みの docs/architecture/decision.json から、アーキテクチャに沿ったディレクトリとサンプル実装を生成し、ビルド・テスト・依存方向チェックまで行う。/arch-forge:design で設計を確定した後に生成だけをやり直したいとき、特定のユニットだけ生成したいときに使う。 Generates directories and an end-to-end sample feature from a confirmed docs/architecture/decision.json and verifies build, tests and dependency rules. Use to (re)run scaffolding after the design is confirmed.
argument-hint: "[ユニット名 ...（省略時は全ユニット）]"
disable-model-invocation: true
allowed-tools: Read, Write, Glob, Grep, AskUserQuestion, Workflow, Agent, Bash(ls *), Bash(git status *), Bash(python3 *), Bash(bash ${CLAUDE_PLUGIN_ROOT}/scripts/detect-toolchains.sh *)
---

# arch-forge: scaffold

対象ユニット: $ARGUMENTS（空なら全ユニット）

## 現在の状態（自動取得）

- decision.json: !`ls docs/architecture/decision.json 2>/dev/null || echo "(なし)"`
- 未コミットの変更: !`git status --porcelain 2>/dev/null | head -20 || true`
- ツールチェーン（PATH に加え goenv / asdf / mise / /usr/local/go / Homebrew も探した結果）:
!`bash ${CLAUDE_PLUGIN_ROOT}/scripts/detect-toolchains.sh report`

## 手順

1. `docs/architecture/decision.json` が無ければ「先に `/arch-forge:design` でアーキテクチャを確定してください」と伝えて終了する
2. decision.json を Read し、スキーマ（`${CLAUDE_PLUGIN_ROOT}/templates/decision.schema.json`）の必須項目が揃っているか確認する
3. 対象ユニットを決める。$ARGUMENTS が指定されていれば一致する `units[].name` のみ。存在しない名前があれば一覧を示して確認する
   - 同じ `path` を共有するユニットは 1 つのビルド単位。その一部だけを指定された場合も、共通部分が既にあるか確認し、無ければ同じ path の全ユニットを対象にするか確認する
4. 生成先に既存ファイルがある場合（各ユニットの `path` を `ls`）や未コミットの変更がある場合は、上書きの可能性を伝え AskUserQuestion で続行を確認する
5. 上のツールチェーンの検出結果で、対象ユニットの言語が「なし」なら、AskUserQuestion で「インストールしてから生成する（推奨）」/「場所を指定する」/「検証なしで生成する」を確認する。「直し方（推奨）」が出ていれば（PATH の go がシムで失敗）、design スキルの Step 6 事前確認と同じく、版のファイル（`--pin` の出力）を置くか確認して置き、PATH の go が動くことを確かめる。それでも PATH の go が動かない場合だけ、`bash ${CLAUDE_PLUGIN_ROOT}/scripts/detect-toolchains.sh --env` の出力の引用符の中（`:$PATH` を除く）を `toolchainPath` として控える。Docker Compose・golangci-lint の版の注意も 1〜2 行で伝える
6. Workflow ツールで起動する:
   ```json
   {
     "scriptPath": "${CLAUDE_PLUGIN_ROOT}/workflows/scaffold.js",
     "args": {
       "pluginRoot": "${CLAUDE_PLUGIN_ROOT}",
       "docsDir": "docs/architecture",
       "toolchainPath": "<手順 5 のディレクトリ。無ければ省略>",
       "units": [{ "name": "<unit>", "language": "<go|php|rust>", "path": "<path>", "entrypoint": "<entrypoint>" }]
     }
   }
   ```
   同じ path を持つユニットは、ワークフローが 1 つのビルド単位として順番に生成し、検証を 1 回にまとめる。
   Workflow ツールが使えない場合は、Agent ツールで `arch-forge:foundation-builder` → ビルド単位ごとに `arch-forge:<language>-scaffolder`（別々のビルド単位は 1 メッセージで並列。同じ path を共有するユニットは完了通知を待って 1 つずつ）→ ビルド単位ごとに `arch-forge:scaffold-verifier`（失敗があれば scaffolder で 1 回修正して再検証）→ `arch-forge:foundation-builder`（sync モード。ドキュメントの同期とユニット別ルール `.claude/rules/arch-forge/units/<unit>.md` の生成）→ `arch-forge:architecture-critic`（conformance モード）の順に実行する。Agent は非同期で返ることがあるので、次の段は前の段の完了通知を受け取ってから起動する（ポーリングしない。待つ間は進捗を 1 行伝えてターンを終えてよい）。各プロンプトに `toolchainPath` の `export PATH=...` の指示を入れる
7. 完了通知を待つ。報告の前に `python3 -I ${CLAUDE_PLUGIN_ROOT}/hooks/arch_hooks.py doctor` で hooks の動作を確認する
8. ユニットごとの passed / failed / skipped、未解決事項、適合チェックの違反数、hooks の確認結果を報告する。失敗が残っていれば修正するか確認する
