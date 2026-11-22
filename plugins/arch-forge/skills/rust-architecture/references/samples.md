# Rust サンプルコード（clean workspace、Order の例）

## crates/domain/src/order.rs

```rust
use std::time::SystemTime;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct OrderId(String);

impl OrderId {
    pub fn new(value: impl Into<String>) -> Result<Self, DomainError> {
        let v = value.into();
        if v.is_empty() {
            return Err(DomainError::InvalidOrder("id is empty".into()));
        }
        Ok(Self(v))
    }
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone)]
pub struct Order {
    id: OrderId,
    customer_id: String,
    amount: i64,
    created_at: SystemTime,
}

impl Order {
    pub fn place(id: OrderId, customer_id: String, amount: i64, now: SystemTime) -> Result<Self, DomainError> {
        if customer_id.is_empty() {
            return Err(DomainError::InvalidOrder("customer_id is required".into()));
        }
        if amount <= 0 {
            return Err(DomainError::InvalidOrder("amount must be positive".into()));
        }
        Ok(Self { id, customer_id, amount, created_at: now })
    }

    pub fn id(&self) -> &OrderId { &self.id }
    pub fn customer_id(&self) -> &str { &self.customer_id }
    pub fn amount(&self) -> i64 { self.amount }
    pub fn created_at(&self) -> SystemTime { self.created_at }
}

#[derive(Debug, thiserror::Error)]
pub enum DomainError {
    #[error("invalid order: {0}")]
    InvalidOrder(String),
}
```

## crates/application/src/ports.rs

```rust
use std::future::Future;
use domain::{Order, OrderId};

#[derive(Debug, thiserror::Error)]
pub enum RepoError {
    #[error("not found")]
    NotFound,
    #[error("storage: {0}")]
    Storage(String),
}

pub trait OrderRepository: Send + Sync + 'static {
    fn save(&self, order: &Order) -> impl Future<Output = Result<(), RepoError>> + Send;
    fn find(&self, id: &OrderId) -> impl Future<Output = Result<Order, RepoError>> + Send;
}

pub trait IdGenerator: Send + Sync + 'static {
    fn next_id(&self) -> String;
}
```

## crates/application/src/create_order.rs

```rust
pub struct CreateOrderInput {
    pub customer_id: String,
    pub amount: i64,
}

#[derive(Debug, thiserror::Error)]
pub enum CreateOrderError {
    #[error(transparent)]
    Domain(#[from] domain::DomainError),
    #[error(transparent)]
    Repo(#[from] RepoError),
}

pub struct CreateOrder<R, I> {
    repo: R,
    ids: I,
}

impl<R: OrderRepository, I: IdGenerator> CreateOrder<R, I> {
    pub fn new(repo: R, ids: I) -> Self { Self { repo, ids } }

    pub async fn execute(&self, input: CreateOrderInput) -> Result<Order, CreateOrderError> {
        let order = Order::place(OrderId::new(self.ids.next_id())?, input.customer_id, input.amount, SystemTime::now())?;
        self.repo.save(&order).await?;
        Ok(order)
    }
}

#[cfg(test)]
mod tests {
    // インメモリ実装（Mutex<HashMap>）を使い、正常系と amount <= 0 の異常系を検証する
}
```
※ ユースケースに Repository を所有させる代わりに `Arc<R>` を共有してもよい。複数ユースケースで同じ Repository を使う場合は `R: Clone`（内部で `Arc`）にする。

## crates/api/src/routes.rs（axum 0.8）

```rust
pub fn router<R: OrderRepository + Clone, I: IdGenerator + Clone>(state: Arc<AppState<R, I>>) -> Router {
    Router::new()
        .route("/healthz", get(|| async { StatusCode::NO_CONTENT }))
        .route("/orders", post(create_order::<R, I>))
        .route("/orders/{id}", get(get_order::<R, I>))
        .with_state(state)
}

async fn get_order<R: OrderRepository + Clone, I: IdGenerator + Clone>(
    State(state): State<Arc<AppState<R, I>>>,
    Path(id): Path<String>,
) -> Result<Json<OrderResponse>, ApiError> {
    let order = state.get_order.execute(&id).await?;
    Ok(Json(OrderResponse::from(&order)))
}
```

## crates/api/src/error.rs

```rust
pub struct ApiError(StatusCode, String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(serde_json::json!({ "error": self.1 }))).into_response()
    }
}

impl From<CreateOrderError> for ApiError {
    fn from(e: CreateOrderError) -> Self {
        match e {
            CreateOrderError::Domain(e) => ApiError(StatusCode::UNPROCESSABLE_ENTITY, e.to_string()),
            CreateOrderError::Repo(_) => ApiError(StatusCode::INTERNAL_SERVER_ERROR, "internal error".into()),
        }
    }
}
```

## crates/api/src/main.rs（graceful shutdown）

```rust
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().json().with_env_filter(EnvFilter::from_default_env()).init();
    let repo = infrastructure::InMemoryOrderRepository::default();
    let state = Arc::new(AppState::new(repo, infrastructure::RandomIdGenerator));
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await?;
    axum::serve(listener, routes::router(state))
        .with_graceful_shutdown(async { let _ = tokio::signal::ctrl_c().await; })
        .await?;
    Ok(())
}
```

## crates/api/tests/orders.rs（ルーターの結合テスト）

```rust
#[tokio::test]
async fn create_then_get() {
    let app = router(test_state());
    let res = app.clone().oneshot(
        Request::post("/orders").header("content-type", "application/json")
            .body(Body::from(r#"{"customer_id":"c1","amount":1000}"#)).unwrap()
    ).await.unwrap();
    assert_eq!(res.status(), StatusCode::CREATED);
}
```
`tower = { version = "0.5", features = ["util"] }` と `http-body-util` を dev-dependencies に追加する。
