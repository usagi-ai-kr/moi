Feature: 공개 라이선스 고지 페이지 (이슈 #121)

  Scenario: 로그인 없이 /licenses 직접 열람
    Given 로그인 없이 "/licenses" 에 접속하면
    Then 라이선스 고지가 보인다
    And "확인 필요" 항목이 숨겨지지 않는다

  Scenario: 세션 API 장애와 무관하게 열람
    Given 세션 API가 실패하는 상태에서 "/licenses" 에 접속하면
    Then 라이선스 고지가 보인다

  Scenario: 홈 푸터에서 접근·홈 복귀
    When 홈 화면에서 푸터 라이선스 링크로 이동하면
    Then 라이선스 페이지로 이동한다
    When 홈으로 돌아가기 링크를 누르면
    Then 홈 화면으로 돌아간다

  Scenario: 키보드 포커스 이동
    Given 라이선스 페이지에 포커스를 두면
    When Tab 키를 누르면
    Then 포커스가 링크에 놓인다

  Scenario: 모든 viewport에서 가로 스크롤 없이 표시
    Then 320/375/768/1024/1280 각 너비에서 가로 스크롤 없이 고지가 보인다

  Scenario: 원문 고지 자산 실제 접근
    Given 로그인 없이 "/licenses" 에 접속하면
    Then 원문 고지 자산 링크가 실제로 응답한다
