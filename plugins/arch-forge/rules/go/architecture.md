---
paths:
  - "**/*.go"
  - "**/go.mod"
  - "**/go.work"
  - "**/.go-arch-lint.yml"
---
# Go architecture conventions

> Applies [../common/architecture.md](../common/architecture.md) to Go.

## Structure

- main (`cmd/<binary>/main.go`) only does wiring: loading settings, constructor injection, starting the server, graceful shutdown
- The application itself lives in `internal/`
- Interfaces are defined on the consuming side (usecase / application) and kept small. infrastructure implements them
- In `doc.go` at the top of each layer directory, write the layer's responsibility and which layers it may depend on. When you add a layer, write its `doc.go` too

## Dependencies

- domain does not import `net/http`, `database/sql`, pgx, ORMs, web frameworks or gRPC
- `_test.go` files in inner layers do not import outer implementations either (go-arch-lint checks them too, including external test packages)
- Modular monolith: import other modules only through `internal/modules/<module>` (the root package = the public API)
- Pin tools in go.mod with `go get -tool <pkg>@<version>` and run them with `go tool <name>`. Do not put `@latest` in the Makefile or CI

## Code

- Functions doing I/O take `ctx context.Context` as the first parameter
- Define domain errors as sentinel values or types, and wrap with `fmt.Errorf("...: %w", err)`. Convert to HTTP status only in the handlers
- Log with the injected `*slog.Logger`. Do not use a global logger
- If connection settings such as `DATABASE_URL` are present but the connection fails, fail startup. Never silently switch to an in-memory implementation

## Verification

```
gofmt -l . && go vet ./... && go build ./... && go test ./... && go tool go-arch-lint check
```
