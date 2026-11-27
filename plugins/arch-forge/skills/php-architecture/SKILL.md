---
name: php-architecture
description: Architecture implementation conventions for PHP. Directory layouts for layered / clean / hexagonal / DDD / modular monolith / microservices with Laravel / Symfony / Slim, PSR-4, DI containers, tests (Pest/PHPUnit), PHPStan, and dependency direction checks with deptrac. Use when deciding, generating or reviewing the structure of a PHP project.
user-invocable: false
---

# PHP architecture conventions

Read and use `${CLAUDE_SKILL_DIR}/references/layouts.md` for the directory trees,
and `${CLAUDE_SKILL_DIR}/references/samples.md` for the sample code.

## Basic policy

- **PHP version**: check with `php -v`, and set `require.php` in `composer.json` to match the latest installed stable version (warn if below 8.2). `declare(strict_types=1);` at the top of every file
- **Choosing the framework**
  - **Laravel**: admin consoles, web apps, fast development, a team experienced with Laravel. layered as is; for clean/DDD, limit `app/` to the framework layer and separate the domain into `src/`
  - **Symfony**: fits well with hexagonal / DDD (DI container autowiring, Messenger). Long-lived business systems
  - **Slim (+ PHP-DI)**: small APIs / microservices. When you want minimal framework dependency
- **Selection criteria and comparisons of ORMs and runtimes** are in `references/frameworks.md` of the `architecture-patterns` skill. Follow `framework` / `libraries` in decision.json (Symfony defaults to Doctrine ORM, Slim to Doctrine DBAL or PDO)
- **Creating the project**: if `composer` and the network are available, use the official installers (`composer create-project laravel/laravel <dir>` / `composer create-project symfony/skeleton <dir>` / `composer require slim/slim slim/psr7 php-di/php-di`). If not, write `composer.json` and a minimal setup by hand, and report that `composer install` was not run
- **Namespaces**: PSR-4. The domain layer is `<RootNamespace>\<Context>\Domain\...` (`project.phpNamespace` in decision.json)
- **Domain layer**: pure PHP that does not depend on the framework (Eloquent / Illuminate / Symfony components). Entities are `final class`, Value Objects use `readonly` properties
- **Handling Eloquent**: in clean / DDD, keep Eloquent Models inside the Infrastructure layer and convert Entity ⇄ Model in the Repository implementation. In layered, Eloquent may be used directly
- **DI**: Laravel binds interfaces → implementations in a ServiceProvider, Symfony uses autowiring in `services.yaml`, Slim uses PHP-DI
- **Tests**: Pest for Laravel, PHPUnit for Symfony / Slim (Pest is fine too). Test use cases with in-memory Repositories
- **Static analysis**: PHPStan (aim for level 8 or above, `phpstan.neon`); code style with Laravel Pint or PHP-CS-Fixer
- **Dependency direction**: declare the layer rules in deptrac (`deptrac.yaml`) and check them in CI
- **Environment and configuration**: if `APP_ENV` is unset or unknown, treat it as production. Bind InMemory Repositories and simplified authentication or validation only with `APP_ENV=local` / `testing`, and stop with an exception at startup if required settings are missing in production
- **Package split**: `packaging` in decision.json. by-layer is `src/<Layer>/<Feature>/`, by-feature is `src/<Feature>/<Layer>/` (`modules/<Module>/<Layer>/` for a modular monolith)

## Pattern → directories (summary)

| Pattern | Laravel | Symfony / Slim |
|---|---|---|
| layered | `app/Http/Controllers` → `app/Services` → `app/Repositories` → `app/Models` | `src/{Controller,Service,Repository,Entity}` |
| clean | `src/<Ctx>/{Domain,Application,Infrastructure}` + `app/Http` (Presentation) | `src/<Ctx>/{Domain,Application,Infrastructure,Presentation}` |
| hexagonal | `src/<Ctx>/{Domain,Application/Port/{In,Out},Adapter/{In,Out}}` | same |
| ddd-* | split Domain above into `Domain/{Model,Event,Repository,Service}` | same |
| vertical-slice | `app/Features/<Feature>/{Controller,Action,Request}.php` | `src/Feature/<Feature>/` |
| modular-monolith | `modules/<Module>/` (each module with a ServiceProvider and a `Contracts/` public API) | `src/<Module>/` (each bounded context) + deptrac to restrict cross-module access |
| microservices | an independent composer project per `services/<svc>/` | same (Slim recommended) |

## Required checks after generation

```
composer validate --strict
composer install            # skip and report if there is no network
vendor/bin/phpstan analyse
vendor/bin/pest  or  vendor/bin/phpunit
vendor/bin/deptrac analyse
php -l <generated file>     # always run the syntax check, even without vendor
```
