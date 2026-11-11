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
