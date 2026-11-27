#!/usr/bin/env bash
# Quality gate for arch-forge. Run before pushing and in CI.
#   STRICT=1 scripts/validate.sh   # also fail when the claude CLI is missing
set -euo pipefail

cd "$(dirname "$0")/.."
PLUGIN=plugins/arch-forge
fail=0
step() { printf '\n== %s\n' "$*"; }
ng() { echo "NG: $*"; fail=1; }

step "JSON syntax"
for f in .claude-plugin/marketplace.json $PLUGIN/.claude-plugin/plugin.json $PLUGIN/hooks/hooks.json $PLUGIN/templates/decision.schema.json; do
  python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$f" && echo "ok $f" || ng "$f"
done

step "Versions match (plugin.json and marketplace.json)"
pv=$(python3 -c 'import json;print(json.load(open("'$PLUGIN'/.claude-plugin/plugin.json"))["version"])')
mv=$(python3 -c 'import json;print([p for p in json.load(open(".claude-plugin/marketplace.json"))["plugins"] if p["name"]=="arch-forge"][0]["version"])')
[ "$pv" = "$mv" ] && echo "ok $pv" || ng "plugin.json=$pv marketplace.json=$mv"
grep -q "^## \[$pv\]" CHANGELOG.md && echo "ok CHANGELOG has $pv" || ng "CHANGELOG.md has no [$pv] section"

step "frontmatter (agents: name/description/model/tools, skills: name/description)"
for f in $PLUGIN/agents/*.md; do
  for k in name description model tools; do
    sed -n '2,/^---$/p' "$f" | grep -q "^$k:" || ng "$f has no $k"
  done
done
for f in $PLUGIN/skills/*/SKILL.md; do
  for k in name description; do
    sed -n '2,/^---$/p' "$f" | grep -q "^$k:" || ng "$f has no $k"
  done
done
echo "checked"

step "English only (no CJK text outside the hook's multilingual ADR status regex)"
python3 - <<'PY' || fail=1
import re, subprocess, sys
cjk = re.compile(r"[\u3000-\u303f\u3040-\u30ff\u3400-\u9fff\uff00-\uffef]")
# ADRs are written in the user's language, so the hook also matches Japanese status words.
allowed = {("plugins/arch-forge/hooks/arch_hooks.py", "ACCEPTED_RE"), ("plugins/arch-forge/hooks/arch_hooks.py", "SUPERSEDE_RE")}
bad = 0
for path in subprocess.run(["git", "ls-files"], capture_output=True, text=True, check=True).stdout.split():
    try:
        lines = open(path, encoding="utf-8").read().splitlines()
    except (UnicodeDecodeError, FileNotFoundError, IsADirectoryError):
        continue
    for i, line in enumerate(lines):
        if not cjk.search(line):
            continue
        context = "\n".join(lines[max(0, i - 2):i + 1])
        if any(path == p and name in context for p, name in allowed):
            continue
        print(f"NG: {path}:{i + 1}: {line.strip()[:80]}")
        bad = 1
print("checked")
sys.exit(bad)
PY

step "README lists every user-invoked command"
for f in $PLUGIN/skills/*/SKILL.md; do
  if grep -q '^disable-model-invocation: true' "$f"; then
    s=$(basename "$(dirname "$f")")
    grep -q "/arch-forge:$s" README.md || ng "README.md does not mention /arch-forge:$s"
  fi
done
echo "checked"

step "Preloaded skills exist"
for s in $(grep -h '^  - arch-forge:' $PLUGIN/agents/*.md | sed 's/.*arch-forge://' | sort -u); do
  [ -f "$PLUGIN/skills/$s/SKILL.md" ] && echo "ok $s" || ng "skill $s referenced by agents does not exist"
done

step "rules paths frontmatter and cross-links"
for f in $PLUGIN/rules/{go,php,rust}/*.md; do
  head -1 "$f" | grep -q '^---$' || ng "$f has no paths frontmatter"
  grep -q '\.\./common/' "$f" || ng "$f does not reference common"
done
echo "checked"

step "Workflow script syntax"
for f in $PLUGIN/workflows/*.js; do
  tmpdir=$(mktemp -d); tmp="$tmpdir/workflow.js"
  { echo '(async function(args, agent, parallel, pipeline, phase, log){'; sed 's/^export const meta/const meta/' "$f"; echo '})'; } > "$tmp"
  node --check "$tmp" && echo "ok $f" || ng "$f"
  rm -rf "$tmpdir"
done

step "Workflow control flow (mocked run)"
node tests/workflows/run.mjs || ng "workflow tests"

step "Hook tests"
bash -n $PLUGIN/hooks/run-hook.sh || ng "run-hook.sh syntax"
python3 -m unittest discover -s tests/hooks || ng "hook tests"

step "Toolchain detection script"
bash -n $PLUGIN/scripts/detect-toolchains.sh || ng "detect-toolchains.sh syntax"
bash $PLUGIN/scripts/detect-toolchains.sh report >/dev/null || ng "detect-toolchains.sh report failed"
minimal_out="$(env -i HOME=/nonexistent PATH=/usr/bin:/bin bash $PLUGIN/scripts/detect-toolchains.sh report)"
case "$minimal_out" in
  go:*) echo "ok works in a minimal environment" ;;
  *) ng "detect-toolchains.sh does not work in a minimal environment" ;;
esac

step "go-arch-lint templates (no false positives with the bundled templates, violations detected)"
bash tests/go-arch-lint/run.sh || ng "go-arch-lint templates"

step "claude plugin validate"
if command -v claude >/dev/null 2>&1; then
  claude plugin validate . || ng "marketplace validate"
  claude plugin validate $PLUGIN --strict || ng "plugin validate"
elif [ "${STRICT:-0}" = "1" ]; then
  ng "claude CLI not found (STRICT=1)"
else
  echo "skipped: claude CLI not found"
fi

echo
if [ "$fail" -ne 0 ]; then
  echo "validate: FAILED"
  exit 1
fi
echo "validate: OK"
