package memory

import (
	"context"

	"example.com/mm/internal/modules/ordering/domain"
)

type OrderRepository struct{}

func (OrderRepository) Save(context.Context, domain.Order) error { return nil }
