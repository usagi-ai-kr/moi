#!/usr/bin/env sh
# check-redaction.sh 회귀 테스트 (이슈 #11) — 검출·미검출·stdin·읽기 오류와 원문 미출력 검증.
# 실행: sh .agents/skills/kakao-oidc-auth/scripts/check-redaction.test.sh
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
target="$here/check-redaction.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

cat > "$tmp/bad.log" <<'EOF'
2026-10-18T12:00:00Z INFO request id=abc123 path=/auth/kakao/callback?code=CODE_FIXTURE_0123456789ABCDEF&state=STATE_FIXTURE_0123456789
2026-10-18T12:00:00Z DEBUG id_token=eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJmaXh0dXJlIn0.SIGNATURESIGNATURE
2026-10-18T12:00:00Z DEBUG cookie=__Host-moi_session=v4.local.FIXTURE_COOKIE_VALUE_0123456789
2026-10-18T12:00:01Z DEBUG env PASETO_KEY=FIXTURE_BASE64_SECRET_VALUE_0000
EOF

cat > "$tmp/good.log" <<'EOF'
2026-10-18T12:00:00Z INFO request id=abc123 status=200 path=/api/me
2026-10-18T12:00:01Z INFO session lookup user_id=11111111-2222-3333-4444-555555555555
EOF

fails=0
ok() { echo "  OK: $1"; }
ng() { echo "  FAIL: $1"; fails=1; }

# 1) 검출: exit 1 + 원문(토큰/코드/시크릿) 미출력 + 규칙ID 형식
st=0
out=$(sh "$target" "$tmp/bad.log" 2>&1) || st=$?
[ "$st" -eq 1 ] && ok "검출 exit 1" || ng "검출 exit $st (기대 1)"
if printf '%s' "$out" | grep -qE 'FIXTURE|eyJhbGci|CODE_FIXTURE|SIGNATURESIGNATURE'; then
  ng "검출 시 원문이 출력됨"
else
  ok "원문 미출력"
fi
printf '%s\n' "$out" | grep -qE 'FAIL: .*:[0-9]+:PASETO' && ok "파일:라인:규칙ID 형식" || ng "FAIL: 파일:라인:규칙ID 형식 없음"

# 2) 미검출: exit 0
st=0
out=$(sh "$target" "$tmp/good.log" 2>&1) || st=$?
[ "$st" -eq 0 ] && ok "미검출 exit 0" || ng "미검출 exit $st (기대 0)"
printf '%s' "$out" | grep -q 'OK:' && ok "미검출 OK 문구" || ng "OK 문구 없음"

# 3) stdin 모드: 검출 + 원문 미출력
st=0
out=$(printf 'token=v4.local.STDIN_FIXTURE_0123456789\n' | sh "$target" 2>&1) || st=$?
[ "$st" -eq 1 ] && ok "stdin 검출 exit 1" || ng "stdin 검출 exit $st (기대 1)"
printf '%s' "$out" | grep -q 'STDIN_FIXTURE' && ng "stdin 원문 출력됨" || ok "stdin 원문 미출력"

# 4) 읽기 오류: exit 2 ('거짓 OK' 방지)
st=0
out=$(sh "$target" "$tmp/no-such-file.log" 2>&1) || st=$?
[ "$st" -eq 2 ] && ok "읽기 오류 exit 2" || ng "읽기 오류 exit $st (기대 2)"

if [ "$fails" -eq 0 ]; then
  echo "OK: check-redaction 회귀 테스트 통과 (4케이스)"
else
  echo "FAIL: check-redaction 회귀 테스트 실패"
  exit 1
fi
