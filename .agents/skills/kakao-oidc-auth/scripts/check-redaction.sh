#!/usr/bin/env sh
# 로그/텍스트에서 토큰·인가 코드·시크릿 노출을 탐지한다 (ADR-0006, 이슈 #11).
# 검출 시에도 원문을 출력하지 않는다 — "FAIL: <파일>:<라인>:<규칙ID>"만 출력한다.
# 의존성: sh, grep -E
# 사용법: sh .agents/skills/kakao-oidc-auth/scripts/check-redaction.sh <file ...>  (인자 없으면 stdin)
# 종료 코드: 0 미검출, 1 검출, 2 입력/검사 오류(읽을 수 없는 파일 등 — '거짓 OK' 금지)
set -eu

if [ $# -eq 0 ]; then
  set -- -
else
  for f in "$@"; do
    if [ "$f" != "-" ] && [ ! -r "$f" ]; then
      echo "FAIL: 읽을 수 없는 입력: $f" >&2
      exit 2
    fi
  done
fi

rc=0

check() {
  rid=$1
  flags=$2
  pat=$3
  shift 3
  st=0
  # shellcheck disable=SC2086
  out=$(grep -nHE $flags -e "$pat" -- "$@" 2>/dev/null) || st=$?
  if [ "$st" -eq 0 ]; then
    # 매치된 "파일:라인"만 사용 — 내용(원문)은 절대 출력하지 않는다
    printf '%s\n' "$out" | cut -d: -f1,2 | while IFS= read -r loc; do
      printf 'FAIL: %s:%s\n' "$loc" "$rid"
    done
    rc=1
  elif [ "$st" -eq 1 ]; then
    :
  else
    echo "FAIL: 검사 오류($rid, grep exit $st)" >&2
    exit 2
  fi
}

check PASETO '' 'v4\.local\.[A-Za-z0-9_-]{8,}' "$@"
check JWT '' 'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.' "$@"
check AUTH_CODE '' '[?&]code=[A-Za-z0-9_-]{16,}' "$@"
check SECRET_KV '-i' '(client_secret|paseto_key[[:alnum:]_]*)[[:space:]]*[=:][[:space:]]*[A-Za-z0-9+/_.-]{16,}' "$@"
check CREDENTIAL_HEADER '-i' '(set-cookie:|cookie:|authorization:)[[:space:]]*[^[:space:]]{16,}' "$@"

if [ "$rc" -eq 0 ]; then
  echo "OK: 민감정보 패턴 미검출"
else
  exit 1
fi
