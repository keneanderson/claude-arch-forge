# Choosing frameworks and major libraries

Choose for each unit (independent deployment unit), **per role** (HTTP / RPC / DB access / migration / messaging / test).
The domain layer does not depend on any framework, so a framework's influence stays within the adapter / infrastructure layers.
Switching is still expensive, so record the reasons for the choice, the runner-up and the reasons for rejection in the ADR.

## 1. Selection procedure

1. **Check the constraints**: "technology stack preferences and constraints" in the brief (internal standards, team experience, mandated libraries) come first. If there are constraints, adopt them and write only your concerns
2. **List the required capabilities**: public interfaces (REST / gRPC / GraphQL / WebSocket / SSE), admin console, jobs and queues, authentication, file uploads, internationalization
3. **Narrow down to 2–3 candidates**: those matching "When to choose" in the per-language catalog below. Consider anything outside the catalog only if the requirements need it
4. **Compare on the evaluation axes** (table below). Set the weights from the top quality attributes in the requirements
5. **Check the maintenance status**: check each candidate's latest release date, archive status and security response with WebSearch / WebFetch, and write the source URLs. Drop candidates whose last release is more than 12 months old, or that are archived
6. **Decide and record**: for each role, write "chosen / runner-up / reason for the choice / why not the runner-up"

## 2. Evaluation axes

| Axis | What to look at |
|---|---|
| Requirements fit | Are the required capabilities available as standard or through maintained extensions |
| Architecture fit | How easy is it to isolate the domain (DI, how invasive its own Context is, whether the ORM is Active Record or Data Mapper) |
| Team fit | The team's experience, learning cost, how easy it is to find people in the hiring market |
| Maintenance status | Release frequency, number of maintainers, LTS and support periods, speed of security fixes |
| Performance and resources | Does it meet the performance scenarios in the requirements (in most business apps the DB dominates, so do not make it the deciding factor) |
| Lock-in | Is it compatible with standard interfaces (Go: `net/http`, PHP: PSR-7/15, Rust: tower), and how easy is it to replace |
| Generation support | Can arch-forge scaffold and verify it (the "Gen" column in the tables below) |

## 3. Per-language catalog

"Gen" column: ◎ = sample code exists, ○ = can be generated following the conventions (written as a diff from the samples), × = not a generation target (if chosen, the scaffolder writes only a minimal setup by hand and reports it as unverified)

### Go

| Role | Candidate | When to choose | Watch out for | Gen |
|---|---|---|---|---|
| HTTP | standard `net/http` (1.22+) | you want minimal dependencies; simple routing | fill in middleware yourself or with small libraries | ◎ |
| HTTP | chi | you want middleware and route grouping while staying `net/http`-compatible | fewer features; validation needs a separate library | ○ |
| HTTP | echo | you want binding, validation and error handlers included | its own `echo.Context`; keep it inside the handler layer | ○ |
| HTTP | gin | the team knows gin; easy to hire experienced people | its own `gin.Context`; keep it inside the handler layer | ○ |
| HTTP | fiber | only if fasthttp performance is required by the requirements | not `net/http`-compatible, so standard middleware and instrumentation cannot be used | × |
| RPC | connect-go (buf) | new gRPC; you also want calls from browsers and HTTP/1.1 | interoperates with existing grpc-go assets | ○ |
| RPC | grpc-go | existing gRPC assets, using its interceptors | — | ○ |
| DB | sqlc + pgx | a team that can write SQL; type-safe and fast | build dynamic queries separately | ◎ |
| DB | ent | schema-driven, many graph-like relations | do not use the generated code as the domain model; convert in the Repository | ○ |
| DB | GORM | prioritizing the team's experience, mostly CRUD | Active Record-like and leaks into the domain easily; outside layered, keep it inside the Repository | ○ |
| Migration | goose / golang-migrate / Atlas | goose or golang-migrate for managing SQL files, Atlas for declarative management | — | ○ |
| Messaging | nats.go / franz-go (Kafka) / cloud SDKs | match the broker; watermill if you need an abstraction | — | ○ |
| Test | `testing` + testcontainers-go | the standard library is enough; testify for assertions is optional | — | ◎ |

### PHP

| Role | Candidate | When to choose | Watch out for | Gen |
|---|---|---|---|---|
| Framework | Laravel | web apps with screens and admin consoles, fast feature development, many experienced people | Facades and Eloquent leak into the domain easily; in clean / DDD, separate the domain into `src/` | ◎ |
| Framework | Symfony | long-lived business systems, hexagonal / DDD, running on an LTS version | lots of initial configuration; fits well with Doctrine (Data Mapper) | ○ |
| Framework | Slim 4 + PHP-DI | small APIs and microservices, minimal framework dependency | choose authentication, validation and ORM yourself (PSR-7/15 compliant) | ○ |
| Framework | CakePHP / Laminas Mezzio and others | only with existing assets | — | × |
| ORM | Eloquent / Doctrine ORM / PDO or Doctrine DBAL | Eloquent for Laravel, Doctrine for Symfony, DBAL or PDO for Slim | keep Eloquent Models inside the Infrastructure layer and convert to Entities | ○ |
| Runtime | PHP-FPM / FrankenPHP / Laravel Octane (Swoole, RoadRunner) | consider a long-running runtime only with strict performance requirements | with long-running runtimes, watch for global state and memory leaks | ○ |
| Queue | Laravel Queue (Horizon) / Symfony Messenger | match the framework | — | ○ |
| Test and static analysis | Pest / PHPUnit, PHPStan (Larastan for Laravel), deptrac | Pest for Laravel, PHPUnit by default otherwise | — | ◎ |

### Rust

| Role | Candidate | When to choose | Watch out for | Gen |
|---|---|---|---|---|
| HTTP | axum | the default; the tokio and tower ecosystem, type-safe extractors | — | ◎ |
| HTTP | actix-web | the team knows actix; you want its mature feature set | tower middleware cannot be used as is; it has its own runtime conventions | ○ |
| HTTP | poem / rocket / warp and others | only if a specific feature (such as automatic OpenAPI generation) is required | fewer adoption examples and less information | × |
| RPC | tonic + prost | gRPC | generate from `api/proto` in `build.rs` | ○ |
| DB | sqlx | a team that can write SQL, async, lightweight | compile-time checks (`query!`) need offline mode set up | ◎ |
| DB | SeaORM | you want an ORM, many dynamic queries | do not use Entities as the domain model; convert in the Repository | ○ |
| DB | diesel (+ diesel-async) | strong type safety, synchronous is fine | async needs diesel-async | ○ |
| Messaging | async-nats / rdkafka / lapin (RabbitMQ) | match the broker | rdkafka depends on a C library | ○ |
| Test | `#[tokio::test]` + testcontainers | the standard tools are enough | — | ◎ |

## 4. Guidelines for combinations

- **Fit with the pattern**: layered + Laravel / GORM is natural. When using an Active Record ORM (Eloquent, GORM) with clean / hexagonal / DDD, keep it inside the Repository implementation and accept the conversion cost
- **Microservices**: do not switch frameworks per service. As with the language, **unify as a rule** and write the reason for any exception. Choose ones with complete observability (OpenTelemetry) instrumentation
- **When in doubt**: Go is `net/http` + sqlc + pgx; PHP is Laravel if the requirements include screens, otherwise Symfony; Rust is axum + sqlx. Use these as the baseline, and write the reason when deviating

## 5. Output format (option documents and ADRs)

| Unit | Role | Chosen | Runner-up | Reason for the choice (axes) | Why not the runner-up | Maintenance status check (source) |
|---|---|---|---|---|---|---|

In decision.json, write `units[].framework` (the main framework) and `units[].libraries` (role → library name).
