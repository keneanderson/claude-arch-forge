# arch-forge

Go / PHP / Rust の新規開発で、アプリケーションアーキテクチャを要件から決めて雛形まで生成する Claude Code プラグインです。

- `/arch-forge:design [アプリの説明]` — ヒアリング → 要件分析 → モノリス / モジュラーモノリス / マイクロサービスの判断 → 2〜3 案の並列設計 → レッドチームレビュー → 比較提案 → ユーザーが確定 → ADR と decision.json → ディレクトリとサンプル実装の生成 → ビルド・テスト・依存方向チェック
- `/arch-forge:scaffold [ユニット名...]` — 確定済み decision.json から生成だけを実行
- `/arch-forge:check [パス]` — 現在のコードが ADR と依存ルールに従っているか検査

多段の処理は `workflows/propose.js` と `workflows/scaffold.js`（Claude Code Workflows）で実行し、10 のサブエージェントにモデル（opus / sonnet / haiku）・effort・ツールを個別に割り当てています。Workflows が使えない環境では Agent ツールで同じ順序にフォールバックします。

要件: Claude Code v2.1.323 以上。生成コードの検証には使用言語のツールチェーン（go / php + composer / cargo）が必要です。

インストール:

```
/plugin install arch-forge --marketplace keneanderson/claude-arch-forge
```

詳細はリポジトリの [README](https://github.com/keneanderson/claude-arch-forge#readme) を参照してください。
