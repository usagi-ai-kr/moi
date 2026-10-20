// Pele SVG 파서 기반 허용목록 검사 — 단순 문자열 regex 대체 금지 (#179).
// pele 1.7.0은 script/on*/foreignObject를 만들지 않지만 방어적으로 재검증한다.
// 위반(미허용 요소·위험 속성·외부 URL)이 있으면 null을 반환해 원문 폴백한다.
// - 요소·속성 비교는 소문자 기준으로 수행한다(viewBox/clipPath 혼합대소문자 대응).
// - paint의 url()은 내부 fragment(url(#id))만 허용하고 외부 url은 차단한다.
// - href는 scheme 일체를 차단해 외부 URL 0건을 보장한다(내부 #·상대경로만 허용).
// - 검증에 사용한 파서 결과물을 직렬화해 반환한다(원문-파서 차이 제거).
// - SVG 네임스페이스·DOCTYPE·처리명령을 검증한다.

const SVG_NS = 'http://www.w3.org/2000/svg';

const ALLOWED_ELEMENTS = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'title',
  'desc',
  'a',
  'defs',
  'marker',
  'use',
  'clippath',
]);

const ALLOWED_ATTRS = new Set([
  'id',
  'class',
  'd',
  'points',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'width',
  'height',
  'viewbox',
  'xmlns',
  'transform',
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'text-anchor',
  'font-size',
  'font-weight',
  'font-family',
  'letter-spacing',
  'word-spacing',
  'text-transform',
  'direction',
  'color',
  'opacity',
  'style',
  'href',
  'rel',
  'role',
  'xml:space',
]);

function isAllowedAttr(name: string): boolean {
  const n = name.toLowerCase();
  if (ALLOWED_ATTRS.has(n)) return true;
  if (n.startsWith('aria-')) return true;
  if (n.startsWith('data-')) return true;
  return false;
}

function hasDangerousEventAttr(el: Element): boolean {
  for (const a of Array.from(el.attributes)) {
    if (a.name.toLowerCase().startsWith('on')) return true;
  }
  return false;
}

function isSchemeChar(code: number): boolean {
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    (code >= 48 && code <= 57) ||
    code === 43 ||
    code === 45 ||
    code === 46
  );
}

function isLetterCode(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

/** scheme: 접두사(대소문자 무시) 존재 여부를 파서로 판정한다(regex 미사용). */
function hasSchemePrefix(value: string): boolean {
  const v = value.trim();
  if (v.length === 0) return false;
  if (!isLetterCode(v.charCodeAt(0))) return false;
  for (let i = 1; i < v.length; i += 1) {
    const c = v.charCodeAt(i);
    if (c === 58) return true;
    if (c === 47 || c === 63 || c === 35) return false;
    if (!isSchemeChar(c)) return false;
  }
  return false;
}

/** href에 외부 URL(scheme·네트워크 경로)이 있으면 차단한다. */
function hrefBlocked(raw: string): boolean {
  const v = raw.trim();
  if (v === '') return false;
  if (v[0] === '#') return false;
  if (v.startsWith('//')) return true;
  if (v[0] === '\\') return true;
  if (hasSchemePrefix(v)) return true;
  return false;
}

function isSpaceCode(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 13 || code === 12;
}

/** paint url() 중 내부 fragment(url(#id))가 아닌 것이 있으면 true. */
function hasBlockedPaintUrl(value: string): boolean {
  const low = value.toLowerCase();
  let from = 0;
  while (true) {
    const u = low.indexOf('url', from);
    if (u < 0) return false;
    let k = u + 3;
    while (k < low.length && isSpaceCode(low.charCodeAt(k))) k += 1;
    if (k >= low.length || low[k] !== '(') {
      from = k;
      continue;
    }
    const close = low.indexOf(')', k + 1);
    if (close < 0) return true;
    let inner = value.slice(k + 1, close).trim();
    if (
      inner.length >= 2 &&
      ((inner[0] === '"' && inner[inner.length - 1] === '"') ||
        (inner[0] === "'" && inner[inner.length - 1] === "'"))
    ) {
      inner = inner.slice(1, -1).trim();
    }
    if (!inner.startsWith('#')) return true;
    from = close + 1;
  }
}

function styleValueBlocked(style: string): boolean {
  if (hasBlockedPaintUrl(style)) return true;
  const s = style.toLowerCase();
  if (s.includes('expression')) return true;
  if (s.includes('javascript:')) return true;
  if (s.includes('vbscript:')) return true;
  if (s.includes('behavior')) return true;
  if (s.includes('-moz-binding')) return true;
  if (s.includes('@import')) return true;
  return false;
}

/** Pele SVG를 검사하고 안전하면 직렬화된 SVG를, 위반이면 null을 반환한다. */
export function sanitizePeleSvg(svg: string): string | null {
  if (!svg || !svg.includes('<svg')) return null;
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  } catch {
    return null;
  }
  if (doc.querySelector('parsererror')) return null;
  if (doc.doctype !== null) return null;
  for (const n of Array.from(doc.childNodes)) {
    if (n.nodeType === 7) return null;
  }
  const root = doc.documentElement;
  if (root.nodeName.toLowerCase() !== 'svg') return null;
  if (root.namespaceURI !== SVG_NS) return null;

  const els = [root, ...Array.from(root.querySelectorAll('*'))];
  for (const el of els) {
    if (el.namespaceURI !== SVG_NS) return null;
    const tag = el.tagName.toLowerCase();
    if (tag.includes(':')) return null;
    if (!ALLOWED_ELEMENTS.has(tag)) return null;
    if (hasDangerousEventAttr(el)) return null;
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (!isAllowedAttr(attr.name) && !name.startsWith('aria-') && !name.startsWith('data-')) {
        return null;
      }
      if (hasBlockedPaintUrl(attr.value)) return null;
      if (name === 'href' || name.endsWith(':href')) {
        if (hrefBlocked(attr.value)) return null;
      }
      if (name === 'style' && styleValueBlocked(attr.value)) return null;
    }
    const href = el.getAttribute('href');
    if (href !== null && hrefBlocked(href)) return null;
  }
  if (root.querySelectorAll('image').length > 0) return null;
  try {
    return new XMLSerializer().serializeToString(doc);
  } catch {
    return null;
  }
}
