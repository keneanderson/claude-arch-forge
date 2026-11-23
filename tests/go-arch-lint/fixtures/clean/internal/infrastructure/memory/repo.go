package memory

import (
	"context"

	"example.com/shop/internal/domain"
)

type OrderRepository struct{ m map[string]domain.Order }

func NewOrderRepository() *OrderRepository { return &OrderRepository{m: map[string]domain.Order{}} }

func (r *OrderRepository) Find(_ context.Context, id string) (domain.Order, error) {
	o, ok := r.m[id]
	if !ok {
		return domain.Order{}, domain.ErrNotFound
	}
	return o, nil
}
