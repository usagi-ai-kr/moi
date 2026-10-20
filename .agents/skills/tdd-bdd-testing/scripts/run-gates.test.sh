#!/usr/bin/env sh
# run-gates.mjs 판정 회귀 테스트 (이슈 #10) — fail-closed 경계 검증.
# 케이스: package.json 부재→0(임시 예외) / 존재하나 잘못된 JSON→1 / 미정의 게이트→1 / 전 게이트 정의→0
# 실행: sh .agents/skills/tdd-bdd-testing/scripts/run-gates.test.sh
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
target="$here/run-gates.mjs"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

fails=0
ok() { echo "  OK: $1"; }
ng() { echo "  FAIL: $1"; fails=1; }

# 1) package.json 부재(ENOENT) → pre-scaffold 임시 예외 exit 0
st=0
out=$(cd "$tmp" && node "$target" 2>&1) || st=$?
[ "$st" -eq 0 ] && ok "부재 → exit 0 (임시 예외)" || ng "부재 → exit $st (기대 0)"

# 2) package.json 존재 + 잘못된 JSON → exit 1 (fail-closed, 예외 위장 금지)
printf '{ invalid json' > "$tmp/package.json"
st=0
out=$(cd "$tmp" && node "$target" 2>&1) || st=$?
[ "$st" -eq 1 ] && ok "잘못된 JSON → exit 1" || ng "잘못된 JSON → exit $st (기대 1)"
printf '%s' "$out" | grep -q 'FAIL' && ok "잘못된 JSON FAIL 표기" || ng "FAIL 표기 없음"

# 3) 필수 게이트 미정의 → exit 1
printf '{"name":"t","scripts":{"lint":"true"}}' > "$tmp/package.json"
st=0
out=$(cd "$tmp" && node "$target" 2>&1) || st=$?
[ "$st" -eq 1 ] && ok "미정의 게이트 → exit 1" || ng "미정의 → exit $st (기대 1)"

# 4) 전 게이트 정의(전부 true) → exit 0
printf '{"name":"t","scripts":{"lint":"true","typecheck":"true","check:architecture":"true","check:notices":"true","test:unit":"true","test:integration":"true","test:bdd":"true","build":"true"}}' > "$tmp/package.json"
st=0
out=$(cd "$tmp" && node "$target" 2>&1) || st=$?
[ "$st" -eq 0 ] && ok "전 게이트 통과 → exit 0" || ng "전 게이트 → exit $st (기대 0)"

if [ "$fails" -eq 0 ]; then
  echo "OK: run-gates 판정 회귀 테스트 통과 (4케이스)"
else
  echo "FAIL: run-gates 판정 회귀 테스트 실패"
  exit 1
fi
