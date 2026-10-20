# pele-validation — #179 Pele 독립 검증 하네스

`src/ui/study/Explanation` → `MermaidDiagram` → `renderPeleDiagram` → `sanitizePeleSvg`
**실제 제품 경로**를 브라우저에서 검증하는 하네스다. 제품 `src`는 읽기만 한다.

## 실행

```bash
# 저장소 루트에서 1개 명령
node scripts/pele-validation/run-validation.mjs --port 4195
```

- 도식 데이터: `content/questions/**` 에서 mermaid 블록 전수 추출(원본 미변경) → `docs/evidence/179-pele/dataset.json`
- 하네스 번들: 별도 Vite 설정(`vite.harness.config.mjs`, root=`harness/`)으로 빌드 → 임시 디렉터리
  (`public/`·제품 번들·제품 `vite.config.ts` 무수정). `pnpm build` 결과에 포함되지 않는다.
- 도식·악성 샘플은 실행 시 `window.__PELE_DATASET__`로 주입 → 하네스 번들에 콘텐츠가 남지 않는다.
- 산출물: `docs/evidence/179-pele/{validation-results.json,summary.json,dataset.json,screenshots/}`

## 구성

| 파일 | 역할 |
| --- | --- |
| `extract-diagrams.mjs` | content/questions → 도식 71개 전수 추출(JSON) |
| `attack-samples.mjs` | 앱 경로 악성 30종 + sanitizer 직접 경계 38종 |
| `harness/index.html` | 하네스 페이지(CSP는 **하네스 구성** — 제품에는 CSP가 없다) |
| `harness/main.tsx` | 제품 `Explanation` 컴포넌트를 그대로 렌더 + `sanitizePeleSvg` 노출 |
| `vite.harness.config.mjs` | 하네스 전용 Vite 설정(제품 설정과 분리) |
| `run-validation.mjs` | Playwright 드라이버(①도식 ②공격 ③viewport ④perf) |

## 측정 방식

- 도식: `.moi-mermaid` DOM 개수/렌더 여부/`p[role=alert]` 폴백/내부 오버플로/텍스트 잘림(클라이언트 사각형 기준)/id 중복
- 공격: `script`·`foreignObject` 등 위반 요소, `on*` 속성, 외부 URL, `url()` 페인트, 캔리 실행(`window.__pwned`), 외부 리소스 요청, CSP 위반
- viewport: `documentElement.scrollWidth - clientWidth` + 스크롤 컨테이너 밖으로溢나는 요소 + 대표 캡처 1장/viewport
- perf: navigationStart → 첫 SVG(`performance.now()`), warm 는 remount 직후 클릭 시점 기준
