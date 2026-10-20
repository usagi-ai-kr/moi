// #168 Pele PoC 하네스 진입점 (임시 PoC, 커밋 대상 아님)
// 모드: measure | shot | sec
//   measure → ?mode=measure&variant=mermaid|pele|pele-core|pele-lazy
//   shot    → ?mode=shot&variant=both&block=<index>&width=<px>
//   sec     → ?mode=sec&variant=both
import { runMeasure, runShot, runSecurity } from './measure-core.js';
import { SECURITY_SAMPLES } from './security-samples.js';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') ?? 'measure';
const variant = params.get('variant') ?? 'mermaid';
const blocks = window.__pocBlocks ?? [];
const blockIndex = Number(params.get('block') ?? '0');
const width = Number(params.get('width') ?? '0') || undefined;

// 폰트 로딩 완료 후 측정(라벨 폭 측정 determinism)
await document.fonts.ready;

const loaders = {
  mermaid: () => import('./renderer-mermaid.js'),
  pele: () => import('./renderer-pele.js'),
  'pele-core': () => import('./renderer-pele-core.js'),
  'pele-lazy': () => import('./renderer-pele-lazy.js'),
  both: () => import('./renderer-both.js'),
};

const loader = loaders[variant];
if (!loader) throw new Error(`알 수 없는 variant: ${variant}`);

try {
  if (mode === 'measure') {
    const result = await runMeasure(loader, blocks, { idPrefix: `poc-${variant}` });
    window.__pocResult = { ok: true, variant, ...result };
  } else if (mode === 'shot') {
    const mod = await loader();
    const result = await runShot(mod.renderer, blocks, blockIndex, { width });
    window.__pocResult = { ok: true, variant, ...result };
  } else if (mode === 'sec') {
    const mod = await loader();
    const results = await runSecurity(mod.renderer, SECURITY_SAMPLES);
    window.__pocResult = { ok: true, variant, results };
  } else {
    throw new Error(`알 수 없는 mode: ${mode}`);
  }
} catch (e) {
  window.__pocResult = { ok: false, variant, error: String(e?.message ?? e), stack: e?.stack ?? null };
}

window.__pocDone = true;
