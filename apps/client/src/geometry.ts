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
    // Only a box that really overlaps is cut around (one that merely sits next to the slot is left alone).
    if (!(r.x < b.x + b.width && b.x < r.x + r.width && r.y < b.y + b.height && b.y < r.y + r.height)) continue;
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

/**
 * QA-S10-1: the largest rectangle inside `region` that overlaps none of `obstacles` (each
 * kept `gap` px away), or null when none is at least `minW` x `minH`. Candidate edges are
 * the region's and the obstacles' (a small, exact search: boards hold a few dozen boxes).
 */
export function freeRect(region: Box, obstacles: readonly Box[], minW: number, minH: number, gap = 0): Box | null {
  const rx2 = region.x + region.width;
  const ry2 = region.y + region.height;
  const obs = obstacles
    .map((o) => ({ x1: o.x - gap, y1: o.y - gap, x2: o.x + o.width + gap, y2: o.y + o.height + gap }))
    .filter((o) => o.x2 > region.x && o.x1 < rx2 && o.y2 > region.y && o.y1 < ry2);
  const ys = [...new Set([region.y, ry2, ...obs.flatMap((o) => [o.y1, o.y2])].map((y) => Math.min(ry2, Math.max(region.y, y))))].sort((a, b) => a - b);
  // Per top edge, obstacles enter as the bottom edge moves down (sorted by top), and their
  // x-spans are merged incrementally: O(n^2) bands x O(n) per band, no per-band sort.
  const byTop = [...obs].sort((a, b) => a.y1 - b.y1);
  let best: Box | null = null;
  for (let i = 0; i < ys.length; i++) {
    const y1 = ys[i]!;
    const cand = byTop.filter((o) => o.y2 > y1);
    const spans: [number, number][] = [];
    let p = 0;
    for (let j = i + 1; j < ys.length; j++) {
      const y2 = ys[j]!;
      for (; p < cand.length && cand[p]!.y1 < y2; p++) {
        const a = Math.max(region.x, cand[p]!.x1);
        const b = Math.min(rx2, cand[p]!.x2);
        let k = 0;
        while (k < spans.length && spans[k]![0] <= a) k++;
        spans.splice(k, 0, [a, b]);
      }
      if (y2 - y1 < minH) continue;
      let x = region.x;
      let any = false;
      const take = (a: number, b: number) => {
        const w = b - a;
        if (w < minW) return;
        any = true;
        if (!best || w * (y2 - y1) > best.width * best.height) best = { x: a, y: y1, width: w, height: y2 - y1 };
      };
      for (const [a, b] of spans) {
        if (a > x) take(x, a);
        x = Math.max(x, b);
      }
      if (rx2 > x) take(x, rx2);
      // Gaps only shrink as the band grows: none wide enough now means none further down.
      if (!any) break;
    }
  }
  return best;
}
