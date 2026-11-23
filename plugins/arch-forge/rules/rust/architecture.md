---
paths:
  - "**/*.rs"
  - "**/Cargo.toml"
---
# Rust のアーキテクチャ規約

> [../common/architecture.md](../common/architecture.md) を Rust に当てはめた規約です。

## 構成

- clean / hexagonal / DDD では、層を Cargo workspace の crate で分ける。依存方向は `Cargo.toml` の `[dependencies]` で強制する
- 単一 crate（layered / vertical-slice）では `pub(crate)` で可視性を絞る
- port は application / domain crate に trait で定義し、infrastructure crate で実装する
- バイナリ crate（api / app）は配線と起動だけを行う

## 依存

- domain crate の `Cargo.toml` に axum、sqlx、tokio、reqwest、tonic、diesel、sea-orm などを追加しない
- 内側の crate から外側の crate（infrastructure、api、adapter-*）への依存を追加しない
- モジュラーモノリス: モジュール crate 同士は `<module>-api` crate 経由でのみ依存する
- 共通の依存は `[workspace.dependencies]` で版を揃える

## コード

- ライブラリ crate のエラーは `thiserror` の列挙型で表す。`anyhow` はバイナリ crate だけで使う
- HTTP ステータスへの変換は api crate の `IntoResponse` 実装だけで行う
- `unwrap()` / `expect()` を本番コードのエラー処理に使わない（起動時の設定読み込みを除く）
- 状態の共有は `Arc<AppState>`。グローバルな可変状態を使わない

## 検証

```
cargo fmt --all -- --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace
```
