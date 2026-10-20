---
id: ADR-0045
title: 해설 Mermaid 렌더러 Pele 전환
status: Accepted
date: 2026-10-20
related: ["#168", "#146", "#134", "ADR-0034"]
---

# ADR-0045: 해설 Mermaid 렌더러 Pele 전환

## 배경
- 현행 해설 Mermaid는 `mermaid` 12.2.0 + 기본 ELK 레이아웃이다. 0.2.4 콘텐츠 71개 도식 기준 첫 SVG까지 누적 JS가 **2,206.6 KiB raw / 646.5 KiB gzip / 518.3 KiB brotli**, cold 렌더 p50 **13.4ms**였다(#168 인벤토리).
- #168 PoC에서 `pele` 1.7.0 `pele/lazy`가 같은 71개 중 70개를 렌더했고(실패 1건은 콘텐츠 라벨 문법 오류로 #177에서 수정), 첫 SVG까지 **122.5 KiB raw / 49.7 KiB gzip / 44.8 KiB brotli**, cold p50 **0.6ms**였다.
- Pele는 SVG `<text>`만 사용해 `foreignObject`가 0건이고, 합성 악성 샘플 15종에서 script·이벤트 핸들러 실행과 외부 요청이 없었다. Mermaid는 network-path `<img>` 외부 요청과 `%%{init}%%` 적용이 남았다.
- 사용자가 2026-10-20 Pele 채택을 결정했다. 수업(2026-10-22) 직전 무검증 전환은 금지하며, 현재 배포는 전환 PR 병합 전까지 Mermaid를 유지한다.

## 결정
- 해설 `language-mermaid` 렌더러를 `pele` 1.7.0의 `pele/lazy`(`renderAsync` + 사용 도식 등록)로 전환한다. `MermaidDiagram`의 인터페이스·실패 시 원문 `pre/code` 폴백·접근성 계약은 유지한다.
- 구현은 **2026-10-22 수업 이후** 진행하고, 0.3.0 마일스톤의 후속 이슈에서 다룬다. 전환 PR은 아래를 같은 PR에 포함한다.
  - ADR-0034 상태를 `Superseded by ADR-0045`로 갱신(본문 보존)
  - 의존성·lockfile·`THIRD_PARTY_NOTICES` 갱신, 번들 검사
  - 보안 회귀: script/`on*`/`foreignObject`/외부 URL/위험 속성 0건, CSP 위반 0건
  - 테마: `--moi-*` 토큰을 Pele CSS 변수에 매핑, 라이트/다크·대비 확인
  - 320/375/768/1024/1280 화면 증거, 긴 한국어·AWS 서비스명·가로 오버플로
  - 유효/무효 문법·미지원 도식·타임아웃·언마운트 경합, `accTitle`/`accDescr` 스크린리더
  - 전후 첫 SVG 누적 로드·cold/warm 렌더 수치와 롤백 경로
- 호환성 검증 후 Mermaid 의존성을 제거한다. 이중 번들을 장기 유지하지 않는다.

## 결과
- 긍정: 첫 SVG까지 JS가 raw 기준 약 94% 감소(2,206.6→122.5 KiB), cold 렌더 p50 13.4→0.6ms, `foreignObject` 제거로 SVG 경계가 단순해진다. 375px에서 글자 축소 대신 세로 재배치되어 모바일 가독성이 좋아진다.
- 부정/제약: Pele는 Mermaid 완전 호환이 아니다. HTML 라벨은 평문 처리되고 `%%{init}%%` 지시문은 무시되며 일부 도식·플러그인은 별도 등록이 필요하다. Pele 1.7.0 API·동작 변경 리스크와 새 라이선스 고지·테스트 유지 비용이 생긴다.
- 수업 리스크: 전환은 수업 이후로 제한한다. 수업용 배포(`e1259d6d`)는 Mermaid를 유지하며, #177 콘텐츠 수정만 선반영한다.

## 대안과 금지 사항
- Mermaid 유지 — ELK 포함 첫 SVG 2.2MiB는 모바일 수업 환경에 과도해 기각.
- Mermaid/Pele 이중 렌더러 — 번들·테스트·보안 면적이 두 배가 되어 기각.
- 서버 측 SVG 렌더 — Worker 번들·악성 입력 경계·캐시 복잡도가 커져 기각.
- 수업 직전 무검증 전환 — 금지. PoC 71개 전수·보안·접근성·viewport 증거 없이는 병합하지 않는다.

## 참고
- 이슈 #168(PoC 인벤토리·2단계 결과), #146(수업 배포), #134/#177(Mermaid 라벨 인용 수정), ADR-0034(기존 렌더링 계약).
- `docs/adr/0034-explanation-markdown-mermaid.md` — 마크다운 파이프라인(`react-markdown`+`remark-gfm`)과 폴백 계약은 유지하고 Mermaid 렌더러 부분만 본 ADR로 대체한다.
