// S-05-3: the carousel slide is skipped when drawn frames are slow (it would only delay the next touch).
import { beforeEach, describe, expect, it } from 'vitest';
import { SLOW_FRAME_MS, framesAreSlow, noteDraw, noteTick, resetFrameClock } from '../src/frameClock';

describe('frameClock', () => {
  beforeEach(() => resetFrameClock());

  it('a drawn frame followed by a long gap is slow; a quick one is not', () => {
    noteTick(16);
    noteDraw();
    noteTick(SLOW_FRAME_MS + 100);
    expect(framesAreSlow()).toBe(true);
    noteDraw();
    noteTick(17);
    expect(framesAreSlow()).toBe(false);
  });

  it('gaps after frames that drew nothing (idle, background tab) do not count', () => {
    noteTick(16);
    noteTick(500);
    expect(framesAreSlow()).toBe(false);
    noteDraw();
    noteTick(200);
    noteTick(16);
    expect(framesAreSlow()).toBe(true);
  });
});
