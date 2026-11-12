// Pointer gestures on Pixi display objects: press feedback, tap, long-press.
// Works for mouse and touch (Pixi normalizes both to pointer events).
import type { Container, FederatedPointerEvent } from 'pixi.js';
import { timing } from './theme';

export interface PressHandlers {
  /** Fires immediately on pointer down (visual feedback; <100ms budget). */
  onDown?: () => void;
  /** Fires when the press ends for any reason (up, cancel, long-press release). */
  onRelease?: () => void;
  /**
   * Short press released over the target. `tapAt` is the release's own
   * event timestamp (the browser's, not when this handler runs).
   */
  onTap?: (tapAt: number) => void;
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

/**
 * When the pointer event really happened: the native event's `timeStamp`
 * (stamped by the browser when the input arrived), falling back to Pixi's
 * own stamp (taken when Pixi handled it) if the native one is missing.
 */
export function tapTime(e: FederatedPointerEvent): number {
  const native = (e.nativeEvent as { timeStamp?: unknown } | undefined)?.timeStamp;
  return typeof native === 'number' && Number.isFinite(native) ? native : e.timeStamp;
}

export function attachPress(target: Container, handlers: PressHandlers, opts: PressOptions = {}): () => void {
  const longPressMs = opts.longPressMs ?? timing.longPress;
  const tolerance = opts.moveTolerance ?? 12;
  target.eventMode = 'static';
  target.cursor = 'pointer';

  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let longFired = false;

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const end = (fireTap: boolean, tapAt: number) => {
    if (pointerId === null) return;
    pointerId = null;
    clearTimer();
    if (longFired) {
      longFired = false;
      handlers.onLongPressEnd?.();
    } else if (fireTap) {
      handlers.onTap?.(tapAt);
    }
    // The tap may have rebuilt the board (turn change) and destroyed us.
    if (!target.destroyed) handlers.onRelease?.();
  };

  const onDown = (e: FederatedPointerEvent) => {
    if (pointerId !== null) return;
    pointerId = e.pointerId;
    startX = e.global.x;
    startY = e.global.y;
    longFired = false;
    handlers.onDown?.();
    if (handlers.onLongPress) {
      timer = setTimeout(() => {
        timer = null;
        if (pointerId === null) return;
        longFired = true;
        handlers.onLongPress?.();
      }, longPressMs);
    }
  };
  const onMove = (e: FederatedPointerEvent) => {
    if (pointerId !== e.pointerId || timer === null) return;
    if (Math.hypot(e.global.x - startX, e.global.y - startY) > tolerance) clearTimer();
  };
  const onUp = (e: FederatedPointerEvent) => {
    if (pointerId === e.pointerId) end(true, tapTime(e));
  };
  const onUpOutside = (e: FederatedPointerEvent) => {
    if (pointerId === e.pointerId) end(false, tapTime(e));
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
