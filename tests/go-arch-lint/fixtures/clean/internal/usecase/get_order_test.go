package usecase_test

import (
	"testing"

	"example.com/shop/internal/usecase"
)

// 外部テストパッケージ（package usecase_test）も go-arch-lint の検査対象になる。
func TestNew(t *testing.T) { _ = usecase.NewGetOrder }
