// #168 PoC: 스크린샷·보안 검사 전용 (Mermaid + Pele 동시 로드)
import { renderer as mermaidRenderer } from './renderer-mermaid.js';
import { renderer as peleRenderer } from './renderer-pele.js';

async function init() {
  await mermaidRenderer.init?.();
  await peleRenderer.init?.();
}

export const renderer = {
  name: 'both',
  init,
  renderMermaid: (id, code) => mermaidRenderer.renderOne(id, code),
  renderPele: (id, code, options) => peleRenderer.renderOne(id, code, options),
  async renderOne(id, code) {
    const m = await mermaidRenderer.renderOne(`${id}-m`, code);
    const p = await peleRenderer.renderOne(`${id}-p`, code);
    return { svg: p.svg ?? m.svg, error: p.error ?? m.error, errorDetail: null, mermaid: m, pele: p };
  },
};

export default renderer;
