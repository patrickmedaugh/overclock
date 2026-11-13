// Card visuals. All art is generated from shapes at runtime (original
// placeholder art; no copied images). The `art` key on a card seeds the glyph
// so the same card always looks the same.
import type { CardDef, Side } from '@overclock/cards';
import { Container, FillGradient, Graphics, Rectangle, Sprite, Text, type Renderer, type Texture } from 'pixi.js';
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
}
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

const ZOOM_KEEP = 24;

/** A zoom face, centered at (0, 0), and what it says. */
export interface ZoomFace {
  root: Container;
  texts: string[];
  /** True if any text runs outside the card. */
  overflow: boolean;
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
    const meta = { texts: textsOf(c), overflow: textOverflows(c, w, h) };
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
    entry = bakeEntry(renderer, c, { texts: textsOf(c), overflow: textOverflows(c, w, h) });
  }
  baked.set(key, entry);
  evictZoomFaces();
  const meta = entry.meta ?? { texts: [], overflow: false };
  return { root: spriteOf(entry), texts: meta.texts, overflow: meta.overflow };
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

function statsLine(card: CardDef): string {
  const parts: string[] = [];
  if (card.strength !== undefined) parts.push(`Strength ${card.strength}`);
  if (card.memory !== undefined) parts.push(`Memory ${card.memory}`);
  if (card.advancementRequirement !== undefined) parts.push(`Advance ${card.advancementRequirement}`);
  if (card.agendaPoints !== undefined) parts.push(`Points ${card.agendaPoints}`);
  if (card.trashCost !== undefined) parts.push(`Trash ${card.trashCost}`);
  return parts.join('  ·  ');
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
    for (const nameK of artFrac > 0.28 ? [1] : [1, 0.9, 0.82]) {
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
}

export function smallFaceLayout(card: CardDef, w: number, h: number): SmallFaceLayout {
  const c = smallFace(card, w, h);
  const out = c.small!;
  c.root.destroy({ children: true });
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

  // Cost bubble (top-left).
  const cr = w * (detail === 'full' ? 0.075 : 0.13);
  const ccx = left + cr + w * 0.04;
  const ccy = top + cr + w * 0.04;
  g.circle(ccx, ccy, cr).fill({ color: 0x000000, alpha: 0.85 }).stroke({ width: Math.max(1, cr * 0.15), color: theme.credit });
  c.addChild(g);

  const cost = new Text({
    text: String(card.cost),
    style: { fontFamily: theme.monoFamily, fontSize: cr * 1.2, fontWeight: '700', fill: theme.credit },
  });
  cost.anchor.set(0.5);
  cost.position.set(ccx, ccy);
  c.addChild(cost);

  const nameSize = detail === 'full' ? w * 0.068 : Math.max(7, w * 0.125) * nameK;
  const nameX = detail === 'full' ? ccx + cr + w * 0.04 : left + w * 0.06;
  const name = new Text({
    text: card.name,
    style: {
      fontFamily: theme.fontFamily,
      fontSize: nameSize,
      fontWeight: '700',
      fill: theme.text,
      wordWrap: true,
      wordWrapWidth: left + w - nameX - w * 0.05,
      lineHeight: nameSize * 1.1,
      breakWords: true,
    },
  });
  if (detail === 'full') {
    name.anchor.set(0, 0.5);
    name.position.set(nameX, ccy);
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
  if (detail === 'small') {
    const typeTop = type.y - type.height;
    // A small gap between the name's last line and the type label.
    const nameBottom = typeTop - h * 0.01;
    if (clampName) clampLines(name, Math.max(1, Math.floor((nameBottom - name.y) / (nameSize * 1.1))));
    fits = name.y + name.height <= nameBottom;
    small = {
      name: { x: name.x, y: name.y, width: name.width, height: name.height },
      type: { x: type.x, y: typeTop, width: type.width, height: type.height },
      nameFontPx: nameSize,
      nameText: name.text,
    };
  }
  if (detail === 'full') {
    const bodyTop = type.y + typeSize * 1.8;
    const textSize = Math.max(9, Math.max(12, w * 0.052) * textK);
    const body = new Text({
      text: card.text,
      style: {
        fontFamily: theme.fontFamily,
        fontSize: textSize,
        fill: theme.text,
        wordWrap: true,
        wordWrapWidth: artW,
        lineHeight: textSize * 1.3,
      },
    });
    body.position.set(artX, bodyTop);
    c.addChild(body);

    let y = bodyTop + body.height + textSize * 0.7;
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
    const stats = statsLine(card);
    let bottomLimit = top + h - h * 0.03;
    if (stats) {
      const st = new Text({
        text: stats,
        style: { fontFamily: theme.monoFamily, fontSize: Math.max(9, w * 0.042), fill: color },
      });
      st.anchor.set(0, 1);
      st.position.set(artX, top + h - h * 0.035);
      if (st.width > artW) st.scale.set(artW / st.width);
      c.addChild(st);
      bottomLimit = st.y - st.height - textSize * 0.3;
    }
    fits = bodyTop + body.height <= bottomLimit && y - textSize * 0.7 <= bottomLimit;
  }
  return { root: c, fits, small };
}
