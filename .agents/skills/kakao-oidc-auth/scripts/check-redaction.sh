#!/usr/bin/env sh
# 로그/텍스트에서 토큰·인가 코드·시크릿 노출 패턴을 탐지한다 (ADR-0006).
# 의존성: sh, grep -E
# 사용법: sh scripts/check-redaction.sh <file ...>   (인자 없으면 stdin)
# 종료 코드: 0 미검출, 1 검출, 2 grep 오류
set -eu

[ $# -eq 0 ] && set -- -

if out=$(grep -nHE \
  -e 'v4\.local\.' \
  -e 'eyJ[A-Za-z0-9_-]{16,}\.' \
  -e '[?&]code=[A-Za-z0-9_-]{20,}' \
  -e '(client_secret|CLIENT_SECRET|PASETO_KEY)[=: ]+[A-Za-z0-9+/_-]{16,}' \
  -- "$@" 2>/dev/null); then
  echo "FAIL: 민감정보 패턴 검출"
  printf '%s\n' "$out"
  exit 1
fi

echo "OK: 민감정보 패턴 미검출"
