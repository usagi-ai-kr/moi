// #168 Pele PoC 하네스 공통 로직 (임시 PoC, 커밋 대상 아님)
// 1단계(#168-mermaid-inventory) 기준선 프로토콜을 그대로 재사용한다:
//   앱 부팅(하네스 entry) → 렌더러 entry import → 첫 flowchart → 첫 sequence → warm 재렌더
// 신규 리소스는 /assets/*.js|.css 만 청크로 센다(폰트 파일 제외).

export const sleepFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

export function listResources() {
  return performance
    .getEntriesByType('resource')
    .filter((e) => /\/assets\/[^/]+\.(js|css)$/.test(e.name))
    .map((e) => ({
      file: e.name.split('/').pop(),
      transfer: e.transferSize,
      decoded: e.decodedBodySize,
      duration: e.duration,
    }));
}

function makeCollector() {
  const seen = new Set();
  return () => {
    const added = [];
    for (const r of listResources()) {
      if (!seen.has(r.file)) {
        seen.add(r.file);
        added.push(r);
      }
    }
    return added;
  };
}

const round = (n) => Math.round(n * 100) / 100;
const normLabel = (s) =>
  (s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, '');

const normKey = (s) => normLabel(s).replace(/\s+/g, '');

/** SVG에서 라벨·도형 정보를 뽑는다(라이브러리 중립 비교용). */
export function extractSvg(svg) {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const isPele = doc.querySelector('svg.pele') !== null;
  const textOf = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const normLabel = (s) => (s ?? '').replace(/\s+/g, ' ').trim().replace(/^["'“”]+|["'“”]+$/g, '');
  const uniq = (arr) => [...new Set(arr.filter((v) => v.length > 0))];

  // Mermaid: 노드 라벨 .nodeLabel / 엣지 라벨 .edgeLabel / 클러스터 제목 .cluster-label
  //   (Mermaid는 클러스터 제목에도 .nodeLabel을 함께 다는 부분이 있어 closest()로 분리)
  // Pele: .pele-label / .pele-edge-label / .pele-cluster-label
  const nodeEls = isPele
    ? [...doc.querySelectorAll('.pele-label')]
    : [...doc.querySelectorAll('.nodeLabel')].filter((e) => !e.closest('.cluster-label, .clusterLabel'));
  const edgeEls = isPele
    ? [...doc.querySelectorAll('.pele-edge-label')]
    : [...doc.querySelectorAll('.edgeLabel')].filter((e) => !e.closest('.cluster-label, .clusterLabel'));
  const clusterEls = isPele
    ? [...doc.querySelectorAll('.pele-cluster-label')]
    : [...doc.querySelectorAll('.cluster-label, .clusterLabel')];

  const nodeRaw = nodeEls.map((e) => normLabel(textOf(e)));
  const edgeRaw = edgeEls.map((e) => normLabel(textOf(e)));
  const clusterRaw = clusterEls.map((e) => normLabel(textOf(e)));
  const allText = uniq(
    [...doc.querySelectorAll('text, tspan, foreignObject p, foreignObject span, foreignObject div')]
      .filter((e) => e.children.length === 0 || e.tagName.toLowerCase() === 'text')
      .map((e) => normLabel(textOf(e))),
  );
  // 여러 줄로 감긴 라벨(tspan 2개 이상) 개수
  const wrappedLabels = [...doc.querySelectorAll('text')].filter(
    (t) => t.querySelectorAll(':scope > tspan').length > 1,
  ).length;
  const vb = (doc.documentElement.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);

  return {
    lib: isPele ? 'pele' : 'mermaid',
    nodeLabels: uniq(nodeRaw),
    edgeLabels: uniq(edgeRaw),
    clusterLabels: uniq(clusterRaw),
    nodeLabelCount: nodeRaw.length,
    edgeLabelCount: edgeRaw.length,
    clusterLabelCount: clusterRaw.length,
    allText,
    nodeCount: isPele
      ? doc.querySelectorAll('.pele-node').length
      : doc.querySelectorAll('.node').length,
    edgeCount: isPele
      ? doc.querySelectorAll('.pele-edge').length
      : doc.querySelectorAll('.edgePath, .flowchart-link').length,
    foreignObjectCount: doc.querySelectorAll('foreignObject').length,
    scriptCount: doc.querySelectorAll('script').length,
    role: doc.documentElement.getAttribute('role') ?? '',
    ariaRoleDescription: doc.documentElement.getAttribute('aria-roledescription') ?? '',
    hasTitle: doc.querySelectorAll('title').length > 0,
    hasDesc: doc.querySelectorAll('desc').length > 0,
    wrappedLabelCount: wrappedLabels,
    viewBoxWidth: Number.isFinite(vb[2]) ? vb[2] : null,
    viewBoxHeight: Number.isFinite(vb[3]) ? vb[3] : null,
  };
}

const keyOf = (b) => `${b.questionId}:${b.blockIndex}`;

/** measurement 모드: 렌더러 entry import → cold 71회 → warm 71회 */
export async function runMeasure(loadRenderer, blocks, opts = {}) {
  const collect = makeCollector();
  collect(); // 하네스 entry 자산 = 기준선(델타에서 제외)

  const t0 = performance.now();
  const mod = await loadRenderer();
  const entryMs = performance.now() - t0;
  const entryChunks = collect();

  const renderer = mod.renderer;
  await renderer.init?.();

  const results = [];
  const labels = {};
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const before = performance.now();
    const out = await renderer.renderOne(`${opts.idPrefix ?? 'poc'}-${i}`, b.code);
    const ms = performance.now() - before;
    await sleepFrame();
    const chunks = collect();
    results.push({
      questionId: b.questionId,
      blockIndex: b.blockIndex,
      diagramType: b.diagramType,
      coldMs: round(ms),
      ok: Boolean(out.svg),
      svgBytes: out.svg ? out.svg.length : 0,
      error: out.error ?? null,
      errorDetail: out.errorDetail ?? null,
      chunks: chunks.map((c) => c.file),
    });
    if (out.svg) labels[keyOf(b)] = extractSvg(out.svg);
  }

  const warm = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const before = performance.now();
    const out = await renderer.renderOne(`${opts.idPrefix ?? 'poc'}-warm-${i}`, b.code);
    warm.push({
      questionId: b.questionId,
      blockIndex: b.blockIndex,
      ms: round(performance.now() - before),
      ok: Boolean(out.svg),
      error: out.error ?? null,
    });
  }

  const firstByType = {};
  for (const r of results) {
    if (!firstByType[r.diagramType]) {
      firstByType[r.diagramType] = { questionId: r.questionId, coldMs: r.coldMs, chunks: r.chunks };
    }
  }

  return { entryMs: round(entryMs), entryChunks, results, warm, firstByType, labels };
}

/** shot 모드: 한 블록을 두 라이브러리로 렌더해 나란히 배치 */
export async function runShot(renderer, blocks, index, opts = {}) {
  const b = blocks[index];
  if (!b) throw new Error(`블록 인덱스 ${index} 없음`);
  const stage = document.getElementById('stage');
  stage.innerHTML = '';
  const viewportWidth = opts.width ?? window.innerWidth;
  stage.style.width = `${viewportWidth}px`;
  stage.style.boxSizing = 'border-box';
  // stage padding 16*2 + box padding 8*2 + border 1*2 = 50
  const contentWidth = Math.max(240, viewportWidth - 50);

  const box = (id, title) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="stage-label">${title}</div><div class="stage-box" id="${id}"></div>`;
    stage.appendChild(wrap);
    return document.getElementById(id);
  };

  const mBox = box('shot-mermaid', 'mermaid');
  const pBox = box('shot-pele', 'pele');
  const mOut = await renderer.renderMermaid(`shot-m-${index}`, b.code);
  const pOut = await renderer.renderPele(`shot-p-${index}`, b.code, { maxWidth: contentWidth });

  if (mOut.svg) mBox.innerHTML = mOut.svg;
  else mBox.innerHTML = `<div class="stage-error">${escapeHtml(mOut.error ?? '오류')}</div><div class="stage-source">${escapeHtml(b.code)}</div>`;
  if (pOut.svg) pBox.innerHTML = pOut.svg;
  else pBox.innerHTML = `<div class="stage-error">${escapeHtml(pOut.error ?? '오류')}</div><div class="stage-source">${escapeHtml(b.code)}</div>`;

  await sleepFrame();
  await sleepFrame();
  return {
    questionId: b.questionId,
    diagramType: b.diagramType,
    mermaid: { ok: Boolean(mOut.svg), error: mOut.error ?? null, bytes: mOut.svg ? mOut.svg.length : 0 },
    pele: { ok: Boolean(pOut.svg), error: pOut.error ?? null, bytes: pOut.svg ? pOut.svg.length : 0 },
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** security 모드: 악성 샘플을 두 라이브러리로 렌더해 출력 SVG를 정적·동적으로 검사 */
export async function runSecurity(renderer, samples) {
  const results = [];
  for (const s of samples) {
    const mOut = await renderer.renderMermaid(`sec-m-${s.id}`, s.code);
    const pOut = await renderer.renderPele(`sec-p-${s.id}`, s.code);
    results.push({
      id: s.id,
      category: s.category,
      code: s.code,
      mermaid: await inspect(mOut.svg, mOut.error),
      pele: await inspect(pOut.svg, pOut.error),
    });
  }
  return results;
}

const DANGEROUS = [
  ['script', /<\s*script/i],
  ['eventHandler', /\son[a-z]+\s*=/i],
  ['javascriptUrl', /javascript\s*:/i],
  ['dataUrlHtml', /data\s*:\s*text\/html/i],
  ['foreignObject', /<foreignObject/i],
  ['iframe', /<\s*iframe/i],
  ['objectEmbed', /<\s*(object|embed)\b/i],
  ['vbscript', /vbscript\s*:/i],
  ['cssUrlExternal', /url\(\s*['"]?(?!#)[a-z]+:/i],
];

const NS_URL = /^https?:\/\/www\.w3\.org\//;

export async function inspect(svg, error) {
  if (!svg) {
    return {
      rendered: false,
      error: error ?? null,
      attrTokens: [],
      textTokens: [],
      urls: [],
      elements: { script: 0, foreignObject: 0, img: 0, iframe: 0, a: 0 },
      live: { scripts: 0, handlers: 0, xssFired: false },
    };
  }
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const attrList = [...doc.querySelectorAll('*')].flatMap((el) => [...el.attributes].map((a) => `${a.name}=${a.value}`));
  const attrBlob = attrList.join('\n');
  const textBlob = doc.querySelector('svg')?.textContent ?? '';
  const attrTokens = DANGEROUS.filter(([, re]) => re.test(attrBlob)).map(([n]) => n);
  const textTokens = DANGEROUS.filter(([, re]) => re.test(textBlob)).map(([n]) => n);

  // 출력에 실제로 포함된 URL(href/src) — 네임스페이스 URL 제외
  const urls = [...new Set([...svg.matchAll(/(?:href|xlink:href|src)\s*=\s*"([^"]*)"/gi)].map((m) => m[1]))].filter(
    (u) => u && !u.startsWith('#') && !NS_URL.test(u),
  );
  const elements = {
    script: doc.querySelectorAll('script').length,
    foreignObject: doc.querySelectorAll('foreignObject').length,
    img: doc.querySelectorAll('image, img').length,
    iframe: doc.querySelectorAll('iframe').length,
    a: doc.querySelectorAll('a').length,
  };

  // 살아있는 DOM 검사: 삽입 후 script 요소 / on* 속성 / 실제 실행 플래그
  window.__pocXss = 0;
  const host = document.createElement('div');
  host.id = 'sec-probe';
  host.style.cssText = 'position:absolute;left:-9999px;top:0;width:800px;height:600px;';
  document.body.appendChild(host);
  host.innerHTML = svg;
  await sleepFrame();
  await new Promise((r) => setTimeout(r, 60));
  const scripts = host.querySelectorAll('script').length;
  const handlers = [...host.querySelectorAll('*')].filter((el) =>
    [...el.attributes].some((a) => a.name.toLowerCase().startsWith('on')),
  ).length;
  const xssFired = (window.__pocXss ?? 0) > 0;
  host.remove();

  return {
    rendered: true,
    error: null,
    attrTokens,
    textTokens,
    urls,
    elements,
    excerpt: svg.slice(0, 1800),
    fullSvg: svg,
    live: { scripts, handlers, xssFired },
    bytes: svg.length,
  };
}
