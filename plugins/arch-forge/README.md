# arch-forge

A Claude Code plugin that decides an application architecture for new Go / PHP / Rust projects from your requirements and scaffolds it.

- `/arch-forge:design [description of the app]` — interview → requirements analysis → monolith / modular monolith / microservices decision → 2–3 options designed in parallel, including framework and library selection → red-team review → comparison proposal → you confirm → ADR and decision.json → directories and a sample implementation → build, test and dependency checks
- `/arch-forge:scaffold [unit...]` — scaffolding only, from a confirmed decision.json
- `/arch-forge:check [path]` — checks the current code against the ADRs and dependency rules
- `/arch-forge:rules [--dry-run]` — installs or regenerates `.claude/rules/arch-forge/` and AGENTS.md / CLAUDE.md

Multi-step work runs in `workflows/propose.js` and `workflows/scaffold.js` (Claude Code Workflows), with a model (opus / sonnet / haiku), effort and tools set for each of the 11 subagents. Without Workflows, the same steps run through the Agent tool.
Hooks (profile `hook_profile`: minimal / standard / strict / off) inject the confirmed architecture at session start, guard accepted ADRs and check dependency direction after each edit.
It answers in your language: the documents and rules it generates follow the language you talk to it in.

Requirements: Claude Code v2.1.323 or later. Verifying generated code needs the language toolchain (go / php + composer / cargo).

```
/plugin install arch-forge --marketplace keneanderson/claude-arch-forge
```

See the repository [README](https://github.com/keneanderson/claude-arch-forge#readme) for details.
