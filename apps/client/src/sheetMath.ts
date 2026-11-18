// Sprint 12: where a card sheet's cards go (pure, unit tested).
import type { Box } from './hook-types';

export interface SheetSlots {
  /** Card boxes for the shown page, in order. */
  boxes: Box[];
  /** Cards per page (all of them when they fit). */
  perPage: number;
  pages: number;
}

/**
 * Card boxes for `n` cards of aspect `ratio` (height / width) in `area`: as big as `maxW` allows,
 * wrapping into rows, never below `minW` wide (then paged). Centred, `gap` apart. Pure.
 */
export function gridSlots(area: Box, n: number, ratio: number, maxW: number, minW: number, gap: number, page = 0): SheetSlots {
  if (n <= 0 || area.width <= 0 || area.height <= 0) return { boxes: [], perPage: Math.max(0, n), pages: 1 };
  const fit = (w: number) => {
    const h = w * ratio;
    const cols = Math.max(1, Math.floor((area.width + gap) / (w + gap)));
    const rows = Math.max(1, Math.floor((area.height + gap) / (h + gap)));
    return { w, h, cols, rows };
  };
  let best = fit(Math.max(minW, Math.min(maxW, area.width, area.height / ratio)));
  for (let w = best.w; w >= minW; w -= 1) {
    const f = fit(w);
    best = f;
    if (f.cols * f.rows >= n) break;
  }
  const perPage = Math.min(n, best.cols * best.rows);
  const pages = Math.max(1, Math.ceil(n / perPage));
  const p = Math.min(Math.max(0, page), pages - 1);
  const count = Math.min(perPage, n - p * perPage);
  const cols = Math.min(best.cols, count);
  const rows = Math.ceil(count / cols);
  const totalH = rows * best.h + (rows - 1) * gap;
  const y0 = area.y + (area.height - totalH) / 2;
  const boxes: Box[] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const inRow = Math.min(cols, count - r * cols);
    const rowW = inRow * best.w + (inRow - 1) * gap;
    const x0 = area.x + (area.width - rowW) / 2;
    const c = i - r * cols;
    boxes.push({ x: Math.round(x0 + c * (best.w + gap)), y: Math.round(y0 + r * (best.h + gap)), width: Math.round(best.w), height: Math.round(best.h) });
  }
  return { boxes, perPage, pages };
}
