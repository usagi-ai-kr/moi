# 문제 콘텐츠 작성 계약 (#134)

수업용 문제를 저장소에서 작성하고 기존 관리 API bulk payload로
변환하기 위한 JSON 작성 계약이다. **실제 수업 문항의 범위·수는 #131에서
사용자가 확정한다. 이 디렉터리의 예시 팩은 구조 검증용이며 수업 사용 금지.**

## 팩 파일 위치·형식

- 팩 파일: `content/questions/<examCode>/<packId>.json`
- 형식:

```json
{
  "packId": "saa-c03-sample",
  "examCode": "saa-c03",
  "items": [
    {
      "questionId": "saa-sample-0001",
      "domainCode": "security",
      "stem": "…",
      "explanation": "…",
      "sourceUrls": ["https://docs.aws.amazon.com/…"],
      "answerOptionKeys": ["B"],
      "options": [
        { "optionKey": "A", "text": "…" },
        { "optionKey": "B", "text": "…" }
      ]
    }
  ]
}
```

## 필드 규칙

- `packId`·`examCode`: 비어 있지 않은 문자열. 파일명은 `<packId>.json`이다.
- `questionId`: 작성자 추적용 안정 ID. 팩 내부·전체 팩 간 중복 금지.
  **한계: 서버 등록 시에는 서버가 UUID를 새로 생성하므로, 이 ID는
  저장소 작성 추적용이며 서버 식별자와 동일하지 않다.**
- `domainCode`: 정본 코드 4개 중 하나. 앱·ADR-0019와 동일해야 하며
  그 외 값은 검증기 오류·admin 등록 422(`unknown exam_code or domain_code`)가 난다.

| 코드 | 의미 | 목표 수 |
| --- | --- | --- |
| `security` | 보안 | 150 |
| `resilience` | 복원력 | 130 |
| `performance` | 성능 | 120 |
| `cost-optimization` | 비용 최적화 | 100 |

- 500문제 배분: `security` 150 / `resilience` 130 / `performance` 120 /
  `cost-optimization` 100 (합계 500).
- `stem`·`explanation`: 앞뒤 공백 제거 후 비어 있지 않아야 한다.
  정규화(연속 공백 축소·소문자) stem 중복 금지(팩 내부·전체 팩 간).
- `options`: 2~20개. `optionKey`는 문항 내 유일, `text`는 비어 있지 않다.
- `answerOptionKeys`: 1개 이상, 중복 없음, 반드시 `options`의 부분집합.
- `sourceUrls`: 1개 이상, 모두 `https://docs.aws.amazon.com/`로 시작.
  AWS 공식 문서 URL만 사용한다. 덤프·기출 복제 금지.

## 정답 원본 보관

- 정답 원본(`answerOptionKeys` 포함 팩)은 `content/`에만 둔다.
  `public/`·`src/`에 넣지 않는다(브라우저 번들·정적 자산 유출 방지).

## 검증·변환

```sh
node scripts/validate-question-content.mjs content/questions
node scripts/validate-question-content.mjs content/questions --emit /tmp/bulk.json
```

- `--emit <out.json>`은 기존 `bulkBodySchema`와 동일한
  `{ "items": [...] }`를 생성한다. `questionId`는 제거하고,
  `optionSetHash`는 옵션을 `optionKey` 순으로 정렬한 canonical JSON의
  SHA-256 hex로 계산한다.
- bulk 항목 필드: `examCode`, `domainCode`, `stem`, `explanation`,
  `sourceUrls`, `answerOptionKeys`, `optionSetHash`, `options`.
