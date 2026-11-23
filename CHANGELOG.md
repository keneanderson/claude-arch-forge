# Changelog

## [0.4.0] - 2026-11-23

実際にアプリケーションを構築した試用で見つかった課題 18 件への対応。

### 追加

- **ツールチェーンの検出** `scripts/detect-toolchains.sh`: PATH に加え goenv / asdf / mise / `~/sdk` / `/usr/local/go` / Homebrew から Go・PHP・Rust の実体を探し、`GOTOOLCHAIN` と go.mod の go / toolchain 行も表示する。PATH の go がシム（版未設定）で失敗しても実体を使う。Docker Compose・golangci-lint（ビルドに使われた Go の版）・go-arch-lint などの補助ツールの版も表示する。`--env` で PATH を、`--go-bin` で go の実体を出す
  - design / scaffold スキルの冒頭でこの結果を表示し、生成前に「なし」の言語があればユーザーに確認する。見つけた PATH を `toolchainPath` で scaffold ワークフローとサブエージェントに渡す
- **ライブラリの事実確認** エージェント `stack-researcher`（sonnet）と propose ワークフローの Facts フェーズ: 案を並列に設計する前に、最新版・既知の脆弱性を含まない下限（OSV）・保守状況を一次情報（proxy.golang.org / packagist / crates.io、OSV、GitHub Releases）だけで 1 回確認し `02b-stack-facts.md` に書く。各案・レビューはこの表を引用する
- **追加ヒアリング**: requirements-analyst が、答えで案の前提が変わる影響「高」の未知の項目を `blockingQuestions` として返す。propose ワークフローは `status: needs-input` で止まり、design スキルが質問して brief に追記し、`clarified: true` で再実行する（Step 3b）
- **改訂レビュー**: Step 4 の「調整したい」で改訂したら、architecture-critic の revision モードで差分だけをレビューする（Step 4b）
- **比較用の案（comparison-only）**: 規模 L 未満で推奨がマイクロサービスでなければ option-c を比較用にする。critic は verdict を `reference` にし、critical / major に数えない。改訂対象にもしない
- **検証済みの go-arch-lint テンプレート** `templates/go/go-arch-lint.{clean,modular-monolith}.yml` と、fixture で「誤検知なし・違反を検出」を確かめるテスト `tests/go-arch-lint/run.sh`（validate と CI で実行）。deepScan は注入を受ける usecase 系のコンポーネントだけ off にする
- **hooks の動作確認** `arch_hooks.py doctor`: decision.json の読み込み、注入される文脈、ドメイン層の認識と違反の検出、strict の停止前チェックの対象を表示する。design / scaffold の完了報告の前に実行する
- decision.json: `units[].entrypoint`（ビルド単位を共有するユニットの起動点）、`units[].packaging`（by-layer / by-feature / hybrid）、`units[].platform`（共通パッケージの許可リスト）、`modules[].cqrs`、ルートの `conventions`（実装規約 C1〜）、`scaffold.claudeSettings`、`scaffold.codegen`
- 生成オプションに「Claude Code の設定」（`.claude/settings.json` に開発コマンドの権限 allowlist と `.env` の読み取り禁止）
- architecture-patterns: 「パッケージの分け方（層ごと / 機能ごと / hybrid）」の判断基準。提案書・案・ADR に必ず節を置く

### 変更

- **共有ビルド単位**: 同じ `path` のユニット（API と worker など）を scaffold ワークフローが 1 つのビルド単位として扱う。1 番目が共通部分と自分の起動点、2 番目以降が自分の起動点だけを作り、検証と修正はまとめて 1 回。共有するユニットには異なる `entrypoint` を必須にし、言語の混在を拒否する
- **安全な既定値**: `APP_ENV` の未設定・未知の値は production として扱い、インメモリ実装・暗号化なし接続・簡易モードは `APP_ENV=local` / `test` のときだけ有効にする（scaffolder 3 種、Go の config サンプル、rules、critic の観点）
- **コード生成**: Go の scaffolder は `libraries` の sqlc / oapi-codegen / buf などを `go get -tool` で固定し、`make gen` を実行して配線まで行う。設計で下限を決めたライブラリは実際に使う
- **検査を緩めない**: 修正の段で、テスト・lint 設定・依存方向の設定・バージョン下限の検査を緩めて通すことを禁止し、必要なら unresolved に書いてユーザーに回す（workflow、scaffolder、verification スキル、rules）
- Go: go.mod の `toolchain` 行に最新パッチ版を書く。golangci-lint と govulncheck も `go tool` で固定して実行する
- ヒアリング: 品質特性は「最も重視する 1 つ」と「2 番目」を別々に聞く（multiSelect をやめた）
- 文書の長さの上限: 案 350 行（比較用は 150 行）、レビュー 250 行、提案書 250 行。詳細は `03-options/<案ID>/` の付録へ。solution-architect に Edit を追加し、改訂は該当節だけを直す
- proposal-writer: ADR のパスを `adr/0001-application-architecture.md` に固定。sampleFeature の名前は設計文書に出てくるものだけを使う
- foundation-builder: 手元の Docker Compose の版で `docker compose config` が通るようにする。共有ビルド単位は go.work / members に 1 回だけ書く
- Agent フォールバック: Agent が非同期で返る前提の進め方（依存しない段は 1 メッセージでまとめて起動し、通知を待ってから次へ）を design / scaffold スキルに書いた
- 全エージェントに「最終応答・文書はユーザーの言語で書く」を明記
- hooks: SessionStart に起動点・パッケージの分け方・共有ビルド単位・実装規約を含める。PostToolUse は起動点の下のファイルをそのユニットとして判定する。Stop は共有ビルド単位を 1 回だけ検査する
- スキルの `allowed-tools` を推奨のスペース区切り形式（`Bash(ls *)`）に変更

### 修正（v0.4.0 の通し実行で見つかったもの）

求人検索 API（前回の試用と同じ要件）で design → 確定 → scaffold を通しで実行し、次を直した。

- **PATH の書き換えをやめ、版のファイルで直す**: `export PATH=...`・`PATH=... go`・絶対パスの go は Claude Code で毎回承認の対象になる（go-arch-lint も PATH の go を呼ぶ）。detect-toolchains.sh が goenv / asdf のシムの直し方（`.go-version` / `.tool-versions`）を示し、`--pin` で書く内容を出す。design / scaffold は確認のうえこのファイルを置き、`toolchainPath` は最後の手段にした
- **プラグインのファイルを Bash で読まない**: プロジェクトの外を `cat` / `cp` / `cd` で触ると拒否されるため、rules のコピーを Read → Write に変えた（foundation-builder、/arch-forge:rules）。Bash は単純なコマンドを 1 つずつ実行する指示を verification-before-completion に追加
- **go-arch-lint テンプレート**: 各コンポーネントが自分自身を `mayDependOn` に含めていなかったため、同じ層のサブパッケージ間の import と外部テストパッケージ（`package xxx_test`）を違反と誤判定していた。fixture にこの 2 つを追加。go-architecture スキルの「`_test.go` は go-arch-lint の対象外」という誤った記述を直した
- go-scaffolder: 本番と同じ配線を通す起動経路のテストを起動点ごとに 1 本書く（別のルーターでハンドラだけを試して、WebSocket のアップグレードが壊れる不具合を見逃したため）
- design: 実装規約の ID は decision.json を正にする
- scaffold スキル: 版のファイルを書くため allowed-tools に Write を追加

## [0.3.0] - 2026-11-22

### 追加

- **フレームワーク・主要ライブラリの選定**
  - `skills/architecture-patterns/references/frameworks.md`: 選定手順、評価軸（要件適合・アーキテクチャ適合・チーム適合・保守状況・性能・ロックイン・生成サポート）、Go / PHP / Rust の役割別カタログ（HTTP / RPC / DB / マイグレーション / メッセージング / テスト）と生成サポート（◎○×）
  - solution-architect が役割ごとに候補を比較し、採用・次点・却下理由・保守状況の出典を案に書く
  - design: ヒアリングで技術スタックの希望・制約を聞く。確定時にフレームワークを変えられる。確定後は Step 0b で新しい ADR によりフレームワークだけを見直せる
  - decision.json に `units[].libraries`（役割 → ライブラリ）を追加
  - ADR テンプレートに「フレームワーク・主要ライブラリ」節
  - 言語スキルに「フレームワーク別の差分」（Go: net/http / chi / echo / gin、Rust: axum / actix-web）
- **英語の説明**
  - `README.en.md`（README.md と同内容）。プラグイン側 README を日英併記に
  - 全エージェント・スキルの description に英語の説明。plugin.json / marketplace.json の description と hook_profile の説明を日英併記に
  - 日本語以外のプロジェクトでは、生成時に rules と CLAUDE.md をそのプロジェクトの言語に翻訳する
- validate: description の英語、README.md と README.en.md のコマンドの同期を検査

### 変更

- propose ワークフロー: 案の `framework` を必須にし、結果に案ごとの `stacks`（ユニット・FW・ライブラリ）を含める
- architecture-critic: 技術選定（パターンとの相性、保守状況の出典、次点の有無、サービス間のばらつき、生成サポート外の採用）をレビュー観点に追加
- scaffolder: decision.json の `framework` / `libraries` に従い、サンプルと違う FW では adapter / infrastructure だけを差し替える
- hooks: SessionStart の文脈にユニットの framework / libraries を含める。ドメイン層の禁止依存に fiber、bun、rocket、poem、warp を追加

## [0.2.0] - 2026-11-22

スター数の多い Claude Code プラグイン（obra/superpowers、affaan-m/ECC、anthropics/claude-plugins-official、wshobson/agents）の構成を参考にしたリファクタリング。

### 追加

- **hooks**（`hooks/hooks.json`、bash + python3 標準ライブラリのみ）
  - SessionStart: decision.json があれば確定アーキテクチャの要約を文脈に注入。設計途中なら `/arch-forge:design` での再開を案内
  - PreToolUse: 承認済み ADR の書き換えに確認を求める（strict では拒否。「置き換え済み」への変更は許可）。decision.json の変更時に ADR 追加と再検査を促す
  - PostToolUse: 編集した Go / PHP / Rust ファイルと Cargo.toml の依存方向（domain のフレームワーク依存、内側から外側への参照、モジュール内部への参照）を即時チェック
  - Stop（strict のみ）: 変更のあるユニットで go-arch-lint / deptrac を実行し、失敗なら停止を差し戻す
- **userConfig `hook_profile`**: minimal / standard / strict / off
- **rules**（`rules/`）: 生成プロジェクトの `.claude/rules/arch-forge/` に配置する規約。共通（依存ルール、ADR 運用、検証）と Go / PHP / Rust 別（`paths:` 指定）、ユニット別（`templates/unit-rule.md` から生成）
- **`/arch-forge:rules`**: decision.json から rules と AGENTS.md / CLAUDE.md を導入・再生成する
- **`arch-forge:verification-before-completion`**: 証拠なしに完了を報告しないための共通スキル。生成・検証系エージェントに preload
- 生成プロジェクトに **AGENTS.md（正本）+ CLAUDE.md（`@AGENTS.md`）** を作る
- リポジトリ側: `AGENTS.md` / `CLAUDE.md`、`make validate`（`scripts/validate.sh`）、hooks と workflows のテスト、GitHub Actions

### 変更

- workflows: `args` を JSON 文字列でも受け付ける。ユニット名・パス・docsDir を検証し、リポジトリ外を指す値を拒否する
- design スキル: ユーザー確定前に生成しない HARD-GATE と、危険信号の表を追加
- foundation-builder: AGENTS.md / CLAUDE.md / rules を生成し、sync モードでユニット別 rules を作る
- architecture-critic（conformance）: AGENTS.md と rules の記述が実態と一致するか、テストが依存ルールに従うかも検査

## [0.1.0] - 2026-11-22

- 初版。design / scaffold / check スキル、サブエージェント 10 個、propose / scaffold ワークフロー
