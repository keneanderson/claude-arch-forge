# Catalog of internal application architecture patterns

Each pattern is described as "when to choose it / when not to / dependency direction / typical directories / main risks".
For concrete per-language directories and code, see the `go-architecture` / `php-architecture` / `rust-architecture` skills.

---

## 1. Simple layered (Handler → Service → Repository)

- **Choose**: mostly CRUD, thin domain logic, a small team (1–3 people), short deadlines, PoCs / internal tools
- **Do not choose**: complex business rules, long-term operation with frequent spec changes, multiple input/output channels
- **Dependency direction**: `handler → service → repository → DB` (one way, top to bottom)
- **Risks**: the Service grows bloated (Fat Service), and the domain gets dragged along by the DB schema
- **Evolution path**: once the logic in the Service grows, migrate step by step to Clean / Hexagonal

## 2. Clean Architecture (Entities / Use Cases / Interface Adapters / Frameworks)

- **Choose**: moderately to highly complex business rules, testability matters, you want framework independence, 5+ years of operation
- **Do not choose**: simple CRUD (too much boilerplate), very short deadlines
- **Dependency direction**: outer → inner only. `infrastructure → adapter → usecase → domain`. domain depends on nothing
- **Boundary practice**: the usecase **owns the Repository/Gateway interfaces**, and infrastructure implements them (dependency inversion)
- **Risks**: redundant DTO conversion between layers; over-engineering for small teams

## 3. Hexagonal (Ports & Adapters)

- **Choose**: many input/output channels (HTTP + gRPC + queues + CLI), frequent swapping of external integrations, you want to stub externals in tests
- **Dependency direction**: `adapters (in/out) → ports → application core`. The core knows only the ports (interfaces/traits)
- **Difference from Clean**: the focus is not the number of layers but the split into inside (core) / outside (adapters) and explicit ports. In practice they can be treated as nearly the same, but splitting directories into `ports/`, `adapters/inbound` and `adapters/outbound` is characteristic
- **Risks**: getting the port granularity wrong makes the number of interfaces explode

## 4. DDD (tactical design) + one of the above

- **Choose**: the domain is complex, dialogue with domain experts is needed, you want to grow a ubiquitous language
- **Elements**: Entity / Value Object / Aggregate / Domain Service / Domain Event / Repository / Factory
- **Combinations**: "DDD + Clean" and "DDD + Hexagonal" are the standard ones. DDD alone is not a directory structure
- **Risks**: learning cost, transaction problems from wrong Aggregate boundaries

## 5. Modular monolith

- **Choose**: you want one deployment unit now while keeping a future move to microservices in view, 2–4 teams, several bounded contexts are visible
- **Structure**: each `modules/<context>/` is structured internally with Clean/Hexagonal. Modules talk **only through public APIs (facades / interfaces) or events**. Never import another module's internal packages directly
- **Data**: even with one DB, separate schemas (or table prefixes) per module, and do not JOIN other modules' tables
- **Enforcement**: Go = `internal/` + go-arch-lint / depguard, PHP = deptrac, Rust = workspace crate splitting (enforced by the compiler)
- **Risks**: if boundary discipline breaks down, it becomes "spaghetti that just isn't distributed"

## 6. Vertical slice

- **Choose**: features are highly independent, teams own features, implementation complexity varies greatly between use cases
- **Structure**: slice vertically by feature, as in `features/<feature>/{handler,command,query,repository}`
- **Risks**: duplicated shared logic, cross-cutting rules scattered around

## 7. CQRS

- **Choose**: reads and writes differ greatly in load and model (e.g. 100:1 reads), complex search screens, using read-only replicas
- **Stages**: ① separate the command/query handlers in code (lightweight CQRS) → ② separate the read model/DB → ③ sync through events
- **Risks**: from ② on, handling eventual consistency becomes mandatory. ① is often enough

## 8. Event sourcing

- **Choose**: an audit trail is a legal requirement, or replaying state over time is needed (finance, inventory, reservations)
- **Do not choose**: without those requirements, almost never (the complexity is very high)
- **Combinations**: assumes it goes together with CQRS

## 9. Event-driven (asynchronous messaging)

- **Choose**: decoupling processing, absorbing spikes, long-running processing, fan-out to several services
- **Elements**: the Outbox pattern (atomic DB updates and event publishing), idempotent consumers, DLQs
- **Risks**: debugging and tracing are hard. Add distributed tracing (OpenTelemetry) from the start

## 10. Serverless / FaaS

- **Choose**: intermittent traffic, almost no operations staff, mostly event-triggered
- **Note**: keeping the internal structure hexagonal makes it easy to swap the runtime (Lambda / Cloud Run functions)
- **Language fit**: Go and Rust have fast cold starts and fit well. PHP is possible with Bref (Lambda) and the like

---

## 11. How to split packages (by layer / by feature)

A separate axis from the internal patterns (1–6). **Even with the same Clean Architecture, whether the top level is layers or features** changes clarity and the locality of changes. Always compare them for each option, and write example trees for both and the reason for the choice.

| Split | Tree (Go example) | Suited for | Watch out for |
|---|---|---|---|
| By layer (by-layer) | `internal/{domain,usecase,adapter,infrastructure}/<feature>.go` | few features (up to ~5), wanting the team to absorb the layer conventions, mostly CRUD | adding a feature scatters it across every layer directory; deleting or splitting by feature is hard |
| By feature (by-feature) | `internal/<feature>/{domain,usecase,adapter,infrastructure}/` | many features/contexts, extracting modules or services later, teams owning features | decide where code shared across features goes (the `platform` allowlist); rules for references between features are needed |
| hybrid | split by feature, with only cross-cutting concerns (DB connections, logger, HTTP server, middleware) in `internal/platform/` | the standard form of a modular monolith | never put domain code in `platform`. Write the allowlist in `platform.allow` in decision.json |

- **Typical combinations**: layered + by-layer is natural. A modular monolith is by-feature (= modules) or hybrid. A vertical slice is by-feature by definition
- **Build units and deployment units**: for a layout that builds several entrypoints (`cmd/api`, `cmd/worker`) from one go.mod (composer.json / Cargo workspace), such as an API and a worker, state the scope of the shared packages (`platform`, `config`) and which modules each entrypoint wires
- Write the chosen split in `packaging` in decision.json (by-layer / by-feature / hybrid)

---

## Pattern quick reference

| Situation | Recommended internal pattern |
|---|---|
| Mostly CRUD, small, short deadline | Simple layered |
| Moderate business rules, long-term operation | Clean or Hexagonal |
| Many input/output channels | Hexagonal |
| Complex domain, experts available | DDD + Clean/Hexagonal |
| Several contexts, splitting later | Modular monolith (Clean inside each module) |
| Highly independent features | Vertical slice |
| Asymmetric reads and writes | The above + lightweight CQRS |
| Audit or replay over time required | CQRS + event sourcing |
