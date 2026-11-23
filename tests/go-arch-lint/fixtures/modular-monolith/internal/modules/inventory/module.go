package inventory

import (
	"example.com/mm/internal/modules/inventory/infrastructure/memory"
	"example.com/mm/internal/modules/inventory/usecase"
)

// Module はモジュールの配線（組み立て）だけを行う。
type Module struct{ Stock StockChecker }

func New() *Module {
	return &Module{Stock: usecase.NewCheckStock(memory.ItemRepository{})}
}
