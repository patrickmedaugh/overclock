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

describe('Tweens owner and after()', () => {
  it('drops tweens whose owner was destroyed, without completing them', () => {
    const tw = new Tweens();
    const owner = { destroyed: false };
    const o = { x: 0 };
    let done = false;
    tw.add({ target: o, to: { x: 10 }, duration: 100, owner, onComplete: () => (done = true) });
    tw.tick(10);
    owner.destroyed = true;
    tw.tick(200);
    expect(done).toBe(false);
    expect(tw.active).toBe(false);
  });

  it('after() runs a step later, or at once on finishAll (tap to skip), including chained steps', () => {
    const tw = new Tweens();
    const order: string[] = [];
    tw.after(250, () => {
      order.push('a');
      tw.after(200, () => order.push('b'));
    });
    tw.tick(100);
    expect(order).toEqual([]);
    tw.finishAll();
    expect(order).toEqual(['a', 'b']);
    expect(tw.active).toBe(false);
  });
});

describe('Tweens.tick reports movement', () => {
  it('returns false while a tween only waits out its delay, true once it moves', () => {
    const tw = new Tweens();
    const o = { a: 1 };
    tw.add({ target: o, to: { a: 0 }, delay: 1000, duration: 200 });
    expect(tw.tick(500)).toBe(false);
    expect(tw.active).toBe(true);
    expect(tw.tick(600)).toBe(true);
    expect(tw.tick(200)).toBe(true);
    expect(tw.tick(16)).toBe(false);
  });
});
