// Pure layout math: viewport size + safe-area insets + the shape of the
// table (how many servers, ICE and installed cards) in, boxes (CSS pixels)
// out. No Pixi or DOM here so it can be unit tested for "nothing cut off,
// overlapping, or under the notch / gesture bar" across many screen shapes.
//
// The layout is viewer-relative: `bottom` is the player looking at the screen
// (the active player in hot-seat), `top` is their opponent.
//
// Two modes:
// - landscape (viewport height <= 500 and wider than tall: phones held
//   sideways). Right rail: banner, Play, help (or a hint), the viewer's name,
//   credits, clicks and End turn. Left of it, top to bottom: the opponent's
//   header (name, credits and clicks chips), the opponent's band, the
//   viewer's band, the hand strip.
// - portrait (everything else: desktop windows, tablets). The Sprint 1 column
//   (opponent row, center, viewer row, hand) with the two bands and a control
//   strip (banner, help / Play, hint + End turn) in the center.
//
// A side's band: the Corp's server columns (HQ, R&D, Archives, Server 1...,
// then a New server slot; ICE drawn sideways and stacked outward, toward the
// Runner) or the Runner's row (Stack, Heap, installed cards, an Install slot
// and the memory counter). The Corp's deck and discard pile sit in the R&D
// and Archives columns; HQ's column shows the Corp's hand count.
//
// Room is reserved for the "busy board" (3 remote servers with 2 ICE each, 4
// Runner installs) so cards keep their place and size during a normal game.
// Past that, everything shrinks evenly to fit (below the 44px touch minimum
// only then); there is no sideways scrolling yet.
import type { ServerId, Side } from '@overclock/engine';
import type { Box, Insets } from './hook-types';

export type LayoutMode = 'landscape' | 'portrait';

export interface SideRow {
  /** The side's whole area (background tint). */
  row: Box;
  /** Side name with the hand count ("RUNNER · 5 cards in Grip"). */
  label: Box;
  credits: Box;
  clicks: Box;
  /** Archives (in its column) / the Heap. */
  discard: Box;
  /** R&D (in its column) / the Stack. */
  deck: Box;
}

export interface ServerSlots {
  id: ServerId | 'new';
  /** The whole column (tap target while it is lit). */
  column: Box;
  /** Name tag ("HQ", "Server 1"). */
  label: Box;
  /** Central servers: the HQ marker / R&D deck / Archives pile. */
  root: Box | null;
  /** Installed upgrades/agendas/assets, install order (upright cards). */
  content: Box[];
  /** ICE, index 0 innermost (sideways cards: wider than tall). */
  ice: Box[];
}

export interface CorpBand {
  band: Box;
  /** Which way ICE stacks from the server cards (toward the Runner). */
  outward: 'up' | 'down';
  servers: ServerSlots[];
  /** Shown only while a Corp card that can open a server is picked. */
  newServer: ServerSlots;
}

export interface RigBand {
  band: Box;
  stack: Box;
  heap: Box;
  /** Installed Runner cards, install order. */
  cards: Box[];
  /** Shown while a program/hardware/resource is picked. */
  install: Box;
  memory: Box;
}

export interface BoardLayout {
  mode: LayoutMode;
  viewport: { width: number; height: number };
  insets: Insets;
  /** Everything except the backdrop is laid out inside this rect. */
  safe: Box;
  /** The play area (left of the rail in landscape; the column in portrait). */
  board: Box;
  /** Font scale relative to the reference sizes. */
  scale: number;
  pad: number;
  viewer: Side;
  /** Opponent. */
  top: SideRow;
  /** Viewer (the only interactive one). */
  bottom: SideRow;
  corp: CorpBand;
  rig: RigBand;
  /** Installed-card size (upright). ICE boxes are this, turned sideways. */
  unit: { width: number; height: number };
  /** "TURN 3 · CORP · 2 clicks left". */
  banner: Box;
  /** Help text, or the discard picker's "Discard 2". */
  sub: Box;
  /** The Play button for a picked operation/event (inside `sub`). */
  action: Box;
  /**
   * Where the transient hint toast sits. Sideways: the help text's room below
   * the Play button (inside `sub`; the help text hides while a hint shows).
   * Column: left of End turn.
   */
  hintArea: Box;
  /** End turn button; also the discard picker's Confirm button. */
  endTurn: Box;
  gameOver: Box;
  handArea: Box;
  /** Hand card size. */
  card: { width: number; height: number };
  zoom: Box;
  /** Widgets are rebuilt only when this changes (sizes, viewport). */
  sizeKey: string;
}

export interface ServerShape {
  readonly id: ServerId;
  readonly ice: number;
  readonly content: number;
}

/** What is on the table, as far as the layout cares. */
export interface BoardShape {
  /** hq, rd, archives, then remotes (view.corpServers order). */
  readonly servers: readonly ServerShape[];
  readonly rig: number;
}

export interface LayoutOptions {
  viewer?: Side;
  shape?: BoardShape;
}

/** Minimum touch target (CSS px), per the client charter. */
export const MIN_TOUCH = 44;
/** Card aspect ratio (height / width). */
export const CARD_RATIO = 1.4;
/** Room kept for the busy board (S-02-5). */
export const RESERVED = { remotes: 3, icePerServer: 2, rig: 4 } as const;

const CENTRALS: readonly ServerId[] = ['hq', 'rd', 'archives'];
export const EMPTY_SHAPE: BoardShape = { servers: CENTRALS.map((id) => ({ id, ice: 0, content: 0 })), rig: 0 };

const REF_W = 390;
const REF_H = 844;
/** Most a card shrinks (px) to keep a central server's root clear while fanning (QA-S2-2). */
const FAN_SHRINK = 2;
/** Smallest installed card when the table is past the busy board (shrink, no scroll). */
const MIN_UNIT = 12;

function box(x: number, y: number, width: number, height: number): Box {
  return { x, y, width, height };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function sanitize(insets: Partial<Insets> | undefined): Insets {
  const v = (n: number | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);
  return { top: v(insets?.top), right: v(insets?.right), bottom: v(insets?.bottom), left: v(insets?.left) };
}

export function isCentral(id: ServerId | 'new'): boolean {
  return id === 'hq' || id === 'rd' || id === 'archives';
}

const cardH = (u: number) => Math.round(u * CARD_RATIO);

/** Upright card slots in a column (central servers: the root widget first). */
function slotCount(s: ServerShape): number {
  return isCentral(s.id) ? 1 + s.content : Math.max(1, s.content);
}

/** Servers the sizes are planned for: the real ones, padded to the busy board. */
function sizingServers(shape: BoardShape): ServerShape[] {
  const out = [...shape.servers];
  let remotes = out.filter((s) => !isCentral(s.id)).length;
  while (remotes < RESERVED.remotes) out.push({ id: `remote${1000 + remotes++}`, ice: 0, content: 1 });
  return out;
}

interface Gaps {
  /** Between cards inside a column / row. */
  g: number;
  /** Between columns. */
  gc: number;
  /** Server name tag height. */
  labelH: number;
  /** Several cards in one server overlap inside the usual column width (instead of widening it). */
  fan?: boolean;
}

/**
 * Column width for a server. Fanned, the installed cards of a crowded server
 * overlap inside the usual width, but a central server's root (HQ marker, R&D,
 * Archives) is never covered: it keeps its own slot beside them (QA-S2-2).
 */
function columnWidth(s: ServerShape | 'new', u: number, g: number, fan = false): number {
  const slots = s === 'new' ? 1 : slotCount(s);
  if (!fan || s === 'new') return Math.max(cardH(u), slots * u + (slots - 1) * g);
  if (!isCentral(s.id) || s.content === 0) return cardH(u);
  return Math.max(cardH(u), u + g + (s.content === 1 ? u : cardH(u)));
}

function corpWidth(servers: readonly ServerShape[], u: number, k: Gaps): number {
  // + the New server column (one slot).
  const cols = servers.map((s) => columnWidth(s, u, k.g, k.fan));
  cols.push(columnWidth('new', u, k.g));
  return cols.reduce((a, b) => a + b, 0) + (cols.length - 1) * k.gc;
}

function iceCap(shape: BoardShape): number {
  return Math.max(RESERVED.icePerServer, ...shape.servers.map((s) => s.ice));
}

function corpHeight(u: number, ice: number, k: Gaps): number {
  return k.labelH + k.g + cardH(u) + ice * (u + k.g);
}

function memoryWidth(u: number): number {
  return Math.max(56, Math.round(u * 1.15));
}

function rigWidth(n: number, u: number, k: Gaps): number {
  // Stack, Heap | n cards, Install slot | memory counter.
  return 2 * u + k.g + 2 * k.gc + (n + 1) * u + n * k.g + k.gc + memoryWidth(u);
}

function layoutCorpBand(x: number, y: number, width: number, height: number, u: number, k: Gaps, outward: 'up' | 'down', shape: BoardShape): CorpBand {
  const uh = cardH(u);
  const band = box(x, y, width, height);
  const iceRoom = height - k.labelH - k.g - uh;
  let cx = x;
  const column = (s: ServerShape | { id: 'new'; ice: number; content: number }): ServerSlots => {
    const n = s.id === 'new' ? 1 : slotCount(s as ServerShape);
    const w = columnWidth(s.id === 'new' ? 'new' : (s as ServerShape), u, k.g, k.fan);
    const label = outward === 'down' ? box(cx, y, w, k.labelH) : box(cx, y + height - k.labelH, w, k.labelH);
    const rowY = outward === 'down' ? label.y + k.labelH + k.g : label.y - k.g - uh;
    const central = s.id !== 'new' && isCentral(s.id);
    // A central server's root keeps a slot of its own; the installed cards follow it.
    const lead = central ? u + k.g : 0;
    const m = central ? n - 1 : n;
    // Fanned (past the busy board): the installed cards overlap, each still showing a strip.
    const cstep = m <= 1 ? 0 : Math.min(u + k.g, (w - lead - u) / (m - 1));
    const rowW = lead + (m > 0 ? u + (m - 1) * cstep : -k.g);
    const rowX = cx + (w - rowW) / 2;
    const slots = Array.from({ length: n }, (_, i) => box(rowX + (central ? (i === 0 ? 0 : lead + (i - 1) * cstep) : i * cstep), rowY, u, uh));
    // Past the reserved ICE room (only when shrinking hit its floor), ICE overlap evenly.
    const step = s.ice <= 1 ? u + k.g : Math.min(u + k.g, (iceRoom - k.g - u) / (s.ice - 1));
    const ice = Array.from({ length: s.ice }, (_, i) =>
      box(cx + (w - uh) / 2, outward === 'down' ? rowY + uh + k.g + i * step : rowY - k.g - u - i * step, uh, u),
    );
    const out: ServerSlots = {
      id: s.id,
      column: box(cx, y, w, height),
      label,
      root: central ? slots[0]! : null,
      content: central ? slots.slice(1) : s.id === 'new' ? slots : slots.slice(0, Math.max(0, s.content)),
      ice,
    };
    cx += w + k.gc;
    return out;
  };
  const servers = shape.servers.map(column);
  const newServer = column({ id: 'new', ice: 0, content: 0 });
  return { band, outward, servers, newServer };
}

function layoutRigBand(x: number, y: number, width: number, u: number, k: Gaps, n: number): RigBand {
  const uh = cardH(u);
  const stack = box(x, y, u, uh);
  const heap = box(x + u + k.g, y, u, uh);
  const memW = memoryWidth(u);
  const memory = box(x + width - memW, y, memW, uh);
  const start = heap.x + u + 2 * k.gc;
  const room = memory.x - k.gc - start;
  // n cards + the Install slot; overlap only past the shrink floor.
  const step = n === 0 ? u + k.g : Math.min(u + k.g, (room - u) / n);
  const cards = Array.from({ length: n }, (_, i) => box(start + i * step, y, u, uh));
  const install = box(start + n * step, y, u, uh);
  return { band: box(x, y, width, uh), stack, heap, cards, install, memory };
}

/**
 * Card unit and gaps for the table. The unit is planned for the busy board; a
 * table a little past it (say an upgrade next to an agenda in a remote) first
 * squeezes the gaps between columns (down to 2px), then fans the cards of a
 * crowded server inside its usual width (like the hand), so no card changes
 * size; only a bigger table (more servers, ICE or Runner cards) shrinks them.
 */
function fitTable(max: number, k: Gaps, fits: (u: number, k: Gaps) => boolean, fitsBusy: (u: number) => boolean): { u: number; k: Gaps } {
  const u = fitUnit(max, (u) => fits(u, k));
  const uBusy = fitUnit(max, fitsBusy);
  if (u >= uBusy) return { u, k };
  if (fits(uBusy, { ...k, gc: 2 })) {
    let gc = k.gc;
    while (gc > 2 && !fits(uBusy, { ...k, gc })) gc--;
    return { u: uBusy, k: { ...k, gc } };
  }
  // Still too wide: fan the cards of crowded servers inside their usual width.
  const fan = { ...k, fan: true };
  if (fits(uBusy, fan)) return { u: uBusy, k: fan };
  if (fits(uBusy, { ...fan, gc: 2 })) return { u: uBusy, k: { ...fan, gc: squeeze(uBusy, fan, fits) } };
  // Just past that (e.g. an upgrade beside a central server's root, which is
  // never covered): fan and squeeze, shrinking cards by a pixel or two.
  // A table well past the busy board shrinks evenly instead (no fanning).
  const uFan = fitUnit(max, (x) => fits(x, { ...fan, gc: 2 }));
  if (uFan > u && uFan >= uBusy - FAN_SHRINK) return { u: uFan, k: { ...fan, gc: squeeze(uFan, fan, fits) } };
  return { u, k };
}

/** Widest gap between columns (down to 2px) at which the table fits. */
function squeeze(u: number, k: Gaps, fits: (u: number, k: Gaps) => boolean): number {
  let gc = k.gc;
  while (gc > 2 && !fits(u, { ...k, gc })) gc--;
  return gc;
}

/** Largest integer unit in [MIN_UNIT, max] that satisfies `fits` (monotone). */
function fitUnit(max: number, fits: (u: number) => boolean): number {
  for (let u = Math.floor(max); u > MIN_UNIT; u--) if (fits(u)) return u;
  return MIN_UNIT;
}

function zoomBox(safe: Box, maxW: number): Box {
  let zoomW = Math.min(maxW, 420);
  if (zoomW * CARD_RATIO > safe.height * 0.92) zoomW = (safe.height * 0.92) / CARD_RATIO;
  zoomW = Math.round(zoomW);
  const zoomH = Math.round(zoomW * CARD_RATIO);
  return box(safe.x + Math.round((safe.width - zoomW) / 2), safe.y + Math.round((safe.height - zoomH) / 2), zoomW, zoomH);
}

function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return box(x, y, Math.max(a.x + a.width, b.x + b.width) - x, Math.max(a.y + a.height, b.y + b.height) - y);
}

function sideRows(viewer: Side, corp: CorpBand, rig: RigBand, top: Omit<SideRow, 'deck' | 'discard'>, bottom: Omit<SideRow, 'deck' | 'discard'>): { top: SideRow; bottom: SideRow } {
  const rd = corp.servers.find((s) => s.id === 'rd')!.root!;
  const archives = corp.servers.find((s) => s.id === 'archives')!.root!;
  const piles = (side: Side) => (side === 'corp' ? { deck: rd, discard: archives } : { deck: rig.stack, discard: rig.heap });
  const opponent: Side = viewer === 'corp' ? 'runner' : 'corp';
  return { top: { ...top, ...piles(opponent) }, bottom: { ...bottom, ...piles(viewer) } };
}

function sizeKey(vw: number, vh: number, insets: Insets, u: number, hand: Box, cardW: number): string {
  return [vw, vh, insets.top, insets.right, insets.bottom, insets.left, u, cardW, hand.x, hand.y, hand.width, hand.height].join(',');
}

export function computeLayout(width: number, height: number, insetsIn?: Partial<Insets>, opts: LayoutOptions = {}): BoardLayout {
  const vw = Math.max(1, Math.floor(width));
  const vh = Math.max(1, Math.floor(height));
  const insets = sanitize(insetsIn);
  const safe = box(
    Math.ceil(insets.left),
    Math.ceil(insets.top),
    Math.max(1, Math.floor(vw - insets.right) - Math.ceil(insets.left)),
    Math.max(1, Math.floor(vh - insets.bottom) - Math.ceil(insets.top)),
  );
  const viewer = opts.viewer ?? 'corp';
  const shape = opts.shape ?? EMPTY_SHAPE;
  const landscape = vh <= 500 && vw > vh;
  return landscape ? landscapeLayout(vw, vh, insets, safe, viewer, shape) : portraitLayout(vw, vh, insets, safe, viewer, shape);
}

function landscapeLayout(vw: number, vh: number, insets: Insets, safe: Box, viewer: Side, shape: BoardShape): BoardLayout {
  const sh = safe.height;
  const s = clamp(sh / 390, 0.8, 1.25);
  const pad = Math.max(3, Math.round(4 * s));
  const k: Gaps = { g: 3, gc: Math.max(4, Math.round(5 * s)), labelH: Math.max(10, Math.round(11 * s)) };
  const vgap = 3;
  const railW = clamp(Math.round(safe.width * 0.165), 104, 168);
  const railGap = Math.max(5, Math.round(6 * s));
  const bx = safe.x + pad;
  const bw = safe.width - 2 * pad - railW - railGap;
  const railX = bx + bw + railGap;
  const top = safe.y + pad;
  const bottom = safe.y + sh - pad;
  const availH = bottom - top;
  const headerH = Math.max(14, Math.round(16 * s));
  const ice = iceCap(shape);
  const sizing = sizingServers(shape);
  const rigN = Math.max(RESERVED.rig, shape.rig);

  // Unit: header + corp band + rig band + hand (hand cards at least the unit) fit the height,
  // and both bands fit the width.
  const fixedH = headerH + 3 * vgap;
  const busy = sizingServers(EMPTY_SHAPE);
  const heightOk = (u: number, ic: number) => fixedH + corpHeight(u, ic, k) + 2 * cardH(u) <= availH;
  const fit = fitTable(
    72,
    k,
    (u, kk) => heightOk(u, ice) && corpWidth(sizing, u, kk) <= bw && rigWidth(rigN, u, kk) <= bw,
    (u) => heightOk(u, RESERVED.icePerServer) && corpWidth(busy, u, k) <= bw && rigWidth(RESERVED.rig, u, k) <= bw,
  );
  const u = fit.u;
  k.gc = fit.k.gc;
  k.fan = fit.k.fan;
  const uh = cardH(u);
  const corpH = corpHeight(u, ice, k);
  // Spare height makes the hand bigger (up to 1.25x).
  const spare = availH - fixedH - corpH - uh;
  const cardW = Math.max(u, Math.min(Math.round(u * 1.25), Math.floor(spare / CARD_RATIO)));
  const cardHt = Math.floor(cardW * CARD_RATIO);
  const handArea = box(bx, bottom - cardHt, bw, cardHt);

  const topBandY = top + headerH + vgap;
  const corpTop = viewer === 'runner';
  const topBandH = corpTop ? corpH : uh;
  const bottomBandH = corpTop ? uh : corpH;
  const bottomBandY = handArea.y - vgap - bottomBandH;
  const corp = layoutCorpBand(bx, corpTop ? topBandY : bottomBandY, bw, corpH, u, k, corpTop ? 'down' : 'up', shape);
  const rig = layoutRigBand(bx, corpTop ? bottomBandY : topBandY, bw, u, k, shape.rig);

  // Opponent header: name + hand count on the left, credits / clicks chips on the right.
  const chipW = Math.max(52, Math.round(60 * s));
  const oppClicks = box(bx + bw - chipW, top, chipW, headerH);
  const oppCredits = box(oppClicks.x - k.g - chipW, top, chipW, headerH);
  const oppLabel = box(bx, top, oppCredits.x - k.gc - bx, headerH);

  // Rail, top down: banner, help / Play, hint ... and bottom up: End turn, clicks, credits, name.
  const rg = 4;
  const pillH = clamp(Math.round(44 * s), MIN_TOUCH, 52);
  const banner = box(railX, top, railW, Math.max(24, Math.round(28 * s)));
  const endTurn = box(railX, bottom - pillH, railW, pillH);
  const clicks = box(railX, endTurn.y - rg - pillH, railW, pillH);
  const credits = box(railX, clicks.y - rg - pillH, railW, pillH);
  const railLabel = box(railX, credits.y - rg - Math.max(11, Math.round(12 * s)), railW, Math.max(11, Math.round(12 * s)));
  // Help / Play fill the rail between the banner and the viewer's name. A hint
  // (a short-lived toast) uses the help text's room below the Play button and
  // hides the help text while it shows, so long hints wrap at a readable size
  // instead of shrinking into a short slot (QA-S2-1).
  const subY = banner.y + banner.height + rg;
  const sub = box(railX, subY, railW, Math.max(0, railLabel.y - rg - subY));
  const action = box(railX, subY, railW, Math.min(sub.height, pillH));
  const hintY = action.y + action.height + rg;
  const hintArea = box(railX, hintY, railW, Math.max(0, sub.y + sub.height - hintY));

  const topRegion = union(box(bx, top, bw, headerH), box(bx, topBandY, bw, topBandH));
  const { top: topRow, bottom: bottomRow } = sideRows(
    viewer,
    corp,
    rig,
    { row: topRegion, label: oppLabel, credits: oppCredits, clicks: oppClicks },
    { row: box(bx, bottomBandY, bw, bottomBandH), label: railLabel, credits, clicks },
  );

  const goH = Math.min(availH, Math.round(150 * s));
  const goW = Math.min(bw, Math.round(360 * s));
  const gameOver = box(bx + Math.round((bw - goW) / 2), top + Math.round((availH - goH) / 2), goW, goH);
  return {
    mode: 'landscape',
    viewport: { width: vw, height: vh },
    insets,
    safe,
    board: box(bx, top, bw, availH),
    scale: s,
    pad,
    viewer,
    top: topRow,
    bottom: bottomRow,
    corp,
    rig,
    unit: { width: u, height: uh },
    banner,
    sub,
    action,
    hintArea,
    endTurn,
    gameOver,
    handArea,
    card: { width: cardW, height: cardHt },
    zoom: zoomBox(safe, safe.width * 0.8),
    sizeKey: sizeKey(vw, vh, insets, u, handArea, cardW),
  };
}

function portraitLayout(vw: number, vh: number, insets: Insets, safe: Box, viewer: Side, shape: BoardShape): BoardLayout {
  // Portrait column: full width on narrow screens, a phone-shaped column on desktop.
  const boardW = Math.min(safe.width, Math.max(REF_W, Math.round(safe.height * 0.8)));
  const boardX = safe.x + Math.floor((safe.width - boardW) / 2);
  const s = clamp(Math.min(boardW / REF_W, safe.height / REF_H), 0.5, 1.5);
  const pad = Math.round(12 * s);
  const gap = Math.round(8 * s);
  const k: Gaps = { g: 3, gc: Math.max(4, Math.round(6 * s)), labelH: Math.max(10, Math.round(12 * s)) };
  const board = box(boardX, safe.y, boardW, safe.height);
  const left = boardX + pad;
  const avail = boardW - 2 * pad;

  // Rows: name + hand count, then the credits and clicks pills.
  const labelH = Math.max(12, Math.round(18 * s));
  const labelGap = Math.round(6 * s);
  const pillH = Math.max(MIN_TOUCH, Math.round(52 * s));
  const rowH = labelH + labelGap + pillH;
  const pillW = Math.max(MIN_TOUCH * 2, Math.min(Math.round(124 * s), Math.floor((avail - gap) / 2)));
  const row = (y: number) => ({
    row: box(boardX, y, boardW, rowH),
    label: box(left, y, avail, labelH),
    credits: box(left, y + labelH + labelGap, pillW, pillH),
    clicks: box(left + pillW + gap, y + labelH + labelGap, pillW, pillH),
  });

  const cg = Math.round(4 * s);
  const bannerH = Math.max(14, Math.round(22 * s));
  const subH = Math.max(MIN_TOUCH, Math.round(40 * s));
  const barH = Math.max(MIN_TOUCH, Math.round(48 * s));
  const controlH = bannerH + subH + barH + 2 * cg;
  const ice = iceCap(shape);
  const sizing = sizingServers(shape);
  const rigN = Math.max(RESERVED.rig, shape.rig);
  // Up to 7 hand cards side by side; more overlap (44px of each still showing).
  const maxCardW = Math.max(MIN_TOUCH, Math.floor((avail - 6 * gap) / 7));
  const handFixed = 2 * pad + 2 * rowH + 3 * gap + controlH + 2 * gap;
  const bandsFit = (u: number, cw: number) => handFixed + Math.floor(cw * CARD_RATIO) + corpHeight(u, ice, k) + cardH(u) <= safe.height;

  // Hand cards one row, like the reference phone's; the bands get the unit that fits,
  // then spare height grows the hand cards.
  const cardW0 = Math.min(maxCardW, Math.max(MIN_TOUCH, Math.floor(84 * s)));
  const busy = sizingServers(EMPTY_SHAPE);
  const fit = fitTable(
    Math.round(72 * s),
    k,
    (u, kk) => bandsFit(u, cardW0) && corpWidth(sizing, u, kk) <= avail && rigWidth(rigN, u, kk) <= avail,
    (u) => handFixed + Math.floor(cardW0 * CARD_RATIO) + corpHeight(u, RESERVED.icePerServer, k) + cardH(u) <= safe.height && corpWidth(busy, u, k) <= avail && rigWidth(RESERVED.rig, u, k) <= avail,
  );
  const u = fit.u;
  k.gc = fit.k.gc;
  k.fan = fit.k.fan;
  let cardW = cardW0;
  const capW = Math.min(maxCardW, Math.round(110 * s));
  while (cardW < capW && bandsFit(u, cardW + 1)) cardW++;
  const cardHt = Math.floor(cardW * CARD_RATIO);
  const uh = cardH(u);

  const topRow = row(safe.y + pad);
  const handArea = box(left, safe.y + safe.height - pad - cardHt, avail, cardHt);
  const bottomRow = row(handArea.y - gap - rowH);
  const centerY = topRow.row.y + rowH + gap;
  const center = box(left, centerY, avail, Math.max(0, bottomRow.row.y - gap - centerY));

  const corpH = corpHeight(u, ice, k);
  const corpTop = viewer === 'runner';
  const topBandH = corpTop ? corpH : uh;
  const bottomBandH = corpTop ? uh : corpH;
  const topBandY = center.y;
  const bottomBandY = center.y + center.height - bottomBandH;
  const corp = layoutCorpBand(left, corpTop ? topBandY : bottomBandY, avail, corpH, u, k, corpTop ? 'down' : 'up', shape);
  const rig = layoutRigBand(left, corpTop ? bottomBandY : topBandY, avail, u, k, shape.rig);

  // Control strip, centered between the bands.
  const midTop = topBandY + topBandH + gap;
  const midH = bottomBandY - gap - midTop;
  const cy = midTop + Math.max(0, Math.round((midH - controlH) / 2));
  const banner = box(left, cy, avail, bannerH);
  const sub = box(left, banner.y + bannerH + cg, avail, subH);
  const endW = Math.max(110, Math.round(132 * s));
  const action = box(left + avail - endW, sub.y, endW, subH);
  const barY = sub.y + subH + cg;
  const endTurn = box(left + avail - endW, barY, endW, barH);
  const hintArea = box(left, barY, endTurn.x - gap - left, barH);

  const { top, bottom } = sideRows(
    viewer,
    corp,
    rig,
    { ...topRow, row: union(topRow.row, box(boardX, topBandY, boardW, topBandH)) },
    { ...bottomRow, row: union(bottomRow.row, box(boardX, bottomBandY, boardW, bottomBandH)) },
  );

  const goH = Math.min(center.height, Math.round(140 * s));
  const gameOver = box(center.x, center.y + Math.round((center.height - goH) / 2), center.width, goH);
  return {
    mode: 'portrait',
    viewport: { width: vw, height: vh },
    insets,
    safe,
    board,
    scale: s,
    pad,
    viewer,
    top,
    bottom,
    corp,
    rig,
    unit: { width: u, height: uh },
    banner,
    sub,
    action,
    hintArea,
    endTurn,
    gameOver,
    handArea,
    card: { width: cardW, height: cardHt },
    zoom: zoomBox(safe, boardW * 0.8),
    sizeKey: sizeKey(vw, vh, insets, u, handArea, cardW),
  };
}

/**
 * Positions for `count` hand cards inside the hand area. Side by side with
 * no overlap while they fit (wrapping into more rows if the area is tall
 * enough), then overlapping with at least MIN_TOUCH of each card showing;
 * a one-row hand area overlaps further only when even that does not fit.
 */
export function handSlots(layout: BoardLayout, count: number): Box[] {
  if (count <= 0) return [];
  const { handArea, card } = layout;
  const gap = Math.round(8 * layout.scale);
  const minStep = Math.max(MIN_TOUCH, Math.round(card.width * 0.6));
  const perRowFlat = Math.max(1, Math.floor((handArea.width + gap) / (card.width + gap)));
  const rowsFlat = Math.max(1, Math.floor((handArea.height + gap) / (card.height + gap)));
  const perRowMax = Math.max(1, 1 + Math.floor((handArea.width - card.width) / minStep));
  let rows: number;
  if (count <= perRowFlat * rowsFlat) rows = Math.ceil(count / perRowFlat);
  else if (count <= perRowMax * rowsFlat || rowsFlat === 1) rows = rowsFlat;
  else rows = Math.ceil(count / perRowMax);
  const perRow = Math.ceil(count / rows);
  const rowStep = rows === 1 ? 0 : Math.min(card.height + gap, (handArea.height - card.height) / (rows - 1));
  const blockH = card.height + rowStep * (rows - 1);
  const top = handArea.y + (handArea.height - blockH) / 2;

  const out: Box[] = [];
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(perRow, count - r * perRow);
    const step = inRow === 1 ? 0 : Math.min(card.width + gap, (handArea.width - card.width) / (inRow - 1));
    const rowW = card.width + step * (inRow - 1);
    const left = handArea.x + (handArea.width - rowW) / 2;
    for (let i = 0; i < inRow; i++) {
      out.push(box(left + step * i, top + rowStep * r, card.width, card.height));
    }
  }
  return out;
}
