#!/usr/bin/env sh
# 디스패치 큐 점검 — tmp/dispatch-queue.tsv의 각 unit에 대해 callbacks.log 마지막 status와
# 보고서 첫 줄을 대조해 DONE/PENDING/MISSING/BLOCKED를 출력한다.
# 사용법: sh dispatch-status.sh [queue.tsv] [callbacks.log]
# 폴링 루프는 만들지 않는다. o가 필요할 때 호출하는 요약 도구다.
set -eu

queue=${1:-tmp/dispatch-queue.tsv}
callbacks_arg=${2:-}

if [ ! -f "$queue" ]; then
  echo "dispatch-status: queue not found: $queue" >&2
  exit 2
fi

printf '%-24s %-12s %-12s %-10s %s\n' "UNIT" "WORKER" "REVIEWER" "STATUS" "DETAIL"

# TSV: unit worker reviewer brief report dispatched_at
while IFS="$(printf '\t')" read -r unit worker reviewer brief report dispatched_at; do
  [ -z "${unit:-}" ] && continue
  case "$unit" in \#*) continue ;; esac
  # 큐 헤더 행(unit worker reviewer ...)은 작업으로 취급하지 않는다.
  [ "$unit" = "unit" ] && [ "${worker:-}" = "worker" ] && continue

  # callbacks.log 위치: 인자로 받거나 보고서 디렉터리, 없으면 tmp/callbacks.log
  if [ -n "$callbacks_arg" ]; then
    cb_log="$callbacks_arg"
  elif [ -n "${report:-}" ]; then
    cb_log="$(dirname "$report")/callbacks.log"
    [ -f "$cb_log" ] || cb_log="tmp/callbacks.log"
  else
    cb_log="tmp/callbacks.log"
  fi

  last_cb=""
  if [ -f "$cb_log" ]; then
    # unit 필드 정확 일치: "unit=<unit> " (다음 필드 경계)로 매칭해 부분 일치(315 vs 315-fix)를 막는다.
    last_cb=$(grep -F "unit=${unit} " "$cb_log" 2>/dev/null | tail -n 1 | sed -n 's/.*status=\([a-z-]*\).*/\1/p')
  fi

  if [ -z "${report:-}" ] || [ ! -f "$report" ]; then
    status="MISSING"
    detail="report not found: ${report:-}"
  else
    first_line=$(head -n 1 "$report" | tr -d '\r')
    case "$first_line" in
      "status: done"|"status:done")
        if [ "$last_cb" = "done" ]; then
          status="DONE"
          detail="callback=done report=done"
        elif [ -z "$last_cb" ]; then
          status="PENDING"
          detail="callback missing (report done)"
        elif [ "$last_cb" = "failed" ] || [ "$last_cb" = "blocked" ]; then
          status="BLOCKED"
          detail="callback=$last_cb report=done"
        else
          status="BLOCKED"
          detail="callback=$last_cb report=done"
        fi
        ;;
      "status: blocked"|"status:blocked"|"status: failed"|"status:failed")
        status="BLOCKED"
        detail="report ${first_line} (callback=${last_cb:-none})"
        ;;
      *)
        if [ -z "$last_cb" ]; then
          status="PENDING"
          detail="callback missing (report ${first_line})"
        elif [ "$last_cb" = "failed" ] || [ "$last_cb" = "blocked" ]; then
          status="BLOCKED"
          detail="callback=$last_cb report=${first_line}"
        else
          status="PENDING"
          detail="callback=$last_cb report=${first_line}"
        fi
        ;;
    esac
  fi

  printf '%-24s %-12s %-12s %-10s %s\n' "$unit" "${worker:-?}" "${reviewer:-?}" "$status" "$detail"
done < "$queue"