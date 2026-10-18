#!/usr/bin/env sh
# wrangler D1 마이그레이션/쿼리 래퍼 (ADR-0004, 이슈 #3).
# 의존성: wrangler
# 사용법:
#   sh scripts/d1.sh status [local|remote]
#   sh scripts/d1.sh apply  [local|remote]
#   sh scripts/d1.sh exec   [local|remote] "<SQL>"
# DB 이름은 DB_NAME 환경변수로 지정 (기본 moi-db — scaffold 확정 시 갱신).
set -eu

DB_NAME="${DB_NAME:-moi-db}"

mode="${1:?usage: sh scripts/d1.sh <status|apply|exec> [local|remote] [SQL]}"
shift

target=local
if [ $# -ge 1 ]; then
  case "$1" in
    local|remote) target="$1"; shift ;;
    *) echo "대상은 local|remote 중 하나여야 합니다: $1" >&2; exit 2 ;;
  esac
fi

case "$target" in
  local) flag="--local" ;;
  remote) flag="--remote" ;;
esac

case "$mode" in
  status) wrangler d1 migrations list "$DB_NAME" "$flag" ;;
  apply)  wrangler d1 migrations apply "$DB_NAME" "$flag" ;;
  exec)   wrangler d1 execute "$DB_NAME" "$flag" --command "${1:?SQL 문자열이 필요합니다}" ;;
  *) echo "mode는 status|apply|exec 중 하나여야 합니다: $mode" >&2; exit 2 ;;
esac
