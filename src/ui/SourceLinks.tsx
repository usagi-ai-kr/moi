import { sourceLabel } from './source-label';
import './source-links.css';

interface Props {
  readonly urls: readonly string[];
}

// 근거 링크 목록 — 화면에는 문서명, 원문 URL은 href/title에만 둔다 (#188).
export function SourceLinks({ urls }: Props) {
  return (
    <ul className="moi-source-links">
      {urls.map((url) => (
        <li key={url}>
          <a href={url} title={url} target="_blank" rel="noreferrer">
            {sourceLabel(url)}
          </a>
        </li>
      ))}
    </ul>
  );
}
