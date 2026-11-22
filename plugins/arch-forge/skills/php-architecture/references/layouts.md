# PHP ディレクトリ構成リファレンス

`<Root>` は decision.json の `project.phpNamespace`（例: `Acme\Shop`）。サンプル機能は Order。

## layered（Laravel 標準）

```
app/
├── Http/
│   ├── Controllers/OrderController.php
│   └── Requests/StoreOrderRequest.php     # バリデーション
├── Services/OrderService.php              # 業務処理
├── Repositories/
│   ├── OrderRepositoryInterface.php
│   └── EloquentOrderRepository.php
├── Models/Order.php                       # Eloquent
└── Providers/AppServiceProvider.php       # interface → 実装 bind
routes/api.php
database/migrations/xxxx_create_orders_table.php
tests/Feature/OrderApiTest.php
tests/Unit/OrderServiceTest.php
```

## clean（Laravel + src/ 分離）

```
app/                                   # Presentation & フレームワーク層
├── Http/Controllers/Order/CreateOrderController.php   # シングルアクション
├── Http/Requests/CreateOrderRequest.php
└── Providers/OrderingServiceProvider.php
src/
└── Ordering/
    ├── Domain/
    │   ├── Order.php                  # Entity（final, 不変条件）
    │   ├── OrderId.php                # Value Object（readonly）
    │   ├── Money.php
    │   ├── OrderRepository.php        # interface
    │   └── Exception/OrderNotFound.php
    ├── Application/
    │   ├── CreateOrder/
    │   │   ├── CreateOrderCommand.php # 入力 DTO（readonly）
    │   │   ├── CreateOrderHandler.php # ユースケース
    │   │   └── OrderView.php          # 出力 DTO
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

## hexagonal（Symfony 推奨）

```
src/
└── Ordering/
    ├── Domain/{Order.php,OrderId.php,Money.php}
    ├── Application/
    │   ├── Port/
    │   │   ├── In/CreateOrderUseCase.php      # interface
    │   │   └── Out/{OrderRepository.php,EventPublisher.php}
    │   └── Service/CreateOrderService.php     # In port 実装
    └── Adapter/
        ├── In/Http/CreateOrderController.php  # #[Route('/orders', methods: ['POST'])]
        ├── In/Console/...
        └── Out/
            ├── Persistence/DoctrineOrderRepository.php
            ├── Persistence/InMemoryOrderRepository.php
            └── Messaging/MessengerEventPublisher.php
config/services.yaml   # Port/Out/* → Adapter/Out/* を bind
```

## vertical-slice（Laravel）

```
app/Features/
├── CreateOrder/
│   ├── CreateOrderController.php
│   ├── CreateOrderRequest.php
│   ├── CreateOrderAction.php
│   └── CreateOrderTest.php
└── GetOrder/...
```

## modular-monolith（Laravel）

```
modules/
├── Ordering/
│   ├── Contracts/OrderingApi.php          # 他モジュールに公開する唯一の interface
│   ├── Domain/ Application/ Infrastructure/
│   ├── Http/routes.php
│   └── OrderingServiceProvider.php        # routes, bindings, migrations を登録
└── Inventory/
    ├── Contracts/InventoryApi.php
    └── ...
database/migrations/ordering/ , database/migrations/inventory/
```
`composer.json` の PSR-4 に `"Modules\\": "modules/"` を追加し、`bootstrap/providers.php` に各 ServiceProvider を登録。
モジュール間連携は `Contracts/*` の interface 注入か Laravel Events（`ShouldQueue` で非同期化可能）。

## microservices（Slim）

```
services/
├── ordering/
│   ├── public/index.php        # Slim App, PHP-DI コンテナ
│   ├── config/{container.php,routes.php}
│   ├── src/{Domain,Application,Infrastructure,Presentation}/
│   ├── tests/
│   ├── composer.json
│   └── Dockerfile              # php:8.x-fpm or frankenphp
└── inventory/...
api/openapi/*.yaml
deploy/docker-compose.yml
```

## deptrac.yaml（clean の例）

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
