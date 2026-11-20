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
import { type ClickCostBox, type StatBox, createCardBack, createCardFace, createZoomFace, dropCardTextures, flushZoomFaces, glowRoundRect, hasZoomFace, retireCardTextures, smallFaceLayout, textOverflows, textsOf } from './cardFace';
import { framesAreSlow } from './frameClock';
import { Cover } from './cover';
import { centeredBox, clearOf, freeRect } from './geometry';
import { Hand, type HandCard } from './hand';
import { DROP_WAIT_MS, LIFT_MS, RETURN_MS, SWIPE_TOLERANCE, VIEW_FADE_MS, type ViewHit, ghostCenter, swipeIndex, targetAt, viewHit } from './handGesture';
import type { AnimRecord, Box, EndTurnClock, InstalledSnapshot, Insets, LayoutSnapshot, SideLayout, TargetSnapshot } from './hook-types';
import type { FlightKind } from './motion';
import type { Decision, Presentation } from './session';
import { choiceHint, collapseRepeats, conditionText, hintFor, rejectText } from './hints';
import { EXPOSED_CAPTION, EXPOSE_HELP, archivesHelpText, archivesTitle, lookDoneLabel, lookHelpText, lookInstallable, lookNotIceText, modeLabel, s12Notice } from './choiceText';
import { basicOptionLabel, bidWaitText, isTraceChoice, linkText, meatDamageText, tagsChangedText, taggedText, taggedTrashText, traceNotices } from './traceText';
import { attachPress, inputTime, noteRelease } from './input';
import type { FederatedPointerEvent } from 'pixi.js';
import { BUILD_LINE, type BoardLayout, type BoardShape, CARD_RATIO, MIN_TOUCH, type SideRow, computeLayout } from './layout';
import { LEAVE_TEXT, LEAVE_TEXT_ONLINE, LeaveDialog } from './leaveDialog';
import type { CoverText } from './passCover';
import { RunDisplay } from './runDisplay';
import { CardSheet, type SheetCard } from './sheets';
import { IceReport, LastRunStrip } from './panels';
import { RUN_END, iceReport, installNotices, isRunChoice, installedOptionLabel, nameOf, runEndText, turnStartNotices } from './runText';
import { SIDE_NAME, TERMS, badPublicityText, handMaxText, plural, pointsText, priceText, serverLabel, tempCreditsText, zoneName } from './terms';
import { sideColor, theme, timing } from './theme';
import { ease, type Tweens } from './tween';
import { ActionButton, Counter, DeckPile, DiscardPile, MemoryCounter, PanelButton, ScorePill, ScoredPile, StatLine, StatusTag, TargetMarker, fitText, placeAt } from './widgets';

type Pos = 'top' | 'bottom';
const SIDES: readonly Side[] = ['corp', 'runner'];
const other = (s: Side): Side => (s === 'corp' ? 'runner' : 'corp');

/** Sprint 12 (S-12-4): the exposed card is drawn at least this wide (readable on the smallest phone). */
const MIN_EXPOSED_W = 72;

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
function targetKey(kind: TargetSnapshot['kind'], where: { server?: string; uid?: string; index?: number }): string {
  if (where.index !== undefined) return `${kind}:#${where.index}`;
  return `${kind}:${where.server ?? (kind === 'free_rez' || kind === 'expose' ? (where.uid ?? '') : '')}`;
}

/**
 * The Runner's status note: "+1 for this run" (bad publicity) and, after brain damage,
 * "Hand max 4" (S-08-3; the engine's `maxHandSize`, shown only when below 5).
 */
function runnerNote(view: PlayerView): string | null {
  const parts: string[] = [];
  // Sprint 10 (S-10-2): "Tagged 1" moved to the stats column (under Memory and Link).
  const max = view.players.runner.maxHandSize;
  if (max < 5) parts.push(handMaxText(max));
  if (view.run && view.run.tempCredits > 0) parts.push(tempCreditsText(view.run.tempCredits));
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Sprint 9: the bid panel (or the run panel) takes the hand's room: during a run, and
 * while a trace bid window is open outside one (SEA Source; no hand shows to the other seat).
 */
/** Sprint 12 (S-12-1): the deciding Corp's look-at sheet takes the hand's strip. */
function lookOpen(view: PlayerView | null): boolean {
  const c = view?.choice;
  return !!c && c.kind === 'look_install' && c.options.length > 0 && (c.looked?.length ?? 0) > 0;
}

function panelUp(view: PlayerView | null): boolean {
  return !!view && (!!view.run || isTraceChoice(view.choice));
}

/** Sprint 9: the key a picked tag marker uses in place of an installed card's uid (Remove 1 tag). */
const TAGS_PICK = 'basic:tags';

/** Sprint 9: a scored agenda's uid (`score:corp:0`), whose abilities show from the score pill. */
function isScoredUid(uid: string): boolean {
  return uid.startsWith('score:');
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


/** Where `c` is drawn on screen (CSS px). */
function boundsOf(c: Container): Box {
  const b = c.getBounds();
  return { x: b.x, y: b.y, width: b.width, height: b.height };
}

function inBox(b: Box, x: number, y: number): boolean {
  return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
}

/** S-10-6: a toast's text is never drawn smaller than this (px). */
export const HINT_MIN_PX = 10;

/** True if `c` is `root` or inside it. */
function isUnder(c: Container | null, root: Container | null): boolean {
  for (let n: Container | null = c; n; n = n.parent) if (n === root) return true;
  return false;
}

/** S-07-6: a lift timer running later than this past its due time means the page stalled. */
const LATE_LIFT_MS = 50;

/** QA-S4-1 pre-draw: no bake from this long before the hold opens the zoom until it has opened (ms). */
const PREDRAW_QUIET_MS = 60;

/** An identity card on the table (U2, S-08-1). */
export interface IdentityRef {
  uid: string;
  cardId: string;
}

/** The side's identity card (null with the starter decks). */
function identityOf(view: PlayerView, side: Side): IdentityRef | null {
  return view.players[side].identity;
}

function shapeOf(view: PlayerView): BoardShape {
  return {
    servers: view.corpServers.map((s) => ({ id: s.id, ice: s.ice.length, content: s.content.length })),
    rig: view.rig.length,
    identities: { corp: identityOf(view, 'corp') !== null, runner: identityOf(view, 'runner') !== null },
  };
}

/** A side's identity card drawn in its slot (hold to read). */
interface IdentityWidget {
  uid: string;
  cardId: string;
  root: Container;
  box: Box;
  detach: () => void;
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
  badgeBg: Graphics;
  badgeText: Text;
  /** S-07-3/4: credits on the card (Armitage 12, Bank Job 8, Cyberfeeder 1), opposite corner from the badge. */
  hosted: Container;
  hostedBg: Graphics;
  hostedText: Text;
  /** What the pill was last drawn for (`text:height`). */
  hostedKey: string;
  /** Sprint 12 (S-12-2): ICE strength other than printed (Experiential Data, Ice Wall counters): "Str 3". */
  strength: Container;
  strengthBg: Graphics;
  strengthText: Text;
  detach: () => void;
}

interface ColumnWidgets {
  label: Text;
  frame: Graphics;
  frameKey: string;
  /** Sprint 10 (S-10-5): where the column was drawn last (x), so a move can slide. */
  x: number | null;
}

interface ActiveTarget {
  kind: TargetSnapshot['kind'];
  server?: string;
  uid?: string;
  /** Sprint 12: a Grip card (Modded's install target), by hand index. */
  index?: number;
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
  /** U2: identity cards (the Corp's in the HQ slot, the Runner's left of the Stack). */
  identities: Partial<Record<Side, IdentityWidget>>;
  memory: MemoryCounter;
  /** Sprint 10 (S-10-2): "Link 1" and the red "Tagged 1", under Memory. */
  link: StatLine;
  tagged: StatLine;
  /** Sprint 10 (S-10-1): the scored-agenda piles, far right of each row. */
  scoredPiles: Record<Side, ScoredPile>;
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
  /** S-07-6: only something drawn moved (a dragged card): redraw on the next frame, nothing to hit-test. */
  redraw?(): void;
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
  /** Sprint 12: Modded's lit Grip cards (over the hand). */
  private readonly gripLayer = new Container();
  /** Sprint 12: the look-at / Archives sheets and the exposed card. */
  private readonly sheetLayer = new Container();
  private readonly fxLayer = new Container();
  private readonly hintLayer = new Container();
  private readonly zoomLayer = new Container();
  /** The small build date (S-04-1). */
  private readonly buildText: Text;
  /** The agenda whose free-rez choice was open before this update (for the "skipped" notice). */
  private lastChoiceCard: string | null = null;
  /** The option of the last tapped button (its refusal hint may name its click price). */
  private tappedOption: CardOption | null = null;
  /** "Leave the game?" over everything (S-04-2). */
  private readonly dialogLayer = new Container();
  /** S-06-5: the "Pass the phone" cover, over the board (under the leave question). */
  private readonly coverLayer = new Container();
  private cover: Cover | null = null;
  /** Notices waiting for the cover to lift (S-07-2). */
  private pendingNotices: string[] = [];
  /** Sprint 6: an online game (this phone plays one seat): "Back to start", Rejoin wording. */
  private online = false;
  /** Sprint 6: a non-blocking line over the board ("Waiting for the other player to come back…"). */
  private status: { text: string; root: Container; box: Box } | null = null;
  private readonly statusLayer = new Container();
  private leave: { dialog: LeaveDialog; onLeave: () => void } | null = null;
  /** One hand per seat, kept between turns. */
  private readonly hands: Record<Side, Hand>;
  /** Catches taps on empty board (cancels a picked card). */
  private readonly catcher = new Container();
  private viewport: { width: number; height: number; insets: Partial<Insets> } | null = null;
  private layout: BoardLayout | null = null;
  private view: PlayerView | null = null;
  private gen: Generation | null = null;
  private gameOver: { text: string; title: string; reason: string; root: Container; button: Box } | null = null;
  /** The other seat's run decision shown on this board (the Corp's rez choice), or null. */
  private decision: Decision | null = null;
  /** True while servers are lit after tapping Run (UI state only). */
  private runPicking = false;
  /** Installed card picked for its choices (Corp agenda: Advance / Score). */
  private pickedInstalled: string | null = null;
  /** Sprint 12 (S-12-1): the looked-at ICE picked (its servers are lit), by `choice.looked` index. */
  private lookPick: number | null = null;
  /** Sprint 12: the look-at sheet (hand strip) or the Archives sheet (over the table), what it was drawn for, its page. */
  private sheet: { kind: 'look' | 'archives'; ui: CardSheet; key: string } | null = null;
  private sheetPage = 0;
  /** Sprint 12 (S-12-4): Infiltration's "Expose 1 card" picked: the face-down Corp cards are lit. */
  private exposePicking = false;
  /** Sprint 12 (S-12-4): the exposed card, shown over its place until tapped away (or the next move). */
  private exposed: { uid: string; cardId: string; root: Container; box: Box; detach: () => void } | null = null;
  private hint: { text: string; root: Container; box: Box; kind: 'hint' | 'notice'; slot: string; wide: boolean; area: Box } | null = null;
  /** QA-S9-1: the notices waiting for the cover include a trace result (shown in the wide slot). */
  private pendingWide = false;
  private zoom: {
    cardId: string | null;
    root: Container;
    card: Container;
    width: number;
    height: number;
    texts: string[];
    overflow: boolean;
    /** Sprint 11 (S-11-4): the bottom stats as drawn (card-local). */
    stats: StatBox[];
    /** S-12-6: the click-symbol cost as drawn (card-local), or null. */
    clickCost: ClickCostBox | null;
    /** Hand zooms: an undimmed outline over the hand card the zoom shows (S-04-3). */
    frame: Graphics | null;
    /** S-05-3: the neighbours behind the zoomed card (hand and list zooms). */
    carousel: Carousel | null;
    /** The index the zoom shows in the carousel's list. */
    index: number;
    /** List zooms (piles, score pills): the slide steps one card per `step` px from `startX`. */
    list: { ids: string[]; start: number; startX: number; step: number } | null;
    /** S-07-6: the hand view (stays open after the finger lifts; takes every tap while open). */
    view: boolean;
    /**
     * Sprint 10: what an open view browses: the hand (S-07-6), a scored pile (S-10-1) or the
     * hand in the discard step (S-10-5: a tap marks / unmarks the big card).
     */
    mode: 'hand' | 'pile' | 'discard';
    /** S-10-1: the pile a pile view shows. */
    pile: { side: Side; ids: string[] } | null;
    /** S-10-5: the "DISCARD" stamp over a marked big card, and the view's Confirm ("Discard 2"). */
    stamp: Container | null;
    confirm: PanelButton | null;
  } | null = null;
  /** S-07-6: the finger pressing in the hand view (one at a time). */
  private viewPress: {
    id: number;
    x: number;
    y: number;
    /** Where the finger is now. */
    lastX: number;
    lastY: number;
    /** When the press was made (event time). */
    at: number;
    hit: ViewHit;
    /** The card in the middle when the press started (a swipe counts from it). */
    start: number;
    swiped: boolean;
    timer: ReturnType<typeof setTimeout> | null;
  } | null = null;
  /** S-07-6: the card lifted out of the hand view, following the finger; `hover`: the place under it. */
  private lift: { index: number; cardId: string; hover: number; boxes: Box[] } | null = null;
  /** Reused for the dragged card's position (no allocation per move). */
  private readonly ghostAt = { x: 0, y: 0 };
  /** S-07-6: a dropped card is waiting on its place for the game's answer (online). */
  private dropping = false;
  private dropWait: ReturnType<typeof setTimeout> | null = null;
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
  private _flipPending = false;
  /** True while the actor's discards fly out before the turn's flip (a tap then only skips ahead). */
  get flipPending(): boolean {
    return this._flipPending;
  }
  /** Sprint 15: cards in the air now (for the test hook's `layout().motion`). */
  private readonly flying = new Set<{ kind: FlightKind; cardId: string | null; root: Container; w: number; h: number }>();

  constructor(
    private readonly fx: Tweens,
    private readonly ui: Tweens,
    private readonly callbacks: BoardCallbacks,
  ) {
    const handCallbacks = (side: Side) => ({
      onTap: (i: number) => this.onStripTap(i),
      onPress: (i: number) => this.startPredraw(this.hands[side].ids, i),
      // The hand view keeps drawing its faces ahead after the finger lifts.
      onPressEnd: () => {
        if (!this.zoom?.view) this.stopPredraw();
      },
      onLongPress: (id: string, from: Box, i: number) => this.onStripHold(side, id, from, i),
      // A hold on the strip opens the hand view, which stays open; the discard picker's zoom closes.
      onLongPressEnd: () => {
        if (!this.zoom?.view) this.closeZoom();
      },
      onZoomSlide: (id: string, box: Box, at: number, i: number) => this.swapZoom(id, box, at, i),
      log: (r: Omit<AnimRecord, 'startedAt'>) => callbacks.log(r),
    });
    this.hands = { corp: new Hand('corp', fx, ui, handCallbacks('corp')), runner: new Hand('runner', fx, ui, handCallbacks('runner')) };
    this.handLayer.addChild(this.hands.corp.container, this.hands.runner.container);
    // Held zooms take no taps (their root is 'none'); the S-07-6 hand view takes every tap while open.
    this.zoomLayer.eventMode = 'passive';
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
    this.table.addChild(this.catcher, this.bgLayer, this.boardLayer, this.installedLayer, this.runLayer, this.centerLayer, this.accessLayer, this.targetLayer, this.handLayer, this.gripLayer, this.sheetLayer, this.buildText);
    this.stage.addChild(this.table, this.fxLayer, this.hintLayer, this.statusLayer, this.panelLayer, this.zoomLayer, this.coverLayer, this.dialogLayer);
    this.statusLayer.eventMode = 'none';
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
    if (this.cover) this.setCover(this.cover.text);
    if (this.status) this.setStatus(this.status.text);
  }

  /** Sprint 6: this board plays one seat of an online game. */
  setOnline(on: boolean): void {
    this.online = on;
  }

  /**
   * Sprint 6: a status line over the top of the board (never takes taps), or
   * null to remove it: "Reconnecting…", "Waiting for the other player to come back…".
   */
  setStatus(text: string | null): void {
    if (this.status) {
      this.status.root.destroy({ children: true });
      this.status = null;
    }
    const layout = this.layout;
    if (text && layout) {
      const s = Math.min(Math.max(layout.scale, 0.8), 1.2);
      const root = new Container();
      root.label = 'status';
      const t = new Text({ text, style: { fontFamily: theme.fontFamily, fontSize: Math.max(13, Math.round(15 * s)), fontWeight: '700', fill: theme.warn } });
      t.anchor.set(0.5);
      fitText(t, layout.board.width - 40);
      const w = Math.round(t.width + 28 * s);
      const h = Math.max(30, Math.round(t.height + 12 * s));
      const g = new Graphics();
      g.roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: 0x05040a, alpha: 0.92 });
      g.roundRect(-w / 2, -h / 2, w, h, h / 2).stroke({ color: theme.warn, width: 1.5, alpha: 0.8 });
      root.addChild(g, t);
      const cx = layout.board.x + layout.board.width / 2;
      const cy = layout.board.y + layout.board.height / 2;
      root.position.set(Math.round(cx), Math.round(cy));
      this.statusLayer.addChild(root);
      this.status = { text, root, box: { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), width: w, height: h } };
    }
    this.callbacks.changed();
  }

  /**
   * S-06-5: puts the opaque "Pass the phone" cover up (`text`) or takes it
   * away (null). Going up, every running animation is finished first, so the
   * board behind it is already the next player's: lifting it shows that board
   * on the next frame. A tap on the cover lifts it.
   */
  setCover(text: CoverText | null): void {
    const wasUp = this.cover !== null;
    this.cover?.destroy();
    this.cover = null;
    if (text) {
      // Sprint 9: a notice just shown (SEA Source's "trace 3 vs link 1: Runner tagged") would fade
      // unseen under the cover: it shows again once the cover lifts (notices only say public things).
      if (this.hint?.kind === 'notice' && !wasUp) {
        this.pendingNotices.unshift(this.hint.text);
        this.pendingWide = this.pendingWide || this.hint.wide;
        this.ui.cancel(this.hint.root);
        this.hint.root.destroy({ children: true });
        this.hint = null;
      }
      this.closeZoom(true);
      this.stopPredraw();
      this.closeLastRun();
      this.fx.finishAll();
      const layout = this.layout;
      if (layout) {
        this.cover = new Cover(layout, text, () => {
          this.setCover(null);
          this.callbacks.log({ kind: 'cover_lifted', scheduledMs: 0 });
          this.flushNotices();
        });
        this.coverLayer.addChild(this.cover.root);
      }
    }
    this.callbacks.changed();
  }

  /**
   * The phone's Back button (S-04-2, owner answer A): closes the leave
   * question or a zoom; on the game-over screen calls `exit`; otherwise asks
   * "Leave the game?" (Leave calls `exit`). Returns what it did.
   */
  back(exit: () => void): BackAction {
    // Under the "Pass the phone" cover nothing of the board is on screen: Back asks to leave.
    const covered = this.cover !== null;
    const panelOpen = !covered && (this.report !== null || this.lastRunStrip !== null);
    const action = backAction({ dialogOpen: this.leave !== null, zoomOpen: !covered && this.zoom !== null, panelOpen, gameOver: !!this.view?.result && !this.report });
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
      this.online ? LEAVE_TEXT_ONLINE : LEAVE_TEXT,
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
    if (this.cover) this.setCover(this.cover.text);
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
    // S-07-6: the game answered a dropped card: the play's flight starts where it was let go
    // (or, refused, the hand sync slides it home).
    this.endDropWait();
    // Any new view while a card is lifted cancels the lift (hand indices may have moved). An open
    // hand view closes when the hand changed, or a run or the discard picker starts.
    if (this.lift) this.closeZoom(true);
    else if (this.zoom?.view) {
      const z = this.zoom;
      const ids = z.pile ? view.players[z.pile.side].scored : (view.players[view.viewer].hand ?? []);
      const was = z.pile ? z.pile.ids : this.hands[view.viewer].ids;
      const same = this.view?.viewer === view.viewer && ids.length === was.length && ids.every((id, i) => id === was[i]);
      // S-10-5: the discard step's view stays only through the discard step (the hand view never does).
      const wrongStep = z.mode === 'discard' ? view.pendingDiscard === 0 : view.pendingDiscard > 0;
      if (!same || panelUp(view) || wrongStep) this.closeZoom(true);
    }
    const prev = this.view;
    if (prev?.choice && prev.choice.kind === 'free_rez') this.lastChoiceCard = prev.choice.cardId;
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
      this.exposePicking = false;
      this.lookPick = null;
      // Sprint 12 (S-12-4): an exposed card shows until tapped away or the next move.
      if (events.length > 0) this.clearExposed();
      // A card's own ability (Take 2 credits) stays picked too: tap again to take more.
      const advanced = events.some((e) => (e.type === 'card_advanced' || (e.type === 'ability_triggered' && e.trigger === 'click')) && e.uid === this.pickedInstalled);
      // Sprint 9: the tag marker stays picked after Remove 1 tag (remove another with one tap); PSF after its use.
      const basic = this.pickedInstalled === TAGS_PICK && events.some((e) => e.type === 'tags_changed');
      const scored = this.pickedInstalled !== null && isScoredUid(this.pickedInstalled) && events.some((e) => e.type === 'meat_damage');
      if (!advanced && !basic && !scored) this.pickedInstalled = null;
    }
    if (this.pickedInstalled !== null && this.pickedOptions(view, this.pickedInstalled).length === 0) this.pickedInstalled = null;
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
    // S-10-5: a card trashed from the table fills Archives when it lands there, not before.
    if (events.some((e) => e.type === 'card_trashed' || e.type === 'corp_card_trashed')) this.gen?.discards.corp.set(prev.players.corp.discardCount, prev.players.corp.discard);
    for (const l of leaving) this.flyFromHand(l.e, l.card, layout);
    const notices: string[] = [];
    for (const e of events) {
      if (e.type === 'server_created') this.serverOpen(e.server, layout);
      if (e.type === 'server_removed') this.serverClose(before.get(`col:${e.server}`));
      // Run-only credits (bad publicity) are paid first: only the rest leaves the credits pill.
      if (e.type === 'credits_spent' && e.player === viewer) this.creditFloat(-(e.amount - (e.temp ?? 0)));
      this.animateBonusEvent(e, notices);
      if (e.type === 'credit_gained' && e.player === viewer) this.creditFloat(e.amount);
      if (e.type === 'action_rejected') {
        this.showHint(rejectText(e.reason, view, this.tappedOption));
        if (e.reason === 'no_clicks') this.seatAt('bottom')?.clicks.shake();
      }
      this.animateRunEvent(e, layout, before, prevRun, reportText ? [] : notices, events);
    }
    this.tappedOption = null;
    notices.push(...installNotices(events), ...turnStartNotices(events));
    // Sprint 9: "Corp bid 0" for a skipped window, and the trace's result with both totals
    // (in a run the ICE report says it instead).
    const traced = reportText ? [] : traceNotices(events);
    notices.push(...traced);
    if (newStep && view.run) this.stepFlash();
    // A fired subroutine already says what happened: no extra "loses 1 click" / "Run ended" lines.
    const fired = events.some((e) => e.type === 'subroutine_fired');
    const shown = fired ? notices.filter((n) => !n.startsWith(`${SIDE_NAME.runner} loses`) && n !== RUN_END['ended_by_ice']) : notices;
    // QA-S9-2: once the game is over, the game-over box says what happened; no toast lands on it.
    if (shown.length > 0 && !view.result && !events.some((e) => e.type === 'action_rejected')) this.showHint(shown.join('\n'), 'notice', traced.length > 0);
  }

  /** The End turn guard and flip timestamps (test hook). */
  /** Sprint 11 (test hook): the size the long-press zoom draws a card at, for this screen. */
  zoomSize(): { width: number; height: number } | null {
    return this.layout ? { width: this.layout.zoom.width, height: this.layout.zoom.height } : null;
  }

  endTurnClock(): EndTurnClock {
    return { armedAt: this.endTurnArmedAt, flipDueAt: this.flipDueAt };
  }

  /** Where a face-up installed card draws its name, type label, cost and click-cost chip (screen boxes; test hook). */
  private faceBoxes(c: InstalledCard, u: number, uh: number): InstalledSnapshot['face'] {
    const def = c.faceUp && c.cardId ? getCard(c.cardId) : undefined;
    if (!def || u <= 0) return null;
    const f = smallFaceLayout(def, u, uh);
    const toScreen = (r: Box): Box => {
      const pts = [c.root.toGlobal({ x: r.x, y: r.y }), c.root.toGlobal({ x: r.x + r.width, y: r.y + r.height })];
      const x = Math.min(pts[0]!.x, pts[1]!.x);
      const y = Math.min(pts[0]!.y, pts[1]!.y);
      return { x, y, width: Math.abs(pts[1]!.x - pts[0]!.x), height: Math.abs(pts[1]!.y - pts[0]!.y) };
    };
    return { name: toScreen(f.name), type: toScreen(f.type), cost: toScreen(f.cost), nameText: f.nameText, clickCost: f.clickCost ? toScreen(f.clickCost.box) : null };
  }

  snapshot(): LayoutSnapshot {
    const layout = this.layout;
    const view = this.view;
    const gen = this.gen;
    const zero = { x: 0, y: 0, width: 0, height: 0 };
    const side = (s: Side): SideLayout => {
      const seat = this.seatOf(s);
      // Credits / clicks: resting boxes. A pop (x1.18 for 200 ms) briefly reaches past the 8 px gap
      // between the two pills by design; a snapshot taken before the next frame used to report that.
      if (!gen || !seat || !layout) return { deck: zero, credits: zero, clicks: zero, discard: zero, label: zero };
      return { deck: gen.decks[s].box(), credits: seat.credits.restBox(), clicks: seat.clicks.restBox(), discard: gen.discards[s].box(), label: layout[seat.pos].label };
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
        counterBadge: c && c.badge.visible ? { text: c.badgeText.text, box: boundsOf(c.badge), fontPx: c.badgeText.style.fontSize as number, color: theme.advance, icon: 'chevron' } : null,
        hosted: c && c.hosted.visible ? { text: c.hostedText.text, box: boundsOf(c.hosted), fontPx: c.hostedText.style.fontSize as number, color: theme.credit, icon: 'coin' } : null,
        strength: c && c.strength.visible ? { text: c.strengthText.text, box: boundsOf(c.strength), fontPx: c.strengthText.style.fontSize as number } : null,
        face: c ? this.faceBoxes(c, u.width, u.height) : null,
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
      identities: Object.fromEntries(
        SIDES.map((sd) => {
          const w = gen?.identities[sd];
          return [sd, w && w.root.visible ? { uid: w.uid, cardId: w.cardId, box: centeredBox(w.root, w.box.width, w.box.height) } : null];
        }),
      ) as LayoutSnapshot['identities'],
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
        ...(t.index !== undefined ? { index: t.index } : {}),
        box: { ...t.marker.box },
        label: t.marker.text,
        pill: { ...t.marker.pillBox, x: t.marker.box.x + t.marker.box.width / 2 + t.marker.pillBox.x, y: t.marker.box.y + t.marker.box.height / 2 + t.marker.pillBox.y },
        pillFontPx: t.marker.pillFontPx,
        ...(t.marker.note ? { note: t.marker.note } : {}),
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
      gameOver: this.gameOver && layout ? { text: this.gameOver.text, title: this.gameOver.title, reason: this.gameOver.reason, box: layout.gameOver, button: this.online ? 'Back to start' : 'New game', buttonBox: { ...this.gameOver.button } } : null,
      status: this.status ? { text: this.status.text, box: { ...this.status.box } } : null,
      run: gen?.run.snapshot ?? null,
      trace: gen?.run.traceSnapshot ?? null,
      runnerStatus: {
        tagged:
          gen && gen.tagged.text
            ? { text: gen.tagged.text, box: { ...gen.tagged.box }, hit: runner?.pos === 'bottom' && layout ? { ...layout.rig.stats } : { ...gen.tagged.box } }
            : null,
        link: gen && gen.link.text ? { text: gen.link.text, box: { ...gen.link.box } } : null,
        stats: layout ? { ...layout.rig.stats } : zero,
      },
      runButton:
        gen && gen.runButton.root.visible
          ? { box: { ...gen.runButton.box }, label: gen.runButton.text, lit: gen.runButton.lit, picking: this.runPicking }
          : null,
      score: {
        corp: { text: gen?.scores.corp.text ?? '', box: gen ? { ...gen.scores.corp.box } : zero },
        runner: { text: gen?.scores.runner.text ?? '', box: gen ? { ...gen.scores.runner.box } : zero },
      },
      scored: Object.fromEntries(
        SIDES.map((sd) => {
          const p = gen?.scoredPiles[sd];
          return [sd, p ? { box: p.box(), text: p.text, count: p.count, top: p.top, tappable: p.root.eventMode === 'static' } : { box: zero, text: '', count: 0, top: null, tappable: false }];
        }),
      ) as LayoutSnapshot['scored'],
      selectedInstalled: this.pickedInstalled,
      hint: this.hint && this.hint.root.alpha > 0.05 ? { text: this.hint.text, box: this.hint.box } : null,
      sheet: this.sheet
        ? {
            kind: this.sheet.kind,
            title: this.sheet.ui.title,
            box: { ...this.sheet.ui.box },
            cards: this.sheet.ui.cards.map((c) => ({ ...c, box: { ...c.box } })),
            page: this.sheet.ui.page,
            pages: this.sheet.ui.pages,
            pager: this.sheet.ui.pager ? { prev: { ...this.sheet.ui.pager.prev }, next: { ...this.sheet.ui.pager.next }, text: this.sheet.ui.pager.text } : null,
          }
        : null,
      exposed: this.exposed ? { uid: this.exposed.uid, cardId: this.exposed.cardId, box: { ...this.exposed.box }, caption: EXPOSED_CAPTION } : null,
      dialog: this.leave ? this.leave.dialog.snapshot() : null,
      cover: this.cover ? this.cover.snapshot() : null,
      report: this.report ? { text: this.report.text, box: { ...this.report.box } } : null,
      lastRun: {
        button: gen && gen.lastRunButton.root.visible ? { box: { ...gen.lastRunButton.box }, label: gen.lastRunButton.text } : null,
        strip: this.lastRunStrip ? { title: this.lastRunStrip.title, box: { ...this.lastRunStrip.box }, cards: this.lastRunStrip.cards.map((c) => ({ ...c, box: { ...c.box } })) } : null,
      },
      buildLabel:
        layout && this.buildText.visible && this.buildText.text
          ? { text: this.buildText.text, box: this.buildTextBox() }
          : null,
      handView: this.zoom?.view && this.zoom.mode !== 'pile' && this.zoom.cardId && layout ? { index: this.zoom.index, cardId: this.zoom.cardId, lifted: this.lift !== null, centre: { ...layout.zoom } } : null,
      pileView:
        this.zoom?.view && this.zoom.pile && this.zoom.cardId && layout
          ? { side: this.zoom.pile.side, index: this.zoom.index, cardId: this.zoom.cardId, count: this.zoom.pile.ids.length, centre: { ...layout.zoom } }
          : null,
      discardView:
        this.zoom?.view && this.zoom.mode === 'discard' && this.zoom.confirm && layout
          ? {
              index: this.zoom.index,
              stamped: this.zoom.stamp?.visible ?? false,
              marked: [...this.marked].sort((a, b) => a - b),
              confirm: { box: { ...this.zoom.confirm.box }, label: this.zoom.confirm.text, lit: this.zoom.confirm.lit },
            }
          : null,
      drag: this.dragSnapshot(),
      // While a card is lifted the hand view is faded out: no zoom is on screen.
      zoom: this.zoom && !this.lift
        ? {
            cardId: this.zoom.cardId,
            box: centeredBox(this.zoom.card, this.zoom.width, this.zoom.height),
            texts: this.zoom.texts,
            textOverflow: this.zoom.overflow,
            stats: this.zoom.stats.map((x) => ({ text: x.text, box: { ...x.box }, fontPx: x.fontPx })),
            clickCost: copyClickCost(this.zoom.clickCost),
            carousel: this.zoom.carousel?.snapshot() ?? [],
          }
        : null,
      animating: this.fx.active,
      motion: {
        active: [...this.flying].filter((f) => !f.root.destroyed).length,
        flights: [...this.flying].filter((f) => !f.root.destroyed).map((f) => ({ kind: f.kind, cardId: f.cardId, box: centeredBox(f.root, f.w, f.h) })),
      },
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
      this._flipPending = false;
      this.switchSeat(p.nextView, p.nextEvents);
      // The actor's pile is now in the top row: pop it so the new count is noticed.
      if (discarded) this.gen?.discards[p.actor].pop(this.ui);
    };
    if (discardMs > 0) {
      this._flipPending = true;
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
    for (const e of events) {
      if (e.type === 'credit_gained' && e.player === viewer) this.creditFloat(e.amount);
      if (e.type === 'hosted_credits_changed') this.animateRunEvent(e, layout, new Map(), null, [], events);
      // S-08-2: an Adonis Campaign emptied at the turn's start is already in Archives: pop the pile.
      if (e.type === 'corp_card_trashed') this.gen?.discards.corp.pop(this.ui);
    }
    // S-07-2: "PAD Campaign: +1 credit" at the new turn's start, once the board is in view.
    this.queueNotices(turnStartNotices(events));

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
    for (const s of SIDES) this.placeIdentity(gen, layout, s, identityOf(view, s), rowOf(s).identity);
    // The Corp's identity stands for HQ: it takes the HQ marker's slot (the hand count is in the Corp's name row).
    gen.hq.root.visible = !gen.identities.corp?.root.visible;

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
        col = { label, frame, frameKey: '', x: null };
        this.boardLayer.addChildAt(frame, 0);
        this.boardLayer.addChild(label);
        gen.columns.set(slots.id, col);
        fitText(label, slots.column.width - 2);
      }
      const c = slots.column;
      // S-10-5: a lane that moves because one before it was removed slides over (never jumps,
      // so it can't look like the removed lane turned into it). Input is never blocked.
      const dx = animate && col.x !== null && slots.id !== 'new' && Math.abs(col.x - c.x) > 0.5 ? col.x - c.x : 0;
      col.x = c.x;
      this.fx.cancel(col.frame);
      this.fx.cancel(col.label);
      col.label.position.set(slots.label.x + slots.label.width / 2 + dx, slots.label.y + slots.label.height / 2);
      col.frame.x = dx;
      if (dx !== 0) {
        this.callbacks.log({ kind: 'column_shift', text: slots.id, scheduledMs: timing.columnShift, box: { ...c } });
        this.fx.add({ target: col.frame, to: { x: 0 }, duration: timing.columnShift, ease: ease.outCubic, owner: col.frame });
        this.fx.add({ target: col.label, to: { x: slots.label.x + slots.label.width / 2 }, duration: timing.columnShift, ease: ease.outCubic, owner: col.label });
      }
      const key = `${c.x},${c.y},${c.width},${c.height}`;
      if (col.frameKey !== key && slots.id !== 'new') {
        col.frameKey = key;
        col.frame.clear();
        col.frame.roundRect(c.x, c.y, c.width, c.height, 6).fill({ color: theme.corp, alpha: 0.035 }).stroke({ width: 1, color: theme.corp, alpha: 0.18 });
      }
      col.label.visible = slots.id !== 'new';
    }
    // S-07-1: a server the engine removed (empty remote) loses its column; the others keep their names.
    const live = new Set<string>([...layout.corp.servers, layout.corp.newServer].map((x) => x.id));
    for (const [id, col] of gen.columns) {
      if (live.has(id)) continue;
      col.label.destroy();
      col.frame.destroy();
      gen.columns.delete(id);
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
    placeAt(gen.scoredPiles.corp.root, layout.corp.scored);
    placeAt(gen.scoredPiles.runner.root, layout.rig.scored);
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
    // Sprint 10 (S-10-2): Link and Tagged under Memory. The Runner taps the stats column for Remove 1 tag.
    const link = new StatLine('link', 'link');
    const tagged = new StatLine('tagged', 'tagged');
    detachers.push(this.pressFeedback(tagged.root, () => this.onTagTap()));
    // Sprint 10 (S-10-1): the scored piles. Hold to read (as the other piles); a tap opens them (U2).
    const scoredPiles = { corp: new ScoredPile(layout.corp.scored, 'corp', s), runner: new ScoredPile(layout.rig.scored, 'runner', s) };
    for (const side of SIDES) {
      const pile = scoredPiles[side];
      detachers.push(
        this.attachHoldZoom(
          pile.root,
          () => {
            const ids = [...(this.view?.players[side].scored ?? [])];
            return ids.length > 0 ? { ids, side: 'corp', from: pile.box() } : null;
          },
          () => this.onScoredPileTap(side),
        ),
      );
      pile.root.eventMode = 'none';
    }
    this.boardLayer.addChild(hq.root, decks.corp.root, decks.runner.root, discards.corp.root, discards.runner.root, memory.root, link.root, tagged.root, scoredPiles.corp.root, scoredPiles.runner.root);

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
        this.attachHoldZoom(
          pill.root,
          () => {
            const ids = [...(this.view?.players[side].scored ?? [])];
            return ids.length > 0 ? { ids, side: 'corp', from: pill.box } : null;
          },
          // Sprint 9 (S-09-3): a tap on the viewer's own score shows a scored agenda's ability (Private Security Force).
          () => this.onScoreTap(side),
        ),
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
      identities: {},
      memory,
      link,
      tagged,
      scoredPiles,
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
    for (const w of Object.values(gen.identities)) w.detach();
    gen.run.detach();
    this.closeSheet();
    this.clearExposed();
    for (const layer of [this.bgLayer, this.boardLayer, this.installedLayer, this.runLayer, this.centerLayer, this.accessLayer, this.targetLayer, this.gripLayer]) {
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
      // Advancement counters (QA-S7-2): a green tag with a chevron in the top-right corner, on backs too (both players see the number).
      const badge = new Container();
      badge.label = 'advancement';
      const badgeBg = new Graphics();
      const badgeText = new Text({ text: '', style: { fontFamily: theme.monoFamily, fontSize: Math.max(12, Math.round(Math.max(9, u * 0.2) * 1.25)), fontWeight: '800', fill: theme.ink } });
      badgeText.anchor.set(0.5);
      badge.addChild(badgeBg, badgeText);
      badge.visible = false;
      // S-07-3/4: the credits on the card: a dark pill with a gold coin and gold digits (>= 14 px on every phone),
      // in the art window so it never covers the name or type (QA-S7-1).
      const hosted = new Container();
      const hostedBg = new Graphics();
      const hostedText = new Text({ text: '', style: { fontFamily: theme.monoFamily, fontSize: Math.max(14, Math.round(u * 0.26)), fontWeight: '800', fill: theme.credit } });
      hostedText.anchor.set(0.5);
      hosted.addChild(hostedBg, hostedText);
      hosted.visible = false;
      hosted.label = 'hosted-credits';
      // Sprint 12 (S-12-2): the ICE's strength when it differs from the printed one (red pill, bottom-left).
      const strength = new Container();
      strength.label = 'ice-strength';
      const strengthBg = new Graphics();
      const strengthText = new Text({ text: '', style: { fontFamily: theme.fontFamily, fontSize: Math.max(11, Math.round(u * 0.2)), fontWeight: '800', fill: theme.text } });
      strengthText.anchor.set(0.5);
      strength.addChild(strengthBg, strengthText);
      strength.visible = false;
      // ICE lies sideways: its markers stay upright.
      if (zone === 'ice') {
        badge.rotation = -Math.PI / 2;
        hosted.rotation = -Math.PI / 2;
        strength.rotation = -Math.PI / 2;
      }
      root.addChild(visual, badge, hosted, strength);
      const c: InstalledCard = {
        uid: v.uid,
        owner,
        zone,
        root,
        visual,
        visualKey: '',
        cardId: v.cardId,
        faceUp: v.faceUp,
        box: b,
        badge,
        badgeBg,
        badgeText,
        hosted,
        hostedBg,
        hostedText,
        hostedKey: '',
        strength,
        strengthBg,
        strengthText,
        detach: () => {},
      };
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
    this.setAdvancements(card, v.advancements, u, uh);
    const visualKey = v.faceUp && v.cardId ? `face:${v.cardId}` : 'back';
    if (card.visualKey !== visualKey) {
      card.visualKey = visualKey;
      for (const c of card.visual.removeChildren()) c.destroy({ children: true });
      const def = v.faceUp && v.cardId ? getCard(v.cardId) : undefined;
      card.visual.addChild(def ? createCardFace(def, u, uh, 'small') : createCardBack(owner, u, uh));
    }
    this.setHosted(card, v.hostedCredits ?? 0, u, uh);
    this.setStrength(card, v, u, uh);
  }

  /**
   * Sprint 12 (S-12-2): "Str 3" on ICE whose strength (the view's `strength`: printed + Ice Wall
   * counters + Experiential Data) differs from the printed one; hidden otherwise and on backs.
   */
  private setStrength(card: InstalledCard, v: InstalledView, u: number, uh: number): void {
    const printed = v.cardId ? getCard(v.cardId)?.strength : undefined;
    const show = card.zone === 'ice' && v.strength !== undefined && printed !== undefined && v.strength !== printed;
    card.strength.visible = show;
    if (!show) return;
    const up = v.strength! > printed!;
    const def = card.faceUp && card.cardId ? getCard(card.cardId) : undefined;
    const f = def ? smallFaceLayout(def, u, uh) : null;
    // Room along the card's y between its top and its name (the pill is turned upright, so its width goes there).
    const room = f ? f.name.y - 1 - (-uh / 2 + 1) : u;
    let text = `${TERMS.strength.slice(0, 3)} ${v.strength}`;
    if (card.strengthText.text !== text) card.strengthText.text = text;
    // A tiny card (short sideways phone): just the number (the red pill says it is raised).
    if (card.strengthText.width + 10 > room) {
      text = String(v.strength);
      card.strengthText.text = text;
    }
    const h = Math.round(card.strengthText.height + 2);
    const w = Math.round(card.strengthText.width + 10);
    card.strengthBg.clear();
    card.strengthBg.roundRect(-w / 2, -h / 2, w, h, Math.round(h * 0.3)).fill({ color: up ? theme.tagged : theme.panel, alpha: 0.95 }).stroke({ width: 1.5, color: theme.text });
    // In the art window, clear of the name and type (and of a credits pill, if any); on a back, the middle.
    const lo = -uh / 2 + 1 + w / 2;
    const hi = f ? f.name.y - 1 - w / 2 : uh / 2 - 1 - w / 2;
    const artX = f ? f.art.x + f.art.width / 2 : 0;
    const artY = f ? f.art.y + f.art.height / 2 : 0;
    let cy = card.hosted.visible && f ? hi : Math.max(lo, Math.min(artY, hi));
    let cx = card.hosted.visible ? artX - (card.hostedText.height + 6) : artX;
    if (card.badge.visible) {
      // Clear of the advancement tag in the top-right corner (card-local; the tag is turned upright too).
      const b = card.badge.getLocalBounds();
      const tagLeft = card.badge.position.x - b.height / 2;
      const tagBottom = card.badge.position.y + b.width / 2;
      if (cy - w / 2 < tagBottom + 1 && cx + h / 2 > tagLeft - 1) {
        const left = tagLeft - 1 - h / 2;
        // Left of the tag if the card is wide enough, else below it.
        if (left >= -u / 2 + 1 + h / 2) cx = left;
        else cy = Math.min(hi, Math.max(cy, tagBottom + 1 + w / 2));
      }
    }
    card.strength.position.set(cx, cy);
  }

  /** U2: draws (or hides) `side`'s identity card in its slot; hold it to read it. */
  private placeIdentity(gen: Generation, layout: BoardLayout, side: Side, ref: IdentityRef | null, slot: Box | null): void {
    let w = gen.identities[side];
    if (w && (!ref || w.cardId !== ref.cardId)) {
      w.detach();
      w.root.destroy({ children: true });
      delete gen.identities[side];
      w = undefined;
    }
    const def = ref ? getCard(ref.cardId) : undefined;
    if (!ref || !slot || !def) return;
    if (!w) {
      const u = layout.unit.width;
      const uh = layout.unit.height;
      const root = new Container();
      root.label = `identity:${side}`;
      root.hitArea = new Rectangle(-u / 2, -uh / 2, u, uh);
      // Sprint 10 (S-10-2): nothing is drawn over the identity (Link moved to the stats column).
      root.addChild(createCardFace(def, u, uh, 'small'));
      const cardId = ref.cardId;
      const widget: IdentityWidget = { uid: ref.uid, cardId, root, box: slot, detach: () => {} };
      widget.detach = this.attachHoldZoom(root, () => ({ ids: [cardId], side, from: widget.box }));
      this.boardLayer.addChild(root);
      gen.identities[side] = widget;
      w = widget;
    }
    w.uid = ref.uid;
    w.box = slot;
    placeAt(w.root, slot);
  }

  /** QA-S7-2: the advancement tag (green, chevron, dark digits) in the card's top-right corner. */
  private setAdvancements(card: InstalledCard, n: number, u: number, uh: number): void {
    card.badge.visible = n > 0;
    const text = String(n);
    if (n <= 0 || card.badgeText.text === text) return;
    card.badgeText.text = text;
    const h = Math.round(card.badgeText.height + 2);
    const icon = Math.round(h * 0.42);
    const w = Math.round(4 + icon + 2 + card.badgeText.width + 5);
    card.badgeBg.clear();
    card.badgeBg.roundRect(-w / 2, -h / 2, w, h, Math.round(h * 0.3)).fill({ color: theme.advance }).stroke({ width: 1.5, color: theme.ink });
    // Two stacked chevrons ("advance").
    const cx = -w / 2 + 4 + icon / 2;
    for (const dy of [-h * 0.12, h * 0.16]) {
      card.badgeBg
        .moveTo(cx - icon / 2, dy + icon * 0.28)
        .lineTo(cx, dy - icon * 0.22)
        .lineTo(cx + icon / 2, dy + icon * 0.28)
        .stroke({ width: Math.max(1.5, h * 0.11), color: theme.ink, cap: 'round', join: 'round' });
    }
    card.badgeText.position.set(-w / 2 + 4 + icon + 2 + card.badgeText.width / 2, 0);
    // Card-local half extents (ICE: the tag is turned back upright, so they swap).
    const ex = card.zone === 'ice' ? h / 2 : w / 2;
    const ey = card.zone === 'ice' ? w / 2 : h / 2;
    card.badge.position.set(u / 2 - ex - 1, -uh / 2 + ey + 1);
  }

  /**
   * The credits on a card: a dark pill with a gold coin and gold digits, sized to its digits.
   * Face up it sits in the art window, above the name (never over the name or type, QA-S7-1);
   * on a card back it sits in the middle.
   */
  private setHosted(card: InstalledCard, credits: number, u: number, uh: number): void {
    card.hosted.visible = credits > 0;
    if (credits <= 0) return;
    const text = String(credits);
    if (card.hostedText.text !== text) card.hostedText.text = text;
    const th = Math.ceil(card.hostedText.height);
    const def = card.faceUp && card.cardId ? getCard(card.cardId) : undefined;
    const f = def ? smallFaceLayout(def, u, uh) : null;
    // Face up (not sideways): the band above the name, below the cost bubble when there is room
    // (an installed card's cost no longer matters, so tiny cards past the busy board may cover it).
    // Never over the name or type (QA-S7-1). Bounds include the stroke: 1 px each side.
    const fontPx = card.hostedText.style.fontSize as number;
    const minH = Math.round(fontPx * 1.05);
    const hi = f ? f.name.y - 2 : 0;
    const belowCost = f ? f.cost.y + f.cost.height + 2 : 0;
    const lo = f && hi - belowCost >= minH ? belowCost : -uh / 2 + 2;
    const h = f && card.zone !== 'ice' ? Math.max(minH, Math.min(th + 4, Math.floor(hi - lo))) : th + 4;
    const coin = Math.max(4, Math.round(Math.min(h, th) * 0.26));
    const w = Math.round(3 + coin * 2 + 2 + card.hostedText.width + 5);
    const key = `${text}:${h}`;
    if (card.hostedKey !== key) {
      card.hostedKey = key;
      const g = card.hostedBg;
      g.clear();
      g.roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: theme.ink, alpha: 0.92 }).stroke({ width: 2, color: theme.credit });
      const ix = -w / 2 + 3 + coin;
      const pts: number[] = [];
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        pts.push(ix + Math.cos(a) * coin, Math.sin(a) * coin);
      }
      g.poly(pts).fill({ color: theme.credit, alpha: 0.3 }).stroke({ width: 1.5, color: theme.credit });
      g.circle(ix, 0, coin * 0.38).fill({ color: theme.credit });
      card.hostedText.position.set(-w / 2 + 3 + coin * 2 + 2 + card.hostedText.width / 2, 0);
    }
    if (!f) {
      card.hosted.position.set(0, 0);
      return;
    }
    const cx = f.art.x + f.art.width / 2;
    let cy = f.art.y + f.art.height / 2;
    if (card.zone !== 'ice') cy = hi - lo >= h ? Math.min(Math.max(cy, lo + h / 2), hi - h / 2) : (lo + hi) / 2;
    card.hosted.position.set(cx, cy);
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
    return !!view?.lastRun && !view.run && !view.choice && !view.result && view.pendingDiscard === 0 && this.picking === null && this.pickedInstalled === null;
  }

  /** The hand card whose places are lit: picked with a tap, or lifted out of the hand view (S-07-6). */
  private get picking(): number | null {
    return this.selected ?? this.lift?.index ?? null;
  }

  /** Where the help text goes: below the Play button (sideways) or left of it (column). */
  private helpBox(layout: BoardLayout): Box {
    const { sub, action } = layout;
    if (layout.mode === 'landscape') {
      // Below Play (or below Score too, while a picked agenda shows two choices).
      // QA-S10-2: only when the second slot is really in use (an agenda that shows Advance alone
      // leaves it empty, and on a short screen the words need that room).
      const above = this.secondSlotUsed(layout) || this.lastRunShown(this.view) ? layout.action2 : action;
      const y = above.y + above.height + 4;
      return { x: sub.x, y, width: sub.width, height: Math.max(0, sub.y + sub.height - y) };
    }
    // Column: left of Play (and of the second choice, while a picked agenda shows two).
    const right = this.secondSlotUsed(layout) || this.lastRunShown(this.view) ? layout.action2.x : action.x;
    return { x: sub.x, y: sub.y, width: Math.max(0, right - 6 - sub.x), height: sub.height };
  }

  /** A picked thing's button sits in the second choice slot (Score beside Advance, a second ability). */
  private secondSlotUsed(layout: BoardLayout): boolean {
    if (this.pickedInstalled === null) return false;
    const b = layout.action2;
    return this.activeTargets.some((t) => t.marker.root.visible && Math.abs(t.marker.box.x - b.x) < 0.5 && Math.abs(t.marker.box.y - b.y) < 0.5);
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
      const note = s === 'corp' ? (view.badPublicity > 0 ? badPublicityText(view.badPublicity) : null) : runnerNote(view);
      w.tag.set(layout[w.pos].tag, note, layout.mode === 'landscape' && w.pos === 'bottom' ? 'center' : 'right');
      const mine = s === viewer;
      gen.decks[s].setActionable(mine && view.legalActions.some((a) => a.type === 'draw'));
      w.credits.setActionable(mine && view.legalActions.some((a) => a.type === 'gain_credit'));
    }
    gen.hq.setCount(view.players.corp.handCount);
    gen.memory.set(view.memory.used, view.memory.limit);
    this.applyStats(gen, layout, view);
    for (const s of SIDES) {
      const pile = gen.scoredPiles[s];
      pile.set(view.players[s].scored, view.players[s].points);
      // An empty pile is a faint outline that takes no taps.
      pile.root.eventMode = view.players[s].scored.length > 0 ? 'static' : 'none';
    }

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
    help.visible = !view.result && !(panelUp(view) && layout.mode === 'landscape');
    let helpText: string;
    const choiceCard = view.choice ? (getCard(view.choice.cardId)?.name ?? 'Agenda') : '';
    if (isTraceChoice(view.choice)) {
      // Sprint 9: the bid panel says the numbers; the column says what to do.
      const mine = view.choice.options.length > 0 || isTraceChoice(this.decision?.choice);
      helpText = mine ? `Set your bid with − and +, then tap Bid.` : bidWaitText(view.choice.waitingOn);
    } else if (isRunChoice(view.choice)) {
      // S-08-7: the run panel says what to pick; the column shows the same words here.
      helpText = view.choice.options.length > 0 || this.decision?.choice ? 'Tap a lit button to decide.' : `${SIDE_NAME[view.choice.waitingOn]} is choosing…`;
    } else if (view.choice?.kind === 'look_install') {
      // Sprint 12 (S-12-1): Accelerated Beta Test's look at the top of R&D.
      helpText = lookHelpText(view.choice, view.choice.options.length > 0, this.lookPick !== null);
    } else if (view.choice?.kind === 'archives_pick') {
      // Sprint 12 (S-12-2): Archived Memories' pick from Archives.
      helpText = archivesHelpText(view.choice, view.choice.options.length > 0);
    } else if (view.choice && view.choice.options.length > 0) {
      helpText = `${choiceCard}: rez one ${TERMS.ice} for free.\nTap a lit ${TERMS.ice}, or ${TERMS.skip}.`;
    } else if (view.choice) {
      helpText = `${SIDE_NAME[view.choice.waitingOn]} is choosing (${choiceCard})…`;
    } else if (view.run) {
      helpText = 'Tap a button to decide.\nHold a card to read it.';
    } else if (view.activePlayer !== viewer && pending === 0) {
      // Online: the other phone's turn. Their moves show up here.
      helpText = `${SIDE_NAME[view.activePlayer]}'s turn.\nTheir moves show up here.`;
    } else if (this.runPicking) {
      helpText = `Tap a lit server to run on it.\nTap ${TERMS.run} again to cancel.`;
    } else if (this.exposePicking && this.selected !== null) {
      helpText = EXPOSE_HELP;
    } else if (this.pickedInstalled !== null) {
      // Sprint 9: the tag marker / score pill picked: "Tap it again".
      helpText = this.pickedInstalled === TAGS_PICK || isScoredUid(this.pickedInstalled) ? 'Tap a lit button.\nTap it again to cancel.' : 'Tap a lit button.\nTap the card again to cancel.';
      // S-10-1: an unscored agenda with a scored ability (Private Security Force) says, dimmed
      // beside its Advance / Score, that the ability needs it scored first (words from card data).
      const first = this.scoreFirstText(view, this.pickedInstalled);
      if (first) {
        // QA-S10-2: a short rail keeps just these words, at a readable size.
        const room = this.helpBox(layout).height;
        const line = Number(help.style.lineHeight) || 14;
        helpText = room < 3 * line + 4 ? first : `${first}\n${helpText}`;
      }
    } else if (pending > 0) {
      const k = pending - this.marked.size;
      main.text = k > 0 ? `Discard ${k}` : 'Tap Confirm';
      fitText(main, layout.action.width - 4, layout.action.height - 2);
      // The hand limit comes from the view (hand - pending), not a client constant.
      const keep = view.players[viewer].handCount - pending;
      helpText = `You can keep ${keep} cards. Tap cards to pick them.\nHold a card to read it.`;
    } else if (this.lift) {
      helpText = 'Let go on a lit spot to play it.\nLet go anywhere else to put it back.';
    } else if (this.selected !== null && this.activeTargets.some((t) => t.kind === 'grip')) {
      // Sprint 12 (S-12-3): Modded.
      helpText = `Tap a lit card in your ${TERMS.grip} to install it.\nTap the card again to cancel.`;
    } else if (this.selected !== null) {
      helpText = 'Tap a lit spot to play it.\nTap the card again to cancel.';
    } else if (view.activePlayer === viewer && view.phase === 'action' && view.players[viewer].clicks === 0) {
      helpText = "No clicks left. Tap End turn when you're ready.";
    } else if (viewer === 'runner' && view.runOptions.length > 0 && view.activePlayer === viewer) {
      const use = this.usableOnTable(view) ? ' Tap a card on the table to use it.' : '';
      helpText = `Tap your ${TERMS.stack} to draw, your credits for +1, ${TERMS.run} to attack a server, or your hand to play a card.${use}`;
    } else {
      const deck = viewer === 'corp' ? TERMS.rd : `your ${TERMS.stack}`;
      // Any card on the table with a move the engine would take now (advance, rez, an ability).
      const use = this.usableOnTable(view) ? ' Tap a card on the table to use it.' : '';
      helpText = `Tap ${deck} to draw, your credits for +1, or your hand to play a card.${use}\nIn the hand, hold a card and drag it to play it.`;
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
    } else if (this.runNoticeSlot(layout, view)) {
      // QA-S8-3: sideways, during a run End turn can't be used; its slot shows the run's notes
      // (so they never cover the run panel in the rail).
      button.root.visible = false;
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
    this.hands[viewer].container.visible = !panelUp(view) && !lookOpen(view);

    // Run button: where Play goes, while the view offers runs and nothing is picked.
    const rb = gen.runButton;
    const showRun = !view.run && !view.choice && !view.result && pending === 0 && view.runOptions.length > 0 && this.picking === null && this.pickedInstalled === null;
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
    // Sprint 9: a picked tag marker or score pill is outlined the same way.
    const pickedBox =
      picked?.box ?? (this.pickedInstalled === TAGS_PICK ? gen.tagged.box : this.pickedInstalled && isScoredUid(this.pickedInstalled) ? gen.scoredPiles[viewer].box() : undefined);
    if (pickedBox) glowRoundRect(pm, pickedBox.x - 3, pickedBox.y - 3, pickedBox.width + 6, pickedBox.height + 6, 5, theme.credit, 3, 1.4);
    // QA-S8-3: a toast shown before a run started (or ended) moves to the slot for now.
    // S-10-6: checked once every button is in place, so a toast never covers one.
    if (this.hint && this.hint.slot !== JSON.stringify(this.hintSlot(layout, this.hint.wide))) this.showHint(this.hint.text, this.hint.kind, this.hint.wide);
    this.syncSheet(view, layout);
    this.placeExposed();
    return newStep;
  }

  /** S-10-5: Archives shows the view's pile again (a trashed card has landed on it). */
  private syncArchives(): void {
    const v = this.view;
    if (v) this.gen?.discards.corp.set(v.players.corp.discardCount, v.players.corp.discard);
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

  /** S-07-1: a removed server's column folds away where it was (non-blocking, skippable). */
  private serverClose(c: Box | undefined): void {
    if (!c) return;
    this.callbacks.log({ kind: 'server_close', scheduledMs: timing.serverClose, box: { ...c } });
    const g = new Graphics();
    g.roundRect(-c.width / 2, -c.height / 2, c.width, c.height, 6).fill({ color: theme.corp, alpha: 0.08 }).stroke({ width: 1.5, color: theme.corp, alpha: 0.6 });
    g.position.set(c.x + c.width / 2, c.y + c.height / 2);
    this.fxLayer.addChild(g);
    this.fx.add({
      target: g.scale,
      to: { x: 0.05 },
      duration: timing.serverClose,
      ease: ease.inOutCubic,
      owner: g,
      onUpdate: (t) => {
        g.alpha = 1 - t;
      },
      onComplete: () => g.destroy(),
    });
  }

  // ---- runs, advancing, scoring ---------------------------------------------

  /** Boxes of things the events will move away (scored / trashed installed cards, accessed cards). */
  private boxesBefore(events: readonly GameEvent[]): Map<string, Box> {
    const out = new Map<string, Box>();
    const gen = this.gen;
    if (!gen) return out;
    for (const e of events) {
      if (e.type === 'server_removed') {
        const b = this.layout?.corp.servers.find((x) => x.id === e.server)?.column;
        if (b) out.set(`col:${e.server}`, { ...b });
      }
      if (e.type === 'rig_card_trashed' || e.type === 'corp_card_trashed') {
        const b = gen.installed.get(e.uid)?.box;
        if (b) out.set(`uid:${e.uid}`, { ...b });
      }
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
      case 'card_rezzed': {
        // S-07-2: an asset / upgrade flips face up (the same flip as ICE).
        const c = gen.installed.get(e.uid);
        if (!c) return;
        this.callbacks.log({ kind: 'card_rez', scheduledMs: timing.rezFlip, box: { ...c.box } });
        this.fx.cancel(c.visual.scale);
        c.visual.scale.x = 0.05;
        this.fx.add({ target: c.visual.scale, to: { x: 1 }, duration: timing.rezFlip, ease: ease.outBack, owner: c.visual });
        return;
      }
      case 'hosted_credits_changed': {
        const c = gen.installed.get(e.uid);
        if (!c || !c.hosted.visible) return;
        this.callbacks.log({ kind: 'hosted_pop', scheduledMs: timing.advancePop, box: { ...c.box } });
        this.fx.cancel(c.hosted.scale);
        c.hosted.scale.set(1.6);
        this.fx.add({ target: c.hosted.scale, to: { x: 1, y: 1 }, duration: timing.advancePop, ease: ease.outBack, owner: c.hosted });
        return;
      }
      case 'rig_card_trashed': {
        // S-07-3/4: an emptied Armitage / Bank Job goes to the Heap. Sprint 9: or the Corp trashed it (Runner tagged).
        if (e.cause === 'tagged') notices.push(taggedTrashText(e.cardId));
        const from = before.get(`uid:${e.uid}`);
        const pile = gen.discards.runner;
        this.callbacks.log({ kind: 'rig_trash_flight', scheduledMs: timing.runFlight, box: pile.box() });
        if (from) this.flyCard(e.cardId, 'runner', from, pile.box(), 0, () => pile.pop(this.ui));
        else pile.pop(this.ui);
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
      case 'trash_prevented': {
        notices.push(`${nameOf(e.byCardId, 'A card')} saved ${nameOf(e.cardId, 'a card')}`);
        return;
      }
      case 'corp_card_trashed': {
        // S-08-2: an emptied Adonis Campaign goes to Archives face up.
        const from = before.get(`uid:${e.uid}`);
        const pile = gen.discards.corp;
        this.callbacks.log({ kind: 'corp_trash_flight', scheduledMs: timing.runFlight, box: pile.box() });
        const land = () => {
          this.syncArchives();
          pile.pop(this.ui);
        };
        if (from) this.flyCard(e.cardId, 'corp', from, pile.box(), 0, land);
        else land();
        return;
      }
      case 'clicks_gained': {
        // S-08-2 Biotic Labor: the clicks counter glows and "+2" floats up.
        notices.push(`${SIDE_NAME[e.player]} gains ${plural(e.amount, 'click', 'clicks')}`);
        const w = this.seatOf(e.player)?.clicks;
        this.callbacks.log({ kind: 'clicks_gained', scheduledMs: timing.tagPop, ...(w ? { box: w.box() } : {}) });
        if (w) {
          this.flash(w.box(), sideColor(e.player), timing.tagPop);
          this.floatText(`+${e.amount}`, w.box(), sideColor(e.player), timing.tagPop);
        }
        return;
      }
      case 'tags_changed': {
        // Sprint 9 (S-09-2): the red "Tagged N" note pops, "+1 tag" / "-1 tag" floats from it.
        // Sprint 10: it lives in the stats column (its slot is kept while untagged).
        const tag = this.gen?.tagged;
        const b = tag?.text ? tag.box : this.layout?.rig.tagged;
        const text = `${e.amount > 0 ? '+' : '−'}${plural(Math.abs(e.amount), TERMS.tag.toLowerCase(), `${TERMS.tag.toLowerCase()}s`)}`;
        this.callbacks.log({ kind: 'tags_changed', text, scheduledMs: timing.tagPop, ...(b ? { box: { ...b } } : {}) });
        if (tag?.text) tag.pop(this.fx, timing.tagPop);
        if (b) {
          this.flash(b, theme.tagged, timing.tagPop);
          this.floatText(text, b, theme.tagged, timing.tagPop);
        }
        // A trace's result already says "Runner tagged".
        if (!batch.some((x) => x.type === 'trace_resolved')) notices.push(tagsChangedText(e));
        return;
      }
      case 'brain_damage':
      case 'meat_damage':
      case 'net_damage': {
        // S-08-3: brain damage flies the same way as net damage and lowers the hand max.
        // Sprint 9 (S-09-3): meat damage too, naming the cards.
        notices.push(
          e.type === 'net_damage'
            ? `${e.amount} ${TERMS.netDamage.toLowerCase()}`
            : e.type === 'meat_damage'
              ? meatDamageText(e)
              : `${e.amount} ${TERMS.brainDamage.toLowerCase()} · ${handMaxText(e.maxHandSize)}`,
        );
        if (e.type === 'brain_damage') {
          const tag = this.seatOf('runner')?.tag;
          if (tag?.text) tag.pop(this.fx, timing.tagPop);
        }
        const pos: Pos = view.viewer === 'runner' ? 'bottom' : 'top';
        const from = pos === 'bottom' ? layout.handArea : layout.top.label;
        const heap = gen.discards.runner.box();
        this.callbacks.log({ kind: e.type, scheduledMs: timing.runFlight + 20 * Math.max(0, e.cardIds.length - 1), box: { ...heap } });
        const w = Math.min(layout.card.width, from.height / CARD_RATIO);
        e.cardIds.forEach((id, i) => {
          const start = { x: from.x + from.width / 2 - w / 2 + (i - (e.cardIds.length - 1) / 2) * w * 0.6, y: from.y + from.height / 2 - (w * CARD_RATIO) / 2, width: w, height: w * CARD_RATIO };
          this.flyCard(id, 'runner', start, heap, i * 20, () => gen.discards.runner.pop(this.ui));
        });
        return;
      }
      case 'agenda_stolen': {
        const from = before.get(`access:${e.cardId}`) ?? layout.access;
        // S-10-1: it lands on the Runner's scored pile; the score label pops too.
        const pill = gen.scores.runner;
        const pile = gen.scoredPiles.runner;
        this.callbacks.log({ kind: 'score_flight', scheduledMs: timing.runFlight, box: pile.box() });
        this.flyCard(e.cardId, 'corp', from, pile.box(), 0, () => {
          pile.pop(this.ui);
          pill.pop(this.ui);
        });
        return;
      }
      case 'agenda_scored': {
        const from = before.get(`uid:${e.uid}`);
        const pill = gen.scores.corp;
        const pile = gen.scoredPiles.corp;
        this.callbacks.log({ kind: 'score_flight', scheduledMs: timing.runFlight, box: pile.box() });
        const land = () => {
          pile.pop(this.ui);
          pill.pop(this.ui);
        };
        if (from) this.flyCard(e.cardId, 'corp', from, pile.box(), 0, land);
        else land();
        return;
      }
      case 'card_trashed': {
        const from = before.get(`access:${e.cardId}`) ?? (e.uid ? before.get(`uid:${e.uid}`) : undefined);
        const pile = gen.discards.corp;
        this.callbacks.log({ kind: 'trash_flight', scheduledMs: timing.runFlight, box: pile.box() });
        const land = () => {
          this.syncArchives();
          pile.pop(this.ui);
        };
        if (from) this.flyCard(e.cardId, 'corp', from, pile.box(), 0, land);
        else this.syncArchives();
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
        const opts = (this.decision?.choice ?? view.choice)?.options ?? [];
        const boxes = opts.flatMap((o) => (o.action.type === 'rez' || o.action.type === 'choose' ? [gen.installed.get(o.action.uid)?.box] : [])).filter((b): b is Box => !!b);
        this.callbacks.log({ kind: 'choice_open', text: e.cardId, scheduledMs: timing.choiceFlash });
        for (const b of boxes) this.flash(b, theme.credit, timing.choiceFlash);
        return;
      }
      case 'cards_looked_at':
      case 'rd_cards_trashed':
      case 'card_returned_to_hand': {
        const text = s12Notice(e, view.viewer);
        if (text) notices.push(text);
        return;
      }
      case 'card_exposed': {
        // S-12-4: both seats see the card over its place until it's tapped away.
        const text = s12Notice(e, view.viewer);
        if (text) notices.push(text);
        this.showExposed(e.uid, e.cardId);
        return;
      }
      case 'choice_closed': {
        // In-run choices (S-08-7) say what happened through the trash events and the ICE report.
        if (e.kind !== 'free_rez') return;
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

  /**
   * A tap on the hand strip. The discard picker marks the card (Sprint 1); a
   * tap on the picked card drops the pick; otherwise the hand view opens on
   * the card (S-07-6).
   */
  private onStripTap(index: number): void {
    const view = this.view;
    if (!view) return;
    if (this.flipPending) {
      this.fx.finishAll();
      return;
    }
    if (view.pendingDiscard > 0) {
      // S-10-5: the discard step opens the hand big, like everywhere else; a tap there marks.
      this.openHandView(index, undefined, true);
      return;
    }
    if (this.selected === index) {
      this.cancelSelection();
      return;
    }
    this.openHandView(index);
  }

  /** A hold on the hand strip: the hand view opens on it (S-10-5: in the discard step too, in its discard mode). */
  private onStripHold(_side: Side, _cardId: string, from: Box, index: number): void {
    if (this.flipPending) return;
    this.openHandView(index, from, (this.view?.pendingDiscard ?? 0) > 0);
  }

  /**
   * S-10-5: the discard step's view: a tap on the big card marks it to throw away (or unmarks
   * it). No more than the engine's count can be marked.
   */
  private toggleDiscardMark(index: number): void {
    const view = this.view;
    if (!view) return;
    const pending = view.pendingDiscard;
    if (this.marked.has(index)) this.marked.delete(index);
    else if (this.marked.size < pending) this.marked.add(index);
    else {
      this.showHint('Enough picked. Tap one to undo.');
      return;
    }
    this.hands[view.viewer].setMarked(this.marked);
    this.applyView(view, true);
    this.syncDiscardView();
    const stamp = this.zoom?.stamp;
    if (stamp?.visible) {
      this.ui.cancel(stamp.scale);
      stamp.scale.set(1.25);
      this.ui.add({ target: stamp.scale, to: { x: 1, y: 1 }, duration: 160, ease: ease.outBack, owner: stamp });
    }
    this.callbacks.log({ kind: 'discard_mark', text: String(index), scheduledMs: 160 });
    this.callbacks.changed();
  }

  /** S-10-5: where the discard view's Confirm sits: End turn's place in the rail, bottom right in the column. */
  private discardConfirmBox(layout: BoardLayout): Box {
    if (layout.mode === 'landscape') return { ...layout.endTurn };
    const w = layout.endTurn.width;
    const h = layout.endTurn.height;
    const pad = layout.pad;
    return { x: layout.safe.x + layout.safe.width - pad - w, y: layout.safe.y + layout.safe.height - pad - h, width: w, height: h };
  }

  /** S-10-5: the stamp over the big card (marked or not) and the view's Confirm ("Discard 2", lit only at the engine's count). */
  private syncDiscardView(): void {
    const zoom = this.zoom;
    const view = this.view;
    const layout = this.layout;
    if (!zoom || zoom.mode !== 'discard' || !view || !layout) return;
    if (zoom.stamp) zoom.stamp.visible = this.marked.has(zoom.index);
    const pending = view.pendingDiscard;
    zoom.confirm?.set(this.discardConfirmBox(layout), `Discard ${pending}`, this.marked.size === pending && pending > 0, theme.warn, this.marked.size === pending && pending > 0);
  }

  /** S-10-5: a red "DISCARD" stamp, turned a little, across the middle of a w x h card. */
  private discardStamp(w: number, h: number): Container {
    const c = new Container();
    c.label = 'discard-stamp';
    const t = new Text({ text: 'DISCARD', style: { fontFamily: theme.monoFamily, fontSize: Math.round(w * 0.16), fontWeight: '800', fill: theme.tagged, letterSpacing: 2 } });
    t.anchor.set(0.5);
    const bw = t.width + w * 0.08;
    const bh = t.height + h * 0.03;
    const g = new Graphics();
    g.roundRect(-bw / 2, -bh / 2, bw, bh, 6).fill({ color: 0x000000, alpha: 0.7 }).stroke({ width: Math.max(3, w * 0.015), color: theme.tagged });
    c.addChild(g, t);
    c.rotation = -0.2;
    c.visible = false;
    return c;
  }

  /**
   * Why hand card `index` can't be picked or lifted now (a hint, shown), or
   * null if it can: its places light up (some may be dimmed with their reason).
   */
  private refusePick(index: number): string | null {
    const view = this.view;
    if (!view) return '';
    if (view.choice) {
      // Only the choice can be answered now (S-04-4).
      return view.choice.options.length > 0 ? choiceHint(view.choice) : `${SIDE_NAME[view.choice.waitingOn]} is choosing`;
    }
    const options = view.handOptions[index] ?? [];
    const first = options[0]?.reject ?? null;
    if (options.length === 0) return "That card can't be played yet";
    if (first !== null && GATE_REASONS.has(first) && options.every((o) => o.reject === first)) {
      if (first === 'no_clicks') this.seatAt('bottom')?.clicks.shake();
      return hintFor(first, view);
    }
    return null;
  }

  /** Picks hand card `index` to play: outlined in the strip, its places lit (tap one to play it). */
  private pickCard(index: number): void {
    const view = this.view;
    if (!view) return;
    const hand = this.hands[view.viewer];
    if (this.selected === index) {
      this.cancelSelection();
      return;
    }
    const refused = this.refusePick(index);
    if (refused !== null) {
      this.cancelSelection();
      if (refused) this.showHint(refused);
      return;
    }
    this.runPicking = false;
    this.pickedInstalled = null;
    this.exposePicking = false;
    this.selected = index;
    hand.setSelected(index);
    this.showTargets();
    this.applyView(view, false);
    this.callbacks.changed();
  }

  /** Drops whatever is picked: a hand card, the Run choice, an installed card. */
  private cancelSelection(): void {
    if (this.selected === null && !this.runPicking && this.pickedInstalled === null) return;
    this.exposePicking = false;
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
    if (!gen || !layout || !view || view.result) {
      // QA-S9-2: once the game is over no buttons stay up behind the game-over box.
      if (view?.result) {
        this.selected = null;
        this.pickedInstalled = null;
        this.runPicking = false;
      }
      this.setNewServerLabel(false);
      return;
    }
    // The price pill sits on the Runner's side of a Corp column (where the next ICE goes).
    const columnSide: 'top' | 'bottom' = layout.corp.outward === 'down' ? 'bottom' : 'top';
    if (isTraceChoice(view.choice)) {
      // Sprint 9: the bid panel is the only thing to answer.
      this.setNewServerLabel(false);
      return;
    }
    if (view.choice?.kind === 'look_install') {
      // Sprint 12 (S-12-1): the picked looked-at ICE's servers (from its `select` options), and Done.
      for (const option of view.choice.options) {
        const a = option.action;
        if (a.type === 'pass') this.addTarget(gen, layout, 'look_done', option, layout.action, lookDoneLabel(view.choice), 'center', {});
        else if (a.type === 'select' && a.card === this.lookPick && a.server !== undefined) {
          const slots = a.server === 'new' ? layout.corp.newServer : layout.corp.servers.find((x) => x.id === a.server);
          if (slots) this.addTarget(gen, layout, 'look_install', option, slots.column, `${TERMS.install} · free`, columnSide, { server: a.server });
        }
      }
      this.setNewServerLabel(this.activeTargets.some((t) => t.kind === 'look_install' && t.server === 'new'));
      return;
    }
    if (view.choice?.kind === 'archives_pick') {
      // Sprint 12 (S-12-2): the Archives sheet is the only thing to answer.
      this.setNewServerLabel(false);
      return;
    }
    if (view.choice && !isRunChoice(view.choice)) {
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
      // S-07-2/3/5: a picked card on the table shows its buttons where Play goes (two at most):
      // Rez / Advance / Score / a card's own ability. Dimmed ones say why under their label.
      // Sprint 9: also the tag marker's Remove 1 tag, the Corp's Trash on a Runner resource, and a
      // scored agenda's ability (Private Security Force) from the score pill.
      const uid = this.pickedInstalled;
      let firstFree = true;
      for (const option of this.pickedOptions(view, uid)) {
        const a = option.action;
        const kind: TargetSnapshot['kind'] | null =
          a.type === 'advance' || a.type === 'score' || a.type === 'rez' || a.type === 'activate' || a.type === 'remove_tag' || a.type === 'trash_resource' ? a.type : null;
        if (!kind) continue;
        const label = basicOptionLabel(option) ?? (isScoredUid(uid) ? this.scoredOptionLabel(option, uid) : installedOptionLabel(option, this.installedCardId(uid)));
        const note = option.reject !== null ? this.rejectHint(option) : '';
        // Score keeps its own slot (beside Advance); everything else takes the first free one.
        const slot = kind === 'score' || !firstFree ? layout.action2 : layout.action;
        if (kind !== 'score') firstFree = false;
        this.addTarget(gen, layout, kind, option, slot, label, 'center', { uid }, note);
      }
      this.setNewServerLabel(false);
      return;
    }
    const picking = this.picking;
    if (picking === null) {
      this.setNewServerLabel(false);
      return;
    }
    const pickedId = view.players[view.viewer].hand?.[picking] ?? null;
    let exposeShown = false;
    for (const option of view.handOptions[picking] ?? []) {
      const a = option.action;
      let kind: TargetSnapshot['kind'];
      let server: string | undefined;
      let b: Box;
      let at: 'top' | 'bottom' | 'center' = 'center';
      if (a.type === 'play' && a.installIndex !== undefined) {
        // Sprint 12 (S-12-3, Modded): each program / hardware in the Grip lights with its install price.
        const card = this.hands[view.viewer].boxes()[a.installIndex]?.box;
        if (!card) continue;
        // A thumb-size target even where hand cards are narrower (891x296: 40 px): widened about its middle.
        const gw = Math.max(card.width, MIN_TOUCH);
        const gh = Math.max(card.height, MIN_TOUCH);
        const box = { x: card.x - (gw - card.width) / 2, y: card.y - (gh - card.height), width: gw, height: gh };
        const off = option.discount ? ` (−${option.discount})` : '';
        const note = option.reject ? this.rejectHint(option) : '';
        // Just the price on the card (the help column says "install"), so the card's name stays readable.
        // QA-S12-1: the pill stays above the name (over the cost and art), shrinking to fit on short phones.
        const gripId = view.players[view.viewer].hand?.[a.installIndex];
        const gripDef = gripId ? getCard(gripId) : undefined;
        const nameTop = gripDef ? card.y + card.height / 2 + smallFaceLayout(gripDef, card.width, card.height).name.y : card.y + card.height / 2;
        const parts = option.discount ? [priceText(option.cost), `(−${option.discount})`] : [priceText(option.cost)];
        const fit = { maxBottom: nameTop - box.y - 1, lines: parts };
        this.addTarget(gen, layout, 'grip', option, box, `${priceText(option.cost)}${off}`, 'top', { index: a.installIndex }, note, fit);
        continue;
      }
      if (a.type === 'play' && a.mode !== undefined) {
        // Sprint 12 (S-12-4, Infiltration): one button per mode (card data); Expose then lights
        // the face-down Corp cards (one option each).
        const label = modeLabel(pickedId, a.mode) ?? TERMS.play;
        const price = option.cost > 0 ? ` · ${priceText(option.cost)}` : '';
        if (a.uid === undefined) {
          this.addTarget(gen, layout, 'play', option, layout.action, `${label}${price}`, 'center', {}, option.reject ? this.rejectHint(option) : '');
          continue;
        }
        if (!exposeShown) {
          exposeShown = true;
          this.addTarget(gen, layout, 'expose_open', option, layout.action2, `${label}${price}`, 'center', {}, option.reject ? this.rejectHint(option) : '');
        }
        if (this.exposePicking) {
          const c = gen.installed.get(a.uid);
          if (c) this.addTarget(gen, layout, 'expose', option, c.box, label.split(' ')[0] ?? label, 'center', { uid: a.uid });
        }
        continue;
      }
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
      // S-08-1: Kate's discount is already in the engine's price; say it was lowered ("1 credit (−1)").
      const off = option.discount ? ` (−${option.discount})` : '';
      // Sprint 9: a card whose play condition does not hold says why under its price (SEA Source).
      const note = option.reject === 'condition_not_met' ? (conditionText(option, view) ?? '') : '';
      this.addTarget(gen, layout, kind, option, b, `${verb} · ${priceText(option.cost)}${off}`, at, server !== undefined ? { server } : {}, note);
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
    where: { server?: string; uid?: string; index?: number },
    note = '',
    fit?: { maxBottom: number; lines: string[] },
  ): void {
    // Markers are kept per place: advance / score always use the same two slots.
    const key = targetKey(kind, where);
    let marker = gen.targets.get(key);
    if (!marker) {
      const m = new TargetMarker(layout.scale);
      m.root.label = `target:${key}`;
      gen.detachers.push(attachPress(m.root, { onTap: () => this.onTargetTap(key) }));
      (kind === 'grip' ? this.gripLayer : this.targetLayer).addChild(m.root);
      gen.targets.set(key, m);
      marker = m;
    }
    marker.set(b, label, option.reject === null, at, note, fit);
    marker.root.visible = true;
    this.activeTargets.push({ kind, ...where, option, marker });
  }

  // ---- Sprint 12 sheets (look at R&D, Archives pick) and the exposed card ----

  /** The look-at / Archives sheet for `view` (drawn again only when what it shows changes). */
  private syncSheet(view: PlayerView, layout: BoardLayout): void {
    const c = view.choice;
    let want: { kind: 'look' | 'archives'; cards: SheetCard[]; title: string; area: Box; backdrop: boolean; side: Side; maxWidth: number } | null = null;
    if (c && lookOpen(view)) {
      const lit = lookInstallable(c);
      const cards = (c.looked ?? []).map((cardId, i) => ({ cardId, lit: lit.has(i), picked: this.lookPick === i, index: i }));
      want = { kind: 'look', cards, title: '', area: layout.handArea, backdrop: false, side: 'corp', maxWidth: layout.card.width };
    } else if (c && c.kind === 'archives_pick' && c.options.length > 0 && !view.result) {
      const offered = new Set<number>();
      for (const o of c.options) if (o.action.type === 'select') offered.add(o.action.card);
      const cards = view.players.corp.discard.map((cardId, i) => ({ cardId, lit: offered.has(i), picked: false, index: i }));
      want = { kind: 'archives', cards, title: archivesTitle(c), area: layout.access, backdrop: true, side: 'corp', maxWidth: Math.round(layout.card.width * 1.15) };
    }
    if (!want) {
      this.closeSheet();
      return;
    }
    if (this.sheet?.kind !== want.kind) this.sheetPage = 0;
    const key = JSON.stringify([layout.sizeKey, want.kind, want.cards, want.title, this.sheetPage]);
    if (this.sheet?.key === key) return;
    this.closeSheet(false);
    const kind = want.kind;
    const ui = new CardSheet({
      area: want.area,
      title: want.title,
      cards: want.cards,
      side: want.side,
      scale: layout.scale,
      ratio: CARD_RATIO,
      maxWidth: want.maxWidth,
      backdrop: want.backdrop,
      page: this.sheetPage,
      onTap: (i) => this.onSheetTap(kind, i),
      hold: (target, cardId, box, onTap) => {
        const d = attachPress(target, {
          onTap,
          onLongPress: () => {
            if (cardId) this.openZoom(cardId, 'corp', box);
          },
          onLongPressEnd: () => this.closeZoom(),
        });
        target.cursor = 'pointer';
        return d;
      },
      onPage: (page) => {
        this.sheetPage = page;
        if (this.view && this.layout) this.syncSheet(this.view, this.layout);
        this.callbacks.changed();
      },
    });
    this.sheetLayer.addChildAt(ui.root, 0);
    this.sheet = { kind, ui, key };
  }

  private closeSheet(resetPage = true): void {
    if (this.sheet) this.sheet.ui.destroy();
    this.sheet = null;
    if (resetPage) this.sheetPage = 0;
  }

  /** A tap on a sheet card: the look-at sheet picks an ICE (its servers light); the Archives sheet takes the card. */
  private onSheetTap(kind: 'look' | 'archives', index: number): void {
    const view = this.view;
    const c = view?.choice;
    if (!view || !c || this.flipPending) return;
    if (kind === 'look') {
      if (c.kind !== 'look_install') return;
      if (!lookInstallable(c).has(index)) {
        this.showHint(lookNotIceText(c.looked?.[index] ?? null));
        return;
      }
      this.lookPick = this.lookPick === index ? null : index;
      this.showTargets();
      this.applyView(view, false);
      this.callbacks.changed();
      return;
    }
    if (c.kind !== 'archives_pick') return;
    const option = c.options.find((o) => o.action.type === 'select' && o.action.card === index);
    if (!option) {
      // The Archived Memories being played (the engine offers every other card).
      this.showHint(`${getCard(view.players.corp.discard[index] ?? '')?.name ?? 'That card'} is the card being played`);
      return;
    }
    this.tappedOption = option;
    this.callbacks.onAction(option.action);
  }

  /** S-12-4: the exposed card's face over its place (bigger, captioned); a tap hides it. */
  private showExposed(uid: string, cardId: string): void {
    this.clearExposed();
    const def = getCard(cardId);
    if (!def) return;
    const root = new Container();
    root.label = 'exposed';
    this.sheetLayer.addChild(root);
    const ex = { uid, cardId, root, box: { x: 0, y: 0, width: 0, height: 0 }, detach: () => {} };
    ex.detach = attachPress(root, { onTap: () => this.hideExposed() });
    this.exposed = ex;
    this.placeExposed();
  }

  /** Draws the exposed card at its installed card (sizes follow the layout). */
  private placeExposed(): void {
    const ex = this.exposed;
    const layout = this.layout;
    const c = ex ? this.gen?.installed.get(ex.uid) : undefined;
    if (!ex || !layout) return;
    if (!c) {
      this.clearExposed();
      return;
    }
    const def = getCard(ex.cardId)!;
    const w = Math.max(Math.round(layout.card.width * 1.25), MIN_EXPOSED_W);
    const h = Math.round(w * CARD_RATIO);
    const capH = Math.max(18, Math.round(20 * Math.min(layout.scale, 1.2)));
    const board = layout.board;
    const cx = Math.min(Math.max(c.box.x + c.box.width / 2, board.x + w / 2 + 2), board.x + board.width - w / 2 - 2);
    const cy = Math.min(Math.max(c.box.y + c.box.height / 2, board.y + h / 2 + 2), board.y + board.height - h / 2 - capH - 2);
    const box = { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), width: w, height: h + capH };
    const key = `${box.x},${box.y},${w}`;
    if (ex.root.label !== `exposed:${key}`) {
      for (const k of ex.root.removeChildren()) k.destroy({ children: true });
      ex.root.label = `exposed:${key}`;
      const g = new Graphics();
      g.roundRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + capH + 8, 8).fill({ color: 0x05040a, alpha: 0.95 });
      glowRoundRect(g, -w / 2 - 4, -h / 2 - 4, w + 8, h + capH + 8, 8, theme.runner, 2, 1.3);
      const face = createCardFace(def, w, h, 'small');
      const cap = new Text({ text: EXPOSED_CAPTION, style: { fontFamily: theme.fontFamily, fontSize: Math.max(11, Math.round(12 * Math.min(layout.scale, 1.2))), fontWeight: '700', fill: theme.runner } });
      cap.anchor.set(0.5);
      cap.position.set(0, h / 2 + capH / 2);
      fitText(cap, w + 4);
      ex.root.addChild(g, face, cap);
      ex.root.hitArea = new Rectangle(-w / 2 - 4, -h / 2 - 4, w + 8, h + capH + 8);
      ex.root.position.set(cx, cy);
    }
    ex.box = box;
  }

  /** The Runner tapped the exposed card away. */
  private hideExposed(): void {
    this.clearExposed();
    this.callbacks.changed();
  }

  private clearExposed(): void {
    const ex = this.exposed;
    if (!ex) return;
    ex.detach();
    if (!ex.root.destroyed) ex.root.destroy({ children: true });
    this.exposed = null;
  }

  private setNewServerLabel(on: boolean): void {
    const col = this.gen?.columns.get('new');
    if (col) col.label.visible = on;
  }

  /** True if some card on the table has a move the engine would take now. */
  private usableOnTable(view: PlayerView): boolean {
    return Object.values(view.installedOptions).some((os) => os.some((o) => o.reject === null));
  }

  /** The card id of installed card `uid` as the viewer sees it (null: face down to them). */
  private installedCardId(uid: string): string | null {
    const view = this.view;
    if (!view) return null;
    for (const srv of view.corpServers) for (const c of [...srv.ice, ...srv.content]) if (c.uid === uid) return c.cardId;
    return view.rig.find((c) => c.uid === uid)?.cardId ?? null;
  }

  /** The hint for a refused option (Sprint 9: a condition in the card's own words, e.g. "Runner isn't tagged"). */
  private rejectHint(option: CardOption): string {
    return option.reject ? rejectText(option.reject, this.view, option) : '';
  }

  /**
   * The buttons of a picked thing: an installed card's options; Sprint 9: the tag marker's
   * `basicOptions` (Remove 1 tag), a scored agenda's options (`score:corp:0`).
   */
  private pickedOptions(view: PlayerView, key: string): readonly CardOption[] {
    if (key === TAGS_PICK) return view.basicOptions ?? [];
    return view.installedOptions[key] ?? [];
  }

  /** Sprint 9: the viewer's scored agendas with abilities (`score:corp:<i>` keys in installedOptions), one per card. */
  private scoredKeys(view: PlayerView): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const [key, options] of Object.entries(view.installedOptions)) {
      if (!isScoredUid(key) || options.length === 0) continue;
      const m = /^score:(corp|runner):(\d+)$/.exec(key);
      const id = m ? view.players[m[1] as Side].scored[Number(m[2])] : undefined;
      if (id === undefined || seen.has(id)) continue;
      seen.add(id);
      out.push(key);
    }
    return out;
  }

  /** Sprint 9: a scored agenda's ability button: "Do 1 meat damage · 1 click" (words from card data, price from the engine). */
  private scoredOptionLabel(option: CardOption, key: string): string {
    const a = option.action;
    if (a.type !== 'activate') return installedOptionLabel(option, null);
    const m = /^score:(corp|runner):(\d+)$/.exec(key);
    const id = m && this.view ? this.view.players[m[1] as Side].scored[Number(m[2])] : undefined;
    const label = (id ? getCard(id)?.scoredAbilities?.[a.ability]?.label : undefined) ?? 'Use';
    const parts = [label.replace('{gain}', String(option.gain ?? 0))];
    if (option.clicks) parts.push(plural(option.clicks, 'click', 'clicks'));
    if (option.cost > 0) parts.push(priceText(option.cost));
    return parts.join(' · ');
  }

  /**
   * Sprint 10 (S-10-2): "Link 1" and "Tagged 1" under Memory (numbers from the view). The
   * Runner's own Tagged takes taps on the whole stats column (>= 44 px; Memory and Link take none).
   */
  private applyStats(gen: Generation, layout: BoardLayout, view: PlayerView): void {
    const runner = view.players.runner;
    gen.link.set(layout.rig.link, identityOf(view, 'runner') ? linkText(runner.link) : null);
    const tags = runner.tags ?? 0;
    gen.tagged.set(layout.rig.tagged, tags > 0 ? taggedText(tags) : null);
    const tappable = tags > 0 && view.viewer === 'runner';
    gen.tagged.root.eventMode = tappable ? 'static' : 'none';
    if (tappable) {
      const st = layout.rig.stats;
      const t = gen.tagged.box;
      gen.tagged.root.hitArea = new Rectangle(st.x - (t.x + t.width / 2), st.y - (t.y + t.height / 2), st.width, st.height);
      gen.tagged.root.cursor = 'pointer';
    }
  }

  /** Sprint 9 (S-09-2): the Runner taps his "Tagged 1" note: Remove 1 tag shows where Play goes (dim with the reason). */
  private onTagTap(): void {
    const view = this.view;
    if (!view || this.flipPending) {
      this.fx.finishAll();
      return;
    }
    if (this.pickedInstalled === TAGS_PICK) {
      this.cancelSelection();
      return;
    }
    const options = view.basicOptions ?? [];
    if (options.length === 0 || panelUp(view) || view.choice) {
      if (view.choice) this.showHint(view.choice.options.length > 0 ? choiceHint(view.choice) : `${SIDE_NAME[view.choice.waitingOn]} is choosing`);
      return;
    }
    const first = options[0]!.reject;
    if (first !== null && first !== 'no_clicks' && first !== 'no_credits' && GATE_REASONS.has(first) && options.every((o) => o.reject === first)) {
      this.showHint(hintFor(first, view));
      return;
    }
    this.cancelSelection();
    this.pickedInstalled = TAGS_PICK;
    this.showTargets();
    this.applyView(view, false);
    this.callbacks.changed();
  }

  /**
   * S-10-1: "Do 1 meat damage: score it first" for the viewer's own installed, unscored agenda
   * whose card has scored abilities (card data, not an engine option); null otherwise.
   */
  private scoreFirstText(view: PlayerView, uid: string): string | null {
    if (view.viewer !== 'corp' || isScoredUid(uid) || uid === TAGS_PICK) return null;
    const installed = view.corpServers.some((srv) => srv.content.some((c) => c.uid === uid));
    const id = installed ? this.installedCardId(uid) : null;
    const def = id ? getCard(id) : undefined;
    const label = def?.type === 'agenda' ? def.scoredAbilities?.[0]?.label : undefined;
    return label ? `${label.replace(/\s*\{gain\}\s*/g, ' ').trim()}: score it first` : null;
  }

  /** Sprint 10 (S-10-1): a tap on a scored pile. */
  private onScoredPileTap(side: Side): void {
    this.openPileView(side);
  }

  /** Sprint 9 (S-09-3): a tap on the viewer's own score pill shows its scored agenda's ability (Private Security Force). */
  private onScoreTap(side: Side): void {
    const view = this.view;
    if (!view) return;
    if (this.flipPending) {
      this.fx.finishAll();
      return;
    }
    const keys = side === view.viewer && !panelUp(view) && !view.choice ? this.scoredKeys(view) : [];
    const key = keys[0];
    if (key === undefined) {
      this.cancelSelection();
      return;
    }
    this.pickScored(view, key);
  }

  /** Sprint 9 / S-10-1: shows a scored agenda's buttons (`score:corp:<i>`), from the score pill or the pile. */
  private pickScored(view: PlayerView, key: string): void {
    if (this.pickedInstalled === key) {
      this.cancelSelection();
      return;
    }
    const options = this.pickedOptions(view, key);
    const first = options[0]?.reject ?? null;
    this.cancelSelection();
    if (first !== null && first !== 'no_clicks' && first !== 'condition_not_met' && GATE_REASONS.has(first) && options.every((o) => o.reject === first)) {
      this.showHint(hintFor(first, view));
      return;
    }
    this.pickedInstalled = key;
    this.showTargets();
    this.applyView(view, false);
    this.callbacks.changed();
  }

  /** An installed card with options (view.installedOptions) shows its buttons; anything else drops the pick. */
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
    const runChoice = this.decision ? this.decision.choice : view.choice;
    if (isRunChoice(runChoice)) {
      // S-08-7: a lit program (Rototurret) or the Construct: tapping it picks it, like its button.
      const pick = runChoice.options.find((o) => o.action.type === 'choose' && o.action.uid === uid);
      if (pick) this.callbacks.onAction(pick.action);
      else this.showHint(runChoice.options.length > 0 ? choiceHint(runChoice) : `${SIDE_NAME[runChoice.waitingOn]} is choosing`);
      return;
    }
    if (view.choice) {
      // The offered ICE are lit; a tap on one (or its marker) rezzes it for free.
      const rez = view.choice.options.find((o) => o.action.type === 'rez' && o.action.uid === uid);
      if (rez) this.callbacks.onAction(rez.action);
      else this.showHint(view.choice.options.length > 0 ? choiceHint(view.choice) : `${SIDE_NAME[view.choice.waitingOn]} is choosing`);
      return;
    }
    const options = view.installedOptions[uid] ?? [];
    this.cancelSelection();
    if (options.length === 0 || panelUp(view)) return;
    const first = options[0]!.reject;
    // S-07-3: without clicks the buttons still show, dimmed, saying "No clicks left".
    if (first !== null && first !== 'no_clicks' && GATE_REASONS.has(first) && options.every((o) => o.reject === first)) {
      this.showHint(hintFor(first, view));
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
    const run = this.gen?.run;
    if (!run || !run.option(index) || this.flipPending) return;
    const action = run.tap(index);
    if (action) {
      this.callbacks.onAction(action);
      return;
    }
    // S-08-4: only the "break up to 2" pick changed: redraw the buttons.
    const view = this.view;
    if (view) this.applyView(view, false);
    this.callbacks.changed();
  }

  private onTargetTap(key: string): void {
    const t = this.activeTargets.find((x) => targetKey(x.kind, x) === key);
    if (!t || this.flipPending) return;
    if (t.kind === 'expose_open' && t.option.reject === null) {
      // Sprint 12 (S-12-4): Expose lights the face-down Corp cards (tap it again to put them out).
      this.exposePicking = !this.exposePicking;
      const view = this.view;
      this.showTargets();
      if (view) this.applyView(view, false);
      this.callbacks.changed();
      return;
    }
    // QA-S8-1: a refusal's hint can name this button's click price.
    this.tappedOption = t.option;
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
  private attachHoldZoom(target: Container, list: () => { ids: string[]; side: Side; from: Box } | null, onTap?: () => void): () => void {
    const detach = attachPress(target, {
      onTap: onTap ?? (() => this.cancelSelection()),
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
    // QA-S9-6: a notice still showing (or waiting for the cover) goes: the game-over box says what happened.
    this.pendingNotices = [];
    this.pendingWide = false;
    if (this.hint) {
      this.ui.cancel(this.hint.root);
      this.hint.root.destroy({ children: true });
      this.hint = null;
      this.syncHelp();
    }
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
      text: this.online ? 'Back to start' : 'New game',
      style: { fontFamily: theme.fontFamily, fontSize: Math.max(13, Math.round(16 * s)), fontWeight: '800', fill: theme.text },
    });
    bl.anchor.set(0.5);
    btn.addChild(bg, bl);
    this.gen?.detachers.push(this.pressFeedback(btn, () => this.callbacks.onNewGame()));
    root.addChild(g, heading, btn);
    this.centerLayer.addChild(root);
    const button = { x: root.x - btnW / 2, y: root.y + btn.y - btnH / 2, width: btnW, height: btnH };
    this.gameOver = { text: `${lines.title}: ${lines.reason}`, title: lines.title, reason: lines.reason, root, button };
    // QA-S9-5: the build date is never drawn inside the game-over box.
    this.syncHelp();
    if (animate) {
      root.scale.set(0.6);
      root.alpha = 0;
      this.fx.add({ target: root, to: { alpha: 1 }, duration: timing.gameOverIn, owner: root });
      this.fx.add({ target: root.scale, to: { x: 1, y: 1 }, duration: timing.gameOverIn, ease: ease.outBack, owner: root });
    }
  }

  // ---- hint and zoom ------------------------------------------------------

  /**
   * Notices raised while a turn changes hands: under the S-06-5 cover they would
   * fade out unseen, so they wait until it lifts (the cover goes up right after
   * this presentation, in the same task: checked once that has happened).
   */
  private queueNotices(texts: string[]): void {
    if (texts.length === 0) return;
    this.pendingNotices.push(...texts);
    queueMicrotask(() => this.flushNotices());
  }

  private flushNotices(): void {
    if (this.cover || this.pendingNotices.length === 0) return;
    const text = this.pendingNotices.join('\n');
    this.pendingNotices = [];
    const wide = this.pendingWide;
    this.pendingWide = false;
    this.showHint(text, 'notice', wide);
    this.callbacks.changed();
  }

  /**
   * The toast: a refusal hint (amber), or a notice of what just happened in a run (cyan). Never blocks input.
   * `wide` (QA-S9-1): a long notice (a trace's result) gets a wide bubble over the table instead of the rail's slot.
   */
  private showHint(text: string, kind: 'hint' | 'notice' = 'hint', wide = false): void {
    // S-10-6: the same line several times (PAD Campaign at a turn's start) shows once, "×4".
    text = collapseRepeats(text);
    if (this.hint) {
      this.ui.cancel(this.hint.root);
      this.hint.root.destroy({ children: true });
      this.hint = null;
    }
    const layout = this.layout;
    if (!layout) return;
    const s = Math.min(layout.scale, 1.2);
    const primary = this.hintSlot(layout, wide);
    const root = new Container();
    const padX = Math.max(6, Math.round(8 * s));
    const padY = Math.max(5, Math.round(6 * s));
    // Room for the glow ring around the bubble.
    const ring = 3;
    const fontSize = Math.max(12, Math.round(15 * s));
    const label = new Text({
      text,
      style: { fontFamily: theme.fontFamily, fontSize, fontWeight: '700', fill: 0x140a00, align: 'center', wordWrap: true, wordWrapWidth: 60, lineHeight: Math.max(14, Math.round(17 * s)) },
    });
    label.anchor.set(0.5);
    // The slot is sized so hints wrap at full size; shrink only if one ever does not fit, and
    // never below HINT_MIN_PX: a slot too small for that (buttons took the room) gives way to
    // the room over the table, clear of every button.
    // Wrapped at the slot's width scaled back up by `k`, then drawn at `k`: a narrow slot
    // gets fewer, smaller lines rather than many lines that would not fit its height.
    const minK = HINT_MIN_PX / fontSize;
    const at = (a: Box, k: number) => {
      label.style.wordWrapWidth = Math.max(60, (a.width - 2 * ring) / k - 2 * padX);
      const w = label.width + 2 * padX;
      const h = Math.max(32, label.height + 2 * padY);
      return { a, w, h, fit: Math.min(1, (a.width - 2 * ring) / w, (a.height - 2 * ring) / h) };
    };
    /** The largest size (down to 10 px text) at which the toast fits `a`; `ok` false if none does. */
    const measure = (a: Box) => {
      for (let k = 1; k >= minK - 1e-9; k -= 0.05) {
        const m = at(a, Math.max(k, minK));
        if (m.fit >= Math.max(k, minK) - 1e-6) return { ...m, fit: Math.min(m.fit, 1), ok: true };
      }
      return { ...at(a, minK), ok: false };
    };
    let m = measure(primary);
    if (!m.ok) {
      const table = measure(this.tableHintSlot(layout));
      m = table.ok || table.fit > m.fit ? table : measure(primary);
    }
    const fit = Math.max(m.fit, minK);
    const { a: area, w, h } = m;
    const g = new Graphics();
    const tone = kind === 'notice' ? theme.runner : theme.warn;
    g.roundRect(-w / 2, -h / 2, w, h, Math.min(h / 2, 18)).fill({ color: tone });
    g.roundRect(-w / 2 - ring, -h / 2 - ring, w + 2 * ring, h + 2 * ring, Math.min(h / 2, 18) + ring).stroke({ width: 3, color: tone, alpha: 0.35 });
    root.addChild(g, label);
    root.scale.set(fit);
    // `slot` is the usual slot (re-checked as buttons come and go); `area` is where it went.
    const hint = { text, root, box: { x: 0, y: 0, width: w * fit, height: h * fit }, kind, slot: JSON.stringify(primary), wide, area };
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
    // Sideways during a run, the run panel uses the build date's line (QA-S8-2).
    // Short sideways screens hide it (zero-height line) so a picked card's two buttons fit.
    // QA-S9-5: hidden while the game-over box is up.
    this.buildText.visible =
      !this.gameOver &&
      !(this.hint && this.layout?.mode === 'portrait') &&
      !(this.layout?.mode === 'landscape' && panelUp(this.view)) &&
      (this.layout?.buildLabel.height ?? 1) > 0;
  }

  /** Where the build date's text is drawn (CSS px). */
  private buildTextBox(): Box {
    const b = this.buildText.getBounds();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  }

  /** The build date: the date and time centered in the narrow rail (sideways), "Built …" in the column's hint slot. */
  private placeBuildLabel(layout: BoardLayout): void {
    const t = this.buildText;
    // QA-S8-2: sideways, the run panel uses the build date's line while a run is on.
    t.visible = !this.gameOver && !(layout.mode === 'landscape' && panelUp(this.view)) && layout.buildLabel.height > 0;
    if (layout.buildLabel.height <= 0) return;
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

  /** QA-S8-3: sideways during a run, the End turn slot (End turn is hidden then); else null. */
  private runNoticeSlot(layout: BoardLayout, view: PlayerView | null): Box | null {
    return layout.mode === 'landscape' && panelUp(view) && !view?.result ? layout.endTurn : null;
  }

  /** Where the toast goes: the hint slot, or (sideways, during a run) End turn's slot, clear of the run panel. */
  /** S-10-6: the room over the table (the wide trace note's), clear of every button and of the game-over box. */
  private tableHintSlot(layout: BoardLayout): Box {
    // QA-S10-1: only where nothing is drawn (no card, label, pile, counter, button or panel):
    // the biggest truly free part of the board.
    const free = freeRect(layout.board, this.drawnBoxes(layout), 80, 24, Math.max(3, Math.round(4 * layout.scale)));
    const slot = free ?? { x: layout.board.x, y: layout.board.y, width: 0, height: 0 };
    return this.gameOver ? this.clearOfGameOver(layout, slot) : slot;
  }

  /** QA-S10-1: everything drawn on the board now that a toast must not cover. */
  private drawnBoxes(layout: BoardLayout): Box[] {
    const gen = this.gen;
    const view = this.view;
    if (!gen || !view) return [];
    const out: Box[] = [...this.buttonBoxes()];
    for (const pos of ['top', 'bottom'] as const) {
      const r = layout[pos];
      out.push(r.label, r.deck, r.discard);
      if (r.identity) out.push(r.identity);
    }
    for (const seat of gen.seats.values()) if (seat.root.visible && seat.tag.text) out.push({ ...seat.tag.box });
    out.push(layout.scores.corp, layout.scores.runner, layout.corp.scored, layout.rig.scored, layout.rig.stats, layout.rig.stack, layout.rig.heap);
    for (const srv of layout.corp.servers) {
      out.push(srv.label);
      if (srv.root) out.push(srv.root);
    }
    for (const c of gen.installed.values()) out.push({ ...c.box });
    const hand = this.hands[view.viewer];
    if (hand.container.visible) for (const h of hand.boxes()) out.push(h.box);
    if (panelUp(view)) out.push(layout.runInfo, layout.runButtons);
    if (gen.run.snapshot?.access) out.push(layout.access);
    if (this.report) out.push({ ...this.report.box });
    if (this.lastRunStrip) out.push({ ...this.lastRunStrip.box });
    if (this.gameOver) out.push(layout.gameOver);
    return out;
  }

  private hintSlot(layout: BoardLayout, wide = false): Box {
    let slot = this.baseHintSlot(layout, wide);
    // S-10-6 (QA-S9-4): a toast never covers a button (End turn, Last run, a lit choice included).
    const gap = Math.max(4, Math.round(6 * layout.scale));
    const buttons = this.buttonBoxes();
    slot = clearOf(slot, buttons, gap);
    // Too little room left (a short screen with two buttons in the rail): over the table instead.
    if (!wide && (slot.width < 80 || slot.height < 32)) {
      const table = clearOf(this.baseHintSlot(layout, true), buttons, gap);
      if (table.width * table.height > slot.width * slot.height) slot = table;
    }
    return this.gameOver ? this.clearOfGameOver(layout, slot) : slot;
  }

  /** S-10-6: every button and pill on screen now (End turn, Run, Last run, lit choices, credits / clicks). */
  private buttonBoxes(): Box[] {
    const gen = this.gen;
    const layout = this.layout;
    if (!gen || !layout) return [];
    // Resting places (layout boxes), not drawn ones: a button popping (scaled up for a moment)
    // must not move the toast.
    const out: Box[] = [];
    if (gen.button.root.visible) out.push({ ...layout.endTurn });
    if (gen.runButton.root.visible) out.push({ ...gen.runButton.box });
    if (gen.lastRunButton.root.visible) out.push({ ...gen.lastRunButton.box });
    for (const t of this.activeTargets) if (t.marker.root.visible) out.push({ ...t.marker.box });
    for (const pos of ['top', 'bottom'] as const) out.push({ ...layout[pos].credits }, { ...layout[pos].clicks });
    return out;
  }

  private baseHintSlot(layout: BoardLayout, wide: boolean): Box {
    // QA-S9-1: a wide notice (a trace's result) sits over the middle of the table, never over a run / bid panel.
    if (wide && !this.runNoticeSlot(layout, this.view) && !panelUp(this.view)) {
      const b = layout.board;
      const s = Math.min(layout.scale, 1.2);
      const w = Math.min(b.width - 2 * layout.pad, Math.round(560 * s));
      const h = Math.min(b.height / 2, Math.round(110 * s));
      return { x: Math.round(b.x + (b.width - w) / 2), y: Math.round(b.y + b.height * 0.4 - h / 2), width: w, height: h };
    }
    return this.runNoticeSlot(layout, this.view) ?? layout.hintArea;
  }

  /**
   * QA-S9-6: while the game-over box shows, a toast (e.g. "The game is over" after a tap) never
   * covers it: a slot that would overlap it moves to a strip of the board right below the box
   * (or above it, when there is no room below).
   */
  private clearOfGameOver(layout: BoardLayout, slot: Box): Box {
    const g = layout.gameOver;
    const hit = slot.x < g.x + g.width && g.x < slot.x + slot.width && slot.y < g.y + g.height && g.y < slot.y + slot.height;
    if (!hit) return slot;
    const b = layout.board;
    const gap = Math.max(4, Math.round(6 * layout.scale));
    const h = Math.min(slot.height, Math.round(64 * Math.min(layout.scale, 1.2)));
    const below = g.y + g.height + gap;
    const roomBelow = b.y + b.height - below;
    const roomAbove = g.y - gap - b.y;
    if (roomBelow >= h) return { x: g.x, y: below, width: g.width, height: h };
    // Too little room either side (not on any target screen): keep the usual slot rather than a sliver.
    if (Math.max(roomBelow, roomAbove) < 32) return slot;
    if (roomBelow >= roomAbove) return { x: g.x, y: below, width: g.width, height: roomBelow };
    const ha = Math.min(h, roomAbove);
    return { x: g.x, y: g.y - gap - ha, width: g.width, height: ha };
  }

  private positionHint(hint: { root: Container; box: Box; wide?: boolean; area?: Box }): void {
    const layout = this.layout;
    if (!layout) return;
    const usual = this.hintSlot(layout, hint.wide ?? false);
    const a = hint.area ?? usual;
    // Over the table (a wide note, or a toast that moved there for room): centred in its slot.
    const run = this.runNoticeSlot(layout, this.view) !== null || JSON.stringify(a) !== JSON.stringify(this.hintSlot(layout));
    const cx = a.x + a.width / 2;
    // Sideways the slot is tall (the help text's room): sit at its bottom, by the viewer's name.
    const cy = layout.mode === 'landscape' && !run ? a.y + a.height - 3 - hint.box.height / 2 : a.y + a.height / 2;
    hint.root.position.set(cx, cy);
    hint.box.x = cx - hint.box.width / 2;
    hint.box.y = cy - hint.box.height / 2;
  }

  /** Zooms a card: a face for a known card id, a back for a face-down card the viewer may not see. */
  private openZoom(
    cardId: string | null,
    side: Side,
    from: Box,
    opts: {
      hand?: { ids: string[]; index: number };
      list?: { ids: string[]; index: number; startX: number };
      view?: boolean;
      pile?: { side: Side; ids: string[]; index: number };
      discard?: boolean;
    } = {},
  ): void {
    const layout = this.layout;
    if (!layout) return;
    // Sprint 9: the other seat is deciding on this seat's board outside a run (the Runner's
    // SEA Source bid on the Corp's board): nothing on it can be held to read (its own face-down cards).
    if (this.decision && !this.decision.run && this.decision.seat !== this.view?.viewer) return;
    const def = cardId ? getCard(cardId) : undefined;
    this.closeZoom(true);
    const { width: vw, height: vh } = layout.viewport;
    const z = layout.zoom;
    const root = new Container();
    const view = opts.view === true && (!!opts.hand || !!opts.pile);
    const mode: 'hand' | 'pile' | 'discard' = opts.pile ? 'pile' : opts.discard ? 'discard' : 'hand';
    // A held zoom takes no taps (the finger that holds it is already down). The hand view takes every tap while open.
    root.eventMode = view ? 'static' : 'none';
    if (view) {
      root.label = mode === 'pile' ? 'pile-view' : 'hand-view';
      root.hitArea = new Rectangle(0, 0, vw, vh);
      root.on('pointerdown', (e) => this.onViewDown(e));
      root.on('globalpointermove', (e) => this.onViewMove(e));
      root.on('pointerup', (e) => this.onViewUp(e, false));
      root.on('pointerupoutside', (e) => this.onViewUp(e, false));
      root.on('pointercancel', (e) => this.onViewUp(e, true));
    }
    const dim = new Graphics();
    dim.rect(0, 0, vw, vh).fill({ color: 0x000000, alpha: view ? 0.78 : 0.65 });
    let card: Container;
    let texts: string[];
    let overflow: boolean;
    let stats: StatBox[] = [];
    let clickCost: ClickCostBox | null = null;
    if (def) {
      const f = createZoomFace(def, z.width, z.height);
      card = f.root;
      texts = f.texts;
      overflow = f.overflow;
      stats = f.stats;
      clickCost = f.clickCost;
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
    const browse = opts.hand ?? opts.list ?? opts.pile ?? null;
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
    // S-10-5: the discard step's view: a stamp over a marked card, and its own Confirm.
    let stamp: Container | null = null;
    let confirm: PanelButton | null = null;
    if (view && mode === 'discard') {
      stamp = this.discardStamp(z.width, z.height);
      stamp.position.set(cx, cy);
      confirm = new PanelButton(layout.scale, 'button:discard-confirm');
      root.addChild(stamp, confirm.root);
    }
    root.alpha = 0;
    this.zoomLayer.addChild(root);
    const list = opts.list ? { ids: opts.list.ids, start: opts.list.index, startX: opts.list.startX, step: Math.max(28, Math.round(z.width * 0.18)) } : null;
    const pile = opts.pile ? { side: opts.pile.side, ids: opts.pile.ids } : null;
    this.zoom = { cardId: def ? cardId : null, root, card, width: z.width, height: z.height, texts, overflow, stats, clickCost, frame, carousel, index: browse?.index ?? 0, list, view, mode, pile, stamp, confirm };
    this.syncDiscardView();
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
    zoom.stats = next.stats;
    zoom.clickCost = next.clickCost;
    zoom.index = index;
    if (zoom.carousel) {
      // On a device where drawing a frame is slow, the slide would only delay the next touch: jump instead.
      const slide = !framesAreSlow();
      zoom.carousel.show(zoom.carousel.cardIds, index, prev, slide);
      this.callbacks.log({ kind: 'carousel_slide', text: cardId, scheduledMs: slide ? CAROUSEL_SLIDE_MS : 0 });
    }
    this.syncDiscardView();
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
    if (zoom.view) this.endViewPress();
    // A card lifted out of the hand view goes home (at once when the board is about to change under it).
    if (this.lift) this.cancelLift(immediate ? 0 : RETURN_MS);
    this.zoom = null;
    zoom.root.eventMode = 'none';
    if (zoom.view) this.stopPredraw();
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

  // ---- S-07-6 hand view: tap to open, long-press to lift, drag to play ------

  /** Opens the hand view on hand card `index` (`from`: where it grows from; default its strip slot). */
  private openHandView(index: number, from?: Box, discard = false): void {
    const view = this.view;
    if (!view || panelUp(view)) return;
    const hand = this.hands[view.viewer];
    const ids = hand.ids;
    const cardId = ids[index];
    if (cardId === undefined) return;
    const box = from ?? hand.boxes()[index]?.box;
    if (!box) return;
    if (!this.predraw) this.startPredraw(ids, index);
    this.openZoom(cardId, view.viewer, box, { hand: { ids, index }, view: true, discard });
    this.callbacks.log({ kind: 'hand_open', text: cardId, scheduledMs: timing.zoomIn });
    this.callbacks.changed();
  }

  /** Where the big card in the middle of the hand view sits (its final place: a quick tap during the zoom-in still lands). */
  private viewCentreBox(): Box | null {
    return this.zoom?.view && this.layout ? { ...this.layout.zoom } : null;
  }

  private onViewDown(e: FederatedPointerEvent): void {
    const zoom = this.zoom;
    if (!zoom?.view || this.viewPress || this.lift) return;
    const centre = this.viewCentreBox();
    const view = this.view;
    if (!centre || !view) return;
    const x = e.global.x;
    const y = e.global.y;
    const strip = zoom.mode === 'pile' ? [] : this.hands[view.viewer].boxes().map((h) => h.box);
    const hit = viewHit(x, y, centre, zoom.carousel?.snapshot() ?? [], strip);
    const native: unknown = e.nativeEvent;
    const now = performance.now();
    const stamp = native instanceof Event ? native.timeStamp : now;
    const at = stamp > 0 && stamp <= now && now - stamp < 10_000 ? stamp : now;
    const press = { id: e.pointerId, x, y, lastX: x, lastY: y, at, hit, start: zoom.index, swiped: false, timer: null as ReturnType<typeof setTimeout> | null };
    // Long-press the big card to lift it (judged by when the finger went down). A timer that runs
    // late (the page stalled) waits one frame, so a release queued meanwhile is handled first (QA-S3-7).
    if (hit.kind === 'centre' && zoom.mode === 'hand') {
      press.timer = setTimeout(() => {
        press.timer = null;
        if (this.viewPress !== press) return;
        if (performance.now() - press.at < LIFT_MS + LATE_LIFT_MS) this.liftCentre();
        else requestAnimationFrame(() => {
          if (this.viewPress === press) this.liftCentre();
        });
      }, Math.max(0, LIFT_MS - (performance.now() - at)));
    }
    this.viewPress = press;
  }

  private onViewMove(e: FederatedPointerEvent): void {
    const p = this.viewPress;
    if (!p || p.id !== e.pointerId) return;
    const x = e.global.x;
    const y = e.global.y;
    p.lastX = x;
    p.lastY = y;
    if (this.lift) {
      this.dragMove(x, y);
      return;
    }
    const zoom = this.zoom;
    const view = this.view;
    if (!zoom?.view || !view) return;
    if (!p.swiped && Math.hypot(x - p.x, y - p.y) > SWIPE_TOLERANCE) {
      p.swiped = true;
      if (p.timer !== null) clearTimeout(p.timer);
      p.timer = null;
    }
    if (!p.swiped) return;
    // Swipe: the cards follow the finger sideways, one card per step.
    const ids = this.viewIds();
    const i = swipeIndex(p.start, x - p.x, Math.max(40, Math.round(zoom.width * 0.32)), ids.length);
    const id = ids[i];
    if (id === undefined || i === zoom.index) return;
    const native: unknown = e.nativeEvent;
    this.swapZoom(id, this.viewStripBox(i), native instanceof Event ? native.timeStamp : performance.now(), i);
  }

  private onViewUp(e: FederatedPointerEvent, cancelled: boolean): void {
    if (!cancelled) {
      const native: unknown = e.nativeEvent;
      noteRelease(native instanceof Event ? native.timeStamp : e.timeStamp, performance.now(), 'hand-view');
    }
    const p = this.viewPress;
    if (!p || p.id !== e.pointerId) return;
    this.endViewPress();
    const native: unknown = e.nativeEvent;
    const upAt = native instanceof Event ? native.timeStamp : performance.now();
    if (this.lift) {
      // The page stalled and lifted the card, but the finger was down for less than the hold time
      // and never moved away: it was a tap on the big card (QA-S3-7: a tap is judged by its own times).
      if (!cancelled && !p.swiped && upAt - p.at < LIFT_MS && Math.hypot(e.global.x - p.x, e.global.y - p.y) <= SWIPE_TOLERANCE) {
        const index = this.lift.index;
        this.cancelLift(0);
        this.closeZoom(true);
        this.pickCard(index);
        this.callbacks.changed();
        return;
      }
      this.dropLift(e.global.x, e.global.y, cancelled);
      return;
    }
    if (cancelled || p.swiped) return;
    // Held long enough to lift but the page was too busy to show it: a hold is never a tap.
    if (p.hit.kind === 'centre' && upAt - p.at >= LIFT_MS) return;
    const zoom = this.zoom;
    const view = this.view;
    if (!zoom?.view || !view) return;
    // S-10-5: the discard view's Confirm (pressed and let go on it).
    const cb = zoom.confirm?.box;
    if (cb && inBox(cb, p.x, p.y) && inBox(cb, e.global.x, e.global.y)) {
      this.onDiscardConfirm();
      return;
    }
    if (p.hit.kind === 'centre') {
      if (zoom.mode === 'discard') {
        this.toggleDiscardMark(zoom.index);
        return;
      }
      if (zoom.mode === 'pile') {
        this.onPileCentreTap();
        return;
      }
      // Today's pick: the view closes, the card is outlined and its places light up.
      const index = zoom.index;
      this.closeZoom();
      this.pickCard(index);
      this.callbacks.changed();
      return;
    }
    if (p.hit.kind === 'card') {
      const id = this.viewIds()[p.hit.index];
      if (id !== undefined && p.hit.index !== zoom.index) this.swapZoom(id, this.viewStripBox(p.hit.index), upAt, p.hit.index);
      return;
    }
    // Outside the cards: the view closes (the tap does nothing else).
    this.closeZoom();
    this.callbacks.changed();
  }

  /** The cards an open view browses (Sprint 10: a scored pile's, or the hand's). */
  private viewIds(): readonly string[] {
    const zoom = this.zoom;
    const view = this.view;
    if (zoom?.pile) return zoom.pile.ids;
    return view ? this.hands[view.viewer].ids : [];
  }

  /** The hand-strip slot of card `i` (the frame follows it); none for a pile view. */
  private viewStripBox(i: number): Box | null {
    const view = this.view;
    if (!view || this.zoom?.pile) return null;
    return this.hands[view.viewer].boxes()[i]?.box ?? null;
  }

  /** S-10-5: Confirm in the discard view: the marked cards go (the engine's count), else says how many more. */
  private onDiscardConfirm(): void {
    const view = this.view;
    if (!view) return;
    const k = view.pendingDiscard - this.marked.size;
    if (k > 0) {
      this.showHint(`Pick ${plural(k, 'more card', 'more cards')}`);
      this.callbacks.changed();
      return;
    }
    this.closeZoom(true);
    this.callbacks.onDiscard([...this.marked].sort((a, b) => a - b));
  }

  /**
   * S-10-1: a scored pile is open and its big card was tapped. The viewer's own scored agenda
   * with abilities (Private Security Force) shows its buttons ("Do 1 meat damage · 1 click");
   * any other card stays open to read.
   */
  private onPileCentreTap(): void {
    const zoom = this.zoom;
    const view = this.view;
    if (!zoom?.pile || !view) return;
    const key = `score:${zoom.pile.side}:${zoom.index}`;
    if (zoom.pile.side !== view.viewer || panelUp(view) || view.choice || (view.installedOptions[key] ?? []).length === 0) return;
    this.closeZoom();
    this.pickScored(view, key);
  }

  /** S-10-1: a tap on a scored pile opens it big, like the hand (slide to read, tap outside to close). */
  private openPileView(side: Side): void {
    const view = this.view;
    const gen = this.gen;
    if (!view || !gen || this.flipPending) {
      this.fx.finishAll();
      return;
    }
    const ids = [...view.players[side].scored];
    if (ids.length === 0) return;
    this.cancelSelection();
    const index = ids.length - 1;
    this.openZoom(ids[index]!, 'corp', gen.scoredPiles[side].box(), { pile: { side, ids, index }, view: true });
    this.callbacks.log({ kind: 'pile_open', text: ids[index]!, scheduledMs: timing.zoomIn });
    this.callbacks.changed();
  }

  private endViewPress(): void {
    const p = this.viewPress;
    if (p?.timer != null) clearTimeout(p.timer);
    this.viewPress = null;
  }

  /** The big card was held: it lifts out, follows the finger, and its places light up. */
  private liftCentre(): void {
    const p = this.viewPress;
    const zoom = this.zoom;
    const view = this.view;
    if (!p || !zoom?.view || !view || this.lift || p.swiped) return;
    p.timer = null;
    const index = zoom.index;
    const hand = this.hands[view.viewer];
    const cardId = hand.ids[index];
    const layout = this.layout;
    if (cardId === undefined || !layout) return;
    const refused = this.refusePick(index);
    if (refused !== null) {
      // Nothing to light: say why, with the board in view.
      this.closeZoom();
      if (refused) this.showHint(refused);
      this.callbacks.changed();
      return;
    }
    this.cancelSelection();
    if (!hand.lift(index)) return;
    this.lift = { index, cardId, hover: -1, boxes: [] };
    this.showTargets();
    // Sprint 12: Infiltration's Expose button only opens the pick (a drop there plays nothing).
    this.lift.boxes = this.activeTargets.map((t) => (t.kind === 'expose_open' ? { x: -1, y: -1, width: 0, height: 0 } : t.marker.box));
    this.applyView(view, false);
    this.dragMove(p.lastX, p.lastY);
    // The view fades out (it keeps taking the finger's moves and its release).
    this.ui.cancel(zoom.root);
    this.ui.add({ target: zoom.root, to: { alpha: 0 }, duration: VIEW_FADE_MS, ease: ease.linear, owner: zoom.root });
    this.callbacks.log({ kind: 'card_lift', text: cardId, scheduledMs: VIEW_FADE_MS });
    this.callbacks.changed();
  }

  /** The lifted card follows the finger; the place under it is outlined. */
  private dragMove(x: number, y: number): void {
    const lift = this.lift;
    const layout = this.layout;
    const view = this.view;
    if (!lift || !layout || !view) return;
    const c = layout.card;
    ghostCenter(x, y, c.width, c.height, layout.viewport.width, layout.viewport.height, this.ghostAt);
    this.hands[view.viewer].dragTo(this.ghostAt.x, this.ghostAt.y);
    const hover = targetAt(x, y, lift.boxes);
    if (hover !== lift.hover) {
      this.activeTargets[lift.hover]?.marker.setHover(false);
      this.activeTargets[hover]?.marker.setHover(true);
      lift.hover = hover;
    }
    if (this.callbacks.redraw) this.callbacks.redraw();
    else this.callbacks.changed();
  }

  /**
   * The finger let go of a lifted card at x/y. On a lit place: that option's
   * action (the card waits there for the answer). On a dimmed one: its hint.
   * Anywhere else (or the touch was cancelled): it flies home and the hand view returns.
   */
  private dropLift(x: number, y: number, cancelled: boolean): void {
    const lift = this.lift;
    const view = this.view;
    if (!lift || !view) return;
    const i = cancelled ? -1 : targetAt(x, y, lift.boxes);
    const target = this.activeTargets[i];
    const hand = this.hands[view.viewer];
    if (target && target.option.reject === null) {
      this.lift = null;
      this.closeZoom(true);
      this.showTargets();
      this.applyView(view, false);
      // The engine judges it; the play's flight starts where the card was let go.
      this.dropping = true;
      try {
        this.callbacks.onAction(target.option.action);
      } finally {
        this.dropping = false;
      }
      // Online the answer comes later: the card waits on its place (home if none comes).
      if (hand.liftedIndex !== null) {
        this.dropWait = setTimeout(() => {
          this.dropWait = null;
          hand.settle(RETURN_MS);
          this.callbacks.log({ kind: 'card_return', scheduledMs: RETURN_MS });
          this.callbacks.changed();
        }, DROP_WAIT_MS);
      }
      this.callbacks.changed();
      return;
    }
    const zoom = this.zoom;
    this.cancelLift(RETURN_MS);
    if (target && target.option.reject !== null) {
      // A dimmed place: say why, with the board in view.
      this.closeZoom(true);
      this.showHint(rejectText(target.option.reject, view, target.option));
    } else if (zoom?.view) {
      // Let go elsewhere: the hand view comes back.
      this.ui.cancel(zoom.root);
      this.ui.add({ target: zoom.root, to: { alpha: 1 }, duration: timing.zoomIn, ease: ease.outCubic, owner: zoom.root });
    }
    this.callbacks.changed();
  }

  /** The lifted card goes home over `ms`; its places go dark. */
  private cancelLift(ms: number): void {
    const lift = this.lift;
    const view = this.view;
    if (!lift) return;
    this.activeTargets[lift.hover]?.marker.setHover(false);
    this.lift = null;
    if (view) this.hands[view.viewer].settle(ms);
    if (ms > 0) this.callbacks.log({ kind: 'card_return', scheduledMs: ms });
    this.showTargets();
    if (view) this.applyView(view, false);
  }

  /** A dropped card's answer arrived (or the board moved on): stop waiting for it. */
  private endDropWait(): void {
    if (this.dropWait === null && !this.dropping) return;
    if (this.dropWait !== null) clearTimeout(this.dropWait);
    this.dropWait = null;
    for (const s of SIDES) this.hands[s].leaveLifted();
  }

  private dragSnapshot(): LayoutSnapshot['drag'] {
    const lift = this.lift;
    const view = this.view;
    if (!lift || !view) return null;
    const box = this.hands[view.viewer].liftedBox();
    if (!box) return null;
    const t = this.activeTargets[lift.hover];
    return {
      index: lift.index,
      cardId: lift.cardId,
      box,
      hover: t ? { kind: t.kind, ...(t.server !== undefined ? { server: t.server } : {}), lit: t.option.reject === null } : null,
    };
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

/** S-12-6: a copy of a click-cost box for the snapshot (null stays null). */
function copyClickCost(c: ClickCostBox | null): ClickCostBox | null {
  return c ? { ...c, icon: { ...c.icon }, box: { ...c.box } } : null;
}
