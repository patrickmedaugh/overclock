// S-04-2: "Leave the game?" (Leave / Stay), shown when the phone's Back button
// is pressed during a game. It covers the board and takes every tap until it
// closes: Stay (or a tap beside the panel, or Back again) keeps playing.
import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { glowRoundRect } from './cardFace';
import type { Box } from './hook-types';
import { attachPress } from './input';
import type { BoardLayout } from './layout';
import { theme } from './theme';
import { PanelButton, fitText } from './widgets';

export const LEAVE_TITLE = 'Leave the game?';
export const LEAVE_TEXT = "This game ends. It isn't saved.";
/** Sprint 6, online: the seat is kept, so the start screen offers Rejoin. */
export const LEAVE_TEXT_ONLINE = 'You can come back with Rejoin on the start screen.';

export interface LeaveDialogSnapshot {
  title: string;
  text: string;
  box: Box;
  buttons: { label: string; box: Box }[];
}

export class LeaveDialog {
  readonly root = new Container();
  private readonly detachers: (() => void)[] = [];
  private readonly panel: Box;
  private readonly buttons: { label: string; button: PanelButton }[] = [];

  constructor(
    layout: BoardLayout,
    onStay: () => void,
    onLeave: () => void,
    private readonly text: string = LEAVE_TEXT,
  ) {
    const { width: vw, height: vh } = layout.viewport;
    const s = Math.min(layout.scale, 1.2);
    this.root.label = 'dialog:leave';
    this.root.eventMode = 'static';

    // Dims the board and takes taps beside the panel (= Stay).
    const dim = new Graphics();
    dim.rect(0, 0, vw, vh).fill({ color: 0x000000, alpha: 0.7 });
    dim.hitArea = new Rectangle(0, 0, vw, vh);
    dim.label = 'dialog:outside';
    this.detachers.push(attachPress(dim, { onTap: onStay }));
    dim.cursor = 'default';
    this.root.addChild(dim);

    const safe = layout.safe;
    const pad = Math.round(16 * s);
    const btnH = Math.max(48, Math.round(52 * s));
    const w = Math.min(Math.round(380 * s), safe.width - 16);
    const title = new Text({
      text: LEAVE_TITLE,
      style: { fontFamily: theme.fontFamily, fontSize: Math.round(22 * s), fontWeight: '800', fill: theme.text, align: 'center' },
    });
    const body = new Text({
      text,
      style: { fontFamily: theme.fontFamily, fontSize: Math.max(13, Math.round(15 * s)), fill: theme.textDim, align: 'center' },
    });
    title.anchor.set(0.5, 0);
    body.anchor.set(0.5, 0);
    fitText(title, w - 2 * pad);
    fitText(body, w - 2 * pad);
    const gap = Math.round(10 * s);
    const h = Math.min(safe.height - 16, pad + title.height + gap / 2 + body.height + gap + btnH + pad);
    const x = safe.x + Math.round((safe.width - w) / 2);
    const y = safe.y + Math.round((safe.height - h) / 2);
    this.panel = { x, y, width: w, height: h };

    const bg = new Graphics();
    bg.roundRect(x, y, w, h, 14).fill({ color: theme.panel, alpha: 0.98 });
    glowRoundRect(bg, x, y, w, h, 14, theme.runner, 2, 1.4);
    // Taps on the panel itself do nothing (not Stay).
    bg.eventMode = 'static';
    bg.hitArea = new Rectangle(x, y, w, h);
    this.root.addChild(bg);

    title.position.set(x + w / 2, y + pad);
    body.position.set(x + w / 2, title.y + title.height + gap / 2);
    this.root.addChild(title, body);

    const bw = Math.floor((w - 2 * pad - gap) / 2);
    const by = y + h - pad - btnH;
    const add = (label: string, bx: number, color: number, glow: boolean, onTap: () => void) => {
      const b = new PanelButton(s, `dialog:${label.toLowerCase()}`);
      b.set({ x: bx, y: by, width: bw, height: btnH }, label, true, color, glow);
      this.detachers.push(attachPress(b.root, { onTap }));
      this.root.addChild(b.root);
      this.buttons.push({ label, button: b });
    };
    // Stay is the safe, highlighted choice; Leave sits on the left, away from the thumb's reach for Stay.
    add('Leave', x + pad, theme.warn, false, onLeave);
    add('Stay', x + w - pad - bw, theme.runner, true, onStay);
  }

  snapshot(): LeaveDialogSnapshot {
    return {
      title: LEAVE_TITLE,
      text: this.text,
      box: { ...this.panel },
      buttons: this.buttons.map((b) => ({ label: b.label, box: { ...b.button.box } })),
    };
  }

  destroy(): void {
    for (const d of this.detachers) d();
    this.root.destroy({ children: true });
  }
}
