// 공통 브랜드 — Router 비의존 장식 (#225).
// img는 장식(alt ""·aria-hidden), 텍스트는 copy.brand 단일 소스.
// 링크 래퍼(a/Link)는 사용처에서 제공해 중첩 링크·중복 접근 이름을 방지한다.
// Router·lucide·모달 import 금지 — 초기 번들 유지.
import { copy } from './copy';
import { layout } from './tokens';
import './brand.css';

export function Brand() {
  return (
    <span className="moi-brand-cluster">
      <img
        src="/favicon.svg"
        width={layout.brandIconSize}
        height={layout.brandIconSize}
        alt=""
        aria-hidden="true"
        className="moi-brand-icon"
      />
      <span className="moi-brand">{copy.brand}</span>
    </span>
  );
}
