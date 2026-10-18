#!/usr/bin/env sh
# 회귀 테스트: check-module-lengths.mjs의 ** 재귀·{a,b} brace 확장 검증 (ADR-0015)
# 사용법: sh .agents/skills/harness-budget/scripts/check-module-lengths.test.sh (repo root에서 실행)
# 종료 코드: 0 전 케이스 통과, 1 실패 있음. 원본 저장소를 오염시키지 않는다.
set -eu

ROOT=$(pwd)
SCRIPT_REL=".agents/skills/harness-budget/scripts/check-module-lengths.mjs"
pass=0
fail=0

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT INT TERM

mk_case() {
  # $1 = 케이스명 → $TMP/$1 을 최소 repo fixture로 초기화하고 경로 출력
  dir="$TMP/$1"
  mkdir -p "$dir/.agents/skills/harness-budget/scripts" "$dir/src"
  cp "$ROOT/$SCRIPT_REL" "$dir/$SCRIPT_REL"
  cat > "$dir/.agents/skills/harness-budget/scripts/budgets.json" <<'JSON'
{
  "_comment": "test fixture (ADR-0015)",
  "budgets": [
    {
      "match": "src/**/*.{ts,tsx,css}",
      "targetLines": 150,
      "maxLines": 250,
      "maxBytes": 16384,
      "note": "fixture"
    }
  ]
}
JSON
  printf '%s' "$dir"
}

ok() { pass=$((pass + 1)); echo "PASS $1"; }
ng() { fail=$((fail + 1)); echo "FAIL $1"; }

# ① 전부 이내 → exit 0
d=$(mk_case case1)
mkdir -p "$d/src/sub"
printf '// a\n// b\n' > "$d/src/a.ts"
printf '// a\n// b\n' > "$d/src/sub/b.tsx"
printf '/* c */\n' > "$d/src/sub/c.css"
if (cd "$d" && node "$SCRIPT_REL" >/dev/null 2>&1); then ok "① 전부 이내 exit 0"; else ng "① 전부 이내 exit 0 (exit=$?)"; fi

# ② 251줄 src 파일 → exit 1
d=$(mk_case case2)
awk 'BEGIN { for (i = 0; i < 251; i++) print "// line " i }' > "$d/src/big.ts"
if (cd "$d" && node "$SCRIPT_REL" >/dev/null 2>&1); then ng "② 251줄 exit 1이어야 하나 exit 0"; else
  code=$?
  if [ "$code" -eq 1 ]; then ok "② 251줄 src 파일 exit 1"; else ng "② 251줄 exit 코드=$code (1 기대)"; fi
fi

# ③ 16KB 초과(줄 수 이내) → exit 1
d=$(mk_case case3)
awk 'BEGIN { printf "//"; for (i = 0; i < 17000; i++) printf "a"; printf "\n// line2\n// line3\n" }' > "$d/src/heavy.ts"
if (cd "$d" && node "$SCRIPT_REL" >/dev/null 2>&1); then ng "③ 16KB 초과 exit 1이어야 하나 exit 0"; else
  code=$?
  if [ "$code" -eq 1 ]; then ok "③ 16KB 초과(줄 수 이내) exit 1"; else ng "③ 16KB 초과 exit 코드=$code (1 기대)"; fi
fi

# ④ 중첩 깊이 파일 탐지 → exit 1 + --json에 경로 포함
d=$(mk_case case4)
mkdir -p "$d/src/a/b/c/deep"
awk 'BEGIN { for (i = 0; i < 251; i++) print "// line " i }' > "$d/src/a/b/c/deep/nested.ts"
out_file="$d/out.json"
if (cd "$d" && node "$SCRIPT_REL" --json > "$out_file" 2>/dev/null); then ng "④ 중첩 깊이 exit 1이어야 하나 exit 0"; else
  code=$?
  if [ "$code" -eq 1 ] && grep -q "src/a/b/c/deep/nested.ts" "$out_file"; then
    ok "④ 중첩 깊이 파일 탐지 exit 1"
  else
    ng "④ 중첩 깊이 탐지 실패 (exit=$code)"
  fi
fi

# ⑤ brace 확장(ts/tsx/css) 탐지 → --json 모듈 목록에 3종 전부
d=$(mk_case case5)
mkdir -p "$d/src/x" "$d/src/y" "$d/src/z"
printf '// one\n' > "$d/src/x/one.ts"
printf '// two\n' > "$d/src/y/two.tsx"
printf '/* three */\n' > "$d/src/z/three.css"
out_file="$d/out.json"
if (cd "$d" && node "$SCRIPT_REL" --json > "$out_file" 2>/dev/null); then
  if grep -q "src/x/one.ts" "$out_file" && grep -q "src/y/two.tsx" "$out_file" && grep -q "src/z/three.css" "$out_file"; then
    ok "⑤ brace 확장(ts/tsx/css) 탐지"
  else
    ng "⑤ brace 확장 — 3종 중 누락 있음"
  fi
else
  ng "⑤ brace 확장 — 정상 fixture인데 exit $?"
fi

echo "---"
echo "결과: PASS $pass / FAIL $fail"
[ "$fail" -eq 0 ]
