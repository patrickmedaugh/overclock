// Pointer gestures on Pixi display objects: press feedback, tap, long-press.
// Works for mouse and touch (Pixi normalizes both to pointer events).
import type { Container, FederatedPointerEvent } from 'pixi.js';
import type { InputStamp } from './hook-types';
import { timing } from './theme';

let last: InputStamp | null = null;

/**
 * The most recent pointer release that reached a pressable target: the DOM
 * event's timestamp and when our handler started running (both
 * performance.now() clock). The gap is browser input queueing, not game time.
 */
export function lastInput(): InputStamp | null {
  return last ? { ...last } : null;
}

/**
 * Records a pointer release handled outside attachPress (the S-07-6 hand view
 * takes its own presses), so lastInput() covers every game tap.
 */
export function noteRelease(eventAt: number, handledAt: number, target: string): void {
  last = { eventAt, handledAt, target };
}

/** Event time of the pointer release being handled right now (null outside a release). */
let current: number | null = null;

/**
 * When the user made the input being handled now: the release's DOM event
 * timestamp (`InputStamp.eventAt`) while a tap handler runs, else
 * performance.now(). Time guards (the End turn double-tap guard) use this, not
 * the time the handler runs: a tap queued behind a slow frame must be judged by
 * when it was made.
 */
export function inputTime(): number {
  return current ?? performance.now();
}

/** A long-press timer running later than this past its due time means the page stalled. */
const LATE_MS = 50;

/** `eventAt` if it is usable on the performance.now() clock, else `handledAt`. */
function madeAt(eventAt: number, handledAt: number): number {
  // Never trust a time in the future or far in the past (old engines used epoch stamps).
  return Number.isFinite(eventAt) && eventAt > 0 && eventAt <= handledAt && handledAt - eventAt < 10_000 ? eventAt : handledAt;
}

export interface PressHandlers {
  /** Fires immediately on pointer down (visual feedback; <100ms budget). */
  onDown?: () => void;
  /** Fires when the press ends for any reason (up, cancel, long-press release). */
  onRelease?: () => void;
  /** Short press released over the target. */
  onTap?: () => void;
  /** Held for `longPressMs` without moving. */
  onLongPress?: () => void;
  /** Released after a long-press fired. */
  onLongPressEnd?: () => void;
  /**
   * The same pointer moved while the long-press is held (S-04-3: slide through
   * the hand). `x`/`y`: global position (CSS px); `at`: the move's event time
   * (performance.now() clock).
   */
  onHoldMove?: (x: number, y: number, at: number) => void;
  /**
   * S-15-6: the finger is pulling the card out: it left the move tolerance before a hold fired
   * (`held` false; `dx`/`dy`: that move from the press point) or moved while held (`held` true).
   * Return true to pick the card up: from then on every move of this finger goes to `onDrag` and
   * its release to `onDrop` (no tap, no `onLongPressEnd`). Asked once before a hold (at the
   * moment the finger leaves), on every move while held. `late`: a move made before the hold time
   * that the page handled only after a late hold opened (QA-S15-2: judged strictly).
   */
  onPull?: (x: number, y: number, dx: number, dy: number, at: number, held: boolean, late?: boolean) => boolean;
  /**
   * S-15-6 (owner round 3, 2026-11-22): held still for `liftMs` (shorter than the long-press): return
   * true to pick the card up there and then (`x`/`y`: the finger; `at`: now). From then on it is a
   * drag (onDrag / onDrop), as after `onPull`. False: the press goes on (a long-press may follow).
   */
  onHoldLift?: (x: number, y: number, at: number) => boolean;
  /**
   * S-15-6: a card `onHoldLift` picked up turned out, by the press's own event times, to be a quick
   * tap (let go before `liftMs`, the page ran the timer late) or a move made before `liftMs` that
   * `onPull` turns down: put it back at once, as if never lifted (a tap then follows, if it was one).
   */
  onLiftUndo?: () => void;
  /** S-15-6: the picked-up card's finger moved to global x/y (`at`: the move's event time). */
  onDrag?: (x: number, y: number, at: number) => void;
  /** S-15-6: the picked-up card's finger let go at global x/y (`cancelled`: the touch was cancelled). */
  onDrop?: (x: number, y: number, cancelled: boolean) => void;
}

export interface PressOptions {
  longPressMs?: number;
  /** Movement (CSS px) that cancels a pending long-press. */
  moveTolerance?: number;
  /** S-15-6: how long a still press takes before `onHoldLift` is asked (ms; only with that handler). */
  liftMs?: number;
}

/** The DOM timestamp of a Pixi pointer event (performance.now() clock). */
function stampOf(e: FederatedPointerEvent): number {
  const native: unknown = e.nativeEvent;
  return native instanceof Event ? native.timeStamp : e.timeStamp;
}

/** Runs `fn` after the next frame (after input the browser queued for it), or soon without rAF. */
function afterNextFrame(fn: () => void): () => void {
  const raf = globalThis.requestAnimationFrame as typeof requestAnimationFrame | undefined;
  if (typeof raf === 'function') {
    const id = raf(() => fn());
    return () => globalThis.cancelAnimationFrame(id);
  }
  const id = setTimeout(fn, 16);
  return () => clearTimeout(id);
}

/**
 * QA-S15-8: a frame that runs within this long of the one before means the page is keeping up (ms).
 * Longer is a stall. (A slow device's ordinary frames, 100-250 ms on a GPU-less runner, still count
 * as keeping up, so a hold there lifts on time.)
 */
const CATCH_UP_GAP_MS = 250;
/** QA-S15-8: the most frames a lift waits for the page to catch up (on a page that has not stalled). */
const CATCH_UP_FRAMES = 6;
/**
 * QA-S15-8: after a stall (a frame later than `CATCH_UP_GAP_MS`), the page must keep up this long
 * before a hold lifts: input the browser held back during the stall can reach the page well after it
 * (100-200 ms measured on the test runner), and it must be judged first. A hold on a stalled page
 * then lifts this much after the page recovers (it was late already); on a responsive page, no wait.
 */
const STALL_QUIET_MS = 300;
/** QA-S15-8: on a page that stalled, a lift waits for the page at most this long (ms), then lifts. */
const CATCH_UP_MAX_MS = 1500;

/**
 * QA-S15-8 / QA-S15-9 (the hand view's QA-S15-2 rule, `board.ts`): runs `fn` once the page has
 * caught up, so moves and a release the browser held back during a stall are handled (and judged by
 * their own times) first: after 2 frames in a row that each run within `CATCH_UP_GAP_MS` of the one
 * before, or after `CATCH_UP_FRAMES` frames at most. Also when the timer itself ran on time: a stall
 * that starts right after it (a busy frame) then delays the lift until the page has caught up, and
 * the input it held back comes first (QA-S15-9). On a responsive page: 2 frames (≤ 33 ms).
 */
/** True if the browser says input is waiting for the page (Chrome's `isInputPending`; false where missing). */
function inputPending(): boolean {
  const sch = (globalThis.navigator as { scheduling?: { isInputPending?: (o?: { includeContinuous?: boolean }) => boolean } } | undefined)?.scheduling;
  try {
    return sch?.isInputPending?.() === true;
  } catch {
    return false;
  }
}

/** QA-S15-10: time (ms) the game spent so far in its own heavy work (`ownWork`): card face bakes. */
let ownMs = 0;

/**
 * QA-S15-10: runs the game's own heavy work (a card face bake on a press) and counts its time, so a
 * late frame it caused is not taken for a stall of the page (which would hold back input and make
 * the hold-lift wait for the page to settle: on a slow phone every press paid that).
 */
export function ownWork<T>(fn: () => T): T {
  // Nested calls are counted once (by the outermost), so the total never exceeds the time that passed.
  if (ownDepth > 0) return fn();
  const t = performance.now();
  ownDepth++;
  try {
    return fn();
  } finally {
    ownDepth--;
    ownMs += Math.max(0, performance.now() - t);
  }
}
let ownDepth = 0;

/** How much later than its own work explains `t` is, since `from` (ms, the game's work since `ownFrom` taken off). */
function lateBy(from: number, ownFrom: number, t = performance.now()): number {
  return t - from - (ownMs - ownFrom);
}

function afterCatchUp(fn: () => void, stalledBefore = false): () => void {
  const raf = globalThis.requestAnimationFrame as typeof requestAnimationFrame | undefined;
  if (typeof raf !== 'function') return afterNextFrame(fn);
  const need = 2;
  const start = performance.now();
  let prev = start;
  let ownPrev = ownMs;
  let quick = 0;
  let frames = 0;
  let stalled = stalledBefore;
  let lastSlow = stalledBefore ? start : -Infinity;
  let id = 0;
  const frame = () => {
    const t = performance.now();
    // A frame late only because of the game's own work (a face bake) is on time for this rule.
    if (lateBy(prev, ownPrev, t) < CATCH_UP_GAP_MS) quick++;
    else {
      quick = 0;
      stalled = true;
      lastSlow = t;
    }
    prev = t;
    ownPrev = ownMs;
    frames++;
    const ready = quick >= need && !inputPending() && (!stalled || t - lastSlow >= STALL_QUIET_MS);
    const give = stalled ? t - start >= CATCH_UP_MAX_MS : frames >= CATCH_UP_FRAMES;
    if (ready || give) fn();
    else id = raf(frame);
  };
  id = raf(frame);
  return () => globalThis.cancelAnimationFrame(id);
}

/**
 * Tap vs hold is judged by when the finger went down and came up (the events'
 * timestamps), not by when our timer callback got to run (QA-S3-7). If the page
 * stalls longer than `longPressMs` between a quick tap's down and up, the timer
 * may run before the queued release is handled; the release's own timestamp
 * then still says "tap". To avoid even a flash of zoom in that case, a timer
 * that runs late waits for the next frame first, so a release queued during the
 * stall is handled before the zoom opens. If the zoom did open anyway, a quick
 * release closes it and counts as the tap it was.
 */
export function attachPress(target: Container, handlers: PressHandlers, opts: PressOptions = {}): () => void {
  const longPressMs = opts.longPressMs ?? timing.longPress;
  const tolerance = opts.moveTolerance ?? 12;
  const liftMs = handlers.onHoldLift && opts.liftMs !== undefined ? opts.liftMs : Infinity;
  target.eventMode = 'static';
  target.cursor = 'pointer';

  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  /** When the press was made (event time, performance.now() clock). */
  let downAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelFrame: (() => void) | null = null;
  /** The press can still become a hold (has onLongPress, not moved away). */
  let holdable = false;
  let longFired = false;
  /** The finger slid away after the hold opened (a slide is never a tap). */
  let slid = false;
  /** S-15-6: the press was pulled into a drag (onPull said yes): moves and the release go to onDrag / onDrop. */
  let dragging = false;
  /**
   * S-15-6 (owner review 2026-11-21): the finger left the circle without picking the card up (a
   * slanted start): every later move still asks `onPull`, so a drag that rises later picks it up.
   */
  let watchPull = false;
  /** S-15-6: the press can still be picked up by holding still (`onHoldLift`, not moved away). */
  let liftable = false;
  /**
   * S-15-6: the drag began by the hold-lift timer and no move or release has yet shown, by its own
   * event time, that the finger really stayed still for `liftMs` (QA-S3-7 / QA-S15-2 style).
   */
  let timerDrag = false;
  /** QA-S15-10: the game's own work time (`ownMs`) when the press went down. */
  let ownAtDown = 0;
  /** S-15-6: the drag began by the still hold (`onHoldLift`), and whether its finger has left the circle since. */
  let holdDrag = false;
  let leftCircle = false;
  /**
   * QA-S15-8: this press's lift was already put back once by `watchFirstFrame`. Only once per press:
   * on a page whose every frame is late, the give-up lift then stays (no lift / put-back loop).
   */
  let firstFrameUndone = false;
  /** Where the finger was last seen (a cancelled touch is let go there). */
  let lastX = 0;
  let lastY = 0;
  /**
   * S-15-6: Pixi never passes on `pointercancel` (the system took the touch: a gesture bar swipe, a
   * call): a DOM listener while pressed ends the press as cancelled, so nothing stays held.
   */
  let offCancel: (() => void) | null = null;

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    cancelFrame?.();
    cancelFrame = null;
  };

  const longTimer = () => {
    timer = null;
    if (pointerId === null) return;
    // On time: zoom now. Late (the page stalled): a release made during the
    // stall may be queued; let the browser deliver it first.
    if (performance.now() - downAt < longPressMs + LATE_MS) fireLong();
    else cancelFrame = afterNextFrame(fireLong);
  };

  /**
   * S-15-6 (owner round 3): the still hold picks the card up. Never in the timer itself: once the
   * page has caught up (`afterCatchUp`: two frames on a responsive page, ≤ 33 ms), so a release
   * or moves the browser already has (a quick tap or slip handed over behind a busy frame) are
   * handled first: a tap never shows a lifted card, not even for a frame (QA-S15-8).
   */
  const fireLift = () => {
    cancelFrame = null;
    if (pointerId === null || !liftable) return;
    liftable = false;
    const now = performance.now();
    if (handlers.onHoldLift?.(lastX, lastY, now)) {
      dragging = true;
      timerDrag = true;
      holdDrag = true;
      leftCircle = false;
      holdable = false;
      handlers.onDrag?.(lastX, lastY, now);
      watchFirstFrame(now);
      return;
    }
    if (holdable) timer = setTimeout(longTimer, Math.max(0, longPressMs - (now - downAt)));
  };

  /**
   * QA-S15-8: a stall that starts right after the hold lifted the card (before a frame showed it)
   * may hold back a quick release: if the next frame comes late and nothing has confirmed the hold
   * since, the lift is put back at once and waits for the page to catch up again.
   */
  const watchFirstFrame = (liftAt: number) => {
    const ownAt = ownMs;
    const raf = globalThis.requestAnimationFrame as typeof requestAnimationFrame | undefined;
    if (typeof raf !== 'function' || firstFrameUndone) return;
    cancelFrame = (() => {
      const id = raf(() => {
        cancelFrame = null;
        if (pointerId === null || !dragging || !timerDrag || leftCircle) return;
        if (lateBy(liftAt, ownAt) < CATCH_UP_GAP_MS) return;
        dragging = false;
        timerDrag = false;
        holdDrag = false;
        handlers.onLiftUndo?.();
        firstFrameUndone = true;
        liftable = true;
        cancelFrame = afterCatchUp(fireLift, true);
      });
      return () => globalThis.cancelAnimationFrame(id);
    })();
  };

  const fireLong = () => {
    cancelFrame = null;
    if (pointerId === null || !holdable) return;
    longFired = true;
    handlers.onLongPress?.();
  };

  /** `upAt`: when the release was made, or null (cancel / released outside). */
  const end = (fireTap: boolean, upAt: number | null, x = 0, y = 0, cancelled = false) => {
    if (pointerId === null) return;
    pointerId = null;
    watchPull = false;
    clearTimer();
    offCancel?.();
    offCancel = null;
    const held = upAt === null ? null : upAt - downAt;
    // S-15-6: picked up by the still hold and let go where it was pressed, never having left the
    // circle: a quick tap the page lifted late (QA-S3-7: judged by its own times), or a slow click /
    // a hold to read the card. Nothing was dragged: the card goes back at once and it acts as a tap
    // (on the strip: the hand view opens on it). Never a drop, so never a play.
    if (dragging && holdDrag && fireTap && !leftCircle && Math.hypot(x - startX, y - startY) <= tolerance) {
      dragging = false;
      timerDrag = false;
      handlers.onLiftUndo?.();
    }
    timerDrag = false;
    holdDrag = false;
    leftCircle = false;
    liftable = false;
    if (dragging) {
      dragging = false;
      longFired = false;
      handlers.onDrop?.(x, y, cancelled);
    } else if (longFired) {
      longFired = false;
      handlers.onLongPressEnd?.();
      // The zoom opened late (page stalled), but the finger was down for less
      // than the hold time: it was a tap. A slide through the hand never is.
      if (fireTap && !slid && held !== null && held < longPressMs && !target.destroyed) handlers.onTap?.();
    } else if (fireTap) {
      // Held long enough to read the card, but the page was too busy to show
      // it: a hold is never a tap (no accidental plays).
      const wasHold = holdable && held !== null && held >= longPressMs;
      if (!wasHold) handlers.onTap?.();
    }
    holdable = false;
    // The tap may have rebuilt the board (turn change) and destroyed us.
    if (!target.destroyed) handlers.onRelease?.();
  };

  const onDown = (e: FederatedPointerEvent) => {
    if (pointerId !== null) return;
    pointerId = e.pointerId;
    startX = e.global.x;
    startY = e.global.y;
    lastX = startX;
    lastY = startY;
    const id = e.pointerId;
    const domCancel = (ev: Event) => {
      if ((ev as PointerEvent).pointerId === id && pointerId === id) end(false, null, lastX, lastY, true);
    };
    if (typeof globalThis.addEventListener === 'function') {
      globalThis.addEventListener('pointercancel', domCancel, true);
      offCancel = () => globalThis.removeEventListener('pointercancel', domCancel, true);
    }
    downAt = madeAt(stampOf(e), performance.now());
    ownAtDown = ownMs;
    longFired = false;
    slid = false;
    dragging = false;
    watchPull = false;
    holdable = !!handlers.onLongPress;
    liftable = liftMs < longPressMs || (!holdable && liftMs < Infinity);
    timerDrag = false;
    holdDrag = false;
    leftCircle = false;
    firstFrameUndone = false;
    handlers.onDown?.();
    if (liftable) {
      timer = setTimeout(() => {
        timer = null;
        if (pointerId === null || !liftable) return;
        cancelFrame = afterCatchUp(fireLift, lateBy(downAt, ownAtDown) >= liftMs + CATCH_UP_GAP_MS);
      }, Math.max(0, liftMs - (performance.now() - downAt)));
    } else if (holdable) timer = setTimeout(longTimer, longPressMs);
  };
  const onMove = (e: FederatedPointerEvent) => {
    if (pointerId !== e.pointerId) return;
    const x = e.global.x;
    const y = e.global.y;
    lastX = x;
    lastY = y;
    if (dragging) {
      const at = madeAt(stampOf(e), performance.now());
      if (Math.hypot(x - startX, y - startY) > tolerance) leftCircle = true;
      if (timerDrag) {
        // S-15-6: a hold-lift is judged by this move's own time: leaving the circle before `liftMs`
        // the way a pick-up never goes (onPull says no) undoes it; any move at or after it confirms it.
        if (at - downAt >= liftMs) timerDrag = false;
        else if (Math.hypot(x - startX, y - startY) > tolerance) {
          timerDrag = false;
          if (!handlers.onPull?.(x, y, x - startX, y - startY, at, false)) {
            dragging = false;
            handlers.onLiftUndo?.();
            watchPull = !!handlers.onPull;
            return;
          }
          // Confirmed: the card follows this move too (falls through to onDrag).
        }
      }
      handlers.onDrag?.(x, y, at);
      return;
    }
    if (watchPull) {
      const at = madeAt(stampOf(e), performance.now());
      if (handlers.onPull?.(x, y, x - startX, y - startY, at, false)) {
        watchPull = false;
        dragging = true;
        handlers.onDrag?.(x, y, at);
      }
      return;
    }
    if (!holdable && !liftable) return;
    if (longFired) {
      const out = Math.hypot(x - startX, y - startY) > tolerance;
      const at = madeAt(stampOf(e), performance.now());
      // S-15-6: a move made before the hold time (the page was busy and handled it late) is judged as
      // made then (QA-S3-7): leaving the circle upward is a pick-up, not a slide of the hold.
      // (QA-S15-2: judged on the first move out of the circle, before it counts as a slide.)
      const beforeHold = at - downAt < longPressMs;
      const early = !slid && out && beforeHold;
      if (out) slid = true;
      if (early && handlers.onPull?.(x, y, x - startX, y - startY, at, false, true)) {
        dragging = true;
        longFired = false;
        clearTimer();
        handlers.onDrag?.(x, y, at);
        return;
      }
      // S-15-6: pulled out first (the card read so far is the one lifted), else the hold slides on.
      // QA-S15-2: not for a move made before the hold time (the page opened the hold late): by its
      // own time that was a flick, not a hold, so it never picks a card up (it only slides).
      if (!beforeHold && handlers.onPull?.(x, y, x - startX, y - startY, at, true)) {
        dragging = true;
        longFired = false;
        clearTimer();
        handlers.onDrag?.(x, y, at);
        return;
      }
      handlers.onHoldMove?.(x, y, at);
      return;
    }
    if (Math.hypot(x - startX, y - startY) > tolerance) {
      holdable = false;
      liftable = false;
      clearTimer();
      if (handlers.onPull?.(x, y, x - startX, y - startY, madeAt(stampOf(e), performance.now()), false)) dragging = true;
      else if (handlers.onPull) watchPull = true;
    }
  };
  const onUp = (e: FederatedPointerEvent) => {
    const handledAt = performance.now();
    const eventAt = stampOf(e);
    last = { eventAt, handledAt, target: target.label };
    if (pointerId !== e.pointerId) return;
    const outer = current;
    current = madeAt(eventAt, handledAt);
    try {
      end(true, current, e.global.x, e.global.y);
    } finally {
      current = outer;
    }
  };
  const onUpOutside = (e: FederatedPointerEvent) => {
    if (pointerId !== e.pointerId) return;
    if (!dragging) {
      end(false, null);
      return;
    }
    // S-15-6: a held card let go away from where it was picked up: that release plays it (or not).
    // One picked up by the still hold and let go where it was pressed is a tap (see `end`): the big
    // held card was under the finger, so the release landed "outside" the small card.
    const handledAt = performance.now();
    const eventAt = stampOf(e);
    const inPlace = holdDrag && !leftCircle && Math.hypot(e.global.x - startX, e.global.y - startY) <= tolerance;
    last = { eventAt, handledAt, target: inPlace ? target.label : 'drop' };
    const outer = current;
    current = madeAt(eventAt, handledAt);
    try {
      end(inPlace, current, e.global.x, e.global.y);
    } finally {
      current = outer;
    }
  };
  const onCancel = (e: FederatedPointerEvent) => {
    if (pointerId === e.pointerId) end(false, null, e.global.x, e.global.y, true);
  };

  target.on('pointerdown', onDown);
  target.on('globalpointermove', onMove);
  target.on('pointerup', onUp);
  target.on('pointerupoutside', onUpOutside);
  target.on('pointercancel', onCancel);

  return () => {
    clearTimer();
    offCancel?.();
    offCancel = null;
    target.off('pointerdown', onDown);
    target.off('globalpointermove', onMove);
    target.off('pointerup', onUp);
    target.off('pointerupoutside', onUpOutside);
    target.off('pointercancel', onCancel);
  };
}
