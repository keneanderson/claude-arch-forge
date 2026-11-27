# Rust directory layout reference

The sample feature is Order (create_order / get_order). `<app>` is the project name.

## layered (single crate)

```
.
├── Cargo.toml
└── src/
    ├── main.rs            # wiring and startup
    ├── config.rs
    ├── handler/order.rs   # axum handler
    ├── service/order.rs   # business logic; defines the OrderRepository trait
    ├── repository/{memory.rs,postgres.rs}
    └── model/order.rs
```

## clean (workspace)

```
.
├── Cargo.toml                    # [workspace] members = ["crates/*"], resolver = "3"
├── crates/
│   ├── domain/                   # depends on: nothing (thiserror at most)
│   │   └── src/{lib.rs,order.rs,error.rs}
│   ├── application/              # depends on: domain
│   │   └── src/{lib.rs,ports.rs,create_order.rs,get_order.rs}
│   ├── infrastructure/           # depends on: domain, application, sqlx
│   │   └── src/{lib.rs,memory.rs,postgres.rs,clock.rs,id.rs}
│   └── api/                      # bin; depends on: everything + axum, tokio
│       ├── src/{main.rs,routes.rs,error.rs,dto.rs}
│       └── tests/orders.rs
├── migrations/0001_create_orders.sql
└── Makefile
```

The root `Cargo.toml`:
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
(`resolver = "3"` is for edition 2024; use `"2"` with 2021)

## hexagonal (workspace)

```
crates/
├── core/                 # domain + ports (traits) + services (use cases); no dependency on external I/O crates
│   └── src/{domain/,ports/{inbound.rs,outbound.rs},services/}
├── adapter-http/         # depends on: core, axum
├── adapter-postgres/     # depends on: core, sqlx
├── adapter-memory/       # depends on: core (for tests and local use)
└── app/                  # bin: wiring only
```

## modular-monolith (workspace)

```
crates/
├── modules/
│   ├── ordering/          # domain/application/infrastructure as mods inside
│   ├── ordering-api/      # only the public traits and DTOs for other modules
│   ├── inventory/
│   └── inventory-api/
├── platform/              # DB pool, event bus (tokio::sync::broadcast), configuration
└── app/                   # bin: merges each module's Router
```
Rule: `ordering` may depend on `inventory-api` but not on `inventory` (enforced by Cargo.toml).

## microservices (monorepo)

```
.
├── api/proto/<svc>/v1/*.proto
├── services/
│   ├── ordering/          # each service is a small clean workspace, or a single crate
│   │   ├── Cargo.toml
│   │   ├── build.rs       # tonic-build (for gRPC)
│   │   └── Dockerfile     # multi-stage with cargo-chef
│   └── inventory/
├── libs/telemetry/        # tracing / otel setup only; no domain code
├── deploy/docker-compose.yml
└── Cargo.toml             # root workspace (members = ["services/*", "libs/*"])
```
