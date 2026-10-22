---
id: ADR-0070
title: 정적 OG/X 메타와 1200×630 공유 이미지 계약
status: Accepted
date: 2026-10-21
related: [236]
---

# ADR-0070: 정적 OG/X 메타와 1200×630 공유 이미지 계약

## 배경
- 서비스 URL 공유 시 KakaoTalk/X 미리보기 카드가 정상 표시되지 않았다.
- CSR 이후 JS로만 meta를 추가하면 소셜 수집기가 읽지 못할 수 있어, 서버가 반환하는 최초 HTML에 정적 meta가 필요하다.
- #71의 전면 SEO/페이지별 OG/프리렌더는 0.3에서 계속 추적한다.

## 결정
- `index.html` `<head>`에 정적 OG/X meta를 둔다: title/description, `og:type=website`, `og:site_name=moi`, `og:title`, `og:description`, `og:url=https://moi.qus0in.workers.dev/`, `og:image` 공개 HTTPS 절대 URL, `og:image:width/height=1200/630`, `og:image:alt`, `og:locale=ko_KR`, `twitter:card=summary_large_image`, title/description/image/image:alt.
- 확인되지 않은 `twitter:site`/`twitter:creator`는 작성하지 않는다.
- 공유 이미지는 `public/og/moi-og.png` 1200×630 PNG로 둔다. 브랜드 새·moi와 문구를 포함하고 중요 요소는 중앙 안전 영역에 둔다. 5MB 미만.
- 이미지 생성은 `scripts/generate-og.mjs`가 Playwright로 로컬 HTML 카드를 스크린샷해 재현한다. 새 런타임 의존성은 추가하지 않는다.
- 내부 UUID/세션/학습 데이터는 OG URL/이미지/설명에 넣지 않는다. 로그인 필요 경로는 루트 공용 소개 meta로 안전하게 폴백한다.

## 결과
- 긍정: 비로그인 최초 HTML에서 소셜 수집기가 meta와 이미지를 읽을 수 있다.
- 부정/제약: 페이지별 OG와 동적 미리보기는 0.3(#71) 범위다. Kakao 캐시 초기화와 실제 공유 확인은 사용자/운영 항목이다.

## 대안과 금지 사항
- JS로만 meta 추가 금지.
- favicon 확대나 5MB 이상 이미지 금지.
- 내부 ID/개인 데이터 노출 금지.

## 참고
- 이슈 #236
