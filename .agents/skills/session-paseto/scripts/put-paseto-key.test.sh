#!/usr/bin/env sh
# put-paseto-key.sh 가드 회귀 테스트 (이슈 #11): 형식 검증·중복 거부·--replace·gitignore 가드.
# 실행: sh .agents/skills/session-paseto/scripts/put-paseto-key.test.sh
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
target="$here/put-paseto-key.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

fails=0
ok() { echo "  OK: $1"; }
ng() { echo "  FAIL: $1"; fails=1; }

st=0
out=$(sh "$target" "bad-name" --local 2>&1) || st=$?
[ "$st" -eq 2 ] && ok "이름 형식 오류 exit 2" || ng "이름 형식 exit $st (기대 2)"

st=0
out=$(sh "$target" 2>&1) || st=$?
[ "$st" -eq 2 ] && ok "인자 없음 exit 2" || ng "인자 없음 exit $st (기대 2)"

st=0
out=$(sh "$target" KEY --env 2>&1) || st=$?
[ "$st" -eq 2 ] && ok "--env 값 없음 exit 2" || ng "--env 누락 exit $st (기대 2)"

st=0
out=$(sh "$target" KEY --local --env prod 2>&1) || st=$?
[ "$st" -eq 2 ] && ok "--local/--env 동시 사용 exit 2" || ng "동시 사용 exit $st (기대 2)"

st=0
out=$(sh "$target" KEY --bogus 2>&1) || st=$?
[ "$st" -eq 2 ] && ok "알 수 없는 인자 exit 2" || ng "알 수 없는 인자 exit $st (기대 2)"

if command -v git >/dev/null 2>&1; then
  (cd "$tmp" && git init -q && printf '.dev.vars\n' > .gitignore)
  printf 'PASETO_KEY_V1=existing\nOTHER=1\n' > "$tmp/.dev.vars"
  chmod 600 "$tmp/.dev.vars"

  st=0
  out=$(cd "$tmp" && sh "$target" PASETO_KEY_V1 --local 2>&1) || st=$?
  [ "$st" -eq 2 ] && ok "중복 키 기본 거부 exit 2" || ng "중복 키 exit $st (기대 2)"
  printf '%s' "$out" | grep -q 'existing' && ng "기존 키 원문 출력됨" || ok "기존 키 원문 미출력"

  st=0
  out=$(cd "$tmp" && sh "$target" PASETO_KEY_V2 --local 2>&1) || st=$?
  [ "$st" -eq 0 ] && ok "신규 키 등록 exit 0" || ng "신규 키 exit $st (기대 0)"
  grep -q '^PASETO_KEY_V2=' "$tmp/.dev.vars" && ok ".dev.vars에 키 추가" || ng ".dev.vars 키 미기록"
  perms=$(ls -l "$tmp/.dev.vars" | cut -c1-10)
  [ "$perms" = "-rw-------" ] && ok "권한 600" || ng ".dev.vars 권한 $perms (기대 -rw-------)"

  st=0
  out=$(cd "$tmp" && sh "$target" PASETO_KEY_V1 --local --replace 2>&1) || st=$?
  [ "$st" -eq 0 ] && ok "--replace 교체 exit 0" || ng "--replace exit $st (기대 0)"
  cnt=$(grep -c '^PASETO_KEY_V1=' "$tmp/.dev.vars" || true)
  [ "$cnt" -eq 1 ] && ok "교체 후 키 1건" || ng "교체 후 키 $cnt건 (기대 1)"
  grep -q '^OTHER=1$' "$tmp/.dev.vars" && ok "다른 키 보존" || ng "다른 키 손실"

  mkdir -p "$tmp/norepo"
  (cd "$tmp/norepo" && git init -q)
  st=0
  out=$(cd "$tmp/norepo" && sh "$target" NOIGNORE_KEY --local 2>&1) || st=$?
  [ "$st" -eq 2 ] && ok "gitignore 미등록 가드 exit 2" || ng "gitignore 가드 exit $st (기대 2)"
else
  echo "  SKIP: git 없음 — 로컬 모드 케이스 생략"
fi

if [ "$fails" -eq 0 ]; then
  echo "OK: put-paseto-key 가드 회귀 테스트 통과"
else
  echo "FAIL: put-paseto-key 가드 회귀 테스트 실패"
  exit 1
fi
