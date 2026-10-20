#!/usr/bin/env sh
# 워커 완료 콜백 — callbacks.log에 먼저 기록한 뒤 herdr로 o 패널에 전송한다 (ADR-0042).
# 사용법: sh .agents/skills/agent-orchestration/scripts/notify.sh <target-pane> <unit> <status> <report> [--dry-run]
# 종료 코드: 0 전송 또는 delivered=pending 기록, 1 로그 기록 실패, 2 사용 오류
set -eu

usage='usage: notify.sh <target-pane> <unit> <status> <report> [--dry-run]'
dry_run=0
if [ "${1:-}" = "--dry-run" ]; then
  dry_run=1
  shift
fi
if [ "${5:-}" = "--dry-run" ]; then
  dry_run=1
  set -- "$1" "$2" "$3" "$4"
fi
[ $# -eq 4 ] || { echo "$usage" >&2; exit 2; }

target=$1
unit=$2
status=$3
report=$4
[ -n "$target" ] && [ -n "$unit" ] && [ -n "$report" ] || { echo "$usage" >&2; exit 2; }
case "$target" in -*|"") echo "notify.sh: invalid target-pane: '$target'" >&2; exit 2 ;; esac
case "$status" in
  done|blocked|failed) ;;
  *) echo "notify.sh: invalid status: '$status' (done|blocked|failed)" >&2; exit 2 ;;
esac

ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
body="[callback] unit=$unit status=$status report=$report"
log_dir=${MOI_WORK_DIR:-$(dirname "$report")}
log_file="$log_dir/callbacks.log"
pending="[$ts] target=$target unit=$unit status=$status report=$report delivered=pending"
sent="[$ts] target=$target unit=$unit status=$status report=$report delivered=yes"

if [ "$dry_run" -eq 1 ]; then
  echo "[dry-run] record: $pending"
  echo "[dry-run] prompt $target: $body"
  exit 0
fi

mkdir -p "$log_dir" 2>/dev/null || { echo "notify.sh: cannot create log dir: $log_dir" >&2; exit 1; }
printf '%s\n' "$pending" >> "$log_file" 2>/dev/null || { echo "notify.sh: cannot write $log_file" >&2; exit 1; }

if command -v herdr >/dev/null 2>&1 && herdr agent prompt "$target" "$body" >/dev/null 2>&1; then
  printf '%s\n' "$sent" >> "$log_file" 2>/dev/null || { echo "notify.sh: cannot write $log_file" >&2; exit 1; }
  echo "notified $target: $body"
  exit 0
fi

# 전송 실패: pending 기록은 이미 남겼다. o가 재전송한다.
echo "delivery pending to $target: logged delivered=pending in $log_file"
exit 0
