// Pure layout math: viewport size + safe-area insets in, boxes (CSS pixels)
// out. No Pixi or DOM here so it can be unit tested for "nothing cut off,
// overlapping, or under the notch / gesture bar" across many screen shapes.
//
// The layout is viewer-relative: `bottom` is the player looking at the screen
// (the active player in hot-seat), `top` is their opponent.
import type { Box, Insets } from './hook-types';

export interface SideRow {
  /** Whole row band. */
  row: Box;
  /** Side label with the hand count ("RUNNER · 5 cards in hand"). */
  label: Box;
  credits: Box;
  clicks: Box;
  discard: Box;
  deck: Box;
}

export interface BoardLayout {
  viewport: { width: number; height: number };
  insets: Insets;
  /** Everything except the backdrop is laid out inside this rect. */
  safe: Box;
  /** Portrait play column inside the safe rect, centered horizontally. */
  board: Box;
  /** Global scale relative to the 390x844 reference phone. */
  scale: number;
  pad: number;
  /** Opponent's row. */
  top: SideRow;
  /** Viewer's row (the only interactive one). */
  bottom: SideRow;
  /** Space between the two rows (servers/runs go here in later sprints). */
  center: Box;
  /** "TURN 3 · CORP · 2 clicks left". */
  banner: Box;
  /** Help line, or the discard picker's "Discard 2". */
  sub: Box;
  /** Where the transient hint toast sits (left of the End turn button). */
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

const REF_W = 390;
const REF_H = 844;

function box(x: number, y: number, width: number, height: number): Box {
  return { x, y, width, height };
}

function sanitize(insets: Partial<Insets> | undefined): Insets {
  const v = (n: number | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);
  return { top: v(insets?.top), right: v(insets?.right), bottom: v(insets?.bottom), left: v(insets?.left) };
}

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

export function computeLayout(width: number, height: number, insetsIn?: Partial<Insets>): BoardLayout {
  const vw = Math.max(1, Math.floor(width));
  const vh = Math.max(1, Math.floor(height));
  const insets = sanitize(insetsIn);
  const safe = box(
    Math.ceil(insets.left),
    Math.ceil(insets.top),
    Math.max(1, Math.floor(vw - insets.right) - Math.ceil(insets.left)),
    Math.max(1, Math.floor(vh - insets.bottom) - Math.ceil(insets.top)),
  );
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

  let zoomW = Math.min(boardW * 0.8, 340);
  if (zoomW * CARD_RATIO > safe.height * 0.82) zoomW = (safe.height * 0.82) / CARD_RATIO;
  zoomW = Math.round(zoomW);
  const zoomH = Math.round(zoomW * CARD_RATIO);
  const zoom = box(
    safe.x + Math.round((safe.width - zoomW) / 2),
    safe.y + Math.round((safe.height - zoomH) / 2),
    zoomW,
    zoomH,
  );

  return {
    viewport: { width: vw, height: vh },
    insets,
    safe,
    board,
    scale: s,
    pad,
    top,
    bottom,
    center,
    banner,
    sub,
    hintArea,
    endTurn,
    gameOver,
    handArea,
    card: { width: cardW, height: cardH },
    zoom,
  };
}

/**
 * Positions for `count` hand cards inside the hand area (see comments below
 * for the wrap/overlap order).
 */
export function handSlots(layout: BoardLayout, count: number): Box[] {
  if (count <= 0) return [];
  const { handArea, card } = layout;
  const gap = Math.round(8 * layout.scale); // same gap computeLayout sized cards with
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
