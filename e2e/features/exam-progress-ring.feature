Feature: 시험 선택기 옆 시험 전체 학습 진척도 링 (#353)

  Scenario Outline: 서버 진척도 값에 맞는 링과 수치를 표시한다
    Given 시험 전체 진척도 API가 <percent>%를 반환하면
    When "/" 화면에 접속하면
    Then 시험 전체 진척도 <percent>%가 접근 가능한 링으로 보인다
    And 시험 진척도 링은 시험 선택기 바로 뒤에 있다

    Examples:
      | percent |
      | 0       |
      | 37      |
      | 100     |

  Scenario Outline: 진척도 링을 모든 시험 컨텍스트 화면에서 표시한다
    Given 시험 전체 진척도 API가 37%를 반환하면
    When "<route>" 화면에 접속하면
    Then 시험 전체 진척도 37%가 접근 가능한 링으로 보인다

    Examples:
      | route        |
      | /            |
      | /study/new   |
      | /study       |
      | /study/result|
      | /review      |
      | /history     |

  Scenario: 통계 API 실패 시 진척도를 0으로 꾸며 표시하지 않는다
    Given 시험 전체 진척도 API가 실패하면
    When "/" 화면에 접속하면
    Then 진척도 미조회 표시가 보이고 0% 링은 보이지 않는다

  Scenario: 문항 분모가 0이면 진척도를 0%로 꾸며 표시하지 않는다
    Given 시험 전체 진척도 API의 문항 분모가 0이면
    When "/study/new" 화면에 접속하면
    Then 진척도 미조회 표시가 보이고 0% 링은 보이지 않는다
    And 학습 시작 버튼을 사용할 수 있다

  Scenario: 계정 경로에는 시험 진척도 링을 표시하지 않는다
    Given 시험 전체 진척도 API가 37%를 반환하면
    When "/account" 화면에 접속하면
    Then 시험 진척도 링은 보이지 않는다

  Scenario: 진척도 API가 늦어도 학습 범위 조작은 가능하다
    Given 시험 전체 진척도 API가 늦게 응답하면
    When "/" 화면에 접속하면
    Then 진척도 로딩 표시가 보인다
    When 학습 시작 버튼을 누르면
    Then 학습 범위 선택이 보인다

  Scenario Outline: 시험 selector와 진척도 링은 다섯 폭에서 겹치지 않는다
    Given 뷰포트 너비가 <width>px이면
    And 시험 전체 진척도 API가 37%를 반환하면
    When "/" 화면에 접속하면
    Then 시험 전체 진척도 37%가 접근 가능한 링으로 보인다
    And 시험 selector와 진척도 링은 겹치지 않는다
    And 가로 오버플로가 없다

    Examples:
      | width |
      | 320   |
      | 375   |
      | 768   |
      | 1024  |
      | 1280  |

  Scenario: 200% 확대에서도 시험 selector와 진척도 링이 겹치지 않는다
    Given 뷰포트 너비가 1280px이면
    And 시험 전체 진척도 API가 37%를 반환하면
    When "/" 화면에 접속하면
    And 텍스트를 200%로 확대하면
    Then 시험 전체 진척도 37%가 접근 가능한 링으로 보인다
    And 시험 selector와 진척도 링은 겹치지 않는다
    And 가로 오버플로가 없다

  Scenario: iPhone 크기 화면 캡처와 진척도 표시를 확인한다
    Given 시험 전체 진척도 API가 37%를 반환하면
    When "/" 화면에 접속하면
    And iPhone 뷰포트 캡처를 저장한다
    Then 시험 전체 진척도 37%가 접근 가능한 링으로 보인다
