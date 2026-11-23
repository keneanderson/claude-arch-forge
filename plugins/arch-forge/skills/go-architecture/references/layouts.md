# Go ディレクトリ構成リファレンス

`<app>` はバイナリ名、`<module>` は `go.mod` の module path。サンプル機能は Order（CreateOrder / GetOrder）を例にする。
実際の生成では decision.json の `sampleFeature` に置き換える。

## layered

```
.
├── cmd/<app>/main.go
├── internal/
│   ├── config/config.go
│   ├── handler/order_handler.go        # HTTP ⇄ service、DTO 変換、ステータスコード
│   ├── service/order_service.go        # 業務処理。repository interface をここで定義
│   ├── repository/
│   │   ├── memory/order_repository.go
│   │   └── postgres/order_repository.go
│   └── model/order.go
├── db/migrations/0001_create_orders.sql
├── go.mod
└── Makefile
```
依存: `handler → service → model`、`repository/* → service(interface), model`

## clean

```
.
├── cmd/<app>/main.go                  # 配線のみ
├── internal/
│   ├── domain/
│   │   ├── order.go                   # Entity（不変条件をコンストラクタで守る）
│   │   ├── order_id.go                # Value Object
│   │   └── errors.go                  # ErrOrderNotFound など
│   ├── usecase/
│   │   ├── port.go                    # OrderRepository / Clock / IDGenerator interface
│   │   ├── create_order.go            # 入力 DTO → ドメイン操作 → 出力 DTO
│   │   ├── create_order_test.go
│   │   └── get_order.go
│   ├── adapter/
│   │   ├── http/
│   │   │   ├── router.go
│   │   │   ├── order_handler.go
│   │   │   └── order_handler_test.go
│   │   └── repository/
│   │       ├── memory/order_repository.go
│   │       └── postgres/order_repository.go
│   ├── infrastructure/
│   │   ├── postgres/db.go             # pgxpool の生成
│   │   └── server/server.go           # http.Server と graceful shutdown
│   └── config/config.go
├── db/{migrations,query}/
├── .go-arch-lint.yml
├── .golangci.yml
├── go.mod
└── Makefile
```
依存: `adapter → usecase → domain`、`infrastructure → (adapter, usecase)`、`domain → なし`

## hexagonal

```
internal/
├── core/
│   ├── domain/order.go
│   ├── port/
│   │   ├── inbound.go     # type OrderService interface { Create(...); Get(...) }
│   │   └── outbound.go    # type OrderRepository interface {...}; type EventPublisher interface {...}
│   └── service/order_service.go   # inbound port の実装。outbound port にのみ依存
└── adapter/
    ├── inbound/
    │   ├── http/order_handler.go   # inbound port を呼ぶ
    │   └── grpc/order_server.go    # （必要な場合）
    └── outbound/
        ├── postgres/order_repository.go
        ├── memory/order_repository.go
        └── nats/event_publisher.go
```
依存: `adapter/inbound → core/port`、`adapter/outbound → core/port, core/domain`、`core/service → core/port, core/domain`

## ddd-clean（集約ごとに分割）

```
internal/
├── domain/
│   ├── order/
│   │   ├── order.go            # Aggregate Root
│   │   ├── line_item.go        # 集約内 Entity
│   │   ├── money.go            # Value Object
│   │   ├── repository.go       # 集約単位の Repository interface（DDD ではドメイン層に置く）
│   │   └── events.go           # OrderPlaced など Domain Event
│   └── shared/                 # 共通 Value Object（慎重に最小限）
├── application/
│   └── order/
│       ├── place_order.go      # ユースケース（トランザクション境界）
│       └── get_order.go
├── interfaces/http/order_handler.go
└── infrastructure/
    ├── persistence/postgres/order_repository.go
    └── messaging/outbox.go
```

## vertical-slice

```
internal/
├── feature/
│   ├── createorder/
│   │   ├── handler.go     # HTTP 入出力
│   │   ├── command.go     # 入力検証と処理本体
│   │   ├── store.go       # この機能専用の永続化 interface と実装
│   │   └── handler_test.go
│   └── getorder/...
└── platform/              # DB 接続、ロガー、ミドルウェアなど横断的関心事のみ
```

## modular-monolith

```
.
├── cmd/<app>/main.go
├── internal/
│   ├── modules/
│   │   ├── ordering/
│   │   │   ├── module.go          # New(deps) *Module; RegisterRoutes(mux); 公開ファサード
│   │   │   ├── api.go             # 他モジュール向け公開 interface と DTO（ここだけ参照可）
│   │   │   ├── domain/ usecase/ adapter/   # 内部は clean 等
│   │   └── inventory/
│   │       ├── module.go
│   │       ├── api.go
│   │       └── ...
│   ├── platform/                  # DB, logger, eventbus(in-process), http server
│   └── config/
├── db/migrations/<module>/        # モジュールごとにスキーマ分離（ordering.orders など）
└── .go-arch-lint.yml              # modules/<a>/** は modules/<b>/(api.go 以外) を参照禁止
```
モジュール間連携: (1) `api.go` の interface を main で注入、または (2) `platform/eventbus` によるインプロセスイベント。

## microservices（モノレポ）

```
.
├── api/proto/<svc>/v1/*.proto     # buf.yaml / buf.gen.yaml で生成
├── services/
│   ├── ordering/                  # 独立 go.mod。内部は上記いずれかのパターン
│   │   ├── cmd/server/main.go
│   │   ├── internal/...
│   │   ├── Dockerfile
│   │   └── go.mod
│   └── inventory/...
├── pkg/                           # 横断的関心事のみ（otel 初期化、ログ設定）。ドメイン禁止
│   └── go.mod
├── deploy/docker-compose.yml
├── go.work                        # use ./services/ordering ./services/inventory ./pkg
└── Makefile                       # make build / test / lint を全サービスに対して実行
```

## .go-arch-lint.yml

**ゼロから書かず、プラグイン同梱の検証済みテンプレートを使う**（go-arch-lint v3 の形式は細部が厳しく、手書きすると読み込めないことがある）:

| 構成 | テンプレート |
|---|---|
| 単一モジュールの clean（hexagonal は名前を変える） | `<pluginRoot>/templates/go/go-arch-lint.clean.yml` |
| モジュラーモノリス（各モジュール内は clean。API・worker など複数の起動点が 1 つの go.mod を共有してもよい） | `<pluginRoot>/templates/go/go-arch-lint.modular-monolith.yml` |

- どちらも `tests/go-arch-lint/` の fixture で「正しい構成で違反なし」「違反を入れると検出」をプラグインの CI で確認している
- `workdir: .` で `cmd/**` も対象にし、`cmd` は `anyProjectDeps: true`（配線だけを行う）
- **deepScan** は、usecase のコンストラクタへ外側の実装を注入する箇所を「usecase → infrastructure の依存」と誤って報告する。テンプレートのとおり、注入を受ける usecase 系のコンポーネントだけ `deepScan: false` にする（全体を off にしない）
- go-arch-lint は標準ライブラリの import を検査しない。domain の `net/http` などは arch-forge の hooks と `/arch-forge:check` で検査する
- 各コンポーネントは自分自身を `mayDependOn` に含める。含めないと、同じ層のサブパッケージ間の import（`domain` → `domain/money`）と外部テストパッケージ（`package domain_test`）が違反として報告される
- domain、platform、config は自分自身（platform は config も）以外に依存できない
