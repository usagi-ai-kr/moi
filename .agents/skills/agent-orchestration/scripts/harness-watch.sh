#!/usr/bin/env sh
# 하네스 정규 점검 — 디스패치 큐·콜백·보고서·herdr·gh 를 대조해 DONE/RUNNING/OVERDUE/MISSING 를 보고한다.
# 쓰기 없음(보고만). 폴링 루프는 만들지 않는다 — o가 필요할 때 호출한다.
# 사용법: sh harness-watch.sh [queue.tsv] [callbacks.log]
# 환경변수: HARNESS_WATCH_NOW(ISO8601, 기본 현재 UTC), HARNESS_WATCH_HERDR_FILE, HARNESS_WATCH_GH_PR_FILE, HARNESS_WATCH_GH_ISSUE_FILE
set -eu

queue=${1:-tmp/dispatch-queue.tsv}
cb_log=${2:-}
now=${HARNESS_WATCH_NOW:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}

if [ ! -f "$queue" ]; then
  echo "harness-watch: queue not found: $queue" >&2
  exit 2
fi

# herdr/gh 출력 수집 (파일 우선, 없으면 명령 실행; 실패는 무시)
herdr_out=""
if [ -n "${HARNES_WATCH_HERDR_FILE:-}" ] && [ -f "$HARNES_WATCH_HERDR_FILE" ]; then
  herdr_out=$(cat "$HARNES_WATCH_HERDR_FILE")
elif [ -n "${HARNESS_WATCH_HERDR_FILE:-}" ] && [ -f "$HARNESS_WATCH_HERDR_FILE" ]; then
  herdr_out=$(cat "$HARNESS_WATCH_HERDR_FILE")
elif command -v herdr >/dev/null 2>&1; then
  herdr_out=$(herdr agent list 2>/dev/null || true)
fi
gh_pr_out=""
if [ -n "${HARNESS_WATCH_GH_PR_FILE:-}" ] && [ -f "$HARNESS_WATCH_GH_PR_FILE" ]; then
  gh_pr_out=$(cat "$HARNESS_WATCH_GH_PR_FILE")
elif command -v gh >/dev/null 2>&1; then
  gh_pr_out=$(gh pr list --state open 2>/dev/null || true)
fi

# ISO8601 → epoch (GNU/BSD date 모두 지원 시도)
to_epoch() {
  d=$(printf '%s' "$1" | sed 's/Z$/+00:00/')
  # BSD/macOS date
  if date -j -f '%Y-%m-%dT%H:%M:%S%z' "$(printf '%s' "$1" | sed 's/Z$/+0000/')" +%s >/dev/null 2>&1; then
    date -j -f '%Y-%m-%dT%H:%M:%S%z' "$(printf '%s' "$1" | sed 's/Z$/+0000/')" +%s 2>/dev/null && return
  fi
  # GNU date
  date -d "$1" +%s 2>/dev/null && return
  echo 0
}

now_epoch=$(to_epoch "$now")

printf '%-20s %-8s %-8s %-10s %6s  %s\n' "UNIT" "WORKER" "REVIEWER" "STATUS" "ELAPM" "CLASSIFICATION/DETAIL"

while IFS="$(printf '\t')" read -r unit worker reviewer brief report dispatched_at; do
  [ -z "${unit:-}" ] && continue
  case "$unit" in \#*) continue ;; esac
  [ "$unit" = "unit" ] && [ "${worker:-}" = "worker" ] && continue

  if [ -z "${cb_log:-}" ]; then
    if [ -n "${report:-}" ]; then
      cb_log="$(dirname "$report")/callbacks.log"
      [ -f "$cb_log" ] || cb_log="tmp/callbacks.log"
    else
      cb_log="tmp/callbacks.log"
    fi
  fi

  last_cb=""
  if [ -f "$cb_log" ]; then
    last_cb=$(grep -F "unit=${unit} " "$cb_log" 2>/dev/null | tail -n 1 | sed -n 's/.*status=\([a-z-]*\).*/\1/p')
  fi

  # elapsed minutes
  elapsed=0
  if [ -n "${dispatched_at:-}" ]; then
    disp_epoch=$(to_epoch "$dispatched_at")
    if [ "$disp_epoch" -gt 0 ] && [ "$now_epoch" -gt 0 ]; then
      elapsed=$(( (now_epoch - disp_epoch) / 60 ))
    fi
  fi

  # report first line
  report_first=""
  if [ -n "${report:-}" ] && [ -f "$report" ]; then
    report_first=$(head -n 1 "$report" | tr -d '\r')
  fi

  # threshold: report exists (review phase) -> 10 min, else work 5 min
  if [ -n "$report_first" ]; then
    threshold=10
  else
    threshold=5
  fi

  # external rate limit detection
  external=0
  if printf '%s\n%s\n' "$herdr_out" "$gh_pr_out" | grep -iq 'rate limit\|too many requests\|429'; then
    external=1
  fi

  if [ -z "${report:-}" ] || [ ! -f "$report" ]; then
    status="MISSING"
    classif="missing-report"
  elif [ "$last_cb" = "done" ] && [ "$report_first" = "status: done" ]; then
    status="DONE"
    classif="ok"
  elif [ "$last_cb" = "blocked" ] || [ "$last_cb" = "failed" ]; then
    status="OVERDUE"
    classif="orchestration (callback $last_cb)"
  elif [ -z "$last_cb" ]; then
    if [ "$elapsed" -le "$threshold" ]; then
      status="RUNNING"
      classif="in-progress"
    else
      status="OVERDUE"
      if [ "$external" -eq 1 ]; then
        classif="external (rate limit)"
      elif [ $((elapsed - threshold)) -le 1 ]; then
        classif="tolerance (boundary)"
      elif printf '%s' "$herdr_out" | grep -q "$unit"; then
        classif="worker (no progress)"
      else
        classif="orchestration (callback missing)"
      fi
    fi
  else
    if [ "$elapsed" -le "$threshold" ]; then
      status="RUNNING"
      classif="in-progress"
    else
      status="OVERDUE"
      classif="orchestration (callback $last_cb)"
    fi
  fi

  printf '%-20s %-8s %-8s %-10s %6s  %s\n' "$unit" "${worker:-?}" "${reviewer:-?}" "$status" "$elapsed" "$classif"
done < "$queue"