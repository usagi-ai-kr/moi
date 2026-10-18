#!/usr/bin/env sh
# new-issue.sh 검증 회귀 테스트 (이슈 #26) — 실패 경로만 검증하며 실제 이슈가 생성되지 않아야 한다.
# 성공 경로(실제 이슈 생성)는 자동 테스트에서 제외 — 수동 확인.
# 실행: sh .agents/skills/issue-triage/scripts/new-issue.test.sh
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
target="$here/new-issue.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM
printf 'test body (검증용)\n' > "$tmp/body.md"

fails=0
ok() { echo "  OK: $1"; }
ng() { echo "  FAIL: $1"; fails=1; }

# 1) 약칭/잘못된 라벨 → exit 2 (네트워크 불필요)
st=0
out=$(sh "$target" f "t" --milestone 0.1.0 "$tmp/body.md" 2>&1) || st=$?
[ "$st" -eq 2 ] && ok "약칭 라벨 거부 exit 2" || ng "약칭 라벨 exit $st (기대 2)"

# 2) --milestone 누락 → exit 2
st=0
out=$(sh "$target" instant "t" "$tmp/body.md" 2>&1) || st=$?
[ "$st" -eq 2 ] && ok "--milestone 누락 exit 2" || ng "--milestone 누락 exit $st (기대 2)"

# 3) 존재하지 않는 Milestone → exit 2 + 이슈 미생성 (gh 인증 필요)
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  st=0
  out=$(sh "$target" instant "test-milestone-validation" --milestone "__no_such_milestone__" "$tmp/body.md" 2>&1) || st=$?
  [ "$st" -eq 2 ] && ok "미존재 Milestone exit 2" || ng "미존재 Milestone exit $st (기대 2)"
  if printf '%s' "$out" | grep -qE 'https?://github\.com/[^ ]+/issues/[0-9]+'; then
    ng "이슈가 생성됨(URL 출력)"
  else
    ok "이슈 미생성(URL 없음)"
  fi
else
  echo "  SKIP: gh 미인증 — 미존재 Milestone 케이스 생략"
fi

if [ "$fails" -eq 0 ]; then
  echo "OK: new-issue 검증 회귀 테스트 통과"
else
  echo "FAIL: new-issue 검증 회귀 테스트 실패"
  exit 1
fi
