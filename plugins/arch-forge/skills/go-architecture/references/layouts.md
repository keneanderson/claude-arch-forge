# Go directory layout reference

`<app>` is the binary name and `<module>` is the module path in `go.mod`. The sample feature uses Order (CreateOrder / GetOrder) as the example.
In actual generation, replace it with `sampleFeature` from decision.json.

## layered

```
.
├── cmd/<app>/main.go
├── internal/
│   ├── config/config.go
│   ├── handler/order_handler.go        # HTTP ⇄ service, DTO conversion, status codes
│   ├── service/order_service.go        # business logic; the repository interface is defined here
│   ├── repository/
│   │   ├── memory/order_repository.go
│   │   └── postgres/order_repository.go
│   └── model/order.go
├── db/migrations/0001_create_orders.sql
├── go.mod
└── Makefile
```
Dependencies: `handler → service → model`, `repository/* → service(interface), model`

## clean

```
.
├── cmd/<app>/main.go                  # wiring only
├── internal/
│   ├── domain/
│   │   ├── order.go                   # Entity (the constructor enforces invariants)
│   │   ├── order_id.go                # Value Object
│   │   └── errors.go                  # ErrOrderNotFound and friends
│   ├── usecase/
│   │   ├── port.go                    # OrderRepository / Clock / IDGenerator interface
│   │   ├── create_order.go            # input DTO → domain operation → output DTO
│   │   ├── create_order_test.go
│   │   └── get_order.go
│   ├── adapter/
│   │   ├── http/
│   │   │   ├── router.go
│   │   │   ├── order_handler.go
│   │   │   └── order_handler_test.go
│   │   └── repository/
│   │       ├── memory/order_repository.go
│   │       └── postgres/order_repository.go
│   ├── infrastructure/
│   │   ├── postgres/db.go             # creates the pgxpool
│   │   └── server/server.go           # http.Server and graceful shutdown
│   └── config/config.go
├── db/{migrations,query}/
├── .go-arch-lint.yml
├── .golangci.yml
├── go.mod
└── Makefile
```
Dependencies: `adapter → usecase → domain`, `infrastructure → (adapter, usecase)`, `domain → none`

## hexagonal

```
internal/
├── core/
│   ├── domain/order.go
│   ├── port/
│   │   ├── inbound.go     # type OrderService interface { Create(...); Get(...) }
│   │   └── outbound.go    # type OrderRepository interface {...}; type EventPublisher interface {...}
│   └── service/order_service.go   # implements the inbound port; depends only on outbound ports
└── adapter/
    ├── inbound/
    │   ├── http/order_handler.go   # calls the inbound port
    │   └── grpc/order_server.go    # (if needed)
    └── outbound/
        ├── postgres/order_repository.go
        ├── memory/order_repository.go
        └── nats/event_publisher.go
```
Dependencies: `adapter/inbound → core/port`, `adapter/outbound → core/port, core/domain`, `core/service → core/port, core/domain`

## ddd-clean (split per aggregate)

```
internal/
├── domain/
│   ├── order/
│   │   ├── order.go            # Aggregate Root
│   │   ├── line_item.go        # Entity inside the aggregate
│   │   ├── money.go            # Value Object
│   │   ├── repository.go       # Repository interface per aggregate (in DDD it lives in the domain layer)
│   │   └── events.go           # Domain Events such as OrderPlaced
│   └── shared/                 # shared Value Objects (carefully kept minimal)
├── application/
│   └── order/
│       ├── place_order.go      # use case (transaction boundary)
│       └── get_order.go
├── interfaces/http/order_handler.go
└── infrastructure/
    ├── persistence/postgres/order_repository.go
    └── messaging/outbox.go
```

## vertical-slice

```
internal/
├── feature/
│   ├── createorder/
│   │   ├── handler.go     # HTTP input/output
│   │   ├── command.go     # input validation and the processing itself
│   │   ├── store.go       # persistence interface and implementation for this feature only
│   │   └── handler_test.go
│   └── getorder/...
└── platform/              # only cross-cutting concerns such as DB connections, the logger and middleware
```

## modular-monolith

```
.
├── cmd/<app>/main.go
├── internal/
│   ├── modules/
│   │   ├── ordering/
│   │   │   ├── module.go          # New(deps) *Module; RegisterRoutes(mux); the public facade
│   │   │   ├── api.go             # public interfaces and DTOs for other modules (the only thing they may reference)
│   │   │   ├── domain/ usecase/ adapter/   # clean or similar inside
│   │   └── inventory/
│   │       ├── module.go
│   │       ├── api.go
│   │       └── ...
│   ├── platform/                  # DB, logger, eventbus(in-process), http server
│   └── config/
├── db/migrations/<module>/        # separate schema per module (ordering.orders, etc.)
└── .go-arch-lint.yml              # modules/<a>/** must not reference modules/<b>/ (except api.go)
```
Integration between modules: (1) inject the interfaces from `api.go` in main, or (2) in-process events through `platform/eventbus`.

## microservices (monorepo)

```
.
├── api/proto/<svc>/v1/*.proto     # generated with buf.yaml / buf.gen.yaml
├── services/
│   ├── ordering/                  # its own go.mod; one of the patterns above inside
│   │   ├── cmd/server/main.go
│   │   ├── internal/...
│   │   ├── Dockerfile
│   │   └── go.mod
│   └── inventory/...
├── pkg/                           # cross-cutting concerns only (otel setup, log configuration); no domain code
│   └── go.mod
├── deploy/docker-compose.yml
├── go.work                        # use ./services/ordering ./services/inventory ./pkg
└── Makefile                       # runs make build / test / lint for every service
```

## .go-arch-lint.yml

**Do not write it from scratch; use the verified templates bundled with the plugin** (the go-arch-lint v3 format is strict in the details, and a hand-written one may fail to load):

| Layout | Template |
|---|---|
| clean in a single module (rename for hexagonal) | `<pluginRoot>/templates/go/go-arch-lint.clean.yml` |
| modular monolith (clean inside each module; several entrypoints such as an API and a worker may share one go.mod) | `<pluginRoot>/templates/go/go-arch-lint.modular-monolith.yml` |

- The plugin's CI confirms both against the fixtures in `tests/go-arch-lint/`: "no violations in the correct layout" and "an injected violation is detected"
- `workdir: .` also covers `cmd/**`, and `cmd` has `anyProjectDeps: true` (it only does wiring)
- **deepScan** wrongly reports places where outer implementations are injected into usecase constructors as "a usecase → infrastructure dependency". As in the templates, set `deepScan: false` only for the usecase-like components that receive injection (not for everything)
- go-arch-lint does not check standard library imports. `net/http` and the like in domain are checked by the arch-forge hooks and `/arch-forge:check`
- Every component includes itself in `mayDependOn`. Otherwise, imports between subpackages of the same layer (`domain` → `domain/money`) and external test packages (`package domain_test`) are reported as violations
- domain, platform and config cannot depend on anything but themselves (platform may also depend on config)
