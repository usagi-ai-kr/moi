#!/usr/bin/env sh
# PASETO v4.local 대칭 키(32바이트, base64)를 생성해 Cloudflare Secrets/.dev.vars에 등록한다.
# 키 원문은 생성·출력·로그 어디에도 남기지 않는다 (ADR-0005/0006, 이슈 #11).
# 의존성: openssl, wrangler(원격), git(.dev.vars gitignore 확인)
# 사용법: sh .agents/skills/session-paseto/scripts/put-paseto-key.sh <SECRET_NAME> [--local | --env <name>] [--replace]
#   --local   : .dev.vars에 추가 (gitignore 확인·중복 키 기본 거부·umask 077·권한 600)
#   --replace : 기존 키 교체 허용 (회전 절차는 SKILL.md '키 회전 절차')
# 종료 코드: 0 성공, 2 사용/가드 오류, 3 도구 없음, 4 원격 등록 실패
set -eu

usage="usage: $0 <SECRET_NAME> [--local | --env <name>] [--replace]"
[ $# -ge 1 ] || { echo "$usage" >&2; exit 2; }

name=$1
shift
case "$name" in
  ''|*[!A-Za-z0-9_]*|[0-9]*)
    echo "FAIL: 시크릿 이름 형식 오류(영문/숫자/_, 숫자 시작 금지): $name" >&2
    exit 2
    ;;
esac

mode=remote
env_name=
replace=0
while [ $# -gt 0 ]; do
  case "$1" in
    --local)
      mode=local
      ;;
    --env)
      [ $# -ge 2 ] || { echo "FAIL: --env 뒤에 환경 이름이 필요합니다" >&2; exit 2; }
      env_name=$2
      case "$env_name" in
        ''|*[!A-Za-z0-9_-]*)
          echo "FAIL: 환경 이름 형식 오류: $env_name" >&2
          exit 2
          ;;
      esac
      shift
      ;;
    --replace)
      replace=1
      ;;
    *)
      echo "FAIL: 알 수 없는 인자: $1" >&2
      echo "$usage" >&2
      exit 2
      ;;
  esac
  shift
done

if [ "$mode" = local ] && [ -n "$env_name" ]; then
  echo "FAIL: --local과 --env는 함께 사용할 수 없습니다" >&2
  exit 2
fi

command -v openssl >/dev/null 2>&1 || { echo "FAIL: openssl이 필요합니다" >&2; exit 3; }

if [ "$mode" = local ]; then
  if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git check-ignore -q .dev.vars || {
      echo "FAIL: .dev.vars가 .gitignore에 없습니다 — 시크릿 커밋 위험, 중단" >&2
      exit 2
    }
  else
    echo "WARN: git 저장소가 아니어서 .dev.vars gitignore 확인을 생략합니다" >&2
  fi

  umask 077
  if [ -f .dev.vars ] && grep -qE "^${name}=" .dev.vars; then
    if [ "$replace" -eq 1 ]; then
      tmpf=$(mktemp)
      grep -vE "^${name}=" .dev.vars > "$tmpf"
      mv "$tmpf" .dev.vars
      echo "INFO: 기존 $name 키를 교체합니다(--replace) — 이전 키 제거는 만료 후(회전 절차 참조)" >&2
    else
      echo "FAIL: .dev.vars에 $name 이(가) 이미 있습니다 — 교체하려면 --replace" >&2
      exit 2
    fi
  fi
  printf '%s=%s\n' "$name" "$(openssl rand -base64 32)" >> .dev.vars
  chmod 600 .dev.vars 2>/dev/null || true
  echo "OK: .dev.vars에 $name 등록 (원문 미출력, 권한 600)"
  exit 0
fi

command -v wrangler >/dev/null 2>&1 || { echo "FAIL: wrangler가 필요합니다" >&2; exit 3; }
keyfile=$(mktemp)
trap 'rm -f "$keyfile"' EXIT INT TERM
openssl rand -base64 32 > "$keyfile"
if [ -n "$env_name" ]; then
  wrangler secret put "$name" --env "$env_name" < "$keyfile" || {
    echo "FAIL: wrangler 원격 등록 실패(env: $env_name)" >&2
    exit 4
  }
else
  wrangler secret put "$name" < "$keyfile" || {
    echo "FAIL: wrangler 원격 등록 실패" >&2
    exit 4
  }
fi
echo "INFO: 원격 Secrets 갱신은 덮어쓰기입니다 — 회전 시 이전 키를 만료 전 제거하지 마세요" >&2
echo "OK: $name 시크릿 등록 (원문 미출력)"
