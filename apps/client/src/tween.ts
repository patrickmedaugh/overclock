// Tiny tween engine driven by an explicit tick(dtMs), so it can be unit
// tested without a renderer. The Pixi ticker feeds it in the app.
//
// Animations never lock input: when new events arrive mid-animation the
// renderer calls finishAll() to snap everything to its end state first
// ("tap to skip"), then starts the new tweens.

export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
} satisfies Record<string, Ease>;

/** Keys of T whose values are numbers (x, y, alpha, ...). */
export type NumericKeys<T> = { [K in keyof T]: T[K] extends number ? K : never }[keyof T] & string;

export interface TweenSpec<T extends object> {
  target: T;
  to: { [K in NumericKeys<T>]?: number };
  duration: number;
  delay?: number;
  ease?: Ease;
  onUpdate?: (t: number) => void;
  onComplete?: () => void;
  /**
   * Display object the tween animates. Once it is destroyed (e.g. the board
   * was rebuilt for the other seat) the tween is dropped without completing.
   */
  owner?: { readonly destroyed: boolean };
}

interface Running {
  target: object;
  from: Record<string, number>;
  to: Record<string, number>;
  duration: number;
  delay: number;
  elapsed: number;
  started: boolean;
  ease: Ease;
  onUpdate?: (t: number) => void;
  onComplete?: () => void;
  owner?: { readonly destroyed: boolean };
}

function dead(r: Running): boolean {
  return r.owner?.destroyed === true;
}

export class Tweens {
  private running: Running[] = [];

  get active(): boolean {
    return this.running.length > 0;
  }

  add<T extends object>(spec: TweenSpec<T>): void {
    const to: Record<string, number> = {};
    for (const [k, v] of Object.entries(spec.to)) {
      if (typeof v === 'number') to[k] = v;
    }
    this.running.push({
      target: spec.target,
      from: {},
      to,
      duration: Math.max(0, spec.duration),
      delay: Math.max(0, spec.delay ?? 0),
      elapsed: 0,
      started: false,
      ease: spec.ease ?? ease.outCubic,
      onUpdate: spec.onUpdate,
      onComplete: spec.onComplete,
      owner: spec.owner,
    });
  }

  /** Runs `fn` after `ms` (or at once when finishAll() skips ahead). Sequences chained steps. */
  after(ms: number, fn: () => void): void {
    this.add({ target: { t: 0 }, to: { t: 1 }, duration: ms, ease: ease.linear, onComplete: fn });
  }

  /** Stops tweens on `target` without completing them. */
  cancel(target: object): void {
    this.running = this.running.filter((r) => r.target !== target);
  }

  /** Advances all tweens by dt milliseconds. */
  tick(dt: number): void {
    if (this.running.length === 0) return;
    this.running = this.running.filter((r) => !dead(r));
    const done: Running[] = [];
    for (const r of this.running) {
      r.elapsed += dt;
      const local = r.elapsed - r.delay;
      if (local < 0) continue;
      if (!r.started) this.start(r);
      const t = r.duration === 0 ? 1 : Math.min(1, local / r.duration);
      this.applyAt(r, t);
      if (t >= 1) done.push(r);
    }
    if (done.length > 0) {
      this.running = this.running.filter((r) => !done.includes(r));
      for (const r of done) if (!dead(r)) r.onComplete?.();
    }
  }

  /** Snaps every running tween to its end state and fires completions. */
  finishAll(): void {
    // Completions may queue new tweens; loop until settled (bounded).
    for (let guard = 0; guard < 8 && this.running.length > 0; guard++) {
      const all = this.running.filter((r) => !dead(r));
      this.running = [];
      for (const r of all) {
        if (!r.started) this.start(r);
        this.applyAt(r, 1);
      }
      for (const r of all) if (!dead(r)) r.onComplete?.();
    }
  }

  private start(r: Running): void {
    r.started = true;
    const t = r.target as Record<string, unknown>;
    for (const k of Object.keys(r.to)) {
      const v = t[k];
      r.from[k] = typeof v === 'number' ? v : 0;
    }
  }

  private applyAt(r: Running, t: number): void {
    const e = t >= 1 ? 1 : r.ease(t);
    const target = r.target as Record<string, number>;
    for (const [k, to] of Object.entries(r.to)) {
      const from = r.from[k] ?? to;
      target[k] = from + (to - from) * e;
    }
    r.onUpdate?.(t);
  }
}
