// Pele lazy 렌더 래퍼 — `pele/lazy`의 renderAsync만 사용한다 (#179).
// 전체 `pele` 주 진입·다중 registry 혼용 금지. 타입별 청크는 pele/lazy가 자동 로드한다.
import { renderAsync } from 'pele/lazy';
import { diagram as diagramTokens, typography } from '../tokens';
import { sanitizePeleSvg } from './diagram-sanitize';

export const PELE_RENDER_TIMEOUT_MS = diagramTokens.renderTimeoutMs;
export const PELE_DIRECTION_BREAKPOINT = diagramTokens.directionBreakpoint;

export interface PeleRenderRequest {
  code: string;
  idPrefix: string;
  maxWidth?: number;
}

export interface PeleRenderResult {
  svg: string;
  diagramType: string;
}

function timeoutError(): Error {
  const err = new Error(`diagram render timeout after ${PELE_RENDER_TIMEOUT_MS}ms`);
  (err as { code?: string }).code = 'timeout';
  return err;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? 'unknown error');
}

/** container 폭·폰트에 맞춘 Pele 렌더. 위반 SVG는 null로 보고해 원문 폴백한다. */
export async function renderPeleDiagram(req: PeleRenderRequest): Promise<PeleRenderResult | null> {
  const code = req.code.trim();
  if (!code) return null;
  const maxWidth = typeof req.maxWidth === 'number' && req.maxWidth > 0 ? req.maxWidth : undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const renderPromise = renderAsync(code, {
      idPrefix: req.idPrefix,
      maxWidth,
      fontFamily: typography.fontUi,
      directionBreakpoint: PELE_DIRECTION_BREAKPOINT,
      links: false,
      images: false,
    });
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(timeoutError()), PELE_RENDER_TIMEOUT_MS);
    });
    const out = await Promise.race([renderPromise, timeoutPromise]);
    const safe = sanitizePeleSvg(out.svg);
    if (!safe) return null;
    return { svg: safe, diagramType: out.type };
  } catch (err) {
    void errorMessage(err);
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
