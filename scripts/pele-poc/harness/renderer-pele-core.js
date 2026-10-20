// #168 PoC: Pele 1.7.0 도식별 등록 (pele/core + register(flowchart, sequence))
// 실제 컨텐츠가 flowchart(66) + sequenceDiagram(5) 뿐이라 필요한 두 타입만 등록한다.
import { register, render, PeleError } from 'pele/core';
import flowchart from 'pele/diagrams/flowchart';
import sequence from 'pele/diagrams/sequence';

register(flowchart, sequence);

async function init() {
  /* 등록은 모듈 평가 시 완료 */
}

async function renderOne(id, code, options = {}) {
  try {
    const out = render(code, { idPrefix: id, ...options });
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

export const renderer = { name: 'pele-core', init, renderOne };
export default renderer;
