package usecase

import (
	"context"

	"example.com/shop/internal/domain"
)

type OrderRepository interface {
	Find(ctx context.Context, id string) (domain.Order, error)
}

type GetOrder struct{ repo OrderRepository }

func NewGetOrder(r OrderRepository) *GetOrder { return &GetOrder{repo: r} }

func (u *GetOrder) Execute(ctx context.Context, id string) (domain.Order, error) {
	return u.repo.Find(ctx, id)
}
