#!/usr/bin/env sh
# 워커 산출물 검증 — 보고서·변경·domain 금지 import·stub 마커 검사 (ADR-0023).
# 사용법: sh .agents/skills/agent-orchestration/scripts/check-worker-output.sh <worktree> <report> [--allow-empty]
# 종료 코드: 0 통과, 1 위반, 2 사용 오류
set -eu

usage='usage: check-worker-output.sh <worktree> <report> [--allow-empty]'
[ $# -ge 2 ] || { echo "$usage" >&2; exit 2; }
worktree=$1
report=$2
allow_empty=0
[ "${3:-}" = "--allow-empty" ] && allow_empty=1

[ -d "$worktree" ] || { echo "FAIL: worktree 없음: $worktree" >&2; exit 1; }
[ -f "$report" ] || { echo "FAIL: 보고서 없음: $report" >&2; exit 1; }
[ -s "$report" ] || { echo "FAIL: 보고서가 비어 있음: $report" >&2; exit 1; }

fail=0
first=$(sed -n '1p' "$report" | tr -d '\r')
case "$first" in
  "status: done"|"status:done") ;;
  *) echo "FAIL: 보고서 첫 줄이 'status: done'이 아님: $first"; fail=1 ;;
esac

if ! grep -Eiq '테스트|test|게이트|gate|통과|pass|OK' "$report"; then
  echo "FAIL: 보고서에 테스트/게이트 증거 문구가 없음"; fail=1
fi

if [ -d "$worktree/src/domain" ]; then
  bad=$(find "$worktree/src/domain" -type f -name '*.ts' -exec grep -nE "from ['\"](drizzle-orm|hono|ky|node:|cloudflare:)" {} + 2>/dev/null || true)
  if [ -n "$bad" ]; then
    echo "FAIL: src/domain에 외부 패키지/런타임 import:"
    printf '%s\n' "$bad" | sed 's#^#  #'
    fail=1
  fi
fi

markers=$(grep -Rn '_unusedMarker' "$worktree/src" 2>/dev/null || true)
if [ -n "$markers" ]; then
  echo "FAIL: stub/오염 마커(_unusedMarker) 발견:"
  printf '%s\n' "$markers" | sed 's#^#  #'
  fail=1
fi

if [ "$allow_empty" -eq 0 ]; then
  changes=$(git -C "$worktree" status --porcelain 2>/dev/null || true)
  [ -n "$changes" ] || { echo "FAIL: 워크트리에 변경이 없음(--allow-empty로 리뷰 단위 허용)"; fail=1; }
fi

if [ "$fail" -ne 0 ]; then
  echo "FAIL: 워커 산출물 검증 위반"
  exit 1
fi
echo "OK: 워커 산출물 검증 통과 ($worktree)"
