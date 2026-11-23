package usecase

import (
	"context"

	"example.com/mm/internal/modules/inventory/domain"
)

type ItemRepository interface {
	Get(ctx context.Context, sku string) (domain.Item, error)
}

type CheckStock struct{ repo ItemRepository }

func NewCheckStock(r ItemRepository) *CheckStock { return &CheckStock{repo: r} }

func (u *CheckStock) InStock(ctx context.Context, sku string) (bool, error) {
	it, err := u.repo.Get(ctx, sku)
	if err != nil {
		return false, err
	}
	return it.Count > 0, nil
}
