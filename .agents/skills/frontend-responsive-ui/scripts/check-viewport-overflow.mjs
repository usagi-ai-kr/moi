#!/usr/bin/env node
// 반응형 가로 오버플로 검사 (ADR-0007/0011, 이슈 #1·#12: 320/375/768/1024/1280).
// **가로 오버플로만 보증** — 겹침·클릭 가능·포커스·가시성은 Playwright 시나리오(#12) 몫.
// 의존성: Node.js + playwright (프로젝트 devDependency)
// 사용법: node .agents/skills/frontend-responsive-ui/scripts/check-viewport-overflow.mjs <base-url> [route ...]
//   예: node .agents/skills/frontend-responsive-ui/scripts/check-viewport-overflow.mjs http://localhost:8787 / /login
// 종료 코드: 0 통과, 1 위반, 2 사용 오류, 3 playwright 미설치
const VIEWPORTS = [320, 375, 768, 1024, 1280];

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright 미설치 — scaffold(0.1.0)에서 devDependency 추가 후 사용하세요.');
  process.exit(3);
}

const [base, ...args] = process.argv.slice(2);
if (!base) {
  console.error('usage: node scripts/check-viewport-overflow.mjs <base-url> [route ...]');
  process.exit(2);
}
const routes = args.length ? args : ['/'];

const browser = await chromium.launch();
let failed = 0;
for (const width of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  for (const route of routes) {
    const url = new URL(route, base).toString();
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
    } catch (e) {
      console.log(`FAIL ${String(width).padStart(4)}px ${url} — 로드 실패: ${e.message.split('\n')[0]}`);
      failed++;
      continue;
    }
    const { innerWidth, scrollWidth } = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    const ok = scrollWidth <= innerWidth;
    if (!ok) failed++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${String(width).padStart(4)}px ${url} (scrollWidth=${scrollWidth}, innerWidth=${innerWidth})`);
  }
  await page.close();
}
await browser.close();
console.log(failed ? `FAIL: 가로 오버플로 ${failed}건` : 'OK: 전 viewport 가로 오버플로 없음 (가로 오버플로 한정 — 반응형 전체 판정 아님)');
process.exit(failed ? 1 : 0);
