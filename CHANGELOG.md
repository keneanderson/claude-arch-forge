# Changelog

## [0.4.1] - 2026-11-27

### Changed

- **English only**: the README, contributor docs (AGENTS.md / CLAUDE.md), skills, agents, rules, templates, workflow prompts, hook messages, scripts and tests are now in English. `README.en.md` was merged into `README.md`. Generated projects still follow the user's language; rules and CLAUDE.md are translated when copied into a non-English project
- The hook's accepted-ADR detection still matches Japanese status words, so ADRs already written in Japanese stay protected (covered by a test)
- validate: the check for English descriptions and the README.md / README.en.md sync check were replaced by an "English only" check (fails on CJK text outside that regex) and a check that README.md lists every user-invoked command

## [0.4.0] - 2026-11-23

Addresses 18 issues found in a trial that built a real application.

### Added

- **Toolchain detection** `scripts/detect-toolchains.sh`: besides PATH, looks for the real Go, PHP and Rust binaries in goenv / asdf / mise / `~/sdk` / `/usr/local/go` / Homebrew, and also shows `GOTOOLCHAIN` and the go / toolchain lines in go.mod. Uses the real binary even when go on PATH fails through a shim (no version set). Also shows the versions of auxiliary tools such as Docker Compose, golangci-lint (the Go version it was built with) and go-arch-lint. `--env` prints PATH and `--go-bin` prints the real go
  - The design / scaffold skills show this result at the start, and ask the user before generating if a language is "not found". The PATH found is passed to the scaffold workflow and subagents as `toolchainPath`
- **Library fact check**: the `stack-researcher` agent (sonnet) and the Facts phase of the propose workflow. Before designing options in parallel, it checks the latest version, the minimum version without known vulnerabilities (OSV) and the maintenance status once, using only primary sources (proxy.golang.org / packagist / crates.io, OSV, GitHub Releases), and writes `02b-stack-facts.md`. Every option and the review cite this table
- **Follow-up interview**: requirements-analyst returns high-impact unknowns whose answers change the options' premises as `blockingQuestions`. The propose workflow stops with `status: needs-input`, the design skill asks the questions, appends them to the brief, and re-runs with `clarified: true` (Step 3b)
- **Revision review**: when "I want adjustments" in Step 4 leads to a revision, architecture-critic's revision mode reviews only the diff (Step 4b)
- **Comparison-only options**: below scale L, unless microservices are recommended, option-c becomes comparison-only. The critic sets its verdict to `reference` and does not count it as critical / major. It is not revised either
- **Verified go-arch-lint templates** `templates/go/go-arch-lint.{clean,modular-monolith}.yml`, and the test `tests/go-arch-lint/run.sh` that confirms "no false positives, violations detected" against fixtures (run in validate and CI). deepScan is turned off only for the usecase-like components that receive injection
- **Hook self-check** `arch_hooks.py doctor`: shows decision.json loading, the injected context, recognition of the domain layer and detection of violations, and the targets of the strict pre-stop check. Run before the design / scaffold completion reports
- decision.json: `units[].entrypoint` (the entrypoint of units sharing a build unit), `units[].packaging` (by-layer / by-feature / hybrid), `units[].platform` (allowlist of shared packages), `modules[].cqrs`, root `conventions` (implementation conventions C1…), `scaffold.claudeSettings`, `scaffold.codegen`
- A "Claude Code settings" generation option (a permission allowlist for development commands and a read ban on `.env` in `.claude/settings.json`)
- architecture-patterns: criteria for "how to split packages (by layer / by feature / hybrid)". The proposal, options and ADR always have a section on it

### Changed

- **Shared build units**: the scaffold workflow treats units with the same `path` (such as an API and a worker) as one build unit. The first builds the shared parts and its own entrypoint, later ones only their own entrypoint, and verification and fixes run once for all of them. Units that share one must have distinct `entrypoint`s, and mixing languages is rejected
- **Safe defaults**: an unset or unknown `APP_ENV` is treated as production, and in-memory implementations, unencrypted connections and simplified modes are enabled only with `APP_ENV=local` / `test` (the three scaffolders, the Go config sample, rules, the critic's checks)
- **Code generation**: the Go scaffolder pins sqlc / oapi-codegen / buf and the like from `libraries` with `go get -tool`, runs `make gen` and wires them in. Libraries whose minimum version was decided in the design are actually used
- **Never weaken checks**: in the fix stages, passing by weakening tests, lint settings, dependency-direction settings or the minimum-version checks is forbidden; if needed it goes into unresolved for the user (workflow, scaffolders, verification skill, rules)
- Go: the `toolchain` line in go.mod gets the latest patch version. golangci-lint and govulncheck are also pinned and run with `go tool`
- Interview: quality attributes are asked as "the most important one" and "the second" separately (multiSelect was dropped)
- Document length limits: options 350 lines (comparison-only 150), review 250 lines, proposal 250 lines. Details go into appendices under `03-options/<option ID>/`. solution-architect gained Edit, and revisions fix only the relevant sections
- proposal-writer: the ADR path is fixed to `adr/0001-application-architecture.md`. sampleFeature names use only names that appear in the design documents
- foundation-builder: makes `docker compose config` pass with the local Docker Compose version. A shared build unit is listed only once in go.work / members
- Agent fallback: the design / scaffold skills describe how to proceed assuming Agent returns asynchronously (launch independent stages together in one message, then wait for the notifications before moving on)
- Every agent now states "write the final response and documents in the user's language"
- hooks: SessionStart includes the entrypoints, package splitting, shared build units and implementation conventions. PostToolUse assigns files under an entrypoint to that unit. Stop checks a shared build unit only once
- Skill `allowed-tools` now use the recommended space-separated form (`Bash(ls *)`)

### Fixed (found in a full v0.4.0 run)

A job search API (the same requirements as the previous trial) was run end to end through design → confirmation → scaffold, and the following were fixed.

- **Fix with a version file instead of rewriting PATH**: `export PATH=...`, `PATH=... go` and go by absolute path all require approval every time in Claude Code (go-arch-lint also calls go on PATH). detect-toolchains.sh shows how to fix goenv / asdf shims (`.go-version` / `.tool-versions`), and `--pin` prints what to write. design / scaffold place this file after confirming, and `toolchainPath` became the last resort
- **Do not read plugin files with Bash**: touching paths outside the project with `cat` / `cp` / `cd` is rejected, so copying the rules was changed to Read → Write (foundation-builder, /arch-forge:rules). Added an instruction to verification-before-completion to run simple Bash commands one at a time
- **go-arch-lint templates**: components did not include themselves in `mayDependOn`, so imports between subpackages of the same layer and external test packages (`package xxx_test`) were wrongly reported as violations. Added both to the fixtures. Fixed the wrong statement in the go-architecture skill that "`_test.go` is not checked by go-arch-lint"
- go-scaffolder: writes one startup-path test per entrypoint that goes through the same wiring as production (testing only the handlers with a separate router missed a bug that broke the WebSocket upgrade)
- design: decision.json is the source of truth for implementation convention IDs
- scaffold skill: added Write to allowed-tools to write the version file

## [0.3.0] - 2026-11-22

### Added

- **Framework and major library selection**
  - `skills/architecture-patterns/references/frameworks.md`: the selection procedure, evaluation axes (requirements fit, architecture fit, team fit, maintenance status, performance, lock-in, generation support), a per-role catalog for Go / PHP / Rust (HTTP / RPC / DB / migrations / messaging / testing) and generation support (◎○×)
  - solution-architect compares candidates per role and writes the choice, the runner-up, the reasons for rejection and the sources for maintenance status in each option
  - design: the interview asks for technology stack preferences and constraints. The framework can be changed at confirmation. After confirmation, Step 0b can revisit only the frameworks with a new ADR
  - Added `units[].libraries` (role → library) to decision.json
  - A "Frameworks and major libraries" section in the ADR template
  - "Framework-specific differences" in the language skills (Go: net/http / chi / echo / gin, Rust: axum / actix-web)
- **English descriptions**
  - `README.en.md` (same content as README.md). The plugin README became bilingual
  - English text in every agent and skill description. The plugin.json / marketplace.json descriptions and the hook_profile description became bilingual
  - For non-Japanese projects, rules and CLAUDE.md are translated into the project's language at generation time
- validate: checks for English in descriptions and for the commands in README.md and README.en.md being in sync

### Changed

- propose workflow: `framework` is required in each option, and the result includes each option's `stacks` (unit, framework, libraries)
- architecture-critic: technology choices (fit with the pattern, sources for maintenance status, whether there is a runner-up, variation between services, adoption outside generation support) were added to the review points
- scaffolders: follow `framework` / `libraries` in decision.json, and with a framework different from the sample, replace only adapter / infrastructure
- hooks: the SessionStart context includes each unit's framework / libraries. Added fiber, bun, rocket, poem and warp to the domain layer's forbidden dependencies

## [0.2.0] - 2026-11-22

A refactoring based on the structure of popular Claude Code plugins (obra/superpowers, affaan-m/ECC, anthropics/claude-plugins-official, wshobson/agents).

### Added

- **hooks** (`hooks/hooks.json`, bash + python3 standard library only)
  - SessionStart: if decision.json exists, inject a summary of the confirmed architecture into the context. If the design is in progress, point to resuming with `/arch-forge:design`
  - PreToolUse: ask for confirmation before rewriting an accepted ADR (denied in strict; changing it to "superseded" is allowed). Prompt for an ADR and re-checks when decision.json changes
  - PostToolUse: immediately check the dependency direction of edited Go / PHP / Rust files and Cargo.toml (framework dependencies in domain, references from inner to outer, references into module internals)
  - Stop (strict only): run go-arch-lint / deptrac on units with changes, and send the stop back if it fails
- **userConfig `hook_profile`**: minimal / standard / strict / off
- **rules** (`rules/`): conventions placed in the generated project's `.claude/rules/arch-forge/`. Common (dependency rules, ADR practice, verification), per Go / PHP / Rust (with `paths:`), and per unit (generated from `templates/unit-rule.md`)
- **`/arch-forge:rules`**: installs or regenerates the rules and AGENTS.md / CLAUDE.md from decision.json
- **`arch-forge:verification-before-completion`**: a shared skill for never reporting completion without evidence. Preloaded by the generation and verification agents
- Generated projects get **AGENTS.md (source of truth) + CLAUDE.md (`@AGENTS.md`)**
- Repository side: `AGENTS.md` / `CLAUDE.md`, `make validate` (`scripts/validate.sh`), tests for the hooks and workflows, GitHub Actions

### Changed

- workflows: accept `args` as a JSON string too. Validate unit names, paths and docsDir, and reject values pointing outside the repository
- design skill: added the HARD-GATE against generating before the user confirms, and a table of red flags
- foundation-builder: generates AGENTS.md / CLAUDE.md / rules, and creates per-unit rules in sync mode
- architecture-critic (conformance): also checks that AGENTS.md and the rules match reality, and that tests follow the dependency rules

## [0.1.0] - 2026-11-22

- Initial release. design / scaffold / check skills, 10 subagents, propose / scaffold workflows
