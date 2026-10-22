#!/usr/bin/env sh
set -eu

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

queue="$tmp/queue.tsv"
cb="$tmp/callbacks.log"
report_done="$tmp/done.md"
report_pending="$tmp/pending.md"

printf 'unit\tworker\treviewer\tbrief\treport\tdispatched_at\n' > "$queue"
printf 'done-unit\tw1\tr\tbrief\t%s\t2026-01-01T00:00:00Z\n' "$report_done" >> "$queue"
printf 'run-unit\tw2\tr\tbrief\t%s\t2026-01-01T00:05:00Z\n' "$report_pending" >> "$queue"
printf 'miss-unit\tw3\tr\tbrief\t%s\t2026-01-01T00:00:00Z\n' "$tmp/missing.md" >> "$queue"

printf 'status: done\n' > "$report_done"
printf 'status: in-progress\n' > "$report_pending"

printf '[2026-01-01T00:00:00Z] target=o unit=done-unit status=done report=%s delivered=yes\n' "$report_done" > "$cb"

out=$(HARNESS_WATCH_NOW=2026-01-01T00:03:00Z sh .agents/skills/agent-orchestration/scripts/harness-watch.sh "$queue" "$cb")
echo "$out"
echo "$out" | grep 'done-unit' | grep -q 'DONE' || { echo "FAIL done"; exit 1; }
echo "$out" | grep 'run-unit' | grep -q 'RUNNING' || { echo "FAIL running"; exit 1; }
echo "$out" | grep 'miss-unit' | grep -q 'MISSING' || { echo "FAIL missing"; exit 1; }

# overdue case
out2=$(HARNESS_WATCH_NOW=2026-01-01T00:20:00Z sh .agents/skills/agent-orchestration/scripts/harness-watch.sh "$queue" "$cb")
echo "$out2" | grep 'run-unit' | grep -q 'OVERDUE' || { echo "FAIL overdue"; exit 1; }

echo "ALL TESTS PASSED"