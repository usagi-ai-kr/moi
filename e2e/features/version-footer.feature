Feature: 앱 버전·빌드 일자 푸터 (#footer-version·#336)

  Background:
    Given 학습 API 모의가 준비되면

  Scenario: 푸터가 버전·빌드 일자를 중앙 정렬로 표시한다
    When 홈 페이지에 접속하면
    Then 푸터에 버전과 빌드 일자가 표시된다
    And 푸터는 가운데 정렬이다
    And 푸터 글자색 대비가 4.5 대 1 이상이다

  # #336 — 하이픈 대신 가운데점 구분자를 써 날짜 식별성을 높인다.
  Scenario: 푸터 날짜는 가운데점 구분자를 쓰고 밑줄이 없다
    When 홈 페이지에 접속하면
    Then 푸터에 버전과 빌드 일자가 표시된다
    And 푸터에 밑줄이 없다
    And 푸터 날짜 구분자는 가운데점으로 보인다

  Scenario Outline: 세 폭에서 날짜 구분자가 가운데점으로 보인다
    Given 뷰포트 너비가 <width>px이면
    When 홈 페이지에 접속하면
    Then 푸터에 버전과 빌드 일자가 표시된다
    And 푸터에 밑줄이 없다
    And 푸터 날짜 구분자는 가운데점으로 보인다
    And 푸터는 가운데 정렬이다

    Examples:
      | width |
      | 375   |
      | 768   |
      | 1280  |
