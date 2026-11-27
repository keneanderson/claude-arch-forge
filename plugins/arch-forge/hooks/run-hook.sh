#!/usr/bin/env bash
# arch-forge hook runner
#
# - Does nothing if the profile (userConfig hook_profile, overridable by an environment variable) is off
# - Does nothing if python3 is not available (a hook failure never stops the session)
# - Delegates the actual work to arch_hooks.py (standard library only)
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
