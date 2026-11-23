@AGENTS.md

## Claude Code 向け

- 依存ルールの詳細は `.claude/rules/arch-forge/` にあり、該当ファイルを扱うときに自動で読み込まれる
- 構造を変えたら `/arch-forge:check` で適合チェックを行う
- decision.json を変えたら `/arch-forge:rules` で `.claude/rules/arch-forge/units/` を再生成する
- 新しい設計判断は `docs/architecture/adr/` に ADR として追加する
