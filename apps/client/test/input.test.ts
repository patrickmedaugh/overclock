// attachPress: tap vs hold is judged by when the press and release were made
// (event timestamps), not by when the long-press timer got to run (QA-S3-7).
import type { Container, FederatedPointerEvent } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachPress, inputTime, type PressHandlers } from '../src/input';
import { timing } from '../src/theme';

const HOLD = timing.longPress;

/** A stand-in for a Pixi Container: just enough for attachPress. */
class FakeTarget {
  eventMode = 'auto';
  cursor = 'auto';
  destroyed = false;
  label = 'fake';
  private listeners = new Map<string, ((e: FederatedPointerEvent) => void)[]>();
  on(type: string, fn: (e: FederatedPointerEvent) => void): this {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
    return this;
  }
  off(type: string, fn: (e: FederatedPointerEvent) => void): this {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((f) => f !== fn));
    return this;
  }
  emit(type: string, e: { timeStamp: number; x?: number; y?: number }): void {
    const ev = { pointerId: 1, global: { x: e.x ?? 10, y: e.y ?? 10 }, timeStamp: e.timeStamp, nativeEvent: {} } as unknown as FederatedPointerEvent;
    for (const fn of this.listeners.get(type) ?? []) fn(ev);
  }
}

/** The page clock (performance.now()), moved by hand, and pending animation frames. */
let now = 0;
let frames: (() => void)[] = [];

function setup(extra: PressHandlers = {}) {
  const target = new FakeTarget();
  const log: string[] = [];
  const detach = attachPress(target as unknown as Container, {
    onDown: () => log.push('down'),
    onTap: () => log.push(`tap@${inputTime()}`),
    onLongPress: () => log.push('zoom'),
    onLongPressEnd: () => log.push('unzoom'),
    onRelease: () => log.push('release'),
    ...extra,
  });
  return { target, log, detach };
}

/** Lets `ms` of page time pass with the page responsive (timers run on time). */
function pass(ms: number): void {
  now += ms;
  vi.advanceTimersByTime(ms);
}

/** The page is frozen for `ms`: time passes but no callback runs. */
function stall(ms: number): void {
  now += ms;
}

/** The page wakes up after a stall: the overdue long-press timer runs (late). */
function wakeTimers(): void {
  vi.runOnlyPendingTimers();
}

function runFrame(): void {
  const f = frames;
  frames = [];
  for (const fn of f) fn();
}

beforeEach(() => {
  now = 1000;
  frames = [];
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => frames.push(fn));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames[id - 1] = () => {};
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('attachPress: tap vs hold', () => {
  it('a quick tap is a tap, judged at the release time it was made', () => {
    const { target, log } = setup();
    target.emit('pointerdown', { timeStamp: now });
    pass(40);
    target.emit('pointerup', { timeStamp: now });
    expect(log).toEqual(['down', 'tap@1040', 'release']);
  });

  it('a real hold zooms after the hold time and release closes it, with no tap', () => {
    const { target, log } = setup();
    target.emit('pointerdown', { timeStamp: now });
    pass(HOLD - 1);
    expect(log).toEqual(['down']);
    pass(1);
    expect(log).toEqual(['down', 'zoom']);
    pass(500);
    target.emit('pointerup', { timeStamp: now });
    expect(log).toEqual(['down', 'zoom', 'unzoom', 'release']);
  });

  it('QA-S3-7: page stalls 600ms between a 30ms tap\'s down and up, timer runs first: still a tap, no zoom', () => {
    const { target, log } = setup();
    const down = now;
    target.emit('pointerdown', { timeStamp: down });
    stall(600);
    // The page wakes: the long-press timer is overdue and runs before the queued release.
    wakeTimers();
    expect(log, 'a late timer waits a frame for queued input').toEqual(['down']);
    // The browser delivers the release made 30ms after the press.
    target.emit('pointerup', { timeStamp: down + 30 });
    runFrame();
    expect(log).toEqual(['down', `tap@${down + 30}`, 'release']);
  });

  it('QA-S3-7: even if the zoom opened late, a quick release closes it and counts as the tap', () => {
    const { target, log } = setup();
    const down = now;
    target.emit('pointerdown', { timeStamp: down });
    stall(600);
    wakeTimers();
    runFrame(); // the zoom opens before the release is delivered
    expect(log).toEqual(['down', 'zoom']);
    target.emit('pointerup', { timeStamp: down + 30 });
    expect(log).toEqual(['down', 'zoom', 'unzoom', `tap@${down + 30}`, 'release']);
  });

  it('a stalled real hold still zooms once the page wakes', () => {
    const { target, log } = setup();
    target.emit('pointerdown', { timeStamp: now });
    stall(600);
    wakeTimers();
    runFrame();
    expect(log).toEqual(['down', 'zoom']);
    pass(300);
    target.emit('pointerup', { timeStamp: now });
    expect(log).toEqual(['down', 'zoom', 'unzoom', 'release']);
  });

  it('a hold whose release is handled before the stalled timer runs is not a tap (no accidental play)', () => {
    const { target, log } = setup();
    const down = now;
    target.emit('pointerdown', { timeStamp: down });
    stall(700);
    target.emit('pointerup', { timeStamp: down + 500 });
    wakeTimers();
    runFrame();
    expect(log).toEqual(['down', 'release']);
  });

  it('moving away cancels the hold; the release is then a tap, however long', () => {
    const { target, log } = setup();
    target.emit('pointerdown', { timeStamp: now, x: 10, y: 10 });
    pass(50);
    target.emit('globalpointermove', { timeStamp: now, x: 40, y: 10 });
    pass(600);
    target.emit('pointerup', { timeStamp: now, x: 40, y: 10 });
    expect(log).toEqual(['down', `tap@${now}`, 'release']);
  });

  it('a target without a long-press is always a tap, however long the press', () => {
    const { target, log } = setup({ onLongPress: undefined, onLongPressEnd: undefined });
    target.emit('pointerdown', { timeStamp: now });
    pass(900);
    target.emit('pointerup', { timeStamp: now });
    expect(log).toEqual(['down', `tap@${now}`, 'release']);
  });

  it('released outside: no tap, an open zoom closes', () => {
    const { target, log } = setup();
    target.emit('pointerdown', { timeStamp: now });
    pass(HOLD + 10);
    target.emit('pointerupoutside', { timeStamp: now });
    expect(log).toEqual(['down', 'zoom', 'unzoom', 'release']);
  });

  it('unusable event stamps fall back to the handling time', () => {
    const { target, log } = setup();
    target.emit('pointerdown', { timeStamp: 0 });
    pass(40);
    target.emit('pointerup', { timeStamp: Number.NaN });
    expect(log).toEqual(['down', 'tap@1040', 'release']);
  });

  it('detach stops a pending long-press', () => {
    const { target, log, detach } = setup();
    target.emit('pointerdown', { timeStamp: now });
    detach();
    pass(HOLD * 2);
    runFrame();
    expect(log).toEqual(['down']);
  });
});

describe('attachPress: hold and slide (S-04-3)', () => {
  it('after the zoom opens, moves of the same pointer are reported with their event time', () => {
    const moves: string[] = [];
    const { target, log } = setup({ onHoldMove: (x, y, at) => moves.push(`${x},${y}@${at}`) });
    target.emit('pointerdown', { timeStamp: now, x: 10, y: 10 });
    target.emit('globalpointermove', { timeStamp: now, x: 12, y: 10 });
    expect(moves, 'no slide before the hold opens').toEqual([]);
    pass(HOLD);
    expect(log).toEqual(['down', 'zoom']);
    pass(20);
    target.emit('globalpointermove', { timeStamp: now, x: 80, y: 30 });
    expect(moves).toEqual([`80,30@${now}`]);
  });

  it('lifting after a slide closes the zoom and picks nothing', () => {
    const { target, log } = setup({ onHoldMove: () => {} });
    target.emit('pointerdown', { timeStamp: now, x: 10, y: 10 });
    pass(HOLD + 10);
    target.emit('globalpointermove', { timeStamp: now, x: 90, y: 10 });
    pass(100);
    target.emit('pointerup', { timeStamp: now, x: 90, y: 10 });
    expect(log).toEqual(['down', 'zoom', 'unzoom', 'release']);
  });

  it('a late-opened zoom followed by a slide is not a tap, even if released quickly', () => {
    const { target, log } = setup({ onHoldMove: () => {} });
    const down = now;
    target.emit('pointerdown', { timeStamp: down, x: 10, y: 10 });
    stall(600);
    wakeTimers();
    runFrame();
    target.emit('globalpointermove', { timeStamp: down + 20, x: 90, y: 10 });
    target.emit('pointerup', { timeStamp: down + 30, x: 90, y: 10 });
    expect(log).toEqual(['down', 'zoom', 'unzoom', 'release']);
  });

  it('a released-outside slide closes the zoom without a tap', () => {
    const { target, log } = setup({ onHoldMove: () => {} });
    target.emit('pointerdown', { timeStamp: now, x: 10, y: 10 });
    pass(HOLD + 10);
    target.emit('globalpointermove', { timeStamp: now, x: 200, y: 10 });
    target.emit('pointerupoutside', { timeStamp: now });
    expect(log).toEqual(['down', 'zoom', 'unzoom', 'release']);
  });
});
