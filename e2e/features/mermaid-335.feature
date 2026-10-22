Feature: iPhone 학습 결과 Mermaid 표시와 fallback (#335)

  Background:
    Given 학습 API 모의가 준비되면

  # AC: 이슈에 적힌 한글 participant·presigned URL sequence가 실제 결과 화면에서 렌더된다.
  Scenario Outline: 유효한 sequence 도식은 모바일 결과에서 보인다
    Given 뷰포트 너비가 <width>px이면
    And 이슈 #335 한글 sequence 해설이 준비되면
    When 홈 페이지에 접속하면
    And 학습 시작 버튼을 누르면
    And 학습 시작 버튼을 누르면
    And 첫 번째 보기를 선택하면
    And 제출하기 버튼을 누르면
    And 제출을 확인하면
    Then 학습 결과가 보인다
    And 이슈 #335 sequence 다이어그램이 SVG로 렌더된다
    And 이슈 #335 결과 조작과 근거 링크가 보인다
    And 가로 오버플로가 없다

    Examples:
      | width |
      | 320   |
      | 375   |
      | 768   |
      | 1280  |

  Scenario: Pele 전수 렌더가 브라우저·화면 폭에서 성공한다
    Given 해설 전체 Mermaid 콘텐츠가 준비되면
    When Chromium 또는 WebKit에서 다섯 화면 폭으로 전수 렌더하면
    Then 모든 도식이 sanitizer 통과 SVG로 표시되고 페이지 넘침이 없다

  # AC: 렌더 실패 fallback은 카드 안에서 읽히고 결과 조작/근거 링크를 남긴다.
  Scenario Outline: 렌더 실패 원문은 작은 화면에서 읽을 수 있다
    Given 뷰포트 너비가 <width>px이면
    And 이슈 #335 렌더 실패 원문이 준비되면
    When 홈 페이지에 접속하면
    And 학습 시작 버튼을 누르면
    And 학습 시작 버튼을 누르면
    And 첫 번째 보기를 선택하면
    And 제출하기 버튼을 누르면
    And 제출을 확인하면
    Then 학습 결과가 보인다
    And 렌더 실패 원문은 카드 안에서 줄바꿈되고 주변 조작이 보인다

    Examples:
      | width |
      | 320   |
      | 375   |
