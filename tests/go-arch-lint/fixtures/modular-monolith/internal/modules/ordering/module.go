package ordering

import (
	"net/http"

	"example.com/mm/internal/modules/inventory"
	httpadapter "example.com/mm/internal/modules/ordering/adapter/http"
	"example.com/mm/internal/modules/ordering/infrastructure/memory"
	"example.com/mm/internal/modules/ordering/usecase"
)

type Module struct{ h *httpadapter.Handler }

// New wires the module, taking only other modules' public APIs (inventory.StockChecker).
func New(stock inventory.StockChecker) *Module {
	return &Module{h: httpadapter.NewHandler(usecase.NewPlaceOrder(stock, memory.OrderRepository{}))}
}

func (m *Module) RegisterRoutes(mux *http.ServeMux) { m.h.Register(mux) }
