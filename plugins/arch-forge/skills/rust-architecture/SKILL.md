---
name: rust-architecture
description: Architecture implementation conventions for Rust. Enforcing dependency direction by splitting crates in a Cargo workspace, layouts for layered / clean / hexagonal / DDD / modular monolith / microservices, axum or actix-web with tokio and sqlx, ports as traits, error design (thiserror), and tests. Use when deciding, generating or reviewing the structure of a Rust project.
user-invocable: false
---

# Rust architecture conventions

Read and use `${CLAUDE_SKILL_DIR}/references/layouts.md` for the directory trees,
and `${CLAUDE_SKILL_DIR}/references/samples.md` for the sample code.

## Basic policy

- **Toolchain**: check with `rustc --version` / `cargo --version`. `edition = "2024"` (rustc 1.85 or later; if older, use 2021 and report it). You may pin the channel with `rust-toolchain.toml`
- **Let the compiler enforce the dependency direction**: clean / hexagonal / DDD express the layers by **splitting crates in a Cargo workspace**. The `domain` crate does not depend on other internal crates. A reverse dependency cannot be written in `Cargo.toml`, so no lint tool is needed
  - For small projects (layered / class S), splitting with `mod` inside one crate is fine. Narrow visibility with `pub(crate)` in that case
- **Async runtime**: tokio (`features = ["macros", "rt-multi-thread", "signal"]`)
- **HTTP**: axum (0.8 or later; path parameters use the `/orders/{id}` syntax). Middleware with tower / tower-http (trace, timeout, cors)
- **gRPC**: tonic + prost (generated from `api/proto` in `build.rs`)
- **DB**: sqlx (PostgreSQL; `query_as!` needs offline mode `cargo sqlx prepare`, so the initial generation uses the runtime-checked `query_as::<_, Row>()`)
- **Defining ports**: define traits in the application / domain crates and implement them in the infrastructure crate. Async methods take the form `fn save(&self, o: &Order) -> impl Future<Output = Result<(), RepoError>> + Send;` (RPITIT) and are taken as generics. Use `async-trait` only when `dyn` is needed
- **Sharing state**: `Arc<AppState>`. Handlers take `State<Arc<AppState<R>>>`
- **Errors**: library crates (domain / application) use `thiserror` enum errors; the binary crate (api) may use `anyhow`. Convert to HTTP status in the api crate's `IntoResponse` implementations
- **Logging / tracing**: `tracing` + `tracing-subscriber` (JSON). Add `opentelemetry` for microservices
- **Configuration**: a `Config` struct that reads environment variables (`envy` / `figment` if needed). If `APP_ENV` is unset or unknown, treat it as production, and use in-memory implementations only with `APP_ENV=local` / `test`. Exit with an error at startup if required settings are missing in production
- **Package split**: `packaging` in decision.json. by-layer splits per-layer crates (`crates/{domain,application,infrastructure,api}`) into feature modules inside, and by-feature uses a group of crates per feature (`crates/<feature>-{domain,application,...}`)
- **Tests**: unit-test the application crate with in-memory implementations (`#[tokio::test]`). Test the api crate's router with `tower::ServiceExt::oneshot`
- **Quality**: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, and dependency auditing with `cargo-deny` (optional)

## Framework-specific differences

Follow `framework` / `libraries` in decision.json. samples.md is the axum + sqlx version. The selection criteria are in `references/frameworks.md` of the `architecture-patterns` skill.

| framework | Routing | Sharing state | Tests |
|---|---|---|---|
| axum | `Router::new().route("/orders/{id}", get(h))` | `State<Arc<AppState<R>>>` | `tower::ServiceExt::oneshot` |
| actix-web | `App::new().service(web::resource("/orders/{id}").route(web::get().to(h)))`, with `#[actix_web::main]` as the entry | `web::Data<AppState<R>>` | `actix_web::test::init_service` + `call_service` |

actix-web cannot use tower-http middleware, so replace trace / CORS with `actix-web`'s `Logger` and `actix-cors` (or `tracing-actix-web`).
When the DB layer uses SeaORM / diesel, also keep Entities and schema types inside the infrastructure crate, and convert to domain types in the Repository implementation.

## Pattern → structure (summary)

| Pattern | Structure |
|---|---|
| layered | single crate: `src/{handler,service,repository,model}.rs` (or directories) |
| clean | workspace: `crates/{domain,application,infrastructure,api}` |
| hexagonal | workspace: `crates/{core (domain + ports + services),adapter-http,adapter-postgres,app (bin)}` |
| ddd-* | split the inside of the clean / hexagonal domain crate into `order/{aggregate.rs,value_objects.rs,events.rs,repository.rs}` |
| vertical-slice | single crate: `src/features/<feature>/{mod.rs,handler.rs,command.rs,store.rs}` |
| modular-monolith | workspace: `crates/modules/<module>` (each module exposes only its `pub` API) + `crates/platform` + `crates/app` (bin). Module crates depend on each other only through `<module>-api` crates |
| microservices | an independent workspace per `services/<svc>/`, or members of a root workspace. Contracts in `api/proto` |

## Required checks after generation

```
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
cargo test --workspace
```
If crates.io cannot be reached without network, try `cargo check --offline`, and if that fails, report it as not verified.
