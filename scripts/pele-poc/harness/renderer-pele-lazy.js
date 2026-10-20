// #168 PoC: Pele 1.7.0 지연 로딩 진입점 (pele/lazy) — 첫 사용 시 도식 청크를 동적 import
import { renderAsync, PeleError } from 'pele/lazy';

async function init() {
  /* 지연 로딩이라 미리 할 일 없음 */
}

async function renderOne(id, code, options = {}) {
  try {
    const out = await renderAsync(code, { idPrefix: id, ...options });
    return { svg: out.svg, error: null, errorDetail: null, type: out.type, width: out.width, height: out.height };
  } catch (e) {
    return {
      svg: null,
      error: String(e?.message ?? e),
      errorDetail: {
        name: e?.name ?? null,
        code: e instanceof PeleError ? e.code : null,
        line: e instanceof PeleError ? e.line : null,
        column: e instanceof PeleError ? e.column : null,
        snippet: e instanceof PeleError ? e.snippet : null,
      },
    };
  }
}

export const renderer = { name: 'pele-lazy', init, renderOne };
export default renderer;
