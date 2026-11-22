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

  it('QA-S15-2 (strip): after a late-opened hold, a sideways flick made before the hold time never picks the card up, even rising out of the strip', () => {
    const pulls: string[] = [];
    const { target, log } = setup({
      onHoldMove: () => log.push('slide'),
      // Says yes to any pull: the gesture rules alone decide.
      onPull: (_x, _y, dx, dy, at, held) => {
        pulls.push(`${dx},${dy}@${at - down}${held ? ' held' : ''}`);
        return held || -dy >= 1.2 * Math.abs(dx);
      },
      onDrag: () => log.push('drag'),
      onDrop: () => log.push('drop'),
    });
    const down = now;
    target.emit('pointerdown', { timeStamp: down, x: 100, y: 300 });
    stall(600);
    wakeTimers();
    runFrame(); // the hold opened late, before the queued flick is handled
    // Flat left, then rising 30 degrees (y above the strip), all made 70-110 ms after the down.
    target.emit('globalpointermove', { timeStamp: down + 70, x: 75, y: 300 });
    target.emit('globalpointermove', { timeStamp: down + 90, x: 40, y: 270 });
    target.emit('globalpointermove', { timeStamp: down + 110, x: 0, y: 240 });
    target.emit('pointerup', { timeStamp: down + 120, x: 0, y: 240 });
    expect(pulls, 'only the first exit is asked, as a not-held pull (sideways: no)').toEqual(['-25,0@70']);
    expect(log).toEqual(['down', 'zoom', 'slide', 'slide', 'slide', 'unzoom', 'release']);
  });

  it('QA-S15-2 (strip): a late-opened hold whose first exit (made before the hold time) is upward picks the card up', () => {
    const { target, log } = setup({
      onHoldMove: () => log.push('slide'),
      onPull: (_x, _y, dx, dy, _at, held) => !held && -dy >= 1.2 * Math.abs(dx),
      onDrag: () => log.push('drag'),
      onDrop: () => log.push('drop'),
    });
    const down = now;
    target.emit('pointerdown', { timeStamp: down, x: 100, y: 300 });
    stall(600);
    wakeTimers();
    runFrame();
    target.emit('globalpointermove', { timeStamp: down + 60, x: 102, y: 270 });
    target.emit('pointerup', { timeStamp: down + 120, x: 102, y: 200 });
    expect(log).toEqual(['down', 'zoom', 'drag', 'drop', 'release']);
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

describe('attachPress: hold to lift (S-15-6 owner round 3: anything longer than a quick tap grabs)', () => {
  const LIFT = 120;
  function liftSetup(accept = true, extra: PressHandlers = {}) {
    const target = new FakeTarget();
    const log: string[] = [];
    attachPress(
      target as unknown as Container,
      {
        onDown: () => log.push('down'),
        onTap: () => log.push('tap'),
        onLongPress: () => log.push('zoom'),
        onLongPressEnd: () => log.push('unzoom'),
        onRelease: () => log.push('release'),
        onHoldLift: () => {
          log.push(accept ? 'lift' : 'no-lift');
          return accept;
        },
        onLiftUndo: () => log.push('undo'),
        onPull: (_x, _y, dx, dy) => !(dy > 0 && dy >= Math.abs(dx)),
        onDrag: () => log.push('drag'),
        onDrop: (_x, _y, cancelled) => log.push(cancelled ? 'cancel' : 'drop'),
        ...extra,
      },
      { liftMs: LIFT, moveTolerance: 7 },
    );
    return { target, log };
  }

  it('a quick tap (under 0.12 s) is a tap: nothing lifts', () => {
    const { target, log } = liftSetup();
    target.emit('pointerdown', { timeStamp: now });
    pass(90);
    target.emit('pointerup', { timeStamp: now });
    pass(50);
    runFrame();
    expect(log).toEqual(['down', 'tap', 'release']);
  });

  it('held still 0.12 s: lifts on the next frame (no long-press), and the release drops it', () => {
    const { target, log } = liftSetup();
    target.emit('pointerdown', { timeStamp: now });
    pass(LIFT - 1);
    runFrame();
    expect(log).toEqual(['down']);
    pass(1);
    runFrame();
    expect(log).toEqual(['down', 'lift', 'drag']);
    pass(HOLD);
    target.emit('globalpointermove', { timeStamp: now, x: 40, y: -60 });
    target.emit('pointerupoutside', { timeStamp: now, x: 40, y: -60 });
    expect(log).toEqual(['down', 'lift', 'drag', 'drag', 'drop', 'release']);
  });

  it('held still and let go where it was pressed (a slow click, a hold to read): put back at once, then a tap', () => {
    const { target, log } = liftSetup();
    target.emit('pointerdown', { timeStamp: now, x: 100, y: 300 });
    pass(LIFT);
    runFrame();
    pass(600);
    target.emit('globalpointermove', { timeStamp: now, x: 103, y: 297 });
    target.emit('pointerup', { timeStamp: now, x: 103, y: 297 });
    expect(log).toEqual(['down', 'lift', 'drag', 'drag', 'undo', 'tap', 'release']);
  });

  it('the same when the release lands on the big held card (outside the small one): a tap, never a drop', () => {
    const { target, log } = liftSetup();
    target.emit('pointerdown', { timeStamp: now, x: 100, y: 300 });
    pass(LIFT);
    runFrame();
    pass(200);
    target.emit('pointerupoutside', { timeStamp: now, x: 101, y: 300 });
    expect(log).toEqual(['down', 'lift', 'drag', 'undo', 'tap', 'release']);
  });

  it('a release already queued when the lift timer runs is handled first: a tap, no lift', () => {
    const { target, log } = liftSetup();
    const down = now;
    target.emit('pointerdown', { timeStamp: down });
    pass(LIFT + 5); // the timer ran; the lift waits one frame
    target.emit('pointerup', { timeStamp: down + 100 });
    runFrame();
    expect(log).toEqual(['down', 'tap', 'release']);
  });

  it('a late lift (page stalled) undone by a quick release, judged by its own times: a tap', () => {
    const { target, log } = liftSetup();
    const down = now;
    target.emit('pointerdown', { timeStamp: down });
    stall(500);
    wakeTimers();
    runFrame(); // lifted before the queued release came in
    target.emit('pointerup', { timeStamp: down + 60 });
    expect(log).toEqual(['down', 'lift', 'drag', 'undo', 'tap', 'release']);
  });

  it('a late lift whose first move (made before 0.12 s) goes down is undone; nothing is dropped', () => {
    const { target, log } = liftSetup();
    const down = now;
    target.emit('pointerdown', { timeStamp: down, x: 100, y: 300 });
    stall(500);
    wakeTimers();
    runFrame();
    target.emit('globalpointermove', { timeStamp: down + 50, x: 101, y: 320 });
    target.emit('pointerupoutside', { timeStamp: down + 80, x: 101, y: 330 });
    expect(log).toEqual(['down', 'lift', 'drag', 'undo', 'release']);
  });

  it('a move out of the circle before 0.12 s picks up at once (no timer)', () => {
    const { target, log } = liftSetup();
    target.emit('pointerdown', { timeStamp: now, x: 100, y: 300 });
    pass(30);
    target.emit('globalpointermove', { timeStamp: now, x: 103, y: 297 });
    expect(log, 'inside the 7 px circle: nothing yet').toEqual(['down']);
    target.emit('globalpointermove', { timeStamp: now, x: 106, y: 293 }); // out, diagonally: picked up
    target.emit('globalpointermove', { timeStamp: now, x: 108, y: 280 });
    expect(log).toEqual(['down', 'drag']);
    pass(400);
    runFrame();
    expect(log, 'no hold timer after the pick-up').toEqual(['down', 'drag']);
  });

  it('where the card cannot be lifted (onHoldLift says no), the still hold goes on to the long-press', () => {
    const { target, log } = liftSetup(false);
    target.emit('pointerdown', { timeStamp: now });
    pass(LIFT);
    runFrame();
    expect(log).toEqual(['down', 'no-lift']);
    pass(HOLD - LIFT);
    expect(log).toEqual(['down', 'no-lift', 'zoom']);
    target.emit('pointerup', { timeStamp: now });
    expect(log).toEqual(['down', 'no-lift', 'zoom', 'unzoom', 'release']);
  });
});
