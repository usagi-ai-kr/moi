#!/usr/bin/env sh
# PASETO v4.local 대칭 키(32바이트, base64)를 생성해 Cloudflare Secrets에 직접 등록한다.
# 키 원문은 화면/로그에 출력하지 않는다 (transcript 유출 방지, ADR-0005/0006).
# 의존성: openssl, wrangler (--local 모드에서는 openssl만)
# 사용법: sh scripts/put-paseto-key.sh <SECRET_NAME> [--env <env> | --local]
#   --local: .dev.vars에 추가 (로컬 개발용; .gitignore 확인)
set -eu

if [ $# -lt 1 ]; then
  echo "usage: $0 <SECRET_NAME> [--env <env> | --local]" >&2
  exit 2
fi
name="$1"; shift

command -v openssl >/dev/null 2>&1 || { echo "openssl이 필요합니다" >&2; exit 3; }

if [ "${1:-}" = "--local" ]; then
  printf '%s=%s\n' "$name" "$(openssl rand -base64 32)" >> .dev.vars
  echo "OK: .dev.vars에 $name 등록 (원문 미출력 — .gitignore 포함 확인)"
  exit 0
fi

if [ "${1:-}" = "--env" ]; then
  env_name="${2:?--env 뒤에 환경 이름이 필요합니다}"
  openssl rand -base64 32 | wrangler secret put "$name" --env "$env_name"
else
  openssl rand -base64 32 | wrangler secret put "$name"
fi
echo "OK: $name 시크릿 등록 (원문 미출력)"
