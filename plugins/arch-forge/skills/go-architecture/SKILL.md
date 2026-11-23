---
name: go-architecture
description: Go でのアーキテクチャ実装規約。レイヤード / クリーン / ヘキサゴナル / DDD / モジュラーモノリス / マイクロサービスごとのディレクトリ構成、依存性逆転の書き方、DI、エラー処理、テスト、go-arch-lint による依存方向検査。Go プロジェクトの構成を決める・生成する・レビューするときに使う。 Go architecture conventions (layouts per pattern, dependency inversion, DI, errors, tests, go-arch-lint) and differences between net/http, chi, echo and gin.
user-invocable: false
---

# Go アーキテクチャ規約

詳細なディレクトリツリーは `${CLAUDE_SKILL_DIR}/references/layouts.md`、
層ごとのサンプルコードは `${CLAUDE_SKILL_DIR}/references/samples.md` を Read して使う。

## 基本方針

- **Go バージョン**: 生成時に `go version` で確認し、インストール済みの最新安定版を `go.mod` の `go` ディレクティブに使う（1.22 未満なら警告。ServeMux のパターンルーティングを使うため）。`toolchain` 行には、そのマイナー版の最新パッチ版を書く（`https://go.dev/dl/?mode=json`）。`go version` が失敗したら、`bash <pluginRoot>/scripts/detect-toolchains.sh` で goenv / asdf などの実体を探す
- **環境と設定**: `APP_ENV` が未設定・未知なら production として扱い、インメモリ実装は `APP_ENV=local` / `test` のときだけ使う（samples.md の config）
- **パッケージの分け方**: decision.json の `packaging`。by-layer は `internal/<層>/`、by-feature は `internal/<機能>/<層>/`（モジュラーモノリスは `internal/modules/<module>/<層>/`）
- **エントリポイント**: `cmd/<binary>/main.go`。main は配線（設定読込・DI・サーバ起動・graceful shutdown）だけを行う
- **非公開化**: アプリ本体は `internal/` 配下に置き、外部からの import をコンパイラで禁止する
- **インターフェースは利用側が定義する**（usecase / application 層が Repository interface を持ち、infrastructure が実装する）。小さく保つ
- **DI**: 原則は main での手動コンストラクタ注入。依存が 30 を超えるなど配線が辛くなったら google/wire を検討（初期は入れない）
- **context**: I/O を伴う関数の第一引数は `ctx context.Context`
- **エラー**: ドメインエラーは `var ErrXxx = errors.New(...)` の番兵値または型で定義し、`fmt.Errorf("...: %w", err)` でラップ。HTTP ステータスへの変換はハンドラ層のみで行う
- **ログ**: 標準 `log/slog`（JSON ハンドラ）。ロガーは依存として注入
- **設定**: 環境変数から読む `internal/config`。外部ライブラリは必須ではない
- **HTTP**: 既定は標準 `net/http`（`mux.HandleFunc("GET /orders/{id}", h)` + `r.PathValue("id")`）。ミドルウェアが多いなら chi、チームが慣れていれば echo
- **gRPC / サービス間**: connect-go（HTTP/1.1 と gRPC 両対応、buf で生成）を第一候補、既存資産があれば grpc-go
- **DB**: PostgreSQL + pgx/v5。クエリは sqlc でコード生成（`db/query/*.sql` → `internal/infrastructure/postgres/sqlc`）。マイグレーションは goose または golang-migrate
- **テスト**: 標準 `testing` + テーブル駆動。usecase はインメモリ Repository 実装でテストする。`httptest` でハンドラをテスト
- **Lint**: golangci-lint（`.golangci.yml`）。依存方向は go-arch-lint（`.go-arch-lint.yml`）または golangci-lint の depguard で検査

## フレームワーク別の差分

decision.json の `framework` / `libraries` に従う。samples.md は標準 `net/http` + sqlc 版なので、他を選んだ場合は **adapter（ハンドラ・ルーター）と infrastructure だけ** を差し替え、domain / usecase は同じコードにする。選定基準は `architecture-patterns` スキルの `references/frameworks.md`。

| framework | ルーティング | パスパラメータ | ハンドラ層での注意 |
|---|---|---|---|
| net/http | `mux.HandleFunc("GET /orders/{id}", h)` | `r.PathValue("id")` | — |
| chi | `r.Get("/orders/{id}", h)`、`r.Route` でグループ化 | `chi.URLParam(r, "id")` | `http.Handler` 互換なので標準ミドルウェアを使える |
| echo | `e.GET("/orders/:id", h)`（`func(c echo.Context) error`） | `c.Param("id")` | エラーは `echo.HTTPError` に変換。`echo.Context` を usecase に渡さない |
| gin | `r.GET("/orders/:id", h)`（`func(c *gin.Context)`） | `c.Param("id")` | `gin.Context` を usecase に渡さない。`c.Request.Context()` を渡す |

DB を ent / GORM にした場合も、生成されたモデルは infrastructure に閉じ込め、Repository 実装の中でドメインの Entity に変換する。

## パターン → ディレクトリの対応（要約）

| パターン | 主要ディレクトリ |
|---|---|
| layered | `internal/{handler,service,repository,model}` |
| clean | `internal/{domain,usecase,adapter/{http,repository},infrastructure}` |
| hexagonal | `internal/{core/{domain,port,service},adapter/{inbound/http,outbound/postgres}}` |
| ddd-clean / ddd-hexagonal | 上記の `domain` を `domain/<aggregate>/` に分け Entity / ValueObject / Repository interface / DomainEvent を置く |
| vertical-slice | `internal/feature/<feature>/{handler.go,command.go,query.go,store.go}` |
| modular-monolith | `internal/modules/<module>/` ごとに上記いずれか ＋ `internal/modules/<module>/api.go`（公開ファサード）。他モジュールは facade のみ参照 |
| microservices | `services/<svc>/`（各々独立 `go.mod`）＋ ルート `go.work`、契約は `api/proto` |

## 依存方向の検査（必須）

`.go-arch-lint.yml` を生成し、層の依存ルールを宣言する。**プラグイン同梱の検証済みテンプレート**（`<pluginRoot>/templates/go/`、layouts.md 末尾の表）を元にし、パスとコンポーネント名だけを変える。
ツールはバージョンを固定して go.mod の tool ディレクティブ（Go 1.24+）で管理する: `go get -tool github.com/fe3dback/go-arch-lint@<最新の安定タグ>`。
検証コマンド: `go tool go-arch-lint check`（ネットワークが無く取得できなければ import の grep で代替し、その旨を報告する）。
外部テストパッケージ（`package usecase_test`）の `_test.go` も go-arch-lint の検査対象になる。テストでも依存ルールを守る（usecase のテストは外側の層の実装を import せず、テストファイル内のフェイクを使う）。同じ層のサブパッケージ間の import と外部テストパッケージを通すため、テンプレートでは各コンポーネントが自分自身を `mayDependOn` に含めている（消さない）。

## 生成後の必須チェック

```
gofmt -l . | (! grep .)     # 未整形ファイルなし
go vet ./...
go build ./...
go test ./...
```
