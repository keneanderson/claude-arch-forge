package domain

import "errors"

var ErrOutOfStock = errors.New("out of stock")

type Order struct{ ID, SKU string }
