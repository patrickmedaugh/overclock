// The board renderer. Draws a PlayerView and animates engine events.
// Holds no game rules: every number shown comes from the view, every change
// comes from an engine event.
import type { GameEvent, PlayerView, RejectReason, Side } from '@overclock/engine';
import { getCard } from '@overclock/cards';
import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { createCardBack, createCardFace, glowRoundRect } from './cardFace';
import { centeredBox } from './geometry';
import { Hand } from './hand';
import type { Box, LayoutSnapshot, SideLayout } from './hook-types';
import { attachPress } from './input';
import type { BoardLayout, SideRow } from './layout';
import { sideColor, theme, timing } from './theme';
import { ease, type Tweens } from './tween';

const HINTS: Record<RejectReason, string> = {
  no_clicks: 'No clicks left',
  deck_empty: 'Your deck is empty',
  not_your_turn: 'Not your turn',
  invalid_action: "Can't do that",
};

function toBox(c: Container): Box {
  const b = c.getBounds();
  return { x: b.x, y: b.y, width: b.width, height: b.height };
}

function textsOf(c: Container): string[] {
  const out: string[] = [];
  for (const child of c.children) {
    if (child instanceof Text) out.push(child.text);
    else out.push(...textsOf(child));
  }
  return out;
}

/** A glowing pill showing one number (credits or clicks). */
class Counter {
  readonly root = new Container();
  private readonly valueText: Text;
  private readonly inner = new Container();
  private value: number | null = null;
  private readonly w: number;
  private readonly h: number;

  constructor(
    private readonly ui: Tweens,
    box: Box,
    side: Side,
    kind: 'credits' | 'clicks',
    scale: number,
  ) {
    const color = kind === 'credits' ? theme.credit : sideColor(side);
    const { width: w, height: h } = box;
    this.w = w;
    this.h = h;
    this.root.position.set(box.x + w / 2, box.y + h / 2);
    this.root.addChild(this.inner);
    const g = new Graphics();
    const r = h / 2;
    g.roundRect(-w / 2, -h / 2, w, h, r).fill({ color: 0x000000, alpha: 0.55 });
    glowRoundRect(g, -w / 2, -h / 2, w, h, r, sideColor(side), Math.max(1, 1.5 * scale), 0.8);
    // Icon.
    const ix = -w / 2 + h * 0.5;
    const ir = h * 0.24;
    if (kind === 'credits') {
      const pts: number[] = [];
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        pts.push(ix + Math.cos(a) * ir, Math.sin(a) * ir);
      }
      g.poly(pts).fill({ color, alpha: 0.25 }).stroke({ width: Math.max(1, 1.5 * scale), color });
      g.circle(ix, 0, ir * 0.35).fill({ color });
    } else {
      // A "clock tick": ring with a hand.
      g.circle(ix, 0, ir).fill({ color, alpha: 0.2 }).stroke({ width: Math.max(1, 1.5 * scale), color });
      g.moveTo(ix, 0).lineTo(ix, -ir * 0.7).stroke({ width: Math.max(1, 2 * scale), color: theme.text });
      g.moveTo(ix, 0).lineTo(ix + ir * 0.5, 0).stroke({ width: Math.max(1, 2 * scale), color: theme.text });
    }
    this.inner.addChild(g);

    const textX = -w / 2 + h * 0.95;
    this.valueText = new Text({
      text: '0',
      style: { fontFamily: theme.monoFamily, fontSize: h * 0.42, fontWeight: '700', fill: theme.text },
    });
    this.valueText.anchor.set(0, 0.5);
    this.valueText.position.set(textX, -h * 0.08);
    const label = new Text({
      text: kind === 'credits' ? 'CREDITS' : 'CLICKS',
      style: { fontFamily: theme.monoFamily, fontSize: Math.max(8, h * 0.17), fill: color, letterSpacing: 1 },
    });
    label.anchor.set(0, 0.5);
    label.position.set(textX, h * 0.27);
    this.inner.addChild(this.valueText, label);
  }

  get text(): string {
    return this.valueText.text;
  }

  box(): Box {
    return centeredBox(this.root, this.w, this.h, this.inner.scale.x, this.inner.scale.y, this.inner.x);
  }

  set(value: number, animate: boolean): void {
    const changed = this.value !== null && this.value !== value;
    this.value = value;
    this.valueText.text = String(value);
    if (animate && changed) {
      this.ui.cancel(this.inner.scale);
      this.inner.scale.set(1.18);
      this.ui.add({ target: this.inner.scale, to: { x: 1, y: 1 }, duration: 200, ease: ease.outBack });
    }
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
      onUpdate: (t) => {
        this.inner.x = t >= 1 ? 0 : Math.sin(t * Math.PI * 6) * amp * (1 - t);
      },
    });
  }
}

/** Face-down deck pile with a count badge. */
class DeckPile {
  readonly root = new Container();
  private readonly countText: Text;
  private readonly glow = new Graphics();
  private readonly pile = new Container();
  private readonly w: number;
  private readonly h: number;

  constructor(box: Box, side: Side, scale: number) {
    const { width: w, height: h } = box;
    this.w = w;
    this.h = h;
    this.root.position.set(box.x + w / 2, box.y + h / 2);
    this.root.hitArea = new Rectangle(-w / 2, -h / 2, w, h);
    this.root.label = `deck:${side}`;
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
    // Reverse so the top card (i=0) renders last.
    this.pile.children.reverse();
    this.root.addChild(this.glow, this.pile);

    const badgeH = Math.max(16, 20 * scale);
    const badge = new Graphics();
    badge.roundRect(-w * 0.32, h / 2 - badgeH - 4 * scale, w * 0.64, badgeH, badgeH / 2).fill({ color: 0x000000, alpha: 0.8 }).stroke({ width: 1, color });
    this.countText = new Text({
      text: '0',
      style: { fontFamily: theme.monoFamily, fontSize: badgeH * 0.7, fontWeight: '700', fill: theme.text },
    });
    this.countText.anchor.set(0.5);
    this.countText.position.set(0, h / 2 - badgeH / 2 - 4 * scale);
    this.root.addChild(badge, this.countText);
  }

  box(): Box {
    return centeredBox(this.root, this.w, this.h);
  }

  setCount(n: number): void {
    this.countText.text = String(n);
    this.pile.visible = n > 0;
  }

  /** Glow when the viewer can act on this deck (from view.legalActions). */
  setActionable(on: boolean): void {
    this.glow.alpha = on ? 1 : 0;
  }
}

interface SideWidgets {
  deck: DeckPile;
  credits: Counter;
  clicks: Counter;
  label: Text;
}

export interface BoardCallbacks {
  onDeckTap(side: Side): void;
}

export class Board {
  readonly stage = new Container();
  private readonly bgLayer = new Container();
  private readonly boardLayer = new Container();
  private readonly hand: Hand;
  private readonly hintLayer = new Container();
  private readonly zoomLayer = new Container();
  private layout: BoardLayout | null = null;
  private view: PlayerView | null = null;
  private sides: Partial<Record<Side, SideWidgets>> = {};
  private detachers: (() => void)[] = [];
  private banner: Text | null = null;
  private hint: { text: string; root: Container } | null = null;
  private zoom: { cardId: string; root: Container; card: Container; width: number; height: number } | null = null;

  constructor(
    private readonly fx: Tweens,
    private readonly ui: Tweens,
    private readonly callbacks: BoardCallbacks,
  ) {
    this.hand = new Hand(fx, ui, {
      onLongPress: (id, from) => this.openZoom(id, from),
      onLongPressEnd: () => this.closeZoom(),
    });
    this.zoomLayer.eventMode = 'none';
    this.hintLayer.eventMode = 'none';
    this.stage.addChild(this.bgLayer, this.boardLayer, this.hand.container, this.hintLayer, this.zoomLayer);
  }

  /** (Re)builds every widget for a viewport. Called on start and on resize. */
  setLayout(layout: BoardLayout): void {
    this.fx.finishAll();
    this.closeZoom(true);
    this.layout = layout;
    for (const d of this.detachers) d();
    this.detachers = [];
    for (const c of [...this.bgLayer.removeChildren(), ...this.boardLayer.removeChildren()]) c.destroy({ children: true });
    this.drawBackground(layout);
    this.sides = {
      corp: this.buildSide('corp', layout.corp, layout),
      runner: this.buildSide('runner', layout.runner, layout),
    };
    this.buildCenter(layout);
    this.hand.setLayout(layout, this.view?.players[this.view.viewer].hand ?? []);
    if (this.hint) this.positionHint(this.hint.root);
    if (this.view) this.applyView(this.view, false);
  }

  /** Shows a view and animates the events that produced it. */
  render(view: PlayerView, events: readonly GameEvent[]): void {
    // Tap-to-skip: finish whatever is still flying before animating new events.
    this.fx.finishAll();
    const first = this.view === null;
    this.view = view;
    if (first) {
      if (this.layout) this.setLayout(this.layout);
      return;
    }
    const viewer = view.viewer;
    const drawn = events.filter((e) => e.type === 'card_drawn' && e.player === viewer).length;
    const layout = this.layout;
    if (layout) this.hand.sync(view.players[viewer].hand ?? [], drawn, layout[viewer].deck);
    this.applyView(view, true);
    for (const e of events) {
      if (e.type === 'action_rejected') {
        this.showHint(HINTS[e.reason]);
        if (e.reason === 'no_clicks') this.sides[viewer]?.clicks.shake();
      }
    }
  }

  snapshot(): LayoutSnapshot {
    const side = (s: Side): SideLayout => {
      const w = this.sides[s];
      if (!w) throw new Error('board not laid out');
      return { deck: w.deck.box(), credits: w.credits.box(), clicks: w.clicks.box() };
    };
    const layout = this.layout;
    const corp = this.sides.corp;
    const runner = this.sides.runner;
    return {
      viewport: layout?.viewport ?? { width: 0, height: 0 },
      corp: side('corp'),
      runner: side('runner'),
      handArea: layout?.handArea ?? { x: 0, y: 0, width: 0, height: 0 },
      hand: this.hand.boxes(),
      text: {
        corpCredits: corp?.credits.text ?? '',
        corpClicks: corp?.clicks.text ?? '',
        runnerCredits: runner?.credits.text ?? '',
        runnerClicks: runner?.clicks.text ?? '',
      },
      hint: this.hint && this.hint.root.alpha > 0.05 ? { text: this.hint.text, box: toBox(this.hint.root) } : null,
      zoom: this.zoom ? { cardId: this.zoom.cardId, box: centeredBox(this.zoom.card, this.zoom.width, this.zoom.height), texts: textsOf(this.zoom.card) } : null,
      animating: this.fx.active,
    };
  }

  private applyView(view: PlayerView, animate: boolean): void {
    for (const s of ['corp', 'runner'] as const) {
      const w = this.sides[s];
      const p = view.players[s];
      if (!w) continue;
      w.deck.setCount(p.deckCount);
      w.credits.set(p.credits, animate);
      w.clicks.set(p.clicks, animate);
      w.label.text = `${s === 'corp' ? 'CORP' : 'RUNNER'}  ·  hand ${p.handCount}`;
      w.deck.setActionable(view.legalActions.some((a) => a.type === 'draw' && a.player === s));
    }
    if (this.banner) {
      const whose = view.activePlayer === view.viewer ? 'YOUR TURN' : `${view.activePlayer.toUpperCase()}'S TURN`;
      this.banner.text = `TURN ${view.turn}  ·  ${whose}`;
    }
  }

  private drawBackground(layout: BoardLayout): void {
    const { width: vw, height: vh } = layout.viewport;
    const g = new Graphics();
    // No full-screen fill: the renderer's clear color is the backdrop. A
    // full-screen blended layer costs a whole frame of fill rate on
    // low-end/software GPUs. Only thin lines and the side bands are drawn.
    // Neon grid, one path and one stroke.
    const step = Math.round(32 * layout.scale);
    for (let x = layout.board.x % step; x < vw; x += step) g.moveTo(x, 0).lineTo(x, vh);
    for (let y = 0; y < vh; y += step) g.moveTo(0, y).lineTo(vw, y);
    g.stroke({ width: 1, color: theme.grid, alpha: 0.35 });
    // Side bands.
    for (const s of ['corp', 'runner'] as const) {
      const row = layout[s].row;
      const color = sideColor(s);
      g.rect(row.x, row.y, row.width, row.height).fill({ color, alpha: 0.05 });
      const edgeY = s === 'corp' ? row.y + row.height : row.y;
      g.moveTo(row.x + layout.pad, edgeY).lineTo(row.x + row.width - layout.pad, edgeY).stroke({ width: 1, color, alpha: 0.6 });
    }
    this.bgLayer.addChild(g);
  }

  private buildSide(side: Side, row: SideRow, layout: BoardLayout): SideWidgets {
    const color = sideColor(side);
    const label = new Text({
      text: side.toUpperCase(),
      style: { fontFamily: theme.monoFamily, fontSize: row.label.height * 0.8, fontWeight: '700', fill: color, letterSpacing: 2 },
    });
    label.position.set(row.label.x, row.label.y);
    const deck = new DeckPile(row.deck, side, layout.scale);
    const credits = new Counter(this.ui, row.credits, side, 'credits', layout.scale);
    const clicks = new Counter(this.ui, row.clicks, side, 'clicks', layout.scale);
    this.boardLayer.addChild(label, credits.root, clicks.root, deck.root);

    const pile = deck.root;
    this.detachers.push(
      attachPress(pile, {
        onDown: () => {
          this.ui.cancel(pile.scale);
          this.ui.add({ target: pile.scale, to: { x: 0.92, y: 0.92 }, duration: timing.pressFeedback });
        },
        onRelease: () => {
          this.ui.cancel(pile.scale);
          this.ui.add({ target: pile.scale, to: { x: 1, y: 1 }, duration: 140, ease: ease.outBack });
        },
        onTap: () => this.callbacks.onDeckTap(side),
      }),
    );
    // Only the viewer's own deck is interactive.
    if (side !== (this.view?.viewer ?? 'runner')) {
      pile.eventMode = 'none';
      pile.cursor = 'default';
    }
    return { deck, credits, clicks, label };
  }

  private buildCenter(layout: BoardLayout): void {
    const c = layout.center;
    if (c.height < 40) {
      this.banner = null;
      return;
    }
    const s = layout.scale;
    const banner = new Text({
      text: '',
      style: { fontFamily: theme.monoFamily, fontSize: Math.round(15 * s), fontWeight: '700', fill: theme.text, letterSpacing: 2 },
    });
    banner.anchor.set(0.5);
    banner.position.set(c.x + c.width / 2, c.y + c.height * 0.4);
    const help = new Text({
      text: 'Tap your deck to draw  ·  Hold a card to read it',
      style: {
        fontFamily: theme.fontFamily,
        fontSize: Math.round(12 * s),
        fill: theme.textDim,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: c.width,
      },
    });
    help.anchor.set(0.5, 0);
    help.position.set(c.x + c.width / 2, banner.y + 16 * s);
    const g = new Graphics();
    const lineW = Math.min(c.width * 0.8, 260 * s);
    g.moveTo(c.x + (c.width - lineW) / 2, banner.y - 18 * s)
      .lineTo(c.x + (c.width + lineW) / 2, banner.y - 18 * s)
      .stroke({ width: 1, color: theme.corp, alpha: 0.5 });
    g.moveTo(c.x + (c.width - lineW) / 2, help.y + help.height + 12 * s)
      .lineTo(c.x + (c.width + lineW) / 2, help.y + help.height + 12 * s)
      .stroke({ width: 1, color: theme.runner, alpha: 0.5 });
    this.banner = banner;
    this.boardLayer.addChild(g, banner, help);
  }

  private showHint(text: string): void {
    if (this.hint) {
      this.ui.cancel(this.hint.root);
      this.hint.root.destroy({ children: true });
      this.hint = null;
    }
    const layout = this.layout;
    if (!layout) return;
    const s = layout.scale;
    const root = new Container();
    const label = new Text({
      text,
      style: { fontFamily: theme.fontFamily, fontSize: Math.round(15 * s), fontWeight: '700', fill: 0x140a00 },
    });
    label.anchor.set(0.5);
    const w = label.width + 28 * s;
    const h = Math.max(32, 34 * s);
    const g = new Graphics();
    g.roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: theme.warn });
    g.roundRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, h / 2 + 3).stroke({ width: 3, color: theme.warn, alpha: 0.35 });
    root.addChild(g, label);
    this.positionHint(root);
    root.alpha = 0;
    this.hintLayer.addChild(root);
    this.hint = { text, root };
    const baseY = root.y;
    root.y = baseY + 8 * s;
    this.ui.add({ target: root, to: { alpha: 1, y: baseY }, duration: 120 });
    this.ui.add({
      target: root,
      to: { alpha: 0 },
      delay: timing.hintVisible,
      duration: timing.hintFade,
      ease: ease.linear,
      onComplete: () => {
        if (this.hint?.root === root) {
          root.destroy({ children: true });
          this.hint = null;
        }
      },
    });
  }

  private positionHint(root: Container): void {
    const layout = this.layout;
    if (!layout) return;
    // Just above the Runner's row, centered on the board.
    const b = layout.board;
    root.position.set(b.x + b.width / 2, layout.runner.row.y - Math.max(24, 28 * layout.scale));
  }

  private openZoom(cardId: string, from: Box): void {
    const layout = this.layout;
    const def = getCard(cardId);
    if (!layout || !def) return;
    this.closeZoom(true);
    const { width: vw, height: vh } = layout.viewport;
    const z = layout.zoom;
    const root = new Container();
    const dim = new Graphics();
    dim.rect(0, 0, vw, vh).fill({ color: 0x000000, alpha: 0.65 });
    const card = createCardFace(def, z.width, z.height, 'full');
    const cx = z.x + z.width / 2;
    const cy = z.y + z.height / 2;
    card.position.set(from.x + from.width / 2, from.y + from.height / 2);
    card.scale.set(from.width / z.width);
    root.addChild(dim, card);
    root.alpha = 0;
    this.zoomLayer.addChild(root);
    this.zoom = { cardId, root, card, width: z.width, height: z.height };
    this.ui.add({ target: root, to: { alpha: 1 }, duration: timing.zoomIn });
    this.ui.add({ target: card, to: { x: cx, y: cy }, duration: timing.zoomIn, ease: ease.outCubic });
    this.ui.add({ target: card.scale, to: { x: 1, y: 1 }, duration: timing.zoomIn, ease: ease.outBack });
  }

  private closeZoom(immediate = false): void {
    const zoom = this.zoom;
    if (!zoom) return;
    this.zoom = null;
    this.ui.cancel(zoom.root);
    this.ui.cancel(zoom.card);
    this.ui.cancel(zoom.card.scale);
    if (immediate) {
      zoom.root.destroy({ children: true });
      return;
    }
    this.ui.add({
      target: zoom.root,
      to: { alpha: 0 },
      duration: timing.zoomOut,
      ease: ease.linear,
      onComplete: () => zoom.root.destroy({ children: true }),
    });
  }
}
