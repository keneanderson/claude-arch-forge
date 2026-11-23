# アーキテクチャ規約（共通）

このプロジェクトのアーキテクチャは `docs/architecture/decision.json` と `docs/architecture/adr/` で確定しています。
ユニットごとの層の場所は `units/<unit>.md` を参照してください。

## 依存ルール

- 依存は内側に向ける: `adapter / infrastructure → usecase / application → domain`
- domain はフレームワーク・ORM・DB ドライバ・HTTP・ロガー実装に依存しない（標準ライブラリと値オブジェクトのみ）
- 外部 I/O が必要なときは、内側に port（interface / trait）を定義し、外側で実装して起動時に注入する
- テストも依存ルールに従う。内側の層のテストは外側の実装を import しない。テストダブルはテスト内に置く
- モジュラーモノリスでは、他モジュールの公開 API（Go: モジュールのルートパッケージ、PHP: `Contracts/`）だけを参照する
- マイクロサービスでは、他サービスのコード・DB を直接参照しない。API 契約（`api/openapi`、`api/proto`）かイベントで連携する

## 変更の手順

| やりたいこと | 手順 |
|---|---|
| ユースケース追加 | domain（必要なら）→ usecase と port → adapter → 配線 → テスト、の順に内側から作る |
| エンドポイント追加 | 先に API 契約を更新し、adapter のハンドラは usecase を呼ぶだけにする |
| 新しい外部サービス・DB | port を内側に定義 → infrastructure に実装 → 配線。domain には入れない |
| 層・モジュール・サービス境界の変更 | **先に ADR を書く**（`adr.md` 参照）。decision.json の変更は ADR とセットで行う |

## 禁止

- 依存ルール違反を `// TODO` や lint の除外設定で黙らせない。必要なら ADR に例外として記録する
- 「とりあえず」共有パッケージ（`common`、`util`、`shared`）にドメインモデルを置かない
- 設定値・秘密情報をコードに書かない（環境変数から読む）
- 設定漏れで危険な動作にしない。環境（`APP_ENV`）の既定は本番相当にし、インメモリ実装・暗号化なし接続・簡易モードは `APP_ENV=local` を明示したときだけ有効にする

## 検査

- 構造を変えたら `/arch-forge:check` を実行し、`docs/architecture/07-conformance.md` の違反を 0 にする
- 依存方向 lint（`make arch-lint`）を CI と同じ条件で通す
