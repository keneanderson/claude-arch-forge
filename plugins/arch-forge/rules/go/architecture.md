---
paths:
  - "**/*.go"
  - "**/go.mod"
  - "**/go.work"
  - "**/.go-arch-lint.yml"
---
# Go のアーキテクチャ規約

> [../common/architecture.md](../common/architecture.md) を Go に当てはめた規約です。

## 構成

- main（`cmd/<binary>/main.go`）は配線だけを行う: 設定の読み込み、コンストラクタ注入、サーバ起動、graceful shutdown
- アプリ本体は `internal/` に置く
- interface は利用側（usecase / application）で定義し、小さく保つ。infrastructure が実装する
- 各層のディレクトリ先頭の `doc.go` に、その層の責務と依存してよい層を書く。層を増やしたら `doc.go` も書く

## 依存

- domain で `net/http`、`database/sql`、pgx、ORM、Web フレームワーク、gRPC を import しない
- 内側の層の `_test.go` も外側の実装を import しない（go-arch-lint は `_test.go` を検査しないため、ここで守る）
- モジュラーモノリス: 他モジュールは `internal/modules/<module>`（ルートパッケージ = 公開 API）だけを import する
- ツールは `go get -tool <pkg>@<version>` で go.mod に固定し、`go tool <name>` で実行する。`@latest` を Makefile や CI に書かない

## コード

- I/O を伴う関数の第一引数は `ctx context.Context`
- ドメインエラーは番兵値か型で定義し、`fmt.Errorf("...: %w", err)` でラップする。HTTP ステータスへの変換はハンドラだけで行う
- ログは注入された `*slog.Logger` を使う。グローバルロガーを使わない
- `DATABASE_URL` などの接続設定があるのに接続に失敗したら、起動を失敗させる。黙ってインメモリ実装に切り替えない

## 検証

```
gofmt -l . && go vet ./... && go build ./... && go test ./... && go tool go-arch-lint check
```
