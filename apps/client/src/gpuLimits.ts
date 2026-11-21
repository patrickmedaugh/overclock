import { GlLimitsSystem } from 'pixi.js';

/**
 * Most textures Pixi may bind in one batched draw (QA S-15-6 AC12, DECISIONS 2026-11-21).
 *
 * Pixi's default is every texture unit the GPU reports (32 on the CI runner's software GPU),
 * and its batch shader then picks the texture with a chain of that many branches for every
 * pixel it draws. On a software GPU (and on weak phone GPUs, which are fill-rate bound) that
 * chain is most of a frame's cost: a full-screen layer took ~80 ms at 32 and ~30 ms at 4 on a
 * GPU-less 1280x800 desktop, the held-card frame ~260 ms -> ~110 ms. Our frames use few
 * textures at once (~20 draws a frame), so a few more draw calls cost nothing measurable.
 */
export const MAX_BATCH_TEXTURES = 4;

/**
 * The Pixi version this cap was checked against (DECISIONS 2026-11-21): the wrapper relies on
 * `GlLimitsSystem.contextChange` setting `maxBatchableTextures`, which a Pixi update could move
 * without any type error. A unit test fails when the installed Pixi differs, so an upgrade
 * re-checks the cap (unit test + the e2e shader check in s15-snappy) and then bumps this.
 */
export const VERIFIED_PIXI = '8.23.0';

let capped = false;

/** Call once before the renderer is created; also holds after a lost GPU context is restored. */
export function capBatchTextures(): void {
  if (capped) return;
  capped = true;
  const contextChange = GlLimitsSystem.prototype.contextChange;
  GlLimitsSystem.prototype.contextChange = function (this: GlLimitsSystem, ...args: unknown[]): void {
    (contextChange as (...a: unknown[]) => void).apply(this, args);
    this.maxBatchableTextures = Math.min(this.maxBatchableTextures, MAX_BATCH_TEXTURES);
  };
}
