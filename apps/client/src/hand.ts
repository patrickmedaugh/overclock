// The Runner's hand: card sprites, draw-flight animation, press/long-press.
import { getCard } from '@overclock/cards';
import { Container, Rectangle } from 'pixi.js';
import { centeredBox } from './geometry';
import { createCardBack, createCardFace } from './cardFace';
import type { Box } from './hook-types';
import { attachPress } from './input';
import { type BoardLayout, handSlots } from './layout';
import { timing } from './theme';
import { ease, type Tweens } from './tween';

interface HandCard {
  cardId: string;
  /** Positioned at the card center; tweened x/y/scale. */
  root: Container;
  /** Flipped (scale.x) during the draw flight. */
  flip: Container;
  back: Container;
  face: Container;
  detach: () => void;
  pressed: boolean;
}

export interface HandCallbacks {
  onLongPress(cardId: string, from: Box): void;
  onLongPressEnd(): void;
}

export class Hand {
  readonly container = new Container();
  private cards: HandCard[] = [];
  private layout: BoardLayout | null = null;

  constructor(
    private readonly fx: Tweens,
    private readonly ui: Tweens,
    private readonly callbacks: HandCallbacks,
  ) {
    this.container.sortableChildren = true;
  }

  /** Rebuilds all sprites for a new layout (resize), without animation. */
  setLayout(layout: BoardLayout, ids: readonly string[]): void {
    this.layout = layout;
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
   * Brings sprites in line with the engine's hand. Cards listed in
   * `drawnIds` (in order, appended to the end of the hand) fly in from
   * `deck`; everything else slides to its new slot.
   */
  sync(ids: readonly string[], drawnCount: number, deck: Box): void {
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
        this.flyIn(card, slot, deck, (i - firstNew) * 50);
      } else {
        this.place(card, slot);
      }
    }
    // Slide the kept cards to their (possibly tighter) slots.
    for (let i = 0; i < keep; i++) {
      const card = this.cards[i];
      const slot = slots[i];
      if (!card || !slot) continue;
      this.fx.cancel(card.root);
      this.fx.add({
        target: card.root,
        to: { x: slot.x + slot.width / 2, y: slot.y + slot.height / 2 },
        duration: timing.handShift,
        ease: ease.outCubic,
      });
    }
    this.restack();
  }

  /** Rendered bounds of each hand card (CSS px). */
  boxes(): { cardId: string; box: Box }[] {
    return this.cards.map((c) => ({ cardId: c.cardId, box: this.cardBox(c) }));
  }

  private cardBox(c: HandCard): Box {
    const w = this.layout?.card.width ?? 0;
    const h = this.layout?.card.height ?? 0;
    return centeredBox(c.root, w, h, c.flip.scale.x, c.flip.scale.y);
  }

  private createCard(cardId: string): HandCard {
    const layout = this.layout;
    const w = layout?.card.width ?? 60;
    const h = layout?.card.height ?? 84;
    const def = getCard(cardId);
    const root = new Container();
    const flip = new Container();
    const back = createCardBack('runner', w, h);
    const face = def ? createCardFace(def, w, h, 'small') : createCardBack('runner', w, h);
    back.visible = false;
    flip.addChild(back, face);
    root.addChild(flip);
    root.label = `hand:${cardId}`;
    root.hitArea = new Rectangle(-w / 2, -h / 2, w, h);
    this.container.addChild(root);

    const card: HandCard = { cardId, root, flip, back, face, detach: () => {}, pressed: false };
    card.detach = attachPress(root, {
      onDown: () => {
        card.pressed = true;
        root.zIndex = 1000;
        this.ui.cancel(card.flip.scale);
        this.ui.add({ target: card.flip.scale, to: { x: 1.06, y: 1.06 }, duration: timing.pressFeedback });
      },
      onRelease: () => {
        card.pressed = false;
        this.restack();
        this.ui.cancel(card.flip.scale);
        this.ui.add({ target: card.flip.scale, to: { x: 1, y: 1 }, duration: timing.pressFeedback });
      },
      onLongPress: () => {
        this.callbacks.onLongPress(cardId, this.cardBox(card));
      },
      onLongPressEnd: () => this.callbacks.onLongPressEnd(),
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
      if (!c.pressed) c.root.zIndex = i;
    });
  }

  private destroyCard(card: HandCard): void {
    card.detach();
    this.fx.cancel(card.root);
    this.ui.cancel(card.flip.scale);
    card.root.destroy({ children: true });
  }
}
