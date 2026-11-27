# PHP directory layout reference

`<Root>` is `project.phpNamespace` in decision.json (e.g. `Acme\Shop`). The sample feature is Order.

## layered (standard Laravel)

```
app/
├── Http/
│   ├── Controllers/OrderController.php
│   └── Requests/StoreOrderRequest.php     # validation
├── Services/OrderService.php              # business logic
├── Repositories/
│   ├── OrderRepositoryInterface.php
│   └── EloquentOrderRepository.php
├── Models/Order.php                       # Eloquent
└── Providers/AppServiceProvider.php       # binds interface → implementation
routes/api.php
database/migrations/xxxx_create_orders_table.php
tests/Feature/OrderApiTest.php
tests/Unit/OrderServiceTest.php
```

## clean (Laravel + a separate src/)

```
app/                                   # Presentation & framework layer
├── Http/Controllers/Order/CreateOrderController.php   # single action
├── Http/Requests/CreateOrderRequest.php
└── Providers/OrderingServiceProvider.php
src/
└── Ordering/
    ├── Domain/
    │   ├── Order.php                  # Entity (final, invariants)
    │   ├── OrderId.php                # Value Object (readonly)
    │   ├── Money.php
    │   ├── OrderRepository.php        # interface
    │   └── Exception/OrderNotFound.php
    ├── Application/
    │   ├── CreateOrder/
    │   │   ├── CreateOrderCommand.php # input DTO (readonly)
    │   │   ├── CreateOrderHandler.php # use case
    │   │   └── OrderView.php          # output DTO
    │   └── GetOrder/GetOrderHandler.php
    └── Infrastructure/
        ├── Persistence/
        │   ├── EloquentOrderModel.php
        │   ├── EloquentOrderRepository.php
        │   └── InMemoryOrderRepository.php
        └── Clock/SystemClock.php
tests/
├── Unit/Ordering/Application/CreateOrderHandlerTest.php
└── Feature/Ordering/CreateOrderApiTest.php
deptrac.yaml
phpstan.neon
```
`composer.json`:
```json
"autoload": { "psr-4": { "App\\": "app/", "Acme\\Shop\\": "src/" } }
```

## hexagonal (Symfony recommended)

```
src/
└── Ordering/
    ├── Domain/{Order.php,OrderId.php,Money.php}
    ├── Application/
    │   ├── Port/
    │   │   ├── In/CreateOrderUseCase.php      # interface
    │   │   └── Out/{OrderRepository.php,EventPublisher.php}
    │   └── Service/CreateOrderService.php     # implements the In port
    └── Adapter/
        ├── In/Http/CreateOrderController.php  # #[Route('/orders', methods: ['POST'])]
        ├── In/Console/...
        └── Out/
            ├── Persistence/DoctrineOrderRepository.php
            ├── Persistence/InMemoryOrderRepository.php
            └── Messaging/MessengerEventPublisher.php
config/services.yaml   # binds Port/Out/* → Adapter/Out/*
```

## vertical-slice (Laravel)

```
app/Features/
├── CreateOrder/
│   ├── CreateOrderController.php
│   ├── CreateOrderRequest.php
│   ├── CreateOrderAction.php
│   └── CreateOrderTest.php
└── GetOrder/...
```

## modular-monolith (Laravel)

```
modules/
├── Ordering/
│   ├── Contracts/OrderingApi.php          # the only interface exposed to other modules
│   ├── Domain/ Application/ Infrastructure/
│   ├── Http/routes.php
│   └── OrderingServiceProvider.php        # registers routes, bindings, migrations
└── Inventory/
    ├── Contracts/InventoryApi.php
    └── ...
database/migrations/ordering/ , database/migrations/inventory/
```
Add `"Modules\\": "modules/"` to the PSR-4 section of `composer.json`, and register each ServiceProvider in `bootstrap/providers.php`.
Modules integrate by injecting the `Contracts/*` interfaces or through Laravel Events (can be made async with `ShouldQueue`).

## microservices (Slim)

```
services/
├── ordering/
│   ├── public/index.php        # Slim App, PHP-DI container
│   ├── config/{container.php,routes.php}
│   ├── src/{Domain,Application,Infrastructure,Presentation}/
│   ├── tests/
│   ├── composer.json
│   └── Dockerfile              # php:8.x-fpm or frankenphp
└── inventory/...
api/openapi/*.yaml
deploy/docker-compose.yml
```

## deptrac.yaml (clean example)

```yaml
deptrac:
  paths:
    - ./src
    - ./app
  layers:
    - name: Domain
      collectors:
        - { type: directory, value: 'src/[^/]+/Domain/.*' }
    - name: Application
      collectors:
        - { type: directory, value: 'src/[^/]+/Application/.*' }
    - name: Infrastructure
      collectors:
        - { type: directory, value: 'src/[^/]+/Infrastructure/.*' }
    - name: Presentation
      collectors:
        - { type: directory, value: 'app/.*' }
  ruleset:
    Domain: ~
    Application: [Domain]
    Infrastructure: [Domain, Application]
    Presentation: [Application, Domain]
```
