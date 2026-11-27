---
name: check
description: Checks whether the current code follows the dependency rules in docs/architecture/decision.json and the ADRs, and reports violations (file:line, rule, suggested fix) to docs/architecture/07-conformance.md. Use after adding features or before a review, when asked to check for architecture violations.
argument-hint: "[path to check (the whole repository if omitted)]"
context: fork
agent: arch-forge:architecture-critic
allowed-tools: Read, Glob, Grep, Write, Bash
---

Check in conformance mode.

- Target: $ARGUMENTS (the whole repository if empty)
- Input: `docs/architecture/decision.json`, `docs/architecture/adr/*.md`, the root `AGENTS.md`, `.claude/rules/arch-forge/`
- If decision.json does not exist, return only "Confirm the architecture with `/arch-forge:design` first" and stop

Procedure:

1. Read the units, modules and patterns in decision.json, and list the expected directories and dependency rules
2. Run whatever language-specific mechanical checks are available (Go: go-arch-lint if `.go-arch-lint.yml` exists; PHP: `vendor/bin/deptrac analyse` if `deptrac.yaml` exists; Rust: check the dependencies in each crate's `Cargo.toml`)
3. Use Grep to look for violations the tools cannot detect (framework / DB library references from the domain layer, references into modules' non-public parts, domain models leaking into shared libraries)
4. Write the list of violations to `docs/architecture/07-conformance.md`, and return the number of violations, the top 3 serious ones and the checks that could not run
