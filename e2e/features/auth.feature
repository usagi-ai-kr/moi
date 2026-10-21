Feature: 0.1.3 로그인 UI — 세션 상태 화면 (#4)

  Background:
    Given API 모의가 준비되면

  Scenario: 비로그인 홈
    Given API가 비로그인 상태이면
    When 홈 페이지에 접속하면
    Then 카카오 로그인 버튼이 보인다
    And 오류 안내가 보이지 않는다

  Scenario: 로그인 상태
    Given API가 사용자 "e2e-user-1"로 로그인 상태이면
    When 홈 페이지에 접속하면
    Then 학습 시작 화면과 상단 메뉴가 보인다
    And 원본 사용자 id가 노출되지 않는다

  Scenario: 로그인 오류·취소
    Given API가 비로그인 상태이면
    When "?auth=error"로 접속하면
    Then 로그인 오류 안내가 보인다
    And 주소창에서 auth 파라미터가 정리된다

  Scenario: 로그아웃 흐름 — 상단 메뉴의 독립 액션
    Given API가 사용자 "e2e-user-1"로 로그인 상태이면
    And 로그아웃 API가 성공하고 이후 세션이 만료되면
    When 홈 페이지에 접속하면
    And 상단 메뉴에 로그아웃 액션이 보인다
    And 상단 메뉴에서 로그아웃을 누르면
    Then 진행 중 표시가 보인다
    And 로그아웃 완료 후 카카오 로그인 버튼이 보인다

  Scenario: 계정 정보 — 가입일·최근 로그인·로그인 방식
    Given API가 사용자 "e2e-user-1"로 로그인 상태이면
    When 계정 화면에 접속하면
    Then 가입일·최근 로그인·로그인 방식이 보인다
    And 계정 본문에는 로그아웃 버튼이 없다
    And 원본 사용자 id가 노출되지 않는다

  Scenario Outline: 반응형 가로 오버플로 없음
    Given API가 비로그인 상태이면
    And 뷰포트 너비가 <width>px이면
    When 홈 페이지에 접속하면
    Then 가로 오버플로가 없다

    Examples:
      | width |
      | 320   |
      | 375   |
      | 768   |
      | 1024  |
      | 1280  |
