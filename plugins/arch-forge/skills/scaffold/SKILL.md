---
name: scaffold
description: From a confirmed docs/architecture/decision.json, generates directories and a sample implementation that follow the architecture, and runs the build, tests and dependency direction checks. Use after confirming the design with /arch-forge:design to redo only the generation, or to generate specific units only.
argument-hint: "[unit name ... (all units if omitted)]"
disable-model-invocation: true
allowed-tools: Read, Write, Glob, Grep, AskUserQuestion, Workflow, Agent, Bash(ls *), Bash(git status *), Bash(python3 *), Bash(bash ${CLAUDE_PLUGIN_ROOT}/scripts/detect-toolchains.sh *)
---

# arch-forge: scaffold

Target units: $ARGUMENTS (all units if empty)

## Current state (collected automatically)

- decision.json: !`ls docs/architecture/decision.json 2>/dev/null || echo "(none)"`
- Uncommitted changes: !`git status --porcelain 2>/dev/null | head -20 || true`
- Toolchains (searched in PATH plus goenv / asdf / mise / /usr/local/go / Homebrew):
!`bash ${CLAUDE_PLUGIN_ROOT}/scripts/detect-toolchains.sh report`

## Procedure

1. If `docs/architecture/decision.json` does not exist, say "Confirm the architecture with `/arch-forge:design` first" and stop
2. Read decision.json and check that the required fields of the schema (`${CLAUDE_PLUGIN_ROOT}/templates/decision.schema.json`) are present
3. Decide the target units. If $ARGUMENTS is given, only the matching `units[].name`. If a name does not exist, show the list and confirm
   - Units sharing the same `path` are one build unit. If only some of them are specified, check whether the shared parts already exist; if not, confirm whether to target all units with that path
4. If files already exist at the destination (`ls` each unit's `path`) or there are uncommitted changes, explain that files may be overwritten and confirm with AskUserQuestion whether to continue
5. If the toolchain detection result above shows a target unit's language as "not found", confirm with AskUserQuestion: "Install it, then generate (recommended)" / "Specify the location" / "Generate without verification". If "Fix (recommended)" appears (go on PATH fails through a shim), do as in the Step 6 pre-checks of the design skill: confirm, put the version file (the output of `--pin`), and check that go on PATH works. Only if go on PATH still does not work, note as `toolchainPath` what is inside the quotes (excluding `:$PATH`) of the output of `bash ${CLAUDE_PLUGIN_ROOT}/scripts/detect-toolchains.sh --env`. Also mention any Docker Compose or golangci-lint version caveats in 1–2 lines
6. Start it with the Workflow tool:
   ```json
   {
     "scriptPath": "${CLAUDE_PLUGIN_ROOT}/workflows/scaffold.js",
     "args": {
       "pluginRoot": "${CLAUDE_PLUGIN_ROOT}",
       "docsDir": "docs/architecture",
       "toolchainPath": "<the directories from step 5; omit if none>",
       "units": [{ "name": "<unit>", "language": "<go|php|rust>", "path": "<path>", "entrypoint": "<entrypoint>" }]
     }
   }
   ```
   The workflow generates units with the same path in order as one build unit, and verifies them once.
   If the Workflow tool is unavailable, run with the Agent tool: `arch-forge:foundation-builder` → `arch-forge:<language>-scaffolder` per build unit (separate build units in parallel in one message; units sharing a path one at a time, waiting for each completion notification) → `arch-forge:scaffold-verifier` per build unit (on failure, one fix by the scaffolder and re-verify) → `arch-forge:foundation-builder` (sync mode: syncs the docs and generates the per-unit rules `.claude/rules/arch-forge/units/<unit>.md`) → `arch-forge:architecture-critic` (conformance mode), in that order. Agent may return asynchronously, so start each stage only after receiving the previous stage's completion notification (do not poll; while waiting, you may report progress in one line and end the turn). Put the `export PATH=...` instruction for `toolchainPath` in each prompt
7. Wait for the completion notification. Before reporting, check that the hooks work with `python3 -I ${CLAUDE_PLUGIN_ROOT}/hooks/arch_hooks.py doctor`
8. Report passed / failed / skipped per unit, the unresolved items, the number of conformance violations and the hook check result. If failures remain, ask whether to fix them
