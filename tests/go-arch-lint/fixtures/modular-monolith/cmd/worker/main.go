package main

import (
	"context"
	"fmt"

	"example.com/mm/internal/modules/inventory"
)

func main() {
	ok, _ := inventory.New().Stock.InStock(context.Background(), "x")
	fmt.Println(ok)
}
