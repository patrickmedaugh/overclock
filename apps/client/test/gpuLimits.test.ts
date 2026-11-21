import { GlLimitsSystem, VERSION } from 'pixi.js';
import { afterAll, describe, expect, it } from 'vitest';
import { MAX_BATCH_TEXTURES, VERIFIED_PIXI, capBatchTextures } from '../src/gpuLimits';

// QA S-15-6 AC12 (DECISIONS 2026-11-21): Pixi's batch shader branches once per texture slot for
// every pixel; the cap keeps it short so a held card's frame fits the 0.6 s budget on a software GPU.
describe('capBatchTextures', () => {
  const original = GlLimitsSystem.prototype.contextChange;
  afterAll(() => {
    GlLimitsSystem.prototype.contextChange = original;
  });

  it('caps the textures per batch after every GPU context (re)start, and never raises a smaller limit', () => {
    let reported = 32;
    const seen: unknown[][] = [];
    // Stand-in for Pixi's own probe (it needs a real GL context).
    GlLimitsSystem.prototype.contextChange = function (this: GlLimitsSystem, ...args: unknown[]) {
      seen.push(args);
      this.maxTextures = reported;
      this.maxBatchableTextures = reported;
    };
    capBatchTextures();
    capBatchTextures(); // twice: still wraps once
    const limits = new GlLimitsSystem({} as never);
    limits.contextChange();
    expect(MAX_BATCH_TEXTURES).toBe(4);
    expect(limits.maxBatchableTextures).toBe(MAX_BATCH_TEXTURES);
    expect(limits.maxTextures, 'texture units themselves untouched').toBe(32);
    reported = 2;
    limits.contextChange(); // a lost context restored on a GPU with fewer units
    expect(limits.maxBatchableTextures).toBe(2);
    // Whatever Pixi passes (its runners emit the context) reaches the original method.
    const gl = { fake: 'context' };
    (limits.contextChange as (...a: unknown[]) => void)(gl, 7);
    expect(seen.at(-1)).toEqual([gl, 7]);
    expect(seen).toHaveLength(3);
  });

  // Upgrade tripwire: the cap wraps a Pixi internal (where `maxBatchableTextures` is set). A new
  // Pixi must be re-checked (this file + the shader check in e2e/s15-snappy) before VERIFIED_PIXI moves.
  it('the installed Pixi is the version the cap was verified on', () => {
    expect(VERSION).toBe(VERIFIED_PIXI);
  });
});
