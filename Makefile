.PHONY: validate test test-hooks test-workflows test-go-arch-lint

# 品質ゲート（push 前に実行する）
validate:
	@bash scripts/validate.sh

test: test-hooks test-workflows test-go-arch-lint

test-hooks:
	@python3 -m unittest discover -s tests/hooks -v

test-workflows:
	@node tests/workflows/run.mjs

# Go が無い環境では skip する
test-go-arch-lint:
	@bash tests/go-arch-lint/run.sh
