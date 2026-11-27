---
paths:
  - "**/*.rs"
  - "**/Cargo.toml"
---
# Rust architecture conventions

> Applies [../common/architecture.md](../common/architecture.md) to Rust.

## Structure

- In clean / hexagonal / DDD, split the layers into crates in a Cargo workspace. Enforce the dependency direction with `[dependencies]` in `Cargo.toml`
- In a single crate (layered / vertical-slice), narrow visibility with `pub(crate)`
- Define ports as traits in the application / domain crates, and implement them in the infrastructure crate
- The binary crate (api / app) only does wiring and startup

## Dependencies

- Do not add axum, sqlx, tokio, reqwest, tonic, diesel, sea-orm and the like to the domain crate's `Cargo.toml`
- Do not add dependencies from inner crates to outer crates (infrastructure, api, adapter-*)
- Modular monolith: module crates depend on each other only through `<module>-api` crates
- Align shared dependency versions with `[workspace.dependencies]`

## Code

- Library crates represent errors with `thiserror` enums. Use `anyhow` only in binary crates
- Convert to HTTP status only in the api crate's `IntoResponse` implementations
- Do not use `unwrap()` / `expect()` for error handling in production code (except loading settings at startup)
- Share state with `Arc<AppState>`. No global mutable state

## Verification

```
cargo fmt --all -- --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace
```
