Feature: #215 모바일 햄버거·우측 Drawer 및 반응형 검증

  Background:
    Given 모바일 내비게이션 API 모의가 준비되면

  # ── 모바일 진입·전환 정책 ───────────────────────────────────────────
  Scenario: 모바일 진입 — 브랜드와 햄버거가 보이고 가로 nav는 숨겨진다
    When 뷰포트 너비가 320px이면
    And "/" 화면에 접속하면
    Then 브랜드와 햄버거 버튼이 보인다
    And 가로 메뉴 링크는 화면에서 숨겨진다
    And 메뉴 링크가 키보드 탐색에 중복 노출되지 않는다
    And 가로 오버플로가 없다

  Scenario: 태블릿·데스크톱 — 가로 nav가 보이고 햄버거는 숨겨진다
    When 뷰포트 너비가 768px이면
    And "/" 화면에 접속하면
    Then 가로 메뉴 링크가 보인다
    And 햄버거 버튼은 보이지 않는다
    And 메뉴 링크가 키보드 탐색에 중복 노출되지 않는다

  Scenario: 모바일 회전(landscape) — 헤더가 화면을 압도하지 않고 주요 버튼이 보인다
    When 뷰포트 너비가 320px이면
    And "/" 화면에 접속하면
    And 뷰포트를 568x320으로 바꾼다
    Then 가로 오버플로가 없다
    And 헤더가 화면 높이의 25% 이내이다
    And 주요 컨트롤이 화면 안에 있고 가려지지 않는다

  # ── Drawer 열기·닫기·접근성 ─────────────────────────────────────────
  Scenario: Drawer 열기 — 네 메뉴가 보이고 현재 위치를 읽을 수 있다
    When 뷰포트 너비가 375px이면
    And "/" 화면에 접속하면
    And 햄버거 메뉴를 누른다
    Then Drawer에 네 메뉴가 보인다
    And Drawer에 로그아웃 액션이 보인다
    And 현재 위치 메뉴가 표시된다
    And Drawer 항목은 44px 이상이다
    And 가로 오버플로가 없다

  Scenario: Escape로 닫히고 포커스가 트리거로 돌아온다
    When 뷰포트 너비가 375px이면
    And "/" 화면에 접속하면
    And 햄버거 메뉴를 누른다
    And Escape 키를 누른다
    Then Drawer가 닫힌다
    And 포커스가 햄버거 버튼으로 돌아온다
    And 배경 스크롤이 풀려 있다

  Scenario: 닫기 버튼으로 닫히고 포커스가 트리거로 돌아온다
    When 뷰포트 너비가 375px이면
    And "/" 화면에 접속하면
    And 햄버거 메뉴를 누른다
    And Drawer 닫기 버튼을 누른다
    Then Drawer가 닫힌다
    And 포커스가 햄버거 버튼으로 돌아온다

  Scenario: 백드롭 클릭으로 닫힌다
    When 뷰포트 너비가 375px이면
    And "/" 화면에 접속하면
    And 햄버거 메뉴를 누른다
    And Drawer 바깥을 클릭한다
    Then Drawer가 닫힌다
    And 배경 스크롤이 풀려 있다

  Scenario: 메뉴를 선택하면 닫히고 경로가 이동한다
    When 뷰포트 너비가 375px이면
    And "/" 화면에 접속하면
    And 햄버거 메뉴를 누른다
    And Drawer에서 "계정" 메뉴를 선택한다
    Then Drawer가 닫힌다
    And 주소창이 "/account"로 바뀐다

  Scenario: Drawer를 연 상태에서 배경은 스크롤되지 않는다
    When 뷰포트 너비가 375px이면
    And "/" 화면에 접속하면
    And 햄버거 메뉴를 누른다
    Then 배경 스크롤이 잠겨 있다

  # ── viewport 전환 중 상태 꼬임 ───────────────────────────────────────
  Scenario: Drawer를 연 채 데스크톱으로 넓히면 Drawer가 닫히고 가로 nav만 남는다
    When 뷰포트 너비가 375px이면
    And "/" 화면에 접속하면
    And 햄버거 메뉴를 누른다
    And 뷰포트 너비가 1024px이면
    Then Drawer가 닫힌다
    And 가로 메뉴 링크가 보인다
    And 햄버거 버튼은 보이지 않는다
    And 메뉴 링크가 키보드 탐색에 중복 노출되지 않는다

  # ── 확대·긴 문구 ────────────────────────────────────────────────────
  Scenario: 200% 확대를 흉내낸 640px 뷰포트에서도 헤더·햄버거가 정상이다
    When 200% 확대를 흉내내면
    And "/" 화면에 접속하면
    Then 브랜드와 햄버거 버튼이 보인다
    And 헤더가 화면 높이의 40% 이내이다
    And 가로 오버플로가 없다
    And 주요 컨트롤이 화면 안에 있고 가려지지 않는다

  Scenario: Drawer 텍스트를 200%로 키워도 잘림 없이 접근 가능하다
    When 뷰포트 너비가 320px이면
    And "/" 화면에 접속하면
    And 햄버거 메뉴를 누른다
    And Drawer 텍스트를 200%로 확대한다
    Then 가로 오버플로가 없다
    And Drawer 항목은 44px 이상이다
    And Drawer 안의 항목이 화면 안에 있고 가려지지 않는다

  # ── 5화면 × 5폭 레이아웃·가림·클릭 가능성 ─────────────────────────
  Scenario Outline: 주요 화면의 요소가 화면 안에 있고 가려지지 않는다
    When 뷰포트 너비가 <width>px이면
    And "<route>" 화면에 접속하면
    Then 가로 오버플로가 없다
    And 주요 컨트롤이 화면 안에 있고 가려지지 않는다

    Examples:
      | route       | width |
      | /           | 320   |
      | /           | 375   |
      | /           | 768   |
      | /           | 1024  |
      | /           | 1280  |
      | /study/new  | 320   |
      | /study/new  | 375   |
      | /study/new  | 768   |
      | /study/new  | 1024  |
      | /study/new  | 1280  |
      | /history    | 320   |
      | /history    | 375   |
      | /history    | 768   |
      | /history    | 1024  |
      | /history    | 1280  |
      | /review     | 320   |
      | /review     | 375   |
      | /review     | 768   |
      | /review     | 1024  |
      | /review     | 1280  |
      | /account    | 320   |
      | /account    | 375   |
      | /account    | 768   |
      | /account    | 1024  |
      | /account    | 1280  |
