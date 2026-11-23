@AGENTS.md

## Claude Code 向け

- 返答と報告は日本語で書く
- プラグインの最新仕様（frontmatter、hooks の入出力、Workflow API）に迷ったら、推測せず claude-code-guide エージェントか公式ドキュメントで確認する
- 変更後は `make validate` を実行し、結果を確認してから完了を報告する
- エージェント・スキルを追加・改名したら README.md のエージェント表と、HANDOFF.md（ローカル専用）があればその構成も更新する
