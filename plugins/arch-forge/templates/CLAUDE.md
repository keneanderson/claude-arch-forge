@AGENTS.md

## For Claude Code

- Detailed dependency rules are in `.claude/rules/arch-forge/` and load automatically when you work with matching files
- After changing the structure, run a conformance check with `/arch-forge:check`
- After changing decision.json, regenerate `.claude/rules/arch-forge/units/` with `/arch-forge:rules`
- Add new design decisions as ADRs in `docs/architecture/adr/`
