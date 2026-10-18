Feature: 0.1.0 스모크 — 홈·health (#1, #10)

  Scenario: 홈 화면 로드
    Given 홈 페이지에 접속하면
    Then 화면에 "moi" 제목이 보인다

  Scenario: Worker health API 응답
    When "/api/health" API를 호출하면 상태 200과 JSON ok=true 를 받는다
