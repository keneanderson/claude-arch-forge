---
name: php-architecture
description: PHP でのアーキテクチャ実装規約。Laravel / Symfony / Slim でのレイヤード / クリーン / ヘキサゴナル / DDD / モジュラーモノリス / マイクロサービスのディレクトリ構成、PSR-4、DI コンテナ、テスト（Pest/PHPUnit）、PHPStan、deptrac による依存方向検査。PHP プロジェクトの構成を決める・生成する・レビューするときに使う。 PHP architecture conventions for Laravel / Symfony / Slim (layouts per pattern, PSR-4, DI, Pest / PHPUnit, PHPStan, deptrac).
user-invocable: false
---

# PHP アーキテクチャ規約

ディレクトリツリーは `${CLAUDE_SKILL_DIR}/references/layouts.md`、
サンプルコードは `${CLAUDE_SKILL_DIR}/references/samples.md` を Read して使う。

## 基本方針

- **PHP バージョン**: `php -v` で確認し、インストール済みの最新安定版に合わせて `composer.json` の `require.php` を設定（8.2 未満なら警告）。全ファイル先頭に `declare(strict_types=1);`
- **フレームワーク選択**
  - **Laravel**: 管理画面・Web アプリ・高速開発・チームが Laravel 経験者。layered はそのまま、clean/DDD では `app/` をフレームワーク層に限定し、ドメインを `src/` に分離
  - **Symfony**: ヘキサゴナル / DDD と相性が良い（DI コンテナの autowire、Messenger）。長期運用の業務システム
  - **Slim（+ PHP-DI）**: 小さな API / マイクロサービス。フレームワーク依存を最小化したい場合
- **選定基準・ORM・実行環境の比較** は `architecture-patterns` スキルの `references/frameworks.md`。decision.json の `framework` / `libraries` に従う（Symfony は Doctrine ORM、Slim は Doctrine DBAL か PDO を既定にする）
- **プロジェクト生成**: `composer` が使えてネットワークがあれば公式インストーラを使う（`composer create-project laravel/laravel <dir>` / `composer create-project symfony/skeleton <dir>` / `composer require slim/slim slim/psr7 php-di/php-di`）。使えなければ `composer.json` と最小構成を手書きし、`composer install` が未実行であることを報告する
- **名前空間**: PSR-4。ドメイン層は `<RootNamespace>\<Context>\Domain\...`（decision.json の `project.phpNamespace`）
- **ドメイン層**: フレームワーク（Eloquent / Illuminate / Symfony コンポーネント）に依存しない純粋 PHP。Entity は `final class`、Value Object は `readonly` プロパティ
- **Eloquent の扱い**: clean / DDD では Eloquent Model を Infrastructure 層に閉じ込め、Repository 実装で Entity ⇄ Model を変換する。layered では Eloquent を直接使ってよい
- **DI**: Laravel は ServiceProvider で interface → 実装をバインド、Symfony は `services.yaml` の autowire、Slim は PHP-DI
- **テスト**: Laravel は Pest、Symfony / Slim は PHPUnit（Pest でも可）。ユースケースはインメモリ Repository でテスト
- **静的解析**: PHPStan（level 8 以上を目標、`phpstan.neon`）、コードスタイルは Laravel Pint または PHP-CS-Fixer
- **依存方向**: deptrac（`deptrac.yaml`）で層ルールを宣言して CI で検査
- **環境と設定**: `APP_ENV` が未設定・未知なら production として扱う。InMemory Repository や簡易な認証・検査は `APP_ENV=local` / `testing` のときだけバインドし、本番で必須設定が無ければ起動時に例外で止める
- **パッケージの分け方**: decision.json の `packaging`。by-layer は `src/<層>/<機能>/`、by-feature は `src/<機能>/<層>/`（モジュラーモノリスは `modules/<Module>/<層>/`）

## パターン → ディレクトリの対応（要約）

| パターン | Laravel | Symfony / Slim |
|---|---|---|
| layered | `app/Http/Controllers` → `app/Services` → `app/Repositories` → `app/Models` | `src/{Controller,Service,Repository,Entity}` |
| clean | `src/<Ctx>/{Domain,Application,Infrastructure}` ＋ `app/Http`（Presentation） | `src/<Ctx>/{Domain,Application,Infrastructure,Presentation}` |
| hexagonal | `src/<Ctx>/{Domain,Application/Port/{In,Out},Adapter/{In,Out}}` | 同左 |
| ddd-* | 上記 Domain を `Domain/{Model,Event,Repository,Service}` に細分 | 同左 |
| vertical-slice | `app/Features/<Feature>/{Controller,Action,Request}.php` | `src/Feature/<Feature>/` |
| modular-monolith | `modules/<Module>/`（各モジュールに ServiceProvider と `Contracts/` 公開 API） | `src/<Module>/`（各 bounded context）＋ deptrac でモジュール間を制限 |
| microservices | `services/<svc>/` ごとに独立した composer プロジェクト | 同左（Slim 推奨） |

## 生成後の必須チェック

```
composer validate --strict
composer install            # ネットワークが無い場合はスキップし報告
vendor/bin/phpstan analyse
vendor/bin/pest  または  vendor/bin/phpunit
vendor/bin/deptrac analyse
php -l <生成したファイル>     # vendor が無くても構文チェックは必ず行う
```
