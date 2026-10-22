import { useEffect, useId, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { copy } from '../copy';
import { renderPeleDiagram } from './diagram-pele';
import './study-feedback.css';

export function MermaidDiagram({ code }: { code: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const idPrefix = `pele-${uid}`;
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number | undefined>(undefined);
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = (): void => {
      const w = el.clientWidth;
      if (typeof w === 'number' && w > 0) {
        setWidth((prev) => (prev === w ? prev : w));
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let live = true;
    setSvg(null);
    setFailed(false);
    const currentWidth = boxRef.current?.clientWidth;
    const maxWidth = typeof currentWidth === 'number' && currentWidth > 0 ? currentWidth : width;
    void renderPeleDiagram({ code, idPrefix, maxWidth }).then((out) => {
      if (!live) return;
      if (out) setSvg(out.svg);
      else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [code, idPrefix, width]);

  if (failed) {
    return (
      <div ref={boxRef} data-testid="mermaid-diagram" className="moi-mermaid">
        <p role="alert">{copy.study.diagramError}</p>
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    );
  }
  if (svg === null) {
    return (
      <div ref={boxRef} data-testid="mermaid-diagram" className="moi-mermaid">
        <span role="status">{copy.study.diagramLoading}</span>
      </div>
    );
  }
  return (
    <div
      ref={boxRef}
      data-testid="mermaid-diagram"
      role="img"
      aria-label={copy.study.diagramLabel}
      className="moi-mermaid"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function Explanation({ markdown }: { markdown: string }) {
  return (
    <div className="moi-explanation">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: (props) => {
            const { className, children } = props;
            const cls = typeof className === 'string' ? className : '';
            if (/(^|\s)language-mermaid(\s|$)/.test(cls)) {
              return <MermaidDiagram code={String(children ?? '').replace(/\n$/, '')} />;
            }
            return <code className={className}>{children}</code>;
          },
          a: (props) => {
            const { href, children } = props;
            const url = typeof href === 'string' ? href : '';
            if (/^https?:\/\//.test(url)) {
              return (
                <a href={url} target="_blank" rel="noreferrer">
                  {children}
                </a>
              );
            }
            return <a href={url}>{children}</a>;
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
