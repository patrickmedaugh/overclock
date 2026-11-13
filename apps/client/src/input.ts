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
}

export interface PressOptions {
  longPressMs?: number;
  /** Movement (CSS px) that cancels a pending long-press. */
  moveTolerance?: number;
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

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    cancelFrame?.();
    cancelFrame = null;
  };

  const fireLong = () => {
    cancelFrame = null;
    if (pointerId === null || !holdable) return;
    longFired = true;
    handlers.onLongPress?.();
  };

  /** `upAt`: when the release was made, or null (cancel / released outside). */
  const end = (fireTap: boolean, upAt: number | null) => {
    if (pointerId === null) return;
    pointerId = null;
    clearTimer();
    const held = upAt === null ? null : upAt - downAt;
    if (longFired) {
      longFired = false;
      handlers.onLongPressEnd?.();
      // The zoom opened late (page stalled), but the finger was down for less
      // than the hold time: it was a tap.
      if (fireTap && held !== null && held < longPressMs && !target.destroyed) handlers.onTap?.();
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
    downAt = madeAt(stampOf(e), performance.now());
    longFired = false;
    holdable = !!handlers.onLongPress;
    handlers.onDown?.();
    if (holdable) {
      timer = setTimeout(() => {
        timer = null;
        if (pointerId === null) return;
        // On time: zoom now. Late (the page stalled): a release made during the
        // stall may be queued; let the browser deliver it first.
        if (performance.now() - downAt < longPressMs + LATE_MS) fireLong();
        else cancelFrame = afterNextFrame(fireLong);
      }, longPressMs);
    }
  };
  const onMove = (e: FederatedPointerEvent) => {
    if (pointerId !== e.pointerId || !holdable || longFired) return;
    if (Math.hypot(e.global.x - startX, e.global.y - startY) > tolerance) {
      holdable = false;
      clearTimer();
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
      end(true, current);
    } finally {
      current = outer;
    }
  };
  const onUpOutside = (e: FederatedPointerEvent) => {
    if (pointerId === e.pointerId) end(false, null);
  };

  target.on('pointerdown', onDown);
  target.on('globalpointermove', onMove);
  target.on('pointerup', onUp);
  target.on('pointerupoutside', onUpOutside);
  target.on('pointercancel', onUpOutside);

  return () => {
    clearTimer();
    target.off('pointerdown', onDown);
    target.off('globalpointermove', onMove);
    target.off('pointerup', onUp);
    target.off('pointerupoutside', onUpOutside);
    target.off('pointercancel', onUpOutside);
  };
}
