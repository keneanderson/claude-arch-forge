.PHONY: validate test test-hooks test-workflows test-go-arch-lint

# Quality gate (run before pushing)
validate:
	@bash scripts/validate.sh

test: test-hooks test-workflows test-go-arch-lint

test-hooks:
	@python3 -m unittest discover -s tests/hooks -v

test-workflows:
	@node tests/workflows/run.mjs

# Skipped where Go is not available
test-go-arch-lint:
	@bash tests/go-arch-lint/run.sh
