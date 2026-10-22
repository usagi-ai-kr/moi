#!/usr/bin/env sh
# 하네스 회고·평가 → usagi 이슈 본문 생성(기본 dry-run).
# 사용법(CWD = repo root):
#   sh .agents/skills/harness-eval-report/scripts/build-report.sh \
#     --retro tmp/retro.md --eval tmp/eval.md [--title "..."] [--repo usagi-ai-kr/usagi] [--post]
# 종료 코드: 0 본문 생성 성공(또는 --post 게시 성공), 1 gh 실행 실패, 2 사용 오류(입력 없음 등).
# 안전: 기본은 아무것도 게시하지 않는다(dry-run). `gh issue create` 는 --post 일 때만 실행한다.
set -eu

REPO_DEFAULT='usagi-ai-kr/usagi'
MAX_BYTES=60000

usage() {
  cat <<'EOF'
사용법: build-report.sh --retro <회고.md> --eval <평가.md> [옵션]

  --retro <file>   회고 문서(마크다운, 필수)
  --eval <file>    모델·하네스 평가 요약(마크다운, 필수)
  --title <text>   이슈 제목(기본: 하네스 회고·평가 보고 — <날짜>)
  --repo <o/n>     대상 저장소(기본: usagi-ai-kr/usagi)
  --out <file>     본문 저장 경로(기본: 임시 파일)
  --post           실제 gh issue create 실행(기본값은 dry-run)
  --dry-run        dry-run 명시(기본 동작)
EOF
}

die() {
  printf 'build-report: %s\n' "$1" >&2
  exit "${2:-2}"
}

# section <file> <제목 정규식> — 매칭 제목부터 다음 제목 직전까지 출력(없으면 빈 출력).
section() {
  awk -v pat="$2" '
    /^#/ {
      if (printing) { exit }
      if (tolower($0) ~ pat) { printing = 1 }
    }
    printing { print }
  ' "$1"
}

retro=''
eval_file=''
title=''
repo="$REPO_DEFAULT"
out=''
post=0

while [ $# -gt 0 ]; do
  case "$1" in
    --retro) [ $# -ge 2 ] || die '--retro 값이 필요합니다'; retro="$2"; shift 2 ;;
    --eval) [ $# -ge 2 ] || die '--eval 값이 필요합니다'; eval_file="$2"; shift 2 ;;
    --title) [ $# -ge 2 ] || die '--title 값이 필요합니다'; title="$2"; shift 2 ;;
    --repo) [ $# -ge 2 ] || die '--repo 값이 필요합니다'; repo="$2"; shift 2 ;;
    --out) [ $# -ge 2 ] || die '--out 값이 필요합니다'; out="$2"; shift 2 ;;
    --post) post=1; shift ;;
    --dry-run) post=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "알 수 없는 인자: $1" ;;
  esac
done

[ -n "$retro" ] || die '--retro 파일이 필요합니다'
[ -n "$eval_file" ] || die '--eval 파일이 필요합니다'
[ -f "$retro" ] || die "회고 문서를 찾을 수 없습니다: $retro"
[ -f "$eval_file" ] || die "평가 요약을 찾을 수 없습니다: $eval_file"
[ -n "$title" ] || title="하네스 회고·평가 보고 — $(date -u +%Y-%m-%d)"

# 본문 절 구성: 모델 평가 → 평가 요약의 모델 섹션(없으면 전체), 하네스 평가 → 평가 요약의
# 하네스 섹션(없으면 회고의 효과/빈틈 섹션, 그것도 없으면 회고 전체), 회고 과제 → 회고의 개선 섹션.
model=$(section "$eval_file" '모델|model')
[ -n "$model" ] || model=$(cat "$eval_file")
harness=$(section "$eval_file" '하네스|harness')
[ -n "$harness" ] || harness=$(section "$retro" '효과|빈틈|하네스|harness')
[ -n "$harness" ] || harness=$(cat "$retro")
tasks=$(section "$retro" '개선|과제|제안')
[ -n "$tasks" ] || tasks=$(cat "$retro")

body_file=''
if [ -n "$out" ]; then
  body_file="$out"
else
  body_file=$(mktemp "${TMPDIR:-/tmp}/moi-eval-report.XXXXXX")
  trap 'rm -f "$body_file"' EXIT
fi

cat > "$body_file" <<EOF
## 대상

- 리포지토리: ${repo}
- 회고 문서: ${retro}
- 평가 요약: ${eval_file}
- 생성 시각: $(date -u +%Y-%m-%dT%H:%M:%SZ)

## 모델 평가

${model}

## 하네스 평가

${harness}

## 회고·개선 과제

${tasks}
EOF

# GitHub 이슈 본문 상한(65536자) 대비 여유 — 초과 시 잘리고 그 사실을 표시한다.
size=$(wc -c < "$body_file" | tr -d ' ')
if [ "$size" -gt "$MAX_BYTES" ]; then
  head -c "$MAX_BYTES" "$body_file" > "$body_file.trimmed"
  printf '\n\n(본문 길이 제한으로 잘림 — 원본 %s바이트)\n' "$size" >> "$body_file.trimmed"
  mv "$body_file.trimmed" "$body_file"
fi

if [ "$post" -eq 1 ]; then
  url=$(gh issue create --repo "$repo" --title "$title" --body-file "$body_file") \
    || die 'gh issue create 실행에 실패했습니다(미게시)' 1
  printf '게시 완료: %s\n' "$url"
else
  printf '%s\n' '--- 이슈 본문 (dry-run) ---'
  cat "$body_file"
  printf '\n%s\n' '--- 실행할 명령 (--post 로만 실행) ---'
  printf 'gh issue create --repo %s --title %s --body-file %s\n' "$repo" "$title" "$body_file"
  printf '\n(dry-run: 네트워크 호출·게시 없음)\n'
fi
