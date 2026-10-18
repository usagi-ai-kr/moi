Feature: 0.2.1 학습 UI — 20문제 핵심 흐름 (#50)

  Background:
    Given 학습 API 모의가 준비되면

  Scenario: 시작부터 제출·결과까지 핵심 흐름
    When 홈 페이지에 접속하면
    And 20문제 학습 버튼을 누르면
    Then 학습 범위 선택이 보인다
    When 학습 시작 버튼을 누르면
    Then 문제 화면이 보인다
    And 문제 본문과 보기가 보인다
    When 첫 번째 보기를 선택하면
    Then 저장됨 표시가 보인다
    When 제출하기 버튼을 누르면
    And 제출을 확인하면
    Then 학습 결과가 보인다
    And 해설과 근거가 보인다

  Scenario: 오프라인 답안 재연결
    Given 답안 저장이 일시 실패하도록 준비되면
    When 홈 페이지에 접속하면
    And 20문제 학습 버튼을 누르면
    And 학습 시작 버튼을 누르면
    And 첫 번째 보기를 선택하면
    Then 오프라인 임시 저장이 보인다
    When 네트워크가 복구되면
    Then 저장됨 표시가 보인다

  Scenario: 미응답 제출 확인
    When 홈 페이지에 접속하면
    And 20문제 학습 버튼을 누르면
    And 학습 시작 버튼을 누르면
    And 제출하기 버튼을 누르면
    Then 미응답 확인이 보인다

  Scenario: 포기 흐름
    When 홈 페이지에 접속하면
    And 20문제 학습 버튼을 누르면
    And 학습 시작 버튼을 누르면
    And 포기하기 버튼을 누르면
    Then 포기 확인이 보인다
    When 포기를 확인하면
    Then 학습 범위 선택이 보인다

  Scenario: 이력 흐름
    When 홈 페이지에 접속하면
    And 20문제 학습 버튼을 누르면
    And 학습 시작 버튼을 누르면
    And 첫 번째 보기를 선택하면
    And 제출하기 버튼을 누르면
    And 제출을 확인하면
    And 학습 이력 버튼을 누르면
    Then 완료 세트가 보인다

  Scenario Outline: 학습 화면 반응형 가로 오버플로 없음
    Given 뷰포트 너비가 <width>px이면
    When 홈 페이지에 접속하면
    And 20문제 학습 버튼을 누르면
    Then 가로 오버플로가 없다

    Examples:
      | width |
      | 320   |
      | 375   |
      | 768   |
      | 1024  |
      | 1280  |
