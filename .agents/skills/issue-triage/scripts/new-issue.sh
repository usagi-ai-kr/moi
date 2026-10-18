#!/usr/bin/env sh
# 표준 이슈 생성 헬퍼 (ADR-0010, 이슈 #7·#26):
#  - 작업 성격 라벨(focus|instant|tuck) 1개를 강제한다 (f/i/t 약칭 금지).
#  - Milestone을 필수로 요구하고, 존재를 사전 검증한다 (모든 이슈 마일스톤 부착 — 예외 없음).
# 의존성: gh CLI (인증됨)
# 사용법: sh .agents/skills/issue-triage/scripts/new-issue.sh <focus|instant|tuck> "<title>" --milestone <title|number> [body-file]
#   body-file 생략 시 stdin으로 본문을 받는다.
# 종료 코드: 0 성공, 2 사용/검증 오류(이슈 생성 안 함), gh 오류 시 해당 코드
set -eu

usage='usage: sh .agents/skills/issue-triage/scripts/new-issue.sh <focus|instant|tuck> "<title>" --milestone <title|number> [body-file]'

[ $# -ge 2 ] || { echo "$usage" >&2; exit 2; }

label=$1
title=$2
shift 2

milestone=''
body_file=''
while [ $# -gt 0 ]; do
  case "$1" in
    --milestone)
      [ $# -ge 2 ] || { echo "error: --milestone 뒤에 제목 또는 번호가 필요합니다" >&2; exit 2; }
      milestone=$2
      shift
      ;;
    --*)
      echo "error: 알 수 없는 옵션: $1" >&2
      echo "$usage" >&2
      exit 2
      ;;
    *)
      [ -z "$body_file" ] || { echo "error: body-file 인자가 중복되었습니다: $1" >&2; exit 2; }
      body_file=$1
      ;;
  esac
  shift
done

case "$label" in
  focus|instant|tuck) ;;
  *)
    echo "error: 라벨은 focus|instant|tuck 중 하나여야 함 (f/i/t 약칭 라벨 금지)" >&2
    exit 2
    ;;
esac

[ -n "$milestone" ] || {
  echo "error: --milestone이 필요합니다 — 모든 이슈는 마일스톤에 부착한다(예외 없음)" >&2
  echo "$usage" >&2
  exit 2
}

# Milestone 존재 사전 검증 — 실패 시 이슈를 생성하지 않는다
ms=$(
  gh api "repos/{owner}/{repo}/milestones?state=open&per_page=100" --paginate \
    --jq '.[] | "\(.number)\t\(.title)"' |
    awk -F'\t' -v m="$milestone" '$1 == m || $2 == m { print $2; exit }'
) || { echo "error: Milestone 조회 실패(gh 인증·네트워크 확인)" >&2; exit 2; }

[ -n "$ms" ] || {
  echo "error: Milestone을 찾을 수 없음: '$milestone' — 생성하지 않고 중단(마일스톤 생성은 사용자 수동)" >&2
  exit 2
}

if [ -n "$body_file" ]; then
  gh issue create --title "$title" --label "$label" --milestone "$ms" --body-file "$body_file"
else
  gh issue create --title "$title" --label "$label" --milestone "$ms" --body-file -
fi
