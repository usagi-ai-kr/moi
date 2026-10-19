import { useEffect, useId, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

let mermaidReady = false;

export function MermaidDiagram({ code }: { code: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = `mermaid-${uid}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setSvg(null);
    setFailed(false);
    import('mermaid')
      .then(async (mod) => {
        const api = (mod as { default?: unknown }).default ?? mod;
        const m = api as {
          initialize: (o: unknown) => void;
          render: (id: string, code: string) => Promise<{ svg: string } | string>;
        };
        if (!mermaidReady) {
          m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' });
          mermaidReady = true;
        }
        const out = await m.render(id, code);
        const text = typeof out === 'string' ? out : out.svg;
        if (live) setSvg(text);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [id, code]);
  if (failed) {
    return (
      <div data-testid="mermaid-diagram" role="img" aria-label="다이어그램" className="moi-mermaid">
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    );
  }
  if (svg === null) {
    return (
      <div data-testid="mermaid-diagram" role="img" aria-label="다이어그램" className="moi-mermaid">
        <span role="status">다이어그램을 불러오는 중입니다</span>
      </div>
    );
  }
  return (
    <div
      data-testid="mermaid-diagram"
      role="img"
      aria-label="다이어그램"
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
