---
name: go-architecture
description: Go でのアーキテクチャ実装規約。レイヤード / クリーン / ヘキサゴナル / DDD / モジュラーモノリス / マイクロサービスごとのディレクトリ構成、依存性逆転の書き方、DI、エラー処理、テスト、go-arch-lint による依存方向検査。Go プロジェクトの構成を決める・生成する・レビューするときに使う。
user-invocable: false
---

# Go アーキテクチャ規約

詳細なディレクトリツリーは `${CLAUDE_SKILL_DIR}/references/layouts.md`、
層ごとのサンプルコードは `${CLAUDE_SKILL_DIR}/references/samples.md` を Read して使う。

## 基本方針

- **Go バージョン**: 生成時に `go version` で確認し、インストール済みの最新安定版を `go.mod` の `go` ディレクティブに使う（1.22 未満なら警告。ServeMux のパターンルーティングを使うため）
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

`.go-arch-lint.yml` を生成し、層の依存ルールを宣言する。サンプルは layouts.md 末尾。
ツールはバージョンを固定して go.mod の tool ディレクティブ（Go 1.24+）で管理する: `go get -tool github.com/fe3dback/go-arch-lint@<最新の安定タグ>`。
検証コマンド: `go tool go-arch-lint check`（ネットワークが無く取得できなければ import の grep で代替し、その旨を報告する）。
**`_test.go` は go-arch-lint の対象外** なので、テストでも依存ルールを守る（usecase のテストは外側の層の実装を import せず、テストファイル内のフェイクを使う）。

## 生成後の必須チェック

```
gofmt -l . | (! grep .)     # 未整形ファイルなし
go vet ./...
go build ./...
go test ./...
```
