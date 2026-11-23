# arch-forge

[English](#english) | [日本語](#日本語)

## English

A Claude Code plugin that decides an application architecture for new Go / PHP / Rust projects from your requirements and scaffolds it.

- `/arch-forge:design [description of the app]` — interview → requirements analysis → monolith / modular monolith / microservices decision → 2–3 options designed in parallel, including framework and library selection → red-team review → comparison proposal → you confirm → ADR and decision.json → directories and a sample implementation → build, test and dependency checks
- `/arch-forge:scaffold [unit...]` — scaffolding only, from a confirmed decision.json
- `/arch-forge:check [path]` — checks the current code against the ADRs and dependency rules
- `/arch-forge:rules [--dry-run]` — installs or regenerates `.claude/rules/arch-forge/` and AGENTS.md / CLAUDE.md

Multi-step work runs in `workflows/propose.js` and `workflows/scaffold.js` (Claude Code Workflows), with a model (opus / sonnet / haiku), effort and tools set for each of the 10 subagents. Without Workflows, the same steps run through the Agent tool.
Hooks (profile `hook_profile`: minimal / standard / strict / off) inject the confirmed architecture at session start, guard accepted ADRs and check dependency direction after each edit.
It answers in your language. Talk to it in English and the documents and rules it generates are in English too.

Requirements: Claude Code v2.1.323 or later. Verifying generated code needs the language toolchain (go / php + composer / cargo).

```
/plugin install arch-forge --marketplace keneanderson/claude-arch-forge
```

See the repository [README](https://github.com/keneanderson/claude-arch-forge/blob/main/README.en.md) for details.

## 日本語

Go / PHP / Rust の新規開発で、アプリケーションアーキテクチャを要件から決めて雛形まで生成する Claude Code プラグインです。

- `/arch-forge:design [アプリの説明]` — ヒアリング → 要件分析 → モノリス / モジュラーモノリス / マイクロサービスの判断 → フレームワーク・主要ライブラリの選定を含む 2〜3 案の並列設計 → レッドチームレビュー → 比較提案 → ユーザーが確定 → ADR と decision.json → ディレクトリとサンプル実装の生成 → ビルド・テスト・依存方向チェック
- `/arch-forge:scaffold [ユニット名...]` — 確定済み decision.json から生成だけを実行
- `/arch-forge:check [パス]` — 現在のコードが ADR と依存ルールに従っているか検査
- `/arch-forge:rules [--dry-run]` — `.claude/rules/arch-forge/` と AGENTS.md / CLAUDE.md を導入・再生成

多段の処理は `workflows/propose.js` と `workflows/scaffold.js`（Claude Code Workflows）で実行し、10 のサブエージェントにモデル（opus / sonnet / haiku）・effort・ツールを個別に割り当てています。Workflows が使えない環境では Agent ツールで同じ順序にフォールバックします。
hooks（設定 `hook_profile`: minimal / standard / strict / off）が、セッション開始時の文脈注入・承認済み ADR の保護・編集直後の依存方向チェックを行います。

要件: Claude Code v2.1.323 以上。生成コードの検証には使用言語のツールチェーン（go / php + composer / cargo）が必要です。

```
/plugin install arch-forge --marketplace keneanderson/claude-arch-forge
```

詳細はリポジトリの [README](https://github.com/keneanderson/claude-arch-forge#readme) を参照してください。
