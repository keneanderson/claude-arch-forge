package usecase_test

import (
	"testing"

	"example.com/shop/internal/usecase"
)

// External test packages (package usecase_test) are also checked by go-arch-lint.
func TestNew(t *testing.T) { _ = usecase.NewGetOrder }
