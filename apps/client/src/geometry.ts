import type { Container } from 'pixi.js';
import type { Box } from './hook-types';

/**
 * Box of a w x h element drawn centered on `c` (layers are untransformed, so
 * the container's own position/scale place it). Excludes the decorative glow,
 * which may bleed a few pixels outside.
 */
export function centeredBox(c: Container, w: number, h: number, sx = 1, sy = 1, dx = 0): Box {
  const width = w * Math.abs(c.scale.x * sx);
  const height = h * Math.abs(c.scale.y * sy);
  return { x: c.x + dx - width / 2, y: c.y - height / 2, width, height };
}

/**
 * S-10-6 (QA-S9-4): `slot` cut back so it overlaps none of `boxes` (with `gap`): for each box
 * in the way, the cut (left, right, above or below it) that keeps the most room.
 */
export function clearOf(slot: Box, boxes: readonly Box[], gap = 0): Box {
  let r = { ...slot };
  for (const b of boxes) {
    if (!(r.x < b.x + b.width + gap && b.x - gap < r.x + r.width && r.y < b.y + b.height + gap && b.y - gap < r.y + r.height)) continue;
    const cuts: Box[] = [
      { x: r.x, y: r.y, width: b.x - gap - r.x, height: r.height },
      { x: b.x + b.width + gap, y: r.y, width: r.x + r.width - (b.x + b.width + gap), height: r.height },
      { x: r.x, y: r.y, width: r.width, height: b.y - gap - r.y },
      { x: r.x, y: b.y + b.height + gap, width: r.width, height: r.y + r.height - (b.y + b.height + gap) },
    ];
    const best = cuts.reduce((a, c) => (Math.max(0, c.width) * Math.max(0, c.height) > Math.max(0, a.width) * Math.max(0, a.height) ? c : a));
    r = { ...best, width: Math.max(0, best.width), height: Math.max(0, best.height) };
  }
  return r;
}
