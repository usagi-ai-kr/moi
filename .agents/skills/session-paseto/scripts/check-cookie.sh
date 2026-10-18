#!/usr/bin/env sh
# Set-Cookie 속성 검증 (ADR-0005): __Host- / Secure / HttpOnly / SameSite=Lax / Path=/ / Domain 부재
# 의존성: curl
# 사용법: sh scripts/check-cookie.sh <url>
# 종료 코드: 0 충족, 1 위반
set -eu

url="${1:?usage: $0 <url>}"
hdr=$(curl -sSD - -o /dev/null "$url" | tr -d '\r')
cookies=$(printf '%s\n' "$hdr" | grep -i '^set-cookie:' || true)

if [ -z "$cookies" ]; then
  echo "FAIL: Set-Cookie 헤더 없음 ($url)"
  exit 1
fi

fail=0
for cond in '__Host-' 'Secure' 'HttpOnly' 'SameSite=Lax' 'Path=/'; do
  if ! printf '%s\n' "$cookies" | grep -q -- "$cond"; then
    echo "FAIL: '$cond' 누락"
    fail=1
  fi
done
if printf '%s\n' "$cookies" | grep -qi 'Domain='; then
  echo "FAIL: Domain 지정 금지"
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "OK: 쿠키 속성 충족 ($url)"
else
  printf '%s\n' "$cookies"
fi
exit "$fail"
