# PHP サンプルコード（clean、Order の例）

## src/Ordering/Domain/OrderId.php（Value Object）

```php
<?php

declare(strict_types=1);

namespace Acme\Shop\Ordering\Domain;

final readonly class OrderId
{
    public function __construct(public string $value)
    {
        if ($value === '') {
            throw new \InvalidArgumentException('OrderId must not be empty');
        }
    }

    public function equals(self $other): bool
    {
        return $this->value === $other->value;
    }
}
```

## src/Ordering/Domain/Order.php（Entity）

```php
<?php

declare(strict_types=1);

namespace Acme\Shop\Ordering\Domain;

final class Order
{
    private function __construct(
        private readonly OrderId $id,
        private readonly string $customerId,
        private readonly int $amount,
        private readonly \DateTimeImmutable $createdAt,
    ) {}

    public static function place(OrderId $id, string $customerId, int $amount, \DateTimeImmutable $now): self
    {
        if ($customerId === '') {
            throw new InvalidOrder('customerId is required');
        }
        if ($amount <= 0) {
            throw new InvalidOrder('amount must be positive');
        }
        return new self($id, $customerId, $amount, $now);
    }

    public static function reconstruct(OrderId $id, string $customerId, int $amount, \DateTimeImmutable $createdAt): self
    {
        return new self($id, $customerId, $amount, $createdAt);
    }

    public function id(): OrderId { return $this->id; }
    public function customerId(): string { return $this->customerId; }
    public function amount(): int { return $this->amount; }
    public function createdAt(): \DateTimeImmutable { return $this->createdAt; }
}
```

## src/Ordering/Domain/OrderRepository.php

```php
interface OrderRepository
{
    public function nextId(): OrderId;
    public function save(Order $order): void;
    /** @throws OrderNotFound */
    public function get(OrderId $id): Order;
}
```

## src/Ordering/Application/CreateOrder/CreateOrderHandler.php

```php
final readonly class CreateOrderCommand
{
    public function __construct(public string $customerId, public int $amount) {}
}

final readonly class CreateOrderHandler
{
    public function __construct(
        private OrderRepository $orders,
        private Clock $clock,
    ) {}

    public function __invoke(CreateOrderCommand $command): OrderView
    {
        $order = Order::place($this->orders->nextId(), $command->customerId, $command->amount, $this->clock->now());
        $this->orders->save($order);

        return OrderView::fromOrder($order);
    }
}
```

## tests/Unit/.../CreateOrderHandlerTest.php（Pest）

Application 層のテストは Infrastructure の実装に依存させず、テストダブルを `tests/Support/InMemoryOrderRepository.php`（`Tests\Support` 名前空間）に置く。

```php
it('creates an order', function () {
    $repo = new InMemoryOrderRepository();
    $handler = new CreateOrderHandler($repo, new FixedClock(new DateTimeImmutable('2026-01-01')));

    $view = $handler(new CreateOrderCommand('c1', 1000));

    expect($view->amount)->toBe(1000)
        ->and($repo->get(new OrderId($view->id))->customerId())->toBe('c1');
});

it('rejects non-positive amount', function () {
    $handler = new CreateOrderHandler(new InMemoryOrderRepository(), new FixedClock(new DateTimeImmutable()));
    $handler(new CreateOrderCommand('c1', 0));
})->throws(InvalidOrder::class);
```

## app/Http/Controllers/Order/CreateOrderController.php（Laravel）

```php
final class CreateOrderController
{
    public function __invoke(CreateOrderRequest $request, CreateOrderHandler $handler): JsonResponse
    {
        try {
            $view = $handler(new CreateOrderCommand(
                customerId: $request->string('customer_id')->toString(),
                amount: $request->integer('amount'),
            ));
        } catch (InvalidOrder $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        }

        return response()->json($view, 201);
    }
}
```

## app/Providers/OrderingServiceProvider.php

```php
final class OrderingServiceProvider extends ServiceProvider
{
    public array $bindings = [
        OrderRepository::class => EloquentOrderRepository::class,
        Clock::class => SystemClock::class,
    ];
}
```

## Symfony の場合（config/services.yaml）

```yaml
services:
  _defaults: { autowire: true, autoconfigure: true }
  Acme\Shop\:
    resource: '../src/'
  Acme\Shop\Ordering\Application\Port\Out\OrderRepository:
    alias: Acme\Shop\Ordering\Adapter\Out\Persistence\DoctrineOrderRepository
```
