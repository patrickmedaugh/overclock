// The board renderer. Draws a PlayerView and animates engine events.
// Holds no game rules: every number shown comes from the view, every change
// comes from an engine event, every button's enabled state comes from
// view.legalActions / view.pendingDiscard, and every place a hand card can go
// (with its price and refusal reason) comes from view.handOptions.
// Viewer-relative: the seat in `view.viewer` is drawn at the bottom.
//
// Widgets are built once per size ("generation") and then only moved and
// updated: a turn change repositions the same objects for the other seat
// instead of rebuilding the board (it used to take > 100ms on a slow CPU).
import type { Action, CardOption, GameEvent, InstalledView, PlayerView, RejectReason, ServerId, Side, WinReason } from '@overclock/engine';
import { getCard } from '@overclock/cards';
import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { createCardBack, createCardFace, glowRoundRect, retireCardTextures } from './cardFace';
import { centeredBox } from './geometry';
import { Hand, type HandCard } from './hand';
import type { AnimRecord, Box, EndTurnClock, InstalledSnapshot, Insets, LayoutSnapshot, SideLayout, TargetSnapshot } from './hook-types';
import type { Presentation } from './hotseat';
import { hintFor } from './hints';
import { attachPress } from './input';
import { type BoardLayout, type BoardShape, type SideRow, computeLayout } from './layout';
import { SIDE_NAME, TERMS, plural, priceText, serverLabel, zoneName } from './terms';
import { sideColor, theme, timing } from './theme';
import { ease, type Tweens } from './tween';
import { ActionButton, Counter, DeckPile, DiscardPile, MemoryCounter, TargetMarker, fitText, placeAt } from './widgets';

type Pos = 'top' | 'bottom';
const SIDES: readonly Side[] = ['corp', 'runner'];
const other = (s: Side): Side => (s === 'corp' ? 'runner' : 'corp');

/** Refusals that apply to every target of a card alike: shown at once instead of lighting targets. */
const GATE_REASONS: ReadonlySet<RejectReason> = new Set(['game_over', 'not_your_turn', 'wrong_phase', 'no_clicks']);

/** Why the game ended, in plain words (completes "<Winner> wins: ..."). */
const WIN_REASON: Record<WinReason, string> = {
  corp_decked: `the Corp ran out of cards`,
};

export function gameOverText(result: { winner: Side; reason: WinReason }): string {
  return `${SIDE_NAME[result.winner]} wins: ${WIN_REASON[result.reason]}`;
}

export function bannerText(view: PlayerView): string {
  if (view.result) return 'GAME OVER';
  const who = view.activePlayer.toUpperCase();
  if (view.phase === 'discard') return `TURN ${view.turn} · ${who} · hand limit`;
  return `TURN ${view.turn} · ${who} · ${plural(view.players[view.activePlayer].clicks, 'click', 'clicks')} left`;
}

function handText(side: Side, n: number): string {
  return `${plural(n, 'card', 'cards')} in ${zoneName(side, 'hand')}`;
}

/** Texts drawn on screen under `c` (skipping hidden branches). */
function visibleTexts(c: Container, out: string[] = []): string[] {
  if (!c.visible || !c.renderable || c.destroyed) return out;
  for (const child of c.children) {
    if (child instanceof Text) {
      if (child.visible && child.renderable && child.text) out.push(child.text);
    } else visibleTexts(child, out);
  }
  return out;
}

function textsOf(c: Container): string[] {
  const out: string[] = [];
  for (const child of c.children) {
    if (child instanceof Text) out.push(child.text);
    else out.push(...textsOf(child));
  }
  return out;
}

/** True if any text of a centered w x h card runs outside it. */
function textOverflows(c: Container, w: number, h: number): boolean {
  const e = 0.5;
  const walk = (n: Container): boolean =>
    n.children.some((child) => {
      if (child instanceof Text) {
        const left = child.x - child.anchor.x * child.width;
        const top = child.y - child.anchor.y * child.height;
        return left < -w / 2 - e || top < -h / 2 - e || left + child.width > w / 2 + e || top + child.height > h / 2 + e;
      }
      return walk(child);
    });
  return walk(c);
}

function shapeOf(view: PlayerView): BoardShape {
  return {
    servers: view.corpServers.map((s) => ({ id: s.id, ice: s.ice.length, content: s.content.length })),
    rig: view.rig.length,
  };
}

/** One side's name, hand count, credits and clicks, for one position (top / bottom). */
interface SeatWidgets {
  side: Side;
  pos: Pos;
  root: Container;
  label: Container;
  name: Text;
  handText: Text;
  credits: Counter;
  clicks: Counter;
}

interface InstalledCard {
  uid: string;
  owner: Side;
  zone: 'ice' | 'content' | 'rig';
  root: Container;
  visual: Container;
  visualKey: string;
  cardId: string | null;
  faceUp: boolean;
  /** Drawn bounds (ICE: sideways). */
  box: Box;
  detach: () => void;
}

interface ColumnWidgets {
  label: Text;
  frame: Graphics;
  frameKey: string;
}

interface ActiveTarget {
  kind: TargetSnapshot['kind'];
  server?: string;
  option: CardOption;
  marker: TargetMarker;
}

/** Everything built for one size of the board. */
interface Generation {
  sizeKey: string;
  detachers: (() => void)[];
  bg: Partial<Record<Side, Graphics>>;
  seats: Map<string, SeatWidgets>;
  decks: Record<Side, DeckPile>;
  discards: Record<Side, DiscardPile>;
  hq: DeckPile;
  memory: MemoryCounter;
  columns: Map<string, ColumnWidgets>;
  installed: Map<string, InstalledCard>;
  targets: Map<string, TargetMarker>;
  banner: Text;
  subMain: Text;
  subHelp: Text;
  button: ActionButton;
}

export interface BoardCallbacks {
  onDeckTap(): void;
  onCreditsTap(): void;
  onEndTurn(): void;
  onDiscard(handIndices: number[]): void;
  /** An install/play action taken from view.handOptions. */
  onAction(action: Action): void;
  onNewGame(): void;
  /** The board changed outside a dispatch (a card picked or let go): redraw, and hit-test the new places at once. */
  changed(): void;
  log(rec: Omit<AnimRecord, 'startedAt'>): void;
}

export class Board {
  readonly stage = new Container();
  /** Everything that belongs to one seat's board; fades in on a turn change. */
  private readonly table = new Container();
  private readonly bgLayer = new Container();
  private readonly boardLayer = new Container();
  private readonly installedLayer = new Container();
  private readonly centerLayer = new Container();
  private readonly targetLayer = new Container();
  private readonly handLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly hintLayer = new Container();
  private readonly zoomLayer = new Container();
  /** One hand per seat, kept between turns. */
  private readonly hands: Record<Side, Hand>;
  /** Catches taps on empty board (cancels a picked card). */
  private readonly catcher = new Container();
  private viewport: { width: number; height: number; insets: Partial<Insets> } | null = null;
  private layout: BoardLayout | null = null;
  private view: PlayerView | null = null;
  private gen: Generation | null = null;
  private gameOver: { text: string; root: Container } | null = null;
  private hint: { text: string; root: Container; box: Box } | null = null;
  private zoom: { cardId: string | null; root: Container; card: Container; width: number; height: number; overflow: boolean } | null = null;
  /** Hand indices picked in the discard picker (UI state only). */
  private readonly marked = new Set<number>();
  /** Hand index picked to play (UI state only). */
  private selected: number | null = null;
  private activeTargets: ActiveTarget[] = [];
  /** The banner's text on one line (the rail may wrap it). */
  private bannerFull = '';
  /** End turn ignores taps until this time (double-tap guard after a turn change). */
  private endTurnArmedAt = 0;
  /** When the last turn change's flip is due (tap time + discard flight). */
  private flipDueAt = 0;
  /**
   * True while the actor's discards fly out and the board still shows the
   * actor's seat, although the turn already belongs to the next seat. A tap on
   * the bottom row then only skips ahead to the flip: it must not spend a
   * click of the player whose board is not on screen yet.
   */
  private flipPending = false;

  constructor(
    private readonly fx: Tweens,
    private readonly ui: Tweens,
    private readonly callbacks: BoardCallbacks,
  ) {
    const handCallbacks = (side: Side) => ({
      onTap: (i: number) => this.onCardTap(i),
      onLongPress: (id: string, from: Box) => this.openZoom(id, side, from),
      onLongPressEnd: () => this.closeZoom(),
      log: (r: Omit<AnimRecord, 'startedAt'>) => callbacks.log(r),
    });
    this.hands = { corp: new Hand('corp', fx, ui, handCallbacks('corp')), runner: new Hand('runner', fx, ui, handCallbacks('runner')) };
    this.handLayer.addChild(this.hands.corp.container, this.hands.runner.container);
    this.zoomLayer.eventMode = 'none';
    this.hintLayer.eventMode = 'none';
    this.fxLayer.eventMode = 'none';
    this.catcher.label = 'board:empty';
    attachPress(this.catcher, {
      onTap: () => {
        if (this.selected !== null) this.cancelSelection();
      },
    });
    this.catcher.cursor = 'default';
    this.table.addChild(this.catcher, this.bgLayer, this.boardLayer, this.installedLayer, this.centerLayer, this.targetLayer, this.handLayer);
    this.stage.addChild(this.table, this.fxLayer, this.hintLayer, this.zoomLayer);
  }

  /** New viewport size / safe-area insets (start, resize, rotate). */
  setViewport(width: number, height: number, insets: Partial<Insets>): void {
    this.fx.finishAll();
    this.viewport = { width, height, insets };
    this.catcher.hitArea = new Rectangle(0, 0, width, height);
    if (this.view) this.fullRender();
    if (this.hint) this.positionHint(this.hint);
    this.syncHelp();
  }

  /** Shows the result of one action (see Presentation). */
  show(p: Presentation): void {
    // Tap-to-skip: finish whatever is still animating before the new events.
    this.fx.finishAll();
    if (p.kind === 'same') this.render(p.view, p.events);
    else this.handoff(p);
  }

  /** Shows a view and animates the events that produced it (same seat). */
  render(view: PlayerView, events: readonly GameEvent[]): void {
    this.fx.finishAll();
    const prev = this.view;
    this.view = view;
    if (!this.viewport) return;
    if (!prev || prev.viewer !== view.viewer || !this.gen) {
      this.fullRender();
      return;
    }
    const viewer = view.viewer;
    const hand = this.hands[viewer];
    const rejected = events.some((e) => e.type === 'action_rejected');
    // Hand cards leaving for the table or a pile are taken out before the hand resyncs.
    const leaving: { e: Extract<GameEvent, { type: 'card_installed' | 'card_played' }>; card: HandCard; box: Box }[] = [];
    for (const e of events) {
      if ((e.type === 'card_installed' || e.type === 'card_played') && e.player === viewer && e.handIndex !== undefined) {
        const taken = hand.takeOut(e.handIndex);
        if (taken) leaving.push({ e, ...taken });
      }
    }
    // A refused tap on a lit target keeps the card picked; anything else that changed the game drops it.
    if (!rejected) this.selected = null;
    const ids = view.players[viewer].hand ?? [];
    if (this.selected !== null && this.selected >= ids.length) this.selected = null;
    const layout = this.sync(view, true);
    if (!layout) return;
    const drawn = events.filter((e) => e.type === 'card_drawn' && e.player === viewer).length;
    this.syncHand(hand, layout, ids, drawn);
    if (view.pendingDiscard === 0 || ids.length !== (prev.players[viewer].hand ?? []).length) this.marked.clear();
    hand.setMarked(this.marked);
    hand.setSelected(this.selected);
    this.showTargets();
    this.applyView(view, true);
    for (const l of leaving) this.flyFromHand(l.e, l.card, layout);
    for (const e of events) {
      if (e.type === 'server_created') this.serverOpen(e.server, layout);
      if (e.type === 'credits_spent' && e.player === viewer) this.creditFloat(-e.amount);
      if (e.type === 'credit_gained' && e.player === viewer) this.creditFloat(e.amount);
      if (e.type === 'action_rejected') {
        this.showHint(hintFor(e.reason, view));
        if (e.reason === 'no_clicks') this.seatAt('bottom')?.clicks.shake();
      }
    }
  }

  /** The End turn guard and flip timestamps (test hook). */
  endTurnClock(): EndTurnClock {
    return { armedAt: this.endTurnArmedAt, flipDueAt: this.flipDueAt };
  }

  snapshot(): LayoutSnapshot {
    const layout = this.layout;
    const view = this.view;
    const gen = this.gen;
    const zero = { x: 0, y: 0, width: 0, height: 0 };
    const side = (s: Side): SideLayout => {
      const seat = this.seatOf(s);
      if (!gen || !seat || !layout) return { deck: zero, credits: zero, clicks: zero, discard: zero, label: zero };
      return { deck: gen.decks[s].box(), credits: seat.credits.box(), clicks: seat.clicks.box(), discard: gen.discards[s].box(), label: layout[seat.pos].label };
    };
    const inst = (v: InstalledView): InstalledSnapshot => {
      const c = gen?.installed.get(v.uid);
      const ice = c?.zone === 'ice';
      const u = layout?.unit ?? { width: 0, height: 0 };
      return {
        uid: v.uid,
        cardId: v.cardId,
        faceUp: v.faceUp,
        box: c ? centeredBox(c.root, ice ? u.height : u.width, ice ? u.width : u.height) : zero,
      };
    };
    const corp = this.seatOf('corp');
    const runner = this.seatOf('runner');
    const button = gen?.button;
    const pending = view?.pendingDiscard ?? 0;
    const viewer = view?.viewer ?? 'corp';
    return {
      mode: layout?.mode ?? 'portrait',
      viewport: layout?.viewport ?? { width: 0, height: 0 },
      safeArea: layout?.insets ?? { top: 0, right: 0, bottom: 0, left: 0 },
      viewer,
      corp: side('corp'),
      runner: side('runner'),
      handArea: layout?.handArea ?? zero,
      hand: this.hands[viewer].boxes(),
      servers:
        view && layout
          ? view.corpServers.map((srv, i) => {
              const slots = layout.corp.servers[i];
              return {
                id: srv.id,
                label: gen?.columns.get(srv.id)?.label.text ?? serverLabel(srv.id),
                box: slots?.column ?? zero,
                labelBox: slots?.label ?? zero,
                root: slots?.root ?? null,
                ice: srv.ice.map(inst),
                content: srv.content.map(inst),
              };
            })
          : [],
      rig: view ? view.rig.map(inst) : [],
      memory: {
        used: view?.memory.used ?? 0,
        limit: view?.memory.limit ?? 0,
        text: gen?.memory.text ?? '',
        box: gen?.memory.box() ?? zero,
      },
      targets: this.activeTargets.map((t) => ({
        kind: t.kind,
        ...(t.server !== undefined ? { server: t.server } : {}),
        box: { ...t.marker.box },
        label: t.marker.text,
        lit: t.option.reject === null,
        reject: t.option.reject,
      })),
      selected: this.selected,
      labels: [...visibleTexts(this.boardLayer), ...visibleTexts(this.centerLayer), ...visibleTexts(this.targetLayer)],
      text: {
        banner: gen?.banner.visible ? this.bannerFull : '',
        corpCredits: corp?.credits.text ?? '',
        corpClicks: corp?.clicks.text ?? '',
        runnerCredits: runner?.credits.text ?? '',
        runnerClicks: runner?.clicks.text ?? '',
        corpHand: corp?.handText.text ?? '',
        runnerHand: runner?.handText.text ?? '',
        corpDiscard: gen?.discards.corp.text ?? '',
        runnerDiscard: gen?.discards.runner.text ?? '',
      },
      endTurn:
        button && button.root.visible && button.mode === 'end'
          ? { box: button.box(), label: button.text, glowing: button.glowing, enabled: button.enabled }
          : null,
      picker:
        button && button.root.visible && button.mode === 'confirm' && pending > 0
          ? { remaining: pending - this.marked.size, label: gen?.subMain.text ?? '', confirm: { box: button.box(), enabled: button.enabled } }
          : null,
      gameOver: this.gameOver && layout ? { text: this.gameOver.text, box: layout.gameOver } : null,
      hint: this.hint && this.hint.root.alpha > 0.05 ? { text: this.hint.text, box: this.hint.box } : null,
      zoom: this.zoom
        ? { cardId: this.zoom.cardId, box: centeredBox(this.zoom.card, this.zoom.width, this.zoom.height), texts: textsOf(this.zoom.card), textOverflow: this.zoom.overflow }
        : null,
      animating: this.fx.active,
    };
  }

  // ---- turn change --------------------------------------------------------

  private handoff(p: Extract<Presentation, { kind: 'handoff' }>): void {
    const layout = this.layout;
    // The double-tap guard counts from this tap (End turn / Confirm), not from the
    // flip: the flip waits for the discard flight, and the button is hidden until then.
    const tappedAt = performance.now();
    // The actor's own view from here on: no picker, nothing to tap but the
    // board's deck/credits, which already act for the new seat.
    this.view = p.actorView;
    this.marked.clear();
    this.cancelSelection();
    const actorHand = this.hands[p.actor];
    actorHand.setMarked(this.marked);
    if (this.gen) {
      this.gen.button.root.visible = false;
      this.gen.subMain.visible = false;
    }
    let discardMs = 0;
    let discarded = false;
    if (layout) {
      for (const e of p.actorEvents) {
        if (e.type === 'cards_discarded' && e.player === p.actor && e.handIndices) {
          discardMs = actorHand.discardOut(e.handIndices, layout.bottom.discard);
          discarded = true;
          this.callbacks.log({ kind: 'discard_flight', scheduledMs: discardMs, box: layout.bottom.discard });
        }
      }
    }
    this.callbacks.log({ kind: 'turn_change', scheduledMs: discardMs + timing.flip });
    this.flipDueAt = tappedAt + discardMs;
    // Set now, not at the flip: the guard counts from this tap.
    this.endTurnArmedAt = tappedAt + timing.endTurnGuard;
    const flip = () => {
      this.flipPending = false;
      this.switchSeat(p.nextView, p.nextEvents);
      // The actor's pile is now in the top row: pop it so the new count is noticed.
      if (discarded) this.gen?.discards[p.actor].pop(this.ui);
    };
    if (discardMs > 0) {
      this.flipPending = true;
      this.fx.after(discardMs, flip);
    } else flip();
  }

  /** Turns the board over to `view`'s seat: same widgets, new places, then the fade-in. */
  private switchSeat(view: PlayerView, events: readonly GameEvent[]): void {
    this.closeZoom(true);
    this.view = view;
    this.selected = null;
    const layout = this.sync(view, false);
    if (!layout) return;
    const viewer = view.viewer;
    this.showHand(viewer);
    const hand = this.hands[viewer];
    const ids = view.players[viewer].hand ?? [];
    const drawn = events.filter((e) => e.type === 'card_drawn' && e.player === viewer).length;
    if (hand.sizeKey !== layout.sizeKey) hand.setLayout(layout, ids.slice(0, ids.length - drawn));
    else hand.useLayout(layout);
    hand.sync(ids, drawn, layout.bottom.deck, drawn > 0 ? timing.drawAfterFlip : 0);
    if (view.pendingDiscard === 0) this.marked.clear();
    hand.setMarked(this.marked);
    hand.setSelected(null);
    this.showTargets();
    this.applyView(view, true);

    this.table.alpha = 0.15;
    this.fx.add({ target: this.table, to: { alpha: 1 }, duration: timing.flip, ease: ease.outCubic });
    this.sweep(layout, viewer);
    const b = this.gen?.banner;
    if (b) {
      const base = b.scale.x;
      b.scale.set(base * 1.25);
      this.fx.add({ target: b.scale, to: { x: base, y: base }, duration: timing.flip, ease: ease.outBack, owner: b });
    }
  }

  /** A neon line sweeps from the new player's side up the board. */
  private sweep(layout: BoardLayout, viewer: Side): void {
    const g = new Graphics();
    const b = layout.board;
    const color = sideColor(viewer);
    g.rect(b.x, -2, b.width, 4).fill({ color, alpha: 0.9 });
    g.rect(b.x, -10, b.width, 20).fill({ color, alpha: 0.12 });
    g.y = layout.bottom.row.y + layout.bottom.row.height;
    this.fxLayer.addChild(g);
    this.fx.add({
      target: g,
      to: { y: layout.top.row.y, alpha: 0 },
      duration: timing.flip,
      ease: ease.outCubic,
      owner: g,
      onComplete: () => g.destroy(),
    });
  }

  // ---- building and placing ----------------------------------------------

  /** Re-renders `this.view` from scratch (start, resize, a new seat without a flip). */
  private fullRender(): void {
    const view = this.view;
    if (!view) return;
    this.closeZoom(true);
    this.selected = null;
    const layout = this.sync(view, false);
    if (!layout) return;
    const viewer = view.viewer;
    this.showHand(viewer);
    const hand = this.hands[viewer];
    this.syncHand(hand, layout, view.players[viewer].hand ?? [], 0);
    if (view.pendingDiscard === 0) this.marked.clear();
    hand.setMarked(this.marked);
    hand.setSelected(null);
    this.showTargets();
    this.applyView(view, false);
    this.table.alpha = 1;
  }

  private showHand(viewer: Side): void {
    for (const s of SIDES) this.hands[s].container.visible = s === viewer;
  }

  private syncHand(hand: Hand, layout: BoardLayout, ids: readonly string[], drawn: number): void {
    if (hand.sizeKey !== layout.sizeKey) hand.setLayout(layout, ids);
    else {
      hand.useLayout(layout);
      hand.sync(ids, drawn, layout.bottom.deck);
    }
  }

  /** Lays the board out for `view` and puts every widget in place (building what is missing). */
  private sync(view: PlayerView, animate: boolean): BoardLayout | null {
    const vp = this.viewport;
    if (!vp) return null;
    const layout = computeLayout(vp.width, vp.height, vp.insets, { viewer: view.viewer, shape: shapeOf(view) });
    if (!this.gen || this.gen.sizeKey !== layout.sizeKey) this.newGeneration(layout);
    this.layout = layout;
    const gen = this.gen!;
    const viewer = view.viewer;
    const opponent = other(viewer);

    if (!gen.bg[viewer]) gen.bg[viewer] = this.drawBackground(layout, viewer);
    for (const s of SIDES) {
      const bg = gen.bg[s];
      if (bg) bg.visible = s === viewer;
    }

    const top = this.seat(gen, opponent, 'top', layout);
    const bottom = this.seat(gen, viewer, 'bottom', layout);
    for (const w of gen.seats.values()) w.root.visible = w === top || w === bottom;

    const rowOf = (s: Side): SideRow => (s === viewer ? layout.bottom : layout.top);
    for (const s of SIDES) {
      placeAt(gen.decks[s].root, rowOf(s).deck);
      placeAt(gen.discards[s].root, rowOf(s).discard);
      gen.decks[s].root.eventMode = s === viewer ? 'static' : 'none';
    }
    const hqRoot = layout.corp.servers[0]?.root;
    if (hqRoot) placeAt(gen.hq.root, hqRoot);

    for (const slots of [...layout.corp.servers, layout.corp.newServer]) {
      let col = gen.columns.get(slots.id);
      if (!col) {
        const label = new Text({
          text: serverLabel(slots.id),
          style: { fontFamily: theme.monoFamily, fontSize: Math.max(8, Math.round(slots.label.height * 0.85)), fontWeight: '700', fill: theme.corp, letterSpacing: 0.5 },
        });
        label.anchor.set(0.5);
        const frame = new Graphics();
        frame.eventMode = 'none';
        label.eventMode = 'none';
        col = { label, frame, frameKey: '' };
        this.boardLayer.addChildAt(frame, 0);
        this.boardLayer.addChild(label);
        gen.columns.set(slots.id, col);
        fitText(label, slots.column.width - 2);
      }
      col.label.position.set(slots.label.x + slots.label.width / 2, slots.label.y + slots.label.height / 2);
      const c = slots.column;
      const key = `${c.x},${c.y},${c.width},${c.height}`;
      if (col.frameKey !== key && slots.id !== 'new') {
        col.frameKey = key;
        col.frame.clear();
        col.frame.roundRect(c.x, c.y, c.width, c.height, 6).fill({ color: theme.corp, alpha: 0.035 }).stroke({ width: 1, color: theme.corp, alpha: 0.18 });
      }
      col.label.visible = slots.id !== 'new';
    }

    const seen = new Set<string>();
    view.corpServers.forEach((srv, i) => {
      const slots = layout.corp.servers[i];
      if (!slots) return;
      srv.content.forEach((c, k) => {
        const b = slots.content[k];
        if (b) this.placeInstalled(gen, layout, c, 'corp', 'content', b, animate, seen);
      });
      srv.ice.forEach((c, k) => {
        const b = slots.ice[k];
        if (b) this.placeInstalled(gen, layout, c, 'corp', 'ice', b, animate, seen);
      });
    });
    view.rig.forEach((c, k) => {
      const b = layout.rig.cards[k];
      if (b) this.placeInstalled(gen, layout, c, 'runner', 'rig', b, animate, seen);
    });
    for (const [uid, card] of gen.installed) {
      if (!seen.has(uid)) {
        card.detach();
        this.fx.cancel(card.root);
        card.root.destroy({ children: true });
        gen.installed.delete(uid);
      }
    }

    placeAt(gen.memory.root, layout.rig.memory);
    this.placeCenter(gen, layout, viewer);
    return layout;
  }

  /** Builds the widgets for a new board size (start, resize, or the table outgrew its room). */
  private newGeneration(layout: BoardLayout): void {
    this.closeZoom(true);
    this.destroyGeneration();
    retireCardTextures();
    const s = layout.scale;
    const unit = layout.unit;
    const detachers: (() => void)[] = [];
    const press = (target: Container, onTap: () => void) => detachers.push(this.pressFeedback(target, onTap));
    const deck = (side: Side) => {
      const d = new DeckPile(unit, side, s, side === 'runner' ? TERMS.stack : null, `deck:${side}`);
      press(d.root, () =>
        this.boardTap(() => {
          if (this.view?.viewer === side) this.callbacks.onDeckTap();
        }),
      );
      return d;
    };
    const decks = { corp: deck('corp'), runner: deck('runner') };
    const discards = { corp: new DiscardPile(unit, 'corp', s, TERMS.archives), runner: new DiscardPile(unit, 'runner', s, TERMS.heap) };
    const hq = new DeckPile(unit, 'corp', s, null, 'hq');
    hq.root.eventMode = 'none';
    for (const p of [discards.corp, discards.runner]) p.root.eventMode = 'none';
    const memory = new MemoryCounter(layout.rig.memory, s);
    this.boardLayer.addChild(hq.root, decks.corp.root, decks.runner.root, discards.corp.root, discards.runner.root, memory.root);

    const banner = new Text({
      text: '',
      style: {
        fontFamily: theme.monoFamily,
        fontSize: layout.mode === 'landscape' ? Math.max(10, Math.round(11 * s)) : Math.round(layout.banner.height * 0.72),
        fontWeight: '700',
        fill: theme.text,
        letterSpacing: layout.mode === 'landscape' ? 0 : 1,
        align: 'center',
        wordWrap: layout.mode === 'landscape',
        wordWrapWidth: layout.banner.width,
        lineHeight: layout.mode === 'landscape' ? Math.max(12, Math.round(13 * s)) : undefined,
      },
    });
    banner.anchor.set(0.5);
    const subMain = new Text({
      text: '',
      style: { fontFamily: theme.fontFamily, fontSize: Math.max(14, Math.round(20 * Math.min(s, 1))), fontWeight: '800', fill: theme.warn },
    });
    subMain.anchor.set(0.5);
    const subHelp = new Text({
      text: '',
      style: {
        fontFamily: theme.fontFamily,
        fontSize: Math.max(10, Math.round(12 * Math.min(s, 1.1))),
        fill: theme.textDim,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: 100,
        lineHeight: Math.max(12, Math.round(14 * Math.min(s, 1.1))),
      },
    });
    subHelp.anchor.set(0.5, 0);
    const button = new ActionButton(layout.endTurn, sideColor(layout.viewer), s, 'button:action');
    press(button.root, () => this.onButtonTap());
    this.centerLayer.addChild(banner, subMain, subHelp, button.root);
    this.gameOver = null;

    this.gen = {
      sizeKey: layout.sizeKey,
      detachers,
      bg: {},
      seats: new Map(),
      decks,
      discards,
      hq,
      memory,
      columns: new Map(),
      installed: new Map(),
      targets: new Map(),
      banner,
      subMain,
      subHelp,
      button,
    };
    // Hand sprites are sized for the old board: rebuilt when next shown.
    for (const side of SIDES) this.hands[side].reset();
  }

  private destroyGeneration(): void {
    const gen = this.gen;
    if (!gen) return;
    for (const d of gen.detachers) d();
    for (const c of gen.installed.values()) c.detach();
    for (const layer of [this.bgLayer, this.boardLayer, this.installedLayer, this.centerLayer, this.targetLayer]) {
      for (const c of layer.removeChildren()) c.destroy({ children: true });
    }
    this.activeTargets = [];
    this.gen = null;
    this.gameOver = null;
  }

  /** The seat widgets for `side` at `pos` (built on first use), placed for `layout`. */
  private seat(gen: Generation, side: Side, pos: Pos, layout: BoardLayout): SeatWidgets {
    const key = `${side}@${pos}`;
    const row = layout[pos];
    let w = gen.seats.get(key);
    if (!w) {
      const root = new Container();
      const fontSize = Math.max(9, row.label.height * 0.8);
      const name = new Text({
        text: SIDE_NAME[side].toUpperCase(),
        style: { fontFamily: theme.monoFamily, fontSize, fontWeight: '700', fill: sideColor(side), letterSpacing: 1.5 },
      });
      const hand = new Text({ text: '', style: { fontFamily: theme.monoFamily, fontSize: fontSize * 0.9, fill: theme.textDim } });
      hand.y = fontSize * 0.06;
      const label = new Container();
      label.addChild(name, hand);
      label.eventMode = 'none';
      const credits = new Counter(this.ui, row.credits, side, 'credits', layout.scale);
      const clicks = new Counter(this.ui, row.clicks, side, 'clicks', layout.scale);
      clicks.root.eventMode = 'none';
      if (pos === 'bottom') gen.detachers.push(this.pressFeedback(credits.root, () => this.boardTap(() => this.callbacks.onCreditsTap())));
      else credits.root.eventMode = 'none';
      root.addChild(label, credits.root, clicks.root);
      this.boardLayer.addChild(root);
      w = { side, pos, root, label, name, handText: hand, credits, clicks };
      gen.seats.set(key, w);
    }
    w.label.position.set(row.label.x, row.label.y + Math.max(0, (row.label.height - w.name.height) / 2));
    placeAt(w.credits.root, row.credits);
    placeAt(w.clicks.root, row.clicks);
    return w;
  }

  /** The visible seat widgets for `side` / at `pos`. */
  private seatOf(side: Side): SeatWidgets | undefined {
    const view = this.view;
    if (!view) return undefined;
    return this.gen?.seats.get(`${side}@${side === view.viewer ? 'bottom' : 'top'}`);
  }

  private seatAt(pos: Pos): SeatWidgets | undefined {
    const view = this.view;
    if (!view) return undefined;
    return this.seatOf(pos === 'bottom' ? view.viewer : other(view.viewer));
  }

  private placeInstalled(gen: Generation, layout: BoardLayout, v: InstalledView, owner: Side, zone: InstalledCard['zone'], b: Box, animate: boolean, seen: Set<string>): void {
    seen.add(v.uid);
    const u = layout.unit.width;
    const uh = layout.unit.height;
    let card = gen.installed.get(v.uid);
    if (!card) {
      const root = new Container();
      root.label = `installed:${v.uid}`;
      root.hitArea = new Rectangle(-u / 2, -uh / 2, u, uh);
      if (zone === 'ice') root.rotation = Math.PI / 2;
      const visual = new Container();
      root.addChild(visual);
      const c: InstalledCard = { uid: v.uid, owner, zone, root, visual, visualKey: '', cardId: v.cardId, faceUp: v.faceUp, box: b, detach: () => {} };
      c.detach = attachPress(root, {
        onTap: () => {
          if (this.selected !== null) this.cancelSelection();
        },
        onLongPress: () => this.openZoom(c.cardId, c.owner, c.box),
        onLongPressEnd: () => this.closeZoom(),
      });
      root.cursor = 'default';
      this.installedLayer.addChild(root);
      gen.installed.set(v.uid, c);
      placeAt(root, b);
      card = c;
    } else if (animate && (card.box.x !== b.x || card.box.y !== b.y)) {
      this.fx.cancel(card.root);
      this.fx.add({ target: card.root, to: { x: b.x + b.width / 2, y: b.y + b.height / 2 }, duration: timing.handShift, ease: ease.outCubic, owner: card.root });
    } else {
      this.fx.cancel(card.root);
      placeAt(card.root, b);
    }
    card.box = b;
    card.cardId = v.cardId;
    card.faceUp = v.faceUp;
    const visualKey = v.faceUp && v.cardId ? `face:${v.cardId}` : 'back';
    if (card.visualKey !== visualKey) {
      card.visualKey = visualKey;
      for (const c of card.visual.removeChildren()) c.destroy({ children: true });
      const def = v.faceUp && v.cardId ? getCard(v.cardId) : undefined;
      card.visual.addChild(def ? createCardFace(def, u, uh, 'small') : createCardBack(owner, u, uh));
    }
  }

  /** Banner, help, End turn: placed for the viewer (the column layout moves them with the bands). */
  private placeCenter(gen: Generation, layout: BoardLayout, viewer: Side): void {
    const { banner, sub, action, endTurn } = layout;
    gen.banner.position.set(banner.x + banner.width / 2, banner.y + banner.height / 2);
    gen.subMain.position.set(action.x + action.width / 2, action.y + action.height / 2);
    const help = this.helpBox(layout);
    gen.subHelp.style.wordWrapWidth = Math.max(40, help.width - 4);
    gen.subHelp.position.set(help.x + help.width / 2, help.y);
    placeAt(gen.button.root, endTurn);
    gen.button.color = sideColor(viewer);
    void sub;
  }

  /** Where the help text goes: below the Play button (sideways) or left of it (column). */
  private helpBox(layout: BoardLayout): Box {
    const { sub, action } = layout;
    if (layout.mode === 'landscape') {
      const y = action.y + action.height + 4;
      return { x: sub.x, y, width: sub.width, height: Math.max(0, sub.y + sub.height - y) };
    }
    return { x: sub.x, y: sub.y, width: Math.max(0, action.x - 6 - sub.x), height: sub.height };
  }

  // ---- view -> widgets ----------------------------------------------------

  private applyView(view: PlayerView, animate: boolean): void {
    const layout = this.layout;
    const gen = this.gen;
    if (!layout || !gen) return;
    const viewer = view.viewer;
    for (const s of SIDES) {
      const w = this.seatOf(s);
      const p = view.players[s];
      gen.decks[s].setCount(p.deckCount);
      gen.discards[s].set(p.discardCount, p.discard);
      if (!w) continue;
      w.credits.set(p.credits, animate);
      w.clicks.set(p.clicks, animate);
      const ht = handText(s, p.handCount);
      if (w.handText.text !== ht) w.handText.text = ht;
      const fs = w.name.style.fontSize as number;
      w.handText.x = w.name.width + fs * 0.7;
      const row = layout[w.pos].label;
      w.label.scale.set(Math.min(1, row.width / Math.max(1, w.handText.x + w.handText.width)));
      const mine = s === viewer;
      gen.decks[s].setActionable(mine && view.legalActions.some((a) => a.type === 'draw'));
      w.credits.setActionable(mine && view.legalActions.some((a) => a.type === 'gain_credit'));
    }
    gen.hq.setCount(view.players.corp.handCount);
    gen.memory.set(view.memory.used, view.memory.limit);

    const banner = gen.banner;
    banner.visible = !view.result;
    const bt = bannerText(view);
    this.bannerFull = bt;
    // Sideways, the narrow rail shows it on two lines: "TURN 3 · CORP" / "2 clicks left".
    const shown = layout.mode === 'landscape' ? bt.replace(/ · (?=[^·]*$)/, '\n') : bt;
    if (banner.text !== shown) banner.text = shown;
    banner.style.fill = view.phase === 'discard' ? theme.warn : sideColor(view.activePlayer);
    fitText(banner, layout.banner.width, layout.banner.height);

    const pending = view.pendingDiscard;
    const main = gen.subMain;
    const help = gen.subHelp;
    main.visible = pending > 0;
    help.visible = !view.result;
    let helpText: string;
    if (pending > 0) {
      const k = pending - this.marked.size;
      main.text = k > 0 ? `Discard ${k}` : 'Tap Confirm';
      fitText(main, layout.action.width - 4, layout.action.height - 2);
      // The hand limit comes from the view (hand - pending), not a client constant.
      const keep = view.players[viewer].handCount - pending;
      helpText = `You can keep ${keep} cards. Tap cards to pick them.\nHold a card to read it.`;
    } else if (this.selected !== null) {
      helpText = 'Tap a lit spot to play it.\nTap the card again to cancel.';
    } else if (view.activePlayer === viewer && view.phase === 'action' && view.players[viewer].clicks === 0) {
      helpText = "No clicks left. Tap End turn when you're ready.";
    } else {
      const deck = viewer === 'corp' ? TERMS.rd : `your ${TERMS.stack}`;
      helpText = `Tap ${deck} to draw, your credits for +1, or a card to play it.\nHold a card to read it.`;
    }
    if (help.text !== helpText) help.text = helpText;
    const hb = this.helpBox(layout);
    fitText(help, hb.width, hb.height);
    this.syncHelp();

    const button = gen.button;
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

    if (view.result && !this.gameOver) this.showGameOver(layout, gameOverText(view.result), view.result.winner, animate);
  }

  /** "+3" / "-5" floating up from the viewer's credits. */
  private creditFloat(amount: number): void {
    const layout = this.layout;
    const w = this.seatAt('bottom');
    if (!layout || !w || amount === 0) return;
    const b = w.credits.box();
    this.callbacks.log({ kind: 'credit_pop', scheduledMs: Math.max(timing.creditPop, timing.creditFloat), box: b });
    const s = Math.min(layout.scale, 1.2);
    const t = new Text({
      text: amount > 0 ? `+${amount}` : `${amount}`,
      style: { fontFamily: theme.monoFamily, fontSize: Math.round(20 * s), fontWeight: '800', fill: amount > 0 ? theme.credit : theme.warn },
    });
    t.anchor.set(0.5);
    t.position.set(b.x + b.width * 0.7, b.y + (amount > 0 ? 0 : b.height * 0.3));
    this.fxLayer.addChild(t);
    this.fx.add({
      target: t,
      to: { y: t.y - 26 * s, alpha: 0 },
      duration: timing.creditFloat,
      ease: ease.outCubic,
      owner: t,
      onComplete: () => t.destroy(),
    });
  }

  /** A hand card flies to its installed spot (turning face down for the Corp) or to its owner's pile. */
  private flyFromHand(e: Extract<GameEvent, { type: 'card_installed' | 'card_played' }>, card: HandCard, layout: BoardLayout): void {
    const gen = this.gen;
    const root = card.root;
    if (!gen) {
      root.destroy({ children: true });
      return;
    }
    this.fxLayer.addChild(root);
    const hw = layout.card.width;
    if (e.type === 'card_installed') {
      const target = gen.installed.get(e.uid);
      if (!target) {
        root.destroy({ children: true });
        return;
      }
      const dest = target.box;
      target.root.alpha = 0;
      const faceDown = e.player === 'corp';
      const scale = layout.unit.width / hw;
      this.callbacks.log({ kind: 'install_flight', scheduledMs: timing.installFlight, box: { ...dest } });
      this.fx.add({
        target: root,
        to: { x: dest.x + dest.width / 2, y: dest.y + dest.height / 2, rotation: e.zone === 'ice' ? Math.PI / 2 : 0 },
        duration: timing.installFlight,
        ease: ease.inOutCubic,
        owner: root,
        onUpdate: (t) => {
          root.scale.set(1 + (scale - 1) * ease.inOutCubic(t));
          if (faceDown) {
            const back = t >= 0.5;
            card.back.visible = back;
            card.face.visible = !back;
            card.flip.scale.x = t >= 1 ? 1 : Math.max(0.02, Math.abs(1 - 2 * t));
          }
        },
        onComplete: () => {
          root.destroy({ children: true });
          if (!target.root.destroyed) target.root.alpha = 1;
        },
      });
      return;
    }
    const pile = gen.discards[e.player];
    const dest = pile.box();
    const scale = dest.width / hw;
    this.callbacks.log({ kind: 'play_flight', scheduledMs: timing.playFlight, box: { ...dest } });
    this.fx.add({
      target: root,
      to: { x: dest.x + dest.width / 2, y: dest.y + dest.height / 2 },
      duration: timing.playFlight,
      ease: ease.inOutCubic,
      owner: root,
      onUpdate: (t) => {
        root.scale.set(1 + (scale - 1) * ease.inOutCubic(t));
        root.rotation = Math.sin(t * Math.PI) * -0.2;
      },
      onComplete: () => {
        root.destroy({ children: true });
        pile.pop(this.ui);
      },
    });
  }

  /** A new server's column flashes in. */
  private serverOpen(id: ServerId, layout: BoardLayout): void {
    const slots = layout.corp.servers.find((s) => s.id === id);
    const col = this.gen?.columns.get(id);
    if (!slots || !col) return;
    const c = slots.column;
    this.callbacks.log({ kind: 'server_open', scheduledMs: timing.serverOpen, box: { ...c } });
    const g = new Graphics();
    glowRoundRect(g, c.x, c.y, c.width, c.height, 6, theme.corp, 2, 1.5);
    this.fxLayer.addChild(g);
    this.fx.add({ target: g, to: { alpha: 0 }, duration: timing.serverOpen, ease: ease.linear, owner: g, onComplete: () => g.destroy() });
    const label = col.label;
    const base = label.scale.x;
    label.scale.set(base * 1.4);
    this.fx.add({ target: label.scale, to: { x: base, y: base }, duration: timing.serverOpen, ease: ease.outBack, owner: label });
  }

  // ---- picking a card and its targets --------------------------------------

  private onCardTap(index: number): void {
    const view = this.view;
    if (!view) return;
    if (this.flipPending) {
      this.fx.finishAll();
      return;
    }
    const hand = this.hands[view.viewer];
    if (view.pendingDiscard > 0) {
      const pending = view.pendingDiscard;
      if (this.marked.has(index)) this.marked.delete(index);
      else if (this.marked.size < pending) this.marked.add(index);
      else {
        this.showHint('Enough picked. Tap one to undo.');
        return;
      }
      hand.setMarked(this.marked);
      this.applyView(view, true);
      this.callbacks.changed();
      return;
    }
    if (this.selected === index) {
      this.cancelSelection();
      return;
    }
    const options = view.handOptions[index] ?? [];
    const first = options[0]?.reject ?? null;
    if (options.length === 0) {
      this.cancelSelection();
      this.showHint("That card can't be played yet");
      return;
    }
    if (first !== null && GATE_REASONS.has(first) && options.every((o) => o.reject === first)) {
      this.cancelSelection();
      this.showHint(hintFor(first, view));
      if (first === 'no_clicks') this.seatAt('bottom')?.clicks.shake();
      return;
    }
    this.selected = index;
    hand.setSelected(index);
    this.showTargets();
    this.applyView(view, false);
    if (options.every((o) => o.reject === 'not_implemented')) this.showHint(hintFor('not_implemented', view));
    this.callbacks.changed();
  }

  private cancelSelection(): void {
    if (this.selected === null) return;
    this.selected = null;
    const view = this.view;
    if (!view) return;
    this.hands[view.viewer].setSelected(null);
    this.showTargets();
    this.applyView(view, false);
    this.callbacks.changed();
  }

  /** Lights every place the picked card can go, with its price (view.handOptions only). */
  private showTargets(): void {
    const gen = this.gen;
    const layout = this.layout;
    const view = this.view;
    this.activeTargets = [];
    if (gen) for (const m of gen.targets.values()) m.root.visible = false;
    if (!gen || !layout || !view || this.selected === null) {
      this.setNewServerLabel(false);
      return;
    }
    for (const option of view.handOptions[this.selected] ?? []) {
      const a = option.action;
      let kind: TargetSnapshot['kind'];
      let server: string | undefined;
      let b: Box;
      let at: 'top' | 'bottom' | 'center' = 'center';
      if (a.type === 'install' && a.server !== undefined) {
        const slots = a.server === 'new' ? layout.corp.newServer : layout.corp.servers.find((s) => s.id === a.server);
        if (!slots) continue;
        kind = a.server === 'new' ? 'new_server' : 'server';
        server = a.server;
        b = slots.column;
        // The price sits where the next ICE goes (the Runner's side of the column).
        if (kind === 'server') at = layout.corp.outward === 'down' ? 'bottom' : 'top';
      } else if (a.type === 'install') {
        kind = 'install';
        b = layout.rig.install;
      } else if (a.type === 'play') {
        kind = 'play';
        b = layout.action;
      } else continue;
      const key = `${kind}:${server ?? ''}`;
      let marker = gen.targets.get(key);
      if (!marker) {
        const m = new TargetMarker(layout.scale);
        m.root.label = `target:${key}`;
        gen.detachers.push(attachPress(m.root, { onTap: () => this.onTargetTap(key) }));
        this.targetLayer.addChild(m.root);
        gen.targets.set(key, m);
        marker = m;
      }
      const verb = a.type === 'play' ? TERMS.play : TERMS.install;
      marker.set(b, `${verb} · ${priceText(option.cost)}`, option.reject === null, at);
      marker.root.visible = true;
      this.activeTargets.push({ kind, ...(server !== undefined ? { server } : {}), option, marker });
    }
    this.setNewServerLabel(this.activeTargets.some((t) => t.kind === 'new_server'));
  }

  private setNewServerLabel(on: boolean): void {
    const col = this.gen?.columns.get('new');
    if (col) col.label.visible = on;
  }

  private onTargetTap(key: string): void {
    const t = this.activeTargets.find((x) => `${x.kind}:${x.server ?? ''}` === key);
    if (!t || this.flipPending) return;
    // The engine judges it; a refusal comes back as action_rejected and shows its hint.
    this.callbacks.onAction(t.option.action);
  }

  // ---- input --------------------------------------------------------------

  /** Bottom-row taps act for the seat on screen; during a pending flip they only skip to it. */
  private boardTap(act: () => void): void {
    if (this.flipPending) {
      this.fx.finishAll();
      return;
    }
    this.cancelSelection();
    act();
  }

  private onButtonTap(): void {
    const view = this.view;
    const button = this.gen?.button;
    if (!view || !button || !button.root.visible) return;
    if (button.mode === 'confirm') {
      const k = view.pendingDiscard - this.marked.size;
      if (k > 0) {
        this.showHint(`Pick ${plural(k, 'more card', 'more cards')}`);
        return;
      }
      this.callbacks.onDiscard([...this.marked].sort((a, b) => a - b));
      return;
    }
    if (performance.now() < this.endTurnArmedAt) return;
    this.cancelSelection();
    this.callbacks.onEndTurn();
  }

  private pressFeedback(target: Container, onTap: () => void): () => void {
    return attachPress(target, {
      onDown: () => {
        this.ui.cancel(target.scale);
        this.ui.add({ target: target.scale, to: { x: 0.92, y: 0.92 }, duration: timing.pressFeedback, owner: target });
      },
      onRelease: () => {
        this.ui.cancel(target.scale);
        this.ui.add({ target: target.scale, to: { x: 1, y: 1 }, duration: 140, ease: ease.outBack, owner: target });
      },
      onTap,
    });
  }

  // ---- drawing ------------------------------------------------------------

  private drawBackground(layout: BoardLayout, viewer: Side): Graphics {
    const { width: vw, height: vh } = layout.viewport;
    const g = new Graphics();
    // No full-screen fill: the renderer's clear color is the backdrop. A
    // full-screen blended layer costs a whole frame of fill rate on
    // low-end/software GPUs. Only thin lines and the side bands are drawn.
    const step = Math.round(32 * Math.min(1, layout.scale));
    for (let x = layout.board.x % step; x < vw; x += step) g.moveTo(x, 0).lineTo(x, vh);
    for (let y = 0; y < vh; y += step) g.moveTo(0, y).lineTo(vw, y);
    g.stroke({ width: 1, color: theme.grid, alpha: 0.35 });
    for (const [pos, s] of [['top', other(viewer)], ['bottom', viewer]] as const) {
      const row = layout[pos].row;
      const color = sideColor(s);
      g.rect(row.x, row.y, row.width, row.height).fill({ color, alpha: pos === 'bottom' ? 0.07 : 0.035 });
      const edgeY = pos === 'top' ? row.y + row.height : row.y;
      g.moveTo(row.x + layout.pad, edgeY).lineTo(row.x + row.width - layout.pad, edgeY).stroke({ width: 1, color, alpha: 0.5 });
    }
    if (layout.mode === 'landscape') {
      // The rail's edge.
      const x = layout.banner.x - Math.round((layout.banner.x - (layout.board.x + layout.board.width)) / 2);
      g.moveTo(x, layout.board.y).lineTo(x, layout.board.y + layout.board.height).stroke({ width: 1, color: sideColor(viewer), alpha: 0.35 });
    }
    g.eventMode = 'none';
    this.bgLayer.addChild(g);
    return g;
  }

  private showGameOver(layout: BoardLayout, text: string, winner: Side, animate: boolean): void {
    const b = layout.gameOver;
    const s = Math.min(layout.scale, 1.2);
    const color = sideColor(winner);
    const root = new Container();
    root.position.set(b.x + b.width / 2, b.y + b.height / 2);
    const g = new Graphics();
    g.roundRect(-b.width / 2, -b.height / 2, b.width, b.height, 16 * s).fill({ color: 0x05040a, alpha: 0.94 });
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
    this.gen?.detachers.push(this.pressFeedback(btn, () => this.callbacks.onNewGame()));
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
    const s = Math.min(layout.scale, 1.2);
    const area = layout.hintArea;
    const root = new Container();
    const padX = Math.max(6, Math.round(8 * s));
    const padY = Math.max(5, Math.round(6 * s));
    // Room for the glow ring around the bubble.
    const ring = 3;
    const label = new Text({
      text,
      style: {
        fontFamily: theme.fontFamily,
        fontSize: Math.max(12, Math.round(15 * s)),
        fontWeight: '700',
        fill: 0x140a00,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: Math.max(60, area.width - 2 * padX - 2 * ring),
        lineHeight: Math.max(14, Math.round(17 * s)),
      },
    });
    label.anchor.set(0.5);
    const w = label.width + 2 * padX;
    const h = Math.max(32, label.height + 2 * padY);
    const g = new Graphics();
    g.roundRect(-w / 2, -h / 2, w, h, Math.min(h / 2, 18)).fill({ color: theme.warn });
    g.roundRect(-w / 2 - ring, -h / 2 - ring, w + 2 * ring, h + 2 * ring, Math.min(h / 2, 18) + ring).stroke({ width: 3, color: theme.warn, alpha: 0.35 });
    root.addChild(g, label);
    // The slot is sized so hints wrap at full size; shrink only if one ever does not fit.
    const fit = Math.min(1, (area.width - 2 * ring) / w, (area.height - 2 * ring) / h);
    root.scale.set(fit);
    const hint = { text, root, box: { x: 0, y: 0, width: w * fit, height: h * fit } };
    this.positionHint(hint);
    root.alpha = 0;
    this.hintLayer.addChild(root);
    this.hint = hint;
    this.syncHelp();
    this.callbacks.log({
      kind: 'hint',
      text,
      box: { ...hint.box },
      fontPx: (label.style.fontSize as number) * fit,
      scheduledMs: timing.hintIn + timing.hintVisible + timing.hintFade,
    });
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
          this.syncHelp();
        }
      },
    });
  }

  /** Sideways, a hint takes the help text's place in the rail: hide the help text meanwhile. */
  private syncHelp(): void {
    const help = this.gen?.subHelp;
    if (help) help.renderable = !(this.hint && this.layout?.mode === 'landscape');
  }

  private positionHint(hint: { root: Container; box: Box }): void {
    const a = this.layout?.hintArea;
    if (!a) return;
    const cx = a.x + a.width / 2;
    // Sideways the slot is tall (the help text's room): sit at its bottom, by the viewer's name.
    const cy = this.layout?.mode === 'landscape' ? a.y + a.height - 3 - hint.box.height / 2 : a.y + a.height / 2;
    hint.root.position.set(cx, cy);
    hint.box.x = cx - hint.box.width / 2;
    hint.box.y = cy - hint.box.height / 2;
  }

  /** Zooms a card: a face for a known card id, a back for a face-down card the viewer may not see. */
  private openZoom(cardId: string | null, side: Side, from: Box): void {
    const layout = this.layout;
    if (!layout) return;
    const def = cardId ? getCard(cardId) : undefined;
    this.closeZoom(true);
    const { width: vw, height: vh } = layout.viewport;
    const z = layout.zoom;
    const root = new Container();
    const dim = new Graphics();
    dim.rect(0, 0, vw, vh).fill({ color: 0x000000, alpha: 0.65 });
    let card: Container;
    if (def) card = createCardFace(def, z.width, z.height, 'full');
    else {
      card = new Container();
      card.addChild(createCardBack(side, z.width, z.height));
      const t = new Text({
        text: `Face-down ${SIDE_NAME[side]} card`,
        style: { fontFamily: theme.fontFamily, fontSize: Math.max(13, Math.round(z.width * 0.065)), fontWeight: '700', fill: theme.text, align: 'center', wordWrap: true, wordWrapWidth: z.width * 0.8 },
      });
      t.anchor.set(0.5);
      t.position.set(0, z.height * 0.3);
      card.addChild(t);
    }
    const overflow = textOverflows(card, z.width, z.height);
    const cx = z.x + z.width / 2;
    const cy = z.y + z.height / 2;
    card.position.set(from.x + from.width / 2, from.y + from.height / 2);
    card.scale.set(Math.min(from.width, from.height) / z.width);
    root.addChild(dim, card);
    root.alpha = 0;
    this.zoomLayer.addChild(root);
    this.zoom = { cardId: def ? cardId : null, root, card, width: z.width, height: z.height, overflow };
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
