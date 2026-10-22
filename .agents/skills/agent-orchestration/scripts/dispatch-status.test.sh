#!/usr/bin/env sh
# dispatch-status.sh 회귀 테스트 — mock queue/callbacks.log/report 픽스처 (네트워크 없음)
set -eu

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

queue="$tmp/queue.tsv"
cb="$tmp/callbacks.log"
report_done="$tmp/done.md"
report_blocked="$tmp/blocked.md"
report_missing="$tmp/missing.md"

# 헤더 행이 있어도 작업으로 취급하지 않아야 한다.
printf 'unit\tworker\treviewer\tbrief\treport\tdispatched_at\n' > "$queue"
printf 'unit-a\tw1\tr\tbrief\t%s\t2026-01-01T00:00:00Z\n' "$report_done" >> "$queue"
printf 'unit-b\tw2\tr\tbrief\t%s\t2026-01-01T00:00:00Z\n' "$report_blocked" >> "$queue"
printf 'unit-c\tw3\tr\tbrief\t%s\t2026-01-01T00:00:00Z\n' "$report_missing" >> "$queue"

printf 'status: done\n' > "$report_done"
printf 'status: blocked\n' > "$report_blocked"

# callback for unit-a only
printf '[2026-01-01T00:00:00Z] target=o unit=unit-a status=done report=%s delivered=yes\n' "$report_done" > "$cb"

out=$(sh .agents/skills/agent-orchestration/scripts/dispatch-status.sh "$queue" "$cb")
echo "$out"

echo "$out" | grep -q 'unit-a' && echo "$out" | grep 'unit-a' | grep -q 'DONE' || { echo "FAIL: unit-a should be DONE"; exit 1; }
echo "$out" | grep 'unit-b' | grep -q 'BLOCKED' || { echo "FAIL: unit-b should be BLOCKED"; exit 1; }
echo "$out" | grep 'unit-c' | grep -q 'MISSING' || { echo "FAIL: unit-c should be MISSING"; exit 1; }

# PENDING case: report done but no callback
printf 'unit-d\tw4\tr\tbrief\t%s\t2026-01-01T00:00:00Z\n' "$report_done" >> "$queue"
out2=$(sh .agents/skills/agent-orchestration/scripts/dispatch-status.sh "$queue" "$cb")
echo "$out2" | grep 'unit-d' | grep -q 'PENDING' || { echo "FAIL: unit-d should be PENDING"; exit 1; }

# B1: 부분 일치 금지 — 315-fix 콜백만 있어도 315는 PENDING
printf '315\tw5\tr\tbrief\t%s\t2026-01-01T00:00:00Z\n' "$report_done" > "$tmp/q2.tsv"
printf '315-fix\tw6\tr\tbrief\t%s\t2026-01-01T00:00:00Z\n' "$report_done" >> "$tmp/q2.tsv"
printf '[2026-01-01T00:00:00Z] target=o unit=315-fix status=done report=%s delivered=yes\n' "$report_done" > "$tmp/cb2.log"
out3=$(sh .agents/skills/agent-orchestration/scripts/dispatch-status.sh "$tmp/q2.tsv" "$tmp/cb2.log")
echo "$out3" | grep '^315 ' | grep -q 'PENDING' || { echo "FAIL: 315 should be PENDING"; exit 1; }
echo "$out3" | grep '^315-fix' | grep -q 'DONE' || { echo "FAIL: 315-fix should be DONE"; exit 1; }

# B2: failed 콜백은 BLOCKED
printf 'unit-e\tw7\tr\tbrief\t%s\t2026-01-01T00:00:00Z\n' "$report_done" > "$tmp/q3.tsv"
printf '[2026-01-01T00:00:00Z] target=o unit=unit-e status=failed report=%s delivered=yes\n' "$report_done" > "$tmp/cb3.log"
out4=$(sh .agents/skills/agent-orchestration/scripts/dispatch-status.sh "$tmp/q3.tsv" "$tmp/cb3.log")
echo "$out4" | grep 'unit-e' | grep -q 'BLOCKED' || { echo "FAIL: failed callback should be BLOCKED"; exit 1; }

# 헤더 행은 상태 행으로 출력되지 않아야 한다
if echo "$out" | grep -q '^unit '; then echo "FAIL: header row printed"; exit 1; fi

echo "ALL TESTS PASSED"