---
name: check
description: 現在のコードが docs/architecture/decision.json と ADR の依存ルールに従っているかを検査し、違反（ファイル:行、ルール、修正案）を docs/architecture/07-conformance.md に報告する。機能追加後やレビュー前に「アーキテクチャ違反がないか確認して」と言われたときに使う。
argument-hint: "[検査対象のパス（省略時はリポジトリ全体）]"
context: fork
agent: arch-forge:architecture-critic
allowed-tools: Read, Glob, Grep, Write, Bash
---

conformance モードで検査する。

- 対象: $ARGUMENTS（空ならリポジトリ全体）
- 入力: `docs/architecture/decision.json`、`docs/architecture/adr/*.md`、ルートの `CLAUDE.md`
- decision.json が無い場合は「`/arch-forge:design` で先にアーキテクチャを確定してください」とだけ返して終了する

手順:

1. decision.json のユニット・モジュール・パターンを読み、期待するディレクトリと依存ルールを列挙する
2. 言語別の機械チェックを実行できるものは実行する（Go: `.go-arch-lint.yml` があれば go-arch-lint、PHP: `deptrac.yaml` があれば `vendor/bin/deptrac analyse`、Rust: 各 crate の `Cargo.toml` の依存を確認）
3. ツールで検出できない違反を Grep で探す（ドメイン層からのフレームワーク / DB ライブラリ参照、モジュールの非公開部分への参照、共有ライブラリへのドメインモデル混入）
4. `docs/architecture/07-conformance.md` に違反一覧を書き、違反数・重大な違反の上位 3 件・実行できなかったチェックを返す
