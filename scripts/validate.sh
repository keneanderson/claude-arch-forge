#!/usr/bin/env bash
# arch-forge の品質ゲート。push 前と CI で実行する。
#   STRICT=1 scripts/validate.sh   # claude CLI が無い場合も失敗にする
set -euo pipefail

cd "$(dirname "$0")/.."
PLUGIN=plugins/arch-forge
fail=0
step() { printf '\n== %s\n' "$*"; }
ng() { echo "NG: $*"; fail=1; }

step "JSON の構文"
for f in .claude-plugin/marketplace.json $PLUGIN/.claude-plugin/plugin.json $PLUGIN/hooks/hooks.json $PLUGIN/templates/decision.schema.json; do
  python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$f" && echo "ok $f" || ng "$f"
done

step "版数の一致（plugin.json と marketplace.json）"
pv=$(python3 -c 'import json;print(json.load(open("'$PLUGIN'/.claude-plugin/plugin.json"))["version"])')
mv=$(python3 -c 'import json;print([p for p in json.load(open(".claude-plugin/marketplace.json"))["plugins"] if p["name"]=="arch-forge"][0]["version"])')
[ "$pv" = "$mv" ] && echo "ok $pv" || ng "plugin.json=$pv marketplace.json=$mv"
grep -q "^## \[$pv\]" CHANGELOG.md && echo "ok CHANGELOG に $pv がある" || ng "CHANGELOG.md に [$pv] の節が無い"

step "frontmatter（agents は name/description/model/tools、skills は name/description）"
for f in $PLUGIN/agents/*.md; do
  for k in name description model tools; do
    sed -n '2,/^---$/p' "$f" | grep -q "^$k:" || ng "$f に $k が無い"
  done
done
for f in $PLUGIN/skills/*/SKILL.md; do
  for k in name description; do
    sed -n '2,/^---$/p' "$f" | grep -q "^$k:" || ng "$f に $k が無い"
  done
done
echo "checked"

step "description に英語の説明がある（英語圏ユーザーの一覧表示と起動判定のため）"
for f in $PLUGIN/agents/*.md $PLUGIN/skills/*/SKILL.md; do
  sed -n '2,/^---$/p' "$f" | grep '^description:' | grep -Eq '[A-Za-z]+ [A-Za-z]+ [A-Za-z]+ [A-Za-z]+' || ng "$f の description に英語の説明が無い"
done
echo "checked"

step "README.md と README.en.md の同期"
[ -f README.en.md ] || ng "README.en.md が無い"
for c in $(grep -o '/arch-forge:[a-z-]*' README.md | sort -u); do
  grep -q -- "$c" README.en.md || ng "README.en.md に $c が無い"
done
for f in $PLUGIN/skills/*/SKILL.md; do
  if grep -q '^disable-model-invocation: true' "$f"; then
    s=$(basename "$(dirname "$f")")
    grep -q "/arch-forge:$s" README.md || ng "README.md にコマンド /arch-forge:$s が無い"
  fi
done
echo "checked"

step "preload されたスキルが実在する"
for s in $(grep -h '^  - arch-forge:' $PLUGIN/agents/*.md | sed 's/.*arch-forge://' | sort -u); do
  [ -f "$PLUGIN/skills/$s/SKILL.md" ] && echo "ok $s" || ng "agents が参照する skill $s が無い"
done

step "rules の paths frontmatter と相互リンク"
for f in $PLUGIN/rules/{go,php,rust}/*.md; do
  head -1 "$f" | grep -q '^---$' || ng "$f に paths frontmatter が無い"
  grep -q '\.\./common/' "$f" || ng "$f が common を参照していない"
done
echo "checked"

step "Workflow スクリプトの構文"
for f in $PLUGIN/workflows/*.js; do
  tmpdir=$(mktemp -d); tmp="$tmpdir/workflow.js"
  { echo '(async function(args, agent, parallel, pipeline, phase, log){'; sed 's/^export const meta/const meta/' "$f"; echo '})'; } > "$tmp"
  node --check "$tmp" && echo "ok $f" || ng "$f"
  rm -rf "$tmpdir"
done

step "Workflow の制御フロー（モック実行）"
node tests/workflows/run.mjs || ng "workflow tests"

step "hooks のテスト"
bash -n $PLUGIN/hooks/run-hook.sh || ng "run-hook.sh の構文"
python3 -m unittest discover -s tests/hooks || ng "hook tests"

step "ツールチェーン検出スクリプト"
bash -n $PLUGIN/scripts/detect-toolchains.sh || ng "detect-toolchains.sh の構文"
bash $PLUGIN/scripts/detect-toolchains.sh report >/dev/null || ng "detect-toolchains.sh report が失敗"
minimal_out="$(env -i HOME=/nonexistent PATH=/usr/bin:/bin bash $PLUGIN/scripts/detect-toolchains.sh report)"
case "$minimal_out" in
  go:*) echo "ok 最小の環境でも動く" ;;
  *) ng "detect-toolchains.sh が最小の環境で動かない" ;;
esac

step "go-arch-lint テンプレート（同梱テンプレートで誤検知なし・違反を検出）"
bash tests/go-arch-lint/run.sh || ng "go-arch-lint テンプレート"

step "claude plugin validate"
if command -v claude >/dev/null 2>&1; then
  claude plugin validate . || ng "marketplace validate"
  claude plugin validate $PLUGIN --strict || ng "plugin validate"
elif [ "${STRICT:-0}" = "1" ]; then
  ng "claude CLI が無い（STRICT=1）"
else
  echo "skipped: claude CLI が無い"
fi

echo
if [ "$fail" -ne 0 ]; then
  echo "validate: FAILED"
  exit 1
fi
echo "validate: OK"
