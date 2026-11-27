// Package inventory holds only the API exposed to other modules.
package inventory

import "context"

type StockChecker interface {
	InStock(ctx context.Context, sku string) (bool, error)
}
