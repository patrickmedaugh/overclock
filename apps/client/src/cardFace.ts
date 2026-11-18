// Card visuals. All art is generated from shapes at runtime (original
// placeholder art; no copied images). The `art` key on a card seeds the glyph
// so the same card always looks the same.
import type { CardDef, Side } from '@overclock/cards';
import { Container, FillGradient, Graphics, Rectangle, Sprite, Text, type Renderer, type Texture } from 'pixi.js';
import { clickCostOf } from './cardText';
import { sideColor, sideDeep, theme } from './theme';

/** FNV-1a string hash -> uint32. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small local PRNG for art only (visuals, not game logic). */
function artRng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draws a neon glow outline: a few widening strokes with falling alpha. */
export function glowRoundRect(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: number,
  width: number,
  strength = 1,
): void {
  for (let i = 3; i >= 1; i--) {
    g.roundRect(x, y, w, h, r).stroke({ width: width + i * width * 1.6, color, alpha: 0.09 * strength });
  }
  g.roundRect(x, y, w, h, r).stroke({ width, color, alpha: 0.95 });
}

function polygon(cx: number, cy: number, r: number, sides: number, rot: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return pts;
}

/** Procedural neon glyph filling a w x h box at (x, y). */
export function drawGlyph(g: Graphics, key: string, x: number, y: number, w: number, h: number, color: number): void {
  const rnd = artRng(hash(key));
  const cx = x + w / 2;
  const cy = y + h / 2;
  const R = Math.min(w, h) * 0.38;
  const lw = Math.max(1, R * 0.06);

  // Scanlines / grid backdrop.
  const lines = 5 + Math.floor(rnd() * 4);
  for (let i = 1; i < lines; i++) {
    const ly = y + (h * i) / lines;
    g.moveTo(x + 2, ly).lineTo(x + w - 2, ly).stroke({ width: 1, color, alpha: 0.08 });
  }

  // Outer ring polygon.
  const sides = 3 + Math.floor(rnd() * 6);
  const rot = rnd() * Math.PI;
  g.poly(polygon(cx, cy, R, sides, rot)).stroke({ width: lw * 3, color, alpha: 0.18 });
  g.poly(polygon(cx, cy, R, sides, rot)).stroke({ width: lw, color, alpha: 0.95 });

  // Inner shape: circle or rotated polygon.
  if (rnd() < 0.5) {
    g.circle(cx, cy, R * (0.35 + rnd() * 0.2)).fill({ color, alpha: 0.18 }).stroke({ width: lw, color: theme.text, alpha: 0.85 });
  } else {
    const s2 = 3 + Math.floor(rnd() * 4);
    g.poly(polygon(cx, cy, R * 0.5, s2, rot + Math.PI / s2))
      .fill({ color, alpha: 0.2 })
      .stroke({ width: lw, color: theme.text, alpha: 0.85 });
  }

  // Orbiting nodes connected to the center.
  const nodes = 2 + Math.floor(rnd() * 4);
  for (let i = 0; i < nodes; i++) {
    const a = rnd() * Math.PI * 2;
    const d = R * (0.7 + rnd() * 0.4);
    const nx = cx + Math.cos(a) * d;
    const ny = cy + Math.sin(a) * d;
    g.moveTo(cx, cy).lineTo(nx, ny).stroke({ width: Math.max(1, lw * 0.6), color, alpha: 0.5 });
    g.circle(nx, ny, Math.max(1.5, R * 0.08)).fill({ color: theme.text, alpha: 0.95 });
  }
  g.circle(cx, cy, Math.max(1.5, R * 0.09)).fill({ color: theme.text });
}

function panelGradient(side: Side): FillGradient {
  return new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: sideDeep(side) },
      { offset: 0.55, color: theme.panel },
      { offset: 1, color: 0x05050a },
    ],
    textureSpace: 'local',
  });
}

// ---- baked card textures ---------------------------------------------------
// Card art is static, so each (card, size) is drawn into a texture once and then
// shared by every sprite that shows it. Each turn change rebuilds the board for
// the other seat; without this every deck back and hand card was redrawn into a
// fresh texture on that first frame (about 20 offscreen renders, the slowest
// frame of the game on a software GPU).

let bakeRenderer: Renderer | null = null;
/** What a zoom face says (the test hook reads it; a baked sprite has no Text left). */
interface ZoomMeta {
  texts: string[];
  overflow: boolean;
  /** Sprint 11 (S-11-4): each bottom stat ("Strength 4") as drawn, card-local (centered at 0,0). */
  stats: StatBox[];
  /** S-12-6: the click-symbol cost ("×3") as drawn, or null. */
  clickCost: ClickCostBox | null;
}

/**
 * S-12-6: a cost of two or more clicks drawn as the click symbol and "×N" (Melange: "Click,
 * click, click:" reads as the symbol "×3"). Card-local boxes (centered at 0,0).
 */
export interface ClickCostBox {
  count: number;
  /** The drawn "×N" text. */
  text: string;
  /** The click symbol. */
  icon: { x: number; y: number; width: number; height: number };
  /** The symbol and its "×N" together. */
  box: { x: number; y: number; width: number; height: number };
  /** The "×N" text size as drawn (px at card size). */
  fontPx: number;
}

/** S-12-6: our click symbol (a circular arrow, drawn), centered at (cx, cy), radius r. */
export function drawClickIcon(g: Graphics, cx: number, cy: number, r: number, color: number): void {
  const lw = Math.max(1.2, r * 0.32);
  const ring = r - lw / 2;
  const start = -Math.PI * 0.35;
  const end = start + Math.PI * 1.55;
  // Start a fresh path: an arc continues the Graphics' last path otherwise (a stray line).
  g.moveTo(cx + Math.cos(start) * ring, cy + Math.sin(start) * ring);
  g.arc(cx, cy, ring, start, end).stroke({ width: lw, color, cap: 'round' });
  // Arrowhead at the arc's open end, pointing along the turn (clockwise).
  const ax = cx + Math.cos(end) * ring;
  const ay = cy + Math.sin(end) * ring;
  const tx = -Math.sin(end);
  const ty = Math.cos(end);
  const nx = Math.cos(end);
  const ny = Math.sin(end);
  const hl = r * 0.75;
  const hw = r * 0.55;
  g.poly([ax + tx * hl * 0.6, ay + ty * hl * 0.6, ax - nx * hw - tx * hl * 0.4, ay - ny * hw - ty * hl * 0.4, ax + nx * hw - tx * hl * 0.4, ay + ny * hw - ty * hl * 0.4]).fill({ color });
}

/** The click-cost boxes recorded on a face's container (`drawCardFace`). */
const CLICK_COSTS = new WeakMap<Container, ClickCostBox>();

/** Sprint 11 (S-11-4): one "Label N" stat of a full face, where it is drawn (card-local). */
export interface StatBox {
  text: string;
  box: { x: number; y: number; width: number; height: number };
  /** Its text size as drawn (px at card size). */
  fontPx: number;
}

/** The stat boxes recorded on a full face's container (`drawCardFace`). */
const STATS = new WeakMap<Container, StatBox[]>();
let baked = new Map<string, { texture: Texture; x: number; y: number; meta?: ZoomMeta }>();
let retired: typeof baked = new Map();
/** Zoom faces dropped from `baked` to stay under ZOOM_KEEP; freed at the next flushZoomFaces(). */
let evicted: Texture[] = [];

/** Lets card visuals share baked textures. Without a renderer each card caches itself. */
export function setCardRenderer(renderer: Renderer | null): void {
  bakeRenderer = renderer;
}

/**
 * Call when the board is rebuilt for a new viewport (sizes change). Textures from
 * two layouts ago are freed: nothing on screen uses them any more.
 */
export function retireCardTextures(): void {
  for (const e of retired.values()) e.texture.destroy(true);
  retired = baked;
  baked = new Map();
  flushZoomFaces();
}

/**
 * Frees every baked texture at once (S-04-2): after the GPU context was lost
 * and restored, or the app resumed, their pixels may be gone. Call only once
 * nothing on screen uses them (the board was torn down first).
 */
export function dropCardTextures(): void {
  for (const m of [retired, baked]) for (const e of m.values()) e.texture.destroy(true);
  retired = new Map();
  baked = new Map();
  flushZoomFaces();
}

function bake(key: string, build: () => Container): Container {
  const renderer = bakeRenderer;
  if (!renderer) {
    const c = build();
    c.cacheAsTexture(true);
    return c;
  }
  const fullKey = `${key}@${renderer.resolution}`;
  let entry = baked.get(fullKey);
  if (!entry) {
    entry = bakeEntry(renderer, build());
    baked.set(fullKey, entry);
  }
  return spriteOf(entry);
}

/** Draws `c` into a texture and destroys it. */
function bakeEntry(renderer: Renderer, c: Container, meta?: ZoomMeta): { texture: Texture; x: number; y: number; meta?: ZoomMeta } {
  const b = c.getLocalBounds();
  const x = Math.floor(b.x);
  const y = Math.floor(b.y);
  const frame = new Rectangle(x, y, Math.ceil(b.x + b.width) - x, Math.ceil(b.y + b.height) - y);
  const texture = renderer.generateTexture({ target: c, frame, resolution: renderer.resolution, antialias: true });
  c.destroy({ children: true });
  return meta ? { texture, x, y, meta } : { texture, x, y };
}

function spriteOf(entry: { texture: Texture; x: number; y: number }): Container {
  const out = new Container();
  const sprite = new Sprite(entry.texture);
  sprite.position.set(entry.x, entry.y);
  out.addChild(sprite);
  return out;
}

// ---- zoom faces (S-05-3, QA-S4-1) -------------------------------------------
// The big zoom face is the slowest card to draw (all its text). It is baked
// once per card and size, so a hold-and-slide swap and the carousel behind the
// zoom are just new sprites. A hold on a hand card pre-draws the hand's faces
// one per frame (Board), so a slide rarely has to draw one on the spot. They
// are big textures: only the ZOOM_KEEP most recently used are kept.

// 12: a full hand (max hand size + a few drawn) plus the cards either side of a
// pile slide. Each face is ~3.5MB of GPU memory on a 3x phone (architect,
// DECISIONS 2026-11-13: 24 would be ~85MB, too much for a WebView).
const ZOOM_KEEP = 12;

/** A zoom face, centered at (0, 0), and what it says. */
export interface ZoomFace {
  root: Container;
  texts: string[];
  /** True if any text runs outside the card. */
  overflow: boolean;
  /** Sprint 11: the bottom stats as drawn. */
  stats: StatBox[];
  /** S-12-6: the click-symbol cost as drawn, or null. */
  clickCost: ClickCostBox | null;
}

function zoomMeta(c: Container, w: number, h: number): ZoomMeta {
  return { texts: textsOf(c), overflow: textOverflows(c, w, h), stats: STATS.get(c) ?? [], clickCost: CLICK_COSTS.get(c) ?? null };
}

/** Sprint 11 (test hook): what a full face of `card` at w x h says and where its stats are (drawn and freed). */
export function fullFaceInfo(card: CardDef, w: number, h: number): ZoomMeta {
  const c = buildCardFace(card, w, h, 'full');
  const meta = zoomMeta(c, w, h);
  c.destroy({ children: true });
  return meta;
}

function zoomKey(card: CardDef, w: number, h: number, renderer: Renderer): string {
  return `zoom:${card.id}:${sizeKey(w, h)}@${renderer.resolution}`;
}

/** True if the zoom face of `card` at w x h is drawn already (making it is then cheap). */
export function hasZoomFace(card: CardDef, w: number, h: number): boolean {
  const renderer = bakeRenderer;
  return !!renderer && baked.has(zoomKey(card, w, h, renderer));
}

/** The long-press zoom face of `card` at w x h (drawn once, then shared). */
export function createZoomFace(card: CardDef, w: number, h: number): ZoomFace {
  const renderer = bakeRenderer;
  if (!renderer) {
    const c = buildCardFace(card, w, h, 'full');
    const meta = zoomMeta(c, w, h);
    c.cacheAsTexture(true);
    return { root: c, ...meta };
  }
  const key = zoomKey(card, w, h, renderer);
  let entry = baked.get(key);
  if (entry) {
    // Most recently used last (the eviction order).
    baked.delete(key);
  } else {
    const c = buildCardFace(card, w, h, 'full');
    entry = bakeEntry(renderer, c, zoomMeta(c, w, h));
  }
  baked.set(key, entry);
  evictZoomFaces();
  const meta = entry.meta ?? { texts: [], overflow: false, stats: [], clickCost: null };
  return { root: spriteOf(entry), texts: meta.texts, overflow: meta.overflow, stats: meta.stats, clickCost: meta.clickCost };
}

/** Keeps at most ZOOM_KEEP zoom faces; the least recently used are freed later (a sprite may still show one). */
function evictZoomFaces(): void {
  const keys = [...baked.keys()].filter((k) => k.startsWith('zoom:'));
  for (const k of keys.slice(0, Math.max(0, keys.length - ZOOM_KEEP))) {
    const e = baked.get(k);
    baked.delete(k);
    if (e) evicted.push(e.texture);
  }
}

/**
 * Frees zoom faces evicted earlier. Call when no zoom is on screen (Board: when
 * a new hold starts), so no sprite still shows one.
 */
export function flushZoomFaces(): void {
  for (const t of evicted) t.destroy(true);
  evicted = [];
}

/** Every text in `c`, in draw order. */
export function textsOf(c: Container): string[] {
  const out: string[] = [];
  for (const child of c.children) {
    if (child instanceof Text) out.push(child.text);
    else out.push(...textsOf(child));
  }
  return out;
}

/** True if any text of a centered w x h card runs outside it. */
export function textOverflows(c: Container, w: number, h: number): boolean {
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

const sizeKey = (w: number, h: number) => `${w.toFixed(2)}x${h.toFixed(2)}`;

/** Card back, centered at (0, 0). */
export function createCardBack(side: Side, w: number, h: number): Container {
  return bake(`back:${side}:${sizeKey(w, h)}`, () => buildCardBack(side, w, h));
}

function buildCardBack(side: Side, w: number, h: number): Container {
  const c = new Container();
  const color = sideColor(side);
  const r = Math.max(3, w * 0.08);
  const g = new Graphics();
  g.roundRect(-w / 2, -h / 2, w, h, r).fill(panelGradient(side));
  // Scanlines and an inset frame (kept strictly inside the card).
  const lines = 9;
  for (let i = 1; i < lines; i++) {
    const y = -h / 2 + (h * i) / lines;
    g.moveTo(-w / 2 + w * 0.1, y).lineTo(w / 2 - w * 0.1, y).stroke({ width: 1, color, alpha: 0.08 });
  }
  g.roundRect(-w / 2 + w * 0.1, -h / 2 + w * 0.1, w * 0.8, h - w * 0.2, r * 0.6).stroke({ width: 1, color, alpha: 0.3 });
  g.poly(polygon(0, 0, w * 0.3, 6, Math.PI / 6)).fill({ color: 0x000000, alpha: 0.5 }).stroke({ width: Math.max(1, w * 0.025), color, alpha: 0.9 });
  glowRoundRect(g, -w / 2, -h / 2, w, h, r, color, Math.max(1, w * 0.025));
  c.addChild(g);
  const mono = new Text({
    text: 'OC',
    style: { fontFamily: theme.monoFamily, fontSize: Math.max(8, w * 0.2), fontWeight: '700', fill: color, letterSpacing: 1 },
  });
  mono.anchor.set(0.5);
  c.addChild(mono);
  return c;
}

const TYPE_LABEL: Record<string, string> = {
  event: 'EVENT',
  identity: 'IDENTITY',
  program: 'PROGRAM',
  hardware: 'HARDWARE',
  resource: 'RESOURCE',
  agenda: 'AGENDA',
  asset: 'ASSET',
  upgrade: 'UPGRADE',
  operation: 'OPERATION',
  ice: 'ICE',
};

export function typeLine(card: CardDef): string {
  const base = TYPE_LABEL[card.type] ?? card.type.toUpperCase();
  if (!card.subtype) return base;
  const sub = card.subtype.replace('breaker_', 'breaker: ').replace('_', ' ');
  return `${base} · ${sub}`;
}

/** Sprint 11 (S-11-4): the bottom stats as "Label N" pairs (and a short label for a narrow face). */
export function statPairs(card: CardDef): { label: string; short: string; value: number }[] {
  const out: { label: string; short: string; value: number }[] = [];
  if (card.strength !== undefined) out.push({ label: 'Strength', short: 'Str', value: card.strength });
  if (card.memory !== undefined) out.push({ label: 'Memory', short: 'MU', value: card.memory });
  if (card.advancementRequirement !== undefined) out.push({ label: 'Advance', short: 'Adv', value: card.advancementRequirement });
  if (card.agendaPoints !== undefined) out.push({ label: 'Points', short: 'Pts', value: card.agendaPoints });
  if (card.trashCost !== undefined) out.push({ label: 'Trash', short: 'Trash', value: card.trashCost });
  return out;
}

/**
 * Sprint 11 (S-11-4): the bottom stat line, bottom-anchored at `bottom`: each "Label N" is its
 * own text in the UI font (the monospace fallback mis-measured on Android and clipped the
 * number), laid left to right and wrapped to another line instead of scaled or clipped. A
 * pair too wide for a line by itself takes its short label ("Str 4"), and only then shrinks.
 * Returns the top of the block and where each stat is.
 */
function drawStats(c: Container, card: CardDef, x: number, width: number, bottom: number, fontSize: number, color: number): { top: number; stats: StatBox[] } {
  const pairs = statPairs(card);
  if (pairs.length === 0) return { top: bottom, stats: [] };
  // Right padding: a glyph may draw a little past its measured width.
  const avail = width - Math.max(2, fontSize * 0.3);
  const gap = fontSize * 1.1;
  const texts = pairs.map((p) => {
    const t = new Text({ text: `${p.label} ${p.value}`, style: { fontFamily: theme.fontFamily, fontSize, fontWeight: '700', fill: color } });
    if (t.width > avail) t.text = `${p.short} ${p.value}`;
    if (t.width > avail) t.scale.set(avail / t.width);
    return t;
  });
  // A line is as tall as its tallest text as measured (a font may draw taller than its size).
  const lineH = Math.max(fontSize * 1.3, ...texts.map((t) => t.height + 1));
  // Lines, left to right.
  const lines: Text[][] = [[]];
  let used = 0;
  for (const t of texts) {
    const line = lines[lines.length - 1]!;
    if (line.length > 0 && used + gap + t.width > avail) {
      lines.push([t]);
      used = t.width;
    } else {
      used += (line.length > 0 ? gap : 0) + t.width;
      line.push(t);
    }
  }
  const top = bottom - lines.length * lineH;
  const stats: StatBox[] = [];
  lines.forEach((line, i) => {
    let lx = x;
    for (const t of line) {
      t.anchor.set(0, 1);
      t.position.set(lx, top + (i + 1) * lineH);
      c.addChild(t);
      stats.push({ text: t.text, box: { x: lx, y: t.y - t.height, width: t.width, height: t.height }, fontPx: fontSize * t.scale.y });
      lx += t.width + gap;
    }
  });
  return { top, stats };
}

/**
 * Card face, centered at (0, 0). `full` adds rules text, flavor and stats (used
 * by the long-press zoom); `small` is the hand thumbnail. Small faces are baked
 * and shared; the full-size zoom keeps its text objects (the test hook reads
 * them) and caches itself.
 */
export function createCardFace(card: CardDef, w: number, h: number, detail: 'small' | 'full'): Container {
  if (detail === 'small') return bake(`face:${card.id}:${sizeKey(w, h)}`, () => buildCardFace(card, w, h, detail));
  const c = buildCardFace(card, w, h, detail);
  // Static art: draw it once into a texture so each frame is one sprite, not
  // dozens of translucent vector strokes (big win on low-end / software GPUs).
  c.cacheAsTexture(true);
  return c;
}

function buildCardFace(card: CardDef, w: number, h: number, detail: 'small' | 'full'): Container {
  if (detail === 'full') {
    // Long rules text (e.g. Bank Job) must fit: shrink the art window first, then the text.
    for (const artFrac of [0.36, 0.3, 0.24, 0.18, 0.14]) {
      for (const textK of artFrac > 0.14 ? [1] : [1, 0.92, 0.85, 0.78, 0.72, 0.66]) {
        const c = drawCardFace(card, w, h, detail, artFrac, textK);
        if (c.fits) return c.root;
        c.root.destroy({ children: true });
      }
    }
    return drawCardFace(card, w, h, detail, 0.14, 0.6).root;
  }
  return smallFace(card, w, h).root;
}

/**
 * Small face (hand / installed card). A long name (e.g. "Private Security
 * Force" on a phone) first gets room from a shorter art window, then a slightly
 * smaller font; as a last resort it is cut to the lines that fit, with an ellipsis. The
 * name never runs into the type label (QA-S2-3).
 */
function smallFace(card: CardDef, w: number, h: number): FaceDraw {
  for (const artFrac of [0.4, 0.34, 0.28]) {
    for (const nameK of artFrac > 0.28 ? [1] : [1, 0.9, 0.82, 0.75]) {
      const c = drawCardFace(card, w, h, 'small', artFrac, 1, nameK);
      if (c.fits) return c;
      c.root.destroy({ children: true });
    }
  }
  return drawCardFace(card, w, h, 'small', 0.28, 1, 0.82, true);
}

/** Where a small face draws its name and type label (card-local, centered at 0,0), for tests. */
export interface SmallFaceLayout {
  name: { x: number; y: number; width: number; height: number };
  type: { x: number; y: number; width: number; height: number };
  /** Name font size as drawn (px at card size). */
  nameFontPx: number;
  /** The drawn name (may end in an ellipsis if it had to be cut). */
  nameText: string;
  /** The art window (U1: credits on the card are drawn here, clear of the name and type). */
  art: { x: number; y: number; width: number; height: number };
  /** The cost bubble's bounding square. */
  cost: { x: number; y: number; width: number; height: number };
  /** S-12-6: the click-symbol cost chip ("×3") in the art window's corner, or null. */
  clickCost: ClickCostBox | null;
}

const faceLayouts = new Map<string, SmallFaceLayout>();

/** Where a small face's parts are (memoised per card and size: the board asks on every redraw). */
export function smallFaceLayout(card: CardDef, w: number, h: number): SmallFaceLayout {
  const key = `${card.id}:${sizeKey(w, h)}`;
  const hit = faceLayouts.get(key);
  if (hit) return hit;
  const c = smallFace(card, w, h);
  const out = c.small!;
  c.root.destroy({ children: true });
  if (faceLayouts.size > 200) faceLayouts.clear();
  faceLayouts.set(key, out);
  return out;
}

interface FaceDraw {
  root: Container;
  fits: boolean;
  small?: SmallFaceLayout;
}

/** Cuts wrapped text to `lines` lines, ending with an ellipsis. */
function clampLines(t: Text, lines: number): void {
  const lh = Number(t.style.lineHeight);
  if (!(lh > 0) || t.height <= lines * lh + 0.5) return;
  const words = t.text.split(/\s+/);
  while (words.length > 1) {
    words.pop();
    t.text = `${words.join(' ')}…`;
    if (t.height <= lines * lh + 0.5) return;
  }
}

function drawCardFace(
  card: CardDef,
  w: number,
  h: number,
  detail: 'small' | 'full',
  artFrac: number,
  textK: number,
  nameK = 1,
  clampName = false,
): FaceDraw {
  const c = new Container();
  const color = sideColor(card.side);
  const r = Math.max(3, w * 0.07);
  const left = -w / 2;
  const top = -h / 2;
  const g = new Graphics();
  g.roundRect(left, top, w, h, r).fill(panelGradient(card.side));

  // Art window.
  const artX = left + w * 0.08;
  const artY = top + h * (detail === 'full' ? 0.15 : 0.17);
  const artW = w * 0.84;
  const artH = h * artFrac;
  g.roundRect(artX, artY, artW, artH, r * 0.6).fill({ color: 0x000000, alpha: 0.55 }).stroke({ width: 1, color, alpha: 0.4 });
  drawGlyph(g, card.art, artX, artY, artW, artH, color);
  glowRoundRect(g, left, top, w, h, r, color, Math.max(1, w * 0.02));
  const clicks = clickCostOf(card.text);

  // Cost bubble (top-left).
  const cr = w * (detail === 'full' ? 0.075 : 0.13);
  const ccx = left + cr + w * 0.04;
  const ccy = top + cr + w * 0.04;
  // U2: an identity has no cost (it is never played), so no cost bubble.
  const hasCost = card.type !== 'identity';
  if (hasCost) g.circle(ccx, ccy, cr).fill({ color: 0x000000, alpha: 0.85 }).stroke({ width: Math.max(1, cr * 0.15), color: theme.credit });
  c.addChild(g);

  if (hasCost) {
    const cost = new Text({
      text: String(card.cost),
      style: { fontFamily: theme.monoFamily, fontSize: cr * 1.2, fontWeight: '700', fill: theme.credit },
    });
    cost.anchor.set(0.5);
    cost.position.set(ccx, ccy);
    c.addChild(cost);
  }

  const nameSize = detail === 'full' ? w * 0.068 : Math.max(7, w * 0.125) * nameK;
  const nameX = detail === 'full' && hasCost ? ccx + cr + w * 0.04 : left + w * 0.06;
  const nameWrap = left + w - nameX - w * 0.05;
  const name = new Text({
    text: card.name,
    style: {
      fontFamily: theme.fontFamily,
      fontSize: nameSize,
      fontWeight: '700',
      fill: theme.text,
      wordWrap: true,
      wordWrapWidth: nameWrap,
      lineHeight: nameSize * 1.1,
      // Small faces: a word is never split across lines ("Codebustin|g", QA-S7-1) unless nothing else fits.
      breakWords: detail === 'full' || clampName,
    },
  });
  if (detail === 'full') {
    name.anchor.set(0, 0.5);
    name.position.set(nameX, ccy);
    // A long name on two lines (an identity: "Haas-Bioroid: Engineering the Future") hangs from the top edge.
    if (name.y - name.height / 2 < top + h * 0.02) {
      name.anchor.set(0, 0);
      name.position.set(nameX, top + h * 0.02);
    }
  } else {
    name.position.set(nameX, artY + artH + h * 0.03);
  }
  c.addChild(name);

  const typeSize = detail === 'full' ? w * 0.04 : Math.max(6, w * 0.085);
  const type = new Text({
    text: detail === 'full' ? typeLine(card) : (TYPE_LABEL[card.type] ?? card.type.toUpperCase()),
    style: { fontFamily: theme.monoFamily, fontSize: typeSize, fill: color, letterSpacing: 0.5 },
  });
  if (detail === 'full') {
    type.position.set(artX, artY + artH + h * 0.02);
  } else {
    type.anchor.set(0, 1);
    type.position.set(left + w * 0.06, top + h - h * 0.04);
  }
  c.addChild(type);

  let fits = true;
  let small: SmallFaceLayout | undefined;
  if (detail === 'small' && clicks) {
    // S-12-6: the click cost reads on the table and in the hand (rules text is zoom only):
    // a dark chip with the symbol and "×N" in the art window's bottom-right corner.
    const fs = Math.max(7, w * 0.15);
    const label = new Text({ text: `×${clicks.count}`, style: { fontFamily: theme.fontFamily, fontSize: fs, fontWeight: '800', fill: theme.text } });
    const ir = fs * 0.42;
    const pad = fs * 0.22;
    const gap = fs * 0.12;
    const chipW = pad + ir * 2 + gap + label.width + pad;
    const chipH = Math.max(ir * 2, label.height) + pad;
    const chipX = artX + artW - chipW - artW * 0.04;
    const chipY = artY + artH - chipH - artH * 0.06;
    const chip = new Graphics();
    chip.roundRect(chipX, chipY, chipW, chipH, chipH / 2).fill({ color: 0x05040a }).stroke({ width: 1, color: theme.text, alpha: 0.5 });
    drawClickIcon(chip, chipX + pad + ir, chipY + chipH / 2, ir, theme.text);
    label.anchor.set(0, 0.5);
    label.position.set(chipX + pad + ir * 2 + gap, chipY + chipH / 2);
    c.addChild(chip, label);
    CLICK_COSTS.set(c, {
      count: clicks.count,
      text: label.text,
      icon: { x: chipX + pad, y: chipY + chipH / 2 - ir, width: ir * 2, height: ir * 2 },
      box: { x: chipX, y: chipY, width: chipW, height: chipH },
      fontPx: fs,
    });
  }
  if (detail === 'small') {
    const typeTop = type.y - type.height;
    // A small gap between the name's last line and the type label.
    const nameBottom = typeTop - h * 0.01;
    if (clampName) clampLines(name, Math.max(1, Math.floor((nameBottom - name.y) / (nameSize * 1.1))));
    fits = name.y + name.height <= nameBottom && (clampName || name.width <= nameWrap + 0.5);
    small = {
      name: { x: name.x, y: name.y, width: name.width, height: name.height },
      type: { x: type.x, y: typeTop, width: type.width, height: type.height },
      nameFontPx: nameSize,
      nameText: name.text,
      art: { x: artX, y: artY, width: artW, height: artH },
      cost: hasCost ? { x: ccx - cr, y: ccy - cr, width: cr * 2, height: cr * 2 } : { x: ccx, y: ccy, width: 0, height: 0 },
      clickCost: CLICK_COSTS.get(c) ?? null,
    };
  }
  if (detail === 'full') {
    const bodyTop = type.y + typeSize * 1.8;
    const textSize = Math.max(9, Math.max(12, w * 0.052) * textK);
    const bodyStyle = (wrap: number) => ({
      fontFamily: theme.fontFamily,
      fontSize: textSize,
      fill: theme.text,
      wordWrap: true,
      wordWrapWidth: wrap,
      lineHeight: textSize * 1.3,
    });
    // S-12-6: "Click, click, click: …" starts with the click symbol and "×3: …" (its lines hang
    // beside the symbol); the card's other paragraphs follow below as usual.
    let bodyBottom = bodyTop;
    let rest = card.text;
    if (clicks) {
      const nl = clicks.rest.indexOf('\n');
      const first = nl < 0 ? clicks.rest : clicks.rest.slice(0, nl);
      rest = nl < 0 ? '' : clicks.rest.slice(nl + 1);
      const ir = textSize * 0.5;
      const indent = ir * 2 + textSize * 0.3;
      const line = new Text({ text: `×${clicks.count}: ${first}`, style: bodyStyle(artW - indent) });
      line.position.set(artX + indent, bodyTop);
      const icon = new Graphics();
      const iy = bodyTop + (textSize * 1.3) / 2;
      drawClickIcon(icon, artX + ir, iy, ir, theme.text);
      c.addChild(icon, line);
      const mark = new Text({ text: `×${clicks.count}`, style: bodyStyle(artW) });
      CLICK_COSTS.set(c, {
        count: clicks.count,
        text: mark.text,
        icon: { x: artX, y: iy - ir, width: ir * 2, height: ir * 2 },
        box: { x: artX, y: bodyTop, width: indent + mark.width, height: textSize * 1.3 },
        fontPx: textSize,
      });
      mark.destroy();
      bodyBottom = bodyTop + line.height;
    }
    if (rest) {
      const body = new Text({ text: rest, style: bodyStyle(artW) });
      body.position.set(artX, bodyBottom === bodyTop ? bodyTop : bodyBottom + textSize * 0.3);
      c.addChild(body);
      bodyBottom = body.y + body.height;
    }

    let y = bodyBottom + textSize * 0.7;
    if (card.flavor) {
      const flavor = new Text({
        text: card.flavor,
        style: {
          fontFamily: theme.fontFamily,
          fontSize: textSize * 0.85,
          fontStyle: 'italic',
          fill: theme.textDim,
          wordWrap: true,
          wordWrapWidth: artW,
          lineHeight: textSize * 1.15,
        },
      });
      flavor.position.set(artX, y);
      c.addChild(flavor);
      y += flavor.height;
    }
    let bottomLimit = top + h - h * 0.03;
    const drawn = drawStats(c, card, artX, artW, top + h - h * 0.035, Math.max(9, w * 0.042), color);
    if (drawn.stats.length > 0) {
      STATS.set(c, drawn.stats);
      bottomLimit = drawn.top - textSize * 0.3;
    }
    fits = bodyBottom <= bottomLimit && y - textSize * 0.7 <= bottomLimit;
  }
  return { root: c, fits, small };
}
