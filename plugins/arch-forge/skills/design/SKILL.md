---
name: design
description: Architecture design workflow for new Go / PHP / Rust applications. Interviews you about the requirements, analyzes them, decides monolith vs. modular monolith vs. microservices, designs and red-team reviews several options including framework and major library choices, and after you confirm, writes an ADR and decision.json and generates and verifies the directories and a sample implementation. Use when asked to decide an architecture, design the structure of a new project, decide whether to use microservices, choose a framework, or set up a project scaffold.
argument-hint: "[description of the application you want to build]"
allowed-tools: Read, Write, Edit, Glob, Grep, AskUserQuestion, Workflow, Agent, Bash(mkdir *), Bash(date *), Bash(ls *), Bash(node *), Bash(python3 *), Bash(bash ${CLAUDE_PLUGIN_ROOT}/scripts/detect-toolchains.sh *)
---

# arch-forge: architecture design workflow

The user's request: $ARGUMENTS

## Current state (collected automatically)

- Existing design documents: !`ls -1 docs/architecture 2>/dev/null || echo "(none)"`
- Available toolchains (searched in PATH plus goenv / asdf / mise / /usr/local/go / Homebrew):
!`bash ${CLAUDE_PLUGIN_ROOT}/scripts/detect-toolchains.sh report`
- Existing source code: !`ls -1 go.mod composer.json Cargo.toml package.json 2>/dev/null || echo "(no manifest = new project)"`

## Constants

- `PLUGIN_ROOT` = `${CLAUDE_PLUGIN_ROOT}`
- `DOCS` = `docs/architecture`
- decision schema: `${CLAUDE_PLUGIN_ROOT}/templates/decision.schema.json`
- ADR template: `${CLAUDE_PLUGIN_ROOT}/templates/adr.md`
- Framework selection guide: `${CLAUDE_PLUGIN_ROOT}/skills/architecture-patterns/references/frameworks.md`

## Overall flow

```
Step 0 decide whether to resume → Step 1 interview → Step 2 write the brief
→ Step 3 propose workflow (in the background, several subagents; if premises are missing, Step 3b follow-up interview → re-run)
→ Step 4 present the proposal and get the user's confirmation (if adjusted, Step 4b revision review) → Step 5 decision.json + ADR
→ Step 6 scaffold workflow → Step 7 completion report
```

Always ask the user with AskUserQuestion (up to 4 questions at a time, 2–4 choices each, with the recommended choice first and marked "(recommended)").
Write all output and documents in the user's language.

<HARD-GATE>
Do not create decision.json, ADRs, code or directories until the user explicitly confirms an option in Step 4.
Even "because it is small" or "because the requirements are obvious", do not skip the interview (Step 1) or the comparison of options (Steps 3–4). For small projects, just make the questions and options shorter.
</HARD-GATE>

## Red flags (stop if you think this)

| Thought | Reality |
|---|---|
| "The requirements are obvious, so no interview is needed" | Without scale, team and quality attributes the topology cannot be decided. Skip what is known and ask only the rest |
| "Microservices are popular, so let's recommend them" | The recommendation comes from the scale score and adjustment rules. With one team, never make it the first recommendation |
| "One option is enough" | Without a comparison the user cannot see what was given up. Present at least 2 options |
| "The user is in a hurry, so generate without waiting for confirmation" | HARD-GATE. Do not generate before confirmation |
| "The subagent said it succeeded, so it's done" | Check the generated files and verification results before reporting |
| "I started the workflow, so I'll end the turn and wait" | Do not guess and report results before the completion notification arrives. Report progress only |
| "go version failed, so there is no Go" | A shim (goenv / asdf) may just be failing because no version is set. Use the real binary from the detection result above. If detection finds nothing either, ask the user before generating |
| "The user's adjustment is small, so no review is needed" | The adjusted option is unreviewed. Show only the diff to the critic in Step 4b |

---

## Step 0. Decide whether to resume

Branch on "Existing design documents" above:

- `decision.json` exists → AskUserQuestion: "Proceed to generation (scaffold)" / "Revisit frameworks and key libraries" / "Redo the design" / "Show the current state and stop"
  - "Revisit" → "Step 0b. Revisiting the technology stack" below
- `05-proposal.md` exists but `decision.json` does not → resume from Step 4
- Only `00-brief.md` exists → confirm whether to resume from Step 3 or redo the interview
- Nothing → Step 1

### Step 0b. Revisiting the technology stack (when decision.json exists)

1. Ask in plain text what they want to change (which role in which unit, and why)
2. Call `arch-forge:stack-researcher` with the Agent tool and have it check only the current choice and candidates for the roles to change, updating `02b-stack-facts.md`. After receiving its completion notification, call `arch-forge:solution-architect`. The option ID is `stack-review`, and the stance is "do not change the structure of the current decision.json; for the specified roles only, compare the current framework/library with 2–3 candidates on the evaluation axes in frameworks.md. Write the migration cost (the range of layers and files that change). Cite versions and maintenance status from 02b-stack-facts.md"
3. Summarize `03-options/stack-review.md`, and confirm with AskUserQuestion: "Change as recommended" / "Keep the current choice"
4. Only when changing: write a new ADR (the next number in `adr/`) stating which part of the original ADR it supersedes (do not rewrite the original ADR). Update `framework` / `libraries` and `adr` (the new ADR's path) in decision.json, and regenerate the unit rules with `/arch-forge:rules`. Existing code is not migrated automatically, so explain that the migration is separate work and point to re-checking with `/arch-forge:check`

## Step 1. Interview

If $ARGUMENTS is empty, first ask in plain text "what application do you want to build (purpose, users, main features)".
Then run 2–3 rounds of AskUserQuestion. **Do not ask about anything already clear from $ARGUMENTS or earlier answers.**

**Round 1 (required)**
1. Application type: Web API / web app (with screens) / event-driven or batch / BFF or API gateway (multiSelect allowed)
2. Language: Go / PHP / Rust / undecided (recommend one from the requirements) — add a recommendation based on the available toolchains
3. Expected scale: internal or small (up to 10k users, up to 50 RPS) / medium (up to 500k users, up to 500 RPS) / large (beyond that, peaks of thousands of RPS)
4. Team: 1–3 people / 1 team (4–8 people) / 2–3 teams / 4 or more teams

**Round 2 (required)**
1. Domain complexity: mostly CRUD / moderate business rules / complex (needs dialogue with domain experts, many state transitions)
2. The most important quality attribute (one): development speed / performance and low latency / availability and fault isolation / long-term modifiability (not multiSelect: if everything can be chosen, there is no priority)
3. Data: one RDB is enough / asymmetric reads and writes, heavy search / audit trail or history replay needed / undecided
4. Deployment target: containers (Cloud Run / ECS / Kubernetes) / VMs or on-premises / serverless / undecided

**Round 3**
1. (required) Framework and major libraries: recommend from the requirements (recommended) / prefer what the team knows / there is an internal standard or mandate
   - For anything other than "recommend", ask in plain text which frameworks or libraries (ORM, queue, etc.) they want to use or cannot use
2. (required) The second most important quality attribute: one of the 3 not chosen in Round 2 (+ "none in particular")
3. (only if needed) External integrations, whether async processing is needed, the need for independent releases, deadlines, regulations or compliance, existing infrastructure. Ask only about points where the Round 1–2 answers leave the decision split

## Step 2. Writing the brief

Run `mkdir -p docs/architecture/03-options docs/architecture/adr`, and write `docs/architecture/00-brief.md`:

```
# Interview results (brief)
## Product overview (the user's description verbatim + a summary)
## Answers (table of question → answer)
## Priority of quality attributes (1st and 2nd; 3rd and below are inferred in the requirements analysis)
## Existing environment (the toolchain detection result as is: real paths and versions, whether go on PATH fails, auxiliary tool versions; existing code)
## Stated constraints
## Technology stack preferences and constraints (frameworks/libraries to use / not to use and why; if none, "leave it to the recommendation")
## Concerns and wishes the user mentioned
```

## Step 3. Running the propose workflow

Start it with the Workflow tool (it runs in the background and the result arrives when it finishes):

```json
{
  "scriptPath": "${CLAUDE_PLUGIN_ROOT}/workflows/propose.js",
  "args": { "pluginRoot": "${CLAUDE_PLUGIN_ROOT}", "docsDir": "docs/architecture" }
}
```

- Once started, tell the user in 1–2 lines that "requirements analysis → topology decision → library fact check → 2–3 options designed in parallel → review → proposal" is running, and wait for the completion notification (do not poll)
- Inside, these subagents run: requirements-analyst (sonnet) → topology-strategist (opus) → stack-researcher (sonnet; builds `02b-stack-facts.md` once, and every option cites it) → solution-architect ×2–3 in parallel (opus) → architecture-critic (sonnet) → fixes by solution-architect if needed → proposal-writer (sonnet)
- Below scale L, unless microservices are recommended, option-c becomes **comparison-only**. Comparison-only options are not counted as critical and are not revised
- If the result's `status` is `needs-input`, go to Step 3b. If `ok`, go to Step 4

**Fallback** (when the Workflow tool is unavailable, disabled or fails to start): run the same sequence manually with the Agent tool.

- **Agent may return asynchronously** (no result yet at launch; completion arrives as a notification). Start each stage only after receiving the previous stage's completion notification. While waiting, you may tell the user in one line which stage has finished and end the turn (do not poll, do not guess results)
- To reduce round trips, launch stages that do not depend on each other **together in one message** (option designs ×2–3, option revisions ×N). Wait for all their notifications, and move on only when all have arrived
- Give each prompt the same instructions as the workflow (`pluginRoot`, the user's language, the length limit, whether it is comparison-only, cite 02b-stack-facts.md)

1. `subagent_type: "arch-forge:requirements-analyst"`. If there are `blockingQuestions` and no follow-up interview has been done yet, go to Step 3b
2. `subagent_type: "arch-forge:topology-strategist"` (include `pluginRoot=${CLAUDE_PLUGIN_ROOT}` in the prompt)
3. `subagent_type: "arch-forge:stack-researcher"` (builds `02b-stack-facts.md`)
4. Call `subagent_type: "arch-forge:solution-architect"` once per option, **in parallel in one message** (option IDs and stances: option-a = pragmatic, option-b = evolutionary, and option-c = scale-first at scale L or above or for anything other than a monolith. Below scale L, unless microservices are recommended, option-c is comparison-only)
5. `subagent_type: "arch-forge:architecture-critic"` (proposal mode). Options with critical findings (except comparison-only ones) are revised by solution-architect (in parallel in one message)
6. `subagent_type: "arch-forge:proposal-writer"` (pass `pluginRoot`)

## Step 3b. Follow-up interview (only when premises are missing, once)

1. Ask the result's `blockingQuestions` (up to 4) with AskUserQuestion. The choices are `choices` plus "Unknown (proceed on an estimate)". Put `why` (what the answer changes) briefly in the question text
2. Add a "## Follow-up interview" section at the end of `00-brief.md`, with the questions, the answers and the items that proceed on an estimate
3. Re-run the propose workflow with `"clarified": true` added to the args (the second run goes to the end without stopping; remaining unknowns stay in openQuestions)

## Step 4. Presenting the proposal and confirming

1. Read `05-proposal.md` and `decision.draft.json`
2. Present the following to the user together (a summary, not a long paste):
   - The scale class and recommended topology, and the rationale
   - A comparison table of the options (option / topology / internal pattern / language and framework / main advantage / main risk)
   - The recommended option's framework and major libraries (choice and runner-up per unit × role; from `options[].stacks` in the workflow result and the selection table in 05-proposal.md)
   - The recommended option and 3 reasons
   - `openQuestions` (open questions) from the workflow result
   - Point out that the details are in `docs/architecture/05-proposal.md` and `03-options/`
3. Confirm with AskUserQuestion (in two rounds):
   - Round 1
     - Q1. The option to adopt: the recommended option (recommended) / another option / I want adjustments
     - Q2. Framework and major libraries: as proposed (recommended) / some places should switch to the runner-up / I want to specify something else
   - Round 2 (after applying the round 1 adjustments)
     - Q3. Sample feature (one feature going through every layer): the draft's proposal / specify another feature
     - Q4. Generation options (multiSelect): Docker and docker-compose / GitHub Actions CI / dependency-direction lint (recommended) / Claude Code settings (a permission allowlist for make, build and test plus a read ban on `.env` in `.claude/settings.json`)
     - Code generation (sqlc / oapi-codegen, etc.) runs by default if the libraries include a generator (`scaffold.codegen: true`). Set it to false only if the user says it is not needed
     - If needed, Q5. The Go module path or PHP namespace (present the draft's value as the recommendation; if that exceeds 4 questions in one round, do not swap out Q3, ask in another round)
4. When changing the framework, if the new one has generation support × in `frameworks.md`, explain that "the scaffold will be minimal and unverified" before confirming
5. For "I want adjustments", ask what to change, then either edit `decision.draft.json` directly or, for a large change, ask `arch-forge:solution-architect` to revise the option (fixing only the relevant sections with Edit). Then do **Step 4b** before presenting again. **Do not go to Step 5 until the user explicitly confirms**

### Step 4b. Reviewing the revision (always, after an adjustment)

1. Call `arch-forge:architecture-critic` in **revision mode**. In the prompt, write the changes (the user's adjustments and the files and sections changed) and the path of `04-review.md`, and have it check only the points related to the diff
2. If there is a critical finding, ask the user whether to fix it or accept the risk
3. Update the relevant part of `05-proposal.md` and leave no "unreviewed" note behind (write the reviewed version and where the review was appended)

## Step 5. Finalizing decision.json and the ADR

1. Write `docs/architecture/decision.json` reflecting the chosen option and the user's adjustments (strictly conforming to the schema; `version: 1`, and `adr` set to the ADR path `docs/architecture/adr/0001-application-architecture.md`)
   - Also copy these from the option document into the schema fields: `packaging`, `entrypoint` (required for units sharing a path), `modules[].cqrs`, `platform` (the shared package allowlist), `conventions` (implementation conventions C1…)
   - If the draft's `sampleFeature` uses a name not found in 01-requirements.md / 03-options/, change it to a name from the design documents
   - decision.json is the source of truth for implementation convention IDs (C1…). If revisions of the option document shifted the numbers, do not write a mapping table in the ADR; fix the numbers in the option document to match decision.json
2. Schema validation: if `node` or `python3` is available, do a simple check of the required fields and enums. Fix any violations
3. Get the date with `date +%F`, and create `docs/architecture/adr/0001-application-architecture.md` from the ADR template
   - Fill in every section: Context / Options considered (all options) / Decision / Frameworks and major libraries (choice, runner-up, reasons) / Diagram / Dependency rules / Consequences / Revisit triggers
   - The status is "Accepted" and the deciders are the user
4. Tell the user the key points of decision.json (the unit list and paths) and the ADR's path

## Step 6. Running the scaffold workflow

**Pre-checks** (always before generating):

1. Run `bash ${CLAUDE_PLUGIN_ROOT}/scripts/detect-toolchains.sh report` and check that the toolchains for the languages in decision.json exist
   - **If a language is missing**: confirm with AskUserQuestion: "Install it, then generate (recommended)" / "Specify the location" / "Generate without verification (build, tests and formatting stay unverified)". For "Specify the location", re-run detection with that path
   - **If "Fix (recommended)" appears** (go on PATH fails through a goenv / asdf shim): confirm with AskUserQuestion: "Put a version file in the project (recommended)" / "Pass it via PATH (needs approval for every command)". To put the file, Write exactly what `bash ${CLAUDE_PLUGIN_ROOT}/scripts/detect-toolchains.sh --pin` prints (a file name and one tab-separated line; if `.tool-versions` already exists, add the line). Run `report` again and confirm that go on PATH works. Rewriting PATH is the last resort, because `export PATH=...` and running by absolute path require approval every time in Claude Code, and go-arch-lint also calls go on PATH
2. Point out version combinations of auxiliary tools under which the generated files will not work (e.g. an old Docker Compose, golangci-lint built with a Go older than the one in decision.json). Say in 1–2 lines that the generated files will either match the local versions or state the required minimum versions in the README
3. **Only if go and friends on PATH still do not work**, note as `toolchainPath` the colon-separated directories inside the quotes (excluding `:$PATH`) of the output of `bash ${CLAUDE_PLUGIN_ROOT}/scripts/detect-toolchains.sh --env` (`export PATH="..."`). If go on PATH works, do not pass `toolchainPath`
4. Tell the user in one line that during generation, subagents may ask for approval to write to `.claude/` (rules and settings.json) or to run go / make

AskUserQuestion: "Generate the directories and sample implementation now?" — Generate (recommended) / Later (tell them they can resume with `/arch-forge:scaffold`, then stop)

To generate, build an array of `{ name, language, path, entrypoint }` from `units` in decision.json, and start it with the Workflow tool. **Units with the same path are one build unit**: the workflow generates them in order and verifies them once (generating in parallel would make shared files such as go.mod collide):

```json
{
  "scriptPath": "${CLAUDE_PLUGIN_ROOT}/workflows/scaffold.js",
  "args": {
    "pluginRoot": "${CLAUDE_PLUGIN_ROOT}",
    "docsDir": "docs/architecture",
    "toolchainPath": "<the directories from pre-check 3; omit if none>",
    "units": [{ "name": "<unit>", "language": "go|php|rust", "path": "<path>", "entrypoint": "<entrypoint>" }]
  }
}
```

Inside, these run: foundation-builder (sonnet; also creates AGENTS.md / CLAUDE.md and the common and per-language rules in `.claude/rules/arch-forge/`) → a language scaffolder per build unit (sonnet; for shared units, the first builds the shared parts and later ones only their own entrypoints) → scaffold-verifier (haiku) → on failure, one fix by the scaffolder → foundation-builder (sync mode; syncs the docs with reality and creates the per-unit rules `units/<unit>.md`) → architecture-critic's conformance check (sonnet).

**Fallback**: with the Agent tool, run `arch-forge:foundation-builder` → `arch-forge:<language>-scaffolder` per build unit (separate build units in parallel in one message; **units sharing a path one at a time, waiting for each completion notification**, with the same role instructions as the workflow) → `arch-forge:scaffold-verifier` per build unit (on failure, one fix by the scaffolder and re-verify) → `arch-forge:foundation-builder` (sync mode) → `arch-forge:architecture-critic` (conformance mode), in that order. Proceed the same way as the Step 3 fallback when Agent returns asynchronously. Put the `export PATH=...` instruction for `toolchainPath` in each prompt.

## Step 7. Completion report

Before reporting, **check that the hooks work**: run `python3 -I ${CLAUDE_PLUGIN_ROOT}/hooks/arch_hooks.py doctor`. It shows decision.json loading, the context injected at session start, and the detected domain layers (the directories the dependency direction check covers). Report any failure or "not detected" as is (do not write that the hooks work).

Report from the workflow result:

- The result per unit (passed / failed, skipped verifications and why, unresolved items)
- The number of conformance violations (`docs/architecture/07-conformance.md`)
- The main generated files (the root AGENTS.md / CLAUDE.md, `.claude/rules/arch-forge/`, architecture.md, the ADR, each unit's README)
- The result of the hook check. Only if confirmed, write "from now on, the arch-forge hooks read decision.json and inject context at session start, protect accepted ADRs and check dependency direction on edits" (the profile can be set to minimal / standard / strict / off in the `/plugin` settings)
- How to start it (`make up` / `make test` and the like, only what was actually generated)
- Next steps: if failures or violations remain, ask whether to fix them. Tell them to add an ADR to `docs/architecture/adr/` for new design decisions, and that the convention check can be re-run with `/arch-forge:check`

Never report failures or skipped steps as "success". Write that anything you could not verify was not verified (follow the standard of `arch-forge:verification-before-completion`).
