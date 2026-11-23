#!/usr/bin/env bash
# go-arch-lint テンプレートの検証
#   1. fixtures/<name> に templates/go/go-arch-lint.<name>.yml を置いて check が通る（誤検知が無い）
#   2. 違反を 1 つ入れると check が失敗する（見逃さない）
# Go が見つからない、または go-arch-lint を取得できない環境では skip する（CI では必ず実行される）。
set -u
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
tpl="$repo/plugins/arch-forge/templates/go"
GAL_VERSION="v1.19.2"

# PATH の go が goenv などのシムで失敗する場合に備え、検出スクリプトで実体を探す
go_bin="$(bash "$repo/plugins/arch-forge/scripts/detect-toolchains.sh" --go-bin 2>/dev/null || true)"
if [ -z "$go_bin" ]; then
  echo "SKIP go-arch-lint テンプレート検証（go が見つからない）"
  exit 0
fi
export PATH="$(dirname "$go_bin"):$PATH"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
if ! GOBIN="$work/bin" GOFLAGS=-mod=mod go install "github.com/fe3dback/go-arch-lint@$GAL_VERSION" >/dev/null 2>&1; then
  echo "SKIP go-arch-lint テンプレート検証（go-arch-lint $GAL_VERSION を取得できない）"
  exit 0
fi
gal="$work/bin/go-arch-lint"
fail=0

check() { (cd "$1" && "$gal" check --output-color=false >"$work/out.txt" 2>&1); }
# 違反として報告されたか（設定エラーや読み込み失敗と区別する）
reported_violation() { grep -qE "shouldn't depend|not allowed" "$work/out.txt"; }

run_case() {
  name="$1" violate_file="$2" violate_import="$3"
  dir="$work/$name-$(basename "$violate_file" .go)"
  cp -R "$here/fixtures/$name" "$dir"
  cp "$tpl/go-arch-lint.$name.yml" "$dir/.go-arch-lint.yml"
  if ! (cd "$dir" && go build ./...) >"$work/out.txt" 2>&1; then
    echo "FAIL ${name}: fixture がビルドできない"; cat "$work/out.txt"; fail=1; return
  fi
  if check "$dir"; then
    echo "ok   ${name}: 正しい構成で違反なし"
  else
    echo "FAIL ${name}: 正しい構成なのに違反が出た（誤検知）"; cat "$work/out.txt"; fail=1
  fi
  # 違反を入れる: 内側の層から外側（または他モジュールの内部）を import する
  python3 - "$dir/$violate_file" "${violate_import}" <<'PY'
import sys
path, imp = sys.argv[1], sys.argv[2]
src = open(path, encoding="utf-8").read()
pkg = src.split("\n", 1)
src = pkg[0] + f'\n\nimport _ "{imp}"\n' + pkg[1]
open(path, "w", encoding="utf-8").write(src)
PY
  if check "$dir"; then
    echo "FAIL ${name}: ${violate_file} → ${violate_import} の違反を検出できない"; fail=1
  elif reported_violation; then
    echo "ok   ${name}: 違反（${violate_file} → ${violate_import}）を検出"
  else
    echo "FAIL ${name}: check が違反以外の理由で失敗した"; cat "$work/out.txt"; fail=1
  fi
}

# import 循環にならない組み合わせを選ぶ（循環だと違反ではなく読み込みエラーになる）
run_case clean internal/domain/order.go example.com/shop/internal/config
run_case clean internal/usecase/get_order.go example.com/shop/internal/infrastructure/memory
run_case modular-monolith internal/modules/ordering/usecase/place.go example.com/mm/internal/modules/inventory/usecase
run_case modular-monolith internal/platform/httpserver/server.go example.com/mm/internal/modules/ordering
exit $fail
