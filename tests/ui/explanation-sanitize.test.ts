import { describe, expect, it } from 'vitest';
import { sanitizePeleSvg } from '../../src/ui/study/diagram-sanitize';

const GOOD =
  '<svg xmlns="http://www.w3.org/2000/svg" class="pele"><g><rect width="10" height="10"/></g><title id="t-title">t</title><desc id="t-desc">d</desc></svg>';

describe('sanitizePeleSvg', () => {
  it('정상 SVG를 통과시키고 직렬화해 반환한다', () => {
    const out = sanitizePeleSvg(GOOD);
    expect(out).not.toBeNull();
    expect(out ?? '').toContain('<svg');
    expect(out ?? '').toContain(GOOD.includes('viewBox') ? 'viewBox' : 'pele');
  });

  it('viewBox 혼합대소문자를 허용한다(실제 Pele 출력 회귀)', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 215 64" width="215" height="64"><g><rect width="10" height="10"/></g></svg>';
    const out = sanitizePeleSvg(svg);
    expect(out).not.toBeNull();
    expect(out ?? '').toContain('viewBox');
  });

  it('clipPath 요소를 허용한다', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="c"><rect width="10" height="10"/></clipPath></defs><g><rect width="10" height="10"/></g></svg>';
    expect(sanitizePeleSvg(svg)).not.toBeNull();
  });

  it('내부 fragment paint url(#id)을 허용한다', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><g><rect width="10" height="10" fill="url(#grad)"/></g></svg>';
    expect(sanitizePeleSvg(svg)).not.toBeNull();
  });

  it('외부 paint url(https://...)을 차단한다', () => {
    expect(
      sanitizePeleSvg(
        '<svg xmlns="http://www.w3.org/2000/svg"><g><rect width="10" height="10" fill="url(https://evil.example.com/x)"/></g></svg>',
      ),
    ).toBeNull();
  });

  it('script를 차단한다', () => {
    expect(sanitizePeleSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')).toBeNull();
  });

  it('on* 속성을 차단한다', () => {
    expect(
      sanitizePeleSvg('<svg xmlns="http://www.w3.org/2000/svg"><g onclick="alert(1)"><rect width="1"/></g></svg>'),
    ).toBeNull();
  });

  it('foreignObject를 차단한다', () => {
    expect(
      sanitizePeleSvg('<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body/></foreignObject></svg>'),
    ).toBeNull();
  });

  it('javascript: URL을 차단한다', () => {
    expect(
      sanitizePeleSvg(
        '<svg xmlns="http://www.w3.org/2000/svg"><g><a href="javascript:alert(1)"><text>hi</text></a></g></svg>',
      ),
    ).toBeNull();
  });

  it('data: URL을 차단한다', () => {
    expect(
      sanitizePeleSvg(
        '<svg xmlns="http://www.w3.org/2000/svg"><g><a href="data:text/html,<script>alert(1)</script>"><text>hi</text></a></g></svg>',
      ),
    ).toBeNull();
  });

  it('네트워크 경로를 차단한다', () => {
    expect(
      sanitizePeleSvg(
        '<svg xmlns="http://www.w3.org/2000/svg"><g><a href="//evil.example.com/x"><text>hi</text></a></g></svg>',
      ),
    ).toBeNull();
  });

  it('위험 style을 차단한다', () => {
    expect(
      sanitizePeleSvg(
        '<svg xmlns="http://www.w3.org/2000/svg"><g style="background:url(http://evil.example.com/x)"><rect width="1"/></g></svg>',
      ),
    ).toBeNull();
  });

  it('https 링크를 차단한다(외부 URL 0건)', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><g><a href="https://example.com/a" rel="noopener"><text>hi</text></a></g></svg>';
    expect(sanitizePeleSvg(svg)).toBeNull();
  });

  it('내부 fragment href(#id)는 허용한다', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><g><a href="#local"><text>hi</text></a></g></svg>';
    expect(sanitizePeleSvg(svg)).not.toBeNull();
  });

  it('image 요소를 차단한다', () => {
    expect(
      sanitizePeleSvg(
        '<svg xmlns="http://www.w3.org/2000/svg"><g><image href="https://example.com/x.png"/></g></svg>',
      ),
    ).toBeNull();
  });
});
