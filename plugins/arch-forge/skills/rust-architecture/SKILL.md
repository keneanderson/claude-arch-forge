---
name: rust-architecture
description: Rust でのアーキテクチャ実装規約。Cargo workspace の crate 分割による依存方向の強制、レイヤード / クリーン / ヘキサゴナル / DDD / モジュラーモノリス / マイクロサービスの構成、axum + tokio + sqlx、trait による port 定義、エラー設計（thiserror）、テスト。Rust プロジェクトの構成を決める・生成する・レビューするときに使う。
user-invocable: false
---

# Rust アーキテクチャ規約

ディレクトリツリーは `${CLAUDE_SKILL_DIR}/references/layouts.md`、
サンプルコードは `${CLAUDE_SKILL_DIR}/references/samples.md` を Read して使う。

## 基本方針

- **ツールチェーン**: `rustc --version` / `cargo --version` で確認。`edition = "2024"`（rustc 1.85 以上。未満なら 2021 にして報告）。`rust-toolchain.toml` で channel を固定してよい
- **依存方向はコンパイラに強制させる**: clean / hexagonal / DDD は **Cargo workspace の crate 分割** で層を表現する。`domain` crate は他の内部 crate に依存しない。逆向きの依存は `Cargo.toml` に書けないので lint ツールは不要
  - 小規模（layered / S クラス）なら単一 crate 内の `mod` 分割でよい。その場合は `pub(crate)` で可視性を絞る
- **非同期ランタイム**: tokio（`features = ["macros", "rt-multi-thread", "signal"]`）
- **HTTP**: axum（0.8 系以降。パスパラメータは `/orders/{id}` 記法）。ミドルウェアは tower / tower-http（trace, timeout, cors）
- **gRPC**: tonic + prost（`build.rs` で `api/proto` から生成）
- **DB**: sqlx（PostgreSQL、`query_as!` はオフラインモード `cargo sqlx prepare` が必要なので、初期生成では実行時チェックの `query_as::<_, Row>()` を使う）
- **port の定義**: application / domain crate に trait を定義し、infrastructure crate で実装する。async メソッドは `fn save(&self, o: &Order) -> impl Future<Output = Result<(), RepoError>> + Send;` 形式（RPITIT）でジェネリクスとして受ける。`dyn` が必要な場合のみ `async-trait` を使う
- **状態の共有**: `Arc<AppState>`。ハンドラは `State<Arc<AppState<R>>>` で受ける
- **エラー**: ライブラリ crate（domain / application）は `thiserror` で列挙型エラー、バイナリ crate（api）は `anyhow` 可。HTTP ステータスへの変換は api crate の `IntoResponse` 実装で行う
- **ログ / トレース**: `tracing` + `tracing-subscriber`（JSON）。マイクロサービスでは `opentelemetry` を追加
- **設定**: 環境変数を読む `Config` 構造体（必要なら `envy` / `figment`）
- **テスト**: application crate はインメモリ実装でユニットテスト（`#[tokio::test]`）。api crate は `tower::ServiceExt::oneshot` でルーターをテスト
- **品質**: `cargo fmt --check`、`cargo clippy --all-targets -- -D warnings`、依存監査は `cargo-deny`（任意）

## パターン → 構成の対応（要約）

| パターン | 構成 |
|---|---|
| layered | 単一 crate: `src/{handler,service,repository,model}.rs`（またはディレクトリ） |
| clean | workspace: `crates/{domain,application,infrastructure,api}` |
| hexagonal | workspace: `crates/{core（domain + ports + services）,adapter-http,adapter-postgres,app（bin）}` |
| ddd-* | clean / hexagonal の domain crate 内を `order/{aggregate.rs,value_objects.rs,events.rs,repository.rs}` に分割 |
| vertical-slice | 単一 crate: `src/features/<feature>/{mod.rs,handler.rs,command.rs,store.rs}` |
| modular-monolith | workspace: `crates/modules/<module>`（各モジュールが `pub` API のみ公開）＋ `crates/platform` ＋ `crates/app`（bin）。モジュール crate 同士は `<module>-api` crate 経由でのみ依存 |
| microservices | `services/<svc>/` ごとに独立 workspace または ルート workspace の member。契約は `api/proto` |

## 生成後の必須チェック

```
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo build --workspace
cargo test --workspace
```
ネットワークが無く crates.io から取得できない場合は `cargo check --offline` を試し、失敗したら未検証である旨を報告する。
