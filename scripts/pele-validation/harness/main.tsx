// #179 독립 검증 하네스 엔트리 — 제품의 실제 컴포넌트(Explanation/MermaidDiagram)를 그대로 렌더한다.
// 렌더 경로: src/ui/study/Explanation → MermaidDiagram → renderPeleDiagram → sanitizePeleSvg.
// 하네스 고유 데이터(도식·악성 샘플)는 실행 시 window.__PELE_DATASET__로 주입한다(번들에 포함되지 않음).
import { StrictMode, useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTokens } from '@/ui/tokens';
import { Explanation } from '@/ui/study/Explanation';
import { sanitizePeleSvg } from '@/ui/study/diagram-sanitize';
import '@/ui/styles.css';
import '@/ui/widgets.css';
import '@/ui/shell.css';
import '@/ui/authenticated.css';
import '@fontsource-variable/inter/index.css';

export interface HarnessDiagram {
  blockIndex: number;
  diagramType: string;
  code: string;
}

export interface HarnessQuestion {
  sourceFile: string;
  questionId: string;
  explanation: string;
  diagrams: HarnessDiagram[];
}

export interface HarnessDataset {
  questions: HarnessQuestion[];
  attacks: Array<{ id: string; code: string }>;
  sanitizeCases: Array<{ id: string; expect: 'allow' | 'block'; svg: string; note?: string }>;
}

declare global {
  interface Window {
    __PELE_DATASET__?: HarnessDataset;
    __marks?: number[];
    __t0?: number;
    __firstSvgMs?: number | null;
    __jsAtFirstSvg?: { encodedBytes: number; decodedBytes: number; scripts: number } | null;
    __sanitize?: (svg: string) => string | null;
    __pwned?: number;
    __cspViolations?: Array<{ directive: string; blockedURI: string; sample: string }>;
  }
}

const params = new URLSearchParams(window.location.search);
const mode = params.get('mode') ?? 'diagrams';

const t0 = performance.now();
window.__marks = [];
window.__t0 = t0;
window.__firstSvgMs = null;
window.__jsAtFirstSvg = null;
window.__pwned = 0;
window.__cspViolations = [];
window.__sanitize = sanitizePeleSvg;

document.addEventListener('securitypolicyviolation', (e) => {
  window.__cspViolations?.push({
    directive: e.effectiveDirective ?? e.violatedDirective ?? '',
    blockedURI: e.blockedURI ?? '',
    sample: e.sample ?? '',
  });
});

/** 첫 SVG가 DOM에 추가된 순간을 기록한다(누적 JS 바이트도 함께). */
function observeFirstSvg(): void {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        if (!(node instanceof Element)) continue;
        const svg =
          node.tagName.toLowerCase() === 'svg' ? node : node.querySelector?.('svg');
        if (!svg) continue;
        if (!svg.closest('[data-testid="mermaid-diagram"]')) continue;
        const at = performance.now();
        window.__marks?.push(at);
        if (window.__marks?.length === 1) {
          window.__firstSvgMs = at;
          const scripts = performance
            .getEntriesByType('resource')
            .filter((e) => e.initiatorType === 'script');
          window.__jsAtFirstSvg = {
            encodedBytes: scripts.reduce((a, e) => a + (e.encodedBodySize || 0), 0),
            decodedBytes: scripts.reduce((a, e) => a + (e.decodedBodySize || 0), 0),
            scripts: scripts.length,
          };
        }
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function AppShellLike({ children }: { children: ReactNode }) {
  return (
    <main className="moi-main moi-shell-main">
      <div className="moi-container moi-main-inner moi-enter">{children}</div>
    </main>
  );
}

/** 제품 ResultView와 동일한 구조(moi-note 안의 Explanation)로 렌더한다. */
function QuestionBlock({ question }: { question: HarnessQuestion }) {
  return (
    <div className="moi-study-peritem" data-question-id={question.questionId}>
      <div className="moi-note">
        <span>해설: </span>
        <Explanation markdown={question.explanation} />
      </div>
    </div>
  );
}

function DiagramsMode({ dataset }: { dataset: HarnessDataset }) {
  return (
    <AppShellLike>
      {dataset.questions.map((q) => (
        <QuestionBlock key={q.questionId} question={q} />
      ))}
    </AppShellLike>
  );
}

function AttackMode({ dataset }: { dataset: HarnessDataset }) {
  return (
    <AppShellLike>
      {dataset.attacks.map((sample) => (
        <div className="moi-study-peritem" key={sample.id} data-attack-id={sample.id}>
          <div className="moi-note">
            <span>해설: </span>
            <Explanation markdown={'```mermaid\n' + sample.code + '\n```'} />
          </div>
        </div>
      ))}
    </AppShellLike>
  );
}

/** perf 모드 — 도식 1개만 렌더하고 remount로 cold/warm을 분리 측정한다. */
function PerfMode({ dataset }: { dataset: HarnessDataset }) {
  const index = Number(params.get('index') ?? '0');
  const question = dataset.questions[index];
  const [nonce, setNonce] = useState(0);
  return (
    <AppShellLike>
      <button id="remount" type="button" onClick={() => setNonce((n) => n + 1)}>
        다시 렌더
      </button>
      {question ? (
        <div className="moi-study-peritem" key={`${question.questionId}-${nonce}`}>
          <div className="moi-note">
            <span>해설: </span>
            <Explanation markdown={question.explanation} />
          </div>
        </div>
      ) : null}
    </AppShellLike>
  );
}

function App() {
  const dataset = window.__PELE_DATASET__;
  if (!dataset) {
    return <p id="harness-error">window.__PELE_DATASET__가 주입되지 않았습니다.</p>;
  }
  if (mode === 'attack') return <AttackMode dataset={dataset} />;
  if (mode === 'perf') return <PerfMode dataset={dataset} />;
  return <DiagramsMode dataset={dataset} />;
}

applyTokens();
observeFirstSvg();

const root = document.getElementById('root');
if (!root) throw new Error('#root 엘리먼트가 없습니다');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
