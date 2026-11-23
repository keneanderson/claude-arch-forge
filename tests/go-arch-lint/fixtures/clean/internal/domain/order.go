package domain

import "errors"

var ErrNotFound = errors.New("not found")

type Order struct{ ID string }
