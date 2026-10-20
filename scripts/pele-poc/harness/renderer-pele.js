// #168 PoC: Pele 1.7.0 전체 진입점 (모든 도식 타입 포함)
import { render, PeleError } from 'pele';

async function init() {
  /* Pele는 초기화 필요 없음 */
}

function describe(e) {
  const detail = {
    name: e?.name ?? null,
    code: e instanceof PeleError ? e.code : null,
    line: e instanceof PeleError ? e.line : null,
    column: e instanceof PeleError ? e.column : null,
    snippet: e instanceof PeleError ? e.snippet : null,
    type: e instanceof PeleError ? e.type : null,
    mermaidType: e instanceof PeleError ? e.mermaidType : null,
  };
  return { svg: null, error: String(e?.message ?? e), errorDetail: detail };
}

async function renderOne(id, code, options = {}) {
  try {
    const out = render(code, { idPrefix: id, ...options });
    return { svg: out.svg, error: null, errorDetail: null, type: out.type, width: out.width, height: out.height };
  } catch (e) {
    return describe(e);
  }
}

export const renderer = { name: 'pele', init, renderOne };
export default renderer;
