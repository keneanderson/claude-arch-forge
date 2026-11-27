# Service splitting guide (modular monolith / microservices)

## Prerequisite check for splitting (unless all are Yes, do not make microservices the first recommendation)

- [ ] There are teams that can own each service independently (roughly 1 service = 1 team, with one team owning at most about 3 services)
- [ ] You can operate CI/CD, containers and monitoring (log aggregation, metrics, tracing)
- [ ] The domain boundaries are reasonably stable (the requirements do not change drastically month to month)
- [ ] There are places where the business can accept eventual consistency
- [ ] The benefit of independent deployment and scaling outweighs the operational cost

## Finding boundaries

1. **An event-storming-style approach**: list domain events ("order was placed") from the user stories → arrange them in time order → find the aggregates and boundaries
2. **Language boundaries**: places where the same word means different things ("product" is a description in the catalog but a quantity in inventory) are context boundaries
3. **Reasons for change**: what changes together belongs in the same service; what changes for different reasons belongs in separate services
4. **Data ownership**: only one service has write access. If several services want to update the same table, the boundary is wrong
5. **Team structure (inverse Conway)**: organize teams to match the architecture you want

## A typical split (e-commerce)

| Service | Responsibilities | Owned data | Main communication |
|---|---|---|---|
| identity | authentication, members | users | sync (tokens verified locally as JWTs) |
| catalog | product information, search | products | read-heavy → cache / search engine |
| ordering | orders, payment orchestration | orders | Saga orchestrator |
| inventory | stock allocation | stock | subscribes to events (OrderPlaced) |
| notification | email, push | none (logs only) | event subscription only |

## Choosing the communication style

| Style | When to use it | Go | PHP | Rust |
|---|---|---|---|---|
| REST/JSON | public APIs, BFFs | net/http, chi | Laravel / Symfony | axum |
| gRPC / Connect | synchronous service-to-service calls, type-safe contracts | connect-go, grpc-go | spiral/roadrunner-grpc (limited) | tonic |
| Messaging | async, fan-out | NATS, Kafka (franz-go), Pub/Sub, SQS | Laravel Queue, Symfony Messenger | async-nats, rdkafka, lapin |

- Keep chains of synchronous calls to **at most 2 hops** as a guideline. If they get deeper, consider going async or merging services
- Keep contracts in `proto/` or `openapi/` and generate code from them (in a monorepo, an `api/` directory)

## Data consistency

- **Outbox pattern**: write to an `outbox` table in the same transaction as the business table update, and a relay publishes to the broker
- **Idempotent consumers**: deduplicate with `processed_messages(message_id)`
- **Saga**: for coordination across 3 or more services, orchestration (ordering coordinates) is recommended. Design the compensating transactions

## Monorepo layout (recommended for microservices)

```
.
├── api/                  # proto / OpenAPI contracts (the single source of truth)
├── services/
│   ├── <service-a>/      # each service builds and deploys independently
│   └── <service-b>/
├── pkg/ or libs/         # shared libraries (only cross-cutting concerns such as logging and tracing setup; never share the domain)
├── deploy/               # docker-compose, k8s manifests, terraform
├── docs/architecture/    # ADRs, C4 diagrams
└── Makefile
```

**Never put domain models in shared libraries** (a typical cause of a distributed monolith).

## Incremental migration (strangler fig)

When starting from a modular monolith, state the "split triggers" in the ADR:
- One module deploys 3 or more times as often as the others
- Only one module has 10× or more load, and you want separate scale-out units
- The owning teams split, and coordinating releases has become a bottleneck

When a trigger fires, turn that module's public interface into gRPC/HTTP, physically separate its DB schema, and extract it.
