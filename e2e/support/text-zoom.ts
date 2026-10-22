import type { Page } from '@playwright/test';

/** Simulates 200% browser text zoom: halve the CSS viewport and double rendered text sizes. */
export async function emulate200PercentTextZoom(page: Page): Promise<void> {
  const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
  await page.setViewportSize({ width: Math.floor(viewport.width / 2), height: Math.floor(viewport.height / 2) });
  await page.evaluate(() => {
    const selectors = 'h1, h2, h3, h4, p, button, a, span, label, legend, dt, dd, summary, li, small, strong, em, td, th';
    const textElements = Array.from(document.querySelectorAll<HTMLElement>(selectors));
    const fontSizes = textElements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize) * 2);
    textElements.forEach((element, index) => {
      element.style.fontSize = `${fontSizes[index]}px`;
    });
  });
}
