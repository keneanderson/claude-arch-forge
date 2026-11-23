---
name: architecture-patterns
description: アプリケーションアーキテクチャの選定知識。レイヤード / クリーン / ヘキサゴナル / DDD / モジュラーモノリス / マイクロサービス / CQRS / イベント駆動の選び方、規模クラス判定（S/M/L/XL）、サービス分割の基準、言語（Go/PHP/Rust）の適性。アーキテクチャを比較・提案・レビューするとき、マイクロサービスにすべきか判断するときに使う。 Knowledge for choosing an application architecture (layered, clean, hexagonal, DDD, modular monolith, microservices, CQRS, event-driven), scale classes, service splitting, language fit, and framework and library selection criteria.
user-invocable: false
---

# アーキテクチャ選定ナレッジ

アーキテクチャを提案・レビューするときは、次の順で判断し、各判断に **要件からの根拠** を書く。

1. **規模クラス判定** — [decision-matrix.md](references/decision-matrix.md) の Step 1 のスコア表で S/M/L/XL を判定。補正ルールを必ず適用する
2. **トポロジー決定** — モノリス / モジュラーモノリス / マイクロサービス。分割する場合は [microservices.md](references/microservices.md) の前提チェックと境界の見つけ方に従う
3. **内部パターン決定** — [patterns.md](references/patterns.md) の早見表。モジュール/サービスごとに複雑度が違えば別パターンでよい。**パッケージの分け方**（層ごと / 機能ごと / hybrid、patterns.md の 11 節）も合わせて決める
4. **言語** — decision-matrix.md の Step 3
5. **フレームワーク・主要ライブラリ** — [frameworks.md](references/frameworks.md) の手順で、ユニットの役割（HTTP / RPC / DB / マイグレーション / メッセージング / テスト）ごとに選び、次点と却下理由を残す。言語別の具体構成は `go-architecture` / `php-architecture` / `rust-architecture` スキル
6. **提案の形式** — decision-matrix.md の Step 5（2〜3 案、推奨案＋よりシンプルな案、品質特性評価、進化パス）

参照ファイルの絶対パス（Read ツールで開く）:

- `${CLAUDE_SKILL_DIR}/references/patterns.md`
- `${CLAUDE_SKILL_DIR}/references/decision-matrix.md`
- `${CLAUDE_SKILL_DIR}/references/microservices.md`
- `${CLAUDE_SKILL_DIR}/references/frameworks.md`

## 原則

- **最もシンプルで要件を満たす案を基準線にする。** 複雑さを足すたびに、それを正当化する要件を 1 つ以上挙げる
- 「将来必要になるかも」は根拠にしない。代わりに **見直しトリガー**（どうなったら次の段階へ進むか）を ADR に書く
- マイクロサービスは組織とオペレーションの問題でもある。チーム数・運用能力が足りなければ推奨しない
- 依存方向ルールは **ツールで機械的に検査できる形** で定義する（Go: go-arch-lint / depguard、PHP: deptrac、Rust: crate 分割）
- **設定漏れは安全側に倒す**: 環境の既定値は本番相当にし、インメモリ実装・暗号化なし接続・簡易モードはローカル環境を明示したときだけ有効にする
- ライブラリの版・保守状況の出典は一次情報（パッケージレジストリ、OSV、GitHub Releases）に限る。集計サイト・ブログは使わない
