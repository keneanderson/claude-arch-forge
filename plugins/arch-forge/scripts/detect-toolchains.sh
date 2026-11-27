#!/usr/bin/env bash
# arch-forge: toolchain detection (runs with only bash and coreutils)
#
# Even when go / php / cargo on PATH are "missing" or "a shim (goenv / asdf / mise) fails because no version is set",
# finds and reports the real installed binaries. Shared so design, generation and verification all use the same judgment.
#
# Usage:
#   detect-toolchains.sh             human-readable format (shown at the start of the design / scaffold skills)
#   detect-toolchains.sh --go-bin    print only the absolute path of a working go, on one line (exit 1 if none)
#   detect-toolchains.sh --env       print an export statement that adds the working binaries' directories to PATH
#
# It is only for display, so it exits 0 even on failure (except --go-bin).
set -u

mode="${1:-report}"

# ---- Helpers ---------------------------------------------------------------------

# "go version go1.26.2 darwin/arm64" → "1.26.2"
semver_of() { printf '%s\n' "$1" | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1; }

# Sort by version, newest first (takes "version<TAB>path" lines)
sort_desc() { sort -t. -k1,1nr -k2,2nr -k3,3nr; }

# List the executable candidate paths, without duplicates
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

# List the go binaries that actually work as "version<TAB>path". Uses GOTOOLCHAIN=local to check the local version itself
working_gos() {
  local g out
  while IFS= read -r g; do
    out="$(GOTOOLCHAIN=local "$g" version 2>/dev/null)" || continue
    case "$out" in go\ version\ go*) ;; *) continue ;; esac
    printf '%s\t%s\n' "$(semver_of "$out")" "$g"
  done < <(go_candidates)
}

pick_go() {
  # Prefer go on PATH if it works (the version the user chose). Otherwise the newest real binary
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
  # $1: the version-check argument, rest: candidates
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

# ---- How to fix version-manager shims -------------------------------------------
# When go on PATH fails through a goenv / asdf shim because "no version is set", placing a version file in the project
# makes go on PATH work as is. Rewriting PATH or running by absolute path makes Claude Code ask for approval
# on every command (go-arch-lint also calls go on PATH), so this is preferred.
# Output: "<file name><TAB><line to write>". Prints nothing if it cannot be fixed or needs no fix
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
  # Use the version chosen as the real binary if that tool has it, otherwise the newest version
  if printf '%s\n' "$vers" | grep -qx "$want"; then
    v="$want"
  else
    v="$(printf '%s\n' "$vers" | grep -E '^[0-9]+\.[0-9]+' | sort_desc | head -1)"
  fi
  [ -n "$v" ] || return 1
  # shellcheck disable=SC2059
  printf '%s\t%s\n' "$file" "$(printf "$line" "$v")"
}

# ---- Modes ------------------------------------------------------------------

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

# ---- Human-readable format --------------------------------------------------------------

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
  [ -n "$tc" ] || tc="unsupported (Go below 1.21)"
  echo "go: found ${go_bin} ($(semver_of "$ver"), GOTOOLCHAIN=${tc})"
  if [ -n "$path_go" ] && [ "$path_go" != "$go_bin" ]; then
    echo "  - go on PATH (${path_go}) fails: ${path_go_err:-unknown error}"
    pin="$(pin_hint "$path_go" "$(semver_of "$ver")" || true)"
    if [ -n "$pin" ]; then
      echo "  - Fix (recommended): put $(printf '%s' "$pin" | cut -f1) at the project root containing \"$(printf '%s' "$pin" | cut -f2)\" (add the line if the file exists). go on PATH then works as is, with no per-command approval"
      echo "  - If that is not possible: prepend $(dirname "$go_bin") to PATH (Claude Code asks for approval every time PATH is changed or a binary is run by absolute path)"
    else
      echo "  - Fix: prepend $(dirname "$go_bin") to PATH (Claude Code asks for approval every time PATH is changed or a binary is run by absolute path)"
    fi
  elif [ -z "$path_go" ]; then
    echo "  - No go on PATH. Use the binary above (prepend $(dirname "$go_bin") to PATH)"
  fi
  others="$(working_gos | sort_desc | awk -F'\t' -v me="$go_bin" '$2 != me { printf "%s %s, ", $2, $1 }')"
  [ -n "$others" ] && echo "  - Other go binaries found: ${others%, }"
  case "$tc" in
    auto|*+auto|path|*+path) echo "  - If the go / toolchain line in go.mod is newer than the local version, GOTOOLCHAIN=${tc} fetches the required version (needs network)" ;;
  esac
else
  if [ -n "$path_go" ]; then
    echo "go: not found (go on PATH fails: ${path_go_err:-unknown}; also checked goenv / asdf / mise / /usr/local/go / Homebrew)"
  else
    echo "go: not found (checked PATH, goenv, asdf, mise, ~/sdk, /usr/local/go, Homebrew)"
  fi
fi
if [ -f go.mod ]; then
  gomod_go="$(awk '$1=="go"{print $2; exit}' go.mod)"
  gomod_tc="$(awk '$1=="toolchain"{print $2; exit}' go.mod)"
  echo "  - go.mod in this directory: go ${gomod_go:-none} / toolchain ${gomod_tc:-none}"
fi

# PHP
php="$(php_bin || true)"
if [ -n "$php" ]; then
  echo "php: found ${php} ($("$php" -r 'echo PHP_VERSION;' 2>/dev/null))"
else
  echo "php: not found (checked PATH, phpenv, asdf, mise, Homebrew)"
fi
composer="$(composer_bin || true)"
[ -n "$composer" ] && echo "  - composer: ${composer} ($("$composer" --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1))"
[ -n "$php" ] && [ -z "$composer" ] && echo "  - composer: not found"

# Rust
cargo="$(cargo_bin || true)"
if [ -n "$cargo" ]; then
  echo "cargo: found ${cargo} ($("$cargo" --version 2>/dev/null | awk '{print $2}'))"
else
  echo "cargo: not found (checked PATH, ~/.cargo/bin, asdf, mise, Homebrew)"
fi

# Auxiliary tools (used to match the generated files to these versions, or to warn in advance)
tools=""
if command -v docker >/dev/null 2>&1; then
  dc="$(docker compose version --short 2>/dev/null || true)"
  tools="${tools}docker compose ${dc:-not found (docker is present)}; "
else
  tools="${tools}docker: not found; "
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
  tools="${tools}golangci-lint ${gl_ver:-?}${gl_go:+ (built with ${gl_go}; cannot analyze code for a newer Go)}; "
fi
for t in go-arch-lint sqlc oapi-codegen buf govulncheck; do
  p="$(find_tool "$t")"
  [ -z "$p" ] && continue
  case "$p" in
    */shims/*) "$p" --help >/dev/null 2>&1 || { tools="${tools}${t}: ${p} (the shim fails; no version set); "; continue; } ;;
  esac
  tools="${tools}${t}: ${p}; "
done
echo "Auxiliary tools: ${tools%; }"
exit 0
