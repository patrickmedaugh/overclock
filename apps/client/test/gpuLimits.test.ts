import { GlLimitsSystem } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { MAX_BATCH_TEXTURES, capBatchTextures } from '../src/gpuLimits';

// QA S-15-6 AC12 (DECISIONS 2026-11-21): Pixi's batch shader branches once per texture slot for
// every pixel; the cap keeps it short so a held card's frame fits the 0.6 s budget on a software GPU.
describe('capBatchTextures', () => {
  it('caps the textures per batch after every GPU context (re)start, and never raises a smaller limit', () => {
    let reported = 32;
    // Stand-in for Pixi's own probe (it needs a real GL context).
    GlLimitsSystem.prototype.contextChange = function (this: GlLimitsSystem) {
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
  });
});
