#!/usr/bin/env sh
# 배포 환경 기본 smoke — fail-closed (ADR-0007/0011, 이슈 #5·#12).
# 검사: ① GET / → 200  ② GET /api/me **단일 응답**에서 401 + Cache-Control: no-store 동시 확인
# 누락·불일치 시 exit 1. 입력/네트워크 오류는 exit 2. 응답 원문(Set-Cookie·토큰)은 출력하지 않는다.
# 의존성: curl, sh
# 사용법: sh .agents/skills/release-deploy-workers/scripts/smoke-check.sh <base-url>
set -eu

if [ $# -lt 1 ] || [ -z "${1:-}" ]; then
  echo "usage: $0 <base-url>" >&2
  exit 2
fi
base="${1%/}"

fail=0

# ① / → 200
st=0
code_root=$(curl -sS -o /dev/null -w '%{http_code}' "$base/") || st=$?
if [ "$st" -ne 0 ]; then
  echo "FAIL / — 요청 실패(네트워크/URL 확인)"
  exit 2
fi
if [ "$code_root" = "200" ]; then
  echo "OK   / -> 200"
else
  echo "FAIL / -> $code_root (기대 200)"
  fail=1
fi

# ② /api/me — 단일 요청에서 상태 + Cache-Control 을 함께 검사 (HEAD 혼용 금지)
hdrs=$(mktemp)
st=0
code_me=$(curl -sS -o /dev/null -D "$hdrs" -w '%{http_code}' "$base/api/me") || st=$?
if [ "$st" -ne 0 ]; then
  rm -f "$hdrs"
  echo "FAIL /api/me — 요청 실패(네트워크/URL 확인)"
  exit 2
fi
if [ "$code_me" = "401" ]; then
  echo "OK   /api/me -> 401 (비인증)"
else
  echo "FAIL /api/me -> $code_me (기대 401)"
  fail=1
fi
if tr -d '\r' < "$hdrs" | grep -qiE '^cache-control:.*no-store'; then
  echo "OK   /api/me Cache-Control: no-store (동일 응답)"
else
  echo "FAIL /api/me Cache-Control: no-store 누락 (동일 응답)"
  fail=1
fi
rm -f "$hdrs"

exit "$fail"
