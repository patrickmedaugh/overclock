// The board renderer. Draws a PlayerView and animates engine events.
// Holds no game rules: every number shown comes from the view, every change
// comes from an engine event, and every button's enabled state comes from
// view.legalActions / view.pendingDiscard. Viewer-relative: the seat in
// `view.viewer` is drawn in the bottom row.
import type { GameEvent, PlayerView, RejectReason, Side, WinReason } from '@overclock/engine';
import { getCard } from '@overclock/cards';
import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { createCardBack, createCardFace, glowRoundRect, retireCardTextures } from './cardFace';
import { centeredBox, logicalBox } from './geometry';
import { guardOpen } from './guard';
import { Hand } from './hand';
import type { AnimRecord, Box, LayoutSnapshot, SideLayout } from './hook-types';
import type { Presentation } from './hotseat';
import { attachPress } from './input';
import { type PreviewKind, drawPreview } from './preview';
import type { BoardLayout, SideRow } from './layout';
import { sideColor, theme, timing } from './theme';
import { ease, type Tweens } from './tween';

type Pos = 'top' | 'bottom';

/** Plain-language hints for refused actions. */
function hintFor(reason: RejectReason, view: PlayerView | null): string {
  switch (reason) {
    case 'no_clicks':
      return 'No clicks left';
    case 'not_your_turn':
      return 'Not your turn';
    case 'deck_empty':
      return 'Your deck is empty';
    case 'game_over':
      return 'The game is over';
    case 'wrong_phase':
      return view?.pendingDiscard ? 'Pick your discards first' : "You can't do that right now";
    case 'bad_discard':
      return 'Pick exactly the cards asked for';
    case 'invalid_action':
      return "That move isn't allowed";
  }
}

const SIDE_NAME: Record<Side, string> = { corp: 'Corp', runner: 'Runner' };

/** Why the game ended, in plain words (completes "<Winner> wins: ..."). */
const WIN_REASON: Record<WinReason, string> = {
  corp_decked: 'the Corp ran out of cards',
};

export function gameOverText(result: { winner: Side; reason: WinReason }): string {
  return `${SIDE_NAME[result.winner]} wins: ${WIN_REASON[result.reason]}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function bannerText(view: PlayerView): string {
  if (view.result) return 'GAME OVER';
  const who = view.activePlayer.toUpperCase();
  if (view.phase === 'discard') return `TURN ${view.turn} · ${who} · hand limit`;
  return `TURN ${view.turn} · ${who} · ${plural(view.players[view.activePlayer].clicks, 'click', 'clicks')} left`;
}

function textsOf(c: Container): string[] {
  const out: string[] = [];
  for (const child of c.children) {
    if (child instanceof Text) out.push(child.text);
    else out.push(...textsOf(child));
  }
  return out;
}

/** Shrinks a text (never grows it) so it fits `maxW`. */
function fitText(t: Text, maxW: number): void {
  t.scale.set(1);
  if (t.width > maxW && t.width > 0) t.scale.set(maxW / t.width);
}

/** A glowing pill showing one number (credits or clicks). */
class Counter {
  readonly root = new Container();
  private readonly valueText: Text;
  private readonly inner = new Container();
  private readonly glow = new Graphics();
  private value: number | null = null;
  readonly w: number;
  readonly h: number;

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
    this.root.hitArea = new Rectangle(-w / 2, -h / 2, w, h);
    this.root.addChild(this.inner);
    // Narrow pills (the phone's rail): number over a small label, no icon.
    const compact = w < h * 2.2;
    const r = compact ? Math.min(12 * scale, h / 2, w / 2) : h / 2;
    this.glow.roundRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, r + 3).stroke({ width: Math.max(1.5, 2 * scale), color, alpha: 0.75 });
    this.glow.alpha = 0;
    const g = new Graphics();
    g.roundRect(-w / 2, -h / 2, w, h, r).fill({ color: 0x000000, alpha: 0.55 });
    glowRoundRect(g, -w / 2, -h / 2, w, h, r, sideColor(side), Math.max(1, 1.5 * scale), 0.8);
    // Icon.
    const ix = -w / 2 + h * 0.5;
    const ir = h * 0.24;
    if (compact) {
      // No room for an icon: the label says what the number is.
    } else if (kind === 'credits') {
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
    this.inner.addChild(this.glow, g);

    const textX = -w / 2 + h * 0.95;
    this.valueText = new Text({
      text: '0',
      style: { fontFamily: theme.monoFamily, fontSize: h * 0.42, fontWeight: '700', fill: theme.text },
    });
    const label = new Text({
      text: kind === 'credits' ? 'CREDITS' : 'CLICKS',
      style: { fontFamily: theme.monoFamily, fontSize: Math.max(8, h * 0.17), fill: color, letterSpacing: compact ? 0.5 : 1 },
    });
    if (compact) {
      this.valueText.anchor.set(0.5, 0.5);
      this.valueText.position.set(0, -h * 0.1);
      label.anchor.set(0.5, 0.5);
      label.position.set(0, h * 0.28);
      fitText(label, w - 8);
    } else {
      this.valueText.anchor.set(0, 0.5);
      this.valueText.position.set(textX, -h * 0.08);
      label.anchor.set(0, 0.5);
      label.position.set(textX, h * 0.27);
      fitText(label, w / 2 - textX - 6);
    }
    this.inner.addChild(this.valueText, label);
  }

  get text(): string {
    return this.valueText.text;
  }

  /** Logical box (as the hit area): press feedback, the value pop and the no-clicks shake are transient. */
  box(): Box {
    return logicalBox(this.root, this.w, this.h);
  }

  setActionable(on: boolean): void {
    this.glow.alpha = on ? 1 : 0;
  }

  /** Returns true when the number changed and popped. */
  set(value: number, animate: boolean): boolean {
    const changed = this.value !== null && this.value !== value;
    this.value = value;
    this.valueText.text = String(value);
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
      // Added bottom-first, so the top card (i=0) renders last.
      this.pile.addChild(back);
    }
    this.root.addChild(this.glow, this.pile);

    const badgeH = Math.max(16, 20 * scale);
    const badge = new Graphics();
    badge.roundRect(-w * 0.36, h / 2 - badgeH - 4 * scale, w * 0.72, badgeH, badgeH / 2).fill({ color: 0x000000, alpha: 0.8 }).stroke({ width: 1, color });
    this.countText = new Text({
      text: '0',
      style: { fontFamily: theme.monoFamily, fontSize: badgeH * 0.7, fontWeight: '700', fill: theme.text },
    });
    this.countText.anchor.set(0.5);
    this.countText.position.set(0, h / 2 - badgeH / 2 - 4 * scale);
    this.root.addChild(badge, this.countText);
  }

  /** Logical box (as the hit area): press feedback is transient. */
  box(): Box {
    return logicalBox(this.root, this.w, this.h);
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

/** Discard pile: empty slot, top card face up, or a face-down back (Corp's pile, to the Runner). */
class DiscardPile {
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
    box: Box,
    private readonly side: Side,
    scale: number,
  ) {
    const { width: w, height: h } = box;
    this.w = w;
    this.h = h;
    this.root.position.set(box.x + w / 2, box.y + h / 2);
    this.root.label = `discard:${side}`;
    this.root.addChild(this.inner);
    const color = sideColor(side);
    const slot = new Graphics();
    const r = Math.max(3, w * 0.08);
    slot.roundRect(-w / 2, -h / 2, w, h, r).fill({ color: 0x000000, alpha: 0.35 }).stroke({ width: 1, color, alpha: 0.45 });
    this.emptyText = new Text({
      text: 'DISCARD',
      style: { fontFamily: theme.monoFamily, fontSize: Math.max(7, 9 * scale), fill: theme.textDim, letterSpacing: 1 },
    });
    this.emptyText.anchor.set(0.5);
    this.emptyText.position.set(0, -h * 0.12);
    fitText(this.emptyText, w - 6);
    // Count chip in the top-right corner, over the art window only: a face-up top
    // card keeps its name and type (lower half) readable. The cost sits top-left.
    const badgeH = Math.max(16, 18 * scale);
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

  /** Logical box: the count pop is transient. */
  box(): Box {
    return logicalBox(this.root, this.w, this.h);
  }

  /** `pile` is the view's discard list (bottom = 0), or null when face down to the viewer. */
  set(count: number, pile: readonly string[] | null): void {
    this.countText.text = String(count);
    fitText(this.countText, this.badgeTextW);
    const topId = pile ? (pile[pile.length - 1] ?? null) : null;
    const key = `${count}:${pile ? (topId ?? '') : '#'}`;
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

type ButtonMode = 'end' | 'confirm';

/** The End turn button; doubles as the discard picker's Confirm. */
class ActionButton {
  readonly root = new Container();
  private readonly g = new Graphics();
  private readonly label: Text;
  private readonly inner = new Container();
  mode: ButtonMode = 'end';
  enabled = false;
  glowing = false;
  private drawnKey = '';

  constructor(
    private readonly box0: Box,
    private readonly color: number,
    private readonly scale: number,
  ) {
    const { width: w, height: h } = box0;
    this.root.position.set(box0.x + w / 2, box0.y + h / 2);
    this.root.hitArea = new Rectangle(-w / 2, -h / 2, w, h);
    this.root.label = 'button:action';
    this.label = new Text({
      text: '',
      style: { fontFamily: theme.fontFamily, fontSize: Math.max(13, Math.round(16 * scale)), fontWeight: '800', fill: theme.text, letterSpacing: 1 },
    });
    this.label.anchor.set(0.5);
    this.inner.addChild(this.g, this.label);
    this.root.addChild(this.inner);
  }

  get text(): string {
    return this.label.text;
  }

  /** Logical box (as the hit area): press feedback and the glow-on pop are transient. */
  box(): Box {
    return logicalBox(this.root, this.box0.width, this.box0.height);
  }

  set(mode: ButtonMode, enabled: boolean, glowing: boolean, ui: Tweens | null): void {
    const wasGlowing = this.glowing;
    this.mode = mode;
    this.enabled = enabled;
    this.glowing = glowing;
    const key = `${mode}:${enabled}:${glowing}`;
    if (key === this.drawnKey) return;
    this.drawnKey = key;
    const { width: w, height: h } = this.box0;
    const r = Math.min(14 * this.scale, h / 2);
    const accent = mode === 'confirm' ? theme.warn : this.color;
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
    this.label.text = mode === 'confirm' ? 'Confirm' : 'End turn';
    fitText(this.label, w - 12);
    if (ui && glowing && !wasGlowing) {
      ui.cancel(this.inner.scale);
      this.inner.scale.set(1.12);
      ui.add({ target: this.inner.scale, to: { x: 1, y: 1 }, duration: 260, ease: ease.outBack, owner: this.inner });
    }
  }
}

interface SideWidgets {
  side: Side;
  row: SideRow;
  deck: DeckPile;
  discard: DiscardPile;
  credits: Counter;
  clicks: Counter;
  name: Text;
  handText: Text;
}

export interface BoardCallbacks {
  onDeckTap(): void;
  onCreditsTap(): void;
  onEndTurn(): void;
  onDiscard(handIndices: number[]): void;
  onNewGame(): void;
  log(rec: Omit<AnimRecord, 'startedAt'>): void;
  /**
   * The board's widgets were just rebuilt. Pixi hit-tests with transforms it
   * only updates while rendering, so the host refreshes them here: a tap that
   * arrives before the next frame (a busy phone) must still find its button.
   */
  onRebuilt(): void;
  /** Layout preview (`?preview=busy`): draws a sample busy board into the installed-card slots. */
  preview?: PreviewKind | null;
}

export class Board {
  readonly stage = new Container();
  /** Everything that belongs to one seat's board; fades in on a turn change. */
  private readonly table = new Container();
  private readonly bgLayer = new Container();
  private readonly boardLayer = new Container();
  private readonly centerLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly hand: Hand;
  private readonly hintLayer = new Container();
  private readonly zoomLayer = new Container();
  private layout: BoardLayout | null = null;
  private view: PlayerView | null = null;
  private rows: Partial<Record<Pos, SideWidgets>> = {};
  private detachers: (() => void)[] = [];
  private banner: Text | null = null;
  private subMain: Text | null = null;
  private subHelp: Text | null = null;
  private button: ActionButton | null = null;
  private gameOver: { text: string; root: Container } | null = null;
  private hint: { text: string; root: Container; box: Box } | null = null;
  private zoom: { cardId: string; root: Container; card: Container; width: number; height: number } | null = null;
  /** Hand indices picked in the discard picker (UI state only). */
  private readonly marked = new Set<number>();
  /**
   * Timestamp of the tap that ended the last turn: End turn ignores taps
   * stamped less than `timing.endTurnGuard` after it (double-tap guard).
   */
  private endTurnArmedAt: number | null = null;
  /** Timestamp of the button tap whose action is being dispatched right now. */
  private actionTapAt: number | null = null;
  /**
   * Set while the actor's discards fly out and the board still shows the
   * actor's seat, although the turn already belongs to the next seat. A tap on
   * the bottom row then only skips ahead to the flip: it must not spend a
   * click of the player whose board is not on screen yet. The flip is started
   * by a timer at its scheduled time (not by animation frames, which a slow
   * device delivers late), or at once by tap-to-skip.
   */
  private pendingFlip: { run: () => void; timer: ReturnType<typeof setTimeout> } | null = null;

  constructor(
    private readonly fx: Tweens,
    private readonly ui: Tweens,
    private readonly callbacks: BoardCallbacks,
  ) {
    this.hand = new Hand(fx, ui, {
      onTap: (i) => this.onCardTap(i),
      onLongPress: (id, from) => this.openZoom(id, from),
      onLongPressEnd: () => this.closeZoom(),
      log: (r) => callbacks.log(r),
    });
    this.zoomLayer.eventMode = 'none';
    this.hintLayer.eventMode = 'none';
    this.fxLayer.eventMode = 'none';
    this.table.addChild(this.bgLayer, this.boardLayer, this.centerLayer, this.hand.container);
    this.stage.addChild(this.table, this.fxLayer, this.hintLayer, this.zoomLayer);
  }

  /** (Re)builds every widget for a viewport. Called on start and on resize. */
  setLayout(layout: BoardLayout): void {
    this.skip();
    this.layout = layout;
    retireCardTextures();
    if (this.view) this.rebuild(false, []);
    if (this.hint) this.positionHint(this.hint);
  }

  /** Shows the result of one action (see Presentation). */
  show(p: Presentation): void {
    // Tap-to-skip: finish whatever is still animating before the new events.
    this.skip();
    if (p.kind === 'same') this.render(p.view, p.events);
    else this.handoff(p);
  }

  /** Shows a view and animates the events that produced it (same seat). */
  render(view: PlayerView, events: readonly GameEvent[]): void {
    this.skip();
    const prev = this.view;
    this.view = view;
    const layout = this.layout;
    if (!layout) return;
    if (!prev || prev.viewer !== view.viewer) {
      this.rebuild(false, []);
      return;
    }
    const viewer = view.viewer;
    const ids = view.players[viewer].hand ?? [];
    const drawn = events.filter((e) => e.type === 'card_drawn' && e.player === viewer).length;
    this.hand.sync(ids, drawn, layout.bottom.deck);
    if (view.pendingDiscard === 0 || ids.length !== (prev.players[viewer].hand ?? []).length) this.marked.clear();
    this.hand.setMarked(this.marked);
    this.applyView(view, true);
    for (const e of events) {
      if (e.type === 'credit_gained' && e.player === viewer) this.creditGained(e.amount);
      if (e.type === 'action_rejected') {
        this.showHint(hintFor(e.reason, view));
        if (e.reason === 'no_clicks') this.rows.bottom?.clicks.shake();
      }
    }
  }

  snapshot(): LayoutSnapshot {
    const layout = this.layout;
    const view = this.view;
    const zero = { x: 0, y: 0, width: 0, height: 0 };
    const side = (s: Side): SideLayout => {
      const w = this.widgets(s);
      if (!w) return { deck: zero, credits: zero, clicks: zero, discard: zero, label: zero };
      return { deck: w.deck.box(), credits: w.credits.box(), clicks: w.clicks.box(), discard: w.discard.box(), label: w.row.label };
    };
    const corp = this.widgets('corp');
    const runner = this.widgets('runner');
    const button = this.button;
    const pending = view?.pendingDiscard ?? 0;
    return {
      mode: layout?.mode ?? 'desktop',
      rotatePrompt: false,
      viewport: layout?.viewport ?? { width: 0, height: 0 },
      safeArea: layout?.insets ?? { top: 0, right: 0, bottom: 0, left: 0 },
      viewer: view?.viewer ?? 'corp',
      corp: side('corp'),
      runner: side('runner'),
      handArea: layout?.handArea ?? zero,
      hand: this.hand.boxes(),
      text: {
        banner: this.banner?.visible ? this.banner.text : '',
        corpCredits: corp?.credits.text ?? '',
        corpClicks: corp?.clicks.text ?? '',
        runnerCredits: runner?.credits.text ?? '',
        runnerClicks: runner?.clicks.text ?? '',
        corpHand: corp?.handText.text ?? '',
        runnerHand: runner?.handText.text ?? '',
        corpDiscard: corp?.discard.text ?? '',
        runnerDiscard: runner?.discard.text ?? '',
      },
      endTurn:
        button && button.root.visible && button.mode === 'end'
          ? { box: button.box(), label: button.text, glowing: button.glowing, enabled: button.enabled }
          : null,
      picker:
        button && button.root.visible && button.mode === 'confirm' && pending > 0
          ? { remaining: pending - this.marked.size, label: this.subMain?.text ?? '', confirm: { box: button.box(), enabled: button.enabled } }
          : null,
      gameOver: this.gameOver && layout ? { text: this.gameOver.text, box: layout.gameOver } : null,
      hint: this.hint && this.hint.root.alpha > 0.05 ? { text: this.hint.text, box: this.hint.box } : null,
      zoom: this.zoom ? { cardId: this.zoom.cardId, box: centeredBox(this.zoom.card, this.zoom.width, this.zoom.height), texts: textsOf(this.zoom.card) } : null,
      animating: this.fx.active || this.pendingFlip !== null,
    };
  }

  // ---- turn change --------------------------------------------------------

  private handoff(p: Extract<Presentation, { kind: 'handoff' }>): void {
    const layout = this.layout;
    // The double-tap guard counts from this tap (End turn / Confirm), not from the
    // flip: the flip waits for the discard flight, and the button is hidden until then.
    // Its own timestamp, not "now": a busy device may run this handler late.
    const tappedAt = this.actionTapAt ?? performance.now();
    // The actor's own view from here on: no picker, nothing to tap but the
    // board's deck/credits, which already act for the new seat.
    this.view = p.actorView;
    this.marked.clear();
    this.hand.setMarked(this.marked);
    if (this.button) this.button.root.visible = false;
    if (this.subMain) this.subMain.visible = false;
    let discardMs = 0;
    let discarded = false;
    if (layout) {
      for (const e of p.actorEvents) {
        if (e.type === 'cards_discarded' && e.player === p.actor && e.handIndices) {
          discardMs = this.hand.discardOut(e.handIndices, layout.bottom.discard);
          discarded = true;
          this.callbacks.log({ kind: 'discard_flight', scheduledMs: discardMs, box: layout.bottom.discard });
        }
      }
    }
    this.callbacks.log({ kind: 'turn_change', scheduledMs: discardMs + timing.flip });
    const flip = () => {
      this.view = p.nextView;
      this.rebuild(true, p.nextEvents, tappedAt);
      // The actor's pile is now in the top row: pop it so the new count is noticed.
      if (discarded) this.rows.top?.discard.pop(this.ui);
    };
    if (discardMs > 0) {
      this.pendingFlip = { run: flip, timer: setTimeout(() => this.runPendingFlip('timer'), discardMs) };
    } else {
      this.callbacks.log({ kind: 'turn_flip', scheduledMs: timing.flip, text: 'now' });
      flip();
    }
  }

  /** Starts a waiting flip now; `trigger` says why (logged for the test hook). */
  private runPendingFlip(trigger: 'timer' | 'skip'): void {
    const pending = this.pendingFlip;
    if (!pending) return;
    this.pendingFlip = null;
    clearTimeout(pending.timer);
    // The discard flight is due (or skipped): land it before the new board.
    this.fx.finishAll();
    this.callbacks.log({ kind: 'turn_flip', scheduledMs: timing.flip, text: trigger });
    pending.run();
  }

  /** Tap-to-skip: finishes every event animation, including a waiting flip. */
  private skip(): void {
    this.fx.finishAll();
    this.runPendingFlip('skip');
  }

  /**
   * Rebuilds the board for this.view; `flipIn` plays the turn-change entrance and `events`.
   * `tappedAt` is when the tap that ended the turn happened; End turn ignores taps until
   * `timing.endTurnGuard` after it.
   */
  private rebuild(flipIn: boolean, events: readonly GameEvent[], tappedAt = performance.now()): void {
    const layout = this.layout;
    const view = this.view;
    if (!layout || !view) return;
    this.closeZoom(true);
    for (const d of this.detachers) d();
    this.detachers = [];
    for (const c of [...this.bgLayer.removeChildren(), ...this.boardLayer.removeChildren(), ...this.centerLayer.removeChildren()]) {
      c.destroy({ children: true });
    }
    this.gameOver = null;
    const viewer = view.viewer;
    const opponent: Side = viewer === 'corp' ? 'runner' : 'corp';
    this.drawBackground(layout, viewer, opponent);
    this.rows = {
      top: this.buildSide(opponent, layout.top, layout, false),
      bottom: this.buildSide(viewer, layout.bottom, layout, true),
    };
    this.buildCenter(layout, viewer);
    if (this.callbacks.preview) this.boardLayer.addChild(drawPreview(layout, viewer));

    const ids = view.players[viewer].hand ?? [];
    const drawn = events.filter((e) => e.type === 'card_drawn' && e.player === viewer).length;
    if (flipIn && drawn > 0) {
      this.hand.setLayout(layout, ids.slice(0, ids.length - drawn), viewer);
      this.hand.sync(ids, drawn, layout.bottom.deck, timing.drawAfterFlip);
    } else {
      this.hand.setLayout(layout, ids, viewer);
    }
    if (view.pendingDiscard === 0) this.marked.clear();
    this.hand.setMarked(this.marked);
    this.applyView(view, flipIn);

    if (flipIn) {
      this.endTurnArmedAt = tappedAt;
      this.table.alpha = 0.15;
      this.fx.add({ target: this.table, to: { alpha: 1 }, duration: timing.flip, ease: ease.outCubic });
      this.sweep(layout, viewer);
      if (this.banner) {
        const b = this.banner;
        const base = b.scale.x;
        b.scale.set(base * 1.25);
        this.fx.add({ target: b.scale, to: { x: base, y: base }, duration: timing.flip, ease: ease.outBack, owner: b });
      }
    } else {
      this.table.alpha = 1;
    }
    this.callbacks.onRebuilt();
  }

  /** A neon line sweeps from the new player's row up the board. */
  private sweep(layout: BoardLayout, viewer: Side): void {
    const g = new Graphics();
    const b = layout.board;
    const color = sideColor(viewer);
    g.rect(b.x, -2, b.width, 4).fill({ color, alpha: 0.9 });
    g.rect(b.x, -10, b.width, 20).fill({ color, alpha: 0.12 });
    g.y = layout.bottom.row.y;
    this.fxLayer.addChild(g);
    this.fx.add({
      target: g,
      to: { y: layout.top.row.y + layout.top.row.height, alpha: 0 },
      duration: timing.flip,
      ease: ease.outCubic,
      owner: g,
      onComplete: () => g.destroy(),
    });
  }

  // ---- view -> widgets ----------------------------------------------------

  private widgets(side: Side): SideWidgets | undefined {
    if (this.rows.bottom?.side === side) return this.rows.bottom;
    if (this.rows.top?.side === side) return this.rows.top;
    return undefined;
  }

  private applyView(view: PlayerView, animate: boolean): void {
    const layout = this.layout;
    if (!layout) return;
    const viewer = view.viewer;
    for (const s of ['corp', 'runner'] as const) {
      const w = this.widgets(s);
      const p = view.players[s];
      if (!w) continue;
      w.deck.setCount(p.deckCount);
      w.credits.set(p.credits, animate);
      w.clicks.set(p.clicks, animate);
      w.discard.set(p.discardCount, p.discard);
      w.handText.text = plural(p.handCount, 'card in hand', 'cards in hand');
      const mine = s === viewer;
      w.deck.setActionable(mine && view.legalActions.some((a) => a.type === 'draw'));
      w.credits.setActionable(mine && view.legalActions.some((a) => a.type === 'gain_credit'));
    }

    if (this.banner) {
      this.banner.visible = !view.result;
      this.banner.text = bannerText(view);
      this.banner.style.fill = view.phase === 'discard' ? theme.warn : sideColor(view.activePlayer);
      fitText(this.banner, layout.banner.width);
    }

    const pending = view.pendingDiscard;
    const button = this.button;
    if (this.subMain && this.subHelp) {
      const main = this.subMain;
      const help = this.subHelp;
      main.visible = pending > 0;
      help.visible = !view.result;
      if (pending > 0) {
        const k = pending - this.marked.size;
        main.text = k > 0 ? `Discard ${k}` : 'Tap Confirm';
        fitText(main, layout.sub.width);
        // The hand limit comes from the view (hand - pending), not a client constant.
        const keep = view.players[viewer].handCount - pending;
        help.text = `You can keep ${keep} cards. Tap cards to pick them.\nHold a card to read it.`;
      } else if (view.activePlayer === viewer && view.phase === 'action' && view.players[viewer].clicks === 0) {
        help.text = "No clicks left. Tap End turn when you're ready.";
      } else {
        help.text = 'Tap your deck to draw, or your credits for +1.\nHold a card to read it.';
      }
      help.y = pending > 0 ? main.y + main.height + 2 : layout.sub.y;
    }

    if (button) {
      if (view.result) {
        button.root.visible = false;
      } else if (pending > 0) {
        button.root.visible = true;
        button.set('confirm', this.marked.size === pending, this.marked.size === pending, this.ui);
      } else {
        const canEnd = view.legalActions.some((a) => a.type === 'end_turn');
        button.root.visible = true;
        button.set('end', canEnd, canEnd && view.players[viewer].clicks === 0, animate ? this.ui : null);
      }
    }

    if (view.result && !this.gameOver) this.showGameOver(layout, gameOverText(view.result), view.result.winner, animate);
  }

  private creditGained(amount: number): void {
    const layout = this.layout;
    const w = this.rows.bottom;
    if (!layout || !w) return;
    const b = w.credits.box();
    this.callbacks.log({ kind: 'credit_pop', scheduledMs: Math.max(timing.creditPop, timing.creditFloat), box: b });
    const s = layout.scale;
    const t = new Text({
      text: `+${amount}`,
      style: { fontFamily: theme.monoFamily, fontSize: Math.round(20 * s), fontWeight: '800', fill: theme.credit },
    });
    t.anchor.set(0.5);
    t.position.set(b.x + b.width * 0.7, b.y);
    this.fxLayer.addChild(t);
    this.fx.add({
      target: t,
      to: { y: b.y - 26 * s, alpha: 0 },
      duration: timing.creditFloat,
      ease: ease.outCubic,
      owner: t,
      onComplete: () => t.destroy(),
    });
  }

  // ---- input --------------------------------------------------------------

  private onCardTap(index: number): void {
    const view = this.view;
    if (!view || view.pendingDiscard === 0) return;
    const pending = view.pendingDiscard;
    if (this.marked.has(index)) this.marked.delete(index);
    else if (this.marked.size < pending) this.marked.add(index);
    else {
      this.showHint('Enough picked. Tap one to undo.');
      return;
    }
    this.hand.setMarked(this.marked);
    this.applyView(view, true);
  }

  /** Bottom-row taps act for the seat on screen; during a pending flip they only skip to it. */
  private boardTap(act: () => void): void {
    if (this.pendingFlip) {
      this.skip();
      return;
    }
    act();
  }

  /** Runs a button's action with its tap stamp available to the turn hand-off. */
  private withTapAt(tapAt: number, act: () => void): void {
    this.actionTapAt = tapAt;
    try {
      act();
    } finally {
      this.actionTapAt = null;
    }
  }

  private onButtonTap(tapAt: number): void {
    const view = this.view;
    const button = this.button;
    if (!view || !button || !button.root.visible) return;
    if (button.mode === 'confirm') {
      const k = view.pendingDiscard - this.marked.size;
      if (k > 0) {
        this.showHint(`Pick ${plural(k, 'more card', 'more cards')}`);
        return;
      }
      const picked = [...this.marked].sort((a, b) => a - b);
      this.withTapAt(tapAt, () => this.callbacks.onDiscard(picked));
      return;
    }
    if (!guardOpen(this.endTurnArmedAt, tapAt, timing.endTurnGuard)) return;
    this.withTapAt(tapAt, () => this.callbacks.onEndTurn());
  }

  private pressFeedback(target: Container, onTap: (tapAt: number) => void): void {
    this.detachers.push(
      attachPress(target, {
        onDown: () => {
          this.ui.cancel(target.scale);
          this.ui.add({ target: target.scale, to: { x: 0.92, y: 0.92 }, duration: timing.pressFeedback, owner: target });
        },
        onRelease: () => {
          this.ui.cancel(target.scale);
          this.ui.add({ target: target.scale, to: { x: 1, y: 1 }, duration: 140, ease: ease.outBack, owner: target });
        },
        onTap,
      }),
    );
  }

  // ---- building -----------------------------------------------------------

  private drawBackground(layout: BoardLayout, viewer: Side, opponent: Side): void {
    const { width: vw, height: vh } = layout.viewport;
    const g = new Graphics();
    // No full-screen fill: the renderer's clear color is the backdrop. A
    // full-screen blended layer costs a whole frame of fill rate on
    // low-end/software GPUs. Only thin lines and the side bands are drawn.
    const step = Math.round(32 * layout.scale);
    for (let x = layout.board.x % step; x < vw; x += step) g.moveTo(x, 0).lineTo(x, vh);
    for (let y = 0; y < vh; y += step) g.moveTo(0, y).lineTo(vw, y);
    g.stroke({ width: 1, color: theme.grid, alpha: 0.35 });
    for (const [pos, s] of [['top', opponent], ['bottom', viewer]] as const) {
      const row = layout[pos].row;
      const color = sideColor(s);
      if (layout.rail) {
        // Phone: the bands are half the screen; a translucent fill that big costs a
        // frame of fill rate on software GPUs. A side-colored edge marks the band.
        g.rect(row.x, row.y, 3, row.height).fill({ color, alpha: pos === 'bottom' ? 0.7 : 0.4 });
      } else {
        g.rect(row.x, row.y, row.width, row.height).fill({ color, alpha: pos === 'bottom' ? 0.08 : 0.04 });
      }
      const edgeY = pos === 'top' ? row.y + row.height : row.y;
      g.moveTo(row.x + layout.pad, edgeY).lineTo(row.x + row.width - layout.pad, edgeY).stroke({ width: 1, color, alpha: 0.6 });
    }
    const rail = layout.rail;
    if (rail) {
      // Phone: a divider left of the rail.
      const x = rail.x - layout.gap / 2;
      g.moveTo(x, rail.y).lineTo(x, rail.y + rail.height).stroke({ width: 1, color: theme.grid, alpha: 0.9 });
    }
    this.bgLayer.addChild(g);
  }

  private buildSide(side: Side, row: SideRow, layout: BoardLayout, interactive: boolean): SideWidgets {
    const color = sideColor(side);
    const fontSize = row.label.height * 0.8;
    const name = new Text({
      text: side.toUpperCase(),
      style: { fontFamily: theme.monoFamily, fontSize, fontWeight: '700', fill: color, letterSpacing: 2 },
    });
    name.position.set(row.label.x, row.label.y);
    const handText = new Text({
      text: '',
      style: { fontFamily: theme.monoFamily, fontSize: fontSize * 0.9, fill: theme.textDim },
    });
    handText.position.set(row.label.x + name.width + fontSize * 0.8, row.label.y + fontSize * 0.08);
    const deck = new DeckPile(row.deck, side, layout.scale);
    const discard = new DiscardPile(row.discard, side, layout.scale);
    const credits = new Counter(this.ui, row.credits, side, 'credits', layout.scale);
    const clicks = new Counter(this.ui, row.clicks, side, 'clicks', layout.scale);
    this.boardLayer.addChild(name, handText, credits.root, clicks.root, discard.root, deck.root);
    // Only the viewer's (bottom) row is interactive.
    if (interactive) {
      this.pressFeedback(deck.root, () => this.boardTap(() => this.callbacks.onDeckTap()));
      this.pressFeedback(credits.root, () => this.boardTap(() => this.callbacks.onCreditsTap()));
    } else {
      for (const c of [deck.root, credits.root, clicks.root, discard.root]) c.eventMode = 'none';
    }
    return { side, row, deck, discard, credits, clicks, name, handText };
  }

  private buildCenter(layout: BoardLayout, viewer: Side): void {
    const s = layout.scale;
    const banner = new Text({
      text: '',
      style: { fontFamily: theme.monoFamily, fontSize: Math.round(layout.banner.height * 0.72), fontWeight: '700', fill: theme.text, letterSpacing: 1 },
    });
    banner.anchor.set(0.5);
    banner.position.set(layout.banner.x + layout.banner.width / 2, layout.banner.y + layout.banner.height / 2);
    const subMain = new Text({
      text: '',
      style: { fontFamily: theme.fontFamily, fontSize: Math.max(14, Math.round(20 * s)), fontWeight: '800', fill: theme.warn },
    });
    subMain.anchor.set(0.5, 0);
    subMain.position.set(layout.sub.x + layout.sub.width / 2, layout.sub.y);
    const subHelp = new Text({
      text: '',
      style: {
        fontFamily: theme.fontFamily,
        fontSize: Math.max(10, Math.round(12 * s)),
        fill: theme.textDim,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: layout.sub.width,
      },
    });
    subHelp.anchor.set(0.5, 0);
    subHelp.position.set(layout.sub.x + layout.sub.width / 2, layout.sub.y);
    const button = new ActionButton(layout.endTurn, sideColor(viewer), s);
    this.pressFeedback(button.root, (tapAt) => this.onButtonTap(tapAt));
    this.centerLayer.addChild(banner, subMain, subHelp, button.root);
    this.banner = banner;
    this.subMain = subMain;
    this.subHelp = subHelp;
    this.button = button;
  }

  private showGameOver(layout: BoardLayout, text: string, winner: Side, animate: boolean): void {
    const b = layout.gameOver;
    const s = layout.scale;
    const color = sideColor(winner);
    const root = new Container();
    root.position.set(b.x + b.width / 2, b.y + b.height / 2);
    const g = new Graphics();
    g.roundRect(-b.width / 2, -b.height / 2, b.width, b.height, 16 * s).fill({ color: 0x05040a, alpha: 0.92 });
    glowRoundRect(g, -b.width / 2, -b.height / 2, b.width, b.height, 16 * s, color, Math.max(2, 2.5 * s), 1.2);
    const btnW = Math.max(120, Math.round(150 * s));
    const btnH = Math.max(44, Math.round(46 * s));
    const title = new Text({
      text,
      style: {
        fontFamily: theme.fontFamily,
        fontSize: Math.max(14, Math.round(20 * s)),
        fontWeight: '800',
        fill: color,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: b.width - 24 * s,
      },
    });
    title.anchor.set(0.5);
    const room = b.height - btnH - 24 * s;
    title.position.set(0, -b.height / 2 + 10 * s + room / 2);
    if (title.height > room) title.scale.set(room / title.height);
    const btn = new Container();
    btn.position.set(0, b.height / 2 - 10 * s - btnH / 2);
    btn.hitArea = new Rectangle(-btnW / 2, -btnH / 2, btnW, btnH);
    btn.label = 'button:new-game';
    const bg = new Graphics();
    bg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, Math.min(14 * s, btnH / 2)).fill({ color: 0x000000, alpha: 0.6 });
    glowRoundRect(bg, -btnW / 2, -btnH / 2, btnW, btnH, Math.min(14 * s, btnH / 2), theme.text, 1.5, 0.5);
    const bl = new Text({
      text: 'New game',
      style: { fontFamily: theme.fontFamily, fontSize: Math.max(13, Math.round(16 * s)), fontWeight: '800', fill: theme.text },
    });
    bl.anchor.set(0.5);
    btn.addChild(bg, bl);
    this.pressFeedback(btn, () => this.callbacks.onNewGame());
    root.addChild(g, title, btn);
    this.centerLayer.addChild(root);
    this.gameOver = { text, root };
    if (animate) {
      root.scale.set(0.6);
      root.alpha = 0;
      this.fx.add({ target: root, to: { alpha: 1 }, duration: timing.gameOverIn, owner: root });
      this.fx.add({ target: root.scale, to: { x: 1, y: 1 }, duration: timing.gameOverIn, ease: ease.outBack, owner: root });
    }
  }

  // ---- hint and zoom ------------------------------------------------------

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
    // Never wider than its slot (left of the End turn button).
    const fit = Math.min(1, layout.hintArea.width / w, layout.hintArea.height / h);
    root.scale.set(fit);
    const hint = { text, root, box: { x: 0, y: 0, width: w * fit, height: h * fit } };
    this.positionHint(hint);
    root.alpha = 0;
    this.hintLayer.addChild(root);
    this.hint = hint;
    this.callbacks.log({ kind: 'hint', text, box: { ...hint.box }, scheduledMs: timing.hintIn + timing.hintVisible + timing.hintFade });
    const baseY = root.y;
    root.y = baseY + 8 * s;
    this.ui.add({ target: root, to: { alpha: 1, y: baseY }, duration: timing.hintIn, owner: root });
    this.ui.add({
      target: root,
      to: { alpha: 0 },
      delay: timing.hintVisible,
      duration: timing.hintFade,
      ease: ease.linear,
      owner: root,
      onComplete: () => {
        if (this.hint?.root === root) {
          root.destroy({ children: true });
          this.hint = null;
        }
      },
    });
  }

  private positionHint(hint: { root: Container; box: Box }): void {
    const a = this.layout?.hintArea;
    if (!a) return;
    const cx = a.x + a.width / 2;
    const cy = a.y + a.height / 2;
    hint.root.position.set(cx, cy);
    hint.box.x = cx - hint.box.width / 2;
    hint.box.y = cy - hint.box.height / 2;
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
    this.ui.add({ target: root, to: { alpha: 1 }, duration: timing.zoomIn, owner: root });
    this.ui.add({ target: card, to: { x: cx, y: cy }, duration: timing.zoomIn, ease: ease.outCubic, owner: card });
    this.ui.add({ target: card.scale, to: { x: 1, y: 1 }, duration: timing.zoomIn, ease: ease.outBack, owner: card });
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
      owner: zoom.root,
      onComplete: () => zoom.root.destroy({ children: true }),
    });
  }
}
