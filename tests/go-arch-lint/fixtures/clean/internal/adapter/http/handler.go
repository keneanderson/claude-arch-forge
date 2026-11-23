package httpadapter

import (
	"net/http"

	"example.com/shop/internal/usecase"
)

type Handler struct{ get *usecase.GetOrder }

func NewHandler(g *usecase.GetOrder) *Handler { return &Handler{get: g} }

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /orders/{id}", func(w http.ResponseWriter, r *http.Request) {
		o, err := h.get.Execute(r.Context(), r.PathValue("id"))
		if err != nil {
			w.WriteHeader(404)
			return
		}
		_, _ = w.Write([]byte(o.ID))
	})
}
