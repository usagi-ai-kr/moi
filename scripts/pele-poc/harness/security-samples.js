// #168 PoC: 합성 악성 샘플 (현행 실데이터에는 click/HTML/외부 링크가 하나도 없다 — 보고서 5장 P2)
// 페이로드 표기는 `window.__pocXss` 플래그를 올려 "실제 실행" 여부를 확인한다.
export const SECURITY_SAMPLES = [
  {
    id: 'script-tag',
    category: 'script',
    code: 'flowchart LR\n  A["<script>window.__pocXss=(window.__pocXss||0)+1</script>"] --> B[정상]',
  },
  {
    id: 'img-onerror',
    category: 'event-handler',
    code: "flowchart LR\n  A[\"<img src=x onerror='window.__pocXss=(window.__pocXss||0)+1'>\"] --> B[정상]",
  },
  {
    id: 'svg-onload',
    category: 'event-handler',
    code: "flowchart LR\n  A[\"<svg onload='window.__pocXss=(window.__pocXss||0)+1'></svg>\"] --> B[정상]",
  },
  {
    id: 'javascript-link',
    category: 'javascript-url',
    code: 'flowchart LR\n  A[클릭] --> B[정상]\n  click A "javascript:window.__pocXss=(window.__pocXss||0)+1"',
  },
  {
    id: 'external-link',
    category: 'external-url',
    code: 'flowchart LR\n  A[외부] --> B[정상]\n  click A "https://evil.example.com/steal"',
  },
  {
    id: 'external-image',
    category: 'external-url',
    code: 'flowchart LR\n  A["![i](https://evil.example.com/track.png)"] --> B[정상]',
  },
  {
    id: 'network-path-image',
    category: 'external-url',
    code: 'flowchart LR\n  A["<img src=\'//evil.example.com/x.png\'>"] --> B[정상]',
  },
  {
    id: 'foreign-object',
    category: 'foreignObject',
    code:
      "flowchart LR\n  A[\"<foreignObject width='120' height='40'><body xmlns='http://www.w3.org/1999/xhtml'><script>window.__pocXss=(window.__pocXss||0)+1</script></body></foreignObject>\"] --> B[정상]",
  },
  {
    id: 'style-directive',
    category: 'style',
    code:
      'flowchart LR\n  A[스타일] --> B[정상]\n  style A fill:#ff0000,stroke:#00ff00,stroke-width:8px\n  classDef danger fill:#ff0000\n  class A danger\n  linkStyle 0 stroke:#0000ff,stroke-dasharray:4 4',
  },
  {
    id: 'init-directive',
    category: 'init-directive',
    code:
      '%%{init: {"theme":"dark","flowchart":{"htmlLabels":true},"securityLevel":"loose"}}%%\nflowchart LR\n  A[초기화] --> B[정상]',
  },
  {
    id: 'init-loose-security',
    category: 'init-security-downgrade',
    code:
      "%%{init: {\"securityLevel\":\"loose\"}}%%\nflowchart LR\n  A[\"<img src=x onerror='window.__pocXss=(window.__pocXss||0)+1'>\"] --> B[정상]",
  },
  {
    id: 'init-antiscript-security',
    category: 'init-security-downgrade',
    code:
      "%%{init: {\"securityLevel\":\"antiscript\"}}%%\nflowchart LR\n  A[\"<img src=x onerror='window.__pocXss=(window.__pocXss||0)+1'>\"] --> B[정상]",
  },
  {
    id: 'data-uri-html',
    category: 'data-url',
    code:
      "flowchart LR\n  A[\"<img src='data:text/html,<script>window.__pocXss=(window.__pocXss||0)+1</script>'>\"] --> B[정상]",
  },
  {
    id: 'iframe',
    category: 'iframe',
    code: "flowchart LR\n  A[\"<iframe src='javascript:window.__pocXss=(window.__pocXss||0)+1'></iframe>\"] --> B[정상]",
  },
  {
    id: 'html-in-label',
    category: 'html-label',
    code: 'flowchart LR\n  A["<b>굵게</b> <i>기울임</i>"] --> B[정상]',
  },
];

export default SECURITY_SAMPLES;
