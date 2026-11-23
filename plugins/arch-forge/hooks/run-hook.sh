#!/usr/bin/env bash
# arch-forge hook ランナー
#
# - プロファイル（userConfig の hook_profile、環境変数で上書き可）が off なら何もしない
# - python3 が無い環境では何もしない（hook の失敗でセッションを止めない）
# - 実処理は arch_hooks.py（標準ライブラリのみ）に委譲する
set -u

profile="${ARCH_FORGE_HOOK_PROFILE:-${CLAUDE_PLUGIN_OPTION_HOOK_PROFILE:-standard}}"
if [ "$profile" = "off" ]; then
  exit 0
fi

case "$0" in
  */*) script_dir="${0%/*}" ;;
  *) script_dir="." ;;
esac

if ! command -v python3 >/dev/null 2>&1; then
  exit 0
fi

ARCH_FORGE_HOOK_PROFILE="$profile" exec python3 -I "$script_dir/arch_hooks.py" "$@"
