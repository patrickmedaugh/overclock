// Pure layout math: viewport size in, boxes (CSS pixels) out.
// No Pixi or DOM here so it can be unit tested for "nothing cut off or
// overlapping" across many screen sizes.
import type { Box } from './hook-types';

export interface SideRow {
  /** Whole row band. */
  row: Box;
  /** Side label ("CORP" / "RUNNER"). */
  label: Box;
  deck: Box;
  credits: Box;
  clicks: Box;
}

export interface BoardLayout {
  viewport: { width: number; height: number };
  /** Portrait play column, centered horizontally. */
  board: Box;
  /** Global scale relative to the 390x844 reference phone. */
  scale: number;
  pad: number;
  corp: SideRow;
  runner: SideRow;
  /** Space between the two sides (servers/runs go here in later sprints). */
  center: Box;
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

function sideRow(board: Box, top: number, rowH: number, s: number, pad: number): SideRow {
  const labelH = Math.round(18 * s);
  const deckH = rowH - labelH - Math.round(6 * s);
  const deckW = Math.round(deckH / CARD_RATIO);
  const pillH = Math.max(MIN_TOUCH, Math.round(52 * s));
  const pillW = Math.max(MIN_TOUCH * 2, Math.round(104 * s));
  const gap = Math.round(10 * s);
  const left = board.x + pad;
  const right = board.x + board.width - pad;
  const bodyTop = top + labelH + Math.round(6 * s);
  const pillY = bodyTop + Math.round((deckH - pillH) / 2);
  return {
    row: box(board.x, top, board.width, rowH),
    label: box(left, top, Math.round(board.width / 2), labelH),
    credits: box(left, pillY, pillW, pillH),
    clicks: box(left + pillW + gap, pillY, pillW, pillH),
    deck: box(right - deckW, bodyTop, deckW, deckH),
  };
}

export function computeLayout(width: number, height: number): BoardLayout {
  const vw = Math.max(1, Math.floor(width));
  const vh = Math.max(1, Math.floor(height));
  // Portrait column: full width on phones, a phone-shaped column on desktop.
  const boardW = Math.min(vw, Math.max(REF_W, Math.round(vh * 0.62)));
  const boardX = Math.floor((vw - boardW) / 2);
  const s = Math.max(0.5, Math.min(boardW / REF_W, vh / REF_H, 1.5));
  const pad = Math.round(12 * s);
  const gap = Math.round(8 * s);
  const board = box(boardX, 0, boardW, vh);

  const rowH = Math.round(118 * s);
  const avail = boardW - 2 * pad;
  const cardW = Math.floor(Math.min((avail - 4 * gap) / 5, 84 * s));
  const cardH = Math.floor(cardW * CARD_RATIO);
  const handH = cardH * 2 + gap;

  const corpTop = pad;
  const corp = sideRow(board, corpTop, rowH, s, pad);
  const handTop = vh - pad - handH;
  const runnerTop = handTop - gap - rowH;
  const runner = sideRow(board, runnerTop, rowH, s, pad);
  const centerTop = corpTop + rowH + gap;
  const center = box(boardX + pad, centerTop, avail, Math.max(0, runnerTop - gap - centerTop));
  const handArea = box(boardX + pad, handTop, avail, handH);

  let zoomW = Math.min(boardW * 0.8, 340);
  if (zoomW * CARD_RATIO > vh * 0.82) zoomW = (vh * 0.82) / CARD_RATIO;
  zoomW = Math.round(zoomW);
  const zoomH = Math.round(zoomW * CARD_RATIO);
  const zoom = box(Math.round((vw - zoomW) / 2), Math.round((vh - zoomH) / 2), zoomW, zoomH);

  return {
    viewport: { width: vw, height: vh },
    board,
    scale: s,
    pad,
    corp,
    runner,
    center,
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
