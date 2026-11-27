# Architecture conventions (common)

This project's architecture is fixed by `docs/architecture/decision.json` and `docs/architecture/adr/`.
See `units/<unit>.md` for where each unit's layers live.

## Dependency rules

- Dependencies point inward: `adapter / infrastructure → usecase / application → domain`
- domain does not depend on frameworks, ORMs, DB drivers, HTTP or logger implementations (standard library and value objects only)
- When external I/O is needed, define a port (interface / trait) on the inner side, implement it on the outer side, and inject it at startup
- Tests follow the dependency rules too. Tests of inner layers do not import outer implementations. Keep test doubles inside the tests
- In a modular monolith, reference only other modules' public APIs (Go: the module's root package, PHP: `Contracts/`)
- In microservices, never reference another service's code or DB directly. Integrate through API contracts (`api/openapi`, `api/proto`) or events

## Change procedure

| What you want | Procedure |
|---|---|
| Add a use case | Build from the inside out: domain (if needed) → usecase and port → adapter → wiring → tests |
| Add an endpoint | Update the API contract first, and keep the adapter's handler to just calling the usecase |
| A new external service or DB | Define a port on the inner side → implement it in infrastructure → wire it. Never put it in domain |
| Change layer, module or service boundaries | **Write an ADR first** (see `adr.md`). Change decision.json together with the ADR |

## Forbidden

- Silencing dependency rule violations with `// TODO` or lint exclusions. If needed, record an exception in an ADR
- Putting domain models in "for now" shared packages (`common`, `util`, `shared`)
- Writing settings or secrets in code (read them from environment variables)
- Dangerous behavior when a setting is missing. The environment (`APP_ENV`) defaults to production-equivalent; in-memory implementations, unencrypted connections and simplified modes are enabled only when `APP_ENV=local` is set explicitly

## Checks

- After changing the structure, run `/arch-forge:check` and bring the violations in `docs/architecture/07-conformance.md` to 0
- Pass the dependency-direction lint (`make arch-lint`) under the same conditions as CI
