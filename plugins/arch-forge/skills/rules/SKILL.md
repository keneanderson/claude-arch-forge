---
name: rules
description: 確定済みの docs/architecture/decision.json をもとに、プロジェクトの .claude/rules/arch-forge/（共通・言語別・ユニット別の依存ルール）と、ルートの AGENTS.md / CLAUDE.md の arch-forge 節を導入・再生成する。scaffold 後に decision.json を変えたとき、既存プロジェクトに規約だけ入れたいときに使う。 Installs or regenerates .claude/rules/arch-forge/ (common, per-language and per-unit dependency rules) and the arch-forge section of AGENTS.md / CLAUDE.md from a confirmed decision.json.
argument-hint: "[--dry-run]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(ls *), Bash(mkdir *), Bash(git status *)
---

# arch-forge: rules

引数: $ARGUMENTS（`--dry-run` なら書き込まず、作成・更新するファイルの一覧だけを示す）

## 現在の状態（自動取得）

- decision.json: !`ls docs/architecture/decision.json 2>/dev/null || echo "(なし)"`
- 既存の rules: !`ls -R .claude/rules/arch-forge 2>/dev/null | head -30 || echo "(なし)"`
- ルートの AGENTS.md / CLAUDE.md: !`ls AGENTS.md CLAUDE.md 2>/dev/null || echo "(なし)"`

## 手順

1. decision.json が無ければ「先に `/arch-forge:design` でアーキテクチャを確定してください」と伝えて終了する
2. decision.json を Read し、`units[].language` の集合と各ユニットの `path` / `pattern` / `modules` を確認する
   - `path` が絶対パス、または `..` を含む場合は処理せず、ユーザーに報告する
3. **共通・言語別ルールのコピー**（ディレクトリごと。平坦化しない）: `${CLAUDE_PLUGIN_ROOT}/rules/common/*.md` と、使う言語ごとの `${CLAUDE_PLUGIN_ROOT}/rules/<language>/*.md` を Glob で列挙し、**Read してから同じ相対パスで Write する**（`.claude/rules/arch-forge/common/…`、`.claude/rules/arch-forge/<language>/…`）。Bash の `cp` はプロジェクトの外を読むため Claude Code に拒否されることがある。`.claude/` への書き込みは承認を求められることがあると、先にユーザーに伝える
   既存ファイルがユーザーによって編集されている場合（プラグイン版と内容が異なる場合）は上書きせず、差分の要点を示して確認する。`<!-- arch-forge:translated -->` が入ったファイルは翻訳版なので、文字列ではなく意味で比較し、ユーザーの追記がある場合だけ確認する

   **言語を合わせる**: decision.json / ADR の言語が日本語以外なら、コピーした rules の各ファイルと CLAUDE.md をその言語に翻訳する。`paths:` frontmatter・パス・コマンド・コード片は変えず、frontmatter の直後に `<!-- arch-forge:translated -->` を入れる
4. **ユニット別ルールの生成**: `${CLAUDE_PLUGIN_ROOT}/templates/unit-rule.md` を雛形に、ユニットごとに `.claude/rules/arch-forge/units/<unit>.md` を書く
   - 層のディレクトリは **Glob で実在を確認したものだけ** を書く（雛形のパスを推測で埋めない）
   - 「機能を追加するとき」はサンプル機能（`sampleFeature`）の実際のファイルを例にする
   - 検証コマンドはユニットの Makefile / composer.json / Cargo.toml に実在するものだけを書く
5. **AGENTS.md / CLAUDE.md**:
   - AGENTS.md が無い → `${CLAUDE_PLUGIN_ROOT}/templates/AGENTS.md` を雛形に作る
   - AGENTS.md がある → 末尾の `## Architecture (arch-forge)` 節だけを追加・更新する（他の節は触らない）
   - CLAUDE.md が無い → `${CLAUDE_PLUGIN_ROOT}/templates/CLAUDE.md` をコピーする（日本語以外のプロジェクトでは手順 3 と同じく翻訳する）
   - CLAUDE.md があり `@AGENTS.md` を含まない → 先頭に `@AGENTS.md` を 1 行追加してよいかユーザーに確認する
6. 作成・更新したファイルの一覧を報告する。次のセッションから rules が読み込まれること、hooks が decision.json を前提に動くことを伝える
