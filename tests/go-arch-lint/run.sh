#!/usr/bin/env bash
# Verifies the go-arch-lint templates
#   1. With templates/go/go-arch-lint.<name>.yml placed in fixtures/<name>, check passes (no false positives)
#   2. Adding one violation makes check fail (nothing is missed)
# Skipped where Go is not found or go-arch-lint cannot be fetched (always runs in CI).
set -u
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
tpl="$repo/plugins/arch-forge/templates/go"
GAL_VERSION="v1.19.2"

# In case go on PATH fails through a shim such as goenv, find the real binary with the detection script
go_bin="$(bash "$repo/plugins/arch-forge/scripts/detect-toolchains.sh" --go-bin 2>/dev/null || true)"
if [ -z "$go_bin" ]; then
  echo "SKIP go-arch-lint template check (go not found)"
  exit 0
fi
export PATH="$(dirname "$go_bin"):$PATH"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
if ! GOBIN="$work/bin" GOFLAGS=-mod=mod go install "github.com/fe3dback/go-arch-lint@$GAL_VERSION" >/dev/null 2>&1; then
  echo "SKIP go-arch-lint template check (cannot fetch go-arch-lint $GAL_VERSION)"
  exit 0
fi
gal="$work/bin/go-arch-lint"
fail=0

check() { (cd "$1" && "$gal" check --output-color=false >"$work/out.txt" 2>&1); }
# Whether it was reported as a violation (as opposed to a config error or load failure)
reported_violation() { grep -qE "shouldn't depend|not allowed" "$work/out.txt"; }

run_case() {
  name="$1" violate_file="$2" violate_import="$3"
  dir="$work/$name-$(basename "$violate_file" .go)"
  cp -R "$here/fixtures/$name" "$dir"
  cp "$tpl/go-arch-lint.$name.yml" "$dir/.go-arch-lint.yml"
  if ! (cd "$dir" && go build ./...) >"$work/out.txt" 2>&1; then
    echo "FAIL ${name}: the fixture does not build"; cat "$work/out.txt"; fail=1; return
  fi
  if check "$dir"; then
    echo "ok   ${name}: no violations in the correct layout"
  else
    echo "FAIL ${name}: violations in the correct layout (false positive)"; cat "$work/out.txt"; fail=1
  fi
  # Inject a violation: import an outer layer (or another module's internals) from an inner layer
  python3 - "$dir/$violate_file" "${violate_import}" <<'PY'
import sys
path, imp = sys.argv[1], sys.argv[2]
src = open(path, encoding="utf-8").read()
pkg = src.split("\n", 1)
src = pkg[0] + f'\n\nimport _ "{imp}"\n' + pkg[1]
open(path, "w", encoding="utf-8").write(src)
PY
  if check "$dir"; then
    echo "FAIL ${name}: did not detect the violation ${violate_file} → ${violate_import}"; fail=1
  elif reported_violation; then
    echo "ok   ${name}: detected the violation (${violate_file} → ${violate_import})"
  else
    echo "FAIL ${name}: check failed for a reason other than a violation"; cat "$work/out.txt"; fail=1
  fi
}

# Pick combinations that do not create an import cycle (a cycle is a load error, not a violation)
run_case clean internal/domain/order.go example.com/shop/internal/config
run_case clean internal/usecase/get_order.go example.com/shop/internal/infrastructure/memory
run_case modular-monolith internal/modules/ordering/usecase/place.go example.com/mm/internal/modules/inventory/usecase
run_case modular-monolith internal/platform/httpserver/server.go example.com/mm/internal/modules/ordering
exit $fail
