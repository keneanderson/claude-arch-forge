// Package inventory は他モジュールに公開する API だけを置く。
package inventory

import "context"

type StockChecker interface {
	InStock(ctx context.Context, sku string) (bool, error)
}
