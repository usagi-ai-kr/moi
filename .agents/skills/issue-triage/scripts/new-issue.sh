#!/usr/bin/env sh
# 표준 이슈 생성 헬퍼 — focus/instant/tuck 중 1개 라벨을 강제한다 (ADR-0010, 이슈 #7).
# 의존성: gh CLI (인증됨)
# 사용법: sh scripts/new-issue.sh <focus|instant|tuck> "<title>" [body-file]
#   body-file 생략 시 stdin으로 본문을 받는다.
set -eu

if [ $# -lt 2 ]; then
  echo "usage: $0 <focus|instant|tuck> \"<title>\" [body-file]" >&2
  exit 2
fi

label="$1"
title="$2"
body_file="${3:--}"

case "$label" in
  focus|instant|tuck) ;;
  *)
    echo "error: 라벨은 focus|instant|tuck 중 하나여야 함 (f/i/t 약칭 라벨 금지)" >&2
    exit 2
    ;;
esac

gh issue create --title "$title" --label "$label" --body-file "$body_file"
