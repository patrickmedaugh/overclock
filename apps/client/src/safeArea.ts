// Safe-area insets: the parts of the screen covered by a notch, status bar or
// gesture bar. CSS is the only place browsers (and Capacitor's WebView)
// expose them, so index.html has a hidden #safe-probe whose padding is
// env(safe-area-inset-*); we read the computed padding back.
import type { Insets } from './hook-types';

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

function px(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function readSafeArea(): Insets {
  const probe = document.getElementById('safe-probe');
  if (!probe) return NO_INSETS;
  const cs = getComputedStyle(probe);
  return {
    top: px(cs.paddingTop),
    right: px(cs.paddingRight),
    bottom: px(cs.paddingBottom),
    left: px(cs.paddingLeft),
  };
}
