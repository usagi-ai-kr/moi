#!/usr/bin/env sh
# smoke-check.sh 회귀 테스트 (이슈 #12) — fail-closed 판정·원문 미출력 검증 (mock 서버 사용).
# 실행: sh .agents/skills/release-deploy-workers/scripts/smoke-check.test.sh
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
target="$here/smoke-check.sh"
tmp=$(mktemp -d)
srv_pid=""
cleanup() {
  [ -n "$srv_pid" ] && kill "$srv_pid" 2>/dev/null || true
  rm -rf "$tmp"
}
trap cleanup EXIT INT TERM

start_server() {
  mode="$1"
  rm -f "$tmp/port"
  python3 - "$mode" "$tmp/port" <<'PY' &
import http.server, socketserver, sys
mode, portfile = sys.argv[1], sys.argv[2]

class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path == "/":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
            return
        if self.path == "/api/me":
            self.send_response(200 if mode == "badstatus" else 401)
            if mode != "nocache":
                self.send_header("Cache-Control", "no-store")
            self.send_header("Set-Cookie", "__Host-moi_session=SECRET_VALUE_FIXTURE")
            self.end_headers()
            return
        self.send_response(404)
        self.end_headers()

with socketserver.TCPServer(("127.0.0.1", 0), H) as srv:
    with open(portfile, "w") as f:
        f.write(str(srv.server_address[1]))
    srv.serve_forever()
PY
  srv_pid=$!
  i=0
  while [ ! -s "$tmp/port" ] && [ "$i" -lt 50 ]; do
    sleep 0.1
    i=$((i + 1))
  done
  [ -s "$tmp/port" ] || { echo "FAIL: mock 서버 기동 실패"; exit 1; }
  base="http://127.0.0.1:$(cat "$tmp/port")"
}

stop_server() {
  [ -n "$srv_pid" ] && kill "$srv_pid" 2>/dev/null || true
  srv_pid=""
  wait 2>/dev/null || true
}

fails=0
ok() { echo "  OK: $1"; }
ng() { echo "  FAIL: $1"; fails=1; }

# 1) 정상: / 200, /api/me 401 + no-store → exit 0, Set-Cookie 원문 미출력
start_server good
st=0
out=$(sh "$target" "$base" 2>&1) || st=$?
[ "$st" -eq 0 ] && ok "정상 → exit 0" || ng "정상 → exit $st (기대 0)"
printf '%s' "$out" | grep -q 'SECRET_VALUE_FIXTURE' && ng "Set-Cookie 원문 출력됨" || ok "Set-Cookie 원문 미출력"
stop_server

# 2) Cache-Control 누락 → exit 1 (WARN 아님)
start_server nocache
st=0
out=$(sh "$target" "$base" 2>&1) || st=$?
[ "$st" -eq 1 ] && ok "Cache-Control 누락 → exit 1" || ng "누락 → exit $st (기대 1)"
printf '%s' "$out" | grep -qE 'OK.*Cache-Control.*no-store' && ng "누락인데 OK 판정" || ok "누락 판정 정상"
stop_server

# 3) /api/me 상태 불일치(200) → exit 1
start_server badstatus
st=0
out=$(sh "$target" "$base" 2>&1) || st=$?
[ "$st" -eq 1 ] && ok "상태 불일치 → exit 1" || ng "상태 불일치 → exit $st (기대 1)"
stop_server

# 4) 사용 오류 → exit 2
st=0
out=$(sh "$target" 2>&1) || st=$?
[ "$st" -eq 2 ] && ok "인자 없음 → exit 2" || ng "인자 없음 → exit $st (기대 2)"

if [ "$fails" -eq 0 ]; then
  echo "OK: smoke-check 회귀 테스트 통과 (4케이스)"
else
  echo "FAIL: smoke-check 회귀 테스트 실패"
  exit 1
fi
