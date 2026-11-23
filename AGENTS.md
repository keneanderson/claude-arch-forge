# arch-forge — エージェント向けガイド

Claude Code プラグイン **arch-forge** のリポジトリです。新規開発のアプリケーションアーキテクチャ（Go / PHP / Rust）を、要件ヒアリングから提案・確定・雛形生成・検証まで行います。

このファイルが正本です。Claude Code は `CLAUDE.md` の `@AGENTS.md` から読み込みます。目次として使い、150 行以内に保ちます。

## 地図

- **[README.md](README.md)** / **[README.en.md](README.en.md)** — 利用者向けの説明（日本語 / 英語。内容を揃える）
- **`HANDOFF.md`** — 引き継ぎ（現状、未検証の部分、残作業）。ローカル専用で git には入れない（`.gitignore` 済み）。無ければ読まない
- **[CHANGELOG.md](CHANGELOG.md)** — 版ごとの変更
- **[plugins/arch-forge/](plugins/arch-forge/)** — プラグイン本体

```
plugins/arch-forge/
├── .claude-plugin/plugin.json   # マニフェスト（userConfig: hook_profile）
├── skills/        # /arch-forge:design | scaffold | check | rules と、知識スキル（user-invocable: false）
├── agents/        # サブエージェント 11 個（model / effort / tools / preload skills を明示）
├── workflows/     # propose.js / scaffold.js（Workflow ツール用スクリプト）
├── hooks/         # hooks.json + run-hook.sh + arch_hooks.py（標準ライブラリのみ。doctor で動作確認）
├── scripts/       # detect-toolchains.sh（Go / PHP / Rust と補助ツールの実体を探す。bash のみ）
├── rules/         # 生成プロジェクトの .claude/rules/arch-forge/ に配置する規約テンプレート
└── templates/     # decision.schema.json（design と scaffold の契約）、adr.md、AGENTS.md、CLAUDE.md、unit-rule.md、go/go-arch-lint.*.yml（検証済み）
```

## 設計の不変条件

- **decision.json が唯一の契約**: design 側は decision.json を書き、scaffold 側は decision.json だけを入力にする。フィールド（`framework` / `libraries` を含む）を変えたら `templates/decision.schema.json`、design スキル、proposal-writer、scaffolder、hooks（`arch_hooks.py`）を同時に直す
- **依存ゼロ**: hooks は bash と python3 標準ライブラリだけで動かす。python3 が無ければ何もしない。hook の失敗でユーザーのセッションを止めない（例外は握りつぶして exit 0）
- **ユーザーが確定するまで生成しない**: design スキルの HARD-GATE を弱める変更をしない
- **ビルド単位とデプロイ単位**: 同じ `path` の units は 1 つのビルド単位（共通部分を先に作り、順番に生成、検証は 1 回）。共有するユニットは `entrypoint` を必須にする
- **検査を緩めて通さない**: 検証の失敗を、テスト・lint 設定・バージョン下限の検査を緩めて直す変更を、プラグインの指示に入れない
- **Workflow スクリプトはファイルを読めない**: 必要な値は呼び出し側スキルが `args` で渡す。`args` は文字列でも受け付け、名前とパスは検証してからプロンプトに入れる
- **プラグインのエージェントでは `hooks` / `mcpServers` / `permissionMode` が無視される**: frontmatter に書かない

## 書き方の規約

| 対象 | 規約 |
|---|---|
| エージェント | frontmatter に `name` / `description` / `model` / `effort` / `tools` を必ず書く。tools は最小権限。生成・検証系は `arch-forge:verification-before-completion` を preload する |
| スキル | `description` に「いつ使うか」を書く。ユーザーが明示的に呼ぶものは `disable-model-invocation: true`、知識スキルは `user-invocable: false` |
| ワークフロー | 各 `agent()` に `agentType` / `model` / `effort` / `label`、結果を使うものは `schema` を付ける。null（失敗・スキップ）を必ず扱う |
| rules | 1 ファイル 80 行以内。言語別は `paths:` frontmatter を付け、`../common/` を参照する |
| 言語 | ドキュメント・プロンプトは日本語。生成物はユーザーの言語（decision.json / ADR の言語）に合わせる。日本語以外のプロジェクトでは rules / CLAUDE.md をコピー時に翻訳する |
| 英語の説明 | エージェント・スキルの `description` は日本語の後に英語の 1〜2 文を続ける（英語では `: ` を使わない）。README.md を変えたら README.en.md も同じ内容に直す。plugin.json / marketplace.json の description は「英語 / 日本語」 |
| フレームワーク | 候補・評価軸・生成サポート（◎○×）は `skills/architecture-patterns/references/frameworks.md` が正本。候補を増やしたら言語スキルの「フレームワーク別の差分」と README 2 つの対応表も直す。版数や日付はカタログに書かない（stack-researcher が設計時に一次情報で確認する） |
| 依存方向 lint の設定 | go-arch-lint の設定は `templates/go/` の検証済みテンプレートが正本。変えたら `tests/go-arch-lint/` の fixture で確認する |
| ファイル名 | 小文字ハイフン区切り（`go-scaffolder.md`） |

## 品質ゲート（push 前に必ず実行）

```bash
make validate        # JSON / 版数 / frontmatter / 英語の description / README 同期 / rules / workflow 構文とモック実行 / hooks テスト / ツールチェーン検出 / go-arch-lint テンプレート / claude plugin validate
make test            # hooks・workflows・go-arch-lint テンプレートのテストだけ
```

- 版を上げるときは `plugin.json` と `marketplace.json` の `version` を揃え、`CHANGELOG.md` に節を追加する
- workflow の分岐やスキーマを変えたら `tests/workflows/run.mjs` にケースを足す
- hook の判定を変えたら `tests/hooks/test_hooks.py` にケースを足す

## 手動での動作確認

```bash
claude --plugin-dir ./plugins/arch-forge          # 対話で /arch-forge:design を試す
ARCH_FORGE_HOOK_DEBUG=1 ARCH_FORGE_HOOK_PROFILE=strict claude --plugin-dir ./plugins/arch-forge
```

ヘッドレスで試す場合、`--allowedTools` はカンマ区切りの 1 引数にし、プロンプトは stdin で渡す（可変長フラグがプロンプトを飲み込むため）。`claude -p` では Workflow ツールが提供されないので、Agent フォールバック経路になる。

## してはいけないこと

- GitHub リポジトリの公開設定を変える、公開・公式ディレクトリへの申請をする（**オーナーの合図があるまで行わない**）
- 秘密情報や実在の接続文字列をテンプレート・テストに書く
- `HANDOFF.md` をコミットする（ローカル専用）
- force push、`reset --hard`、ブランチ削除をオーナーの指示なしに行う
