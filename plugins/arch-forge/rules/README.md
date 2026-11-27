# arch-forge rules

Templates for the convention files placed in the generated project's `.claude/rules/arch-forge/`.
Claude Code loads the Markdown files under `.claude/rules/` automatically. A file with `paths:` in its frontmatter is loaded only when working with files matching those paths.

```
rules/
├── common/                 # language-independent conventions (always placed)
│   ├── architecture.md     # dependency rules, boundaries, change procedure (always)
│   ├── adr.md              # ADR practice (when working with docs/architecture/**)
│   └── verification.md     # verify before reporting completion (always)
├── go/architecture.md      # **/*.go, go.mod
├── php/architecture.md     # **/*.php, composer.json
└── rust/architecture.md    # **/*.rs, Cargo.toml
```

Two kinds of files are placed.

1. Copy `common/` and the language directories matching `units[].language` in decision.json, **as whole directories**
   - e.g. `.claude/rules/arch-forge/common/`, `.claude/rules/arch-forge/go/`
   - Do not flatten them: files with the same name would overwrite each other, and the relative links to `../common/` would break
2. Generate `units/<unit>.md` for each unit
   - The template is `templates/unit-rule.md`
   - Put the unit's path in `paths:`, and write the unit's actual layer directories and the allowed dependency directions

Placement is done by `/arch-forge:rules`, or by the Foundation phase of the scaffold workflow.
If the project's language (the language of decision.json / the ADRs) is not English, translate the files into that language when copying them.

## How to write them

- Aim for at most 80 lines per file. Keep files that are always loaded (no `paths:`) especially short
- Write each rule in a checkable "do / do not" form, with a one-line reason
- At the top of each language file, reference the matching `common/` file
- Put project-specific values (paths, module names) only in `units/<unit>.md`. Keep the language and common files generic
