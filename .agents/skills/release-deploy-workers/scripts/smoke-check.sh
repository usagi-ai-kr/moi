#!/usr/bin/env sh
# 배포 환경 기본 smoke 검사 (ADR-0007, 이슈 #5).
# 의존성: curl
# 사용법: sh scripts/smoke-check.sh <base-url>
#   / 는 200, /api/me 는 미인증 401, Cache-Control: no-store 확인. 위반 시 exit 1.
set -eu

base="${1:?usage: $0 <base-url>}"
base="${base%/}"
fail=0

code_root=$(curl -sS -o /dev/null -w '%{http_code}' "$base/")
if [ "$code_root" = "200" ]; then
  echo "OK   / -> 200"
else
  echo "FAIL / -> $code_root (기대 200)"
  fail=1
fi

code_me=$(curl -sS -o /dev/null -w '%{http_code}' "$base/api/me")
if [ "$code_me" = "401" ]; then
  echo "OK   /api/me -> 401 (비로그인)"
else
  echo "FAIL /api/me -> $code_me (기대 401)"
  fail=1
fi

cc=$(curl -sSI "$base/api/me" | tr -d '\r' | grep -i '^cache-control:' || true)
case "$cc" in
  *no-store*) echo "OK   /api/me Cache-Control: no-store" ;;
  *) echo "WARN Cache-Control no-store 미확인: ${cc:-헤더 없음}" ;;
esac

exit "$fail"
