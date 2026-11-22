---
name: architecture-patterns
description: アプリケーションアーキテクチャの選定知識。レイヤード / クリーン / ヘキサゴナル / DDD / モジュラーモノリス / マイクロサービス / CQRS / イベント駆動の選び方、規模クラス判定（S/M/L/XL）、サービス分割の基準、言語（Go/PHP/Rust）の適性。アーキテクチャを比較・提案・レビューするとき、マイクロサービスにすべきか判断するときに使う。
user-invocable: false
---

# アーキテクチャ選定ナレッジ

アーキテクチャを提案・レビューするときは、次の順で判断し、各判断に **要件からの根拠** を書く。

1. **規模クラス判定** — [decision-matrix.md](references/decision-matrix.md) の Step 1 のスコア表で S/M/L/XL を判定。補正ルールを必ず適用する
2. **トポロジー決定** — モノリス / モジュラーモノリス / マイクロサービス。分割する場合は [microservices.md](references/microservices.md) の前提チェックと境界の見つけ方に従う
3. **内部パターン決定** — [patterns.md](references/patterns.md) の早見表。モジュール/サービスごとに複雑度が違えば別パターンでよい
4. **言語・フレームワーク** — decision-matrix.md の Step 3。言語別の具体構成は `go-architecture` / `php-architecture` / `rust-architecture` スキル
5. **提案の形式** — decision-matrix.md の Step 5（2〜3 案、推奨案＋よりシンプルな案、品質特性評価、進化パス）

参照ファイルの絶対パス（Read ツールで開く）:

- `${CLAUDE_SKILL_DIR}/references/patterns.md`
- `${CLAUDE_SKILL_DIR}/references/decision-matrix.md`
- `${CLAUDE_SKILL_DIR}/references/microservices.md`

## 原則

- **最もシンプルで要件を満たす案を基準線にする。** 複雑さを足すたびに、それを正当化する要件を 1 つ以上挙げる
- 「将来必要になるかも」は根拠にしない。代わりに **見直しトリガー**（どうなったら次の段階へ進むか）を ADR に書く
- マイクロサービスは組織とオペレーションの問題でもある。チーム数・運用能力が足りなければ推奨しない
- 依存方向ルールは **ツールで機械的に検査できる形** で定義する（Go: go-arch-lint / depguard、PHP: deptrac、Rust: crate 分割）
