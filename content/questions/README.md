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
- `stem`: 앞뒤 공백 제거 후 비어 있지 않아야 한다. 최대 4000자, 일반 텍스트만
  허용한다(원시 HTML·스크립트 금지). 정규화(연속 공백 축소·소문자) stem 중복
  금지(팩 내부·전체 팩 간).
- `explanation`: 앞뒤 공백 제거 후 비어 있지 않아야 한다. 최대 8000자.
  Markdown(GFM)과 Mermaid 다이어그램을 허용한다(아래 계약 참조).
- `options`: 2~20개. `optionKey`는 문항 내 유일, `text`는 비어 있지 않다.
- `answerOptionKeys`: 1개 이상, 중복 없음, 반드시 `options`의 부분집합.
- `sourceUrls`: 1개 이상, 모두 `https://docs.aws.amazon.com/`로 시작.
  AWS 공식 문서 URL만 사용한다. 덤프·기출 복제 금지.

## 해설 Markdown·Mermaid 계약

- 해설은 GFM Markdown을 허용한다: 강조, 목록, 표, 인라인 코드(`` `...` ``).
- ` ```mermaid ` 펜스 블록으로 다이어그램을 넣을 수 있다. 펜스는 반드시
  닫아야 하며(열림/닫힘 균형), 다이어그램은 **이해에 꼭 필요한 적절한 경우에만**
  사용한다. 글로 충분히 설명되는 내용은 다이어그램 없이 쓴다.
- 원시 HTML·스크립트는 금지한다. `stem`·`explanation`에 `<script` 또는
  `javascript:`가 포함되면 검증기가 오류로 처리한다.
- 다이어그램·Markdown 문법도 8000자 상한에 포함한다. 코드 블록·인라인 코드는
  품질 게이트의 문장 수 계산에서 제외된다(Mermaid 문법을 산문으로 오판하지 않음).
- 예시:

  ````
  ```mermaid
  flowchart LR
    A[Client] --> B[VPC Endpoint]
    B --> C[S3]
  ```
  ````

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
- 검증기는 `stem`/`explanation`의 원시 스크립트, 해설 8000자 초과, 닫히지 않은
  펜스 블록도 함께 거부한다.

## 이미 등록된 문항 수정

이미 등록된 문항을 고칠 때는 **bulk 재실행 금지** — bulk 페이로드는
`questionId`를 제거하고 서버가 항목마다 새 UUID를 생성하므로, 1바이트
교정에도 청크 전량이 중복 등록된다. 기존 문항은
`PATCH /api/admin/questions/:id`로 바뀐 필드만 새 개정을 만들고(#146의
`saa-res-0129` 1행 교정이 표준 사례), 신규 문항만 bulk로 추가한다.
원격 실행은 #127 승인 범위(사전 time-travel 백업·export, 토큰 원문
이슈·로그 기록 금지)이며 토큰은 `MOI_ADMIN_TOKEN` 환경변수로만 전달한다.

```sh
# 현재 버전 확인(읽기 권한)
curl -H "Authorization: Bearer $MOI_ADMIN_TOKEN" \
  <baseUrl>/api/admin/questions/<questionId>

# 행 교정: 바뀐 필드만 PATCH(새 개정 저장, 기존 행 보존)
curl -X PATCH -H "Authorization: Bearer $MOI_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"explanation":"수정된 해설 …"}' \
  <baseUrl>/api/admin/questions/<questionId>

# 신규 문항만 bulk 추가(100개 이하 청크, Idempotency-Key 자동 부여)
MOI_ADMIN_TOKEN="$MOI_ADMIN_TOKEN" node scripts/register-content.mjs \
  --url <baseUrl> --dir content/questions/<examCode>
```
