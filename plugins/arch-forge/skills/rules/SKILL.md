---
name: rules
description: From a confirmed docs/architecture/decision.json, installs or regenerates the project's .claude/rules/arch-forge/ (common, per-language and per-unit dependency rules) and the arch-forge section of the root AGENTS.md / CLAUDE.md. Use when decision.json changed after scaffolding, or to add only the conventions to an existing project.
argument-hint: "[--dry-run]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(ls *), Bash(mkdir *), Bash(git status *)
---

# arch-forge: rules

Arguments: $ARGUMENTS (with `--dry-run`, write nothing and only show the list of files to create or update)

## Current state (collected automatically)

- decision.json: !`ls docs/architecture/decision.json 2>/dev/null || echo "(none)"`
- Existing rules: !`ls -R .claude/rules/arch-forge 2>/dev/null | head -30 || echo "(none)"`
- Root AGENTS.md / CLAUDE.md: !`ls AGENTS.md CLAUDE.md 2>/dev/null || echo "(none)"`

## Procedure

1. If decision.json does not exist, say "Confirm the architecture with `/arch-forge:design` first" and stop
2. Read decision.json and check the set of `units[].language` and each unit's `path` / `pattern` / `modules`
   - If a `path` is absolute or contains `..`, do not process it; report it to the user
3. **Copy the common and per-language rules** (as whole directories; do not flatten): list `${CLAUDE_PLUGIN_ROOT}/rules/common/*.md` and `${CLAUDE_PLUGIN_ROOT}/rules/<language>/*.md` for each language used with Glob, and **Read each one, then Write it at the same relative path** (`.claude/rules/arch-forge/common/…`, `.claude/rules/arch-forge/<language>/…`). Claude Code may reject Bash `cp` because it reads outside the project. Tell the user in advance that writing to `.claude/` may ask for approval
   If an existing file was edited by the user (its content differs from the plugin's version), do not overwrite it; show the gist of the difference and confirm. A file containing `<!-- arch-forge:translated -->` is a translation, so compare by meaning rather than text, and confirm only if the user added something

   **Match the language**: if the language of decision.json / the ADRs is not English, translate each copied rules file and CLAUDE.md into that language. Do not change the `paths:` frontmatter, paths, commands or code snippets, and put `<!-- arch-forge:translated -->` right after the frontmatter
4. **Generate the per-unit rules**: using `${CLAUDE_PLUGIN_ROOT}/templates/unit-rule.md` as the template, write `.claude/rules/arch-forge/units/<unit>.md` for each unit
   - Write **only layer directories confirmed to exist with Glob** (do not fill in the template's paths by guessing)
   - For "Adding a feature", use the actual files of the sample feature (`sampleFeature`) as the example
   - Write only verification commands that exist in the unit's Makefile / composer.json / Cargo.toml
5. **AGENTS.md / CLAUDE.md**:
   - No AGENTS.md → create one from `${CLAUDE_PLUGIN_ROOT}/templates/AGENTS.md`
   - AGENTS.md exists → add or update only the `## Architecture (arch-forge)` section at the end (do not touch other sections)
   - No CLAUDE.md → copy `${CLAUDE_PLUGIN_ROOT}/templates/CLAUDE.md` (for non-English projects, translate it as in step 3)
   - CLAUDE.md exists without `@AGENTS.md` → ask the user whether to add one `@AGENTS.md` line at the top
6. Report the list of files created and updated. Explain that the rules load from the next session, and that the hooks work on the basis of decision.json
