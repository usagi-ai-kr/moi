// #168 PoC: Mermaid 12.2.0 (현행 app과 동일한 initialize 옵션)
import mermaid from 'mermaid';

let ready = false;

async function init() {
  if (ready) return;
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' });
  ready = true;
}

async function renderOne(id, code) {
  await init();
  try {
    const out = await mermaid.render(id, code);
    const svg = typeof out === 'string' ? out : out.svg;
    return { svg, error: null, errorDetail: null };
  } catch (e) {
    return {
      svg: null,
      error: String(e?.message ?? e),
      errorDetail: { name: e?.name ?? null, str: String(e) },
    };
  }
}

export const renderer = { name: 'mermaid', init, renderOne };
export default renderer;
