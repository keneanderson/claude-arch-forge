package main

import (
	"net/http"

	httpadapter "example.com/shop/internal/adapter/http"
	"example.com/shop/internal/config"
	"example.com/shop/internal/infrastructure/memory"
	"example.com/shop/internal/usecase"
)

func main() {
	cfg := config.Load()
	mux := http.NewServeMux()
	httpadapter.NewHandler(usecase.NewGetOrder(memory.NewOrderRepository())).Register(mux)
	_ = http.ListenAndServe(cfg.Addr, mux)
}
