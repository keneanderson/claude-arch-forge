# {{project.name}} — エージェント向けガイド

<!--
arch-forge が生成するルートの AGENTS.md のテンプレート。
AGENTS.md を正本とし、Claude Code は CLAUDE.md の `@AGENTS.md` から読み込む（Codex / Cursor などは AGENTS.md を直接読む）。
目次として使い、150 行以内に保つ。詳細は docs/ と .claude/rules/arch-forge/ に置く。
-->

{{project.summary}}

## 地図

- **[docs/architecture/architecture.md](docs/architecture/architecture.md)** — C4 図、ユニット一覧、データフロー
- **[docs/architecture/adr/](docs/architecture/adr/)** — 確定した設計判断（承認済み ADR は書き換えない）
- **[docs/architecture/decision.json](docs/architecture/decision.json)** — 確定アーキテクチャ（機械可読）
- **`.claude/rules/arch-forge/`** — 依存ルール（共通・言語別・ユニット別）

## アーキテクチャ

- トポロジー: {{topology}} / リポジトリ構成: {{repoLayout}}

| ユニット | 言語 / パターン | フレームワーク・主要ライブラリ | パス / 起動点 | 責務 |
|---|---|---|---|---|
| {{unit.name}} | {{unit.language}} / {{unit.pattern}} | {{unit.framework}}（{{unit.libraries}}） | `{{unit.path}}` / `{{unit.entrypoint}}` | {{unit.responsibilities}} |

<!-- 同じパスを共有するユニットがあれば「`<path>` は <units> が共有する 1 つのビルド単位」と 1 行で書く。実装規約（C1〜）があれば下の依存ルールの後に箇条書きで書く -->

## 依存ルール（要約）

<!-- ADR の「依存ルール」節を箇条書きで転記する。詳細は .claude/rules/arch-forge/ -->

- 依存は内側（domain）に向ける
- {{ADR の依存ルール}}

## 開発コマンド

<!-- 実在するコマンドだけを書く（sync フェーズで確認する） -->

```bash
make build
make test
make lint
make arch-lint
make up
```

## 作業の進め方

- 機能追加は内側から: domain → usecase / port → adapter → 配線 → テスト
- 層・モジュール・サービスの境界、フレームワーク・主要ライブラリを変える前に ADR を書き、ユーザーの承認を得る
- 完了を報告する前に、テストと arch-lint を実行して結果を確認する。実行できなかった検証は「未検証」と書く
- 秘密情報をコミットしない。設定は環境変数から読む
- `APP_ENV` の未設定・未知の値は production として扱う。インメモリ実装・簡易モードは `APP_ENV=local` のときだけ
