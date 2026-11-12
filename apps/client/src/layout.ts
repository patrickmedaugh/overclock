// Pure layout math: viewport size + safe-area insets + device mode in, boxes
// (CSS pixels) out. No Pixi or DOM here so it can be unit tested for "nothing
// cut off, overlapping, or under the notch / gesture bar" across many screens.
//
// The layout is viewer-relative: `bottom` is the player looking at the screen
// (the active player in hot-seat), `top` is their opponent.
//
// Two arrangements:
// - desktop: the Sprint 1 portrait column (rows, center band, two-row hand),
//   unchanged; the installed-card zones live in its center band.
// - phone (held sideways): a right rail with both sides' piles and counters,
//   the banner, hint and End turn; the main area has the opponent's band, the
//   viewer's band and a one-row hand strip at the bottom.
import type { Box, Insets } from './hook-types';

export type LayoutMode = 'phone' | 'desktop';

export interface SideRow {
  /** Whole row band (phone: the side's band in the main area). */
  row: Box;
  /** Side label with the hand count ("RUNNER · 5 cards in hand"). */
  label: Box;
  credits: Box;
  clicks: Box;
  discard: Box;
  deck: Box;
}

export interface BoardLayout {
  mode: LayoutMode;
  viewport: { width: number; height: number };
  insets: Insets;
  /** Everything except the backdrop is laid out inside this rect. */
  safe: Box;
  /** Desktop: the portrait play column. Phone: the whole safe rect. */
  board: Box;
  /** Global scale (desktop: relative to the 390x844 reference; phone: to a 390px-tall screen). */
  scale: number;
  pad: number;
  /** Spacing used between cards (hand and installed). */
  gap: number;
  /** Opponent's row. */
  top: SideRow;
  /** Viewer's row (the only interactive one). */
  bottom: SideRow;
  /** Desktop: space between the two rows. Phone: the strip between the two bands. */
  center: Box;
  /** Phone: the right rail. Null on desktop. */
  rail: Box | null;
  /** Where each side's installed cards go (the Corp's servers or the Runner's rig). */
  zones: { top: Box; bottom: Box };
  /** Installed-card size before any shrinking (upright; ICE is drawn rotated, height x width). */
  installed: { width: number; height: number };
  /** Smallest hit box an installed card gets here (0 = no floor, e.g. desktop mouse). */
  hitFloor: number;
  /** Height of the label line in a zone (server names, "Memory 2/4"). */
  zoneLabel: number;
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
/** Installed-card hit floor on small phones (640x360 and below), per the Sprint 2 plan. */
export const MIN_TOUCH_SMALL = 36;
/** Card aspect ratio (height / width). */
export const CARD_RATIO = 1.4;

const REF_W = 390;
const REF_H = 844;

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

function safeBox(vw: number, vh: number, insets: Insets): Box {
  return box(
    Math.ceil(insets.left),
    Math.ceil(insets.top),
    Math.max(1, Math.floor(vw - insets.right) - Math.ceil(insets.left)),
    Math.max(1, Math.floor(vh - insets.bottom) - Math.ceil(insets.top)),
  );
}

function zoomBox(safe: Box, maxW: number, maxHFrac: number): Box {
  let zoomW = Math.min(maxW, 340);
  if (zoomW * CARD_RATIO > safe.height * maxHFrac) zoomW = (safe.height * maxHFrac) / CARD_RATIO;
  zoomW = Math.round(zoomW);
  const zoomH = Math.round(zoomW * CARD_RATIO);
  return box(safe.x + Math.round((safe.width - zoomW) / 2), safe.y + Math.round((safe.height - zoomH) / 2), zoomW, zoomH);
}

export function computeLayout(width: number, height: number, insetsIn?: Partial<Insets>, mode: LayoutMode = 'desktop'): BoardLayout {
  return mode === 'phone' ? phoneLayout(width, height, insetsIn) : desktopLayout(width, height, insetsIn);
}

// ---- desktop (Sprint 1 column, unchanged) ----------------------------------

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

function desktopLayout(width: number, height: number, insetsIn?: Partial<Insets>): BoardLayout {
  const vw = Math.max(1, Math.floor(width));
  const vh = Math.max(1, Math.floor(height));
  const insets = sanitize(insetsIn);
  const safe = safeBox(vw, vh, insets);
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
  const handH = cardH * 2 + gap;

  const top = sideRow(board, safe.y + pad, s, pad);
  const handTop = safe.y + safe.height - pad - handH;
  const rowH = top.row.height;
  const bottom = sideRow(board, handTop - gap - rowH, s, pad);
  const centerTop = top.row.y + rowH + gap;
  const center = box(boardX + pad, centerTop, avail, Math.max(0, bottom.row.y - gap - centerTop));
  const handArea = box(boardX + pad, handTop, avail, handH);

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

  // Installed-card zones: what is left of the center band between the help
  // line and the action bar (opponent's above, viewer's below). Cards shrink
  // to fit; a mouse needs no touch floor.
  const zTop = sub.y + sub.height + gap;
  const zRoom = Math.max(0, barY - gap - zTop);
  const zH = Math.max(0, Math.floor((zRoom - gap) / 2));
  const zones = {
    top: box(center.x, zTop, center.width, zH),
    bottom: box(center.x, zTop + zH + gap, center.width, zH),
  };
  const zoneLabel = Math.max(8, Math.round(11 * s));
  const iw = Math.max(8, Math.floor(Math.min(cardW * 0.7, (zH - zoneLabel - 3 * gap) / (CARD_RATIO + 2))));

  return {
    mode: 'desktop',
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
    installed: { width: iw, height: Math.floor(iw * CARD_RATIO) },
    hitFloor: 0,
    zoneLabel,
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

// ---- phone, held sideways ---------------------------------------------------

/** Columns a server row must fit without shrinking: 6 servers + the New server spot. */
export const FIT_SERVER_COLUMNS = 7;
/** Rig slots a rig row must fit without shrinking: 6 cards + the Install spot. */
export const FIT_RIG_SLOTS = 7;
/** ICE per server that fit without shrinking. */
export const FIT_ICE = 2;
/** Hand cards that fit the phone's hand strip with 44px of each showing. */
export const HAND_FIT = 9;

/**
 * One side's block in the rail: label on top, then credits, clicks, discard
 * and deck in one row (deck at the right edge, as on desktop).
 */
function railBlock(rail: Box, y: number, labelH: number, pileW: number, pileH: number, g: number): SideRow {
  const bodyY = y + labelH + 2;
  const pillH = Math.min(pileH, MIN_TOUCH);
  const pillY = bodyY + Math.round((pileH - pillH) / 2);
  const deckX = rail.x + rail.width - pileW;
  const discardX = deckX - g - pileW;
  const pillRoom = discardX - g - rail.x;
  // Credits is a tap target (>= 44 wide); clicks only shows a number.
  const creditsW = Math.max(MIN_TOUCH, Math.floor((pillRoom - g) / 2));
  const clicksW = Math.max(1, pillRoom - g - creditsW);
  return {
    // Filled in by the caller (the band in the main area).
    row: box(0, 0, 0, 0),
    label: box(rail.x, y, rail.width, labelH),
    credits: box(rail.x, pillY, creditsW, pillH),
    clicks: box(rail.x + creditsW + g, pillY, clicksW, pillH),
    discard: box(discardX, bodyY, pileW, pileH),
    deck: box(deckX, bodyY, pileW, pileH),
  };
}

function phoneLayout(width: number, height: number, insetsIn?: Partial<Insets>): BoardLayout {
  const vw = Math.max(1, Math.floor(width));
  const vh = Math.max(1, Math.floor(height));
  const insets = sanitize(insetsIn);
  const safe = safeBox(vw, vh, insets);
  const s = clamp(safe.height / 390, 0.8, 1.3);
  // At least the pile glow (4.5px), so no glow reaches a notch or gesture bar.
  const pad = vh >= 390 ? 6 : 5;
  const gap = 4;
  const hitFloor = vh >= 390 ? MIN_TOUCH : MIN_TOUCH_SMALL;
  const inner = box(safe.x + pad, safe.y + pad, safe.width - 2 * pad, safe.height - 2 * pad);

  // Right rail.
  const railW = clamp(Math.round(safe.width * 0.25), 180, 232);
  const rail = box(inner.x + inner.width - railW, inner.y, railW, inner.height);
  const labelH = Math.max(10, Math.round(11 * s));
  const pileW = Math.max(MIN_TOUCH, Math.round(48 * Math.min(s, 1.15)));
  const pileH = Math.round(pileW * CARD_RATIO);
  const blockH = labelH + 2 + pileH;
  const top = railBlock(rail, rail.y, labelH, pileW, pileH, gap);
  const bottom = railBlock(rail, rail.y + rail.height - blockH, labelH, pileW, pileH, gap);
  const barH = Math.max(MIN_TOUCH, Math.round(46 * Math.min(s, 1.1)));
  const endTurn = box(rail.x, bottom.label.y - 6 - barH, rail.width, barH);
  const hintH = Math.max(30, Math.round(32 * s));
  const hintArea = box(rail.x, endTurn.y - gap - hintH, rail.width, hintH);
  const banner = box(rail.x, rail.y + blockH + gap, rail.width, Math.max(14, Math.round(16 * s)));
  const subY = banner.y + banner.height + 3;
  const sub = box(rail.x, subY, rail.width, Math.max(1, hintArea.y - 3 - subY));

  // Main area, left of the rail.
  const main = box(inner.x, inner.y, rail.x - gap - inner.x, inner.height);
  // Each band must hold a label line, two ICE hit cells and a readable root card.
  const zoneLabel = Math.max(9, Math.round(10 * s));
  const minRootH = 39;
  const bandMin = zoneLabel + gap + minRootH + FIT_ICE * hitFloor;
  // Hand cards: as big as the bands allow, and narrow enough that a 9-card hand
  // (a Sprint 1 turn: 6 + 3 draws) still shows 44px of every card in one row.
  const handCap = Math.min(56 * Math.min(s, 1.15), main.width - (HAND_FIT - 1) * MIN_TOUCH);
  const handW = Math.floor(clamp((main.height - 2 * bandMin - 2 * gap) / CARD_RATIO, MIN_TOUCH, handCap));
  const handH = Math.floor(handW * CARD_RATIO);
  const bandH = Math.floor((main.height - handH - 2 * gap) / 2);
  const topBand = box(main.x, main.y, main.width, bandH);
  const bottomBand = box(main.x, main.y + bandH + gap, main.width, bandH);
  const handArea = box(main.x, main.y + main.height - handH, main.width, handH);
  top.row = topBand;
  bottom.row = bottomBand;

  // Installed size: a root card plus FIT_ICE rotated ICE (each in a cell of
  // at least hitFloor) fit the band height; FIT_SERVER_COLUMNS rotated ICE fit
  // the width; never bigger than a hand card.
  let iw = (bandH - zoneLabel - 3 * gap) / (CARD_RATIO + FIT_ICE); // ICE cell = card + gap
  if (iw + gap < hitFloor) iw = Math.min(hitFloor - gap, (bandH - zoneLabel - gap - FIT_ICE * hitFloor) / CARD_RATIO);
  iw = Math.min(iw, (main.width / FIT_SERVER_COLUMNS - gap) / CARD_RATIO, handW);
  iw = Math.max(8, Math.floor(iw));

  const gameOverH = Math.min(main.height, Math.round(150 * s));
  const gameOverW = Math.min(main.width, 460);
  const gameOver = box(main.x + Math.round((main.width - gameOverW) / 2), main.y + Math.round((main.height - gameOverH) / 2), gameOverW, gameOverH);

  return {
    mode: 'phone',
    viewport: { width: vw, height: vh },
    insets,
    safe,
    board: safe,
    scale: s,
    pad,
    gap,
    top,
    bottom,
    center: box(main.x, topBand.y + topBand.height, main.width, gap),
    rail,
    zones: { top: topBand, bottom: bottomBand },
    installed: { width: iw, height: Math.floor(iw * CARD_RATIO) },
    hitFloor,
    zoneLabel,
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
  const gap = layout.mode === 'phone' ? layout.gap : Math.round(8 * layout.scale); // same gap computeLayout sized cards with
  const minStep = Math.max(MIN_TOUCH, Math.round(card.width * 0.6));
  // Prefer side-by-side cards with no overlap, wrapping into as many rows as
  // fit the hand area; only then overlap cards (keeping MIN_TOUCH visible),
  // and only past that stack rows on top of each other.
  const perRowFlat = Math.max(1, Math.floor((handArea.width + gap) / (card.width + gap)));
  const rowsFlat = Math.max(1, Math.floor((handArea.height + gap) / (card.height + gap)));
  const perRowMax = Math.max(1, 1 + Math.floor((handArea.width - card.width) / minStep));
  let rows: number;
  if (count <= perRowFlat * rowsFlat) rows = Math.ceil(count / perRowFlat);
  else if (count <= perRowMax * rowsFlat) rows = rowsFlat;
  else if (rowsFlat === 1) rows = 1; // one-row strip (phone): overlap further rather than stack
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
    // Phone: the strip is read from the left, next to the viewer's band.
    const left = layout.mode === 'phone' ? handArea.x : handArea.x + (handArea.width - rowW) / 2;
    for (let i = 0; i < inRow; i++) {
      out.push(box(left + step * i, top + rowStep * r, card.width, card.height));
    }
  }
  return out;
}

// ---- installed cards ---------------------------------------------------------

export type BandPos = 'top' | 'bottom';

/** One installed card: where it is drawn, and its (never overlapping) tap box. */
export interface InstalledSlot {
  /** Drawn card bounds (for ICE: the rotated, landscape bounds). */
  box: Box;
  /** Tap / long-press box: at least the drawn card, may extend into gaps. */
  hit: Box;
  /** True for ICE (drawn sideways). */
  rotated: boolean;
}

export interface ServerColumn {
  /** The whole column (a tap target for "install here"). */
  column: Box;
  /** The server name line ("HQ", "Server 1"), on the side away from the ICE. */
  label: Box;
  /** Root cards (agenda/asset/upgrades), left to right. */
  root: InstalledSlot[];
  /** Where a root card is drawn when there is none yet (empty server base, New server ghost). */
  rootSlot: Box;
  /** ICE, innermost first; the last one is outermost (farthest from the root, toward the opponent). */
  ice: InstalledSlot[];
}

export interface ServerShape {
  ice: number;
  root: number;
}

export interface ServerRow {
  columns: ServerColumn[];
  /** The New server ghost column (when asked for). */
  newServer: ServerColumn | null;
}

/**
 * Lays out the Corp's servers in a band, left to right in the given order.
 * In the viewer's (bottom) band the ICE stacks upward, in the opponent's (top)
 * band downward: always toward the other player. Up to FIT_SERVER_COLUMNS
 * columns and FIT_ICE ICE each keep full size; beyond that cards shrink.
 */
export function serverSlots(layout: BoardLayout, pos: BandPos, servers: readonly ServerShape[], withNewServer: boolean): ServerRow {
  const zone = layout.zones[pos];
  const g = layout.gap;
  const n = servers.length + (withNewServer ? 1 : 0);
  const base = layout.installed;
  const maxPitch = base.height + 3 * g;
  const pitch = n > 0 ? Math.min(maxPitch, Math.floor(zone.width / n)) : maxPitch;
  // Shrink cards when the columns get narrower than a rotated ICE.
  const k = Math.min(1, (pitch - g) / base.height);
  const w = base.width * k;
  const h = base.height * k;
  const labelH = layout.zoneLabel;
  const iceRegion = Math.max(0, zone.height - labelH - g - h);

  const column = (i: number, shape: ServerShape): ServerColumn => {
    const x = zone.x + i * pitch;
    const col = box(x, zone.y, pitch, zone.height);
    const label = pos === 'bottom' ? box(x, zone.y + zone.height - labelH, pitch, labelH) : box(x, zone.y, pitch, labelH);
    const rootY = pos === 'bottom' ? label.y - h : label.y + labelH;
    const rootSlot = box(x + (pitch - w) / 2, rootY, w, h);
    // The root's tap box covers the label and the root (up to the ICE region).
    const rootHitY = pos === 'bottom' ? rootY - g : zone.y;
    const rootHitH = labelH + h + g;
    const root: InstalledSlot[] = [];
    const nr = shape.root;
    if (nr > 0) {
      const spread = nr === 1 ? 0 : Math.min(w + g, (pitch - g - w) / (nr - 1));
      const rowW = w + spread * (nr - 1);
      const left = x + (pitch - rowW) / 2;
      for (let r = 0; r < nr; r++) {
        const hitX = x + (pitch * r) / nr;
        root.push({
          box: box(left + spread * r, rootY, w, h),
          hit: box(hitX, rootHitY, pitch / nr, rootHitH),
          rotated: false,
        });
      }
    }
    const ice: InstalledSlot[] = [];
    const ni = shape.ice;
    if (ni > 0) {
      const cell = iceRegion / Math.max(FIT_ICE, ni);
      const iceH = Math.min(w, Math.max(1, cell - g));
      const iceW = iceH * (h / w); // same shape as the root card, turned sideways
      for (let j = 0; j < ni; j++) {
        const cellY = pos === 'bottom' ? rootHitY - (j + 1) * cell : rootHitY + rootHitH + j * cell;
        ice.push({
          box: box(x + (pitch - iceW) / 2, cellY + (cell - iceH) / 2, iceW, iceH),
          hit: box(x, cellY, pitch, cell),
          rotated: true,
        });
      }
    }
    return { column: col, label, root, rootSlot, ice };
  };

  const columns = servers.map((shape, i) => column(i, shape));
  const newServer = withNewServer ? column(servers.length, { ice: 0, root: 0 }) : null;
  return { columns, newServer };
}

export interface RigRow {
  /** Installed rig cards, left to right. */
  cards: InstalledSlot[];
  /** The Install spot (the next free slot). */
  install: InstalledSlot;
  /** "Memory 2/4" line. */
  memory: Box;
}

/**
 * Lays out the Runner's rig in a band: one row of face-up cards plus the
 * Install spot, with the memory line on the side away from the opponent.
 * FIT_RIG_SLOTS slots keep full size; beyond that cards shrink.
 */
export function rigSlots(layout: BoardLayout, pos: BandPos, count: number): RigRow {
  const zone = layout.zones[pos];
  const g = layout.gap;
  const labelH = layout.zoneLabel;
  const slots = Math.max(FIT_RIG_SLOTS, count + 1);
  const room = zone.height - labelH - g;
  const fitW = Math.min(layout.card.width, room / CARD_RATIO, (zone.width + g) / FIT_RIG_SLOTS - g);
  const pitch = Math.min(fitW + g, zone.width / slots);
  const w = Math.max(1, Math.min(fitW, pitch - g));
  const h = w * CARD_RATIO;
  const memory = pos === 'bottom' ? box(zone.x, zone.y + zone.height - labelH, zone.width, labelH) : box(zone.x, zone.y, zone.width, labelH);
  const rowTop = pos === 'bottom' ? zone.y : zone.y + labelH + g;
  const y = rowTop + (room - h) / 2;
  const slot = (i: number): InstalledSlot => ({
    box: box(zone.x + i * pitch + (pitch - w) / 2, y, w, h),
    hit: box(zone.x + i * pitch, rowTop, pitch, room),
    rotated: false,
  });
  return { cards: Array.from({ length: count }, (_, i) => slot(i)), install: slot(count), memory };
}
