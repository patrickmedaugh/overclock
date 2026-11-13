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
  onLongPress(cardId: string, from: Box): void;
  onLongPressEnd(): void;
  /** S-04-3: the held finger slid onto another hand card: show it in the zoom. `at`: the move's event time. */
  onZoomSlide(cardId: string, box: Box, at: number): void;
  log(rec: Omit<AnimRecord, 'startedAt'>): void;
}

export class Hand {
  readonly container = new Container();
  private cards: HandCard[] = [];
  private layout: BoardLayout | null = null;
  /** The layout generation the sprites were made for (sizes). */
  sizeKey = '';
  /** The card the zoom shows while a hand card is held (outlined), or null. */
  private browsing: HandCard | null = null;

  constructor(
    private readonly side: Side,
    private readonly fx: Tweens,
    private readonly ui: Tweens,
    private readonly callbacks: HandCallbacks,
  ) {
    this.container.sortableChildren = true;
    this.container.label = `hand:${side}`;
  }

  get count(): number {
    return this.cards.length;
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
    this.callbacks.onZoomSlide(card.cardId, this.cardBox(card), at);
  }

  /** Drops every sprite (they are rebuilt the next time this hand is shown). */
  reset(): void {
    for (const c of this.cards) this.destroyCard(c);
    this.cards = [];
    this.sizeKey = '';
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
  sync(ids: readonly string[], drawnCount: number, deck: Box, delay = 0): void {
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
        const d = delay + (i - firstNew) * 50;
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
  discardOut(indices: readonly number[], pile: Box): number {
    const layout = this.layout;
    if (!layout || indices.length === 0) return 0;
    const set = new Set(indices);
    const leaving = this.cards.filter((_, i) => set.has(i));
    this.cards = this.cards.filter((_, i) => !set.has(i));
    const scale = pile.width / layout.card.width;
    leaving.forEach((card, k) => {
      card.root.eventMode = 'none';
      card.root.zIndex = 600 + k;
      if (card.mark) card.mark.visible = false;
      if (card.glow) card.glow.visible = false;
      const root = card.root;
      this.fx.add({
        target: root,
        to: { x: pile.x + pile.width / 2, y: pile.y + pile.height / 2, alpha: 0.85 },
        duration: timing.discardFlight,
        delay: k * timing.discardStagger,
        ease: ease.inOutCubic,
        owner: root,
        onUpdate: (t) => {
          const s = 1 + (scale - 1) * ease.inOutCubic(t);
          root.scale.set(s);
          root.rotation = Math.sin(t * Math.PI) * 0.25;
        },
        onComplete: () => this.destroyCard(card),
      });
    });
    this.slideTo(handSlots(layout, this.cards.length), this.cards.length);
    this.restack();
    return timing.discardFlight + (leaving.length - 1) * timing.discardStagger;
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
    card.detach();
    this.fx.cancel(card.root);
    this.ui.cancel(card.flip.scale);
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

  /** Lifts and outlines the card picked to play (null: none). */
  setSelected(index: number | null): void {
    const layout = this.layout;
    if (!layout) return;
    const slots = handSlots(layout, this.cards.length);
    // Sideways the hand strip touches the server names: the glow alone marks the pick there.
    const lift = layout.mode === 'landscape' ? 0 : Math.round(layout.card.height * 0.12);
    this.cards.forEach((c, i) => {
      const on = i === index;
      if (on === c.selected) return;
      c.selected = on;
      if (on && !c.glow) {
        c.glow = this.createGlow();
        c.flip.addChild(c.glow);
      }
      if (c.glow) c.glow.visible = on;
      const slot = slots[i];
      if (!slot) return;
      this.fx.cancel(c.root);
      this.ui.cancel(c.root);
      this.ui.add({
        target: c.root,
        to: { x: slot.x + slot.width / 2, y: slot.y + slot.height / 2 - (on ? lift : 0) },
        duration: timing.pressFeedback * 2,
        ease: ease.outCubic,
        owner: c.root,
      });
    });
    this.restack();
  }

  /** Rendered bounds of each hand card (CSS px). */
  boxes(): { cardId: string; box: Box; marked: boolean; selected: boolean; outlined: boolean }[] {
    return this.cards.map((c) => ({ cardId: c.cardId, box: this.cardBox(c), marked: c.marked, selected: c.selected, outlined: c === this.browsing }));
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
    return centeredBox(c.root, w, h, c.flip.scale.x, c.flip.scale.y);
  }

  private createGlow(): Graphics {
    const w = this.layout?.card.width ?? 60;
    const h = this.layout?.card.height ?? 84;
    const g = new Graphics();
    glowRoundRect(g, -w / 2, -h / 2, w, h, Math.max(4, w * 0.08), theme.credit, Math.max(2, w * 0.04), 1.6);
    return g;
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
    this.container.addChild(root);

    const card: HandCard = { cardId, root, flip, back, face, mark: null, marked: false, glow: null, outline: null, selected: false, detach: () => {}, pressed: false };
    card.detach = attachPress(root, {
      onDown: () => {
        card.pressed = true;
        root.zIndex = 1000;
        this.ui.cancel(card.flip.scale);
        this.ui.add({ target: card.flip.scale, to: { x: 1.06, y: 1.06 }, duration: timing.pressFeedback, owner: card.flip });
      },
      onRelease: () => {
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
        this.callbacks.onLongPress(cardId, this.cardBox(card));
      },
      onHoldMove: (x, y, at) => this.slide(x, y, at),
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
        card.root.eventMode = 'static';
        card.root.scale.set(1);
        flip.scale.x = 1;
        this.restack();
      },
    });
  }

  private restack(): void {
    this.cards.forEach((c, i) => {
      if (!c.pressed) c.root.zIndex = c === this.browsing ? 950 : c.selected ? 900 : i;
    });
  }

  private destroyCard(card: HandCard): void {
    if (card.root.destroyed) return;
    if (this.browsing === card) this.browsing = null;
    card.detach();
    this.fx.cancel(card.root);
    this.ui.cancel(card.root);
    this.ui.cancel(card.flip.scale);
    card.root.destroy({ children: true });
  }
}
