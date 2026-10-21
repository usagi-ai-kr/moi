Feature: 시험 연결 context·selector — 라벨·선택·URL 계약 (#239)

  Background:
    Given 시험 화면 API 모의가 준비되면

  # ── AC 1: 페이지별 시험 배지 중복 없음 (#259) ─────────────────────────
  Scenario Outline: 페이지별 시험 배지가 보이지 않는다
    When "<route>" 화면에 접속하면
    Then 페이지별 시험 배지가 보이지 않는다

    Examples:
      | route      |
      | /          |
      | /study/new |
      | /history   |
      | /review    |
      | /account   |

  Scenario: 데이터 요청도 선택 시험을 사용한다
    When "/history" 화면에 접속하면
    And 통계 요청이 선택 시험 코드를 보낸다

  # ── AC 2: 실제 selector ───────────────────────────────────────────
  Scenario: 데스크톱 헤더에 실제 시험 selector가 있다
    When "/" 화면에 접속하면
    Then 시험 selector는 비활성이 아니다
    And 시험 selector의 옵션은 1개다
    And 시험 selector의 접근 이름은 "시험"이다

  Scenario: 모바일 Drawer에 시험 selector가 있다
    Given 뷰포트 너비가 375px이면
    When "/" 화면에 접속하면
    And 햄버거 메뉴를 누른다
    Then 시험 selector는 비활성이 아니다
    And 시험 selector의 옵션은 1개다

  Scenario: 시험 selector는 키보드로 접근할 수 있다
    When "/" 화면에 접속하면
    Then 시험 selector에 포커스를 둘 수 있다

  # ── AC 3: URL 계약 ─────────────────────────────────────────────────
  Scenario: 올바른 시험 코드는 그대로 유지된다
    When 시험 코드가 포함된 주소로 이동한다
    Then 주소창의 시험 값은 "saa-c03" 이다

  Scenario: 잘못된 시험 값은 기본값으로 교체되고 내부 ID가 노출되지 않는다
    When 잘못된 시험 주소로 이동한다
    Then 주소창의 시험 값은 "saa-c03" 이다
    And 화면에 내부 시험 식별자가 보이지 않는다

  Scenario: 시험 값이 없으면 기본 시험으로 동작하고 주소가 오염되지 않는다
    When 시험 값 없는 주소로 이동한다
    Then 주소창에 시험 값이 없다

  # ── AC 4: 반응형 ───────────────────────────────────────────────────
  Scenario Outline: 시험 selector·라벨이 오버플로 없이 보인다
    Given 뷰포트 너비가 <width>px이면
    When "<route>" 화면에 접속하면
    Then 가로 오버플로가 없다

    Examples:
      | route      | width |
      | /          | 320   |
      | /          | 375   |
      | /          | 768   |
      | /          | 1024  |
      | /          | 1280  |
      | /study/new | 320   |
      | /study/new | 768   |
      | /history   | 320   |
      | /history   | 1024  |
      | /review    | 375   |
      | /review    | 1280  |
      | /account   | 320   |

  Scenario: 200% 확대에서도 시험 selector·라벨이 오버플로 없다
    When 200% 확대를 흉내내면
    And "/" 화면에 접속하면
    Then 가로 오버플로가 없다
