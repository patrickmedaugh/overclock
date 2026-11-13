// S-06-5: the opaque "Pass the phone to the Runner. Tap when ready" screen.
// It hides the whole board (every card, both hands, the run) and takes every
// tap until the next player taps it. The board behind it is already drawn for
// that player, so the tap only takes the cover away (next frame, < 100 ms).
import { Container, FillGradient, Graphics, Rectangle, Text } from 'pixi.js';
import type { Box } from './hook-types';
import { attachPress } from './input';
import type { BoardLayout } from './layout';
import type { CoverText } from './passCover';
import { sideColor, theme } from './theme';
import { fitText } from './widgets';

export interface CoverSnapshot {
  to: CoverText['to'];
  title: string;
  line: string;
  /** The whole viewport (the cover is opaque over all of it). */
  box: Box;
  /** Where its own picture and words are drawn. */
  content: Box;
}

export class Cover {
  readonly root = new Container();
  private readonly detach: () => void;
  private readonly box: Box;
  private readonly content: Box;

  constructor(
    layout: BoardLayout,
    readonly text: CoverText,
    onTap: () => void,
  ) {
    const { width: vw, height: vh } = layout.viewport;
    this.box = { x: 0, y: 0, width: vw, height: vh };
    this.root.label = 'cover';
    const color = sideColor(text.to);

    const bg = new Graphics();
    const grad = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: theme.bgTop },
        { offset: 1, color: theme.bg },
      ],
    });
    // Fully opaque: nothing of the board shows through.
    bg.rect(0, 0, vw, vh).fill(grad);
    bg.hitArea = new Rectangle(0, 0, vw, vh);
    bg.label = 'cover';
    this.root.addChild(bg);

    const safe = layout.safe;
    const s = Math.min(Math.max(layout.scale, 0.8), 1.4);
    const maxW = safe.width - 32;

    // A small phone outline sliding toward the next player (drawn, no art).
    const phone = new Graphics();
    const pw = Math.round(30 * s);
    const ph = Math.round(52 * s);
    phone.roundRect(-pw / 2, -ph / 2, pw, ph, Math.round(6 * s)).stroke({ color, width: 3, alpha: 1 });
    phone.roundRect(-pw / 2 - 4, -ph / 2 - 4, pw + 8, ph + 8, Math.round(9 * s)).stroke({ color, width: 6, alpha: 0.18 });
    phone.rect(-Math.round(5 * s), ph / 2 - Math.round(7 * s), Math.round(10 * s), 3).fill({ color: theme.text, alpha: 0.8 });
    phone.rotation = -Math.PI / 2;

    const title = new Text({
      text: text.title,
      style: { fontFamily: theme.fontFamily, fontSize: Math.round(26 * s), fontWeight: '800', fill: color, align: 'center' },
    });
    title.anchor.set(0.5, 0);
    fitText(title, maxW);
    const line = new Text({
      text: text.line,
      style: { fontFamily: theme.fontFamily, fontSize: Math.max(15, Math.round(18 * s)), fontWeight: '600', fill: theme.text, align: 'center' },
    });
    line.anchor.set(0.5, 0);
    fitText(line, maxW);

    const gap = Math.round(14 * s);
    const total = pw + gap + title.height + gap / 2 + line.height;
    const cx = safe.x + safe.width / 2;
    let y = safe.y + Math.max(0, Math.round((safe.height - total) / 2));
    phone.position.set(cx, y + pw / 2);
    y += pw + gap;
    title.position.set(cx, y);
    y += title.height + gap / 2;
    line.position.set(cx, y);
    // The phone's glow reaches 7 px past its outline.
    const w = Math.max(title.width, line.width, ph + 14);
    const top = phone.y - pw / 2 - 8;
    this.content = { x: Math.floor(cx - w / 2) - 6, y: Math.floor(top), width: Math.ceil(w) + 12, height: Math.ceil(line.y + line.height - top) + 6 };
    for (const t of [phone, title, line]) t.eventMode = 'none';
    this.root.addChild(phone, title, line);

    this.detach = attachPress(bg, { onTap });
    bg.cursor = 'pointer';
  }

  snapshot(): CoverSnapshot {
    return { to: this.text.to, title: this.text.title, line: this.text.line, box: { ...this.box }, content: { ...this.content } };
  }

  destroy(): void {
    this.detach();
    this.root.destroy({ children: true });
  }
}
