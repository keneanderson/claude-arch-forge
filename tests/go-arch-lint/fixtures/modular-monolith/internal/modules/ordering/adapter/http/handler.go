package httpadapter

import (
	"net/http"

	"example.com/mm/internal/modules/ordering/domain"
	"example.com/mm/internal/modules/ordering/usecase"
)

type Handler struct{ place *usecase.PlaceOrder }

func NewHandler(p *usecase.PlaceOrder) *Handler { return &Handler{place: p} }

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /orders/{sku}", func(w http.ResponseWriter, r *http.Request) {
		if err := h.place.Execute(r.Context(), domain.Order{ID: "1", SKU: r.PathValue("sku")}); err != nil {
			w.WriteHeader(409)
			return
		}
		w.WriteHeader(201)
	})
}
