Feature: 앱 버전·빌드 일자 푸터 (#footer-version)

  Background:
    Given 학습 API 모의가 준비되면

  Scenario: 푸터가 버전·빌드 일자를 중앙 정렬로 표시한다
    When 홈 페이지에 접속하면
    Then 푸터에 버전과 빌드 일자가 표시된다
    And 푸터는 가운데 정렬이다
    And 푸터 글자색 대비가 4.5 대 1 이상이다
