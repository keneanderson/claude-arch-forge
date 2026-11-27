# Go sample code (clean architecture, Order example)

The layer responsibilities are the same in other patterns. Adapt the package names and paths to layouts.md.

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
	amount     int64 // smallest currency unit
	createdAt  time.Time
}

// NewOrder validates the invariants and creates an Order.
func NewOrder(id OrderID, customerID string, amount int64, now time.Time) (*Order, error) {
	if id == "" || customerID == "" {
		return nil, errors.Join(ErrInvalidOrder, errors.New("id and customerID are required"))
	}
	if amount <= 0 {
		return nil, errors.Join(ErrInvalidOrder, errors.New("amount must be positive"))
	}
	return &Order{id: id, customerID: customerID, amount: amount, createdAt: now}, nil
}

// Reconstruct is for restoring from the persistence layer (assumes validated data).
func Reconstruct(id OrderID, customerID string, amount int64, createdAt time.Time) *Order {
	return &Order{id: id, customerID: customerID, amount: amount, createdAt: createdAt}
}

func (o *Order) ID() OrderID          { return o.id }
func (o *Order) CustomerID() string   { return o.customerID }
func (o *Order) Amount() int64        { return o.amount }
func (o *Order) CreatedAt() time.Time { return o.createdAt }
```

## usecase/port.go and usecase/create_order.go

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

## usecase/create_order_test.go (table-driven + an in-test fake)

usecase tests do not import adapter implementations (that would violate the dependency rules). Keep fakes inside the test file.

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
			repo := newFakeOrderRepository() // a map-based fake in the same test file
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
(Import it as `nethttp "net/http"` because the package name `http` collides with the standard library. To avoid the collision, name the package `httpadapter`)

## internal/config/config.go (fail safe when settings are missing)

```go
// Env is the runtime environment. An unset or unknown value is treated as Production (so a forgotten setting never puts production into a simplified mode).
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

// IsLocal reports whether the environment may allow simplified behavior such as in-memory implementations.
func (c Config) IsLocal() bool { return c.Env == EnvLocal || c.Env == EnvTest }

func Load() (Config, error) {
	cfg := Config{Env: EnvProduction, Addr: getenv("ADDR", ":8080"), DatabaseURL: os.Getenv("DATABASE_URL")}
	switch Env(os.Getenv("APP_ENV")) {
	case EnvLocal:
		cfg.Env = EnvLocal
	case EnvTest:
		cfg.Env = EnvTest
	}
	// in production-equivalent environments, refuse to start without the required settings
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

## cmd/<app>/main.go (wiring and graceful shutdown)

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

	// Use the postgres implementation if DATABASE_URL is set. Fail startup if it cannot connect (never silently fall back to memory).
	// Use the in-memory implementation only when APP_ENV=local / test is set explicitly, and log that (config.Load rejects missing settings in production).
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

To avoid an external dependency for UUIDs, hex-encoding 16 bytes generated with `crypto/rand` is fine (so it builds without network).

## Makefile

```make
.PHONY: run gen build test lint fmt arch-lint vuln
run:       ; APP_ENV=local go run ./cmd/<app>
gen:       ; go tool sqlc generate          # only when using generators (oapi-codegen / buf likewise via go tool)
build:     ; go build ./...
test:      ; go test -race ./...
fmt:       ; gofmt -w .
lint:      ; go tool golangci-lint run      # golangci-lint on PATH may have been built with an older Go
arch-lint: ; go tool go-arch-lint check
vuln:      ; go tool govulncheck ./...
```

Set the `toolchain` line in go.mod to the latest patch version of the minor version used (e.g. `go 1.27.0` / `toolchain go1.27.4`). If govulncheck reports standard library vulnerabilities, fix them by raising the patch version.
