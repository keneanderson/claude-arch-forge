#!/usr/bin/env bash
# arch-forge: ツールチェーンの検出（bash と coreutils だけで動かす）
#
# PATH の go / php / cargo が「無い」または「シム（goenv / asdf / mise）が版未設定で失敗する」場合でも、
# 実際にインストールされている実体を探して報告する。設計・生成・検証の各段で同じ判定を使うために共有する。
#
# 使い方:
#   detect-toolchains.sh             人が読む形式（design / scaffold スキルの冒頭で表示）
#   detect-toolchains.sh --go-bin    使える go の絶対パスだけを 1 行で出す（無ければ exit 1）
#   detect-toolchains.sh --env       使える実体のディレクトリを PATH に足す export 文を出す
#
# 表示だけが目的なので、失敗しても exit 0 で終わる（--go-bin を除く）。
set -u

mode="${1:-report}"

# ---- 補助 ---------------------------------------------------------------------

# "go version go1.26.2 darwin/arm64" → "1.26.2"
semver_of() { printf '%s\n' "$1" | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1; }

# 版の大きい順に並べる（"版<TAB>パス" の行を受け取る）
sort_desc() { sort -t. -k1,1nr -k2,2nr -k3,3nr; }

# 候補パスのうち実行できるものを重複なく列挙する
expand_candidates() {
  local seen="" p
  for p in "$@"; do
    [ -x "$p" ] || continue
    case " $seen " in *" $p "*) continue ;; esac
    seen="$seen $p"
    printf '%s\n' "$p"
  done
}

# ---- Go ----------------------------------------------------------------------

go_candidates() {
  local goenv_root="${GOENV_ROOT:-$HOME/.goenv}"
  local path_go
  path_go="$(command -v go 2>/dev/null || true)"
  # shellcheck disable=SC2086
  expand_candidates \
    $path_go \
    "$goenv_root"/versions/*/bin/go \
    "$HOME"/.asdf/installs/golang/*/go/bin/go \
    "$HOME"/.local/share/mise/installs/go/*/bin/go \
    "$HOME"/sdk/go*/bin/go \
    /usr/local/go/bin/go \
    /opt/homebrew/bin/go \
    /opt/homebrew/opt/go/bin/go \
    /usr/local/bin/go \
    /usr/lib/go/bin/go \
    /snap/bin/go
}

# 実際に動く go を "版<TAB>パス" で列挙する。GOTOOLCHAIN=local で、手元の版そのものを調べる
working_gos() {
  local g out
  while IFS= read -r g; do
    out="$(GOTOOLCHAIN=local "$g" version 2>/dev/null)" || continue
    case "$out" in go\ version\ go*) ;; *) continue ;; esac
    printf '%s\t%s\n' "$(semver_of "$out")" "$g"
  done < <(go_candidates)
}

pick_go() {
  # PATH の go が動けばそれを優先する（ユーザーが選んだ版）。動かなければ最も新しい実体
  local path_go
  path_go="$(command -v go 2>/dev/null || true)"
  if [ -n "$path_go" ] && GOTOOLCHAIN=local "$path_go" version >/dev/null 2>&1; then
    printf '%s\n' "$path_go"
    return 0
  fi
  working_gos | sort_desc | head -1 | cut -f2
}

# ---- PHP / Rust --------------------------------------------------------------

pick_first_working() {
  # $1: バージョン確認の引数, 以降: 候補
  local arg="$1" p
  shift
  while IFS= read -r p; do
    if "$p" $arg >/dev/null 2>&1; then
      printf '%s\n' "$p"
      return 0
    fi
  done < <(expand_candidates "$@")
  return 1
}

php_bin() {
  # shellcheck disable=SC2046
  pick_first_working "-v" \
    $(command -v php 2>/dev/null || true) \
    "$HOME"/.phpenv/versions/*/bin/php \
    "$HOME"/.asdf/installs/php/*/bin/php \
    "$HOME"/.local/share/mise/installs/php/*/bin/php \
    /opt/homebrew/bin/php /opt/homebrew/opt/php*/bin/php /usr/local/bin/php /usr/bin/php
}

composer_bin() {
  # shellcheck disable=SC2046
  pick_first_working "--version" \
    $(command -v composer 2>/dev/null || true) \
    /opt/homebrew/bin/composer /usr/local/bin/composer "$HOME"/.composer/vendor/bin/composer
}

cargo_bin() {
  # shellcheck disable=SC2046
  pick_first_working "--version" \
    $(command -v cargo 2>/dev/null || true) \
    "$HOME"/.cargo/bin/cargo \
    "$HOME"/.asdf/installs/rust/*/bin/cargo \
    "$HOME"/.local/share/mise/installs/rust/*/bin/cargo \
    /opt/homebrew/bin/cargo /usr/local/bin/cargo
}

# ---- バージョン管理ツールのシムを直す方法 -------------------------------------------
# PATH の go が goenv / asdf のシムで「版が未設定」で失敗する場合、プロジェクトに版のファイルを置けば
# PATH の go がそのまま動く。PATH を書き換えたり絶対パスで実行したりすると、Claude Code では
# コマンドごとに承認が必要になる（go-arch-lint も PATH の go を呼ぶ）ので、こちらを優先する。
# 出力: "<ファイル名><TAB><書く行>"。直せない・直す必要が無い場合は何も出さない
pin_hint() {
  local path_go="$1" want="$2" goenv_root="${GOENV_ROOT:-$HOME/.goenv}" vers v file line
  [ -n "$path_go" ] || return 1
  GOTOOLCHAIN=local "$path_go" version >/dev/null 2>&1 && return 1
  case "$path_go" in
    "$goenv_root"/shims/*|*/.goenv/shims/*)
      vers="$(ls -1 "$goenv_root"/versions 2>/dev/null)"; file=".go-version"; line="%s" ;;
    */.asdf/shims/*)
      vers="$(ls -1 "$HOME"/.asdf/installs/golang 2>/dev/null)"; file=".tool-versions"; line="golang %s" ;;
    *) return 1 ;;
  esac
  [ -n "$vers" ] || return 1
  # 実体として選んだ版がそのツールに入っていればそれを、無ければ最も新しい版を使う
  if printf '%s\n' "$vers" | grep -qx "$want"; then
    v="$want"
  else
    v="$(printf '%s\n' "$vers" | grep -E '^[0-9]+\.[0-9]+' | sort_desc | head -1)"
  fi
  [ -n "$v" ] || return 1
  # shellcheck disable=SC2059
  printf '%s\t%s\n' "$file" "$(printf "$line" "$v")"
}

# ---- モード ------------------------------------------------------------------

if [ "$mode" = "--pin" ]; then
  g="$(pick_go)"
  w=""
  [ -n "$g" ] && w="$(semver_of "$(GOTOOLCHAIN=local "$g" version 2>/dev/null)")"
  pin_hint "$(command -v go 2>/dev/null || true)" "$w" || exit 1
  exit 0
fi

if [ "$mode" = "--go-bin" ]; then
  g="$(pick_go)"
  [ -n "$g" ] || exit 1
  printf '%s\n' "$g"
  exit 0
fi

if [ "$mode" = "--env" ]; then
  dirs=""
  g="$(pick_go)"; [ -n "$g" ] && dirs="$dirs:$(dirname "$g")"
  p="$(php_bin || true)"; [ -n "$p" ] && dirs="$dirs:$(dirname "$p")"
  c="$(composer_bin || true)"; [ -n "$c" ] && dirs="$dirs:$(dirname "$c")"
  r="$(cargo_bin || true)"; [ -n "$r" ] && dirs="$dirs:$(dirname "$r")"
  [ -n "$g" ] && [ -d "$HOME/go/bin" ] && dirs="$dirs:$HOME/go/bin"
  if [ -n "$dirs" ]; then
    printf 'export PATH="%s:$PATH"\n' "${dirs#:}"
  fi
  exit 0
fi

# ---- 人が読む形式 --------------------------------------------------------------

# Go
path_go="$(command -v go 2>/dev/null || true)"
path_go_err=""
if [ -n "$path_go" ]; then
  path_go_err="$(GOTOOLCHAIN=local "$path_go" version 2>&1 >/dev/null | head -1)"
  GOTOOLCHAIN=local "$path_go" version >/dev/null 2>&1 && path_go_err=""
fi
go_bin="$(pick_go)"
if [ -n "$go_bin" ]; then
  ver="$(GOTOOLCHAIN=local "$go_bin" version 2>/dev/null)"
  tc="$("$go_bin" env GOTOOLCHAIN 2>/dev/null)"
  [ -n "$tc" ] || tc="未対応（Go 1.21 未満）"
  echo "go: あり ${go_bin}（$(semver_of "$ver")、GOTOOLCHAIN=${tc}）"
  if [ -n "$path_go" ] && [ "$path_go" != "$go_bin" ]; then
    echo "  - PATH の go（${path_go}）は失敗する: ${path_go_err:-不明なエラー}"
    pin="$(pin_hint "$path_go" "$(semver_of "$ver")" || true)"
    if [ -n "$pin" ]; then
      echo "  - 直し方（推奨）: プロジェクトのルートに $(printf '%s' "$pin" | cut -f1) を置き、「$(printf '%s' "$pin" | cut -f2)」と書く（既にあれば行を足す）。PATH の go がそのまま動き、コマンドごとの承認も要らない"
      echo "  - 直せない場合: PATH の先頭に $(dirname "$go_bin") を足す（Claude Code では PATH の変更や絶対パスでの実行に毎回承認が要る）"
    else
      echo "  - 直し方: PATH の先頭に $(dirname "$go_bin") を足す（Claude Code では PATH の変更や絶対パスでの実行に毎回承認が要る）"
    fi
  elif [ -z "$path_go" ]; then
    echo "  - PATH に go が無い。上の実体を使う（PATH の先頭に $(dirname "$go_bin") を足す）"
  fi
  others="$(working_gos | sort_desc | awk -F'\t' -v me="$go_bin" '$2 != me { printf "%s %s, ", $2, $1 }')"
  [ -n "$others" ] && echo "  - 他に見つかった go: ${others%, }"
  case "$tc" in
    auto|*+auto|path|*+path) echo "  - go.mod の go / toolchain 行が手元より新しい場合、GOTOOLCHAIN=${tc} により必要な版が取得される（ネットワークが必要）" ;;
  esac
else
  if [ -n "$path_go" ]; then
    echo "go: なし（PATH の go は失敗: ${path_go_err:-不明}。goenv / asdf / mise / /usr/local/go / Homebrew も確認した）"
  else
    echo "go: なし（PATH、goenv、asdf、mise、~/sdk、/usr/local/go、Homebrew を確認した）"
  fi
fi
if [ -f go.mod ]; then
  gomod_go="$(awk '$1=="go"{print $2; exit}' go.mod)"
  gomod_tc="$(awk '$1=="toolchain"{print $2; exit}' go.mod)"
  echo "  - このディレクトリの go.mod: go ${gomod_go:-なし} / toolchain ${gomod_tc:-なし}"
fi

# PHP
php="$(php_bin || true)"
if [ -n "$php" ]; then
  echo "php: あり ${php}（$("$php" -r 'echo PHP_VERSION;' 2>/dev/null)）"
else
  echo "php: なし（PATH、phpenv、asdf、mise、Homebrew を確認した）"
fi
composer="$(composer_bin || true)"
[ -n "$composer" ] && echo "  - composer: ${composer}（$("$composer" --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)）"
[ -n "$php" ] && [ -z "$composer" ] && echo "  - composer: なし"

# Rust
cargo="$(cargo_bin || true)"
if [ -n "$cargo" ]; then
  echo "cargo: あり ${cargo}（$("$cargo" --version 2>/dev/null | awk '{print $2}')）"
else
  echo "cargo: なし（PATH、~/.cargo/bin、asdf、mise、Homebrew を確認した）"
fi

# 補助ツール（生成物をこれらの版に合わせるか、事前に警告するために使う）
tools=""
if command -v docker >/dev/null 2>&1; then
  dc="$(docker compose version --short 2>/dev/null || true)"
  tools="${tools}docker compose ${dc:-なし（docker はある）}; "
else
  tools="${tools}docker: なし; "
fi
find_tool() {
  local name="$1" p
  p="$(command -v "$name" 2>/dev/null || true)"
  [ -z "$p" ] && [ -x "$HOME/go/bin/$name" ] && p="$HOME/go/bin/$name"
  printf '%s' "$p"
}
gl="$(find_tool golangci-lint)"
if [ -n "$gl" ]; then
  glv="$("$gl" version 2>/dev/null | head -1)"
  gl_ver="$(printf '%s' "$glv" | grep -oE 'version v?[0-9]+\.[0-9]+\.[0-9]+' | head -1 | awk '{print $2}')"
  gl_go="$(printf '%s' "$glv" | grep -oE 'go[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1)"
  tools="${tools}golangci-lint ${gl_ver:-?}${gl_go:+（${gl_go} でビルド。これより新しい Go のコードは解析できない）}; "
fi
for t in go-arch-lint sqlc oapi-codegen buf govulncheck; do
  p="$(find_tool "$t")"
  [ -z "$p" ] && continue
  case "$p" in
    */shims/*) "$p" --help >/dev/null 2>&1 || { tools="${tools}${t}: ${p}（シムが失敗する。版が未設定）; "; continue; } ;;
  esac
  tools="${tools}${t}: ${p}; "
done
echo "補助ツール: ${tools%; }"
exit 0
