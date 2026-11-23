package main

import (
	"net/http"

	"example.com/mm/internal/config"
	"example.com/mm/internal/modules/inventory"
	"example.com/mm/internal/modules/ordering"
	"example.com/mm/internal/platform/httpserver"
)

func main() {
	cfg := config.Load()
	mux := http.NewServeMux()
	inv := inventory.New()
	ordering.New(inv.Stock).RegisterRoutes(mux)
	_ = httpserver.New(cfg.Addr, mux).ListenAndServe()
}
