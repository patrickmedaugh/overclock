// Board widgets: counters, piles, the End turn button, the memory counter.
// Each is built once for a size and then only updated (numbers, positions),
// so a turn change does not create new text objects.
import type { Side } from '@overclock/engine';
import { getCard } from '@overclock/cards';
import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { createCardBack, createCardFace, glowRoundRect } from './cardFace';
import { centeredBox } from './geometry';
import type { Box } from './hook-types';
import { TERMS, scoredPileText } from './terms';
import { sideColor, theme, timing } from './theme';
import { ease, type Tweens } from './tween';

/** Shrinks a text (never grows it) so it fits `maxW` (and `maxH`, if given). */
export function fitText(t: Text, maxW: number, maxH = Infinity): void {
  t.scale.set(1);
  const k = Math.min(1, maxW / Math.max(1, t.width), maxH / Math.max(1, t.height));
  if (k < 1) t.scale.set(k);
}

/** Moves a centered widget's root to the center of `b`. */
export function placeAt(root: Container, b: Box): void {
  root.position.set(b.x + b.width / 2, b.y + b.height / 2);
}

/**
 * A glowing pill showing one number (credits or clicks). Compact pills (the
 * opponent's header chips) show the icon and number only.
 */
export class Counter {
  readonly root = new Container();
  private readonly valueText: Text;
  private readonly inner = new Container();
  private readonly glow = new Graphics();
  private value: number | null = null;
  readonly w: number;
  readonly h: number;

  constructor(
    private readonly ui: Tweens,
    size: { width: number; height: number },
    side: Side,
    kind: 'credits' | 'clicks',
    scale: number,
  ) {
    const color = kind === 'credits' ? theme.credit : sideColor(side);
    const { width: w, height: h } = size;
    const compact = h < 34;
    this.w = w;
    this.h = h;
    this.root.hitArea = new Rectangle(-w / 2, -h / 2, w, h);
    this.root.label = `${kind}:${side}`;
    this.root.addChild(this.inner);
    const r = h / 2;
    this.glow.roundRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, r + 3).stroke({ width: Math.max(1.5, 2 * scale), color, alpha: 0.75 });
    this.glow.alpha = 0;
    const g = new Graphics();
    g.roundRect(-w / 2, -h / 2, w, h, r).fill({ color: 0x000000, alpha: 0.55 });
    if (compact) g.roundRect(-w / 2, -h / 2, w, h, r).stroke({ width: 1, color: sideColor(side), alpha: 0.7 });
    else glowRoundRect(g, -w / 2, -h / 2, w, h, r, sideColor(side), Math.max(1, 1.5 * scale), 0.8);
    // Icon.
    const ix = -w / 2 + h * 0.5;
    const ir = h * (compact ? 0.3 : 0.24);
    const lw = Math.max(1, (compact ? 1.2 : 1.5) * scale);
    if (kind === 'credits') {
      const pts: number[] = [];
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        pts.push(ix + Math.cos(a) * ir, Math.sin(a) * ir);
      }
      g.poly(pts).fill({ color, alpha: 0.25 }).stroke({ width: lw, color });
      g.circle(ix, 0, ir * 0.35).fill({ color });
    } else {
      // A "clock tick": ring with a hand.
      g.circle(ix, 0, ir).fill({ color, alpha: 0.2 }).stroke({ width: lw, color });
      g.moveTo(ix, 0).lineTo(ix, -ir * 0.7).stroke({ width: Math.max(1, (compact ? 1.4 : 2) * scale), color: theme.text });
      g.moveTo(ix, 0).lineTo(ix + ir * 0.5, 0).stroke({ width: Math.max(1, (compact ? 1.4 : 2) * scale), color: theme.text });
    }
    this.inner.addChild(this.glow, g);

    const textX = -w / 2 + h * (compact ? 1.0 : 0.95);
    this.valueText = new Text({
      text: '0',
      style: { fontFamily: theme.monoFamily, fontSize: h * (compact ? 0.7 : 0.42), fontWeight: '700', fill: theme.text },
    });
    this.valueText.anchor.set(0, 0.5);
    this.valueText.position.set(textX, compact ? 0 : -h * 0.08);
    this.inner.addChild(this.valueText);
    const word = kind === 'credits' ? TERMS.credits : TERMS.clicks;
    const label = new Text({
      text: compact ? word.toLowerCase() : word.toUpperCase(),
      style: { fontFamily: theme.monoFamily, fontSize: compact ? Math.max(8, h * 0.5) : Math.max(8, h * 0.17), fill: color, letterSpacing: compact ? 0 : 1 },
    });
    if (compact) {
      // "5 credits": the word follows the number, shrunk to the chip.
      label.anchor.set(0, 0.5);
      label.position.set(textX + h * 0.9, 0);
      fitText(label, w / 2 - label.x - h * 0.3);
      this.compactLabel = label;
    } else {
      label.anchor.set(0, 0.5);
      label.position.set(textX, h * 0.27);
      fitText(label, w / 2 - textX - 6);
    }
    this.inner.addChild(label);
  }

  private readonly compactLabel: Text | null = null;

  get text(): string {
    return this.valueText.text;
  }

  /** The pill as drawn now (scaled while it pops, moved while it shakes). */
  box(): Box {
    return centeredBox(this.root, this.w, this.h, this.inner.scale.x, this.inner.scale.y, this.inner.x);
  }

  /**
   * Where the pill rests: its box without the 200 ms pop (x1.18) or the 260 ms "no clicks" shake.
   * The layout snapshot reports this (the toast is placed against resting boxes too), so a layout
   * check never depends on whether a frame ran since the number changed.
   */
  restBox(): Box {
    return centeredBox(this.root, this.w, this.h);
  }

  setActionable(on: boolean): void {
    this.glow.alpha = on ? 1 : 0;
  }

  /** Returns true when the number changed and popped. */
  set(value: number, animate: boolean): boolean {
    const changed = this.value !== null && this.value !== value;
    this.value = value;
    if (this.valueText.text !== String(value)) {
      this.valueText.text = String(value);
      if (this.compactLabel) this.compactLabel.x = this.valueText.x + this.valueText.width + this.h * 0.25;
    }
    if (animate && changed) {
      this.ui.cancel(this.inner.scale);
      this.inner.scale.set(1.18);
      this.ui.add({ target: this.inner.scale, to: { x: 1, y: 1 }, duration: timing.creditPop, ease: ease.outBack, owner: this.inner });
      return true;
    }
    return false;
  }

  shake(): void {
    this.ui.cancel(this.inner);
    this.inner.x = 0;
    const amp = 6;
    this.ui.add({
      target: this.inner,
      to: { x: 0 },
      duration: 260,
      ease: ease.linear,
      owner: this.inner,
      onUpdate: (t) => {
        this.inner.x = t >= 1 ? 0 : Math.sin(t * Math.PI * 6) * amp * (1 - t);
      },
    });
  }
}

/** A small name tag across the top of a pile ("STACK"). */
function nameTag(name: string, w: number, h: number, color: number, scale: number): Container {
  const c = new Container();
  const th = Math.max(11, Math.round(13 * scale));
  const g = new Graphics();
  g.roundRect(-w / 2 + 2, -h / 2 + 2, w - 4, th, Math.min(4, th / 2)).fill({ color: 0x000000, alpha: 0.75 });
  const t = new Text({ text: name.toUpperCase(), style: { fontFamily: theme.monoFamily, fontSize: th * 0.7, fontWeight: '700', fill: color, letterSpacing: 0.5 } });
  t.anchor.set(0.5);
  t.position.set(0, -h / 2 + 2 + th / 2);
  fitText(t, w - 8);
  c.addChild(g, t);
  return c;
}

/** Face-down pile (deck, or the HQ marker) with a count badge. */
export class DeckPile {
  readonly root = new Container();
  private readonly countText: Text;
  private readonly glow = new Graphics();
  private readonly pile = new Container();
  private readonly w: number;
  private readonly h: number;

  constructor(size: { width: number; height: number }, side: Side, scale: number, name: string | null, label: string) {
    const { width: w, height: h } = size;
    this.w = w;
    this.h = h;
    this.root.hitArea = new Rectangle(-w / 2, -h / 2, w, h);
    this.root.label = label;
    const color = sideColor(side);
    const r = Math.max(3, w * 0.08);
    this.glow.roundRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, r + 2).stroke({ width: 3 * scale, color, alpha: 0.5 });
    this.glow.alpha = 0;
    // Two offset backs suggest a stack; offsets stay inside the box.
    const off = Math.max(1, Math.round(2 * scale));
    const cw = w - off * 2;
    const ch = h - off * 2;
    for (let i = 2; i >= 0; i--) {
      const back = createCardBack(side, cw, ch);
      back.position.set(-off + i * off, -off + i * off);
      back.alpha = i === 0 ? 1 : 0.55;
      this.pile.addChild(back);
    }
    const slot = new Graphics();
    slot.roundRect(-w / 2, -h / 2, w, h, r).fill({ color: 0x000000, alpha: 0.35 }).stroke({ width: 1, color, alpha: 0.45 });
    this.root.addChild(slot, this.glow, this.pile);
    if (name) this.root.addChild(nameTag(name, w, h, color, scale));

    const badgeH = Math.max(15, Math.min(20 * scale, h * 0.28));
    const badge = new Graphics();
    badge.roundRect(-w * 0.38, h / 2 - badgeH - 3 * scale, w * 0.76, badgeH, badgeH / 2).fill({ color: 0x000000, alpha: 0.8 }).stroke({ width: 1, color });
    this.countText = new Text({
      text: '0',
      style: { fontFamily: theme.monoFamily, fontSize: badgeH * 0.7, fontWeight: '700', fill: theme.text },
    });
    this.countText.anchor.set(0.5);
    this.countText.position.set(0, h / 2 - badgeH / 2 - 3 * scale);
    this.root.addChild(badge, this.countText);
  }

  get text(): string {
    return this.countText.text;
  }

  box(): Box {
    return centeredBox(this.root, this.w, this.h);
  }

  setCount(n: number): void {
    if (this.countText.text !== String(n)) this.countText.text = String(n);
    this.pile.visible = n > 0;
  }

  /** Glow when the viewer can act on this pile (from view.legalActions). */
  setActionable(on: boolean): void {
    this.glow.alpha = on ? 1 : 0;
  }
}

/** Discard pile: empty slot with its name, top card face up, or a back (face down to the viewer). */
export class DiscardPile {
  readonly root = new Container();
  private readonly inner = new Container();
  private readonly topLayer = new Container();
  private readonly countText: Text;
  private readonly emptyText: Text;
  private key = '';
  private readonly w: number;
  private readonly h: number;
  private readonly badgeTextW: number;

  constructor(
    size: { width: number; height: number },
    private readonly side: Side,
    scale: number,
    name: string,
  ) {
    const { width: w, height: h } = size;
    this.w = w;
    this.h = h;
    this.root.label = `discard:${side}`;
    this.root.addChild(this.inner);
    const color = sideColor(side);
    const slot = new Graphics();
    const r = Math.max(3, w * 0.08);
    slot.roundRect(-w / 2, -h / 2, w, h, r).fill({ color: 0x000000, alpha: 0.35 }).stroke({ width: 1, color, alpha: 0.45 });
    this.emptyText = new Text({
      text: name.toUpperCase(),
      style: { fontFamily: theme.monoFamily, fontSize: Math.max(7, 9 * scale), fill: theme.textDim, letterSpacing: 0.5 },
    });
    this.emptyText.anchor.set(0.5);
    this.emptyText.position.set(0, h * 0.08);
    fitText(this.emptyText, w - 6);
    // Count chip in the top-right corner, over the art window only: a face-up top
    // card keeps its name and type (lower half) readable. The cost sits top-left.
    const badgeH = Math.max(15, Math.min(18 * scale, h * 0.26));
    const badgeW = Math.max(badgeH * 1.5, w * 0.42);
    const inset = Math.max(2, 3 * scale);
    const bx = w / 2 - inset - badgeW;
    const by = -h / 2 + inset;
    const badge = new Graphics();
    badge.roundRect(bx, by, badgeW, badgeH, badgeH / 2).fill({ color: 0x000000, alpha: 0.85 }).stroke({ width: 1, color: theme.textDim });
    this.countText = new Text({
      text: '0',
      style: { fontFamily: theme.monoFamily, fontSize: badgeH * 0.7, fontWeight: '700', fill: theme.text },
    });
    this.countText.anchor.set(0.5);
    this.countText.position.set(bx + badgeW / 2, by + badgeH / 2);
    this.badgeTextW = badgeW - badgeH * 0.4;
    this.inner.addChild(slot, this.emptyText, this.topLayer, badge, this.countText);
  }

  get text(): string {
    return this.countText.text;
  }

  box(): Box {
    return centeredBox(this.root, this.w, this.h, this.inner.scale.x, this.inner.scale.y);
  }

  /** `pile` is the view's discard list (bottom = 0); an entry is null when face down to the viewer. */
  set(count: number, pile: readonly (string | null)[]): void {
    if (this.countText.text !== String(count)) {
      this.countText.text = String(count);
      fitText(this.countText, this.badgeTextW);
    }
    const topId = pile[pile.length - 1] ?? null;
    const key = `${count}:${topId ?? '#'}`;
    if (key === this.key) return;
    this.key = key;
    for (const c of this.topLayer.removeChildren()) c.destroy({ children: true });
    this.emptyText.visible = count === 0;
    if (count === 0) return;
    const def = topId ? getCard(topId) : undefined;
    const card = def ? createCardFace(def, this.w, this.h, 'small') : createCardBack(this.side, this.w, this.h);
    card.alpha = def ? 0.9 : 1;
    this.topLayer.addChild(card);
  }

  pop(ui: Tweens): void {
    ui.cancel(this.inner.scale);
    this.inner.scale.set(1.15);
    ui.add({ target: this.inner.scale, to: { x: 1, y: 1 }, duration: 220, ease: ease.outBack, owner: this.inner });
  }
}

export type ButtonMode = 'end' | 'confirm' | 'play';

/** The End turn button; doubles as the discard picker's Confirm, and as the Play button. */
export class ActionButton {
  readonly root = new Container();
  private readonly g = new Graphics();
  private readonly label: Text;
  private readonly inner = new Container();
  mode: ButtonMode = 'end';
  enabled = false;
  glowing = false;
  private drawnKey = '';
  private readonly w: number;
  private readonly h: number;

  constructor(
    size: { width: number; height: number },
    public color: number,
    private readonly scale: number,
    label: string,
  ) {
    this.w = size.width;
    this.h = size.height;
    this.root.hitArea = new Rectangle(-this.w / 2, -this.h / 2, this.w, this.h);
    this.root.label = label;
    this.label = new Text({
      text: '',
      style: {
        fontFamily: theme.fontFamily,
        fontSize: Math.max(13, Math.round(16 * scale)),
        fontWeight: '800',
        fill: theme.text,
        letterSpacing: 0.5,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: this.w - 10,
      },
    });
    this.label.anchor.set(0.5);
    this.inner.addChild(this.g, this.label);
    this.root.addChild(this.inner);
  }

  get text(): string {
    return this.label.text;
  }

  box(): Box {
    return centeredBox(this.root, this.w, this.h, this.inner.scale.x, this.inner.scale.y);
  }

  set(mode: ButtonMode, enabled: boolean, glowing: boolean, ui: Tweens | null, text?: string): void {
    const wasGlowing = this.glowing;
    this.mode = mode;
    this.enabled = enabled;
    this.glowing = glowing;
    const label = text ?? (mode === 'confirm' ? 'Confirm' : TERMS.endTurn);
    const key = `${mode}:${enabled}:${glowing}:${this.color}:${label}`;
    if (key === this.drawnKey) return;
    this.drawnKey = key;
    const { w, h } = this;
    const r = Math.min(14 * this.scale, h / 2);
    const accent = mode === 'confirm' ? theme.warn : mode === 'play' ? theme.credit : this.color;
    const g = this.g;
    g.clear();
    if (glowing) {
      // Bright and filled: "you're done, tap me".
      for (let i = 4; i >= 1; i--) g.roundRect(-w / 2 - i * 3, -h / 2 - i * 3, w + i * 6, h + i * 6, r + i * 3).fill({ color: accent, alpha: 0.07 });
      g.roundRect(-w / 2, -h / 2, w, h, r).fill({ color: accent, alpha: 0.95 });
      g.roundRect(-w / 2, -h / 2, w, h, r).stroke({ width: 2, color: 0xffffff, alpha: 0.85 });
      this.label.style.fill = 0x0a0612;
    } else if (enabled) {
      g.roundRect(-w / 2, -h / 2, w, h, r).fill({ color: 0x000000, alpha: 0.6 });
      glowRoundRect(g, -w / 2, -h / 2, w, h, r, accent, Math.max(1.5, 2 * this.scale), 0.6);
      this.label.style.fill = accent;
    } else {
      g.roundRect(-w / 2, -h / 2, w, h, r).fill({ color: 0x000000, alpha: 0.5 }).stroke({ width: 1, color: theme.textDim, alpha: 0.5 });
      this.label.style.fill = theme.textDim;
    }
    this.label.text = label;
    fitText(this.label, w - 8, h - 4);
    if (ui && glowing && !wasGlowing) {
      ui.cancel(this.inner.scale);
      this.inner.scale.set(1.12);
      ui.add({ target: this.inner.scale, to: { x: 1, y: 1 }, duration: 260, ease: ease.outBack, owner: this.inner });
    }
  }
}

/** "Memory 2/4" with one pip per unit. Read-only. */
export class MemoryCounter {
  readonly root = new Container();
  private readonly valueText: Text;
  private readonly pips = new Graphics();
  private key = '';
  private readonly w: number;
  private readonly h: number;

  constructor(size: { width: number; height: number }, scale: number) {
    const { width: w, height: h } = size;
    this.w = w;
    this.h = h;
    this.root.label = 'memory';
    this.root.eventMode = 'none';
    const g = new Graphics();
    const r = Math.max(4, w * 0.1);
    g.roundRect(-w / 2, -h / 2, w, h, Math.min(r, h / 2)).fill({ color: 0x000000, alpha: 0.5 }).stroke({ width: 1, color: theme.runner, alpha: 0.55 });
    // Sprint 10: in the stats column (Memory over Link and Tagged) it is short: title over the
    // number, no pips.
    this.compact = h < 44;
    const title = new Text({
      text: TERMS.memory.toUpperCase(),
      style: { fontFamily: theme.monoFamily, fontSize: this.compact ? Math.max(7, Math.round(h * 0.28)) : Math.max(8, Math.round(9 * scale)), fill: theme.runner, letterSpacing: 0.5 },
    });
    title.anchor.set(0.5, 0);
    title.position.set(0, -h / 2 + (this.compact ? 1 : 4));
    fitText(title, w - 6);
    this.valueText = new Text({
      text: '',
      style: {
        fontFamily: theme.monoFamily,
        fontSize: this.compact ? Math.max(10, Math.round(h * 0.5)) : Math.max(13, Math.round(Math.min(18 * scale, h * 0.3))),
        fontWeight: '700',
        fill: theme.text,
      },
    });
    this.valueText.anchor.set(0.5);
    this.valueText.position.set(0, this.compact ? h * 0.18 : -h * 0.02);
    this.root.addChild(g, title, this.valueText, this.pips);
  }

  private readonly compact: boolean;

  /** On-screen text, e.g. "Memory 2/4". */
  get text(): string {
    return `${TERMS.memory} ${this.valueText.text}`;
  }

  box(): Box {
    return centeredBox(this.root, this.w, this.h);
  }

  set(used: number, limit: number): void {
    const key = `${used}/${limit}`;
    if (key === this.key) return;
    this.key = key;
    this.valueText.text = key;
    fitText(this.valueText, this.w - 8, this.compact ? this.h * 0.62 : Infinity);
    const g = this.pips;
    g.clear();
    if (this.compact) return;
    const n = Math.max(1, limit);
    const pw = Math.min(10, (this.w - 12) / n - 3);
    const ph = Math.max(5, this.h * 0.1);
    const total = n * pw + (n - 1) * 3;
    const y = this.h / 2 - ph - 6;
    for (let i = 0; i < n; i++) {
      const x = -total / 2 + i * (pw + 3);
      g.roundRect(x, y, pw, ph, 2).fill({ color: i < used ? theme.runner : 0x000000, alpha: i < used ? 0.9 : 0.6 }).stroke({ width: 1, color: theme.runner, alpha: 0.6 });
    }
  }
}

/** A glowing outline over a lit target, with its price pill. */
export class TargetMarker {
  readonly root = new Container();
  private readonly g = new Graphics();
  private readonly pill = new Graphics();
  private readonly label: Text;
  private drawn = '';
  private main = '';
  /** S-07-2/3: why a dimmed button would be refused, shown under its label ("Not enough credits"). */
  note = '';
  box: Box = { x: 0, y: 0, width: 0, height: 0 };

  constructor(scale: number) {
    this.label = new Text({
      text: '',
      style: {
        fontFamily: theme.fontFamily,
        fontSize: Math.max(10, Math.round(11 * scale)),
        fontWeight: '800',
        fill: 0x140a00,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: 100,
        lineHeight: Math.max(11, Math.round(12 * scale)),
      },
    });
    this.label.anchor.set(0.5);
    this.root.addChild(this.g, this.pill, this.label);
  }

  get text(): string {
    return this.main;
  }

  /** S-07-6: a dragged card is over this place: it swells a little. */
  setHover(on: boolean): void {
    this.root.scale.set(on ? 1.05 : 1);
  }

  /** `at` is where the price pill goes, relative to the box: 'top' | 'bottom' | 'center'. */
  set(b: Box, text: string, lit: boolean, at: 'top' | 'bottom' | 'center', note = ''): void {
    this.setHover(false);
    this.box = { ...b };
    this.main = text;
    this.note = note;
    this.root.position.set(b.x + b.width / 2, b.y + b.height / 2);
    this.root.hitArea = new Rectangle(-b.width / 2, -b.height / 2, b.width, b.height);
    const key = `${b.width}x${b.height}:${text}:${note}:${lit}:${at}`;
    if (key === this.drawn) return;
    this.drawn = key;
    const color = lit ? theme.credit : theme.textDim;
    const { width: w, height: h } = b;
    const r = Math.min(8, w * 0.1);
    this.g.clear();
    this.g.roundRect(-w / 2, -h / 2, w, h, r).fill({ color, alpha: lit ? 0.14 : 0.08 });
    glowRoundRect(this.g, -w / 2, -h / 2, w, h, r, color, 2, lit ? 1.2 : 0.5);
    this.label.style.wordWrapWidth = Math.max(30, w - 10);
    this.label.text = note ? `${text}\n${note}` : text;
    this.label.scale.set(1);
    const lw = Math.min(this.label.width, w - 6);
    const lh = this.label.height;
    const k = Math.min(1, (w - 8) / Math.max(1, this.label.width), (h - 6) / Math.max(1, lh + 6));
    this.label.scale.set(k);
    const pw = lw * (k < 1 ? 1 : 1) + 8;
    const ph = lh * k + 6;
    const y = at === 'top' ? -h / 2 + ph / 2 + 4 : at === 'bottom' ? h / 2 - ph / 2 - 4 : 0;
    this.label.position.set(0, y);
    this.pill.clear();
    this.pill.roundRect(-Math.min(pw, w - 4) / 2, y - ph / 2, Math.min(pw, w - 4), ph, Math.min(6, ph / 2)).fill({ color, alpha: 0.95 });
  }
}

/**
 * A big decision button (run panel, Run): a rounded box with a wrapped label.
 * Lit = the engine would accept it; dim = shown with its price, refused with a
 * hint when tapped (the engine judges every tap).
 */
export class PanelButton {
  readonly root = new Container();
  private readonly g = new Graphics();
  private readonly label: Text;
  private readonly inner = new Container();
  private drawn = '';
  box: Box = { x: 0, y: 0, width: 0, height: 0 };
  lit = false;

  constructor(
    private readonly scale: number,
    name: string,
  ) {
    this.root.label = name;
    this.label = new Text({
      text: '',
      style: {
        fontFamily: theme.fontFamily,
        fontSize: Math.max(12, Math.round(14 * Math.min(scale, 1.15))),
        fontWeight: '800',
        fill: theme.text,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: 100,
        lineHeight: Math.max(14, Math.round(16 * Math.min(scale, 1.15))),
      },
    });
    this.label.anchor.set(0.5);
    this.inner.addChild(this.g, this.label);
    this.root.addChild(this.inner);
  }

  get text(): string {
    return this.label.text;
  }

  /** The label's text size as drawn, after any shrink to fit (px). */
  get fontPx(): number {
    return (this.label.style.fontSize as number) * this.label.scale.y;
  }

  /**
   * `glow`: filled and bright (e.g. Run while servers are lit). `big`: a large label
   * (Sprint 9: the bid control's − and +). Sprint 11: `text` may be a ladder of ever
   * shorter labels (`labelLadder`): the first that fits at `minPx` or more is drawn
   * (the last one, shrunk, if none does).
   */
  set(b: Box, text: string | readonly string[], lit: boolean, color: number, glow = false, big = false, minPx = 0): void {
    this.box = { ...b };
    this.lit = lit;
    placeAt(this.root, b);
    const { width: w, height: h } = b;
    this.root.hitArea = new Rectangle(-w / 2, -h / 2, w, h);
    const ladder = typeof text === 'string' ? [text] : text;
    const key = `${w}x${h}:${ladder.join('|')}:${lit}:${color}:${glow}:${big}:${minPx}`;
    if (key === this.drawn) return;
    this.drawn = key;
    const base = Math.max(12, Math.round(14 * Math.min(this.scale, 1.15)));
    this.label.style.fontSize = big ? Math.round(Math.max(base * 1.9, h * 0.5)) : base;
    const r = Math.min(12 * this.scale, h / 2, 14);
    const g = this.g;
    g.clear();
    if (glow) {
      g.roundRect(-w / 2, -h / 2, w, h, r).fill({ color, alpha: 0.95 });
      g.roundRect(-w / 2, -h / 2, w, h, r).stroke({ width: 2, color: 0xffffff, alpha: 0.85 });
      this.label.style.fill = 0x0a0612;
    } else if (lit) {
      g.roundRect(-w / 2, -h / 2, w, h, r).fill({ color: 0x000000, alpha: 0.7 });
      glowRoundRect(g, -w / 2, -h / 2, w, h, r, color, Math.max(1.5, 2 * this.scale), 0.7);
      this.label.style.fill = theme.text;
    } else {
      g.roundRect(-w / 2, -h / 2, w, h, r).fill({ color: 0x000000, alpha: 0.55 }).stroke({ width: 1, color: theme.textDim, alpha: 0.6 });
      this.label.style.fill = theme.textDim;
    }
    this.label.style.wordWrapWidth = Math.max(30, w - 10);
    const fits = (i: number): boolean => {
      this.label.text = ladder[i]!;
      fitText(this.label, w - 8, h - 4);
      return this.fontPx >= minPx - 0.01;
    };
    // The first rung that fits (labels only get shorter down the ladder): a binary search.
    let lo = 0;
    let hi = ladder.length - 1;
    if (ladder.length > 1 && !fits(0)) {
      lo = 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (fits(mid)) hi = mid;
        else lo = mid + 1;
      }
    }
    fits(lo);
  }

  /** A quick pop when it appears (run step changes). */
  pop(ui: Tweens): void {
    ui.cancel(this.inner.scale);
    this.inner.scale.set(0.9);
    ui.add({ target: this.inner.scale, to: { x: 1, y: 1 }, duration: 160, ease: ease.outBack, owner: this.inner });
  }
}

/** "Runner 2 points": a small read-only pill in the side's color. */
export class ScorePill {
  readonly root = new Container();
  private readonly g = new Graphics();
  private readonly label: Text;
  private readonly inner = new Container();
  private drawn = '';
  box: Box = { x: 0, y: 0, width: 0, height: 0 };

  constructor(private readonly side: Side) {
    this.root.label = `score:${side}`;
    this.root.eventMode = 'none';
    this.label = new Text({ text: '', style: { fontFamily: theme.monoFamily, fontSize: 11, fontWeight: '700', fill: sideColor(side) } });
    this.label.anchor.set(0.5);
    this.inner.addChild(this.g, this.label);
    this.root.addChild(this.inner);
  }

  get text(): string {
    return this.label.text;
  }

  set(b: Box, text: string, points: number): void {
    this.box = { ...b };
    placeAt(this.root, b);
    // S-05-1: held to read the scored agendas; a thin pill still gets a 44px-tall touch target.
    const hitH = Math.max(44, b.height);
    this.root.hitArea = new Rectangle(-b.width / 2, -hitH / 2, b.width, hitH);
    const key = `${b.width}x${b.height}:${text}:${points > 0}`;
    if (key === this.drawn) return;
    this.drawn = key;
    const { width: w, height: h } = b;
    const color = sideColor(this.side);
    this.g.clear();
    this.g.roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: points > 0 ? color : 0x000000, alpha: points > 0 ? 0.22 : 0.5 }).stroke({ width: 1, color, alpha: 0.8 });
    this.label.style.fontSize = Math.max(9, Math.round(h * 0.68));
    this.label.style.fill = points > 0 ? theme.text : color;
    this.label.text = text;
    fitText(this.label, w - 8, h);
  }

  pop(ui: Tweens): void {
    ui.cancel(this.inner.scale);
    this.inner.scale.set(1.35);
    ui.add({ target: this.inner.scale, to: { x: 1, y: 1 }, duration: 260, ease: ease.outBack, owner: this.inner });
  }
}

/**
 * A small status note by a side's credits (S-04-4): the Corp's black "Bad
 * publicity 1" mark, the Runner's "+1 for this run". Hidden when there is
 * nothing to say. `align`: where in its slot the note sits.
 */
export class StatusTag {
  readonly root = new Container();
  private readonly g = new Graphics();
  private readonly label: Text;
  private readonly inner = new Container();
  private drawn = '';
  /** The note as drawn (CSS px); zero-size while hidden. */
  box: Box = { x: 0, y: 0, width: 0, height: 0 };

  constructor(
    name: string,
    private readonly tone: 'bad' | 'run',
  ) {
    this.root.label = name;
    this.root.eventMode = 'none';
    this.label = new Text({ text: '', style: { fontFamily: theme.fontFamily, fontSize: 11, fontWeight: '800', fill: tone === 'bad' ? theme.text : theme.credit } });
    this.label.anchor.set(0.5);
    this.inner.addChild(this.g, this.label);
    this.root.addChild(this.inner);
    this.root.visible = false;
  }

  get text(): string {
    return this.root.visible ? this.label.text : '';
  }

  /** Sprint 9: true while the note says the Runner is tagged (red, bold). */
  tagged = false;

  /** `tagged` (Sprint 9): drawn red ("Tagged 1 · Hand max 4"). */
  set(slot: Box, text: string | null, align: 'center' | 'right', tagged = false): void {
    if (text === null) {
      this.root.visible = false;
      this.box = { x: 0, y: 0, width: 0, height: 0 };
      this.drawn = '';
      this.tagged = false;
      return;
    }
    this.root.visible = true;
    this.tagged = tagged;
    const h = slot.height;
    const key = `${slot.width}x${h}:${text}:${tagged}`;
    if (key !== this.drawn) {
      this.drawn = key;
      this.label.style.fontSize = Math.max(9, Math.round(h * 0.72));
      this.label.style.fill = tagged ? theme.text : this.tone === 'bad' ? theme.text : theme.credit;
      this.label.text = text;
      fitText(this.label, slot.width - 8, h);
    }
    const w = Math.min(slot.width, Math.ceil(this.label.width) + Math.max(8, Math.round(h * 0.8)));
    const x = align === 'right' ? slot.x + slot.width - w : slot.x + (slot.width - w) / 2;
    this.box = { x, y: slot.y, width: w, height: h };
    placeAt(this.root, this.box);
    this.g.clear();
    if (tagged) {
      // Sprint 9: tagged: a red pill with a bright rim, so being tagged is never a surprise.
      this.g.roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: theme.tagged, alpha: 0.95 }).stroke({ width: 1.5, color: 0xffffff, alpha: 0.85 });
    } else if (this.tone === 'bad') {
      // A black mark: solid black, a thin pale rim.
      this.g.roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: 0x000000, alpha: 1 }).stroke({ width: 1, color: theme.textDim, alpha: 0.9 });
    } else {
      this.g.roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: theme.runnerDeep, alpha: 0.95 }).stroke({ width: 1, color: theme.credit, alpha: 0.9 });
    }
  }

  /** Pops in when it appears or changes. */
  pop(fx: Tweens, ms: number): void {
    fx.cancel(this.inner.scale);
    this.inner.scale.set(1.4);
    fx.add({ target: this.inner.scale, to: { x: 1, y: 1 }, duration: ms, ease: ease.outBack, owner: this.inner });
  }
}

/**
 * Sprint 10 (S-10-2): one line of the Runner's stats column under Memory: "Link 1"
 * (runner colour) or the red "Tagged 1" pill. Hidden while it has nothing to say;
 * its slot stays reserved, so nothing moves when it shows.
 */
export class StatLine {
  readonly root = new Container();
  private readonly g = new Graphics();
  private readonly label: Text;
  private drawn = '';
  /** The line as drawn (CSS px); zero-size while hidden. */
  box: Box = { x: 0, y: 0, width: 0, height: 0 };

  constructor(
    name: string,
    private readonly tone: 'link' | 'tagged',
  ) {
    this.root.label = name;
    this.root.eventMode = 'none';
    this.label = new Text({ text: '', style: { fontFamily: theme.monoFamily, fontSize: 11, fontWeight: '800', fill: theme.text } });
    this.label.anchor.set(0.5);
    this.root.addChild(this.g, this.label);
    this.root.visible = false;
  }

  get text(): string {
    return this.root.visible ? this.label.text : '';
  }

  set(slot: Box, text: string | null): void {
    if (text === null) {
      this.root.visible = false;
      this.box = { x: 0, y: 0, width: 0, height: 0 };
      return;
    }
    this.root.visible = true;
    this.box = { ...slot };
    placeAt(this.root, slot);
    const { width: w, height: h } = slot;
    const key = `${w}x${h}:${text}`;
    if (key === this.drawn) return;
    this.drawn = key;
    this.label.style.fontSize = Math.max(9, Math.round(h * 0.68));
    this.label.style.fill = this.tone === 'tagged' ? theme.text : theme.ink;
    this.label.text = text;
    fitText(this.label, w - 6, h);
    const g = this.g;
    g.clear();
    const r = h / 2;
    if (this.tone === 'tagged') g.roundRect(-w / 2, -h / 2, w, h, r).fill({ color: theme.tagged, alpha: 0.95 }).stroke({ width: 1.5, color: 0xffffff, alpha: 0.85 });
    else g.roundRect(-w / 2, -h / 2, w, h, r).fill({ color: theme.runner, alpha: 0.95 }).stroke({ width: 1, color: theme.ink });
  }

  pop(fx: Tweens, ms: number): void {
    fx.cancel(this.root.scale);
    this.root.scale.set(1.3);
    fx.add({ target: this.root.scale, to: { x: 1, y: 1 }, duration: ms, ease: ease.outBack, owner: this.root });
  }
}

/**
 * Sprint 10 (S-10-1): a side's scored-agenda pile: the latest agenda face up with
 * "2 agendas · 3 points" over its art window (the name and type stay readable).
 * Empty: a faint outline that takes no taps. Every number comes from the view.
 */
export class ScoredPile {
  readonly root = new Container();
  private readonly inner = new Container();
  private readonly topLayer = new Container();
  private readonly empty: Container;
  private readonly chip = new Graphics();
  private readonly countText: Text;
  private key = '';
  private readonly w: number;
  private readonly h: number;
  /** What the count says ("2 agendas · 3 points"); '' while empty. */
  text = '';
  /** The latest agenda's card id (null while empty). */
  top: string | null = null;
  count = 0;

  constructor(
    size: { width: number; height: number },
    private readonly side: Side,
    scale: number,
  ) {
    const { width: w, height: h } = size;
    this.w = w;
    this.h = h;
    this.root.label = `scored:${side}`;
    this.root.eventMode = 'none';
    this.root.hitArea = new Rectangle(-w / 2, -h / 2, w, h);
    this.root.addChild(this.inner);
    const color = sideColor(side);
    const r = Math.max(3, w * 0.08);
    this.empty = new Container();
    const outline = new Graphics();
    outline.roundRect(-w / 2, -h / 2, w, h, r).fill({ color: 0x000000, alpha: 0.18 }).stroke({ width: 1, color, alpha: 0.28 });
    const name = new Text({ text: 'SCORED', style: { fontFamily: theme.monoFamily, fontSize: Math.max(7, 9 * scale), fill: theme.textDim, letterSpacing: 0.5 } });
    name.anchor.set(0.5);
    name.alpha = 0.7;
    fitText(name, w - 6);
    this.empty.addChild(outline, name);
    this.countText = new Text({
      text: '',
      style: {
        fontFamily: theme.monoFamily,
        fontSize: Math.max(9, Math.round(10 * Math.min(scale, 1.2))),
        fontWeight: '800',
        fill: theme.text,
        align: 'center',
        lineHeight: Math.max(10, Math.round(11 * Math.min(scale, 1.2))),
      },
    });
    this.countText.anchor.set(0.5);
    this.inner.addChild(this.empty, this.topLayer, this.chip, this.countText);
  }

  box(): Box {
    return centeredBox(this.root, this.w, this.h, this.inner.scale.x, this.inner.scale.y);
  }

  /** `ids`: the side's scored agendas (oldest first); `points`: the engine's total. */
  set(ids: readonly string[], points: number): void {
    const top = ids[ids.length - 1] ?? null;
    const key = `${ids.length}:${points}:${top ?? '#'}`;
    if (key === this.key) return;
    this.key = key;
    this.count = ids.length;
    this.top = top;
    this.text = ids.length > 0 ? scoredPileText(ids.length, points) : '';
    for (const c of this.topLayer.removeChildren()) c.destroy({ children: true });
    this.empty.visible = ids.length === 0;
    this.chip.clear();
    this.countText.visible = ids.length > 0;
    if (ids.length === 0) return;
    const def = top ? getCard(top) : undefined;
    const { w, h } = this;
    this.topLayer.addChild(def ? createCardFace(def, w, h, 'small') : createCardBack(this.side, w, h));
    // Two lines over the art window: "2 agendas" / "3 points".
    this.countText.text = this.text.replace(' · ', '\n');
    this.countText.scale.set(1);
    fitText(this.countText, w - 8, h * 0.4);
    const cw = Math.min(w - 2, Math.ceil(this.countText.width) + 8);
    const ch = Math.ceil(this.countText.height) + 4;
    const cy = -h / 2 + 2 + ch / 2 + Math.round(h * 0.06);
    this.countText.position.set(0, cy);
    this.chip.roundRect(-cw / 2, cy - ch / 2, cw, ch, Math.min(6, ch / 2)).fill({ color: 0x000000, alpha: 0.86 }).stroke({ width: 1, color: sideColor(this.side), alpha: 0.9 });
  }

  pop(ui: Tweens): void {
    ui.cancel(this.inner.scale);
    this.inner.scale.set(1.15);
    ui.add({ target: this.inner.scale, to: { x: 1, y: 1 }, duration: 220, ease: ease.outBack, owner: this.inner });
  }
}
