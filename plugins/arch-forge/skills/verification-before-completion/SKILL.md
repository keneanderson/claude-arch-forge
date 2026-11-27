---
name: verification-before-completion
description: The shared completion criteria for arch-forge subagents. Before reporting the results of generation, fixes or checks, actually run the verification commands, check their output, and report with evidence, including what was skipped or could not be verified. Preloaded by the scaffolders, verifier, foundation-builder and architecture-critic.
user-invocable: false
---

# Verify before reporting completion

**Principle: never claim completion without evidence.** A verification not run in this message cannot be said to have passed.

## Procedure (every time, right before reporting)

1. **Identify**: which command proves the claim (build / test / lint / arch-lint / `ls` / `git status`)
2. **Run**: run that command to the end (do not reuse an earlier result)
3. **Read**: check the exit code and output, and count the failures
4. **Compare**: does the output support the claim
   - It does not → report the actual state with evidence
   - It does → report the claim together with the evidence (command and result)

## Common mistakes

| Claim | Evidence needed | Not evidence |
|---|---|---|
| Tests pass | Output of the test command (0 failures) | An earlier run, "it should pass" |
| It builds | Exit code 0 from the build | Lint passing |
| The dependency rules are kept | arch-lint output, Grep results for imports | "The layers are split, so it's fine" |
| The files were generated | `ls` / Glob results | Believing you wrote them |
| The docs match reality | Confirming the paths and commands written actually exist | Having followed the template |

## Red flags (stop and verify when you notice one)

- You are about to write "probably", "it should" or "I think it's fine"
- You are about to write "done" before verifying
- You skipped verification because a tool is missing, and did not say so in the report
- You are counting skipped as passed
- You are about to weaken tests, lint settings, dependency-direction settings or the minimum-version checks (reducing targets, weakening conditions, adding skips) to make verification pass. If it cannot be fixed without weakening, do not weaken it; write the reason in `unresolved` and leave the decision to the user
- You are about to report that a tool (go / php / cargo) "is missing" because it was not found. Did you first look for the real binary with `bash <pluginRoot>/scripts/detect-toolchains.sh`?
- You are generalizing what you confirmed in one unit or file to everything

## Report format

- List the commands run and their results (passed / failed / skipped)
- Give the reason for each skipped one (tool not installed, no network, etc.)
- Leave failures you could not fix in `unresolved` / `blockers`. Do not hide them

## Using Bash (so permission checks do not stall you)

- **Read** the plugin's files (templates, rules and skills under `<pluginRoot>`). Claude Code rejects `cat` / `cp` / `cd` that touch paths outside the project. If you need a copy, Read it and then Write it
- Run commands one at a time, in a simple form (`go test ./...`, `make gen`). Chaining with `;` or `&&`, shell variables, `for` loops and `$?` tend to stall on approval checks
- When go on PATH does not work, working around it with an absolute path or `export PATH=...` is the last resort (it needs approval every time). If the project has `.go-version` / `.tool-versions`, do not delete them
