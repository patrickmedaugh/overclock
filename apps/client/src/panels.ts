// Sprint 5 panels over the board.
// - IceReport (S-05-2, owner answer A): what the ICE just did, e.g. "Enigma: you
//   lost 1 click. Enigma ended your run." It stays until the next tap anywhere;
//   that tap only closes it (it never reaches the board).
// - LastRunStrip (S-05-1): the cards the Runner's last run found, shown again
//   from the Last run button. Hold a card to read it. Non-blocking: a tap
//   outside closes it and still does what it does.
import { getCard } from '@overclock/cards';
import type { LastRunView, ServerId } from '@overclock/engine';
import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { createCardFace } from './cardFace';
import type { Box } from './hook-types';
import { type BoardLayout, accessSlots } from './layout';
import { TERMS, serverLabel } from './terms';
import { theme } from './theme';
import { fitText } from './widgets';

const FROM: Record<string, string> = { hq: `From ${TERMS.hq}`, rd: `From ${TERMS.rd}`, archives: `From ${TERMS.archives}` };

/** "From R&D", "From Server 1". */
export function fromLabel(from: string, server: ServerId): string {
  return from === 'remote' ? `From ${serverLabel(server)}` : (FROM[from] ?? '');
}

/** "Last run: R&D". */
export function lastRunTitle(last: LastRunView): string {
  return `Last ${TERMS.run.toLowerCase()}: ${serverLabel(last.server)}`;
}

export class IceReport {
  readonly root = new Container();
  /** The message bubble (CSS px). */
  readonly box: Box;

  /** `onDismiss` runs on the pointerdown of the next tap anywhere (the tap goes no further). */
  constructor(
    readonly text: string,
    layout: BoardLayout,
    onDismiss: () => void,
  ) {
    this.root.label = 'ice-report';
    const { width: vw, height: vh } = layout.viewport;
    const s = Math.min(layout.scale, 1.2);
    // Over everything: catches the dismissing tap so nothing under it acts.
    const catcher = new Graphics();
    catcher.rect(0, 0, vw, vh).fill({ color: 0x000000, alpha: 0.35 });
    catcher.eventMode = 'static';
    catcher.hitArea = new Rectangle(0, 0, vw, vh);
    catcher.cursor = 'pointer';
    catcher.on('pointerdown', (e) => {
      e.stopPropagation();
      onDismiss();
    });
    const board = layout.board;
    const maxW = Math.min(board.width * 0.86, Math.round(440 * s));
    const pad = Math.round(14 * s);
    const msg = new Text({
      text,
      style: {
        fontFamily: theme.fontFamily,
        fontSize: Math.max(15, Math.round(18 * s)),
        fontWeight: '700',
        fill: theme.text,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: maxW - 2 * pad,
        lineHeight: Math.max(19, Math.round(23 * s)),
      },
    });
    msg.anchor.set(0.5, 0);
    const more = new Text({
      text: 'Tap anywhere to go on',
      style: { fontFamily: theme.fontFamily, fontSize: Math.max(11, Math.round(12 * s)), fill: theme.textDim },
    });
    more.anchor.set(0.5, 0);
    const w = Math.min(maxW, Math.max(msg.width, more.width) + 2 * pad);
    const gap = Math.round(8 * s);
    const h = pad + msg.height + gap + more.height + pad;
    const g = new Graphics();
    g.roundRect(-w / 2, -h / 2, w, h, 12).fill({ color: 0x07121a, alpha: 0.97 }).stroke({ width: 2, color: theme.runner, alpha: 0.9 });
    g.roundRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 15).stroke({ width: 4, color: theme.runner, alpha: 0.25 });
    msg.position.set(0, -h / 2 + pad);
    more.position.set(0, -h / 2 + pad + msg.height + gap);
    const bubble = new Container();
    bubble.eventMode = 'none';
    bubble.addChild(g, msg, more);
    const cx = board.x + board.width / 2;
    const cy = board.y + board.height / 2;
    bubble.position.set(cx, cy);
    this.box = { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
    this.root.addChild(catcher, bubble);
  }

  destroy(): void {
    if (!this.root.destroyed) this.root.destroy({ children: true });
  }
}

export interface StripCard {
  cardId: string;
  from: string;
  box: Box;
}

export class LastRunStrip {
  readonly root = new Container();
  readonly title: string;
  readonly cards: StripCard[] = [];
  readonly box: Box;
  private readonly detachers: (() => void)[] = [];

  /** `hold(target, index, box)` makes card `index` hold-to-zoom; returns its detacher. */
  constructor(
    readonly last: LastRunView,
    layout: BoardLayout,
    hold: (target: Container, index: number, box: Box) => () => void,
  ) {
    this.root.label = 'last-run';
    this.title = lastRunTitle(last);
    const s = Math.min(layout.scale, 1.2);
    // Over the table; in the column layout only above the control strip, so Last run and End turn stay tappable.
    const acc = layout.access;
    const a = layout.mode === 'portrait' ? { ...acc, height: Math.max(80, layout.banner.y - 4 - acc.y) } : acc;
    this.box = { ...a };
    // Taps on the panel itself do nothing (they don't reach the table under it).
    this.root.eventMode = 'static';
    this.root.hitArea = new Rectangle(a.x, a.y, a.width, a.height);
    const bg = new Graphics();
    bg.roundRect(a.x, a.y, a.width, a.height, 8).fill({ color: 0x05040a, alpha: 0.93 }).stroke({ width: 1.5, color: theme.runner, alpha: 0.6 });
    this.root.addChild(bg);
    const titleH = Math.max(18, Math.round(20 * s));
    const title = new Text({
      text: this.title,
      style: { fontFamily: theme.monoFamily, fontSize: Math.max(12, Math.round(14 * s)), fontWeight: '700', fill: theme.runner },
    });
    title.anchor.set(0.5, 0);
    title.position.set(a.x + a.width / 2, a.y + 4);
    fitText(title, a.width - 12);
    this.root.addChild(title);
    const tagH = Math.max(14, Math.round(16 * s));
    const gap = Math.max(6, Math.round(10 * s));
    const area = { x: a.x, y: a.y + titleH, width: a.width, height: a.height - titleH };
    const slots = accessSlots(area, last.cards.length, tagH, gap);
    last.cards.forEach((c, i) => {
      const b = slots[i]!;
      const def = getCard(c.cardId);
      if (!def) return;
      const card = createCardFace(def, b.width, b.height, 'small');
      card.position.set(b.x + b.width / 2, b.y + b.height / 2);
      card.hitArea = new Rectangle(-b.width / 2, -b.height / 2, b.width, b.height);
      card.label = `last-run:${c.cardId}`;
      this.root.addChild(card);
      this.detachers.push(hold(card, i, b));
      card.cursor = 'default';
      const tag = new Text({
        text: fromLabel(c.from, last.server),
        style: { fontFamily: theme.monoFamily, fontSize: Math.max(10, Math.round(11 * s)), fontWeight: '700', fill: theme.textDim },
      });
      tag.anchor.set(0.5, 0);
      tag.position.set(b.x + b.width / 2, b.y + b.height + 2);
      fitText(tag, b.width - 2);
      this.root.addChild(tag);
      this.cards.push({ cardId: c.cardId, from: c.from, box: b });
    });
  }

  destroy(): void {
    for (const d of this.detachers) d();
    this.detachers.length = 0;
    if (!this.root.destroyed) this.root.destroy({ children: true });
  }
}
