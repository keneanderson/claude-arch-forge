# Decision matrix (requirements → scale class → topology → internal pattern)

## Step 1. Deciding the scale class

Score the following indicators (0–3 points each), and decide the scale class from the total. **For unknown indicators, state the estimate and its rationale explicitly**.

| Indicator | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| Number of development teams (1 team ≈ 3–8 people) | less than 1 team | 1 team | 2–3 teams | 4 or more teams |
| Number of candidate bounded contexts | 1 | 2–3 | 4–6 | 7 or more |
| Peak RPS | <50 | 50–500 | 500–5,000 | >5,000 |
| Load differences between components | uniform | some differences | some parts 10× or more | hotspots orders of magnitude apart |
| Need for independent deployment | none | monthly is enough | weekly, per team | daily, required per team |
| Availability / fault isolation | 99% is fine | 99.5% | 99.9%, partial feature outages acceptable | 99.95% or more, faults must be localized |
| Technology stack heterogeneity | single language | single language + scripts | another language is reasonable for some parts | multiple languages required |

| Total | Scale class | Recommended topology |
|---|---|---|
| 0–5 | **S** | Monolith |
| 6–10 | **M** | Modular monolith (draw boundaries that can be split later up front) |
| 11–15 | **L** | Modular monolith + extracting services only where needed (strangler) |
| 16–21 | **XL** | Microservices |

### Important adjustment rules

- **With 1 team or fewer, never make microservices the first recommendation, whatever the total** (the operational load exceeds the team's capacity). As an alternative, present "a modular monolith + separating only the one high-load component"
- **A new product at a stage of shallow domain understanding** is prone to wrong boundaries → propose one class lower, and write the criteria (triggers) for splitting in the ADR
- **If only 1–2 parts need independent scaling**, do not make everything microservices; make only those parts separate services / workers
- If regulations or compliance require data separation, separate only that boundary from the start

## Step 2. Decisions that come with each topology

| Decision | Monolith | Modular monolith | Microservices |
|---|---|---|---|
| Repository | single | single | monorepo recommended (teams with S–L experience) / polyrepo |
| DB | single | single DB, separate schemas | owned per service (no shared DB) |
| Communication between modules | function calls | public interfaces / in-process events | sync: gRPC/HTTP, async: message broker |
| Transactions | local | local (minimize cross-module) | Saga (orchestration or choreography) + Outbox |
| Observability | structured logging | structured logging + metrics | distributed tracing required (OpenTelemetry) |
| Authentication | in the app | in the app | consolidated in an API Gateway / BFF |

## Step 3. Language fit

| Aspect | Go | PHP | Rust |
|---|---|---|---|
| Strengths | API servers, microservices, CLIs, concurrency | web apps, admin consoles, CMSs, fast feature development | low latency and high throughput, required memory safety, embedded, WASM |
| Development speed | fast | fastest (framework ecosystem) | slower (steep learning curve) |
| Runtime performance | high | medium (improved with OPcache/FrankenPHP/Swoole) | highest |
| Ease of hiring | high | very high | low to medium |
| Enforcing the architecture | `internal/` + lint | deptrac | the compiler enforces it through crate splitting |
| Recommended frameworks/libraries | net/http (1.22+), chi, echo, connect-go, sqlc, pgx | Laravel, Symfony, Slim | axum, tokio, sqlx, tonic |

If the language is "undecided": recommend one from the requirements (performance, team skills, deadline, ecosystem) and show the comparison with the runner-up.
With microservices you may use different languages per service, but **use a single language as a rule**, and write the reason for any exception.

Choose frameworks and major libraries with the procedure and evaluation axes in [frameworks.md](frameworks.md) (the "Recommended frameworks/libraries" in the table above is a starting point).

## Step 4. Deciding the internal pattern

Use the quick reference in `patterns.md`. In a modular monolith / microservices, **the internal pattern may differ per module (service) according to its complexity**
(e.g. DDD + Clean for the ordering context, simple layered for the notification context).

## Step 5. How to present the proposal

- **2–3 options**. Always include "the recommended option" and "a simpler option"
- For each option: an overview diagram (Mermaid), a trade-off table, expected costs (learning, operations), points that could be reasons for rejection, the future evolution path
- Rate each quality attribute (performance, availability, modifiability, testability, security, operability, cost) with ◎○△×
