# arch-forge — guide for agents

This is the repository of the Claude Code plugin **arch-forge**. It takes the application architecture of a new project (Go / PHP / Rust) from the requirements interview through the proposal, confirmation, scaffolding and verification.

This file is the source of truth. Claude Code loads it through `@AGENTS.md` in `CLAUDE.md`. Use it as a table of contents and keep it within 150 lines.

## Map

- **[README.md](README.md)** — documentation for users
- **`HANDOFF.md`** — handover notes (current state, unverified parts, remaining work). Local only and not in git (already in `.gitignore`). Skip it if it does not exist
- **[CHANGELOG.md](CHANGELOG.md)** — changes per version
- **[plugins/arch-forge/](plugins/arch-forge/)** — the plugin itself

```
plugins/arch-forge/
├── .claude-plugin/plugin.json   # manifest (userConfig: hook_profile)
├── skills/        # /arch-forge:design | scaffold | check | rules, plus knowledge skills (user-invocable: false)
├── agents/        # 11 subagents (model / effort / tools / preloaded skills stated explicitly)
├── workflows/     # propose.js / scaffold.js (scripts for the Workflow tool)
├── hooks/         # hooks.json + run-hook.sh + arch_hooks.py (standard library only; self-check with doctor)
├── scripts/       # detect-toolchains.sh (finds the real Go / PHP / Rust and auxiliary tool binaries; bash only)
├── rules/         # convention templates placed in the generated project's .claude/rules/arch-forge/
└── templates/     # decision.schema.json (the contract between design and scaffold), adr.md, AGENTS.md, CLAUDE.md, unit-rule.md, go/go-arch-lint.*.yml (verified)
```

## Design invariants

- **decision.json is the only contract**: the design side writes decision.json, and the scaffold side takes only decision.json as input. When you change a field (including `framework` / `libraries`), update `templates/decision.schema.json`, the design skill, proposal-writer, the scaffolders and the hooks (`arch_hooks.py`) together
- **Zero dependencies**: the hooks run on bash and the python3 standard library only. Without python3 they do nothing. A hook failure never stops the user's session (exceptions are swallowed and the hook exits 0)
- **Generate nothing until the user confirms**: do not make changes that weaken the design skill's HARD-GATE
- **Build units and deployment units**: units with the same `path` form one build unit (shared parts are built first, units are generated in order, and verification runs once). Units that share one must have an `entrypoint`
- **Never pass by weakening checks**: do not put into the plugin's instructions any change that fixes a verification failure by weakening tests, lint settings or the minimum-version checks
- **Workflow scripts cannot read files**: the calling skill passes the values they need in `args`. `args` is also accepted as a string, and names and paths are validated before going into prompts
- **`hooks` / `mcpServers` / `permissionMode` are ignored for plugin agents**: do not put them in frontmatter

## Writing conventions

| Target | Convention |
|---|---|
| Agents | Always set `name` / `description` / `model` / `effort` / `tools` in frontmatter. Tools follow least privilege. Generation and verification agents preload `arch-forge:verification-before-completion` |
| Skills | Write "when to use it" in `description`. Skills the user calls explicitly get `disable-model-invocation: true`; knowledge skills get `user-invocable: false` |
| Workflows | Give each `agent()` an `agentType` / `model` / `effort` / `label`, plus a `schema` when the result is used. Always handle null (failure or skip) |
| rules | At most 80 lines per file. Language-specific rules get `paths:` frontmatter and reference `../common/` |
| Language | Everything in this repository (docs, prompts, descriptions, messages, comments) is in English; `make validate` fails on CJK text. The only exception is the hook's ADR status regex, which also matches Japanese status words. Generated files follow the user's language (the language of decision.json / the ADRs). For non-English projects, rules / CLAUDE.md are translated when copied |
| Frameworks | `skills/architecture-patterns/references/frameworks.md` is the source of truth for candidates, evaluation axes and generation support (◎○×). When you add a candidate, also update "Framework-specific differences" in the language skill and the table in README.md. Do not put version numbers or dates in the catalog (stack-researcher checks them from primary sources at design time) |
| Dependency-direction lint settings | The verified templates in `templates/go/` are the source of truth for go-arch-lint settings. After changing them, check against the fixtures in `tests/go-arch-lint/` |
| File names | Lowercase, hyphen-separated (`go-scaffolder.md`) |

## Quality gate (always run before pushing)

```bash
make validate        # JSON / versions / frontmatter / English only / README commands / rules / workflow syntax and mocked run / hook tests / toolchain detection / go-arch-lint templates / claude plugin validate
make test            # only the hook, workflow and go-arch-lint template tests
```

- When bumping the version, keep `version` in `plugin.json` and `marketplace.json` in sync, and add a section to `CHANGELOG.md`
- When you change a workflow branch or schema, add a case to `tests/workflows/run.mjs`
- When you change a hook's logic, add a case to `tests/hooks/test_hooks.py`

## Manual checks

```bash
claude --plugin-dir ./plugins/arch-forge          # try /arch-forge:design interactively
ARCH_FORGE_HOOK_DEBUG=1 ARCH_FORGE_HOOK_PROFILE=strict claude --plugin-dir ./plugins/arch-forge
```

When trying it headless, pass `--allowedTools` as a single comma-separated argument and pass the prompt on stdin (variadic flags swallow the prompt). `claude -p` does not provide the Workflow tool, so it takes the Agent fallback path.

## Do not

- Change the GitHub repository's visibility, or submit it to public or official directories (**not until the owner says so**)
- Put secrets or real connection strings in templates or tests
- Commit `HANDOFF.md` (local only)
- Force push, `reset --hard` or delete branches without the owner's instruction
