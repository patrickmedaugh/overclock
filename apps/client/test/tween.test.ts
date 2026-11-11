import { describe, expect, it } from 'vitest';
import { Tweens, ease } from '../src/tween';

describe('Tweens', () => {
  it('interpolates numeric properties over the duration', () => {
    const tw = new Tweens();
    const o = { x: 0, y: 10 };
    tw.add({ target: o, to: { x: 100 }, duration: 100, ease: ease.linear });
    tw.tick(50);
    expect(o.x).toBeCloseTo(50);
    expect(o.y).toBe(10);
    expect(tw.active).toBe(true);
    tw.tick(60);
    expect(o.x).toBe(100);
    expect(tw.active).toBe(false);
  });

  it('respects delay and reads the start value when it starts', () => {
    const tw = new Tweens();
    const o = { x: 0 };
    tw.add({ target: o, to: { x: 10 }, duration: 10, delay: 20, ease: ease.linear });
    tw.tick(10);
    o.x = 5;
    tw.tick(15);
    expect(o.x).toBeCloseTo(7.5);
  });

  it('finishAll snaps to the end and fires completions (tap to skip)', () => {
    const tw = new Tweens();
    const o = { x: 0 };
    let done = 0;
    tw.add({ target: o, to: { x: 42 }, duration: 250, onComplete: () => done++ });
    tw.tick(16);
    tw.finishAll();
    expect(o.x).toBe(42);
    expect(done).toBe(1);
    expect(tw.active).toBe(false);
  });

  it('cancel stops a tween without completing it', () => {
    const tw = new Tweens();
    const o = { x: 0 };
    let done = 0;
    tw.add({ target: o, to: { x: 42 }, duration: 100, onComplete: () => done++ });
    tw.cancel(o);
    tw.tick(200);
    expect(o.x).toBe(0);
    expect(done).toBe(0);
  });
});
