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
import { type BackAction, backAction } from './back';
import { CAROUSEL_SLIDE_MS, Carousel, type CarouselFace, listIndex } from './carousel';
import { createCardBack, createCardFace, createZoomFace, dropCardTextures, flushZoomFaces, glowRoundRect, hasZoomFace, retireCardTextures, textOverflows, textsOf } from './cardFace';
import { framesAreSlow } from './frameClock';
import { centeredBox } from './geometry';
import { Hand, type HandCard } from './hand';
import type { AnimRecord, Box, EndTurnClock, InstalledSnapshot, Insets, LayoutSnapshot, SideLayout, TargetSnapshot } from './hook-types';
import type { Decision, Presentation } from './hotseat';
import { CHOICE_HINT, hintFor } from './hints';
import { attachPress, inputTime } from './input';
import { BUILD_LINE, type BoardLayout, type BoardShape, CARD_RATIO, type SideRow, computeLayout } from './layout';
import { LeaveDialog } from './leaveDialog';
import { RunDisplay } from './runDisplay';
import { IceReport, LastRunStrip } from './panels';
import { RUN_END, iceReport, nameOf, runEndText } from './runText';
import { SIDE_NAME, TERMS, badPublicityText, plural, pointsText, priceText, serverLabel, tempCreditsText, zoneName } from './terms';
import { sideColor, theme, timing } from './theme';
import { ease, type Tweens } from './tween';
import { ActionButton, Counter, DeckPile, DiscardPile, MemoryCounter, PanelButton, ScorePill, StatusTag, TargetMarker, fitText, placeAt } from './widgets';

type Pos = 'top' | 'bottom';
const SIDES: readonly Side[] = ['corp', 'runner'];
const other = (s: Side): Side => (s === 'corp' ? 'runner' : 'corp');

/** Refusals that apply to every target of a card alike: shown at once instead of lighting targets. */
const GATE_REASONS: ReadonlySet<RejectReason> = new Set(['game_over', 'not_your_turn', 'wrong_phase', 'no_clicks']);

/** Why the game ended, in plain words (the line under "<Winner> wins"). */
const WIN_REASON: Record<WinReason, string> = {
  corp_decked: `${TERMS.rd} is empty`,
  agenda_points: `7 agenda points`,
  flatline: `${SIDE_NAME.runner} flatlined`,
};

/** "Runner wins" / "7 agenda points". */
export function gameOverLines(result: { winner: Side; reason: WinReason }): { title: string; reason: string } {
  return { title: `${SIDE_NAME[result.winner]} wins`, reason: WIN_REASON[result.reason] };
}

export function gameOverText(result: { winner: Side; reason: WinReason }): string {
  const { title, reason } = gameOverLines(result);
  return `${title}: ${reason}`;
}

export function bannerText(view: PlayerView): string {
  if (view.result) return 'GAME OVER';
  const who = view.activePlayer.toUpperCase();
  if (view.phase === 'discard') return `TURN ${view.turn} · ${who} · hand limit`;
  return `TURN ${view.turn} · ${who} · ${plural(view.players[view.activePlayer].clicks, 'click', 'clicks')} left`;
}

/** Markers are kept per kind and place: a server, or an installed card (free rez). */
function targetKey(kind: TargetSnapshot['kind'], where: { server?: string; uid?: string }): string {
  return `${kind}:${where.server ?? (kind === 'free_rez' ? (where.uid ?? '') : '')}`;
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


/** True if `c` is `root` or inside it. */
function isUnder(c: Container | null, root: Container | null): boolean {
  for (let n: Container | null = c; n; n = n.parent) if (n === root) return true;
  return false;
}

/** QA-S4-1 pre-draw: no bake from this long before the hold opens the zoom until it has opened (ms). */
const PREDRAW_QUIET_MS = 60;

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
  /** S-04-4: "Bad publicity 1" (Corp) / "+1 for this run" (Runner). */
  tag: StatusTag;
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
  /** Advancement counter badge (shown on backs too). */
  badge: Container;
  badgeText: Text;
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
  uid?: string;
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
  /** The Runner's Run button (rail / control strip, where Play goes). */
  runButton: PanelButton;
  /** S-05-1: Last run (below / beside Run), while the view has one. */
  lastRunButton: PanelButton;
  run: RunDisplay;
  scores: Record<Side, ScorePill>;
  /** Outline around a picked installed card. */
  pickMark: Graphics;
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
  /** When this copy of the game was built, e.g. "2026-11-13 14:32 UTC" (S-04-1: shown small in a corner). */
  buildTime: string;
}

export class Board {
  readonly stage = new Container();
  /** Everything that belongs to one seat's board; fades in on a turn change. */
  private readonly table = new Container();
  private readonly bgLayer = new Container();
  private readonly boardLayer = new Container();
  private readonly installedLayer = new Container();
  /** Run tracker marks (server outline, current ICE) over the cards. */
  private readonly runLayer = new Container();
  private readonly centerLayer = new Container();
  /** Accessed cards shown large, over the bands. */
  private readonly accessLayer = new Container();
  private readonly targetLayer = new Container();
  private readonly handLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly hintLayer = new Container();
  private readonly zoomLayer = new Container();
  /** The small build date (S-04-1). */
  private readonly buildText: Text;
  /** The agenda whose free-rez choice was open before this update (for the "skipped" notice). */
  private lastChoiceCard: string | null = null;
  /** "Leave the game?" over everything (S-04-2). */
  private readonly dialogLayer = new Container();
  private leave: { dialog: LeaveDialog; onLeave: () => void } | null = null;
  /** One hand per seat, kept between turns. */
  private readonly hands: Record<Side, Hand>;
  /** Catches taps on empty board (cancels a picked card). */
  private readonly catcher = new Container();
  private viewport: { width: number; height: number; insets: Partial<Insets> } | null = null;
  private layout: BoardLayout | null = null;
  private view: PlayerView | null = null;
  private gen: Generation | null = null;
  private gameOver: { text: string; title: string; reason: string; root: Container } | null = null;
  /** The other seat's run decision shown on this board (the Corp's rez choice), or null. */
  private decision: Decision | null = null;
  /** True while servers are lit after tapping Run (UI state only). */
  private runPicking = false;
  /** Installed card picked for its choices (Corp agenda: Advance / Score). */
  private pickedInstalled: string | null = null;
  private hint: { text: string; root: Container; box: Box } | null = null;
  private zoom: {
    cardId: string | null;
    root: Container;
    card: Container;
    width: number;
    height: number;
    texts: string[];
    overflow: boolean;
    /** Hand zooms: an undimmed outline over the hand card the zoom shows (S-04-3). */
    frame: Graphics | null;
    /** S-05-3: the neighbours behind the zoomed card (hand and list zooms). */
    carousel: Carousel | null;
    /** The index the zoom shows in the carousel's list. */
    index: number;
    /** List zooms (piles, score pills): the slide steps one card per `step` px from `startX`. */
    list: { ids: string[]; start: number; startX: number; step: number } | null;
  } | null = null;
  /** S-05-2: what the ICE just did; stays until the next tap (which it consumes). */
  private report: IceReport | null = null;
  /** S-05-1: the Last run strip, while open. */
  private lastRunStrip: LastRunStrip | null = null;
  /** Panels over the table (the ICE report), under the zoom and the leave question. */
  private readonly panelLayer = new Container();
  /** A closed zoom still fading out (freed before evicted zoom faces are). */
  private fadingZoom: Container | null = null;
  /** QA-S4-1: zoom faces still to pre-draw for a held hand (one per frame), nearest first. */
  private predraw: { ids: string[]; total: number; frame: number; at: number } | null = null;
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
      onPress: (i: number) => this.startPredraw(this.hands[side].ids, i),
      onPressEnd: () => this.stopPredraw(),
      onLongPress: (id: string, from: Box, i: number) => this.openZoom(id, side, from, { hand: { ids: this.hands[side].ids, index: i } }),
      onLongPressEnd: () => this.closeZoom(),
      onZoomSlide: (id: string, box: Box, at: number, i: number) => this.swapZoom(id, box, at, i),
      log: (r: Omit<AnimRecord, 'startedAt'>) => callbacks.log(r),
    });
    this.hands = { corp: new Hand('corp', fx, ui, handCallbacks('corp')), runner: new Hand('runner', fx, ui, handCallbacks('runner')) };
    this.handLayer.addChild(this.hands.corp.container, this.hands.runner.container);
    this.zoomLayer.eventMode = 'none';
    this.hintLayer.eventMode = 'none';
    this.fxLayer.eventMode = 'none';
    this.catcher.label = 'board:empty';
    attachPress(this.catcher, { onTap: () => this.cancelSelection() });
    this.catcher.cursor = 'default';
    this.runLayer.eventMode = 'none';
    this.buildText = new Text({
      text: '',
      style: { fontFamily: theme.fontFamily, fontSize: 9, fill: theme.textDim, align: 'center', lineHeight: BUILD_LINE },
    });
    this.buildText.label = 'build-time';
    this.buildText.eventMode = 'none';
    this.buildText.alpha = 0.85;
    this.table.addChild(this.catcher, this.bgLayer, this.boardLayer, this.installedLayer, this.runLayer, this.centerLayer, this.accessLayer, this.targetLayer, this.handLayer, this.buildText);
    this.stage.addChild(this.table, this.fxLayer, this.hintLayer, this.panelLayer, this.zoomLayer, this.dialogLayer);
    // S-05-1: a tap anywhere outside the Last run strip (and its button) closes it; the tap still acts.
    this.stage.eventMode = 'static';
    this.stage.on('pointerdown', (e) => {
      const strip = this.lastRunStrip;
      if (!strip) return;
      const t = e.target as Container | null;
      if (t && (isUnder(t, strip.root) || isUnder(t, this.gen?.lastRunButton.root ?? null))) return;
      this.closeLastRun();
      this.callbacks.changed();
    });
  }

  /** New viewport size / safe-area insets (start, resize, rotate). */
  setViewport(width: number, height: number, insets: Partial<Insets>): void {
    this.fx.finishAll();
    this.viewport = { width, height, insets };
    this.catcher.hitArea = new Rectangle(0, 0, width, height);
    if (this.view) this.fullRender();
    if (this.hint) this.positionHint(this.hint);
    this.syncHelp();
    if (this.report && this.layout) this.openReport(this.report.text, this.layout);
    // The question stays open across a rotation / inset change, laid out anew.
    if (this.leave) this.openLeave(this.leave.onLeave);
  }

  /**
   * The phone's Back button (S-04-2, owner answer A): closes the leave
   * question or a zoom; on the game-over screen calls `exit`; otherwise asks
   * "Leave the game?" (Leave calls `exit`). Returns what it did.
   */
  back(exit: () => void): BackAction {
    const panelOpen = this.report !== null || this.lastRunStrip !== null;
    const action = backAction({ dialogOpen: this.leave !== null, zoomOpen: this.zoom !== null, panelOpen, gameOver: !!this.view?.result && !this.report });
    if (action === 'close_dialog') this.closeLeave();
    else if (action === 'close_zoom') this.closeZoom();
    else if (action === 'close_panel') {
      if (this.report) this.dismissReport();
      else this.closeLastRun();
    }
    else if (action === 'exit') exit();
    else this.openLeave(exit);
    this.callbacks.changed();
    return action;
  }

  private openLeave(onLeave: () => void): void {
    this.closeLeave();
    const layout = this.layout;
    if (!layout) return;
    const dialog = new LeaveDialog(
      layout,
      () => {
        this.closeLeave();
        this.callbacks.changed();
      },
      () => {
        this.closeLeave();
        this.callbacks.changed();
        onLeave();
      },
    );
    this.dialogLayer.addChild(dialog.root);
    this.leave = { dialog, onLeave };
  }

  private closeLeave(): void {
    this.leave?.dialog.destroy();
    this.leave = null;
  }

  /**
   * Draws every card again from scratch (S-04-2): after the GPU dropped the
   * drawing surface (webglcontextrestored) or the app comes back from the
   * background. Baked card pictures lived on the GPU, so they are all remade.
   * Game state, the leave question and hints are kept.
   */
  redrawAll(): void {
    this.fx.finishAll();
    this.closeZoom(true);
    this.stopPredraw();
    this.finishFade();
    this.destroyGeneration();
    for (const s of SIDES) this.hands[s].reset();
    dropCardTextures();
    if (this.view) this.fullRender();
    if (this.leave) this.openLeave(this.leave.onLeave);
    this.callbacks.changed();
  }

  /** Shows the result of one action (see Presentation). */
  show(p: Presentation): void {
    // Tap-to-skip: finish whatever is still animating before the new events.
    this.fx.finishAll();
    if (p.kind === 'same') this.render(p.view, p.events, p.decision);
    else this.handoff(p);
  }

  /**
   * Shows a view and animates the events that produced it (same seat).
   * `decision`: the other seat's run decision to show (the Corp's rez choice).
   */
  render(view: PlayerView, events: readonly GameEvent[], decision: Decision | null = null): void {
    this.fx.finishAll();
    const prev = this.view;
    if (prev?.choice) this.lastChoiceCard = prev.choice.cardId;
    const prevDecision = this.decision;
    this.view = view;
    this.decision = decision;
    if (!this.viewport) return;
    // A new action: an open ICE report has been read (taps on the board never get past it; only the hook could).
    this.closeReport();
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
    // An agenda stays picked after an Advance (advance again with one tap).
    if (!rejected) {
      this.selected = null;
      this.runPicking = false;
      const advanced = events.some((e) => e.type === 'card_advanced' && e.uid === this.pickedInstalled);
      if (!advanced) this.pickedInstalled = null;
    }
    if (this.pickedInstalled !== null && !(view.installedOptions[this.pickedInstalled]?.length)) this.pickedInstalled = null;
    // Where things were before this action moved them (for the flights).
    const before = this.boxesBefore(events);
    const prevRun = prevDecision?.run ?? prev.run;
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
    // S-05-2: what the ICE did stays on screen until the next tap; a game over shows after it.
    const reportText = rejected ? null : iceReport(events);
    if (reportText) this.openReport(reportText, layout);
    const newStep = this.applyView(view, true);
    for (const l of leaving) this.flyFromHand(l.e, l.card, layout);
    const notices: string[] = [];
    for (const e of events) {
      if (e.type === 'server_created') this.serverOpen(e.server, layout);
      // Run-only credits (bad publicity) are paid first: only the rest leaves the credits pill.
      if (e.type === 'credits_spent' && e.player === viewer) this.creditFloat(-(e.amount - (e.temp ?? 0)));
      this.animateBonusEvent(e, notices);
      if (e.type === 'credit_gained' && e.player === viewer) this.creditFloat(e.amount);
      if (e.type === 'action_rejected') {
        this.showHint(hintFor(e.reason, view));
        if (e.reason === 'no_clicks') this.seatAt('bottom')?.clicks.shake();
      }
      this.animateRunEvent(e, layout, before, prevRun, reportText ? [] : notices, events);
    }
    if (newStep && view.run) this.stepFlash();
    // A fired subroutine already says what happened: no extra "loses 1 click" / "Run ended" lines.
    const fired = events.some((e) => e.type === 'subroutine_fired');
    const shown = fired ? notices.filter((n) => !n.startsWith(`${SIDE_NAME.runner} loses`) && n !== RUN_END['ended_by_ice']) : notices;
    if (shown.length > 0 && !events.some((e) => e.type === 'action_rejected')) this.showHint(shown.join('\n'), 'notice');
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
        counter: c && c.badge.visible ? c.badgeText.text : null,
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
      // Put away during a run (the run's buttons use its room).
      hand: this.hands[viewer].container.visible ? this.hands[viewer].boxes() : [],
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
        ...(t.uid !== undefined ? { uid: t.uid } : {}),
        box: { ...t.marker.box },
        label: t.marker.text,
        lit: t.option.reject === null,
        reject: t.option.reject,
      })),
      selected: this.selected,
      labels: [...visibleTexts(this.boardLayer), ...visibleTexts(this.centerLayer), ...visibleTexts(this.accessLayer), ...visibleTexts(this.targetLayer)],
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
        help: gen?.subHelp.visible && gen.subHelp.renderable ? gen.subHelp.text : '',
      },
      tags: {
        corp: corp && corp.tag.text ? { text: corp.tag.text, box: { ...corp.tag.box } } : null,
        runner: runner && runner.tag.text ? { text: runner.tag.text, box: { ...runner.tag.box } } : null,
      },
      endTurn:
        button && button.root.visible && button.mode === 'end'
          ? { box: button.box(), label: button.text, glowing: button.glowing, enabled: button.enabled }
          : null,
      picker:
        button && button.root.visible && button.mode === 'confirm' && pending > 0
          ? { remaining: pending - this.marked.size, label: gen?.subMain.text ?? '', confirm: { box: button.box(), enabled: button.enabled } }
          : null,
      gameOver: this.gameOver && layout ? { text: this.gameOver.text, title: this.gameOver.title, reason: this.gameOver.reason, box: layout.gameOver } : null,
      run: gen?.run.snapshot ?? null,
      runButton:
        gen && gen.runButton.root.visible
          ? { box: { ...gen.runButton.box }, label: gen.runButton.text, lit: gen.runButton.lit, picking: this.runPicking }
          : null,
      score: {
        corp: { text: gen?.scores.corp.text ?? '', box: gen ? { ...gen.scores.corp.box } : zero },
        runner: { text: gen?.scores.runner.text ?? '', box: gen ? { ...gen.scores.runner.box } : zero },
      },
      selectedInstalled: this.pickedInstalled,
      hint: this.hint && this.hint.root.alpha > 0.05 ? { text: this.hint.text, box: this.hint.box } : null,
      dialog: this.leave ? this.leave.dialog.snapshot() : null,
      report: this.report ? { text: this.report.text, box: { ...this.report.box } } : null,
      lastRun: {
        button: gen && gen.lastRunButton.root.visible ? { box: { ...gen.lastRunButton.box }, label: gen.lastRunButton.text } : null,
        strip: this.lastRunStrip ? { title: this.lastRunStrip.title, box: { ...this.lastRunStrip.box }, cards: this.lastRunStrip.cards.map((c) => ({ ...c, box: { ...c.box } })) } : null,
      },
      buildLabel:
        layout && this.buildText.visible && this.buildText.text
          ? { text: this.buildText.text, box: this.buildTextBox() }
          : null,
      zoom: this.zoom
        ? {
            cardId: this.zoom.cardId,
            box: centeredBox(this.zoom.card, this.zoom.width, this.zoom.height),
            texts: this.zoom.texts,
            textOverflow: this.zoom.overflow,
            carousel: this.zoom.carousel?.snapshot() ?? [],
          }
        : null,
      animating: this.fx.active,
    };
  }

  // ---- turn change --------------------------------------------------------

  private handoff(p: Extract<Presentation, { kind: 'handoff' }>): void {
    this.closeReport();
    this.closeLastRun();
    const layout = this.layout;
    // The double-tap guard counts from when this tap (End turn / Confirm) was made,
    // not from the flip (it waits for the discard flight; the button is hidden until
    // then) nor from when we got to handle it (a slow frame can delay that).
    const tappedAt = inputTime();
    const now = performance.now();
    // The actor's own view from here on: no picker, nothing to tap but the
    // board's deck/credits, which already act for the new seat.
    this.view = p.actorView;
    this.decision = null;
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
    // The flip is scheduled from now (game time), whenever the tap was made.
    this.flipDueAt = now + discardMs;
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
    this.placeBuildLabel(layout);
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
    this.stopPredraw();
    this.finishFade();
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
    // S-05-1: hold a pile or a score to read its face-up cards (a tap is an empty-board tap).
    for (const side of SIDES) {
      const pile = discards[side];
      pile.root.eventMode = 'none';
      detachers.push(
        this.attachHoldZoom(pile.root, () => {
          const ids = (this.view?.players[side].discard ?? []).filter((id): id is string => id !== null);
          return ids.length > 0 ? { ids, side, from: pile.box() } : null;
        }),
      );
    }
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
    const runButton = new PanelButton(s, 'button:run');
    press(runButton.root, () => this.onRunButtonTap());
    runButton.root.visible = false;
    const lastRunButton = new PanelButton(s, 'button:last-run');
    press(lastRunButton.root, () => this.toggleLastRun());
    lastRunButton.root.visible = false;
    const run = new RunDisplay(layout, this.ui, {
      onButton: (i) => this.onRunOptionTap(i),
      press: (target, onTap) => this.pressFeedback(target, onTap),
      hold: (target, cardId, box) =>
        attachPress(target, {
          // S-05-1: a hold on an accessed card zooms it; a tap does nothing (Steal / Trash / Done are the buttons).
          onLongPress: () => this.openZoom(cardId, 'corp', box),
          onLongPressEnd: () => this.closeZoom(),
        }),
    });
    const scores = { corp: new ScorePill('corp'), runner: new ScorePill('runner') };
    for (const side of SIDES) {
      const pill = scores[side];
      detachers.push(
        this.attachHoldZoom(pill.root, () => {
          const ids = [...(this.view?.players[side].scored ?? [])];
          return ids.length > 0 ? { ids, side: 'corp', from: pill.box } : null;
        }),
      );
      pill.root.eventMode = 'none';
    }
    this.boardLayer.addChild(scores.corp.root, scores.runner.root);
    const pickMark = new Graphics();
    pickMark.eventMode = 'none';
    this.runLayer.addChild(run.marks, pickMark);
    this.centerLayer.addChild(banner, subMain, subHelp, button.root, runButton.root, lastRunButton.root, run.info, run.buttons);
    this.accessLayer.addChild(run.access);
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
      runButton,
      lastRunButton,
      run,
      scores,
      pickMark,
    };
    // Hand sprites are sized for the old board: rebuilt when next shown.
    for (const side of SIDES) this.hands[side].reset();
  }

  private destroyGeneration(): void {
    const gen = this.gen;
    if (!gen) return;
    this.closeLastRun();
    for (const d of gen.detachers) d();
    for (const c of gen.installed.values()) c.detach();
    gen.run.detach();
    for (const layer of [this.bgLayer, this.boardLayer, this.installedLayer, this.runLayer, this.centerLayer, this.accessLayer, this.targetLayer]) {
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
      const tag = new StatusTag(`tag:${side}`, side === 'corp' ? 'bad' : 'run');
      root.addChild(label, credits.root, clicks.root, tag.root);
      this.boardLayer.addChild(root);
      w = { side, pos, root, label, name, handText: hand, credits, clicks, tag };
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
      // Advancement counters: a numbered disc in the corner, on backs too (both players see the number).
      const badge = new Container();
      const br = Math.max(9, Math.round(u * 0.2));
      const disc = new Graphics();
      disc.circle(0, 0, br).fill({ color: theme.warn }).stroke({ width: 1.5, color: 0x140a00 });
      const badgeText = new Text({ text: '', style: { fontFamily: theme.monoFamily, fontSize: Math.round(br * 1.25), fontWeight: '800', fill: 0x140a00 } });
      badgeText.anchor.set(0.5);
      badge.addChild(disc, badgeText);
      badge.position.set(u / 2 - br - 1, -uh / 2 + br + 1);
      badge.visible = false;
      root.addChild(visual, badge);
      const c: InstalledCard = { uid: v.uid, owner, zone, root, visual, visualKey: '', cardId: v.cardId, faceUp: v.faceUp, box: b, badge, badgeText, detach: () => {} };
      c.detach = attachPress(root, {
        onTap: () => this.onInstalledTap(c.uid),
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
    card.badge.visible = v.advancements > 0;
    if (card.badgeText.text !== String(v.advancements)) card.badgeText.text = String(v.advancements);
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
    this.placeHelp(layout);
    placeAt(gen.button.root, endTurn);
    gen.button.color = sideColor(viewer);
    void sub;
  }

  private placeHelp(layout: BoardLayout): void {
    const gen = this.gen;
    if (!gen) return;
    const help = this.helpBox(layout);
    gen.subHelp.style.wordWrapWidth = Math.max(40, help.width - 4);
    gen.subHelp.position.set(help.x + help.width / 2, help.y);
  }

  /** S-05-1: the Last run button shows while the view has one and nothing else uses its slot. */
  private lastRunShown(view: PlayerView | null): boolean {
    return !!view?.lastRun && !view.run && !view.choice && !view.result && view.pendingDiscard === 0 && this.selected === null && this.pickedInstalled === null;
  }

  /** Where the help text goes: below the Play button (sideways) or left of it (column). */
  private helpBox(layout: BoardLayout): Box {
    const { sub, action } = layout;
    if (layout.mode === 'landscape') {
      // Below Play (or below Score too, while a picked agenda shows two choices).
      const above = this.pickedInstalled !== null || this.lastRunShown(this.view) ? layout.action2 : action;
      const y = above.y + above.height + 4;
      return { x: sub.x, y, width: sub.width, height: Math.max(0, sub.y + sub.height - y) };
    }
    // Column: left of Play (and of the second choice, while a picked agenda shows two).
    const right = this.pickedInstalled !== null || this.lastRunShown(this.view) ? layout.action2.x : action.x;
    return { x: sub.x, y: sub.y, width: Math.max(0, right - 6 - sub.x), height: sub.height };
  }

  // ---- view -> widgets ----------------------------------------------------

  /** Puts `view` on the widgets. Returns true when a run moved to a new step. */
  private applyView(view: PlayerView, animate: boolean): boolean {
    const layout = this.layout;
    const gen = this.gen;
    if (!layout || !gen) return false;
    const viewer = view.viewer;
    for (const s of SIDES) {
      const w = this.seatOf(s);
      const p = view.players[s];
      gen.decks[s].setCount(p.deckCount);
      gen.discards[s].set(p.discardCount, p.discard);
      // Only a pile with a face-up card to read takes presses (else taps fall through to the board).
      gen.discards[s].root.eventMode = p.discard.some((id) => id !== null) ? 'static' : 'none';
      if (!w) continue;
      w.credits.set(p.credits, animate);
      w.clicks.set(p.clicks, animate);
      const ht = handText(s, p.handCount);
      if (w.handText.text !== ht) w.handText.text = ht;
      const fs = w.name.style.fontSize as number;
      w.handText.x = w.name.width + fs * 0.7;
      const row = layout[w.pos].label;
      w.label.scale.set(Math.min(1, row.width / Math.max(1, w.handText.x + w.handText.width)));
      // The client shows the engine's numbers; it never adds run-only credits to the Runner's credits.
      const note = s === 'corp' ? (view.badPublicity > 0 ? badPublicityText(view.badPublicity) : null) : view.run && view.run.tempCredits > 0 ? tempCreditsText(view.run.tempCredits) : null;
      w.tag.set(layout[w.pos].tag, note, layout.mode === 'landscape' && w.pos === 'bottom' ? 'center' : 'right');
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
    // Sideways, the run's info panel takes the help text's room in the rail.
    help.visible = !view.result && !(view.run && layout.mode === 'landscape');
    let helpText: string;
    const choiceCard = view.choice ? (getCard(view.choice.cardId)?.name ?? 'Agenda') : '';
    if (view.choice && view.choice.options.length > 0) {
      helpText = `${choiceCard}: rez one ${TERMS.ice} for free.\nTap a lit ${TERMS.ice}, or ${TERMS.skip}.`;
    } else if (view.choice) {
      helpText = `${SIDE_NAME[view.choice.waitingOn]} is choosing (${choiceCard})…`;
    } else if (view.run) {
      helpText = 'Tap a button to decide.\nHold a card to read it.';
    } else if (this.runPicking) {
      helpText = `Tap a lit server to run on it.\nTap ${TERMS.run} again to cancel.`;
    } else if (this.pickedInstalled !== null) {
      helpText = 'Tap a lit button.\nTap the card again to cancel.';
    } else if (pending > 0) {
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
    } else if (viewer === 'runner' && view.runOptions.length > 0 && view.activePlayer === viewer) {
      helpText = `Tap your ${TERMS.stack} to draw, your credits for +1, ${TERMS.run} to attack a server, or a card to play it.`;
    } else {
      const deck = viewer === 'corp' ? TERMS.rd : `your ${TERMS.stack}`;
      const agenda = Object.keys(view.installedOptions).length > 0 ? ' Tap your agenda to advance it.' : '';
      helpText = `Tap ${deck} to draw, your credits for +1, or a card to play it.${agenda}\nHold a card to read it.`;
    }
    if (help.text !== helpText) help.text = helpText;
    const hb = this.helpBox(layout);
    const wrap = Math.max(40, hb.width - 4);
    if (help.style.wordWrapWidth !== wrap) help.style.wordWrapWidth = wrap;
    help.position.set(hb.x + hb.width / 2, hb.y);
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

    if (view.result && !this.gameOver && !this.report) this.showGameOver(layout, gameOverLines(view.result), view.result.winner, animate);

    // Both sides' points, for both seats.
    for (const s of SIDES) {
      const pill = gen.scores[s];
      pill.set(layout.scores[s], pointsText(s, view.players[s].points), view.players[s].points);
      pill.root.eventMode = view.players[s].scored.length > 0 ? 'static' : 'none';
    }

    // The run: tracker, info, buttons, access view. The hand is put away meanwhile.
    gen.run.setLayout(layout);
    const newStep = gen.run.update(
      view,
      this.decision,
      {
        installed: (uid) => gen.installed.get(uid)?.box ?? null,
        column: (id) => layout.corp.servers.find((x) => x.id === id)?.column ?? null,
      },
      animate,
    );
    this.hands[viewer].container.visible = !view.run;

    // Run button: where Play goes, while the view offers runs and nothing is picked.
    const rb = gen.runButton;
    const showRun = !view.run && !view.choice && !view.result && pending === 0 && view.runOptions.length > 0 && this.selected === null && this.pickedInstalled === null;
    rb.root.visible = showRun;
    if (showRun) rb.set(layout.action, TERMS.run, view.runOptions.some((o) => o.reject === null), theme.runner, this.runPicking);

    // S-05-1: Last run, under Run (sideways) / beside it (column), while the view has one.
    const lrb = gen.lastRunButton;
    const showLast = this.lastRunShown(view);
    lrb.root.visible = showLast;
    if (showLast) lrb.set(layout.action2, 'Last run', true, theme.runner, this.lastRunStrip !== null);
    if (!showLast) this.closeLastRun();
    else if (this.lastRunStrip && JSON.stringify(this.lastRunStrip.last) !== JSON.stringify(view.lastRun)) this.openLastRun();
    this.placeHelp(layout);

    // The picked installed card is outlined.
    const pm = gen.pickMark;
    pm.clear();
    const picked = this.pickedInstalled !== null ? gen.installed.get(this.pickedInstalled) : undefined;
    if (picked) glowRoundRect(pm, picked.box.x - 3, picked.box.y - 3, picked.box.width + 6, picked.box.height + 6, 5, theme.credit, 3, 1.4);
    return newStep;
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

  // ---- runs, advancing, scoring ---------------------------------------------

  /** Boxes of things the events will move away (scored / trashed installed cards, accessed cards). */
  private boxesBefore(events: readonly GameEvent[]): Map<string, Box> {
    const out = new Map<string, Box>();
    const gen = this.gen;
    if (!gen) return out;
    for (const e of events) {
      if ((e.type === 'agenda_scored' || e.type === 'card_trashed') && e.uid) {
        const b = gen.installed.get(e.uid)?.box;
        if (b) out.set(`uid:${e.uid}`, { ...b });
      }
      if (e.type === 'agenda_stolen' || e.type === 'card_trashed') {
        const b = gen.run.accessBoxOf(e.cardId);
        if (b) out.set(`access:${e.cardId}`, { ...b });
      }
    }
    return out;
  }

  /** The tracker's highlight fades in on each new run step. */
  private stepFlash(): void {
    const marks = this.gen?.run.marks;
    if (!marks) return;
    this.callbacks.log({ kind: 'run_step', scheduledMs: timing.runStep });
    this.fx.cancel(marks);
    marks.alpha = 0.2;
    this.fx.add({ target: marks, to: { alpha: 1 }, duration: timing.runStep, ease: ease.outCubic, owner: marks });
  }

  /** One run / advance / score event on screen (all on the skippable fx queue, <= 300ms). */
  private animateRunEvent(e: GameEvent, layout: BoardLayout, before: Map<string, Box>, prevRun: PlayerView['run'], notices: string[], batch: readonly GameEvent[]): void {
    const gen = this.gen;
    const view = this.view;
    if (!gen || !view) return;
    switch (e.type) {
      case 'ice_rezzed': {
        const c = gen.installed.get(e.uid);
        if (!c) return;
        this.callbacks.log({ kind: 'ice_rez', scheduledMs: timing.rezFlip, box: { ...c.box } });
        this.fx.cancel(c.visual.scale);
        c.visual.scale.x = 0.05;
        this.fx.add({ target: c.visual.scale, to: { x: 1 }, duration: timing.rezFlip, ease: ease.outBack, owner: c.visual });
        return;
      }
      case 'subroutine_broken': {
        const strike = gen.run.strike(e.sub);
        this.callbacks.log({ kind: 'sub_broken', scheduledMs: timing.subBreak });
        if (!strike) return;
        strike.scale.x = 0;
        this.fx.add({ target: strike.scale, to: { x: 1 }, duration: timing.subBreak, ease: ease.outCubic, owner: strike });
        return;
      }
      case 'subroutine_fired': {
        const text = prevRun?.ice?.subroutines[e.sub]?.text;
        if (text) notices.push(`${nameOf(prevRun?.ice?.cardId ?? null)}: ${text}`);
        const b = gen.installed.get(e.iceUid)?.box;
        this.callbacks.log({ kind: 'sub_fired', scheduledMs: timing.subFlash, ...(b ? { box: { ...b } } : {}), ...(text ? { text } : {}) });
        if (b) this.flash(b, theme.warn, timing.subFlash);
        return;
      }
      case 'strength_changed': {
        const c = gen.installed.get(e.uid);
        if (!c) return;
        this.callbacks.log({ kind: 'strength_pop', scheduledMs: timing.strengthPop, box: { ...c.box } });
        this.floatText(`${TERMS.strength} ${e.strength}`, c.box, theme.runner, timing.strengthPop);
        return;
      }
      case 'clicks_lost': {
        notices.push(`${SIDE_NAME[e.player]} loses ${plural(e.amount, 'click', 'clicks')}`);
        this.callbacks.log({ kind: 'clicks_lost', scheduledMs: 260 });
        this.seatOf(e.player)?.clicks.shake();
        return;
      }
      case 'net_damage': {
        notices.push(`${e.amount} ${TERMS.netDamage.toLowerCase()}`);
        const pos: Pos = view.viewer === 'runner' ? 'bottom' : 'top';
        const from = pos === 'bottom' ? layout.handArea : layout.top.label;
        const heap = gen.discards.runner.box();
        this.callbacks.log({ kind: 'net_damage', scheduledMs: timing.runFlight + 20 * Math.max(0, e.cardIds.length - 1), box: { ...heap } });
        const w = Math.min(layout.card.width, from.height / CARD_RATIO);
        e.cardIds.forEach((id, i) => {
          const start = { x: from.x + from.width / 2 - w / 2 + (i - (e.cardIds.length - 1) / 2) * w * 0.6, y: from.y + from.height / 2 - (w * CARD_RATIO) / 2, width: w, height: w * CARD_RATIO };
          this.flyCard(id, 'runner', start, heap, i * 20, () => gen.discards.runner.pop(this.ui));
        });
        return;
      }
      case 'agenda_stolen': {
        const from = before.get(`access:${e.cardId}`) ?? layout.access;
        const pill = gen.scores.runner;
        this.callbacks.log({ kind: 'score_flight', scheduledMs: timing.runFlight, box: { ...pill.box } });
        this.flyCard(e.cardId, 'corp', from, pill.box, 0, () => pill.pop(this.ui));
        return;
      }
      case 'agenda_scored': {
        const from = before.get(`uid:${e.uid}`);
        const pill = gen.scores.corp;
        this.callbacks.log({ kind: 'score_flight', scheduledMs: timing.runFlight, box: { ...pill.box } });
        if (from) this.flyCard(e.cardId, 'corp', from, pill.box, 0, () => pill.pop(this.ui));
        else pill.pop(this.ui);
        return;
      }
      case 'card_trashed': {
        const from = before.get(`access:${e.cardId}`) ?? (e.uid ? before.get(`uid:${e.uid}`) : undefined);
        const pile = gen.discards.corp;
        this.callbacks.log({ kind: 'trash_flight', scheduledMs: timing.runFlight, box: pile.box() });
        if (from) this.flyCard(e.cardId, 'corp', from, pile.box(), 0, () => pile.pop(this.ui));
        return;
      }
      case 'card_advanced': {
        const c = gen.installed.get(e.uid);
        if (!c) return;
        this.callbacks.log({ kind: 'advance_pop', scheduledMs: timing.advancePop, box: { ...c.box } });
        this.fx.cancel(c.badge.scale);
        c.badge.scale.set(1.8);
        this.fx.add({ target: c.badge.scale, to: { x: 1, y: 1 }, duration: timing.advancePop, ease: ease.outBack, owner: c.badge });
        return;
      }
      case 'ice_bypassed':
        notices.push(`Inside Job: ${TERMS.ice} bypassed`);
        return;
      case 'run_ended': {
        const t = runEndText(e, batch);
        if (t) notices.push(t);
        return;
      }
      default:
        return;
    }
  }

  /**
   * S-04-4 "when scored" bonuses and bad publicity (fx queue, <= 300ms each):
   * the status notes pop, the offered ICE flash, and a short notice says what happened.
   */
  private animateBonusEvent(e: GameEvent, notices: string[]): void {
    const gen = this.gen;
    const view = this.view;
    if (!gen || !view) return;
    const popTag = (side: Side) => {
      const tag = this.seatOf(side)?.tag;
      if (!tag || !tag.text) return null;
      this.callbacks.log({ kind: 'tag_pop', text: tag.text, scheduledMs: timing.tagPop, box: { ...tag.box } });
      tag.pop(this.fx, timing.tagPop);
      return tag;
    };
    switch (e.type) {
      case 'bad_publicity_gained':
        popTag('corp');
        notices.push(`${SIDE_NAME.corp} takes ${e.amount} ${TERMS.badPublicity.toLowerCase()}`);
        return;
      case 'temp_credits_gained':
        popTag('runner');
        notices.push(`${tempCreditsText(e.amount)} (${TERMS.badPublicity.toLowerCase()})`);
        return;
      case 'credits_spent': {
        if (!e.temp) return;
        const tag = popTag('runner');
        const b = tag?.box ?? this.seatOf('runner')?.credits.box();
        if (b) this.floatText(`-${e.temp}`, b, theme.warn, timing.tagPop);
        return;
      }
      case 'choice_opened': {
        const boxes = (view.choice?.options ?? []).flatMap((o) => (o.action.type === 'rez' ? [gen.installed.get(o.action.uid)?.box] : [])).filter((b): b is Box => !!b);
        this.callbacks.log({ kind: 'choice_open', text: e.cardId, scheduledMs: timing.choiceFlash });
        for (const b of boxes) this.flash(b, theme.credit, timing.choiceFlash);
        return;
      }
      case 'choice_closed': {
        const name = getCard(this.lastChoiceCard ?? '')?.name ?? 'Bonus';
        notices.push(e.skipped ? `${name}: skipped` : `${name}: ${TERMS.ice} rezzed for free`);
        return;
      }
      default:
        return;
    }
  }

  /** A glow over `b` that fades out. */
  private flash(b: Box, color: number, ms: number): void {
    const g = new Graphics();
    glowRoundRect(g, b.x - 4, b.y - 4, b.width + 8, b.height + 8, 6, color, 3, 1.6);
    g.rect(b.x, b.y, b.width, b.height).fill({ color, alpha: 0.25 });
    this.fxLayer.addChild(g);
    this.fx.add({ target: g, to: { alpha: 0 }, duration: ms, ease: ease.linear, owner: g, onComplete: () => g.destroy() });
  }

  /** A short text floating up from a card. */
  private floatText(text: string, b: Box, color: number, ms: number): void {
    const s = Math.min(this.layout?.scale ?? 1, 1.2);
    const t = new Text({ text, style: { fontFamily: theme.monoFamily, fontSize: Math.round(13 * s), fontWeight: '800', fill: color, stroke: { color: 0x000000, width: 3 } } });
    t.anchor.set(0.5);
    t.position.set(b.x + b.width / 2, b.y + b.height * 0.3);
    this.fxLayer.addChild(t);
    this.fx.add({ target: t, to: { y: t.y - 18 * s, alpha: 0.3 }, duration: ms, ease: ease.outCubic, owner: t, onComplete: () => t.destroy() });
  }

  /** A card (face, or a back when unknown) flies from `from` to `to`, shrinking to fit. */
  private flyCard(cardId: string | null, side: Side, from: Box, to: Box, delay: number, done: () => void): void {
    const def = cardId ? getCard(cardId) : undefined;
    const card = def ? createCardFace(def, from.width, from.height, 'small') : createCardBack(side, from.width, from.height);
    card.position.set(from.x + from.width / 2, from.y + from.height / 2);
    this.fxLayer.addChild(card);
    const k = Math.max(0.15, Math.min(to.width / from.width, to.height / from.height));
    this.fx.add({
      target: card,
      to: { x: to.x + to.width / 2, y: to.y + to.height / 2 },
      delay,
      duration: timing.runFlight,
      ease: ease.inOutCubic,
      owner: card,
      onUpdate: (t) => card.scale.set(1 + (k - 1) * ease.inOutCubic(t)),
      onComplete: () => {
        card.destroy({ children: true });
        done();
      },
    });
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
    if (view.choice) {
      // Only the choice can be answered now (S-04-4).
      this.showHint(view.choice.options.length > 0 ? CHOICE_HINT : `${SIDE_NAME[view.choice.waitingOn]} is choosing`);
      return;
    }
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
    this.runPicking = false;
    this.pickedInstalled = null;
    this.selected = index;
    hand.setSelected(index);
    this.showTargets();
    this.applyView(view, false);
    this.callbacks.changed();
  }

  /** Drops whatever is picked: a hand card, the Run choice, an installed card. */
  private cancelSelection(): void {
    if (this.selected === null && !this.runPicking && this.pickedInstalled === null) return;
    this.selected = null;
    this.runPicking = false;
    this.pickedInstalled = null;
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
    if (!gen || !layout || !view) {
      this.setNewServerLabel(false);
      return;
    }
    // The price pill sits on the Runner's side of a Corp column (where the next ICE goes).
    const columnSide: 'top' | 'bottom' = layout.corp.outward === 'down' ? 'bottom' : 'top';
    if (view.choice) {
      // S-04-4: the free-rez choice. Only its options show: each offered ICE, and Skip where Play goes.
      for (const option of view.choice.options) {
        const a = option.action;
        if (a.type === 'rez') {
          const c = gen.installed.get(a.uid);
          if (c) this.addTarget(gen, layout, 'free_rez', option, c.box, `${TERMS.rez} · free`, 'center', { uid: a.uid });
        } else if (a.type === 'pass') this.addTarget(gen, layout, 'skip', option, layout.action, TERMS.skip, 'center', {});
      }
      this.setNewServerLabel(false);
      return;
    }
    if (this.runPicking) {
      for (const option of view.runOptions) {
        const a = option.action;
        if (a.type !== 'run') continue;
        const slots = layout.corp.servers.find((x) => x.id === a.server);
        if (slots) this.addTarget(gen, layout, 'run', option, slots.column, TERMS.run, columnSide, { server: a.server });
      }
      this.setNewServerLabel(false);
      return;
    }
    if (this.pickedInstalled !== null) {
      const uid = this.pickedInstalled;
      for (const option of view.installedOptions[uid] ?? []) {
        const a = option.action;
        if (a.type === 'advance') this.addTarget(gen, layout, 'advance', option, layout.action, `${TERMS.advance} · ${priceText(option.cost)}`, 'center', { uid });
        else if (a.type === 'score') this.addTarget(gen, layout, 'score', option, layout.action2, TERMS.score, 'center', { uid });
      }
      this.setNewServerLabel(false);
      return;
    }
    if (this.selected === null) {
      this.setNewServerLabel(false);
      return;
    }
    for (const option of view.handOptions[this.selected] ?? []) {
      const a = option.action;
      let kind: TargetSnapshot['kind'];
      let server: string | undefined;
      let b: Box;
      let at: 'top' | 'bottom' | 'center' = 'center';
      if (a.type === 'play' && a.server !== undefined) {
        // A run event that names its server (Inside Job): the servers light up.
        const slots = layout.corp.servers.find((x) => x.id === a.server);
        if (!slots) continue;
        kind = 'play';
        server = a.server;
        b = slots.column;
        at = columnSide;
      } else if (a.type === 'install' && a.server !== undefined) {
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
      const verb = a.type === 'play' ? TERMS.play : TERMS.install;
      this.addTarget(gen, layout, kind, option, b, `${verb} · ${priceText(option.cost)}`, at, server !== undefined ? { server } : {});
    }
    this.setNewServerLabel(this.activeTargets.some((t) => t.kind === 'new_server'));
  }

  /** Lights one target (markers are reused per kind and place). */
  private addTarget(
    gen: Generation,
    layout: BoardLayout,
    kind: TargetSnapshot['kind'],
    option: CardOption,
    b: Box,
    label: string,
    at: 'top' | 'bottom' | 'center',
    where: { server?: string; uid?: string },
  ): void {
    // Markers are kept per place: advance / score always use the same two slots.
    const key = targetKey(kind, where);
    let marker = gen.targets.get(key);
    if (!marker) {
      const m = new TargetMarker(layout.scale);
      m.root.label = `target:${key}`;
      gen.detachers.push(attachPress(m.root, { onTap: () => this.onTargetTap(key) }));
      this.targetLayer.addChild(m.root);
      gen.targets.set(key, m);
      marker = m;
    }
    marker.set(b, label, option.reject === null, at);
    marker.root.visible = true;
    this.activeTargets.push({ kind, ...where, option, marker });
  }

  private setNewServerLabel(on: boolean): void {
    const col = this.gen?.columns.get('new');
    if (col) col.label.visible = on;
  }

  /** An installed card: the Corp's agenda shows its choices (Advance / Score); anything else drops the pick. */
  private onInstalledTap(uid: string): void {
    const view = this.view;
    if (!view) return;
    if (this.flipPending) {
      this.fx.finishAll();
      return;
    }
    if (this.pickedInstalled === uid) {
      this.cancelSelection();
      return;
    }
    if (view.choice) {
      // The offered ICE are lit; a tap on one (or its marker) rezzes it for free.
      const rez = view.choice.options.find((o) => o.action.type === 'rez' && o.action.uid === uid);
      if (rez) this.callbacks.onAction(rez.action);
      else this.showHint(view.choice.options.length > 0 ? CHOICE_HINT : `${SIDE_NAME[view.choice.waitingOn]} is choosing`);
      return;
    }
    const options = view.installedOptions[uid] ?? [];
    this.cancelSelection();
    if (options.length === 0 || view.run) return;
    const first = options[0]!.reject;
    if (first !== null && GATE_REASONS.has(first) && options.every((o) => o.reject === first)) {
      this.showHint(hintFor(first, view));
      if (first === 'no_clicks') this.seatAt('bottom')?.clicks.shake();
      return;
    }
    this.pickedInstalled = uid;
    this.showTargets();
    this.applyView(view, false);
    this.callbacks.changed();
  }

  /** Run: lights every server (view.runOptions); tapping Run again cancels with nothing sent. */
  private onRunButtonTap(): void {
    const view = this.view;
    if (!view) return;
    if (this.flipPending) {
      this.fx.finishAll();
      return;
    }
    if (this.runPicking) {
      this.cancelSelection();
      return;
    }
    const options = view.runOptions;
    if (options.length === 0) return;
    this.cancelSelection();
    const first = options[0]!.reject;
    if (first !== null && GATE_REASONS.has(first) && options.every((o) => o.reject === first)) {
      this.showHint(hintFor(first, view));
      if (first === 'no_clicks') this.seatAt('bottom')?.clicks.shake();
      return;
    }
    this.runPicking = true;
    this.showTargets();
    this.applyView(view, false);
    this.callbacks.changed();
  }

  /** A run decision button: sent as the deciding seat; the engine judges it (a dim one comes back with its hint). */
  private onRunOptionTap(index: number): void {
    const option = this.gen?.run.option(index);
    if (!option || this.flipPending) return;
    this.callbacks.onAction(option.action);
  }

  private onTargetTap(key: string): void {
    const t = this.activeTargets.find((x) => targetKey(x.kind, x) === key);
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
    // Judged by when this tap was made: the second tap of a double tap stays refused
    // even if a slow turn-change frame delays its handling past the guard.
    if (inputTime() < this.endTurnArmedAt) return;
    this.cancelSelection();
    this.callbacks.onEndTurn();
  }

  /**
   * S-05-1: holding `target` zooms the last card of `list()` (a pile's top
   * face-up card, the latest scored agenda); sliding sideways reads the others.
   * A tap does what a tap on the empty board does (drops a pick); a hold never
   * taps. Lifting closes the zoom with nothing chosen.
   */
  private attachHoldZoom(target: Container, list: () => { ids: string[]; side: Side; from: Box } | null): () => void {
    const detach = attachPress(target, {
      onTap: () => this.cancelSelection(),
      onLongPress: () => {
        const l = list();
        const id = l?.ids.at(-1);
        if (!l || id === undefined) return;
        this.openZoom(id, l.side, l.from, { list: { ids: l.ids, index: l.ids.length - 1, startX: Number.NaN } });
      },
      onHoldMove: (x, _y, at) => this.slideList(x, at),
      onLongPressEnd: () => this.closeZoom(),
    });
    target.cursor = 'default';
    return detach;
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

  private showGameOver(layout: BoardLayout, lines: { title: string; reason: string }, winner: Side, animate: boolean): void {
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
    // "Runner wins" big, the reason ("7 agenda points") under it.
    const heading = new Container();
    const title = new Text({
      text: lines.title,
      style: { fontFamily: theme.fontFamily, fontSize: Math.max(18, Math.round(28 * s)), fontWeight: '900', fill: color, align: 'center', letterSpacing: 1 },
    });
    title.anchor.set(0.5, 0);
    const reason = new Text({
      text: lines.reason,
      style: { fontFamily: theme.fontFamily, fontSize: Math.max(13, Math.round(16 * s)), fontWeight: '700', fill: theme.text, align: 'center', wordWrap: true, wordWrapWidth: b.width - 24 * s },
    });
    reason.anchor.set(0.5, 0);
    reason.y = title.height + 2 * s;
    heading.addChild(title, reason);
    const room = b.height - btnH - 24 * s;
    const hh = reason.y + reason.height;
    const k = Math.min(1, room / hh, (b.width - 16 * s) / Math.max(title.width, reason.width));
    heading.scale.set(k);
    heading.position.set(0, -b.height / 2 + 10 * s + (room - hh * k) / 2);
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
    root.addChild(g, heading, btn);
    this.centerLayer.addChild(root);
    this.gameOver = { text: `${lines.title}: ${lines.reason}`, title: lines.title, reason: lines.reason, root };
    if (animate) {
      root.scale.set(0.6);
      root.alpha = 0;
      this.fx.add({ target: root, to: { alpha: 1 }, duration: timing.gameOverIn, owner: root });
      this.fx.add({ target: root.scale, to: { x: 1, y: 1 }, duration: timing.gameOverIn, ease: ease.outBack, owner: root });
    }
  }

  // ---- hint and zoom ------------------------------------------------------

  /** The toast: a refusal hint (amber), or a notice of what just happened in a run (cyan). Never blocks input. */
  private showHint(text: string, kind: 'hint' | 'notice' = 'hint'): void {
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
    const tone = kind === 'notice' ? theme.runner : theme.warn;
    g.roundRect(-w / 2, -h / 2, w, h, Math.min(h / 2, 18)).fill({ color: tone });
    g.roundRect(-w / 2 - ring, -h / 2 - ring, w + 2 * ring, h + 2 * ring, Math.min(h / 2, 18) + ring).stroke({ width: 3, color: tone, alpha: 0.35 });
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
      kind,
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
    // In the column the build date shares the hint's slot: hide it while a hint shows.
    this.buildText.visible = !(this.hint && this.layout?.mode === 'portrait');
  }

  /** Where the build date's text is drawn (CSS px). */
  private buildTextBox(): Box {
    const b = this.buildText.getBounds();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  }

  /** The build date: the date and time centered in the narrow rail (sideways), "Built …" in the column's hint slot. */
  private placeBuildLabel(layout: BoardLayout): void {
    const t = this.buildText;
    const when = this.callbacks.buildTime;
    const rail = layout.mode === 'landscape';
    const text = rail ? when : `Built ${when}`;
    if (t.text !== text) t.text = text;
    const b = layout.buildLabel;
    t.style.align = rail ? 'center' : 'left';
    t.anchor.set(rail ? 0.5 : 0, 0.5);
    fitText(t, b.width, b.height);
    t.position.set(rail ? b.x + b.width / 2 : b.x, b.y + b.height / 2);
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
  private openZoom(
    cardId: string | null,
    side: Side,
    from: Box,
    opts: { hand?: { ids: string[]; index: number }; list?: { ids: string[]; index: number; startX: number } } = {},
  ): void {
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
    let texts: string[];
    let overflow: boolean;
    if (def) {
      const f = createZoomFace(def, z.width, z.height);
      card = f.root;
      texts = f.texts;
      overflow = f.overflow;
    } else {
      card = new Container();
      card.addChild(createCardBack(side, z.width, z.height));
      const t = new Text({
        text: `Face-down ${SIDE_NAME[side]} card`,
        style: { fontFamily: theme.fontFamily, fontSize: Math.max(13, Math.round(z.width * 0.065)), fontWeight: '700', fill: theme.text, align: 'center', wordWrap: true, wordWrapWidth: z.width * 0.8 },
      });
      t.anchor.set(0.5);
      t.position.set(0, z.height * 0.3);
      card.addChild(t);
      texts = textsOf(card);
      overflow = textOverflows(card, z.width, z.height);
    }
    const cx = z.x + z.width / 2;
    const cy = z.y + z.height / 2;
    card.position.set(from.x + from.width / 2, from.y + from.height / 2);
    card.scale.set(Math.min(from.width, from.height) / z.width);
    root.addChild(dim);
    const browse = opts.hand ?? opts.list ?? null;
    let carousel: Carousel | null = null;
    if (browse && browse.ids.length > 1) {
      carousel = new Carousel(cx, cy, z.width, z.height, this.ui, (id) => this.carouselFace(id));
      carousel.show(browse.ids, browse.index, null);
      root.addChild(carousel.root);
    }
    let frame: Graphics | null = null;
    if (opts.hand) {
      frame = new Graphics();
      const { width: w, height: h } = layout.card;
      glowRoundRect(frame, -w / 2, -h / 2, w, h, Math.max(4, w * 0.08), theme.text, Math.max(2, w * 0.035), 1.4);
      frame.position.set(from.x + from.width / 2, from.y + from.height / 2);
      root.addChild(frame);
    }
    root.addChild(card);
    root.alpha = 0;
    this.zoomLayer.addChild(root);
    const list = opts.list ? { ids: opts.list.ids, start: opts.list.index, startX: opts.list.startX, step: Math.max(28, Math.round(z.width * 0.18)) } : null;
    this.zoom = { cardId: def ? cardId : null, root, card, width: z.width, height: z.height, texts, overflow, frame, carousel, index: browse?.index ?? 0, list };
    this.ui.add({ target: root, to: { alpha: 1 }, duration: timing.zoomIn, owner: root });
    this.ui.add({ target: card, to: { x: cx, y: cy }, duration: timing.zoomIn, ease: ease.outCubic, owner: card });
    this.ui.add({ target: card.scale, to: { x: 1, y: 1 }, duration: timing.zoomIn, ease: ease.outBack, owner: card });
  }

  /** A carousel face: the baked zoom face if it is drawn, else the small face as a stand-in (no drawing on a slide). */
  private carouselFace(cardId: string): CarouselFace {
    const layout = this.layout;
    const def = getCard(cardId);
    const z = layout?.zoom;
    if (!def || !layout || !z) return { root: new Container(), full: false };
    if (hasZoomFace(def, z.width, z.height)) return { root: createZoomFace(def, z.width, z.height).root, full: true };
    const small = createCardFace(def, layout.card.width, layout.card.height, 'small');
    small.scale.set(z.width / layout.card.width);
    return { root: small, full: false };
  }

  /**
   * S-04-3: the held finger slid onto another card. The zoom shows it at once,
   * in place (no zoom-in tween), so reading a hand is instant; the carousel
   * behind slides along (S-05-3). `inputAt`: the move's event time, logged for
   * the <100ms check. `index`: its place in the hand / list.
   */
  private swapZoom(cardId: string, from: Box | null, inputAt: number, index: number): void {
    const zoom = this.zoom;
    const layout = this.layout;
    const def = getCard(cardId);
    if (!zoom || !layout || !def || zoom.index === index) return;
    const z = layout.zoom;
    // Finish the zoom-in now: the slide is the reader moving on.
    this.ui.cancel(zoom.root);
    this.ui.cancel(zoom.card);
    this.ui.cancel(zoom.card.scale);
    zoom.root.alpha = 1;
    if (from) zoom.frame?.position.set(from.x + from.width / 2, from.y + from.height / 2);
    const predrawn = hasZoomFace(def, z.width, z.height);
    const next = createZoomFace(def, z.width, z.height);
    const at = zoom.root.getChildIndex(zoom.card);
    zoom.card.destroy({ children: true });
    const card = next.root;
    card.position.set(z.x + z.width / 2, z.y + z.height / 2);
    zoom.root.addChildAt(card, at);
    const prev = zoom.index;
    zoom.card = card;
    zoom.cardId = cardId;
    zoom.texts = next.texts;
    zoom.overflow = next.overflow;
    zoom.index = index;
    if (zoom.carousel) {
      // On a device where drawing a frame is slow, the slide would only delay the next touch: jump instead.
      const slide = !framesAreSlow();
      zoom.carousel.show(zoom.carousel.cardIds, index, prev, slide);
      this.callbacks.log({ kind: 'carousel_slide', text: cardId, scheduledMs: slide ? CAROUSEL_SLIDE_MS : 0 });
    }
    this.callbacks.changed();
    this.callbacks.log({ kind: 'zoom_swap', text: cardId, scheduledMs: 0, inputAt, predrawn });
  }

  /** List zooms (piles, score pills): the held finger moved to x. */
  private slideList(x: number, at: number): void {
    const zoom = this.zoom;
    const list = zoom?.list;
    if (!zoom || !list) return;
    // The first move after the zoom opened is where the finger rests (within the hold's move tolerance).
    if (Number.isNaN(list.startX)) list.startX = x;
    const i = listIndex(list.start, x - list.startX, list.step, list.ids.length);
    const id = list.ids[i];
    if (id !== undefined && i !== zoom.index) this.swapZoom(id, null, at, i);
  }

  private closeZoom(immediate = false): void {
    const zoom = this.zoom;
    if (!zoom) return;
    this.zoom = null;
    this.ui.cancel(zoom.root);
    this.ui.cancel(zoom.card);
    this.ui.cancel(zoom.card.scale);
    if (immediate) {
      this.destroyZoomRoot(zoom.root, zoom.carousel);
      return;
    }
    this.finishFade();
    this.fadingZoom = zoom.root;
    this.ui.add({
      target: zoom.root,
      to: { alpha: 0 },
      duration: timing.zoomOut,
      ease: ease.linear,
      owner: zoom.root,
      onComplete: () => this.destroyZoomRoot(zoom.root, zoom.carousel),
    });
  }

  private destroyZoomRoot(root: Container, carousel: Carousel | null): void {
    carousel?.destroy();
    if (this.fadingZoom === root) this.fadingZoom = null;
    if (!root.destroyed) root.destroy({ children: true });
  }

  /** Drops a zoom still fading out (before its textures may be freed). */
  private finishFade(): void {
    const root = this.fadingZoom;
    this.fadingZoom = null;
    if (root && !root.destroyed) {
      this.ui.cancel(root);
      root.destroy({ children: true });
    }
  }

  // ---- S-05-2 ICE report, S-05-1 Last run strip -----------------------------

  private openReport(text: string, layout: BoardLayout): void {
    this.report?.destroy();
    const r = new IceReport(text, layout, () => this.dismissReport());
    this.panelLayer.addChild(r.root);
    this.report = r;
    this.callbacks.log({ kind: 'ice_report', text, box: { ...r.box }, scheduledMs: 0 });
  }

  /** Closes the report without anything else (a new action, a turn change). */
  private closeReport(): void {
    this.report?.destroy();
    this.report = null;
  }

  /** The tap that closes the report: only that. A game over waiting behind it shows now. */
  private dismissReport(): void {
    if (!this.report) return;
    this.closeReport();
    const view = this.view;
    const layout = this.layout;
    if (view?.result && !this.gameOver && layout) this.showGameOver(layout, gameOverLines(view.result), view.result.winner, true);
    this.callbacks.changed();
  }

  private toggleLastRun(): void {
    if (this.lastRunStrip) this.closeLastRun();
    else this.openLastRun();
    const view = this.view;
    const layout = this.layout;
    if (view && layout && this.gen?.lastRunButton.root.visible) this.gen.lastRunButton.set(layout.action2, 'Last run', true, theme.runner, this.lastRunStrip !== null);
    this.callbacks.changed();
  }

  private openLastRun(): void {
    const last = this.view?.lastRun;
    const layout = this.layout;
    this.closeLastRun();
    if (!last || !layout) return;
    const ids = last.cards.map((c) => c.cardId);
    const strip = new LastRunStrip(last, layout, (target, index, box) =>
      attachPress(target, {
        onLongPress: () => {
          const id = ids[index];
          if (id !== undefined) this.openZoom(id, 'corp', box, { list: { ids, index, startX: Number.NaN } });
        },
        onHoldMove: (x, _y, at) => this.slideList(x, at),
        onLongPressEnd: () => this.closeZoom(),
      }),
    );
    this.accessLayer.addChild(strip.root);
    this.lastRunStrip = strip;
  }

  private closeLastRun(): void {
    this.lastRunStrip?.destroy();
    this.lastRunStrip = null;
  }

  // ---- QA-S4-1: pre-draw the zoom faces while a hand card is pressed ---------

  /**
   * A finger went down on hand card `index`: draw the hand's zoom faces ahead,
   * nearest first, one per frame, during the hold delay (and while the zoom is
   * open). Drawn faces are kept (cardFace cache) until the board is resized.
   */
  private startPredraw(ids: string[], index: number): void {
    const layout = this.layout;
    if (!layout) return;
    this.stopPredraw();
    // Nothing on screen may still show a face evicted earlier: free them now.
    if (!this.zoom) {
      this.finishFade();
      flushZoomFaces();
    }
    const z = layout.zoom;
    const order: string[] = [];
    for (let d = 0; d < ids.length; d++) {
      for (const i of d === 0 ? [index] : [index + d, index - d]) {
        const id = ids[i];
        if (id === undefined || order.includes(id)) continue;
        const def = getCard(id);
        if (def && !hasZoomFace(def, z.width, z.height)) order.push(id);
      }
    }
    if (order.length === 0) return;
    this.predraw = { ids: order, total: order.length, frame: requestAnimationFrame(() => this.predrawStep()), at: performance.now() };
  }

  private predrawStep(): void {
    const p = this.predraw;
    const layout = this.layout;
    if (!p || !layout) return;
    // Around the moment the hold turns into a zoom, draw nothing more: on a slow
    // device a bake in that frame would make the zoom itself late (the held card's
    // own face, first in the list, is already drawn by then). Resumes once it opens.
    const drawnOne = p.ids.length < p.total;
    if (!this.zoom && drawnOne && performance.now() - p.at > timing.longPress - PREDRAW_QUIET_MS) {
      p.frame = requestAnimationFrame(() => this.predrawStep());
      return;
    }
    const z = layout.zoom;
    const id = p.ids.shift();
    const def = id ? getCard(id) : undefined;
    if (id && def && !hasZoomFace(def, z.width, z.height)) {
      // Drawn into the cache; the sprite made here is not needed.
      createZoomFace(def, z.width, z.height).root.destroy({ children: true });
      if (this.zoom?.carousel?.upgrade(id)) this.callbacks.changed();
    }
    if (p.ids.length > 0) p.frame = requestAnimationFrame(() => this.predrawStep());
    else this.predraw = null;
  }

  private stopPredraw(): void {
    if (this.predraw) cancelAnimationFrame(this.predraw.frame);
    this.predraw = null;
  }
}
