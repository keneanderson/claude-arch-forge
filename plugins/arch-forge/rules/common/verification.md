# Verify before reporting completion

Before writing "it works", "it passes" or "it's fixed", run the verification command in that same message and check its output.

| Claim | Evidence needed | Not evidence |
|---|---|---|
| Tests pass | Output of the test command (0 failures) | An earlier run, "it should pass" |
| It builds | Exit code 0 from the build command | Lint passing |
| The dependency rules are kept | arch-lint output, or the result of `/arch-forge:check` | Eyeballing it |
| A subagent finished | The diff of the changed files | The subagent's "it succeeded" report |

- Write "not verified" for any verification you could not run, with the reason (tool missing, no network, etc.)
- Do not count skipped as passed
- Do not weaken checks (tests, lint and arch-lint settings, minimum-version checks) to make verification pass. If they need loosening, write the reason and ask the user
- Do not report completion with "probably" or "it should"
