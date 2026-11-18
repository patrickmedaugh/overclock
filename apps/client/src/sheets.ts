// Sprint 12 card sheets: a set of cards to pick from, drawn from engine data only.
// - The look-at sheet (S-12-1, Accelerated Beta Test): the cards the Corp looks at, in the
//   hand's strip, so the servers stay in view for the "where does this ICE go" tap.
// - The Archives sheet (S-12-2, Archived Memories): the Corp's own Archives over the table.
// A sheet only draws and reports taps; which card is pickable comes from the view's options.
import { getCard } from '@overclock/cards';
import type { Side } from '@overclock/engine';
import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { createCardBack, createCardFace, glowRoundRect } from './cardFace';
import type { Box } from './hook-types';
import { attachPress } from './input';
import { MIN_TOUCH } from './layout';
import { gridSlots } from './sheetMath';
import { theme } from './theme';
import { PanelButton, fitText } from './widgets';

export interface SheetCard {
  /** null: a card the viewer may not see (drawn as a back). */
  cardId: string | null;
  /** The engine offers a move for it (bright); otherwise dimmed. */
  lit: boolean;
  /** Picked (look-at sheet: the ICE whose servers are lit). */
  picked: boolean;
  /** The index the tap reports (look: `choice.looked` index; Archives: the pile index). */
  index: number;
}

export interface SheetOptions {
  /** Where the cards go. */
  area: Box;
  /** Above the cards ('' for none). */
  title: string;
  cards: readonly SheetCard[];
  /** Whose cards (the back's colours). */
  side: Side;
  scale: number;
  /** Height / width of a card. */
  ratio: number;
  maxWidth: number;
  /** Dark backing over the table (the Archives sheet). */
  backdrop: boolean;
  page: number;
  onTap: (index: number) => void;
  /** Hold to read: returns its detacher. */
  hold: (target: Container, cardId: string | null, box: Box, onTap: () => void) => () => void;
  onPage: (page: number) => void;
}

/** One drawn sheet (rebuilt whenever what it shows changes). */
export class CardSheet {
  readonly root = new Container();
  readonly cards: { cardId: string | null; index: number; lit: boolean; picked: boolean; box: Box }[] = [];
  readonly box: Box;
  readonly title: string;
  readonly page: number;
  readonly pages: number;
  /** Page buttons (Archives with many cards). */
  readonly pager: { prev: Box; next: Box; text: string } | null = null;
  private readonly detachers: (() => void)[] = [];

  constructor(o: SheetOptions) {
    const s = Math.min(o.scale, 1.2);
    const a = o.area;
    this.box = { ...a };
    this.title = o.title;
    this.root.label = 'card-sheet';
    if (o.backdrop) {
      // Taps on the sheet's backing do nothing (they never reach the table under it).
      this.root.eventMode = 'static';
      this.root.hitArea = new Rectangle(a.x, a.y, a.width, a.height);
      const bg = new Graphics();
      bg.roundRect(a.x, a.y, a.width, a.height, 8).fill({ color: 0x05040a, alpha: 0.95 }).stroke({ width: 1.5, color: theme.corp, alpha: 0.7 });
      this.root.addChild(bg);
    } else {
      this.root.eventMode = 'passive';
    }
    let top = a.y;
    if (o.title) {
      const t = new Text({
        text: o.title,
        style: { fontFamily: theme.fontFamily, fontSize: Math.max(12, Math.round(14 * s)), fontWeight: '700', fill: theme.text },
      });
      t.anchor.set(0.5, 0);
      t.position.set(a.x + a.width / 2, a.y + 4);
      fitText(t, a.width - 12);
      this.root.addChild(t);
      top = a.y + 4 + t.height + 4;
    }
    const gap = Math.max(6, Math.round(8 * s));
    const pad = o.backdrop ? gap : 0;
    let area: Box = { x: a.x + pad, y: top + (o.backdrop ? 2 : 0), width: a.width - 2 * pad, height: a.y + a.height - top - pad };
    let slots = gridSlots(area, o.cards.length, o.ratio, o.maxWidth, MIN_TOUCH, gap, o.page);
    if (slots.pages > 1) {
      // Room for the page buttons on the right.
      const bw = Math.max(MIN_TOUCH, Math.round(56 * s));
      area = { ...area, width: area.width - bw - gap };
      slots = gridSlots(area, o.cards.length, o.ratio, o.maxWidth, MIN_TOUCH, gap, o.page);
    }
    this.pages = slots.pages;
    this.page = Math.min(Math.max(0, o.page), slots.pages - 1);
    const first = this.page * slots.perPage;
    slots.boxes.forEach((b, i) => {
      const c = o.cards[first + i]!;
      const def = c.cardId ? getCard(c.cardId) : undefined;
      const card = new Container();
      card.label = `sheet:${c.index}`;
      const face = def ? createCardFace(def, b.width, b.height, 'small') : createCardBack(o.side, b.width, b.height);
      card.addChild(face);
      if (c.lit || c.picked) {
        const g = new Graphics();
        glowRoundRect(g, -b.width / 2 - 2, -b.height / 2 - 2, b.width + 4, b.height + 4, 6, c.picked ? theme.text : theme.credit, c.picked ? 3 : 2, c.picked ? 1.6 : 1.1);
        card.addChild(g);
      } else {
        face.alpha = 0.5;
      }
      const lift = c.picked ? Math.round(-6 * s) : 0;
      card.position.set(b.x + b.width / 2, b.y + b.height / 2 + lift);
      card.hitArea = new Rectangle(-b.width / 2, -b.height / 2, b.width, b.height);
      this.root.addChild(card);
      const box = { ...b, y: b.y + lift };
      this.detachers.push(o.hold(card, c.cardId, box, () => o.onTap(c.index)));
      this.cards.push({ cardId: c.cardId, index: c.index, lit: c.lit, picked: c.picked, box });
    });
    if (slots.pages > 1) {
      const bw = Math.max(MIN_TOUCH, Math.round(56 * s));
      const x = a.x + a.width - pad - bw;
      const h = Math.max(MIN_TOUCH, Math.min(Math.round(56 * s), (area.height - gap) / 3));
      const midY = area.y + area.height / 2;
      const prev = { x, y: Math.round(midY - gap / 2 - h - h / 2), width: bw, height: h };
      const next = { x, y: Math.round(midY + gap / 2 + h / 2), width: bw, height: h };
      const text = `${this.page + 1} / ${slots.pages}`;
      const label = new Text({ text, style: { fontFamily: theme.monoFamily, fontSize: Math.max(11, Math.round(12 * s)), fontWeight: '700', fill: theme.textDim } });
      label.anchor.set(0.5);
      label.position.set(x + bw / 2, midY);
      this.root.addChild(label);
      const mk = (b: Box, t: string, to: number) => {
        const btn = new PanelButton(o.scale, `sheet:${t === '◀' ? 'prev' : 'next'}`);
        btn.set(b, t, to >= 0 && to < slots.pages, theme.corp, false);
        this.root.addChild(btn.root);
        this.detachers.push(
          attachPress(btn.root, {
            onTap: () => {
              if (to >= 0 && to < slots.pages) o.onPage(to);
            },
          }),
        );
      };
      mk(prev, '◀', this.page - 1);
      mk(next, '▶', this.page + 1);
      this.pager = { prev, next, text };
    }
  }

  destroy(): void {
    for (const d of this.detachers) d();
    this.detachers.length = 0;
    if (!this.root.destroyed) this.root.destroy({ children: true });
  }
}
