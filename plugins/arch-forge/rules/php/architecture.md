---
paths:
  - "**/*.php"
  - "**/composer.json"
  - "**/deptrac.yaml"
  - "**/phpstan.neon"
---
# PHP のアーキテクチャ規約

> [../common/architecture.md](../common/architecture.md) を PHP に当てはめた規約です。

## 構成

- 全ファイルの先頭に `declare(strict_types=1);`
- 名前空間は PSR-4。ドメインは `<RootNamespace>\<Context>\Domain\...`
- Entity は `final class`、Value Object は `readonly` プロパティにする
- interface → 実装のバインドは DI コンテナで行う（Laravel: ServiceProvider、Symfony: `services.yaml`、Slim: PHP-DI）

## 依存

- Domain で `Illuminate\`、`Symfony\`、`Doctrine\`、`Slim\`、`Psr\Http\`、`PDO` を use しない
- clean / DDD では Eloquent Model を Infrastructure に閉じ込め、Repository 実装で Entity と Model を変換する（layered のみ Eloquent の直接利用を許す）
- Application は Infrastructure / Presentation（Http）を use しない。必要な機能は Application に interface を置く
- モジュラーモノリス: 他モジュールは `Modules\<Module>\Contracts\` の interface だけを参照する
- 依存ルールは `deptrac.yaml` に宣言する。層を増やしたら deptrac の layer と ruleset も更新する

## コード

- コントローラは入力の検証と usecase の呼び出しだけを行う。業務ルールを書かない
- 例外は Domain の例外クラスで表し、HTTP ステータスへの変換は Presentation（例外ハンドラ）だけで行う
- 設定は `.env` / 環境変数から読む。秘密情報をコミットしない

## 検証

```
composer validate --strict && vendor/bin/phpstan analyse && vendor/bin/pest && vendor/bin/deptrac analyse
```

vendor が無い環境でも `php -l` による構文チェックは必ず行う。
