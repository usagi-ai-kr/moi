#!/usr/bin/env sh
# 회귀 테스트: check-worker-output.sh (ADR-0023)
# 사용법: sh .agents/skills/agent-orchestration/scripts/check-worker-output.test.sh (repo root)
set -eu

ROOT=$(pwd)
SCRIPT_REL=".agents/skills/agent-orchestration/scripts/check-worker-output.sh"
pass=0
fail=0
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT INT TERM

ok() { pass=$((pass + 1)); echo "PASS $1"; }
ng() { fail=$((fail + 1)); echo "FAIL $1"; }

mk_case() {
  dir="$TMP/$1"
  mkdir -p "$dir/src/domain"
  git -C "$dir" init -q
  printf 'status: done\n테스트 통과 · run-gates OK\n' > "$dir/report.md"
  printf 'export const ok = true;\n' > "$dir/src/domain/ok.ts"
  printf '%s' "$dir"
}

# ① 정상(변경 있음) → 0
d=$(mk_case case1)
if sh "$ROOT/$SCRIPT_REL" "$d" "$d/report.md" >/dev/null 2>&1; then ok "① 정상 산출물 exit 0"; else ng "① 정상 산출물이 실패"; fi

# ② domain 외부 import → 1
d=$(mk_case case2)
printf "import { x } from 'drizzle-orm';\nexport const bad = x;\n" > "$d/src/domain/bad.ts"
if sh "$ROOT/$SCRIPT_REL" "$d" "$d/report.md" >/dev/null 2>&1; then ng "② domain 외부 import가 통과"; else ok "② domain 외부 import exit 1"; fi

# ③ 보고서 누락 → 1
d=$(mk_case case3)
if sh "$ROOT/$SCRIPT_REL" "$d" "$d/missing.md" >/dev/null 2>&1; then ng "③ 보고서 누락이 통과"; else ok "③ 보고서 누락 exit 1"; fi

# ④ 보고서 증거 문구 없음 → 1
d=$(mk_case case4)
printf 'status: done\n완료했습니다.\n' > "$d/report.md"
if sh "$ROOT/$SCRIPT_REL" "$d" "$d/report.md" >/dev/null 2>&1; then ng "④ 증거 없는 보고서가 통과"; else ok "④ 증거 없는 보고서 exit 1"; fi

# ⑤ stub/오염 마커 → 1
d=$(mk_case case5)
printf 'export const _unusedMarker = 1;\n' > "$d/src/domain/marker.ts"
if sh "$ROOT/$SCRIPT_REL" "$d" "$d/report.md" >/dev/null 2>&1; then ng "⑤ _unusedMarker가 통과"; else ok "⑤ _unusedMarker exit 1"; fi

# ⑥ 변경 없는 리뷰 단위 --allow-empty → 0
d="$TMP/case6"
mkdir -p "$d/src/domain"
git -C "$d" init -q
printf 'status: done\n리뷰 통과 OK\n' > "$d/report.md"
if sh "$ROOT/$SCRIPT_REL" "$d" "$d/report.md" --allow-empty >/dev/null 2>&1; then ok "⑥ --allow-empty 리뷰 exit 0"; else ng "⑥ --allow-empty 리뷰가 실패"; fi

echo "---"
echo "결과: PASS $pass / FAIL $fail"
[ "$fail" -eq 0 ]
