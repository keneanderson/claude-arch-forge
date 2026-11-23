# arch-forge rules

生成プロジェクトの `.claude/rules/arch-forge/` に配置する規約ファイルのテンプレートです。
Claude Code は `.claude/rules/` 配下の Markdown を自動で読み込みます。frontmatter に `paths:` があるファイルは、該当パスのファイルを扱うときだけ読み込まれます。

```
rules/
├── common/                 # 言語に依存しない規約（必ず配置）
│   ├── architecture.md     # 依存ルール・境界・変更手順（常時）
│   ├── adr.md              # ADR の運用（docs/architecture/** を扱うとき）
│   └── verification.md     # 完了報告の前に検証する（常時）
├── go/architecture.md      # **/*.go, go.mod
├── php/architecture.md     # **/*.php, composer.json
└── rust/architecture.md    # **/*.rs, Cargo.toml
```

配置するのは次の 2 種類です。

1. `common/` と、decision.json の `units[].language` に対応する言語ディレクトリを、**ディレクトリごと** コピーする
   - 例: `.claude/rules/arch-forge/common/`、`.claude/rules/arch-forge/go/`
   - 平坦化しない。同名ファイルが上書きされ、`../common/` への相対リンクも壊れるため
2. ユニットごとに `units/<unit>.md` を生成する
   - テンプレートは `templates/unit-rule.md`
   - `paths:` にユニットのパスを入れ、そのユニットの実際の層ディレクトリと依存可能な方向を書く

配置は `/arch-forge:rules`、または scaffold ワークフローの Foundation フェーズが行います。

## 書き方

- 1 ファイル 80 行以内を目安にする。常時読み込まれるファイル（`paths:` なし）は特に短くする
- 規則は「〜する / 〜しない」と検査できる形で書く。理由は 1 行で添える
- 言語別ファイルの冒頭で、対応する `common/` ファイルを参照する
- プロジェクト固有の値（パス・モジュール名）は `units/<unit>.md` にだけ書く。言語別・共通ファイルは汎用のまま保つ
