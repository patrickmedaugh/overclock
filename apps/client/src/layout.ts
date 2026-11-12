// Pure layout math: viewport size + safe-area insets (+ who is looking) in,
// boxes (CSS pixels) out. No Pixi or DOM here so it can be unit tested for
// "nothing cut off, overlapping, too small to tap, or under the notch /
// gesture bar" across many screen shapes and board states.
//
// The layout is viewer-relative: `bottom` is the player looking at the screen
// (the active player in hot-seat), `top` is their opponent.
//
// Two arrangements:
// - `landscape` (phones held sideways: height <= 500 and wider than tall):
//   a right rail with both sides' counters, the banner, help and End turn;
//   the main area has the opponent's band on top, the viewer's band below it
//   and a one-row hand strip at the bottom. The Corp's band is its server
//   columns (the R&D and Archives columns double as the Corp's deck and
//   discard pile); the Runner's band starts with its Stack and Heap piles,
//   then its installed cards (the rig) and the Install spot.
// - `column` (desktop windows, tablets, and upright phones under the "turn
//   sideways" prompt): the Sprint 1 column of rows, unchanged, with the
//   installed cards in the center band. On a wide window the hand is one
//   row across the bottom, which leaves the center band room for servers.
//
// Overflow beyond the Sprint 2 busy board (3 remote servers with 2 ICE each,
// 4 Runner cards) SHRINKS, it never scrolls: more servers than fit narrow
// the remote columns; more ICE than fit overlap in their column; more rig
// cards than fit overlap in the row; more hand cards than fit overlap.
import type { Side } from '@overclock/engine';
import type { Box, Insets } from './hook-types';

export type LayoutMode = 'landscape' | 'column';
export type Pos = 'top' | 'bottom';

export interface SideRow {
  /** Whole row band (landscape: the side's band in the main area). */
  row: Box;
  /** Side label with the hand count ("RUNNER · 5 cards in hand"). */
  label: Box;
  credits: Box;
  clicks: Box;
  /** Landscape Corp: the Archives column's pile. */
  discard: Box;
  /** Landscape Corp: the R&D column's pile. */
  deck: Box;
}

export interface BoardLayout {
  mode: LayoutMode;
  /** The side drawn at the bottom (the layout's bands differ for Corp and Runner). */
  viewer: Side;
  viewport: { width: number; height: number };
  insets: Insets;
  /** Everything except the backdrop is laid out inside this rect. */
  safe: Box;
  /** Column: the play column. Landscape: the main area (left of the rail). */
  board: Box;
  /** Global scale (column: relative to the 390x844 reference; landscape: to a 390px-tall screen). */
  scale: number;
  pad: number;
  gap: number;
  /** Opponent's row. */
  top: SideRow;
  /** Viewer's row (the only interactive one). */
  bottom: SideRow;
  /** Column: space between the two rows. Landscape: the strip between the two bands. */
  center: Box;
  /** Landscape: the right rail. Null in column mode. */
  rail: Box | null;
  /** Where each side's installed cards go (the Corp's servers or the Runner's rig). */
  zones: Record<Pos, Box>;
  /** Installed-card drawing size (upright; ICE is drawn rotated: height x width). */
  installed: { width: number; height: number };
  /** Server column width before any shrinking. */
  colW: number;
  /** Height of the label line in a zone (server names, "Memory 2/4"). */
  zoneLabel: number;
  /** Gap between server columns and between rig cards. */
  zoneGap: number;
  /** True when the R&D / HQ / Archives columns hold the Corp's piles (landscape). */
  centralPiles: boolean;
  /** "TURN 3 · CORP · 2 clicks left". */
  banner: Box;
  /** Help line, or the discard picker's "Discard 2". */
  sub: Box;
  /** Where the transient hint toast sits (never over End turn). */
  hintArea: Box;
  /** End turn button; also the discard picker's Confirm button. */
  endTurn: Box;
  /** Game-over panel. */
  gameOver: Box;
  handArea: Box;
  card: { width: number; height: number };
  zoom: Box;
}

/** Minimum touch target (CSS px), per the client charter. */
export const MIN_TOUCH = 44;
/** Card aspect ratio (height / width). */
export const CARD_RATIO = 1.4;
/** Server columns that fit without shrinking: HQ, R&D, Archives, 3 remotes and the New server spot. */
export const FIT_COLUMNS = 7;
/** ICE per server that fit without overlapping. */
export const FIT_ICE = 2;
/** Gap between stacked ICE. */
const ICE_GAP = 3;

const REF_W = 390;
const REF_H = 844;

function box(x: number, y: number, width: number, height: number): Box {
  return { x, y, width, height };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function bottomOf(b: Box): number {
  return b.y + b.height;
}

function rightOf(b: Box): number {
  return b.x + b.width;
}

function sanitize(insets: Partial<Insets> | undefined): Insets {
  const v = (n: number | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);
  return { top: v(insets?.top), right: v(insets?.right), bottom: v(insets?.bottom), left: v(insets?.left) };
}

function zoomBox(safe: Box, maxW: number, maxHFrac: number): Box {
  let zoomW = Math.min(maxW, 340);
  if (zoomW * CARD_RATIO > safe.height * maxHFrac) zoomW = (safe.height * maxHFrac) / CARD_RATIO;
  zoomW = Math.round(zoomW);
  const zoomH = Math.round(zoomW * CARD_RATIO);
  return box(safe.x + Math.round((safe.width - zoomW) / 2), safe.y + Math.round((safe.height - zoomH) / 2), zoomW, zoomH);
}

/** True for the sideways-phone arrangement. */
export function isLandscape(width: number, height: number): boolean {
  return height <= 500 && width > height;
}

export function computeLayout(width: number, height: number, insetsIn?: Partial<Insets>, viewer: Side = 'corp'): BoardLayout {
  const vw = Math.max(1, Math.floor(width));
  const vh = Math.max(1, Math.floor(height));
  const insets = sanitize(insetsIn);
  const safe = box(
    Math.ceil(insets.left),
    Math.ceil(insets.top),
    Math.max(1, Math.floor(vw - insets.right) - Math.ceil(insets.left)),
    Math.max(1, Math.floor(vh - insets.bottom) - Math.ceil(insets.top)),
  );
  return isLandscape(vw, vh) ? landscapeLayout(vw, vh, insets, safe, viewer) : columnLayout(vw, vh, insets, safe, viewer);
}

/** Which band (top / bottom) a side's installed cards are drawn in. */
export function posOf(layout: BoardLayout, side: Side): Pos {
  return side === layout.viewer ? 'bottom' : 'top';
}

// ---- shared sizing -----------------------------------------------------------

const rootH = (iw: number) => Math.floor(iw * CARD_RATIO);
/** One ICE cell: at least a touch target tall. */
const iceCell = (iw: number) => Math.max(MIN_TOUCH, iw);
/** Corp band: label line, root card, FIT_ICE ICE. */
function corpNeed(iw: number, zl: number, gap: number): number {
  return zl + gap + rootH(iw) + ICE_GAP + FIT_ICE * (iceCell(iw) + ICE_GAP);
}

// ---- column (desktop / tablet / upright phone) ---------------------------------

function sideRow(board: Box, top: number, s: number, pad: number): SideRow {
  const labelH = Math.max(12, Math.round(18 * s));
  const labelGap = Math.round(6 * s);
  // The deck is a tap target: keep it at least MIN_TOUCH wide.
  const deckH = Math.max(Math.round(118 * s) - labelH - labelGap, Math.ceil(MIN_TOUCH * CARD_RATIO));
  const deckW = Math.max(MIN_TOUCH, Math.round(deckH / CARD_RATIO));
  const rowH = labelH + labelGap + deckH;
  const gap = Math.round(10 * s);
  const left = board.x + pad;
  const right = board.x + board.width - pad;
  const bodyTop = top + labelH + labelGap;
  // Pills shrink (never below 2x44 wide) so they always clear the two piles.
  const pillRoom = right - deckW - gap - deckW - gap - left;
  const pillW = Math.max(MIN_TOUCH * 2, Math.min(Math.round(104 * s), Math.floor((pillRoom - gap) / 2)));
  const pillH = Math.min(deckH, Math.max(MIN_TOUCH, Math.round(52 * s)));
  const pillY = bodyTop + Math.round((deckH - pillH) / 2);
  return {
    row: box(board.x, top, board.width, rowH),
    label: box(left, top, right - left, labelH),
    credits: box(left, pillY, pillW, pillH),
    clicks: box(left + pillW + gap, pillY, pillW, pillH),
    discard: box(right - deckW - gap - deckW, bodyTop, deckW, deckH),
    deck: box(right - deckW, bodyTop, deckW, deckH),
  };
}

function columnLayout(vw: number, vh: number, insets: Insets, safe: Box, viewer: Side): BoardLayout {
  // Portrait column: full width on phones, a phone-shaped column on desktop.
  const boardW = Math.min(safe.width, Math.max(REF_W, Math.round(safe.height * 0.62)));
  const boardX = safe.x + Math.floor((safe.width - boardW) / 2);
  const s = Math.max(0.5, Math.min(boardW / REF_W, safe.height / REF_H, 1.5));
  const pad = Math.round(12 * s);
  const gap = Math.round(8 * s);
  const board = box(boardX, safe.y, boardW, safe.height);

  const avail = boardW - 2 * pad;
  const cardW = Math.max(MIN_TOUCH, Math.floor(Math.min((avail - 4 * gap) / 5, 84 * s)));
  const cardH = Math.floor(cardW * CARD_RATIO);
  // A wide window (desktop) lays the hand out in one row across the bottom,
  // up to 10 cards side by side; the center band gets the room for servers.
  const wide = safe.width >= boardW * 1.6 && safe.width > safe.height;
  const handW = wide ? Math.min(safe.width - 2 * pad, Math.max(avail, 10 * (cardW + gap) - gap)) : avail;
  const handH = wide ? cardH : cardH * 2 + gap;

  const top = sideRow(board, safe.y + pad, s, pad);
  const handTop = safe.y + safe.height - pad - handH;
  const rowH = top.row.height;
  const bottom = sideRow(board, handTop - gap - rowH, s, pad);
  const centerTop = top.row.y + rowH + gap;
  const center = box(boardX + pad, centerTop, avail, Math.max(0, bottom.row.y - gap - centerTop));
  const handArea = box(safe.x + Math.floor((safe.width - handW) / 2), handTop, handW, handH);

  // Center band: banner and help line at the top, action bar at the bottom.
  const cGap = Math.round(10 * s);
  const banner = box(center.x, center.y + cGap, center.width, Math.max(14, Math.round(22 * s)));
  const sub = box(center.x, banner.y + banner.height + Math.round(4 * s), center.width, Math.max(24, Math.round(40 * s)));
  const barH = Math.max(MIN_TOUCH, Math.round(48 * s));
  const barY = center.y + center.height - cGap - barH;
  const endW = Math.max(110, Math.round(132 * s));
  const endTurn = box(center.x + center.width - endW, barY, endW, barH);
  const hintArea = box(center.x, barY, endTurn.x - gap - center.x, barH);
  const goH = Math.min(center.height, Math.round(140 * s));
  const gameOver = box(center.x, center.y + Math.round((center.height - goH) / 2), center.width, goH);

  // Installed cards: between the help line and the action bar, opponent's
  // zone above the viewer's. As wide as the hand on a wide window.
  const zl = Math.max(10, Math.round(12 * s));
  const zGap = Math.max(4, Math.round(6 * s));
  const zTop = sub.y + sub.height + zGap;
  const zRoom = Math.max(0, barY - zGap - zTop);
  const zMax = wide ? handW : avail;
  const fitColW = Math.floor((zMax - (FIT_COLUMNS - 1) * zGap) / FIT_COLUMNS);
  const runnerNeed = (iw: number) => zl + zGap + rootH(iw);
  let iw = Math.max(8, Math.min(Math.floor(fitColW / CARD_RATIO), Math.round(cardW * 0.75)));
  while (iw > 8 && corpNeed(iw, zl, zGap) + zGap + runnerNeed(iw) > zRoom) iw--;
  // Only as wide as the columns need (sideways ICE plus a margin), centered.
  const colW = Math.min(fitColW, Math.max(MIN_TOUCH, Math.round(iw * CARD_RATIO) + 2 * zGap));
  const zW = Math.max(avail, FIT_COLUMNS * colW + (FIT_COLUMNS - 1) * zGap);
  const zX = safe.x + Math.floor((safe.width - zW) / 2);
  const runnerH = Math.min(zRoom, runnerNeed(iw));
  const corpH = Math.max(0, zRoom - zGap - runnerH);
  const corpPos: Pos = viewer === 'corp' ? 'bottom' : 'top';
  const topH = corpPos === 'top' ? corpH : runnerH;
  const zones: Record<Pos, Box> = {
    top: box(zX, zTop, zW, topH),
    bottom: box(zX, zTop + topH + zGap, zW, zRoom - topH - zGap),
  };

  return {
    mode: 'column',
    viewer,
    viewport: { width: vw, height: vh },
    insets,
    safe,
    board,
    scale: s,
    pad,
    gap,
    top,
    bottom,
    center,
    rail: null,
    zones,
    installed: { width: iw, height: rootH(iw) },
    colW,
    zoneLabel: zl,
    zoneGap: zGap,
    centralPiles: false,
    banner,
    sub,
    hintArea,
    endTurn,
    gameOver,
    handArea,
    card: { width: cardW, height: cardH },
    zoom: zoomBox(safe, boardW * 0.8, 0.82),
  };
}

// ---- landscape (phone held sideways) ----------------------------------------

function landscapeLayout(vw: number, vh: number, insets: Insets, safe: Box, viewer: Side): BoardLayout {
  const s = clamp(safe.height / 390, 0.8, 1.2);
  // At least the pile glow (about 4px), so no glow reaches a notch or gesture bar.
  const pad = 4;
  const gap = 4;
  const inner = box(safe.x + pad, safe.y + pad, safe.width - 2 * pad, safe.height - 2 * pad);

  // Right rail: counters, banner, help, End turn.
  const railW = clamp(Math.round(safe.width * 0.17), 100, 140);
  const rail = box(rightOf(inner) - railW, inner.y, railW, inner.height);
  const main = box(inner.x, inner.y, rail.x - gap - inner.x, inner.height);

  // Card sizes: the busy board's 7 columns fit the width; a Corp band (root
  // card + 2 ICE), a Runner band (piles and rig) and the hand fit the height.
  const zl = Math.max(10, Math.round(11 * s));
  const colW = Math.floor((main.width - (FIT_COLUMNS - 1) * gap) / FIT_COLUMNS);
  const pileW = (iw: number) => Math.max(MIN_TOUCH, iw);
  const runnerNeed = (iw: number) => zl + gap + rootH(pileW(iw));
  const handOf = (iw: number) => Math.max(MIN_TOUCH, Math.min(iw + 4, 60));
  let iw = Math.max(16, Math.min(Math.floor(colW / CARD_RATIO), 64));
  while (iw > 16 && corpNeed(iw, zl, gap) + runnerNeed(iw) + 2 * gap + rootH(handOf(iw)) > main.height) iw--;
  const handW = handOf(iw);
  const handH = rootH(handW);
  const handArea = box(main.x, bottomOf(main) - handH, main.width, handH);
  const bandsH = Math.max(0, handArea.y - gap - main.y);
  // The Runner band gets what it needs; the Corp band gets the rest (more ICE room).
  const runnerH = Math.min(bandsH, runnerNeed(iw));
  const corpH = Math.max(0, bandsH - gap - runnerH);
  const corpPos: Pos = viewer === 'corp' ? 'bottom' : 'top';
  const topH = corpPos === 'top' ? corpH : runnerH;
  const bands: Record<Pos, Box> = {
    top: box(main.x, main.y, main.width, topH),
    bottom: box(main.x, main.y + topH + gap, main.width, bandsH - topH - gap),
  };

  // Rail: [opponent label, counters] banner, help ... End turn [viewer label, counters].
  const lineH = Math.max(10, Math.round(11 * s));
  const labelH = lineH * 2 + 2;
  const pillH = MIN_TOUCH;
  const pillW = Math.floor((railW - gap) / 2);
  const railBlock = (y: number): Pick<SideRow, 'label' | 'credits' | 'clicks'> => ({
    label: box(rail.x, y, railW, labelH),
    credits: box(rail.x, y + labelH + 2, pillW, pillH),
    clicks: box(rail.x + railW - pillW, y + labelH + 2, pillW, pillH),
  });
  const blockH = labelH + 2 + pillH;
  const topBlock = railBlock(rail.y);
  const bottomBlock = railBlock(bottomOf(rail) - blockH);
  const endH = Math.max(MIN_TOUCH, Math.round(46 * Math.min(s, 1.1)));
  const endTurn = box(rail.x, bottomBlock.label.y - 2 * gap - endH, railW, endH);
  const bannerH = Math.max(24, Math.round(28 * s));
  const banner = box(rail.x, bottomOf(topBlock.credits) + 2 * gap, railW, bannerH);
  const subY = bottomOf(banner) + gap;
  const sub = box(rail.x, subY, railW, Math.max(1, endTurn.y - gap - subY));

  // Piles. Runner: Stack and Heap at the left of its band, under the label line.
  // Corp: R&D and Archives columns (centrals sit at fixed columns 0..2).
  const runnerPos: Pos = corpPos === 'top' ? 'bottom' : 'top';
  const rBand = bands[runnerPos];
  const pw = pileW(iw);
  const pileY = rBand.y + zl + gap;
  const runnerPiles = {
    deck: box(rBand.x, pileY, pw, rootH(pw)),
    discard: box(rBand.x + pw + gap, pileY, pw, rootH(pw)),
  };
  const cBand = bands[corpPos];
  const colX = (i: number) => cBand.x + i * (colW + gap);
  const rootY = corpPos === 'top' ? cBand.y + zl + gap : bottomOf(cBand) - zl - gap - rootH(iw);
  const cpw = Math.min(colW, pw);
  const pileIn = (i: number) => box(colX(i) + Math.floor((colW - cpw) / 2), rootY, cpw, rootH(iw));
  const corpPiles = { deck: pileIn(1), discard: pileIn(2) };

  const row = (side: Side, pos: Pos): SideRow => {
    const block = pos === 'top' ? topBlock : bottomBlock;
    const piles = side === 'corp' ? corpPiles : runnerPiles;
    return { row: bands[pos], ...block, ...piles };
  };
  const opponent: Side = viewer === 'corp' ? 'runner' : 'corp';

  // Hint toast: over the main area, centered on the line between the bands
  // (it never takes taps, so it may cover cards for its second on screen).
  const hintH = Math.max(32, Math.round(34 * s));
  const hintW = Math.min(main.width - 2 * gap, 360);
  const seamY = bottomOf(bands.top) + gap / 2;
  const hintArea = box(main.x + Math.round((main.width - hintW) / 2), Math.round(seamY - hintH / 2), hintW, hintH);
  const goW = Math.min(main.width, 420);
  const goH = Math.min(main.height, Math.round(150 * s));
  const gameOver = box(main.x + Math.round((main.width - goW) / 2), main.y + Math.round((main.height - goH) / 2), goW, goH);

  return {
    mode: 'landscape',
    viewer,
    viewport: { width: vw, height: vh },
    insets,
    safe,
    board: main,
    scale: s,
    pad,
    gap,
    top: row(opponent, 'top'),
    bottom: row(viewer, 'bottom'),
    center: box(main.x, bottomOf(bands.top), main.width, gap),
    rail,
    zones: bands,
    installed: { width: iw, height: rootH(iw) },
    colW,
    zoneLabel: zl,
    zoneGap: gap,
    centralPiles: true,
    banner,
    sub,
    hintArea,
    endTurn,
    gameOver,
    handArea,
    card: { width: handW, height: handH },
    zoom: zoomBox(safe, safe.width * 0.8, 0.94),
  };
}

// ---- hand ---------------------------------------------------------------------

/**
 * Positions for `count` hand cards inside the hand area (see comments below
 * for the wrap/overlap order).
 */
export function handSlots(layout: BoardLayout, count: number): Box[] {
  if (count <= 0) return [];
  const { handArea, card } = layout;
  const gap = layout.gap; // same gap computeLayout sized cards with
  const minStep = Math.max(MIN_TOUCH, Math.round(card.width * 0.6));
  // Prefer side-by-side cards with no overlap, wrapping into as many rows as
  // fit the hand area; only then overlap cards (keeping MIN_TOUCH visible),
  // and only past that stack rows on top of each other. A one-row strip
  // overlaps further instead.
  const perRowFlat = Math.max(1, Math.floor((handArea.width + gap) / (card.width + gap)));
  const rowsFlat = Math.max(1, Math.floor((handArea.height + gap) / (card.height + gap)));
  const perRowMax = Math.max(1, 1 + Math.floor((handArea.width - card.width) / minStep));
  let rows: number;
  if (count <= perRowFlat * rowsFlat) rows = Math.ceil(count / perRowFlat);
  else if (count <= perRowMax * rowsFlat) rows = rowsFlat;
  else if (rowsFlat === 1) rows = 1;
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

// ---- installed cards ------------------------------------------------------------

/** Counts that decide a server column's geometry. */
export interface ServerShape {
  readonly id: string;
  readonly ice: number;
  readonly content: number;
}

export interface ColumnGeom {
  /** Server id, or 'new' for the New server spot. */
  id: string;
  /** The whole column (the install target when it is lit). */
  column: Box;
  /** Server name line. */
  label: Box;
  /** Root cell (content cards; in landscape the central piles). */
  root: Box;
  /** Content cards: tap / hold boxes (never overlapping) and drawn bounds. */
  content: { hit: Box; draw: Box }[];
  /** ICE, index 0 innermost: tap / hold cells and drawn (rotated) bounds. */
  ice: { hit: Box; draw: Box }[];
  /** Direction ICE stacks from the root: -1 up the screen, +1 down. */
  dir: 1 | -1;
}

/**
 * Server columns for `servers` (hq, rd, archives, remotes...) plus the New
 * server spot (id 'new'), in the Corp's band. Centrals keep fixed columns;
 * remotes shrink when more than fit.
 */
export function corpColumns(layout: BoardLayout, servers: readonly ServerShape[]): ColumnGeom[] {
  const band = layout.zones[posOf(layout, 'corp')];
  const up = posOf(layout, 'corp') === 'bottom';
  const { colW, zoneLabel: zl, zoneGap: gap, installed } = layout;
  const iw = installed.width;
  const rh = installed.height;
  const shapes = [...servers, { id: 'new', ice: 0, content: 0 }];
  const nCentral = Math.min(3, shapes.length);
  const restX = band.x + nCentral * (colW + gap);
  const nRest = shapes.length - nCentral;
  const restW = rightOf(band) - restX;
  const restCol = nRest > 0 ? Math.min(colW, Math.floor((restW - (nRest - 1) * gap) / nRest)) : colW;

  const out: ColumnGeom[] = [];
  shapes.forEach((sh, i) => {
    const central = i < nCentral;
    const cw = central ? colW : restCol;
    const x = central ? band.x + i * (colW + gap) : restX + (i - nCentral) * (restCol + gap);
    const column = box(x, band.y, cw, band.height);
    const label = up ? box(x, bottomOf(band) - zl, cw, zl) : box(x, band.y, cw, zl);
    const root = up ? box(x, label.y - gap - rh, cw, rh) : box(x, bottomOf(label) + gap, cw, rh);
    const dw = Math.min(iw, cw);
    const dh = Math.round(dw * CARD_RATIO);

    // Content fans across the root cell; each gets an equal strip to tap.
    const content: ColumnGeom['content'] = [];
    const nc = sh.content;
    const offset = central && layout.centralPiles ? 1 : 0; // the pile is item 0
    const items = nc + offset;
    for (let k = 0; k < nc; k++) {
      const j = k + offset;
      const stripW = cw / items;
      const hit = box(x + stripW * j, root.y, stripW, rh);
      const step = items === 1 ? 0 : Math.min(dw + 2, (cw - dw) / (items - 1));
      const rowW = dw + step * (items - 1);
      const dx = x + (cw - rowW) / 2 + step * j;
      content.push({ hit: items === 1 ? root : hit, draw: box(dx, root.y + (rh - dh) / 2, dw, dh) });
    }

    // ICE stacks outward from the root; overlaps when more than fit.
    const ice: ColumnGeom['ice'] = [];
    const regionStart = up ? root.y - ICE_GAP : bottomOf(root) + ICE_GAP;
    const regionLen = up ? regionStart - band.y : bottomOf(band) - regionStart;
    const cell0 = iceCell(dw);
    let step = cell0 + ICE_GAP;
    if (sh.ice * step - ICE_GAP > regionLen) step = (regionLen + ICE_GAP) / Math.max(1, sh.ice);
    const cell = Math.min(cell0, step - ICE_GAP);
    const iceW = Math.min(cw, Math.round(dw * CARD_RATIO));
    const iceH = Math.round(iceW / CARD_RATIO);
    for (let k = 0; k < sh.ice; k++) {
      const near = regionStart + (up ? -1 : 1) * k * step;
      const hy = up ? near - cell : near;
      const hit = box(x, hy, cw, cell);
      const cy = hy + cell / 2;
      ice.push({ hit, draw: box(x + (cw - iceW) / 2, cy - iceH / 2, iceW, iceH) });
    }
    out.push({ id: sh.id, column, label, root, content, ice, dir: up ? -1 : 1 });
  });
  return out;
}

export interface RigGeom {
  /** The Runner's band / zone. */
  band: Box;
  /** "Memory 2/4" counter (label line, right side). */
  memory: Box;
  /** Landscape: name lines above the Stack and Heap piles. */
  pileLabels: { deck: Box; discard: Box } | null;
  /** Installed cards, in install order: tap / hold boxes and drawn bounds. */
  cards: { hit: Box; draw: Box }[];
  /** The Install spot (lit while a program / hardware / resource is picked). */
  install: Box;
}

/** The Runner's installed cards, Install spot and memory counter. */
export function runnerRig(layout: BoardLayout, count: number): RigGeom {
  const band = layout.zones[posOf(layout, 'runner')];
  const { zoneLabel: zl, zoneGap: gap, installed } = layout;
  const iw = installed.width;
  const rowY = band.y + zl + gap;
  const rowH = Math.max(0, bottomOf(band) - rowY);
  const cellW = Math.max(MIN_TOUCH, iw);
  const landscape = layout.mode === 'landscape';
  const side = layout.viewer === 'runner' ? layout.bottom : layout.top;
  const x0 = landscape ? rightOf(side.discard) + 3 * gap : band.x;
  const installW = Math.max(2 * cellW + gap, 92);
  const memW = Math.min(110, band.width);
  const memory = box(rightOf(band) - memW, band.y, memW, zl);
  // Rig cards from the left; the Install spot follows the last card.
  const room = rightOf(band) - x0 - gap - installW;
  let step = cellW + gap;
  if (count > 1 && (count - 1) * step + cellW > room) step = Math.max(8, (room - cellW) / (count - 1));
  const hitW = Math.min(cellW, step - gap);
  const dh = Math.min(rowH, installed.height);
  const dw = Math.round(dh / CARD_RATIO);
  const cards: RigGeom['cards'] = [];
  for (let k = 0; k < count; k++) {
    const x = x0 + k * step;
    const last = k === count - 1;
    cards.push({
      hit: box(x, rowY, last ? cellW : Math.max(1, hitW), rowH),
      draw: box(x + (cellW - dw) / 2, rowY + (rowH - dh) / 2, dw, dh),
    });
  }
  const after = count === 0 ? x0 : x0 + (count - 1) * step + cellW + gap;
  const install = box(Math.min(after, rightOf(band) - installW), rowY, installW, rowH);
  const pileLabels = landscape
    ? { deck: box(side.deck.x, band.y, side.deck.width, zl), discard: box(side.discard.x, band.y, side.discard.width, zl) }
    : null;
  return { band, memory, pileLabels, cards, install };
}
