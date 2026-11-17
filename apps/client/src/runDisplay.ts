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
import type { Box, RunSnapshot, TraceSnapshot } from './hook-types';
import type { Decision } from './session';
import { type BoardLayout, accessSlots, bidLayout, buttonGrid } from './layout';
import { type RigIds, type RunOptionParts, choiceOptionLabel, choiceStepLabel, decidingText, infoLines, isRunChoice, labelLadder, labelRungs, nameOf, runOptionParts, runTitle, stepLabel } from './runText';
import { TERMS, priceText, serverLabel } from './terms';
import {
  type TraceChoice,
  amountCaption,
  amountKey,
  amountOption,
  bidAmounts,
  bidButtonLabel,
  bidCaption,
  bidOption,
  clampBid,
  isTraceChoice,
  maxBid,
  offeredAmounts,
  stepBid,
  takeButtonLabel,
  traceLines,
  traceStepLabel,
} from './traceText';
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

/** One button as shown: an engine option, or a step of a "break up to 2" pick (S-08-4). */
interface Shown {
  option: CardOption;
  /** The full label (Sprint 11: the button may draw a shortened one, see `labelLadder`). */
  label: string;
  /** Sprint 11: the label's parts, for shortening; absent = never shortened. */
  parts?: RunOptionParts;
  role?: 'multi' | 'toggle' | 'confirm' | 'back' | 'bid_dec' | 'bid_inc' | 'bid_max' | 'bid_go' | 'amount_open' | 'amount_back';
  key?: string;
  sub?: number;
  picked?: boolean;
  lit?: boolean;
  /** `multi`: the most subroutines one pick may break (the engine's offered options). */
  most?: number;
}

/** "uid:ability" of a breaker ability whose options pick subroutines (`subs`). */
function multiKey(o: CardOption): string | null {
  const a = o.action;
  return a.type === 'use_ability' && a.subs !== undefined ? `${a.uid}:${a.ability}` : null;
}

const sameSubs = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Most subroutines one offered option of a "break up to N" ability breaks. */
const mostSubs = (group: readonly CardOption[]) => Math.max(1, ...group.map((x) => (x.action.type === 'use_ability' ? (x.action.subs?.length ?? 1) : 1)));

/** A plain label as parts (choice buttons, the pick's own buttons). */
const plainParts = (what: string): RunOptionParts => ({ who: null, source: null, what, price: '' });

/**
 * Sprint 11: the smallest label text a run button may draw before its label is shortened
 * (`labelRungs`), within the QA-S3-4 floors (844x390 14 px, desktop 12, 640x360 11.5). A
 * button drawn at 14 px or more keeps 14; a smaller one (640x360, 891x296, a small desktop
 * window) may shrink to 12 px before its subroutine text is cut, and to 11.5 before its
 * card name is.
 */
export function minButtonPx(scale: number): { floor: number; last: number } {
  const base = Math.max(12, Math.round(14 * Math.min(scale, 1.15)));
  return base >= 14 ? { floor: 14, last: 14 } : { floor: 12, last: 11.5 };
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
  private shown: Shown[] = [];
  /** S-08-4: the open "break up to 2" pick (which breaker ability, which subroutines picked, oldest first). */
  private multi: { key: string; picked: number[]; most: number } | null = null;
  /** Strike lines of the listed subroutines (for the break animation). */
  private strikes: Graphics[] = [];
  private accessBoxes: { cardId: string | null; box: Box }[] = [];
  private accessDetachers: (() => void)[] = [];
  private snap: RunSnapshot | null = null;
  /** Sprint 9: the bid shown in the trace bid control (UI state only; `key` = which window). */
  private bid: { key: string; amount: number } | null = null;
  /**
   * Sprint 10 (S-10-3): the open amount control (Bank Job's "Take credits"): which ability
   * (`uid:ability`) and the amount shown. UI state only; the amounts are the engine's options.
   */
  private amountPick: { key: string; amount: number } | null = null;
  /** The offered bids of the open trace window (empty when none is shown). */
  private bidAmounts: number[] = [];
  /** What `drawBid` drew last (for the snapshot). */
  private lastBid: { boxes: ReturnType<typeof bidLayout>; amount: number; caption: string; lo: number; hi: number } | null = null;
  /** Sprint 9: the big bid number between − and + (in `buttons`). */
  private readonly tile = new Container();
  private readonly tileBg = new Graphics();
  private readonly tileNum: Text;
  private readonly tileCaption: Text;
  private traceSnap: TraceSnapshot | null = null;
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
    this.tile.label = 'trace:bid';
    this.tile.eventMode = 'none';
    this.tileNum = new Text({ text: '0', style: { fontFamily: theme.monoFamily, fontSize: 28, fontWeight: '800', fill: theme.text } });
    this.tileNum.anchor.set(0.5);
    this.tileCaption = new Text({ text: '', style: { fontFamily: theme.fontFamily, fontSize: 11, fontWeight: '700', fill: theme.textDim } });
    this.tileCaption.anchor.set(0.5);
    this.tile.addChild(this.tileBg, this.tileNum, this.tileCaption);
    this.tile.visible = false;
    this.buttons.addChild(this.tile);
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

  /** Sprint 9: the open trace bid panel (in a run or on the Corp's turn), or null. */
  get traceSnapshot(): TraceSnapshot | null {
    return this.traceSnap;
  }

  /** The options the buttons show, in button order. */
  option(index: number): CardOption | null {
    return this.shown[index]?.option ?? null;
  }

  /**
   * A tap on button `index`: the action to send, or null when the tap only changed
   * the "break up to 2" pick (the board redraws). A dim button still returns its
   * action, so the engine's refusal shows its hint.
   */
  tap(index: number): CardOption['action'] | null {
    const b = this.shown[index];
    if (!b) return null;
    switch (b.role) {
      case 'multi':
        if (b.option.reject !== null) return b.option.action;
        this.multi = { key: b.key!, picked: [], most: b.most ?? 2 };
        return null;
      case 'toggle': {
        const m = this.multi;
        if (!m) return null;
        const sub = b.sub!;
        if (m.picked.includes(sub)) m.picked = m.picked.filter((x) => x !== sub);
        // Sprint 11: a pick past the most drops the oldest pick (not the lowest subroutine).
        else m.picked = [...m.picked, sub].slice(-m.most);
        return null;
      }
      case 'back':
        this.multi = null;
        return null;
      case 'confirm':
        if (!b.lit) return null;
        this.multi = null;
        return b.option.action;
      case 'amount_open': {
        // Sprint 10: "Take credits" opens the amount control at the most it can take.
        if (b.option.reject !== null) return b.option.action;
        this.amountPick = { key: b.key!, amount: Number.POSITIVE_INFINITY };
        return null;
      }
      case 'amount_back':
        this.amountPick = null;
        return null;
      case 'bid_dec':
      case 'bid_inc':
      case 'bid_max': {
        // Sprint 9: − / + / Max move the shown bid through the engine's offered bids.
        // Sprint 10: the same for an amount (Bank Job).
        const bid = this.amountPick ?? this.bid;
        if (!bid) return null;
        const amounts = this.amountPick ? (this.lastAmount?.amounts ?? []) : this.bidAmounts;
        bid.amount = b.role === 'bid_max' ? maxBid(amounts) : stepBid(amounts, bid.amount, b.role === 'bid_inc' ? 1 : -1);
        return null;
      }
      default:
        return b.option.action;
    }
  }

  /**
   * S-08-4: Battering Ram's options (one per set of 1-2 subroutines) shown as one
   * "break up to 2" button; once tapped, one toggle per subroutine, "Break N" and "Back".
   * S-11-2: a group with one offered option (one open subroutine) is a plain button that
   * sends it at once; the pick opens only with 2+ options, its hint "Pick up to N".
   */
  private arrange(options: readonly CardOption[], parts: readonly RunOptionParts[], panel: RunView): Shown[] {
    const groups = new Map<string, CardOption[]>();
    for (const o of options) {
      const k = multiKey(o);
      if (k) groups.set(k, [...(groups.get(k) ?? []), o]);
    }
    if (this.multi && (groups.get(this.multi.key)?.length ?? 0) < 2) this.multi = null;
    const m = this.multi;
    if (m) {
      const group = groups.get(m.key)!;
      m.most = mostSubs(group);
      if (m.picked.length > m.most) m.picked = m.picked.slice(-m.most);
      const subs = [...new Set(group.flatMap((o) => (o.action.type === 'use_ability' ? (o.action.subs ?? []) : [])))].sort((a, b) => a - b);
      const out: Shown[] = subs.map((sub) => {
        const picked = m.picked.includes(sub);
        const text = panel.ice?.subroutines[sub]?.text ?? `Subroutine ${sub + 1}`;
        return { option: group[0]!, label: `${picked ? '✓ ' : ''}"${text}"`, role: 'toggle', sub, picked, lit: true };
      });
      const exact = group.find((o) => o.action.type === 'use_ability' && sameSubs(o.action.subs ?? [], [...m.picked].sort((x, y) => x - y)));
      const n = m.picked.length;
      const hint = m.most >= 2 ? `Pick up to ${m.most}` : 'Pick 1';
      out.push({ option: exact ?? group[0]!, label: n > 0 ? `${TERMS.break} ${n} · ${priceText((exact ?? group[0]!).cost)}` : hint, role: 'confirm', lit: !!exact && exact.reject === null });
      out.push({ option: group[0]!, label: 'Back', role: 'back', lit: true });
      return out;
    }
    const out: Shown[] = [];
    const done = new Set<string>();
    const shownOf = (i: number): Shown => ({ option: options[i]!, label: labelLadder(parts[i]!)[0]!, parts: parts[i]! });
    options.forEach((o, i) => {
      const k = multiKey(o);
      const group = k ? groups.get(k)! : [];
      if (!k || group.length < 2) {
        out.push(shownOf(i));
        return;
      }
      if (done.has(k)) return;
      done.add(k);
      const best = group.find((x) => x.reject === null) ?? group[0]!;
      // The label ("Battering Ram: break up to 2 barrier subs · 2 credits") is the best option's.
      out.push({ ...shownOf(options.indexOf(best)), role: 'multi', key: k, most: mostSubs(group) });
    });
    return out;
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
    this.tile.visible = false;
    this.shown = [];
    this.snap = null;
    this.traceSnap = null;
    this.bid = null;
    this.amountPick = null;
    this.stepKey = '';
  }

  /**
   * Sprint 10 (S-10-3): options that name an amount (one `activate` per amount, Bank Job)
   * show as one "Take credits" button (role `amount_open`); everything else as given.
   */
  private groupAmounts(options: readonly CardOption[], labels: readonly RunOptionParts[]): { options: CardOption[]; labels: RunOptionParts[]; open: Map<number, string> } {
    const outO: CardOption[] = [];
    const outL: RunOptionParts[] = [];
    const open = new Map<number, string>();
    const seen = new Set<string>();
    options.forEach((o, i) => {
      const k = amountKey(o);
      if (k === null) {
        outO.push(o);
        outL.push(labels[i]!);
        return;
      }
      if (seen.has(k)) return;
      seen.add(k);
      const group = options.filter((x) => amountKey(x) === k);
      open.set(outO.length, k);
      outO.push(group.find((x) => x.reject === null) ?? group[0]!);
      outL.push(labels[i]!);
    });
    return { options: outO, labels: outL, open };
  }

  /**
   * Sprint 10 (S-10-3): the amount control for ability `key` (Bank Job): Back, −, the
   * amount (big) with what stays, +, Max, "Take 3". The trace bid control's layout; every
   * limit is the engine's offered amounts.
   */
  private drawAmount(options: readonly CardOption[], key: string, color: number, animate: boolean, newStep: boolean): Box[] {
    const amounts = offeredAmounts(options, key);
    const pick = this.amountPick!;
    const amount = Number.isFinite(pick.amount) ? clampBid(amounts, pick.amount) : maxBid(amounts);
    pick.amount = amount;
    const go = amountOption(options, key, amount) ?? options[0]!;
    const lo = amounts[0] ?? 0;
    const hi = maxBid(amounts);
    this.shown = [
      { option: go, label: '−', role: 'bid_dec', lit: amount > lo },
      { option: go, label: '+', role: 'bid_inc', lit: amount < hi },
      { option: go, label: `Max ${hi}`, role: 'bid_max', lit: amount < hi },
      { option: go, label: takeButtonLabel(amount), role: 'bid_go' },
      { option: go, label: 'Back', role: 'amount_back', lit: true },
    ];
    const boxes = bidLayout(this.layout.runButtons, this.layout.scale, true);
    const places = [boxes.dec, boxes.inc, boxes.max, boxes.go, boxes.back!];
    this.shown.forEach((x, i) => {
      const b = this.button(i);
      b.root.visible = true;
      b.set(places[i]!, x.label, x.lit ?? x.option.reject === null, color, x.role === 'bid_go' && go.reject === null, x.role === 'bid_dec' || x.role === 'bid_inc');
      if (animate && newStep) b.pop(this.ui);
    });
    for (let i = this.shown.length; i < this.pool.length; i++) this.pool[i]!.root.visible = false;
    const t = boxes.tile;
    const caption = amountCaption(amounts, amount);
    this.tileBg.clear();
    this.tileBg.roundRect(t.x, t.y, t.width, t.height, Math.min(12, t.height / 4)).fill({ color: 0x05040a, alpha: 0.92 }).stroke({ width: 2, color, alpha: 0.9 });
    this.tileNum.style.fontSize = Math.max(22, Math.round(t.height * 0.5));
    this.tileNum.text = String(amount);
    fitText(this.tileNum, t.width - 8, t.height * 0.62);
    this.tileNum.position.set(t.x + t.width / 2, t.y + t.height * 0.4);
    this.tileCaption.style.fontSize = Math.max(11, Math.round(t.height * 0.19));
    this.tileCaption.text = caption;
    fitText(this.tileCaption, t.width - 6);
    this.tileCaption.position.set(t.x + t.width / 2, t.y + t.height * 0.8);
    this.tile.visible = true;
    this.lastAmount = { tile: { ...t }, amount, low: lo, high: hi, caption, amounts };
    return places.map((b) => ({ ...b }));
  }

  private amountSnap(): RunSnapshot['amount'] {
    const a = this.lastAmount;
    if (!a) return null;
    return { tile: a.tile, amount: a.amount, low: a.low, high: a.high, caption: a.caption, numberPx: (this.tileNum.style.fontSize as number) * this.tileNum.scale.y, captionPx: (this.tileCaption.style.fontSize as number) * this.tileCaption.scale.y };
  }

  /** What `drawAmount` drew last (for the snapshot), or null. */
  private lastAmount: { tile: Box; amount: number; low: number; high: number; caption: string; amounts: number[] } | null = null;

  /**
   * Sprint 9 (S-09-1): the bid control for an open trace window, deciding seat only:
   * −, the bid (big) with what it makes, +, Max, Bid. The shown bid starts at the
   * lowest offered bid (0) for each new window; every limit is the engine's offered
   * `trace_bid` options.
   */
  private drawBid(trace: TraceChoice, color: number, animate: boolean, newStep: boolean): void {
    const options = trace.options;
    const amounts = bidAmounts(options);
    this.bidAmounts = amounts;
    const key = `${trace.kind}:${trace.cardId}:${trace.waitingOn}:${trace.trace.strength}:${maxBid(amounts)}`;
    if (!this.bid || this.bid.key !== key) this.bid = { key, amount: amounts[0] ?? 0 };
    const amount = clampBid(amounts, this.bid.amount);
    this.bid.amount = amount;
    const go = bidOption(options, amount) ?? options[0]!;
    const lo = amounts[0] ?? 0;
    const hi = maxBid(amounts);
    this.shown = [
      { option: go, label: '−', role: 'bid_dec', lit: amount > lo },
      { option: go, label: '+', role: 'bid_inc', lit: amount < hi },
      { option: go, label: `Max ${hi}`, role: 'bid_max', lit: amount < hi },
      { option: go, label: bidButtonLabel(amount), role: 'bid_go' },
    ];
    const boxes = bidLayout(this.layout.runButtons, this.layout.scale);
    const places = [boxes.dec, boxes.inc, boxes.max, boxes.go];
    this.shown.forEach((x, i) => {
      const b = this.button(i);
      b.root.visible = true;
      b.set(places[i]!, x.label, x.lit ?? x.option.reject === null, color, x.role === 'bid_go' && go.reject === null, x.role === 'bid_dec' || x.role === 'bid_inc');
      if (animate && newStep) b.pop(this.ui);
    });
    for (let i = this.shown.length; i < this.pool.length; i++) this.pool[i]!.root.visible = false;
    // The big number and what it makes ("strength 5" / "link 5 · escape").
    const t = boxes.tile;
    const caption = bidCaption(trace, amount);
    this.tileBg.clear();
    this.tileBg.roundRect(t.x, t.y, t.width, t.height, Math.min(12, t.height / 4)).fill({ color: 0x05040a, alpha: 0.92 }).stroke({ width: 2, color, alpha: 0.9 });
    this.tileNum.style.fontSize = Math.max(22, Math.round(t.height * 0.5));
    this.tileNum.text = String(amount);
    fitText(this.tileNum, t.width - 8, t.height * 0.62);
    this.tileNum.position.set(t.x + t.width / 2, t.y + t.height * 0.4);
    this.tileCaption.style.fontSize = Math.max(11, Math.round(t.height * 0.19));
    this.tileCaption.text = caption;
    fitText(this.tileCaption, t.width - 6);
    this.tileCaption.position.set(t.x + t.width / 2, t.y + t.height * 0.8);
    this.tile.visible = true;
    this.lastBid = { boxes, amount, caption, lo, hi };
  }

  private makeTraceSnap(trace: TraceChoice, title: string, step: string, lines: string[], mine: boolean): TraceSnapshot {
    const lb = this.lastBid;
    const btn = (i: number) => {
      const x = this.shown[i]!;
      return { label: x.label, lit: x.lit ?? x.option.reject === null, box: { ...this.pool[i]!.box }, fontPx: this.pool[i]!.fontPx };
    };
    return {
      kind: trace.kind,
      deciding: trace.waitingOn,
      cardId: trace.cardId,
      mine,
      title,
      stepLabel: step,
      lines,
      infoBox: { ...this.layout.runInfo },
      infoFontPx: this.infoFontPx,
      control:
        mine && lb
          ? {
              bid: lb.amount,
              low: lb.lo,
              high: lb.hi,
              caption: lb.caption,
              tile: { ...lb.boxes.tile },
              numberPx: (this.tileNum.style.fontSize as number) * this.tileNum.scale.y,
              captionPx: (this.tileCaption.style.fontSize as number) * this.tileCaption.scale.y,
              buttons: { minus: btn(0), plus: btn(1), max: btn(2), bid: btn(3) },
              action: this.shown[3]!.option.action,
              reject: this.shown[3]!.option.reject,
            }
          : null,
    };
  }

  /**
   * Sprint 9: a trace outside a run (SEA Source, on the Corp's turn): the same panel,
   * titled with the card ("Trace · SEA Source"), and the bid control.
   */
  private updateTrace(trace: TraceChoice, animate: boolean): boolean {
    const layout = this.layout;
    const mine = trace.options.length > 0;
    const deciding = trace.waitingOn;
    const title = `${TERMS.trace} · ${nameOf(trace.cardId, 'Card')}`;
    const step = traceStepLabel(trace, mine);
    const stepKey = `trace:${trace.kind}:${deciding}:${trace.cardId}`;
    const newStep = stepKey !== this.stepKey;
    this.stepKey = stepKey;
    const color = sideColor(deciding);
    if (mine) this.drawBid(trace, color, animate, newStep);
    else {
      this.shown = [];
      this.bid = null;
      this.tile.visible = false;
      for (const b of this.pool) b.root.visible = false;
    }
    const lines = traceLines(trace, this.bid?.amount ?? 0, mine);
    const infoKey = JSON.stringify([title, step, lines, deciding, layout.runInfo]);
    if (infoKey !== this.infoKey) {
      this.infoKey = infoKey;
      this.drawInfo(layout.runInfo, title, step, lines, [], deciding);
    }
    this.info.visible = true;
    this.buttons.visible = true;
    this.marks.clear();
    this.marks.visible = false;
    this.access.visible = false;
    this.snap = null;
    this.traceSnap = this.makeTraceSnap(trace, title, step, lines, mine);
    return newStep;
  }

  /**
   * Shows `view.run` (the bottom seat's) with the deciding seat's options.
   * Returns true when the run moved to a new step (for the step animation).
   */
  update(view: PlayerView, decision: Decision | null, table: TableBoxes, animate: boolean): boolean {
    const run = view.run;
    // S-08-7: a choice inside the run (Rototurret): its options are the buttons, the run's own are none.
    const choiceSrc = decision ? decision.choice : view.choice;
    // Sprint 9: a trace bid window (in a run: Hunter, Ichi 1.0; on the Corp's turn: SEA Source).
    const trace = isTraceChoice(choiceSrc) ? choiceSrc : null;
    if ((!run && !trace) || view.result) {
      this.hide();
      return false;
    }
    if (!run) return this.updateTrace(trace!, animate);
    // While the other seat decides, its own run view supplies the ICE and the options.
    const panel: RunView = decision?.run ?? run;
    const choice = isRunChoice(choiceSrc) ? choiceSrc : null;
    const deciding: Side = trace?.waitingOn ?? choice?.waitingOn ?? decision?.seat ?? run.waitingOn;
    const rig: RigIds = Object.fromEntries(view.rig.map((c) => [c.uid, c.cardId]));
    const layout = this.layout;
    const options = trace ? trace.options : choice ? choice.options : panel.options;

    // Info panel.
    const title = runTitle(run);
    // Online, the other phone decides: its choice is not on this board ("Corp is deciding…").
    const elsewhere = decision === null && deciding !== view.viewer && options.length === 0;
    const stepKey = `${run.step}:${run.position}:${run.iceUid}:${deciding}:${run.access?.cards.length ?? 0}:${trace?.kind ?? choice?.kind ?? ''}`;
    const newStep = stepKey !== this.stepKey;
    if (newStep) this.multi = null;
    this.stepKey = stepKey;
    const color = sideColor(deciding);
    // Sprint 9: the bid control replaces the buttons while a trace window is open here.
    if (trace && options.length > 0) this.drawBid(trace, color, animate, newStep);
    else {
      this.tile.visible = false;
      this.bid = null;
    }
    // Sprint 10: the amount control stays open only while its ability is still offered at this step.
    if (newStep || trace || choice || (this.amountPick && !options.some((o) => amountKey(o) === this.amountPick!.key))) this.amountPick = null;
    this.lastAmount = null;
    const step = trace ? traceStepLabel(trace, options.length > 0) : choice ? choiceStepLabel(choice, rig, !elsewhere) : elsewhere ? decidingText(deciding) : stepLabel(panel, deciding);
    const lines = trace ? traceLines(trace, this.bid?.amount ?? 0, options.length > 0) : infoLines(panel, rig);
    // The passed ICE keeps its list at Continue, so a just-broken subroutine is seen crossed out.
    // Sprint 9: a trace window keeps the panel to the bid's numbers (readable in the 640x360 rail).
    const showSubs = panel.step !== 'access' && !trace;
    const subs = showSubs ? (panel.ice?.subroutines ?? []).map((s) => ({ text: s.text, broken: s.broken })) : [];
    const infoKey = JSON.stringify([title, step, lines, subs, deciding, layout.runInfo]);
    if (infoKey !== this.infoKey) {
      this.infoKey = infoKey;
      this.drawInfo(layout.runInfo, title, step, lines, subs, deciding);
    }
    this.info.visible = true;

    // Buttons.
    let boxes: Box[];
    if (trace) {
      if (options.length === 0) {
        this.shown = [];
        for (const b of this.pool) b.root.visible = false;
      }
      boxes = this.shown.map((_, i) => ({ ...this.pool[i]!.box }));
    } else if (this.amountPick) {
      boxes = this.drawAmount(options, this.amountPick.key, color, animate, newStep);
    } else {
      // Sprint 11: words in parts (card name first), so a long label can be shortened to fit.
      const parts0 = options.map((o) => (choice ? plainParts(choiceOptionLabel(o, choice, rig)) : runOptionParts(o, panel, options, rig)));
      // Sprint 10: one "Take credits" for all of Bank Job's amounts.
      const g = choice ? { options: [...options], labels: parts0, open: new Map<number, string>() } : this.groupAmounts(options, parts0);
      this.shown = choice ? options.map((option, i) => ({ option, label: labelLadder(parts0[i]!)[0]!, parts: parts0[i]! })) : this.arrange(g.options, g.labels, panel);
      if (!choice) for (const x of this.shown) {
        const k = amountKey(x.option);
        if (k !== null) {
          x.role = 'amount_open';
          x.key = k;
        }
      }
      const s = layout.scale;
      boxes = buttonGrid(layout.runButtons, this.shown.length, {
        gap: Math.max(4, Math.round(6 * s)),
        minW: Math.max(76, Math.round(84 * Math.min(s, 1.2))),
        maxW: Math.round(200 * Math.min(s, 1.3)),
        maxH: Math.max(44, Math.round(64 * Math.min(s, 1.2))),
      });
      const floor = minButtonPx(s);
      this.shown.forEach((x, i) => {
        const b = this.button(i);
        b.root.visible = true;
        b.set(boxes[i]!, x.parts ? labelRungs(x.parts, floor.floor, floor.last) : x.label, x.lit ?? x.option.reject === null, color);
        if (animate && newStep) b.pop(this.ui);
      });
      for (let i = this.shown.length; i < this.pool.length; i++) this.pool[i]!.root.visible = false;
    }
    this.buttons.visible = true;

    // Tracker: the server's column outlined, the current ICE (or the server at access) highlighted.
    const col = table.column(run.server);
    const iceBox = run.iceUid ? table.installed(run.iceUid) : null;
    const highlight = run.step === 'access' || !iceBox ? col : iceBox;
    const m = this.marks;
    m.clear();
    if (col) m.roundRect(col.x - 2, col.y - 2, col.width + 4, col.height + 4, 7).stroke({ width: 2, color: theme.runner, alpha: 0.75 });
    if (highlight && highlight !== col) glowRoundRect(m, highlight.x - 3, highlight.y - 3, highlight.width + 6, highlight.height + 6, 5, color, 3, 1.4);
    // S-08-7: the programs the Corp may pick are lit; the card about to be trashed is outlined.
    const lit: string[] = [];
    if (choice) {
      for (const o of options) if (o.action.type === 'choose') lit.push(o.action.uid);
      if (choice.kind === 'prevent_trash' && choice.target) {
        const t = table.installed(choice.target);
        if (t) m.roundRect(t.x - 4, t.y - 4, t.width + 8, t.height + 8, 6).stroke({ width: 3, color: theme.warn });
      }
      for (const uid of lit) {
        const b = table.installed(uid);
        if (b) glowRoundRect(m, b.x - 3, b.y - 3, b.width + 6, b.height + 6, 5, color, 2.5, 1.2);
      }
    }
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
      choice: choice ? { kind: choice.kind, lit, target: choice.target ?? null } : trace ? { kind: trace.kind, lit: [], target: null } : null,
      title,
      stepLabel: step,
      lines,
      subroutines: subs,
      iceUid: run.iceUid,
      highlight: highlight ? { ...highlight } : null,
      serverBox: col ? { ...col } : { x: 0, y: 0, width: 0, height: 0 },
      infoBox: { ...layout.runInfo },
      infoFontPx: this.infoFontPx,
      buttons: this.shown.map((x, i) => ({
        // Sprint 11: what the button says as drawn (maybe shortened), the full label, its card.
        label: this.pool[i]!.text,
        fullLabel: x.label,
        source: x.parts?.source ?? null,
        lit: x.lit ?? x.option.reject === null,
        reject: x.role === 'toggle' || x.role === 'back' || x.role === 'amount_back' || x.role === 'bid_dec' || x.role === 'bid_inc' || x.role === 'bid_max' ? null : x.option.reject,
        box: { ...boxes[i]! },
        action: x.option.action,
        fontPx: this.pool[i]!.fontPx,
        ...(x.role ? { role: x.role } : {}),
        ...(x.sub !== undefined ? { sub: x.sub, picked: !!x.picked } : {}),
      })),
      access: cards.length > 0 ? { cards: cards.map((c, i) => ({ cardId: c.cardId, stolen: c.stolen, box: { ...this.accessBoxes[i]!.box } })) } : null,
      amount: this.amountSnap(),
    };
    this.traceSnap = trace ? this.makeTraceSnap(trace, title, step, lines, options.length > 0) : null;
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
