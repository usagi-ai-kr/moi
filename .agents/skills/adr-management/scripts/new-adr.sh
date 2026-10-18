#!/usr/bin/env sh
# 새 ADR 파일 생성: docs/adr/NNNN-slug.md (template.md 기반, 다음 번호 자동)
# 의존성: sh (sed, grep)
# 사용법: sh scripts/new-adr.sh <kebab-slug> "<한국어 제목>"
set -eu

if [ $# -lt 2 ]; then
  echo "usage: $0 <kebab-slug> \"<제목>\"" >&2
  exit 2
fi

slug="$1"
title="$2"
dir="docs/adr"
tpl="$dir/template.md"

[ -f "$tpl" ] || { echo "템플릿 없음: $tpl — 먼저 docs/adr/template.md를 준비하세요" >&2; exit 2; }

last=$(ls "$dir" | grep -E '^[0-9]{4}-' | sort | tail -n1 | cut -d- -f1 || true)
last_num=$(printf '%s' "${last:-0}" | sed 's/^0*//')
[ -z "$last_num" ] && last_num=0
num=$(printf '%04d' $((last_num + 1)))

file="$dir/$num-$slug.md"
[ -e "$file" ] && { echo "이미 존재: $file" >&2; exit 2; }

title_esc=$(printf '%s' "$title" | sed 's/[&|]/\\&/g')
sed -e "s/{{NUM}}/$num/g" -e "s/{{DATE}}/$(date +%F)/g" -e "s|{{TITLE}}|$title_esc|g" "$tpl" > "$file"

echo "생성: $file"
echo "다음: 본문 작성 후 'python3 scripts/adr-index.py'로 인덱스를 갱신하세요."
