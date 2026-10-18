#!/usr/bin/env sh
# check-cookie.sh 회귀 테스트 (이슈 #11) — 헤더 단위 평가·false pass 차단·원문 미출력 검증.
# 실행: sh .agents/skills/session-paseto/scripts/check-cookie.test.sh
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
target="$here/check-cookie.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

cat > "$tmp/good.headers" <<'EOF'
HTTP/2 200
content-type: text/html
set-cookie: __Host-moi_session=VALUE_FIXTURE_GOOD; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=86400
EOF

cat > "$tmp/split.headers" <<'EOF'
HTTP/2 200
set-cookie: __Host-moi_session=VALUE_FIXTURE_SPLIT; Secure
set-cookie: other_cookie=VALUE_FIXTURE_OTHER; HttpOnly; SameSite=Lax; Path=/
EOF

cat > "$tmp/deletion.headers" <<'EOF'
HTTP/2 200
set-cookie: __Host-moi_session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0
EOF

cat > "$tmp/domain.headers" <<'EOF'
HTTP/2 200
set-cookie: __Host-moi_session=VALUE_FIXTURE_DOMAIN; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=86400; Domain=example.com
EOF

cat > "$tmp/missing.headers" <<'EOF'
HTTP/2 200
set-cookie: other_cookie=VALUE_FIXTURE_NONE; Path=/; Secure; HttpOnly; SameSite=Lax
EOF

fails=0
ok() { echo "  OK: $1"; }
ng() { echo "  FAIL: $1"; fails=1; }

st=0
out=$(sh "$target" --headers-file "$tmp/good.headers" 2>&1) || st=$?
[ "$st" -eq 0 ] && ok "정상 쿠키 exit 0" || ng "정상 쿠키 exit $st (기대 0)"

st=0
out=$(sh "$target" --headers-file "$tmp/split.headers" 2>&1) || st=$?
[ "$st" -eq 1 ] && ok "속성 분산(false pass) 차단 exit 1" || ng "분산 케이스 exit $st (기대 1)"
printf '%s' "$out" | grep -qE 'VALUE_FIXTURE' && ng "쿠키 원문 출력됨" || ok "쿠키 원문 미출력"

st=0
out=$(sh "$target" --headers-file "$tmp/deletion.headers" 2>&1) || st=$?
[ "$st" -eq 0 ] && ok "삭제(Max-Age=0) exit 0" || ng "삭제 케이스 exit $st (기대 0)"
printf '%s' "$out" | grep -q 'Max-Age=0' && ok "삭제 INFO 표시" || ng "삭제 INFO 없음"

st=0
out=$(sh "$target" --headers-file "$tmp/domain.headers" 2>&1) || st=$?
[ "$st" -eq 1 ] && ok "Domain 지정 exit 1" || ng "Domain 케이스 exit $st (기대 1)"
printf '%s' "$out" | grep -qE 'VALUE_FIXTURE' && ng "쿠키 원문 출력됨(Domain 케이스)" || ok "쿠키 원문 미출력(Domain 케이스)"

st=0
out=$(sh "$target" --headers-file "$tmp/missing.headers" 2>&1) || st=$?
[ "$st" -eq 1 ] && ok "대상 쿠키 없음 exit 1" || ng "대상 쿠키 없음 exit $st (기대 1)"

st=0
out=$(sh "$target" --headers-file "$tmp/no-such.headers" 2>&1) || st=$?
[ "$st" -eq 2 ] && ok "파일 오류 exit 2" || ng "파일 오류 exit $st (기대 2)"

if [ "$fails" -eq 0 ]; then
  echo "OK: check-cookie 회귀 테스트 통과 (6케이스)"
else
  echo "FAIL: check-cookie 회귀 테스트 실패"
  exit 1
fi
