# Rust ディレクトリ構成リファレンス

サンプル機能は Order（create_order / get_order）。`<app>` はプロジェクト名。

## layered（単一 crate）

```
.
├── Cargo.toml
└── src/
    ├── main.rs            # 配線と起動
    ├── config.rs
    ├── handler/order.rs   # axum ハンドラ
    ├── service/order.rs   # 業務処理、OrderRepository trait を定義
    ├── repository/{memory.rs,postgres.rs}
    └── model/order.rs
```

## clean（workspace）

```
.
├── Cargo.toml                    # [workspace] members = ["crates/*"], resolver = "3"
├── crates/
│   ├── domain/                   # 依存: なし（thiserror 程度）
│   │   └── src/{lib.rs,order.rs,error.rs}
│   ├── application/              # 依存: domain
│   │   └── src/{lib.rs,ports.rs,create_order.rs,get_order.rs}
│   ├── infrastructure/           # 依存: domain, application, sqlx
│   │   └── src/{lib.rs,memory.rs,postgres.rs,clock.rs,id.rs}
│   └── api/                      # bin。依存: すべて + axum, tokio
│       ├── src/{main.rs,routes.rs,error.rs,dto.rs}
│       └── tests/orders.rs
├── migrations/0001_create_orders.sql
└── Makefile
```

ルート `Cargo.toml`:
```toml
[workspace]
members = ["crates/*"]
resolver = "3"

[workspace.package]
edition = "2024"
version = "0.1.0"

[workspace.dependencies]
domain = { path = "crates/domain" }
application = { path = "crates/application" }
infrastructure = { path = "crates/infrastructure" }
tokio = { version = "1", features = ["macros", "rt-multi-thread", "signal"] }
axum = "0.8"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["json", "env-filter"] }
```
（`resolver = "3"` は edition 2024 用。2021 にした場合は `"2"`）

## hexagonal（workspace）

```
crates/
├── core/                 # domain + ports(trait) + services（ユースケース）。外部 I/O crate に依存しない
│   └── src/{domain/,ports/{inbound.rs,outbound.rs},services/}
├── adapter-http/         # 依存: core, axum
├── adapter-postgres/     # 依存: core, sqlx
├── adapter-memory/       # 依存: core（テスト・ローカル用）
└── app/                  # bin: 配線のみ
```

## modular-monolith（workspace）

```
crates/
├── modules/
│   ├── ordering/          # 内部は mod で domain/application/infrastructure
│   ├── ordering-api/      # 他モジュール向け公開 trait と DTO のみ
│   ├── inventory/
│   └── inventory-api/
├── platform/              # DB プール、イベントバス（tokio::sync::broadcast）、設定
└── app/                   # bin: 各モジュールの Router を merge
```
ルール: `ordering` は `inventory-api` に依存してよいが `inventory` には依存しない（Cargo.toml で強制）。

## microservices（モノレポ）

```
.
├── api/proto/<svc>/v1/*.proto
├── services/
│   ├── ordering/          # 各サービスは clean 構成の小さな workspace、または単一 crate
│   │   ├── Cargo.toml
│   │   ├── build.rs       # tonic-build（gRPC の場合）
│   │   └── Dockerfile     # cargo-chef を使ったマルチステージ
│   └── inventory/
├── libs/telemetry/        # tracing / otel 初期化のみ。ドメイン禁止
├── deploy/docker-compose.yml
└── Cargo.toml             # ルート workspace（members = ["services/*", "libs/*"]）
```
