// S-05-3: the carousel slide is skipped when drawn frames are slow (it would only delay the next touch).
import { beforeEach, describe, expect, it } from 'vitest';
import { FAST_FRAMES_TO_RESUME, SLOW_FRAME_MS, forceFrameSpeed, framesAreSlow, noteDraw, noteTick, resetFrameClock } from '../src/frameClock';

describe('frameClock', () => {
  beforeEach(() => resetFrameClock());

  it('a drawn frame followed by a long gap is slow; a quick one is not', () => {
    noteTick(16);
    noteDraw();
    noteTick(SLOW_FRAME_MS + 100);
    expect(framesAreSlow()).toBe(true);
    for (let k = 0; k < FAST_FRAMES_TO_RESUME; k++) {
      expect(framesAreSlow()).toBe(true);
      noteDraw();
      noteTick(17);
    }
    expect(framesAreSlow()).toBe(false);
  });

  // QA-S15-3: frames are timed in whole screen refreshes; 3 refreshes (50.0 ms, 20 a second) is slow.
  it('a 20-a-second frame (exactly 50 ms) is slow; 30 a second (33 ms) is not', () => {
    expect(SLOW_FRAME_MS).toBeLessThan(50);
    expect(SLOW_FRAME_MS).toBeGreaterThanOrEqual(1000 / 30);
    noteDraw();
    noteTick(50);
    expect(framesAreSlow()).toBe(true);
    resetFrameClock();
    noteDraw();
    noteTick(1000 / 30);
    expect(framesAreSlow()).toBe(false);
  });

  // QA-S15-3: a device flickering between 50 and 67 ms frames kept turning the lean back on.
  it('one quick frame among slow ones does not bring decorative motion back; only a run of quick ones does', () => {
    noteDraw();
    noteTick(67);
    for (const ms of [33, 33, 67, 17, 17]) {
      noteDraw();
      noteTick(ms);
      expect(framesAreSlow(), `after ${ms}`).toBe(true);
    }
    noteDraw();
    noteTick(17);
    expect(framesAreSlow()).toBe(false);
    noteDraw();
    noteTick(67);
    expect(framesAreSlow()).toBe(true);
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

  it('the test hook can pin it either way, and give it back to the measurement', () => {
    noteDraw();
    noteTick(SLOW_FRAME_MS + 100);
    forceFrameSpeed('fast');
    expect(framesAreSlow()).toBe(false);
    forceFrameSpeed('slow');
    noteDraw();
    noteTick(16);
    expect(framesAreSlow()).toBe(true);
    forceFrameSpeed('measured');
    expect(framesAreSlow(), 'the measurement kept going while pinned').toBe(true);
    resetFrameClock();
    expect(framesAreSlow()).toBe(false);
  });
});
