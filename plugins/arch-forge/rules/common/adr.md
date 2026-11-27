---
paths:
  - "docs/architecture/**"
---
# ADR practice

> Supplements "Change procedure" in [architecture.md](architecture.md).

## When to write one

- Changing layer, module or service boundaries
- Changing the language, framework, data store or communication style (sync / async)
- Making an exception to the dependency rules
- Changing decision.json

## How to write one

- File name: `docs/architecture/adr/NNNN-<kebab-case-title>.md` (the number is the current maximum + 1)
- Format: the same headings as the existing ADRs (Context / Options considered / Decision / Dependency rules / Consequences / Revisit triggers)
- Status: `Proposed` → `Accepted` once the user approves. The decider is the user (not Claude)
- At least two options considered, each with a one-line reason for rejection

## Immutability

- **Never rewrite an accepted ADR**. For anything beyond fixing typos, create a new ADR that supersedes it
- When superseding, change the old ADR's status to `Superseded by ADR-NNNN` and link from the new ADR to the old one
- When decision.json changes, record the number of the ADR explaining the change in the `adr` field
