#!/usr/bin/env sh
# 회귀 테스트: notify.sh (ADR-0042)
# 사용법: sh .agents/skills/agent-orchestration/scripts/notify.test.sh (repo root)
set -eu

ROOT=$(pwd)
SCRIPT="$ROOT/.agents/skills/agent-orchestration/scripts/notify.sh"
pass=0
fail=0
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT INT TERM

ok() { pass=$((pass + 1)); echo "PASS $1"; }
ng() { fail=$((fail + 1)); echo "FAIL $1"; }

mkdir -p "$TMP/bin"
cat > "$TMP/bin/herdr" <<'EOS'
#!/usr/bin/env sh
printf '%s\n' "$*" >> "${FAKE_HERDR_LOG:?}"
exit "${FAKE_HERDR_EXIT:-0}"
EOS
chmod +x "$TMP/bin/herdr"

# ① --dry-run: 기록·전송 없이 출력만, exit 0
if out=$(MOI_WORK_DIR= PATH="$TMP/bin:$PATH" FAKE_HERDR_LOG="$TMP/herdr.log" sh "$SCRIPT" w17:p1 unit-a done "$TMP/dry.md" --dry-run 2>&1); then
  case "$out" in
    *"[callback] unit=unit-a status=done report=$TMP/dry.md"*) ok "① dry-run 프롬프트 출력" ;;
    *) ng "① dry-run 프롬프트 형식 불일치: $out" ;;
  esac
  [ ! -e "$TMP/callbacks.log" ] && ok "① dry-run 기록 없음" || ng "① dry-run이 로그를 남김"
  [ ! -e "$TMP/herdr.log" ] && ok "① dry-run 전송 없음" || ng "① dry-run이 herdr를 호출함"
else
  ng "① dry-run이 실패"
fi

# ② 인자 누락 → 2
rc=0
sh "$SCRIPT" w17:p1 unit-a done >/dev/null 2>&1 || rc=$?
[ "$rc" -eq 2 ] && ok "② 인자 누락 exit 2" || ng "② 인자 누락 exit $rc"

# ③ 잘못된 status → 2
rc=0
sh "$SCRIPT" w17:p1 unit-a unknown "$TMP/r.md" >/dev/null 2>&1 || rc=$?
[ "$rc" -eq 2 ] && ok "③ 잘못된 status exit 2" || ng "③ 잘못된 status exit $rc"

# ④ 알 수 없는 옵션 → 2
rc=0
sh "$SCRIPT" w17:p1 unit-a done "$TMP/r.md" --bogus >/dev/null 2>&1 || rc=$?
[ "$rc" -eq 2 ] && ok "④ 알 수 없는 옵션 exit 2" || ng "④ 알 수 없는 옵션 exit $rc"

# ⑤ 전송 실패: pending 기록 후 exit 0
mkdir -p "$TMP/logs"
rc=0
MOI_WORK_DIR="$TMP/logs" PATH="$TMP/bin:$PATH" FAKE_HERDR_LOG="$TMP/herdr5.log" FAKE_HERDR_EXIT=1 \
  sh "$SCRIPT" w17:p1 unit-b blocked "$TMP/report-b.md" >/dev/null 2>&1 || rc=$?
case "$rc" in
  0) ok "⑤ 전송 실패 exit 0" ;;
  *) ng "⑤ 전송 실패 exit $rc" ;;
esac
line=$(cat "$TMP/logs/callbacks.log" 2>/dev/null || true)
case "$line" in
  \[*\ target=w17:p1\ unit=unit-b\ status=blocked\ report="$TMP/report-b.md"\ delivered=pending)
    ok "⑤ pending 기록 형식" ;;
  *) ng "⑤ pending 기록 형식 불일치: $line" ;;
esac
[ "$(wc -l < "$TMP/logs/callbacks.log" | tr -d ' ')" = "1" ] && ok "⑤ pending 1줄" || ng "⑤ pending 줄 수 오류"

# ⑥ 전송 성공: 프롬프트 인자와 delivered=yes 기록
mkdir -p "$TMP/logs6"
rc=0
MOI_WORK_DIR="$TMP/logs6" PATH="$TMP/bin:$PATH" FAKE_HERDR_LOG="$TMP/herdr6.log" FAKE_HERDR_EXIT=0 \
  sh "$SCRIPT" w17:p1 unit-c done "$TMP/report-c.md" >/dev/null 2>&1 || rc=$?
[ "$rc" -eq 0 ] && ok "⑥ 전송 성공 exit 0" || ng "⑥ 전송 성공 exit $rc"
grep -Fq "agent prompt w17:p1 [callback] unit=unit-c status=done report=$TMP/report-c.md" "$TMP/herdr6.log" \
  && ok "⑥ herdr 프롬프트 인자" || ng "⑥ herdr 프롬프트 인자 불일치"
grep -Fq "target=w17:p1 unit=unit-c status=done report=$TMP/report-c.md delivered=yes" "$TMP/logs6/callbacks.log" \
  && ok "⑥ delivered=yes 기록" || ng "⑥ delivered=yes 기록 누락"

# ⑦ MOI_WORK_DIR 미설정 시 보고서 디렉터리에 기록
mkdir -p "$TMP/default"
rc=0
MOI_WORK_DIR= PATH="$TMP/bin:$PATH" FAKE_HERDR_LOG="$TMP/herdr7.log" FAKE_HERDR_EXIT=1 \
  sh "$SCRIPT" w17:p1 unit-d failed "$TMP/default/report-d.md" >/dev/null 2>&1 || rc=$?
[ "$rc" -eq 0 ] && [ -f "$TMP/default/callbacks.log" ] \
  && ok "⑦ 기본 기록 디렉터리=보고서 디렉터리" || ng "⑦ 기본 기록 디렉터리 오류(exit $rc)"

echo "---"
echo "결과: PASS $pass / FAIL $fail"
[ "$fail" -eq 0 ]
