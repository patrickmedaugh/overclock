// Installed cards: the Corp's servers (ICE drawn sideways, stacked outward
// toward the Runner), the Runner's rig and memory counter, and the lit install
// spots / Play button while a hand card is picked. Draws only what the view
// says: cards the viewer may not see (`cardId: null`) are card backs, and every
// target and price comes from `view.handOptions`.
import { getCard } from '@overclock/cards';
import type { Action, CardOption, InstalledView, PlayerView, Side } from '@overclock/engine';
import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { createCardBack, createCardFace, glowRoundRect } from './cardFace';
import type { AnimRecord, Box, InstalledSnapshot, ServerSnapshot, TargetSnapshot } from './hook-types';
import { attachPress } from './input';
import { type BoardLayout, type ColumnGeom, type RigGeom, corpColumns, runnerRig } from './layout';
import { targetText } from './picking';
import { memoryText, pileLabel, serverLabel } from './terms';
import { sideColor, theme, timing } from './theme';
import { ease, type Tweens } from './tween';

export interface TabletopCallbacks {
  /** Long-press on a card the viewer may read. */
  onLongPress(cardId: string, from: Box): void;
  onLongPressEnd(): void;
  /** A tap on an installed card or an empty slot (cancels a picked hand card). */
  onBoardTap(): void;
  /** A tap on a lit target. */
  onTarget(option: CardOption): void;
  log(rec: Omit<AnimRecord, 'startedAt'>): void;
}

interface Placed {
  uid: string;
  side: Side;
  zone: 'ice' | 'content' | 'rig';
  /** What the view says (null: hidden from the viewer). */
  cardId: string | null;
  faceUp: boolean;
  root: Container;
  art: Container;
  artKey: string;
  hit: Box;
  draw: Box;
  rotation: number;
  detach: () => void;
}

interface Target {
  option: CardOption;
  label: string;
  box: Box;
  root: Container;
}

function center(b: Box): { x: number; y: number } {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

function fit(t: Text, maxW: number, maxH = Infinity): void {
  t.scale.set(1);
  const k = Math.min(1, maxW / Math.max(1, t.width), maxH / Math.max(1, t.height));
  t.scale.set(k);
}

/** Where a target sits and what it says, from one engine option. */
export interface TargetSpec {
  option: CardOption;
  box: Box;
  /** Snapshot / accessibility label, e.g. "Server 1 · 2 credits". */
  label: string;
  /** Text on the chip (may wrap). */
  chip: string;
  /** Where the chip goes inside the box. */
  chipAt: Box;
}

export class Tabletop {
  /** Server labels, slots and the HQ widget (under the piles). */
  readonly decor = new Container();
  /** Installed cards (over the piles). */
  readonly cards = new Container();
  /** Lit targets (over everything on the table, under the hand). */
  readonly targets = new Container();
  private layout: BoardLayout | null = null;
  private view: PlayerView | null = null;
  private placed = new Map<string, Placed>();
  private columns: ColumnGeom[] = [];
  private rig: RigGeom | null = null;
  private decorKey = '';
  private memory: Text | null = null;
  private hqCount: Text | null = null;
  private lit: Target[] = [];
  private detachers: (() => void)[] = [];

  constructor(
    private readonly fx: Tweens,
    private readonly ui: Tweens,
    private readonly callbacks: TabletopCallbacks,
  ) {
    this.cards.sortableChildren = true;
  }

  /** Clears everything for a new layout or seat. */
  reset(layout: BoardLayout): void {
    this.layout = layout;
    this.view = null;
    this.clearTargets();
    for (const p of this.placed.values()) this.destroyPlaced(p);
    this.placed.clear();
    this.clearDecor();
    this.decorKey = '';
  }

  /** Brings the table in line with `view`. New cards appear in place (see flyIn for animation). */
  update(view: PlayerView): void {
    const layout = this.layout;
    if (!layout) return;
    this.view = view;
    const shapes = view.corpServers.map((s) => ({ id: s.id, ice: s.ice.length, content: s.content.length }));
    this.columns = corpColumns(layout, shapes);
    this.rig = runnerRig(layout, view.rig.length);
    const key = JSON.stringify(shapes) + `|${view.rig.length}`;
    if (key !== this.decorKey) {
      this.decorKey = key;
      this.drawDecor(view);
    }
    if (this.memory) this.memory.text = memoryText(view.memory.used, view.memory.limit);
    if (this.hqCount) this.hqCount.text = String(view.players.corp.handCount);

    const seen = new Set<string>();
    view.corpServers.forEach((s, i) => {
      const col = this.columns[i];
      if (!col) return;
      s.ice.forEach((c, k) => {
        const g = col.ice[k];
        if (g) this.place(c, 'corp', 'ice', g, col.dir, seen, 10 + k);
      });
      s.content.forEach((c, k) => {
        const g = col.content[k];
        if (g) this.place(c, 'corp', 'content', g, col.dir, seen, 5 + k);
      });
    });
    view.rig.forEach((c, k) => {
      const g = this.rig?.cards[k];
      if (g) this.place(c, 'runner', 'rig', g, 1, seen, k);
    });
    for (const [uid, p] of this.placed) {
      if (!seen.has(uid)) {
        this.destroyPlaced(p);
        this.placed.delete(uid);
      }
    }
  }

  /**
   * Animates a just-installed card from `from` (its hand slot) to its place.
   * The owner's Corp cards turn face down on the way. Returns the scheduled ms.
   */
  flyIn(uid: string, from: Box, faceCardId: string | null): number {
    const p = this.placed.get(uid);
    if (!p) return 0;
    const to = center(p.draw);
    const root = p.root;
    const art = p.art;
    const startScale = Math.max(0.2, from.width / Math.max(1, p.rotation === 0 ? p.draw.width : p.draw.height));
    const start = center(from);
    root.position.set(start.x, start.y);
    root.scale.set(startScale);
    root.zIndex = 1000;
    art.rotation = 0;
    // A face that turns over halfway (Corp installs are face down).
    const def = faceCardId ? getCard(faceCardId) : undefined;
    let face: Container | null = null;
    if (def && p.side === 'corp') {
      const w = p.rotation === 0 ? p.draw.width : p.draw.height;
      const h = p.rotation === 0 ? p.draw.height : p.draw.width;
      face = createCardFace(def, w, h, 'small');
      root.addChild(face);
      art.visible = false;
    }
    root.eventMode = 'none';
    this.fx.add({
      target: root,
      to: { x: to.x, y: to.y },
      duration: timing.installFlight,
      ease: ease.outCubic,
      owner: root,
      onUpdate: (t) => {
        const e = ease.outCubic(t);
        root.scale.set(startScale + (1 - startScale) * e);
        art.rotation = p.rotation * e;
        if (face) {
          face.rotation = art.rotation;
          const turned = t >= 0.5;
          face.visible = !turned;
          art.visible = turned;
          const flip = t >= 1 ? 1 : Math.max(0.05, Math.abs(1 - 2 * t));
          face.scale.x = flip;
          art.scale.x = flip;
        }
      },
      onComplete: () => {
        if (face && !face.destroyed) face.destroy({ children: true });
        art.visible = true;
        art.scale.x = 1;
        art.rotation = p.rotation;
        root.scale.set(1);
        root.zIndex = p.zone === 'ice' ? 10 : 5;
        root.eventMode = 'static';
      },
    });
    this.callbacks.log({ kind: 'install_flight', scheduledMs: timing.installFlight, box: { ...p.draw } });
    return timing.installFlight;
  }

  /** A new server's column pulses in. */
  openServer(id: string): void {
    const col = this.columns.find((c) => c.id === id);
    const layout = this.layout;
    if (!col || !layout) return;
    const g = new Graphics();
    const b = col.column;
    glowRoundRect(g, b.x, b.y, b.width, b.height, 6, theme.corp, 2, 1.4);
    g.alpha = 1;
    this.decor.addChild(g);
    this.fx.add({ target: g, to: { alpha: 0 }, duration: timing.serverOpen, ease: ease.linear, owner: g, onComplete: () => g.destroy() });
    this.callbacks.log({ kind: 'server_open', scheduledMs: timing.serverOpen, box: { ...b } });
  }

  /** Target placement for each option of a picked hand card (`from` = the card's box, for Play). */
  targetSpecs(options: readonly CardOption[], from: Box): TargetSpec[] {
    const layout = this.layout;
    if (!layout) return [];
    const out: TargetSpec[] = [];
    for (const option of options) {
      const a = option.action;
      const { label, chip } = targetText(a, option.cost);
      if (a.type === 'install' && a.server !== undefined) {
        const col = this.columns.find((c) => c.id === a.server);
        if (!col) continue;
        // ICE: the chip where the next ICE goes (outer end); other cards: at the root.
        const isIce = getCard(this.handCardId(a.handIndex) ?? '')?.type === 'ice';
        const chipH = Math.min(col.column.height, 2 * layout.zoneLabel + 12);
        const chipAt = isIce
          ? col.dir === 1
            ? { x: col.column.x, y: col.column.y + col.column.height - chipH, width: col.column.width, height: chipH }
            : { x: col.column.x, y: col.column.y, width: col.column.width, height: chipH }
          : { x: col.root.x, y: col.root.y + (col.root.height - chipH) / 2, width: col.root.width, height: chipH };
        out.push({ option, box: col.column, label, chip, chipAt });
      } else if (a.type === 'install') {
        const b = this.rig?.install;
        if (!b) continue;
        out.push({ option, box: b, label, chip, chipAt: b });
      } else if (a.type === 'play') {
        const w = Math.min(layout.board.width, Math.max(132, Math.round(layout.card.width * 2.4)));
        const h = 44;
        const x = Math.max(layout.board.x, Math.min(from.x + from.width / 2 - w / 2, layout.board.x + layout.board.width - w));
        const y = Math.max(layout.safe.y, from.y - layout.gap - h);
        const b = { x, y, width: w, height: h };
        out.push({ option, box: b, label, chip, chipAt: b });
      }
    }
    return out;
  }

  showTargets(specs: readonly TargetSpec[]): void {
    this.clearTargets();
    const layout = this.layout;
    if (!layout) return;
    for (const spec of specs) {
      const { box: b, option } = spec;
      const ok = option.reject === null;
      const color = ok ? theme.credit : theme.warn;
      const root = new Container();
      root.position.set(b.x, b.y);
      root.hitArea = new Rectangle(0, 0, b.width, b.height);
      root.label = `target:${spec.label}`;
      const g = new Graphics();
      const r = Math.min(8, b.width / 6);
      g.roundRect(0, 0, b.width, b.height, r).fill({ color, alpha: ok ? 0.14 : 0.07 });
      glowRoundRect(g, 0, 0, b.width, b.height, r, color, 2, ok ? 1.2 : 0.6);
      const c = spec.chipAt;
      const cx = c.x - b.x;
      const cy = c.y - b.y;
      g.roundRect(cx + 2, cy + 2, c.width - 4, c.height - 4, 6).fill({ color: 0x07060d, alpha: 0.88 }).stroke({ width: 1.5, color, alpha: 0.9 });
      const text = new Text({
        text: spec.chip,
        style: {
          fontFamily: theme.fontFamily,
          fontSize: Math.max(11, Math.round(13 * layout.scale)),
          fontWeight: '800',
          fill: color,
          align: 'center',
          lineHeight: Math.max(12, Math.round(14 * layout.scale)),
        },
      });
      text.anchor.set(0.5);
      text.position.set(cx + c.width / 2, cy + c.height / 2);
      fit(text, c.width - 8, c.height - 4);
      root.addChild(g, text);
      root.alpha = 0;
      this.ui.add({ target: root, to: { alpha: ok ? 1 : 0.85 }, duration: timing.targetsIn, owner: root });
      this.targets.addChild(root);
      this.detachers.push(
        attachPress(root, {
          onDown: () => {
            root.alpha = 0.7;
          },
          onRelease: () => {
            if (!root.destroyed) root.alpha = ok ? 1 : 0.85;
          },
          onTap: () => this.callbacks.onTarget(option),
        }),
      );
      this.lit.push({ option, label: spec.label, box: b, root });
    }
  }

  clearTargets(): void {
    for (const d of this.detachers) d();
    this.detachers = [];
    for (const t of this.lit) {
      this.ui.cancel(t.root);
      t.root.destroy({ children: true });
    }
    this.lit = [];
  }

  get targeting(): boolean {
    return this.lit.length > 0;
  }

  snapshot(): {
    servers: ServerSnapshot[];
    rig: InstalledSnapshot[];
    memory: { text: string; box: Box };
    targets: TargetSnapshot[];
    tableTexts: string[];
  } {
    const view = this.view;
    const snap = (c: InstalledView): InstalledSnapshot => {
      const p = this.placed.get(c.uid);
      const zero = { x: 0, y: 0, width: 0, height: 0 };
      return { uid: c.uid, cardId: c.cardId, faceUp: p?.faceUp ?? false, box: p ? { ...p.hit } : zero, drawn: p ? { ...p.draw } : zero };
    };
    const servers: ServerSnapshot[] = (view?.corpServers ?? []).map((s, i) => ({
      id: s.id,
      label: serverLabel(s.id),
      box: this.columns[i] ? { ...this.columns[i].column } : { x: 0, y: 0, width: 0, height: 0 },
      ice: s.ice.map(snap),
      content: s.content.map(snap),
    }));
    return {
      servers,
      rig: (view?.rig ?? []).map(snap),
      memory: { text: this.memory?.text ?? '', box: this.rig ? { ...this.rig.memory } : { x: 0, y: 0, width: 0, height: 0 } },
      tableTexts: this.decor.children.filter((c): c is Text => c instanceof Text).map((t) => t.text),
      targets: this.lit.map((t) => ({ box: { ...t.box }, label: t.label, lit: true, reject: t.option.reject, action: JSON.parse(JSON.stringify(t.option.action)) as Action })),
    };
  }

  // ---- internals ------------------------------------------------------------

  private handCardId(i: number): string | undefined {
    const v = this.view;
    return v?.players[v.viewer].hand?.[i];
  }

  private place(c: InstalledView, side: Side, zone: Placed['zone'], g: { hit: Box; draw: Box }, dir: 1 | -1, seen: Set<string>, z: number): void {
    seen.add(c.uid);
    // On the table: Runner cards face up for both; Corp cards face down (backs) until rezzed.
    const faceUp = side === 'runner' ? c.cardId !== null : c.faceUp && c.cardId !== null;
    const rotation = zone === 'ice' ? (dir === 1 ? Math.PI / 2 : -Math.PI / 2) : 0;
    const w = rotation === 0 ? g.draw.width : g.draw.height;
    const h = rotation === 0 ? g.draw.height : g.draw.width;
    const artKey = `${faceUp ? c.cardId : 'back'}:${w.toFixed(1)}x${h.toFixed(1)}:${rotation.toFixed(2)}`;
    let p = this.placed.get(c.uid);
    if (p && p.artKey !== artKey) {
      this.destroyPlaced(p);
      this.placed.delete(c.uid);
      p = undefined;
    }
    if (!p) {
      const root = new Container();
      root.label = `installed:${c.uid}`;
      const def = faceUp && c.cardId ? getCard(c.cardId) : undefined;
      const art = def ? createCardFace(def, w, h, 'small') : createCardBack(side, w, h);
      art.rotation = rotation;
      root.addChild(art);
      this.cards.addChild(root);
      const created: Placed = {
        uid: c.uid,
        side,
        zone,
        cardId: c.cardId,
        faceUp,
        root,
        art,
        artKey,
        hit: g.hit,
        draw: g.draw,
        rotation,
        detach: () => {},
      };
      created.detach = attachPress(root, {
        onTap: () => this.callbacks.onBoardTap(),
        onLongPress: () => {
          // Only cards the viewer may read zoom (the Runner never sees a face-down Corp card).
          if (created.cardId) this.callbacks.onLongPress(created.cardId, created.draw);
        },
        onLongPressEnd: () => this.callbacks.onLongPressEnd(),
      });
      p = created;
      this.placed.set(c.uid, p);
    }
    p.cardId = c.cardId;
    p.hit = g.hit;
    p.draw = g.draw;
    const ctr = center(g.draw);
    this.fx.cancel(p.root);
    p.root.position.set(ctr.x, ctr.y);
    p.root.scale.set(1);
    p.root.hitArea = new Rectangle(g.hit.x - ctr.x, g.hit.y - ctr.y, g.hit.width, g.hit.height);
    p.root.zIndex = z;
  }

  private destroyPlaced(p: Placed): void {
    p.detach();
    this.fx.cancel(p.root);
    if (!p.root.destroyed) p.root.destroy({ children: true });
  }

  private clearDecor(): void {
    for (const c of this.decor.removeChildren()) c.destroy({ children: true });
    this.memory = null;
    this.hqCount = null;
  }

  private drawDecor(view: PlayerView): void {
    const layout = this.layout;
    if (!layout) return;
    this.clearDecor();
    const zl = layout.zoneLabel;
    const corp = sideColor('corp');
    const runner = sideColor('runner');
    const g = new Graphics();
    const label = (text: string, b: Box, color: number, align: 'center' | 'left' | 'right' = 'center'): Text => {
      const t = new Text({ text, style: { fontFamily: theme.monoFamily, fontSize: Math.max(9, zl * 0.9), fontWeight: '700', fill: color, letterSpacing: 0.5 } });
      t.anchor.set(align === 'center' ? 0.5 : align === 'left' ? 0 : 1, 0.5);
      t.position.set(align === 'center' ? b.x + b.width / 2 : align === 'left' ? b.x : b.x + b.width, b.y + b.height / 2);
      fit(t, b.width - 2);
      this.decor.addChild(t);
      return t;
    };
    for (const col of this.columns) {
      if (col.id === 'new') continue;
      label(serverLabel(col.id), col.label, corp);
      const pile = layout.centralPiles && (col.id === 'rd' || col.id === 'archives');
      if (pile) continue;
      // An outline for the root slot (where agendas, assets and upgrades go).
      const r = col.root;
      const dw = Math.min(layout.installed.width, r.width);
      g.roundRect(r.x + (r.width - dw) / 2, r.y, dw, r.height, 4).stroke({ width: 1, color: corp, alpha: 0.28 });
      if (col.id === 'hq' && layout.centralPiles) {
        // HQ is the Corp's hand: a back with the hand count.
        const back = createCardBack('corp', dw, r.height);
        back.alpha = 0.3;
        back.position.set(r.x + r.width / 2, r.y + r.height / 2);
        this.decor.addChild(back);
        const t = new Text({
          text: String(view.players.corp.handCount),
          style: { fontFamily: theme.monoFamily, fontSize: Math.max(12, zl * 1.4), fontWeight: '800', fill: theme.text },
        });
        t.anchor.set(0.5);
        t.position.set(r.x + r.width / 2, r.y + r.height / 2);
        this.decor.addChild(t);
        this.hqCount = t;
      }
    }
    // ICE lanes: a faint line from each server's root toward the Runner.
    for (const col of this.columns) {
      if (col.id === 'new' || col.ice.length === 0) continue;
      const x = col.column.x + col.column.width / 2;
      const y0 = col.dir === 1 ? col.root.y + col.root.height : col.root.y;
      const last = col.ice[col.ice.length - 1]!.hit;
      const y1 = col.dir === 1 ? last.y + last.height : last.y;
      g.moveTo(x, y0).lineTo(x, y1).stroke({ width: 1, color: corp, alpha: 0.35 });
    }
    this.decor.addChildAt(g, 0);

    const rig = this.rig;
    if (rig) {
      this.memory = label(memoryText(view.memory.used, view.memory.limit), rig.memory, runner, 'right');
      if (rig.pileLabels) {
        label(pileLabel('runner', 'deck'), rig.pileLabels.deck, runner);
        label(pileLabel('runner', 'discard'), rig.pileLabels.discard, runner);
      }
    }
  }
}
