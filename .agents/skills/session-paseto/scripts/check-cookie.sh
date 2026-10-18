#!/usr/bin/env sh
# 대상 쿠키의 Set-Cookie 속성 검증 (ADR-0005, 이슈 #11):
#   __Host- / Secure / HttpOnly / SameSite=Lax / Path=/ / Domain 부재 / Max-Age(세션 또는 삭제)
# 대상 쿠키 헤더만 개별 평가한다 — 다른 쿠키의 속성과 합산하지 않는다(거짓 통과 금지).
# 쿠키 값(원문)은 출력하지 않는다.
# 의존성: curl(URL 모드)
# 사용법: sh .agents/skills/session-paseto/scripts/check-cookie.sh <url>
#         sh .agents/skills/session-paseto/scripts/check-cookie.sh --headers-file <file>
# 환경변수: COOKIE_NAME (기본: __Host-moi_session)
# 종료 코드: 0 충족, 1 위반, 2 입력/네트워크 오류
set -eu

cookie_name="${COOKIE_NAME:-__Host-moi_session}"

case "${1:-}" in
  --headers-file)
    [ $# -ge 2 ] || { echo "usage: $0 --headers-file <file> | <url>" >&2; exit 2; }
    f=$2
    [ -r "$f" ] || { echo "FAIL: 읽을 수 없는 파일: $f" >&2; exit 2; }
    hdr=$(tr -d '\r' < "$f")
    ;;
  '')
    echo "usage: $0 --headers-file <file> | <url>" >&2
    exit 2
    ;;
  *)
    url=$1
    hdr=$(curl -sSD - -o /dev/null "$url" | tr -d '\r') || { echo "FAIL: 요청 실패: $url" >&2; exit 2; }
    ;;
esac

lines=$(printf '%s\n' "$hdr" | grep -i '^set-cookie:' || true)
target=$(printf '%s\n' "$lines" | grep -iE "^set-cookie:[[:space:]]*${cookie_name}=" || true)

if [ -z "$target" ]; then
  echo "FAIL: $cookie_name Set-Cookie 헤더 없음"
  exit 1
fi

rc=0
printf '%s\n' "$target" | awk -v name="$cookie_name" '
{
  line = $0
  sub(/^[Ss]et-[Cc]ookie:[ \t]*/, "", line)
  eq = index(line, "=")
  if (eq == 0) next
  line = substr(line, eq + 1)
  semi = index(line, ";")
  attrstr = (semi > 0) ? substr(line, semi + 1) : ""
  n = split(attrstr, a, ";")
  secure = 0; httponly = 0; samesite = 0; path = 0; domain = 0; maxage = -1
  for (i = 1; i <= n; i++) {
    t = a[i]
    gsub(/^[ \t]+|[ \t]+$/, "", t)
    lt = tolower(t)
    if (lt == "secure") secure = 1
    else if (lt == "httponly") httponly = 1
    else if (lt == "samesite=lax") samesite = 1
    else if (lt == "path=/") path = 1
    else if (lt ~ /^domain=/) domain = 1
    else if (lt ~ /^max-age=/) { maxage = substr(lt, index(lt, "=") + 1) + 0 }
  }
  if (!secure)   { print "FAIL: " name ": Secure 누락"; bad = 1 }
  if (!httponly) { print "FAIL: " name ": HttpOnly 누락"; bad = 1 }
  if (!samesite) { print "FAIL: " name ": SameSite=Lax 누락"; bad = 1 }
  if (!path)     { print "FAIL: " name ": Path=/ 누락"; bad = 1 }
  if (domain)    { print "FAIL: " name ": Domain 지정 금지"; bad = 1 }
  if (maxage == -1)   { print "FAIL: " name ": Max-Age 누락"; bad = 1 }
  else if (maxage == 0) { print "INFO: " name ": Max-Age=0 (삭제 쿠키)" }
}
END { exit bad }
' || rc=$?

if [ "$rc" -eq 0 ]; then
  echo "OK: $cookie_name 속성 충족"
else
  exit "$rc"
fi
