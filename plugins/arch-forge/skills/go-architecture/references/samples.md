# Go サンプルコード（clean アーキテクチャ、Order の例）

他パターンでも層の責務は同じ。パッケージ名とパスを layouts.md に合わせて読み替える。

## domain/order.go

```go
package domain

import (
	"errors"
	"time"
)

var (
	ErrOrderNotFound = errors.New("order not found")
	ErrInvalidOrder  = errors.New("invalid order")
)

type OrderID string

type Order struct {
	id         OrderID
	customerID string
	amount     int64 // 最小通貨単位
	createdAt  time.Time
}

// NewOrder は不変条件を検証して Order を生成する。
func NewOrder(id OrderID, customerID string, amount int64, now time.Time) (*Order, error) {
	if id == "" || customerID == "" {
		return nil, errors.Join(ErrInvalidOrder, errors.New("id and customerID are required"))
	}
	if amount <= 0 {
		return nil, errors.Join(ErrInvalidOrder, errors.New("amount must be positive"))
	}
	return &Order{id: id, customerID: customerID, amount: amount, createdAt: now}, nil
}

// Reconstruct は永続化層からの復元用（検証済みデータ前提）。
func Reconstruct(id OrderID, customerID string, amount int64, createdAt time.Time) *Order {
	return &Order{id: id, customerID: customerID, amount: amount, createdAt: createdAt}
}

func (o *Order) ID() OrderID          { return o.id }
func (o *Order) CustomerID() string   { return o.customerID }
func (o *Order) Amount() int64        { return o.amount }
func (o *Order) CreatedAt() time.Time { return o.createdAt }
```

## usecase/port.go と usecase/create_order.go

```go
package usecase

import (
	"context"
	"time"

	"<module>/internal/domain"
)

type OrderRepository interface {
	Save(ctx context.Context, o *domain.Order) error
	FindByID(ctx context.Context, id domain.OrderID) (*domain.Order, error)
}

type IDGenerator interface{ NewID() string }
type Clock interface{ Now() time.Time }
```

```go
package usecase

type CreateOrderInput struct {
	CustomerID string
	Amount     int64
}

type OrderOutput struct {
	ID         string
	CustomerID string
	Amount     int64
	CreatedAt  time.Time
}

type CreateOrder struct {
	repo  OrderRepository
	ids   IDGenerator
	clock Clock
}

func NewCreateOrder(repo OrderRepository, ids IDGenerator, clock Clock) *CreateOrder {
	return &CreateOrder{repo: repo, ids: ids, clock: clock}
}

func (uc *CreateOrder) Execute(ctx context.Context, in CreateOrderInput) (OrderOutput, error) {
	o, err := domain.NewOrder(domain.OrderID(uc.ids.NewID()), in.CustomerID, in.Amount, uc.clock.Now())
	if err != nil {
		return OrderOutput{}, err
	}
	if err := uc.repo.Save(ctx, o); err != nil {
		return OrderOutput{}, fmt.Errorf("save order: %w", err)
	}
	return toOutput(o), nil
}
```

## usecase/create_order_test.go（テーブル駆動 + テスト内フェイク）

usecase のテストは adapter の実装を import しない（依存ルール違反になる）。フェイクはテストファイル内に置く。

```go
func TestCreateOrder(t *testing.T) {
	tests := []struct {
		name    string
		in      usecase.CreateOrderInput
		wantErr error
	}{
		{"ok", usecase.CreateOrderInput{CustomerID: "c1", Amount: 1000}, nil},
		{"zero amount", usecase.CreateOrderInput{CustomerID: "c1", Amount: 0}, domain.ErrInvalidOrder},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := newFakeOrderRepository() // 同じテストファイル内の map ベースのフェイク
			uc := usecase.NewCreateOrder(repo, fixedID("o1"), fixedClock{})
			_, err := uc.Execute(context.Background(), tt.in)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("err = %v, want %v", err, tt.wantErr)
			}
		})
	}
}
```

## adapter/http/order_handler.go

```go
package http

type OrderHandler struct {
	create *usecase.CreateOrder
	get    *usecase.GetOrder
	log    *slog.Logger
}

func (h *OrderHandler) Register(mux *nethttp.ServeMux) {
	mux.HandleFunc("POST /orders", h.createOrder)
	mux.HandleFunc("GET /orders/{id}", h.getOrder)
}

func (h *OrderHandler) getOrder(w nethttp.ResponseWriter, r *nethttp.Request) {
	out, err := h.get.Execute(r.Context(), r.PathValue("id"))
	switch {
	case errors.Is(err, domain.ErrOrderNotFound):
		writeError(w, nethttp.StatusNotFound, err)
		return
	case err != nil:
		h.log.ErrorContext(r.Context(), "get order", "err", err)
		writeError(w, nethttp.StatusInternalServerError, errors.New("internal error"))
		return
	}
	writeJSON(w, nethttp.StatusOK, toResponse(out))
}
```
（パッケージ名 `http` と標準ライブラリが衝突するため `nethttp "net/http"` で import する。衝突を避けたい場合はパッケージ名を `httpadapter` にする）

## internal/config/config.go（設定漏れは安全側に倒す）

```go
// Env は実行環境。未設定・未知の値は Production として扱う（設定の書き忘れで本番が簡易モードにならないように）。
type Env string

const (
	EnvProduction Env = "production"
	EnvLocal      Env = "local"
	EnvTest       Env = "test"
)

type Config struct {
	Env         Env
	Addr        string
	DatabaseURL string
}

// IsLocal は、インメモリ実装などの簡易な動作を許してよい環境かを返す。
func (c Config) IsLocal() bool { return c.Env == EnvLocal || c.Env == EnvTest }

func Load() (Config, error) {
	cfg := Config{Env: EnvProduction, Addr: getenv("ADDR", ":8080"), DatabaseURL: os.Getenv("DATABASE_URL")}
	switch Env(os.Getenv("APP_ENV")) {
	case EnvLocal:
		cfg.Env = EnvLocal
	case EnvTest:
		cfg.Env = EnvTest
	}
	// 本番相当では必須設定が無ければ起動しない
	if !cfg.IsLocal() && cfg.DatabaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required (set APP_ENV=local to use the in-memory store for local development)")
	}
	return cfg, nil
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
```

## cmd/<app>/main.go（配線と graceful shutdown）

```go
func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg, err := config.Load()
	if err != nil {
		log.Error("load config", "err", err)
		os.Exit(1)
	}

	// DATABASE_URL があれば postgres 実装を使う。接続できなければ起動失敗にする（黙ってメモリに戻さない）。
	// インメモリ実装は APP_ENV=local / test を明示したときだけ使い、その旨をログに出す（config.Load が本番での未設定を拒否する）。
	repo, closeDB, err := infrastructure.NewOrderRepository(ctx, cfg.DatabaseURL, cfg.IsLocal(), log)
	if err != nil {
		log.Error("init repository", "err", err)
		os.Exit(1)
	}
	defer closeDB()
	ids, clock := infrastructure.UUIDGenerator{}, infrastructure.SystemClock{}

	mux := nethttp.NewServeMux()
	httpadapter.NewOrderHandler(
		usecase.NewCreateOrder(repo, ids, clock),
		usecase.NewGetOrder(repo),
		log,
	).Register(mux)
	mux.HandleFunc("GET /healthz", func(w nethttp.ResponseWriter, _ *nethttp.Request) { w.WriteHeader(204) })

	srv := &nethttp.Server{Addr: cfg.Addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}

	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, nethttp.ErrServerClosed) {
			log.Error("listen", "err", err)
			stop()
		}
	}()
	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}
```

UUID は外部依存を避けるなら `crypto/rand` で生成した 16 バイトを hex 化した実装でよい（ネットワーク無しでもビルドできるようにする）。

## Makefile

```make
.PHONY: run gen build test lint fmt arch-lint vuln
run:       ; APP_ENV=local go run ./cmd/<app>
gen:       ; go tool sqlc generate          # 生成ツールを使う場合だけ（oapi-codegen / buf も同様に go tool で）
build:     ; go build ./...
test:      ; go test -race ./...
fmt:       ; gofmt -w .
lint:      ; go tool golangci-lint run      # PATH の golangci-lint は古い Go でビルドされていることがある
arch-lint: ; go tool go-arch-lint check
vuln:      ; go tool govulncheck ./...
```

go.mod の `toolchain` 行は、使うマイナー版の最新パッチ版にする（例: `go 1.27.0` / `toolchain go1.27.4`）。govulncheck が標準ライブラリの脆弱性を出したら、パッチ版を上げて直す。
