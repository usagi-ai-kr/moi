Feature: #274 카드형 질문 통일 — 일반 학습이 복습 카드 디자인을 공유한다

  Background:
    Given 학습 API 모의가 준비되면

  Scenario: 풀이 화면은 카드형 질문·선택지로 보인다
    When 홈 페이지에 접속하면
    And 학습 시작 버튼을 누르면
    And 학습 시작 버튼을 누르면
    Then 문제 화면이 보인다
    And 풀이 질문 카드와 선택지 행이 보인다
    And 가로 오버플로가 없다
