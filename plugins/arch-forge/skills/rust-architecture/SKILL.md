---
name: rust-architecture
description: Rust でのアーキテクチャ実装規約。Cargo workspace の crate 分割による依存方向の強制、レイヤード / クリーン / ヘキサゴナル / DDD / モジュラーモノリス / マイクロサービスの構成、axum + tokio + sqlx、trait による port 定義、エラー設計（thiserror）、テスト。Rust プロジェクトの構成を決める・生成する・レビューするときに使う。 Rust architecture conventions (Cargo workspace crate split, axum or actix-web with tokio and sqlx, traits as ports, thiserror, tests).
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
- **設定**: 環境変数を読む `Config` 構造体（必要なら `envy` / `figment`）。`APP_ENV` が未設定・未知なら production として扱い、インメモリ実装は `APP_ENV=local` / `test` のときだけ使う。本番で必須設定が無ければ起動時にエラーで終了する
- **パッケージの分け方**: decision.json の `packaging`。by-layer は層ごとの crate（`crates/{domain,application,infrastructure,api}`）の中を機能のモジュールで分け、by-feature は機能ごとの crate 群（`crates/<feature>-{domain,application,...}`）にする
- **テスト**: application crate はインメモリ実装でユニットテスト（`#[tokio::test]`）。api crate は `tower::ServiceExt::oneshot` でルーターをテスト
- **品質**: `cargo fmt --check`、`cargo clippy --all-targets -- -D warnings`、依存監査は `cargo-deny`（任意）

## フレームワーク別の差分

decision.json の `framework` / `libraries` に従う。samples.md は axum + sqlx 版。選定基準は `architecture-patterns` スキルの `references/frameworks.md`。

| framework | ルーティング | 状態の共有 | テスト |
|---|---|---|---|
| axum | `Router::new().route("/orders/{id}", get(h))` | `State<Arc<AppState<R>>>` | `tower::ServiceExt::oneshot` |
| actix-web | `App::new().service(web::resource("/orders/{id}").route(web::get().to(h)))`、エントリは `#[actix_web::main]` | `web::Data<AppState<R>>` | `actix_web::test::init_service` + `call_service` |

actix-web では tower-http のミドルウェアを使えないので、trace / CORS は `actix-web` の `Logger`・`actix-cors`（または `tracing-actix-web`）で置き換える。
DB を SeaORM / diesel にした場合も、Entity・スキーマ型は infrastructure crate に閉じ込め、Repository 実装でドメインの型に変換する。

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
