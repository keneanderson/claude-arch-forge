package inventory

import (
	"example.com/mm/internal/modules/inventory/infrastructure/memory"
	"example.com/mm/internal/modules/inventory/usecase"
)

// Module only wires (assembles) the module.
type Module struct{ Stock StockChecker }

func New() *Module {
	return &Module{Stock: usecase.NewCheckStock(memory.ItemRepository{})}
}
