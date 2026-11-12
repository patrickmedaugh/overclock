// Device mode: phone (touch, short side <= 500px) or desktop (everything
// else, incl. tablets). Phones are played sideways only (owner decision
// 2026-11-12); an upright phone shows the "Turn your phone sideways" screen.
// `classifyDevice` is pure (unit tested); the rest reads / touches the DOM.

/** Longest "short side" (CSS px) that still counts as a phone. */
export const PHONE_MAX_SHORT_SIDE = 500;

export interface DeviceState {
  /** Which board layout to use (see computeLayout). */
  mode: 'phone' | 'desktop';
  /** Phone held upright: show the rotate screen instead of the board. */
  rotatePrompt: boolean;
}

export function classifyDevice(coarsePointer: boolean, width: number, height: number): DeviceState {
  const phone = coarsePointer && Math.min(width, height) <= PHONE_MAX_SHORT_SIDE;
  return { mode: phone ? 'phone' : 'desktop', rotatePrompt: phone && height > width };
}

/** Primary pointer is a finger (falls back to touch points where media queries are missing). */
function coarsePointer(): boolean {
  if (typeof window.matchMedia === 'function') return window.matchMedia('(pointer: coarse)').matches;
  return navigator.maxTouchPoints > 0;
}

export function readDevice(): DeviceState {
  return classifyDevice(coarsePointer(), window.innerWidth, window.innerHeight);
}

/**
 * Shows or hides the rotate screen (a DOM overlay in index.html). While it
 * shows, the canvas takes no input; the match and animations are untouched.
 */
export function setRotatePrompt(on: boolean, canvas: HTMLCanvasElement): void {
  const el = document.getElementById('rotate');
  if (el) el.hidden = !on;
  canvas.style.pointerEvents = on ? 'none' : '';
}
