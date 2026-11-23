package httpserver

import "net/http"

func New(addr string, h http.Handler) *http.Server { return &http.Server{Addr: addr, Handler: h} }
