---
paths:
  - "{{unit.path}}/**"
---
# ユニット {{unit.name}} の層と依存

<!-- arch-forge が decision.json と実際のディレクトリから生成したファイル。手で直したら /arch-forge:rules で上書きされる点に注意 -->

- 言語 / パターン: {{unit.language}} / {{unit.pattern}}{{#unit.framework}}（{{unit.framework}}）{{/unit.framework}} / パッケージの分け方: {{unit.packaging}}
- 起動点: {{unit.entrypoint}}{{#shared}}（path {{unit.path}} を {{shared.units}} と共有する 1 つのビルド単位。共通部分の変更は全員に影響する）{{/shared}}
- 共通パッケージ: {{unit.platform.path}} に置いてよいもの: {{unit.platform.allow}}（ドメインは置かない）
- 実装規約: {{decision.conventions の ID と本文}}
- 主要ライブラリ: {{unit.libraries}}（ドメイン層からは使わない。変えるときは新しい ADR を書く）
- 責務: {{unit.responsibilities}}
- ADR: {{decision.adr}}

## 層（内側から）

<!-- 実際に存在するディレクトリだけを書く。Glob で確認してから埋める -->

| 層 | ディレクトリ | 依存してよい層 |
|---|---|---|
| domain | `{{path}}` | なし |
| usecase / application | `{{path}}` | domain |
| adapter / infrastructure | `{{path}}` | usecase, domain |
| 配線（main / bin / ServiceProvider） | `{{path}}` | すべて |

## モジュール（モジュラーモノリスの場合のみ）

| モジュール | 公開 API | 他モジュールからの参照 |
|---|---|---|
| {{module.name}} | `{{publicApi のパス}}` | 公開 API のみ |

## 機能を追加するとき

<!-- サンプル機能（sampleFeature）を例に、このユニットで新しいユースケースを足すときに作るファイルを順に書く -->

1. `{{domain のファイル}}`
2. `{{usecase のファイル}}`
3. `{{adapter のファイル}}`
4. `{{配線のファイル}}`
5. `{{テストのファイル}}`

## 検証コマンド

```
{{このユニットの fmt / lint / build / test / arch-lint コマンド（実在するものだけ）}}
```
