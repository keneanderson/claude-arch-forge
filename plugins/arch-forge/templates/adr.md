# ADR-{{NUMBER}}: {{TITLE}}

- Status: Accepted
- Date: {{DATE}}
- Deciders: {{DECIDERS}}
- Related: [requirements](../01-requirements.md) / [proposal](../05-proposal.md) / [decision.json](../decision.json)

## Context

<!-- The problem to solve, key requirements and constraints, priority of quality attributes, the scale class and its rationale -->

## Options considered

| Option | Summary | Main advantages | Main drawbacks |
|---|---|---|---|
| A |  |  |  |
| B |  |  |  |
| C |  |  |  |

## Decision

<!-- The chosen option. Topology / internal pattern / language and framework / data stores / communication style -->

### Frameworks and major libraries

| Unit | Role | Chosen | Runner-up | Why chosen | Why not the runner-up |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

<!-- The date and source used to check maintenance status. Change frameworks with a new ADR -->

### Package split

<!-- By layer / by feature / hybrid and why. Why the other was not chosen. The allowlist of what may go in the shared package (platform) -->

### Build units and deployment units

<!-- Which deployment units (cmd/api, cmd/worker, etc.) share which build unit (go.mod, etc.). If none are shared, "each unit is independent" -->

### Diagram

```mermaid
flowchart LR
  %% C4 container-level diagram
```

### Dependency rules (checked mechanically)

<!-- e.g. domain depends on no other package / modules/<a> does not import modules/<b>/internal -->

### Implementation conventions

| ID | Convention | How it is checked (arch-lint / grep / test / review) |
|---|---|---|
| C1 |  |  |

### Environment and configuration defaults

<!-- Treat an unset or unknown APP_ENV as production. The conditions for enabling in-memory implementations and simplified modes -->

## Consequences

### What gets better

### What gets worse and the risks accepted

### Mitigations

## Revisit triggers

<!-- Conditions for reconsidering this decision. e.g. consider extracting a service if the ordering module deploys more than 3 times as often as the others -->
