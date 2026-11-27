---
name: architecture-patterns
description: Knowledge for choosing an application architecture. How to choose between layered / clean / hexagonal / DDD / modular monolith / microservices / CQRS / event-driven, scale classes (S/M/L/XL), criteria for splitting services, language fit (Go/PHP/Rust), and framework and library selection criteria. Use when comparing, proposing or reviewing architectures, or deciding whether to use microservices.
user-invocable: false
---

# Architecture selection knowledge

When proposing or reviewing an architecture, decide in the following order and write **the rationale from the requirements** for each decision.

1. **Scale class** — decide S/M/L/XL with the score table in Step 1 of [decision-matrix.md](references/decision-matrix.md). Always apply the adjustment rules
2. **Topology** — monolith / modular monolith / microservices. When splitting, follow the prerequisite check and how to find boundaries in [microservices.md](references/microservices.md)
3. **Internal pattern** — the quick reference in [patterns.md](references/patterns.md). Modules/services of different complexity may use different patterns. Also decide **how to split packages** (by layer / by feature / hybrid, section 11 of patterns.md)
4. **Language** — Step 3 of decision-matrix.md
5. **Framework and major libraries** — with the procedure in [frameworks.md](references/frameworks.md), choose per unit role (HTTP / RPC / DB / migration / messaging / test), keeping the runner-up and reasons for rejection. Concrete per-language structures are in the `go-architecture` / `php-architecture` / `rust-architecture` skills
6. **Proposal format** — Step 5 of decision-matrix.md (2–3 options, the recommendation + a simpler option, quality attribute ratings, evolution path)

Absolute paths of the reference files (open them with the Read tool):

- `${CLAUDE_SKILL_DIR}/references/patterns.md`
- `${CLAUDE_SKILL_DIR}/references/decision-matrix.md`
- `${CLAUDE_SKILL_DIR}/references/microservices.md`
- `${CLAUDE_SKILL_DIR}/references/frameworks.md`

## Principles

- **The simplest option that meets the requirements is the baseline.** Each time you add complexity, name at least one requirement that justifies it
- "We might need it in the future" is not a rationale. Instead, write **revisit triggers** (what would move you to the next stage) in the ADR
- Microservices are also an organizational and operational problem. Do not recommend them if the number of teams or operational capability falls short
- Define dependency direction rules **in a form tools can check mechanically** (Go: go-arch-lint / depguard, PHP: deptrac, Rust: crate splitting)
- **Fail safe when settings are missing**: the environment defaults to production-equivalent, and in-memory implementations, unencrypted connections and simplified modes are enabled only when a local environment is set explicitly
- Sources for library versions and maintenance status are limited to primary sources (package registries, OSV, GitHub Releases). Do not use aggregator sites or blogs
