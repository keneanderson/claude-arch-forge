package usecase

import (
	"context"

	"example.com/mm/internal/modules/ordering/domain"
)

// StockChecker is the stock-check port ordering needs (defined on the consumer side).
type StockChecker interface {
	InStock(ctx context.Context, sku string) (bool, error)
}

type OrderRepository interface {
	Save(ctx context.Context, o domain.Order) error
}

type PlaceOrder struct {
	stock StockChecker
	repo  OrderRepository
}

func NewPlaceOrder(s StockChecker, r OrderRepository) *PlaceOrder { return &PlaceOrder{stock: s, repo: r} }

func (u *PlaceOrder) Execute(ctx context.Context, o domain.Order) error {
	ok, err := u.stock.InStock(ctx, o.SKU)
	if err != nil {
		return err
	}
	if !ok {
		return domain.ErrOutOfStock
	}
	return u.repo.Save(ctx, o)
}
