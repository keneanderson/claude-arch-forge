package memory

import (
	"context"

	"example.com/mm/internal/modules/inventory/domain"
)

type ItemRepository struct{}

func (ItemRepository) Get(_ context.Context, sku string) (domain.Item, error) {
	return domain.Item{SKU: sku, Count: 1}, nil
}
