---
name: go-architecture
description: Architecture implementation conventions for Go. Directory layouts per pattern (layered / clean / hexagonal / DDD / modular monolith / microservices), how to write dependency inversion, DI, error handling, tests, dependency direction checks with go-arch-lint, and the differences between net/http, chi, echo and gin. Use when deciding, generating or reviewing the structure of a Go project.
user-invocable: false
---

# Go architecture conventions

Read and use `${CLAUDE_SKILL_DIR}/references/layouts.md` for the detailed directory trees,
and `${CLAUDE_SKILL_DIR}/references/samples.md` for sample code per layer.

## Basic policy

- **Go version**: check with `go version` at generation time, and use the latest installed stable version for the `go` directive in `go.mod` (warn if below 1.22, because ServeMux pattern routing is used). In the `toolchain` line, write the latest patch version of that minor version (`https://go.dev/dl/?mode=json`). If `go version` fails, look for the real binary in goenv / asdf and the like with `bash <pluginRoot>/scripts/detect-toolchains.sh`
- **Environment and configuration**: if `APP_ENV` is unset or unknown, treat it as production, and use in-memory implementations only with `APP_ENV=local` / `test` (the config in samples.md)
- **Package split**: `packaging` in decision.json. by-layer is `internal/<layer>/`, by-feature is `internal/<feature>/<layer>/` (`internal/modules/<module>/<layer>/` for a modular monolith)
- **Entrypoints**: `cmd/<binary>/main.go`. main only does wiring (loading settings, DI, starting the server, graceful shutdown)
- **Keeping things private**: put the application itself under `internal/`, so the compiler forbids imports from outside
- **Interfaces are defined by the consumer** (the usecase / application layer owns the Repository interface, and infrastructure implements it). Keep them small
- **DI**: manual constructor injection in main as a rule. If wiring gets painful, for example beyond 30 dependencies, consider google/wire (not at the start)
- **context**: functions doing I/O take `ctx context.Context` as the first parameter
- **Errors**: define domain errors as sentinel values `var ErrXxx = errors.New(...)` or types, and wrap with `fmt.Errorf("...: %w", err)`. Convert to HTTP status only in the handler layer
- **Logging**: the standard `log/slog` (JSON handler). Inject the logger as a dependency
- **Configuration**: `internal/config`, read from environment variables. No external library is required
- **HTTP**: standard `net/http` by default (`mux.HandleFunc("GET /orders/{id}", h)` + `r.PathValue("id")`). chi if there is a lot of middleware, echo if the team knows it
- **gRPC / service-to-service**: connect-go (supports both HTTP/1.1 and gRPC, generated with buf) as the first choice, grpc-go if there are existing assets
- **DB**: PostgreSQL + pgx/v5. Generate queries with sqlc (`db/query/*.sql` → `internal/infrastructure/postgres/sqlc`). Migrations with goose or golang-migrate
- **Tests**: standard `testing` + table-driven. Test usecases with in-memory Repository implementations. Test handlers with `httptest`
- **Lint**: golangci-lint (`.golangci.yml`). Check dependency direction with go-arch-lint (`.go-arch-lint.yml`) or golangci-lint's depguard

## Framework-specific differences

Follow `framework` / `libraries` in decision.json. samples.md is the standard `net/http` + sqlc version, so if something else is chosen, swap **only the adapter (handlers, router) and infrastructure**, keeping the same code for domain / usecase. The selection criteria are in `references/frameworks.md` of the `architecture-patterns` skill.

| framework | Routing | Path parameters | Notes for the handler layer |
|---|---|---|---|
| net/http | `mux.HandleFunc("GET /orders/{id}", h)` | `r.PathValue("id")` | — |
| chi | `r.Get("/orders/{id}", h)`, group with `r.Route` | `chi.URLParam(r, "id")` | `http.Handler`-compatible, so standard middleware works |
| echo | `e.GET("/orders/:id", h)` (`func(c echo.Context) error`) | `c.Param("id")` | convert errors to `echo.HTTPError`. Do not pass `echo.Context` to the usecase |
| gin | `r.GET("/orders/:id", h)` (`func(c *gin.Context)`) | `c.Param("id")` | do not pass `gin.Context` to the usecase. Pass `c.Request.Context()` |

When the DB layer uses ent / GORM, also keep the generated models inside infrastructure, and convert to domain Entities inside the Repository implementation.

## Pattern → directories (summary)

| Pattern | Main directories |
|---|---|
| layered | `internal/{handler,service,repository,model}` |
| clean | `internal/{domain,usecase,adapter/{http,repository},infrastructure}` |
| hexagonal | `internal/{core/{domain,port,service},adapter/{inbound/http,outbound/postgres}}` |
| ddd-clean / ddd-hexagonal | split `domain` above into `domain/<aggregate>/`, holding Entity / ValueObject / Repository interface / DomainEvent |
| vertical-slice | `internal/feature/<feature>/{handler.go,command.go,query.go,store.go}` |
| modular-monolith | one of the above per `internal/modules/<module>/` + `internal/modules/<module>/api.go` (the public facade). Other modules reference only the facade |
| microservices | `services/<svc>/` (each with its own `go.mod`) + a root `go.work`, with contracts in `api/proto` |

## Dependency direction check (required)

Generate `.go-arch-lint.yml` declaring the layer dependency rules. Start from **the verified templates bundled with the plugin** (`<pluginRoot>/templates/go/`, the table at the end of layouts.md), changing only paths and component names.
Pin the tool version and manage it with the tool directive in go.mod (Go 1.24+): `go get -tool github.com/fe3dback/go-arch-lint@<latest stable tag>`.
Verification command: `go tool go-arch-lint check` (if it cannot be fetched without network, substitute a grep of the imports and say so).
`_test.go` files in external test packages (`package usecase_test`) are also checked by go-arch-lint. Tests follow the dependency rules too (usecase tests do not import outer layer implementations; they use fakes inside the test files). To allow imports between subpackages of the same layer and external test packages, every component in the templates includes itself in `mayDependOn` (do not remove it).

## Required checks after generation

```
gofmt -l . | (! grep .)     # no unformatted files
go vet ./...
go build ./...
go test ./...
```
