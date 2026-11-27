---
paths:
  - "**/*.php"
  - "**/composer.json"
  - "**/deptrac.yaml"
  - "**/phpstan.neon"
---
# PHP architecture conventions

> Applies [../common/architecture.md](../common/architecture.md) to PHP.

## Structure

- `declare(strict_types=1);` at the top of every file
- Namespaces follow PSR-4. The domain is `<RootNamespace>\<Context>\Domain\...`
- Entities are `final class`, and Value Objects use `readonly` properties
- Bind interfaces to implementations in the DI container (Laravel: ServiceProvider, Symfony: `services.yaml`, Slim: PHP-DI)

## Dependencies

- Domain does not `use` `Illuminate\`, `Symfony\`, `Doctrine\`, `Slim\`, `Psr\Http\` or `PDO`
- In clean / DDD, keep Eloquent Models inside Infrastructure, and convert between Entities and Models in the Repository implementation (only layered allows using Eloquent directly)
- Application does not `use` Infrastructure / Presentation (Http). Put interfaces for the capabilities it needs in Application
- Modular monolith: reference other modules only through the interfaces in `Modules\<Module>\Contracts\`
- Declare the dependency rules in `deptrac.yaml`. When you add a layer, also update deptrac's layers and ruleset

## Code

- Controllers only validate input and call the usecase. No business rules in them
- Represent exceptions with Domain exception classes, and convert to HTTP status only in Presentation (the exception handler)
- Read settings from `.env` / environment variables. Never commit secrets

## Verification

```
composer validate --strict && vendor/bin/phpstan analyse && vendor/bin/pest && vendor/bin/deptrac analyse
```

Even without vendor, always run the syntax check with `php -l`.
