// The run on screen: the tracker (which server, which ICE, what step), the
// info panel (ICE name and strength, the breakers' strength, subroutines with
// broken ones crossed out), the decision buttons, and the accessed cards shown
// large. Draws only what the engine's run view says: every button is one of
// `run.options` (price and refusal from the engine), every strength comes from
// `run.ice` / `run.breakerStrength`. While the Corp decides (approach), the
// Corp seat's own run view is shown (hot-seat, owner answer Q1 A).
import { getCard } from '@overclock/cards';
import type { CardOption, PlayerView, RunView, Side } from '@overclock/engine';
import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { createCardBack, createCardFace, glowRoundRect } from './cardFace';
import type { Box, RunSnapshot } from './hook-types';
import type { Decision } from './session';
import { type BoardLayout, accessSlots, buttonGrid } from './layout';
import { type RigIds, decidingText, infoLines, optionLabel, runTitle, stepLabel } from './runText';
import { serverLabel } from './terms';
import { sideColor, theme } from './theme';
import type { Tweens } from './tween';
import { PanelButton, fitText } from './widgets';

export interface RunDisplayHooks {
  /** A decision button was tapped (index into the shown options). */
  onButton(index: number): void;
  /** Attaches press feedback + tap to a button; returns its detacher. */
  press(target: Container, onTap: () => void): () => void;
  /** S-05-1: holding an accessed card zooms it (no tap action); returns its detacher. */
  hold(target: Container, cardId: string, box: Box): () => void;
}

/** Where things are on the table (from the board's widgets). */
export interface TableBoxes {
  installed(uid: string): Box | null;
  column(server: string): Box | null;
}

const FROM: Record<string, string> = { hq: 'From HQ', rd: 'From R&D', archives: 'From Archives' };

export class RunDisplay {
  /** Info panel (centerLayer). */
  readonly info = new Container();
  /** Decision buttons (centerLayer). */
  readonly buttons = new Container();
  /** Server outline + current-ICE highlight (under the center widgets, over the cards). */
  readonly marks = new Graphics();
  /** Accessed cards, large (over the bands). */
  readonly access = new Container();
  private readonly pool: PanelButton[] = [];
  private readonly detachers: (() => void)[] = [];
  private infoKey = '';
  private accessKey = '';
  private stepKey = '';
  private shown: { option: CardOption; label: string }[] = [];
  /** Strike lines of the listed subroutines (for the break animation). */
  private strikes: Graphics[] = [];
  private accessBoxes: { cardId: string | null; box: Box }[] = [];
  private accessDetachers: (() => void)[] = [];
  private snap: RunSnapshot | null = null;
  /** The smallest text size in the info panel as drawn (after any shrink to fit). */
  private infoFontPx = 0;

  constructor(
    private layout: BoardLayout,
    private readonly ui: Tweens,
    private readonly hooks: RunDisplayHooks,
  ) {
    this.marks.eventMode = 'none';
    this.info.eventMode = 'none';
    // The access view swallows taps on the table under it.
    this.access.eventMode = 'static';
    this.access.label = 'run:access';
    this.setLayout(layout);
    this.hide();
  }

  /** The table's layout for this size (boxes may move a little when the table grows). */
  setLayout(layout: BoardLayout): void {
    this.layout = layout;
    const a = layout.access;
    this.access.hitArea = new Rectangle(a.x, a.y, a.width, a.height);
  }

  get snapshot(): RunSnapshot | null {
    return this.snap;
  }

  /** The options the buttons show, in button order. */
  option(index: number): CardOption | null {
    return this.shown[index]?.option ?? null;
  }

  /** The strike line under subroutine `sub` of the listed ICE. */
  strike(sub: number): Graphics | null {
    return this.strikes[sub] ?? null;
  }

  /** Where accessed card `cardId` was drawn last (for the steal / trash flights). */
  accessBoxOf(cardId: string): Box | null {
    return this.accessBoxes.find((c) => c.cardId === cardId)?.box ?? null;
  }

  /** Drops the button handlers (the board's layers destroy the containers). */
  detach(): void {
    for (const d of this.detachers) d();
    this.detachers.length = 0;
    this.detachAccess();
  }

  private detachAccess(): void {
    for (const d of this.accessDetachers) d();
    this.accessDetachers = [];
  }

  private hide(): void {
    this.info.visible = false;
    this.buttons.visible = false;
    this.marks.clear();
    this.marks.visible = false;
    this.access.visible = false;
    this.shown = [];
    this.snap = null;
    this.stepKey = '';
  }

  /**
   * Shows `view.run` (the bottom seat's) with the deciding seat's options.
   * Returns true when the run moved to a new step (for the step animation).
   */
  update(view: PlayerView, decision: Decision | null, table: TableBoxes, animate: boolean): boolean {
    const run = view.run;
    if (!run || view.result) {
      this.hide();
      return false;
    }
    // While the other seat decides, its own run view supplies the ICE and the options.
    const panel: RunView = decision?.run ?? run;
    const deciding: Side = decision?.seat ?? run.waitingOn;
    const rig: RigIds = Object.fromEntries(view.rig.map((c) => [c.uid, c.cardId]));
    const layout = this.layout;
    const options = panel.options;

    // Info panel.
    const title = runTitle(run);
    // Online, the other phone decides: its choice is not on this board ("Corp is deciding…").
    const elsewhere = decision === null && deciding !== view.viewer && options.length === 0;
    const step = elsewhere ? decidingText(deciding) : stepLabel(panel, deciding);
    const lines = infoLines(panel, rig);
    // The passed ICE keeps its list at Continue, so a just-broken subroutine is seen crossed out.
    const showSubs = panel.step !== 'access';
    const subs = showSubs ? (panel.ice?.subroutines ?? []).map((s) => ({ text: s.text, broken: s.broken })) : [];
    const infoKey = JSON.stringify([title, step, lines, subs, deciding, layout.runInfo]);
    if (infoKey !== this.infoKey) {
      this.infoKey = infoKey;
      this.drawInfo(layout.runInfo, title, step, lines, subs, deciding);
    }
    this.info.visible = true;

    // Buttons.
    const labels = options.map((o) => optionLabel(o, panel, options, rig));
    this.shown = options.map((option, i) => ({ option, label: labels[i]! }));
    const s = layout.scale;
    const boxes = buttonGrid(layout.runButtons, options.length, {
      gap: Math.max(4, Math.round(6 * s)),
      minW: Math.max(76, Math.round(84 * Math.min(s, 1.2))),
      maxW: Math.round(200 * Math.min(s, 1.3)),
      maxH: Math.max(44, Math.round(64 * Math.min(s, 1.2))),
    });
    const stepKey = `${run.step}:${run.position}:${run.iceUid}:${deciding}:${run.access?.cards.length ?? 0}`;
    const newStep = stepKey !== this.stepKey;
    this.stepKey = stepKey;
    const color = sideColor(deciding);
    options.forEach((o, i) => {
      const b = this.button(i);
      b.root.visible = true;
      b.set(boxes[i]!, labels[i]!, o.reject === null, color);
      if (animate && newStep) b.pop(this.ui);
    });
    for (let i = options.length; i < this.pool.length; i++) this.pool[i]!.root.visible = false;
    this.buttons.visible = true;

    // Tracker: the server's column outlined, the current ICE (or the server at access) highlighted.
    const col = table.column(run.server);
    const iceBox = run.iceUid ? table.installed(run.iceUid) : null;
    const highlight = run.step === 'access' || !iceBox ? col : iceBox;
    const m = this.marks;
    m.clear();
    if (col) m.roundRect(col.x - 2, col.y - 2, col.width + 4, col.height + 4, 7).stroke({ width: 2, color: theme.runner, alpha: 0.75 });
    if (highlight && highlight !== col) glowRoundRect(m, highlight.x - 3, highlight.y - 3, highlight.width + 6, highlight.height + 6, 5, color, 3, 1.4);
    m.visible = true;

    // Access: the cards, large.
    const cards = run.step === 'access' ? (run.access?.cards ?? []) : [];
    const accessKey = JSON.stringify([cards, layout.access]);
    if (accessKey !== this.accessKey) {
      this.accessKey = accessKey;
      this.drawAccess(cards, run);
    }
    this.access.visible = cards.length > 0;

    this.snap = {
      server: run.server,
      step: run.step,
      deciding,
      title,
      stepLabel: step,
      lines,
      subroutines: subs,
      iceUid: run.iceUid,
      highlight: highlight ? { ...highlight } : null,
      serverBox: col ? { ...col } : { x: 0, y: 0, width: 0, height: 0 },
      infoBox: { ...layout.runInfo },
      infoFontPx: this.infoFontPx,
      buttons: this.shown.map((x, i) => ({ label: x.label, lit: x.option.reject === null, reject: x.option.reject, box: { ...boxes[i]! }, action: x.option.action, fontPx: this.pool[i]!.fontPx })),
      access: cards.length > 0 ? { cards: cards.map((c, i) => ({ cardId: c.cardId, stolen: c.stolen, box: { ...this.accessBoxes[i]!.box } })) } : null,
    };
    return newStep;
  }

  private button(i: number): PanelButton {
    let b = this.pool[i];
    if (!b) {
      b = new PanelButton(this.layout.scale, `run:button:${i}`);
      this.detachers.push(this.hooks.press(b.root, () => this.hooks.onButton(i)));
      this.buttons.addChild(b.root);
      this.pool[i] = b;
    }
    return b;
  }

  private drawInfo(b: Box, title: string, step: string, lines: string[], subs: { text: string; broken: boolean }[], deciding: Side): void {
    for (const c of this.info.removeChildren()) c.destroy({ children: true });
    this.strikes = [];
    const s = Math.min(this.layout.scale, 1.15);
    const pad = Math.max(4, Math.round(6 * s));
    const bg = new Graphics();
    bg.roundRect(b.x, b.y, b.width, b.height, 8).fill({ color: 0x05040a, alpha: 0.88 }).stroke({ width: 1.5, color: sideColor(deciding), alpha: 0.7 });
    this.info.addChild(bg);
    const content = new Container();
    this.info.addChild(content);
    // A wide panel (desktop) lists the subroutines in a second column at a floor of
    // 12px, so nothing has to shrink to fit the row (QA-S3-4). Narrow panels (phones)
    // keep one column as before.
    const roomy = b.width >= 340 && subs.length > 0;
    const minPx = roomy ? 12 : 10;
    const colGap = Math.round(10 * s);
    const w = roomy ? Math.floor((b.width - 2 * pad - colGap) / 2) : b.width - 2 * pad;
    let x = 0;
    let y = 0;
    let fontMin = Infinity;
    const add = (text: string, size: number, fill: number, bold = false, mono = false): Text => {
      const px = size + (roomy ? 2 : 0);
      const fontSize = Math.max(minPx, Math.round(px * s));
      fontMin = Math.min(fontMin, fontSize);
      const t = new Text({
        text,
        style: {
          fontFamily: mono ? theme.monoFamily : theme.fontFamily,
          fontSize,
          fontWeight: bold ? '800' : '600',
          fill,
          wordWrap: true,
          wordWrapWidth: w,
          lineHeight: Math.max(minPx + 2, Math.round((px + 3) * s)),
        },
      });
      t.position.set(x, y);
      content.addChild(t);
      y += t.height + Math.round(2 * s);
      return t;
    };
    add(title.toUpperCase(), 10, theme.runner, true, true);
    add(step, 13, sideColor(deciding), true);
    for (const l of lines) add(l, 11, theme.text);
    let height = y;
    if (roomy) {
      x = w + colGap;
      y = 0;
    }
    for (const sub of subs) {
      const t = add(`› ${sub.text}`, 11, sub.broken ? theme.textDim : theme.warn, true);
      const strike = new Graphics();
      // One line through the middle of each text line.
      const lh = t.style.lineHeight as number;
      const n = Math.max(1, Math.round(t.height / lh));
      for (let k = 0; k < n; k++) strike.rect(t.x, t.y + lh * (k + 0.55) - 1, Math.min(w, t.width), 2).fill({ color: theme.text, alpha: 0.9 });
      strike.visible = sub.broken;
      content.addChild(strike);
      this.strikes.push(strike);
    }
    height = Math.max(height, y);
    const k = Math.min(1, (b.height - 2 * pad) / Math.max(1, height));
    content.scale.set(k);
    this.infoFontPx = fontMin === Infinity ? 0 : fontMin * k;
    content.position.set(b.x + pad, b.y + pad);
  }

  private drawAccess(cards: readonly { cardId: string | null; stolen: boolean; from: string }[], run: RunView): void {
    this.detachAccess();
    for (const c of this.access.removeChildren()) c.destroy({ children: true });
    this.accessBoxes = [];
    if (cards.length === 0) return;
    const a = this.layout.access;
    const s = Math.min(this.layout.scale, 1.2);
    const dim = new Graphics();
    dim.roundRect(a.x, a.y, a.width, a.height, 8).fill({ color: 0x05040a, alpha: 0.9 }).stroke({ width: 1.5, color: theme.runner, alpha: 0.6 });
    this.access.addChild(dim);
    const tagH = Math.max(14, Math.round(16 * s));
    const gap = Math.max(6, Math.round(10 * s));
    const slots = accessSlots(a, cards.length, tagH, gap);
    cards.forEach((c, i) => {
      const b = slots[i]!;
      this.accessBoxes.push({ cardId: c.cardId, box: b });
      const def = c.cardId ? getCard(c.cardId) : undefined;
      const card = def ? createCardFace(def, b.width, b.height, b.width >= 120 ? 'full' : 'small') : createCardBack('corp', b.width, b.height);
      card.position.set(b.x + b.width / 2, b.y + b.height / 2);
      if (c.stolen) card.alpha = 0.35;
      if (def && c.cardId) {
        card.hitArea = new Rectangle(-b.width / 2, -b.height / 2, b.width, b.height);
        card.label = `access:${c.cardId}`;
        this.accessDetachers.push(this.hooks.hold(card, c.cardId, b));
        card.cursor = 'default';
      }
      this.access.addChild(card);
      const where = c.from === 'remote' ? `From ${serverLabel(run.server)}` : (FROM[c.from] ?? '');
      const tag = new Text({
        text: c.stolen ? 'Stolen' : where,
        style: { fontFamily: theme.monoFamily, fontSize: Math.max(10, Math.round(11 * s)), fontWeight: '700', fill: c.stolen ? theme.runner : theme.textDim },
      });
      tag.anchor.set(0.5, 0);
      tag.position.set(b.x + b.width / 2, b.y + b.height + 2);
      fitText(tag, b.width - 2);
      this.access.addChild(tag);
    });
  }
}
