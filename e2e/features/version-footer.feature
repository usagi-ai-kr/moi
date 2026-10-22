Feature: 푸터 버전 및 콘솔 빌드 메타 (#footer-console)

  Background:
    Given 학습 API 모의가 준비되면

  Scenario: 푸터는 버전만 중앙 정렬로 표시한다
    When 홈 페이지에 접속하면
    Then 푸터에 버전만 표시된다
    And 푸터는 가운데 정렬이다
    And 푸터 글자색 대비가 4.5 대 1 이상이다

  Scenario: 푸터는 날짜와 PR 번호를 노출하지 않는다
    When 홈 페이지에 접속하면
    Then 푸터에 버전만 표시된다
    And 푸터에 날짜와 PR 번호가 없다

  Scenario Outline: 세 폭에서 푸터에 버전만 표시한다
    Given 뷰포트 너비가 <width>px이면
    When 홈 페이지에 접속하면
    Then 푸터에 버전만 표시된다
    And 푸터에 날짜와 PR 번호가 없다
    And 푸터는 가운데 정렬이다

    Examples:
      | width |
      | 375   |
      | 768   |
      | 1280  |
