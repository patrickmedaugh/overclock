// The viewer's hand: card sprites, draw and discard flights, press/long-press,
// and the discard picker's marks (UI state only; the engine gets the indices).
import { getCard } from '@overclock/cards';
import type { Side } from '@overclock/engine';
import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { centeredBox } from './geometry';
import { createCardBack, createCardFace, glowRoundRect } from './cardFace';
import type { AnimRecord, Box } from './hook-types';
import { attachPress } from './input';
import { type BoardLayout, handSlots, nearestSlot } from './layout';
import { theme, timing } from './theme';
import { ease, type Tweens } from './tween';
import { STRIP_PULL, isUpward } from './handGesture';

export interface HandCard {
  cardId: string;
  /** Positioned at the card center; tweened x/y/scale. */
  root: Container;
  /** Flipped (scale.x) during the draw flight. */
  flip: Container;
  back: Container;
  face: Container;
  /** "Discard" stamp shown while picked in the discard picker (made on first use). */
  mark: Container | null;
  marked: boolean;
  /** Glow shown while the card is picked to play (made on first use). */
  glow: Graphics | null;
  /** Outline shown while the zoom shows this card during a hold-and-slide (made on first use). */
  outline: Graphics | null;
  selected: boolean;
  detach: () => void;
  pressed: boolean;
}

export interface HandCallbacks {
  onTap(index: number): void;
  /** QA-S4-1: a finger went down on hand card `index` (may become a hold: pre-draw the zoom faces). */
  onPress(index: number): void;
  /** The press on a hand card ended (tap, hold or cancel). */
  onPressEnd(): void;
  onLongPress(cardId: string, from: Box, index: number): void;
  onLongPressEnd(): void;
  /** S-04-3: the held finger slid onto hand card `index`: show it in the zoom. `at`: the move's event time. */
  onZoomSlide(cardId: string, box: Box, at: number, index: number): void;
  /**
   * S-15-6: the finger pulls hand card `index` up out of the strip (an upward drag, or out of the
   * strip during a hold-to-read: then `index` is the card being read). Return true to lift it:
   * the finger's moves and release then go to `onDrag` / `onDrop`.
   */
  onPull?(index: number, x: number, y: number, at: number): boolean;
  onDrag?(x: number, y: number, at: number): void;
  onDrop?(x: number, y: number, cancelled: boolean): void;
  log(rec: Omit<AnimRecord, 'startedAt'>): void;
  /** Sprint 15: a card sprite starts flying (draw / discard); call the returned function when it lands. */
  flight?(kind: 'draw' | 'discard', cardId: string | null, root: Container, w: number, h: number): () => void;
  /** Something drawn moved outside a tween (S-15-1 hover): draw the next frame. */
  changed?(): void;
}

/** S-15-1 (mouse): a pointed-at hand card rises this share of its height and leans up to this much toward the pointer. */
const HOVER_RISE = 0.06;
const HOVER_LEAN = (4 * Math.PI) / 180;
const HOVER_MS = 90;

export class Hand {
  readonly container = new Container();
  /**
   * S-15-6: the cards in the hand strip (inside `container`). It drops below the screen while a
   * card is held (`minimize`); the held card stays in it (moving it would lose Pixi's track of the
   * finger's press) and is drawn against the strip's offset, so it stays under the finger.
   */
  private readonly strip = new Container();
  private cards: HandCard[] = [];
  /** S-15-6: the strip is dropped (or dropping) below the screen. */
  private minimized = false;
  /** S-15-6: the held card is dimmed (it can't be played now). */
  private liftDimmed = false;
  /** S-15-6: where the held card's centre is on screen (the strip may be offset under it). */
  private readonly liftAt = { x: 0, y: 0 };
  private layout: BoardLayout | null = null;
  /** The layout generation the sprites were made for (sizes). */
  sizeKey = '';
  /** The card the zoom shows while a hand card is held (outlined), or null. */
  private browsing: HandCard | null = null;
  /** S-07-6: the card lifted out of the hand view, following the finger (or waiting on its place). */
  private lifted: HandCard | null = null;
  /** S-15-1: the card the mouse points at (desktop), or null. */
  private hovered: HandCard | null = null;

  constructor(
    private readonly side: Side,
    private readonly fx: Tweens,
    private readonly ui: Tweens,
    private readonly callbacks: HandCallbacks,
  ) {
    this.container.sortableChildren = true;
    this.container.label = `hand:${side}`;
    this.strip.sortableChildren = true;
    this.strip.label = `hand-strip:${side}`;
    this.container.addChild(this.strip);
  }

  /** S-15-6: true while the strip is dropped below the screen (a card is held). */
  get isMinimized(): boolean {
    return this.minimized;
  }

  /**
   * S-15-6: the strip drops below the screen (`on`) or comes back up, over `ms` on the input
   * queue (never skipped, never blocks). The held card is not in the strip, so it does not move.
   */
  minimize(on: boolean, ms: number): void {
    const layout = this.layout;
    if (on === this.minimized && (on || this.strip.y === 0)) return;
    this.minimized = on;
    this.ui.cancel(this.strip);
    const to = on && layout ? Math.max(0, layout.viewport.height - layout.handArea.y) + 4 : 0;
    if (ms <= 0) {
      this.strip.y = to;
      this.pinLifted();
    } else {
      this.ui.add({ target: this.strip, to: { y: to }, duration: ms, ease: on ? ease.inCubic : ease.outCubic, owner: this.strip, onUpdate: () => this.pinLifted() });
    }
    this.callbacks.log({ kind: on ? 'hand_minimize' : 'hand_restore', scheduledMs: Math.max(0, ms) });
  }

  /** The held card stays where the finger put it while the strip moves under it. */
  private pinLifted(): void {
    const card = this.lifted;
    if (card && !card.root.destroyed && card.root.parent === this.strip) card.root.y = this.liftAt.y - this.strip.y;
  }

  /**
   * S-15-6: the held card was let go on its place: it stays exactly there (the play's flight starts
   * from it) while the strip comes back up. The finger is up, so it can leave the strip now.
   */
  park(): void {
    if (this.lifted) this.unhome(this.lifted);
  }

  /** Puts a card drawn outside the strip (held, or let go and refused) back in it, where it is now on screen. */
  private home(card: HandCard): void {
    if (card.root.parent === this.strip || card.root.destroyed) return;
    card.root.y -= this.strip.y;
    this.strip.addChild(card.root);
  }

  /** Takes a strip card out into `container` where it is now on screen (it is held, or leaving the hand). */
  private unhome(card: HandCard): void {
    if (card.root.parent !== this.strip || card.root.destroyed) return;
    card.root.y += this.strip.y;
    this.container.addChild(card.root);
  }

  get count(): number {
    return this.cards.length;
  }

  /** Card ids in hand order. */
  get ids(): string[] {
    return this.cards.map((c) => c.cardId);
  }

  /** The hand index outlined by a hold-and-slide, or null. */
  get browsingIndex(): number | null {
    const i = this.browsing ? this.cards.indexOf(this.browsing) : -1;
    return i >= 0 ? i : null;
  }

  /** Outlines `card` as the one the zoom shows (null: none). */
  private setBrowsing(card: HandCard | null): void {
    const prev = this.browsing;
    if (prev === card) return;
    if (prev?.outline && !prev.root.destroyed) prev.outline.visible = false;
    this.browsing = card;
    if (!card || card.root.destroyed) return;
    if (!card.outline) {
      card.outline = this.createOutline();
      card.flip.addChild(card.outline);
    }
    card.outline.visible = true;
    this.restack();
  }

  /** The held finger is at global x/y: the zoom follows the nearest hand card (S-04-3). */
  private slide(x: number, y: number, at: number): void {
    const layout = this.layout;
    if (!layout || !this.browsing) return;
    const i = nearestSlot(handSlots(layout, this.cards.length), x, y);
    const card = this.cards[i];
    if (!card || card === this.browsing) return;
    this.setBrowsing(card);
    this.callbacks.onZoomSlide(card.cardId, this.cardBox(card), at, i);
  }

  /**
   * S-07-6: lifts hand card `index` out of the strip: it is drawn over the
   * board, takes no taps, and follows `dragTo` (the finger) with no tween.
   */
  lift(index: number, dimmed = false): boolean {
    const card = this.cards[index];
    if (!card) return false;
    this.fx.cancel(card.root);
    this.ui.cancel(card.root);
    this.ui.cancel(card.flip.scale);
    this.ui.cancel(card.flip.pivot);
    this.ui.cancel(card.flip);
    card.flip.pivot.y = 0;
    card.flip.rotation = 0;
    if (this.hovered === card) this.hovered = null;
    // S-15-6: a card picked up from the strip keeps the finger's moves (its own press goes on).
    card.root.eventMode = card.pressed ? 'static' : 'none';
    card.flip.scale.set(1.08);
    card.root.scale.set(1);
    card.back.visible = false;
    card.face.visible = true;
    // S-15-6: a card that can't be played now lifts dimmed (nothing lights).
    this.liftDimmed = dimmed;
    card.face.alpha = dimmed ? 0.5 : 1;
    card.flip.tint = dimmed ? 0x8a8a8a : 0xffffff;
    card.root.zIndex = 2000;
    this.liftAt.x = card.root.x;
    this.liftAt.y = card.root.y + this.strip.y;
    this.lifted = card;
    this.lastLean = 0;
    this.restack();
    return true;
  }

  /** S-15-6: the held card is dimmed (it can't be played now). */
  get liftedDimmed(): boolean {
    return this.lifted !== null && this.liftDimmed;
  }

  /** Undoes the held card's dimming. */
  private undim(card: HandCard): void {
    if (card.root.destroyed) return;
    card.face.alpha = card.marked ? 0.55 : 1;
    card.flip.tint = 0xffffff;
  }

  /** The lifted card's centre goes to x/y (set in the move handler: no tween, no allocation). */
  dragTo(x: number, y: number): void {
    const card = this.lifted;
    if (!card) return;
    this.liftAt.x = x;
    this.liftAt.y = y;
    card.root.position.set(x, card.root.parent === this.strip ? y - this.strip.y : y);
  }

  /** S-15-1: the lifted card leans `angle` (radians) and straightens again once the finger stops. */
  lean(angle: number): void {
    const card = this.lifted;
    if (!card) return;
    this.lastLean = angle;
    this.ui.cancel(card.root);
    card.root.rotation = angle;
    if (angle !== 0) this.ui.add({ target: card.root, to: { rotation: 0 }, delay: 30, duration: 80, ease: ease.outCubic, owner: card.root });
  }

  /** The lean the last finger move gave the lifted card (radians), before it eases back. */
  lastLean = 0;

  /** How far the lifted card leans now (radians; 0 when none is lifted). */
  liftedRotation(): number {
    return this.lifted?.root.rotation ?? 0;
  }

  /** Where the lifted card is drawn now, or null. */
  liftedBox(): Box | null {
    return this.lifted ? this.cardBox(this.lifted) : null;
  }

  /** The hand index of the lifted card, or null. */
  get liftedIndex(): number | null {
    const i = this.lifted ? this.cards.indexOf(this.lifted) : -1;
    return i >= 0 ? i : null;
  }

  /**
   * S-07-6: the lifted card goes back to its place in the strip over `ms`
   * (0: at once) and takes taps again.
   */
  settle(ms: number): void {
    const card = this.lifted;
    this.lifted = null;
    const layout = this.layout;
    if (!card || card.root.destroyed || !layout) return;
    this.undim(card);
    this.home(card);
    const i = this.cards.indexOf(card);
    const slot = handSlots(layout, this.cards.length)[i];
    card.root.eventMode = 'static';
    this.ui.cancel(card.flip.scale);
    this.fx.cancel(card.root);
    this.ui.cancel(card.root);
    if (!slot) return;
    const to = { x: slot.x + slot.width / 2, y: slot.y + slot.height / 2 };
    if (ms <= 0) {
      card.root.position.set(to.x, to.y);
      card.root.rotation = 0;
      card.flip.scale.set(1);
      this.restack();
      return;
    }
    // S-15-1: it glides home and straightens on the way.
    this.ui.add({ target: card.root, to: { ...to, rotation: 0 }, duration: ms, ease: ease.outCubic, owner: card.root, onComplete: () => this.restack() });
    this.ui.add({ target: card.flip.scale, to: { x: 1, y: 1 }, duration: ms, owner: card.flip });
  }

  /**
   * S-07-6: the lifted card was dropped on a place: it stays where it is
   * (the play's flight starts from there) until the game answers. The next
   * sync puts it back if the play did not happen.
   */
  leaveLifted(): void {
    if (this.lifted) this.undim(this.lifted);
    this.lifted = null;
  }

  /** Drops every sprite (they are rebuilt the next time this hand is shown). */
  reset(): void {
    for (const c of this.cards) this.destroyCard(c);
    this.cards = [];
    this.sizeKey = '';
    this.minimize(false, 0);
  }

  /** Uses a new layout with the same sizes (positions only; no sprite is rebuilt). */
  useLayout(layout: BoardLayout): void {
    this.layout = layout;
  }

  /** Rebuilds all sprites (resize or a new size), without animation. */
  setLayout(layout: BoardLayout, ids: readonly string[]): void {
    this.layout = layout;
    this.sizeKey = layout.sizeKey;
    for (const c of this.cards) this.destroyCard(c);
    this.cards = [];
    const slots = handSlots(layout, ids.length);
    ids.forEach((id, i) => {
      const card = this.createCard(id);
      const slot = slots[i];
      if (slot) this.place(card, slot);
      this.cards.push(card);
    });
    this.restack();
  }

  /**
   * Brings sprites in line with the engine's hand. The last `drawnCount`
   * cards fly in from `deck` (after `delay` ms); everything else slides to
   * its new slot.
   */
  sync(ids: readonly string[], drawnCount: number, deck: Box, delay = 0, delays?: readonly number[]): void {
    const layout = this.layout;
    if (!layout) return;
    // Keep the longest matching prefix; rebuild the rest.
    let keep = 0;
    const firstNew = ids.length - drawnCount;
    while (keep < this.cards.length && keep < ids.length && keep < firstNew && this.cards[keep]?.cardId === ids[keep]) keep++;
    for (const c of this.cards.slice(keep)) this.destroyCard(c);
    this.cards = this.cards.slice(0, keep);

    const slots = handSlots(layout, ids.length);
    for (let i = keep; i < ids.length; i++) {
      const id = ids[i];
      if (id === undefined) continue;
      const card = this.createCard(id);
      this.cards.push(card);
      const slot = slots[i];
      if (!slot) continue;
      if (i >= firstNew) {
        // Sprint 15: the planner's ripple (S-15-3), else the Sprint 1 stagger.
        const d = delay + (delays?.[i - firstNew] ?? (i - firstNew) * 50);
        this.flyIn(card, slot, deck, d);
        this.callbacks.log({ kind: 'draw_flight', scheduledMs: d + timing.drawFlight, box: slot });
      } else {
        this.place(card, slot);
      }
    }
    this.slideTo(slots, keep);
    this.restack();
  }

  /**
   * Flies the cards at `indices` (into the current hand) to the discard pile
   * and closes the gap. Returns the scheduled duration (ms).
   */
  discardOut(indices: readonly number[], pile: Box, delays?: readonly number[]): number {
    const layout = this.layout;
    if (!layout || indices.length === 0) return 0;
    const set = new Set(indices);
    const leaving = this.cards.filter((_, i) => set.has(i));
    this.cards = this.cards.filter((_, i) => !set.has(i));
    const scale = pile.width / layout.card.width;
    let end = 0;
    leaving.forEach((card, k) => {
      this.unhome(card);
      const delay = delays?.[k] ?? k * timing.discardStagger;
      end = Math.max(end, delay + timing.discardFlight);
      const landed = this.callbacks.flight?.('discard', card.cardId, card.root, layout.card.width, layout.card.height);
      card.root.eventMode = 'none';
      card.root.zIndex = 600 + k;
      if (card.mark) card.mark.visible = false;
      if (card.glow) card.glow.visible = false;
      const root = card.root;
      this.fx.add({
        target: root,
        to: { x: pile.x + pile.width / 2, y: pile.y + pile.height / 2, alpha: 0.85 },
        duration: timing.discardFlight,
        delay,
        ease: ease.inOutCubic,
        owner: root,
        onUpdate: (t) => {
          const s = 1 + (scale - 1) * ease.inOutCubic(t);
          root.scale.set(s);
          root.rotation = Math.sin(t * Math.PI) * 0.25;
        },
        onComplete: () => {
          landed?.();
          this.destroyCard(card);
        },
      });
    });
    this.slideTo(handSlots(layout, this.cards.length), this.cards.length);
    this.restack();
    return end;
  }

  /** Sprint 15: takes out the last hand card showing `cardId` (damage: the card flies to the Heap from where it is). */
  takeOutId(cardId: string): { card: HandCard; box: Box } | null {
    for (let i = this.cards.length - 1; i >= 0; i--) if (this.cards[i]?.cardId === cardId) return this.takeOut(i);
    return null;
  }

  /**
   * Removes the card at `index` from the hand (it is about to fly to the table
   * or a pile) and slides the rest together. The caller owns the sprite.
   */
  takeOut(index: number): { card: HandCard; box: Box } | null {
    const card = this.cards[index];
    const layout = this.layout;
    if (!card || !layout) return null;
    const box = this.cardBox(card);
    this.cards.splice(index, 1);
    // Leaving the hand: drawn where it is on screen (the strip may be dropped below it).
    this.unhome(card);
    if (this.lifted === card) this.lifted = null;
    this.undim(card);
    card.detach();
    this.fx.cancel(card.root);
    this.ui.cancel(card.root);
    this.ui.cancel(card.flip.scale);
    this.ui.cancel(card.flip.pivot);
    this.ui.cancel(card.flip);
    card.flip.pivot.y = 0;
    card.flip.rotation = 0;
    if (this.hovered === card) this.hovered = null;
    card.root.eventMode = 'none';
    if (card.mark) card.mark.visible = false;
    if (card.glow) card.glow.visible = false;
    card.flip.scale.set(1);
    card.root.y = box.y + box.height / 2;
    this.slideTo(handSlots(layout, this.cards.length), this.cards.length);
    this.restack();
    return { card, box };
  }

  /** Shows the discard stamp on the picked cards. */
  setMarked(marked: ReadonlySet<number>): void {
    this.cards.forEach((c, i) => {
      const on = marked.has(i);
      if (on && !c.mark) c.mark = this.createMark(c);
      if (c.mark) {
        if (on && !c.marked) {
          // A little "stamp" pop when a card gets picked.
          this.ui.cancel(c.mark.scale);
          c.mark.scale.set(1.25);
          this.ui.add({ target: c.mark.scale, to: { x: 1, y: 1 }, duration: 160, ease: ease.outBack, owner: c.mark });
        }
        c.mark.visible = on;
      }
      c.marked = on;
      c.face.alpha = on ? 0.55 : 1;
    });
  }

  /** Rendered bounds of each hand card (CSS px). */
  boxes(): { cardId: string; box: Box; marked: boolean; selected: boolean; outlined: boolean; hover?: { rise: number; rotation: number } }[] {
    return this.cards.map((c) => ({
      cardId: c.cardId,
      box: this.cardBox(c),
      marked: c.marked,
      // S-15-6: the held card (playable) is the one picked to play.
      selected: c === this.lifted && !this.liftDimmed,
      outlined: c === this.browsing,
      ...(c === this.hovered ? { hover: { rise: c.flip.pivot.y, rotation: c.flip.rotation } } : {}),
    }));
  }

  /**
   * S-15-1 (mouse only): the pointed-at card rises a little and leans toward the pointer (`x`:
   * the pointer's x); null puts the hovered card back. Drawn on the card's inner layer, so its
   * place and touch area stay where they are.
   */
  private hover(card: HandCard | null, x = 0): void {
    const prev = this.hovered;
    if (prev && prev !== card && !prev.root.destroyed) {
      this.ui.cancel(prev.flip.pivot);
      this.ui.cancel(prev.flip);
      this.ui.add({ target: prev.flip.pivot, to: { y: 0 }, duration: HOVER_MS, ease: ease.outCubic, owner: prev.flip });
      this.ui.add({ target: prev.flip, to: { rotation: 0 }, duration: HOVER_MS, ease: ease.outCubic, owner: prev.flip });
    }
    this.hovered = card;
    const layout = this.layout;
    if (!card || card.root.destroyed || !layout) {
      this.callbacks.changed?.();
      return;
    }
    const w = layout.card.width;
    const lean = Math.max(-1, Math.min(1, (x - card.root.x) / (w / 2))) * HOVER_LEAN;
    if (prev !== card) {
      this.ui.cancel(card.flip.pivot);
      this.ui.add({ target: card.flip.pivot, to: { y: Math.round(layout.card.height * HOVER_RISE) }, duration: HOVER_MS, ease: ease.outCubic, owner: card.flip });
    }
    this.ui.cancel(card.flip);
    this.ui.add({ target: card.flip, to: { rotation: lean }, duration: HOVER_MS, ease: ease.outCubic, owner: card.flip });
    this.callbacks.changed?.();
  }

  private slideTo(slots: Box[], count: number): void {
    for (let i = 0; i < count; i++) {
      const card = this.cards[i];
      const slot = slots[i];
      if (!card || !slot) continue;
      this.fx.cancel(card.root);
      this.ui.cancel(card.root);
      card.selected = false;
      if (card.glow) card.glow.visible = false;
      // A card lifted (S-07-6) or cut off mid-flight takes taps again in its slot.
      if (card !== this.lifted) {
        this.home(card);
        card.root.eventMode = 'static';
        this.ui.cancel(card.flip.scale);
        card.flip.scale.set(1);
        card.back.visible = false;
        card.face.visible = true;
        card.root.scale.set(1);
      }
      this.fx.add({
        target: card.root,
        to: { x: slot.x + slot.width / 2, y: slot.y + slot.height / 2 },
        duration: timing.handShift,
        ease: ease.outCubic,
        owner: card.root,
      });
    }
  }

  private cardBox(c: HandCard): Box {
    const w = this.layout?.card.width ?? 0;
    const h = this.layout?.card.height ?? 0;
    const b = centeredBox(c.root, w, h, c.flip.scale.x, c.flip.scale.y);
    // In the strip: where it is drawn on screen (S-15-6: the strip may be dropped below the screen).
    if (c.root.parent === this.strip) b.y += this.strip.y;
    return b;
  }

  private createOutline(): Graphics {
    const w = this.layout?.card.width ?? 60;
    const h = this.layout?.card.height ?? 84;
    const g = new Graphics();
    glowRoundRect(g, -w / 2, -h / 2, w, h, Math.max(4, w * 0.08), theme.text, Math.max(2, w * 0.035), 1.4);
    return g;
  }

  private createMark(card: HandCard): Container {
    const w = this.layout?.card.width ?? 60;
    const h = this.layout?.card.height ?? 84;
    const mark = new Container();
    const g = new Graphics();
    const r = Math.max(4, w * 0.08);
    glowRoundRect(g, -w / 2, -h / 2, w, h, r, theme.warn, Math.max(2, w * 0.035), 1.2);
    const bandH = Math.max(14, h * 0.2);
    g.rect(-w / 2 + 2, -bandH / 2, w - 4, bandH).fill({ color: theme.warn, alpha: 0.92 });
    const label = new Text({
      text: 'DISCARD',
      style: { fontFamily: theme.monoFamily, fontSize: Math.max(8, bandH * 0.55), fontWeight: '700', fill: 0x140a00, letterSpacing: 1 },
    });
    label.anchor.set(0.5);
    if (label.width > w - 6) label.scale.set((w - 6) / label.width);
    mark.addChild(g, label);
    mark.visible = false;
    card.flip.addChild(mark);
    return mark;
  }

  private createCard(cardId: string): HandCard {
    const layout = this.layout;
    const w = layout?.card.width ?? 60;
    const h = layout?.card.height ?? 84;
    const def = getCard(cardId);
    const root = new Container();
    const flip = new Container();
    const back = createCardBack(this.side, w, h);
    const face = def ? createCardFace(def, w, h, 'small') : createCardBack(this.side, w, h);
    back.visible = false;
    flip.addChild(back, face);
    root.addChild(flip);
    root.label = `hand:${cardId}`;
    root.hitArea = new Rectangle(-w / 2, -h / 2, w, h);
    this.strip.addChild(root);

    const card: HandCard = { cardId, root, flip, back, face, mark: null, marked: false, glow: null, outline: null, selected: false, detach: () => {}, pressed: false };
    // S-15-1: a mouse pointing at a hand card lifts it a little (touch has the press feedback instead).
    const pointing = (e: { pointerType: string; global: { x: number } }) => {
      if (e.pointerType !== 'mouse' || root.eventMode !== 'static' || card === this.lifted) return;
      this.hover(card, e.global.x);
    };
    root.on('pointerover', pointing);
    root.on('pointermove', pointing);
    root.on('pointerout', (e) => {
      if (e.pointerType === 'mouse' && this.hovered === card) this.hover(null);
    });
    card.detach = attachPress(root, {
      onDown: () => {
        const i = this.cards.indexOf(card);
        if (i >= 0) this.callbacks.onPress(i);
        card.pressed = true;
        root.zIndex = 1000;
        this.ui.cancel(card.flip.scale);
        this.ui.add({ target: card.flip.scale, to: { x: 1.06, y: 1.06 }, duration: timing.pressFeedback, owner: card.flip });
      },
      onRelease: () => {
        this.callbacks.onPressEnd();
        card.pressed = false;
        this.restack();
        this.ui.cancel(card.flip.scale);
        this.ui.add({ target: card.flip.scale, to: { x: 1, y: 1 }, duration: timing.pressFeedback, owner: card.flip });
      },
      onTap: () => {
        const i = this.cards.indexOf(card);
        if (i >= 0) this.callbacks.onTap(i);
      },
      onLongPress: () => {
        this.setBrowsing(card);
        this.callbacks.onLongPress(cardId, this.cardBox(card), this.cards.indexOf(card));
      },
      onHoldMove: (x, y, at) => this.slide(x, y, at),
      // S-15-6: pulled up out of the strip: before a hold, an upward drag picks this card up; during
      // the hold-to-read, leaving the strip upward picks up the card being read.
      onPull: (x, y, dx, dy, at, held) => {
        const layout = this.layout;
        const pull = this.callbacks.onPull;
        if (!layout || !pull) return false;
        let target = card;
        if (held) {
          if (y > layout.handArea.y - STRIP_PULL * layout.card.height) return false;
          target = this.browsing ?? card;
        } else if (!isUpward(dx, dy)) return false;
        const i = this.cards.indexOf(target);
        if (i < 0) return false;
        if (!pull(i, x, y, at)) return false;
        this.setBrowsing(null);
        return true;
      },
      onDrag: (x, y, at) => this.callbacks.onDrag?.(x, y, at),
      onDrop: (x, y, cancelled) => this.callbacks.onDrop?.(x, y, cancelled),
      onLongPressEnd: () => {
        this.setBrowsing(null);
        this.callbacks.onLongPressEnd();
      },
    });
    return card;
  }

  private place(card: HandCard, slot: Box): void {
    card.root.position.set(slot.x + slot.width / 2, slot.y + slot.height / 2);
    card.root.scale.set(1);
    card.flip.scale.set(1);
    card.back.visible = false;
    card.face.visible = true;
  }

  private flyIn(card: HandCard, slot: Box, deck: Box, delay: number): void {
    const layout = this.layout;
    if (!layout) return;
    const startScale = deck.width / layout.card.width;
    card.root.position.set(deck.x + deck.width / 2, deck.y + deck.height / 2);
    card.root.scale.set(startScale);
    card.back.visible = true;
    card.face.visible = false;
    card.root.zIndex = 500;
    // A card in flight must not swallow taps meant for the deck under it.
    card.root.eventMode = 'none';
    const flip = card.flip;
    const landed = this.callbacks.flight?.('draw', card.cardId, card.root, layout.card.width, layout.card.height);
    this.fx.add({
      target: card.root,
      to: { x: slot.x + slot.width / 2, y: slot.y + slot.height / 2 },
      duration: timing.drawFlight,
      delay,
      ease: ease.outCubic,
      owner: card.root,
      onUpdate: (t) => {
        // Grow from deck size and flip face-up halfway through the flight.
        const s = startScale + (1 - startScale) * ease.outCubic(t);
        card.root.scale.set(s);
        const showFace = t >= 0.5;
        card.back.visible = !showFace;
        card.face.visible = showFace;
        flip.scale.x = t >= 1 ? 1 : Math.max(0.02, Math.abs(1 - 2 * t));
      },
      onComplete: () => {
        landed?.();
        card.root.eventMode = 'static';
        card.root.scale.set(1);
        flip.scale.x = 1;
        this.restack();
      },
    });
  }

  private restack(): void {
    this.cards.forEach((c, i) => {
      if (c === this.lifted) {
        c.root.zIndex = 2000;
        return;
      }
      if (!c.pressed) c.root.zIndex = c === this.lifted ? 2000 : c === this.browsing ? 950 : c.selected ? 900 : i;
    });
  }

  private destroyCard(card: HandCard): void {
    if (card.root.destroyed) return;
    if (this.browsing === card) this.browsing = null;
    if (this.hovered === card) this.hovered = null;
    if (this.lifted === card) this.lifted = null;
    card.detach();
    this.fx.cancel(card.root);
    this.ui.cancel(card.root);
    this.ui.cancel(card.flip.scale);
    card.root.destroy({ children: true });
  }
}
