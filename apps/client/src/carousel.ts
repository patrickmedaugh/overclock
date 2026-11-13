// S-05-3 (owner answer A): while a hand card is held so it zooms, up to two
// neighbours each side show smaller and dimmed behind the big card. When the
// zoom moves to another card they slide past (a short ui tween that never
// blocks input), while the big face itself changes in the same frame.
import { Container } from 'pixi.js';
import type { Box } from './hook-types';
import { ease, type Tweens } from './tween';

import { CAROUSEL_REACH, CAROUSEL_SLIDE_MS, carouselMoves, carouselPose } from './carouselMath';

export { CAROUSEL_REACH, CAROUSEL_SLIDE_MS, carouselMoves, carouselPose, listIndex } from './carouselMath';

/** A face for the carousel; `full`: the zoom face (else a stand-in until it is drawn). */
export interface CarouselFace {
  root: Container;
  full: boolean;
}

interface Item {
  index: number;
  cardId: string;
  /** Posed (position / scale / alpha / tint). */
  holder: Container;
  face: Container;
  full: boolean;
  /** Current offset from the zoomed card (tweened). */
  o: number;
  /** Where it is going. */
  to: number;
}

export interface CarouselSnapshot {
  cardId: string;
  /** Hand / list index. */
  index: number;
  /** Final offset from the zoomed card (-2..2). */
  offset: number;
  /** Where it is drawn now (CSS px). */
  box: Box;
  /** False while a stand-in shows (the zoom face is still being drawn). */
  full: boolean;
}

const gray = (b: number) => {
  const v = Math.round(Math.max(0, Math.min(1, b)) * 255);
  return (v << 16) | (v << 8) | v;
};

export class Carousel {
  readonly root = new Container();
  private items = new Map<number, Item>();
  private ids: readonly string[] = [];

  /**
   * `center`: the zoomed card's center; `w`/`h`: its size. `face(cardId)` makes
   * a face (a sprite of the baked zoom face when ready).
   */
  constructor(
    private readonly cx: number,
    private readonly cy: number,
    private readonly w: number,
    private readonly h: number,
    private readonly ui: Tweens,
    private readonly face: (cardId: string) => CarouselFace,
  ) {
    this.root.label = 'zoom:carousel';
    this.root.eventMode = 'none';
    this.root.sortableChildren = true;
  }

  /**
   * Shows the neighbours of `next` in `ids`. `prev`: the index the zoom showed
   * before (they slide over `CAROUSEL_SLIDE_MS`), or null (placed at once).
   * `slide` false: they jump to their places (drawing frames is slow here).
   */
  show(ids: readonly string[], next: number, prev: number | null, slide = true): void {
    this.ids = ids;
    const moves = carouselMoves(prev, next, ids.length);
    const keep = new Set(moves.map((m) => m.index));
    for (const [i, item] of this.items) if (!keep.has(i)) this.drop(item);
    for (const m of moves) {
      const cardId = ids[m.index];
      if (cardId === undefined) continue;
      let item = this.items.get(m.index);
      if (item && item.cardId !== cardId) {
        this.drop(item);
        item = undefined;
      }
      if (!item) {
        item = this.make(m.index, cardId, m.from);
        this.items.set(m.index, item);
      }
      this.ui.cancel(item);
      item.to = m.to;
      const leaving = Math.abs(m.to) > CAROUSEL_REACH;
      if (prev === null || !slide) {
        item.o = m.to;
        if (leaving) this.drop(item);
        else this.pose(item);
        continue;
      }
      const it = item;
      this.ui.add({
        target: it,
        to: { o: m.to },
        duration: CAROUSEL_SLIDE_MS,
        ease: ease.outCubic,
        owner: it.holder,
        onUpdate: () => this.pose(it),
        onComplete: () => {
          if (leaving) this.drop(it);
        },
      });
    }
  }

  /** The zoom face of `cardId` is drawn now: swap it in for its stand-ins. */
  upgrade(cardId: string): boolean {
    let changed = false;
    for (const item of this.items.values()) {
      if (item.full || item.cardId !== cardId || item.holder.destroyed) continue;
      const f = this.face(cardId);
      if (!f.full) {
        f.root.destroy({ children: true });
        continue;
      }
      item.face.destroy({ children: true });
      item.face = f.root;
      item.full = true;
      item.holder.addChild(f.root);
      changed = true;
    }
    return changed;
  }

  /** Card ids still showing a stand-in. */
  pending(): string[] {
    return [...this.items.values()].filter((i) => !i.full).map((i) => i.cardId);
  }

  snapshot(): CarouselSnapshot[] {
    return [...this.items.values()]
      .filter((i) => Math.abs(i.to) <= CAROUSEL_REACH && !i.holder.destroyed)
      .sort((a, b) => a.to - b.to)
      .map((i) => {
        const s = i.holder.scale.x;
        const width = this.w * s;
        const height = this.h * s;
        return {
          cardId: i.cardId,
          index: i.index,
          offset: i.to,
          box: { x: i.holder.x - width / 2, y: i.holder.y - height / 2, width, height },
          full: i.full,
        };
      });
  }

  /** The list it shows (for tests and the board). */
  get cardIds(): readonly string[] {
    return this.ids;
  }

  destroy(): void {
    for (const item of this.items.values()) this.ui.cancel(item);
    this.items.clear();
    if (!this.root.destroyed) this.root.destroy({ children: true });
  }

  private make(index: number, cardId: string, o: number): Item {
    const holder = new Container();
    const f = this.face(cardId);
    holder.addChild(f.root);
    this.root.addChild(holder);
    const item: Item = { index, cardId, holder, face: f.root, full: f.full, o, to: o };
    this.pose(item);
    return item;
  }

  private drop(item: Item): void {
    this.ui.cancel(item);
    if (this.items.get(item.index) === item) this.items.delete(item.index);
    if (!item.holder.destroyed) item.holder.destroy({ children: true });
  }

  private pose(item: Item): void {
    if (item.holder.destroyed) return;
    const p = carouselPose(item.o);
    item.holder.position.set(this.cx + p.dx * this.w, this.cy);
    item.holder.scale.set(p.scale);
    item.holder.alpha = p.alpha;
    item.holder.tint = gray(p.brightness);
    // Nearer cards on top; all stay under the zoomed card (a separate layer).
    item.holder.zIndex = 100 - Math.round(Math.abs(item.o) * 10);
  }
}
