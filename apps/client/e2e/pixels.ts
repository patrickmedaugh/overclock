// Pixel checks on real screenshots, decoded in a blank page (the game page has a strict CSP).
import type { Page } from '@playwright/test';
import type { Box } from '../src/hook-types';

export interface PixelStats {
  /** Mean luminance 0..255. */
  mean: number;
  /** Standard deviation of luminance: ~0 for a blank (flat) area. */
  spread: number;
  /** Share of pixels brighter than 90. */
  brightFrac: number;
}

/** Luminance stats of each CSS-pixel rect in one screenshot. */
export async function pixelStats(page: Page, rects: Box[]): Promise<PixelStats[]> {
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const png = await page.screenshot();
  const helper = await page.context().newPage();
  try {
    return await helper.evaluate(
      async ({ b64, rects, dpr }) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const cv = document.createElement('canvas');
        cv.width = img.width;
        cv.height = img.height;
        const g = cv.getContext('2d')!;
        g.drawImage(img, 0, 0);
        return rects.map((rect) => {
          const w = Math.max(1, Math.round(rect.width * dpr));
          const h = Math.max(1, Math.round(rect.height * dpr));
          const d = g.getImageData(Math.round(rect.x * dpr), Math.round(rect.y * dpr), w, h).data;
          let sum = 0;
          let sq = 0;
          let bright = 0;
          for (let i = 0; i < d.length; i += 4) {
            const lum = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
            sum += lum;
            sq += lum * lum;
            if (lum > 90) bright++;
          }
          const n = d.length / 4;
          const mean = sum / n;
          return { mean, spread: Math.sqrt(Math.max(0, sq / n - mean * mean)), brightFrac: bright / n };
        });
      },
      { b64: png.toString('base64'), rects, dpr },
    );
  } finally {
    await helper.close();
  }
}
