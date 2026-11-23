package ordering

import (
	"net/http"

	"example.com/mm/internal/modules/inventory"
	httpadapter "example.com/mm/internal/modules/ordering/adapter/http"
	"example.com/mm/internal/modules/ordering/infrastructure/memory"
	"example.com/mm/internal/modules/ordering/usecase"
)

type Module struct{ h *httpadapter.Handler }

// New は他モジュールの公開 API（inventory.StockChecker）だけを受け取って配線する。
func New(stock inventory.StockChecker) *Module {
	return &Module{h: httpadapter.NewHandler(usecase.NewPlaceOrder(stock, memory.OrderRepository{}))}
}

func (m *Module) RegisterRoutes(mux *http.ServeMux) { m.h.Register(mux) }
