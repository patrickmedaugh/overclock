// Sprint 9: words and numbers for traces, tags and meat damage. Pure (no Pixi),
// so every label is unit tested. No rules here: the bid limits are the
// engine's offered `trace_bid` options, every strength / link / "spend N" comes
// from the choice's `trace` view, every result from the engine's events.
import { getCard } from '@overclock/cards';
import type { CardOption, ChoiceView, GameEvent, Side, TraceView } from '@overclock/engine';
import { SIDE_NAME, TERMS, plural } from './terms';

/** The two trace windows (the Corp bids, then the Runner). */
export type TraceKind = 'trace_corp' | 'trace_runner';

export type TraceChoice = ChoiceView & { readonly kind: TraceKind; readonly trace: TraceView };

/** True while a trace bid window is open (either side). */
export function isTraceChoice(c: ChoiceView | null | undefined): c is TraceChoice {
  return !!c && (c.kind === 'trace_corp' || c.kind === 'trace_runner') && !!c.trace;
}

function cardName(cardId: string | null | undefined, fallback = 'Card'): string {
  return (cardId ? getCard(cardId)?.name : undefined) ?? fallback;
}

/** Online: the other phone is bidding. "Corp is choosing its trace bid…" / "Runner is choosing his trace bid…". */
export function bidWaitText(side: Side): string {
  return `${SIDE_NAME[side]} is choosing ${side === 'corp' ? 'its' : 'his'} ${TERMS.trace.toLowerCase()} bid…`;
}

// ---- the bid control (−, number, +, Max, Bid) ----------------------------------

/** The bids the engine offers (one `trace_bid` option per amount), lowest to highest. */
export function bidAmounts(options: readonly CardOption[]): number[] {
  const out: number[] = [];
  for (const o of options) if (o.action.type === 'trace_bid') out.push(o.action.credits);
  return [...new Set(out)].sort((a, b) => a - b);
}

/** The offered option for bidding `amount`, if any. */
export function bidOption(options: readonly CardOption[], amount: number): CardOption | null {
  return options.find((o) => o.action.type === 'trace_bid' && o.action.credits === amount) ?? null;
}

/** `amount` moved onto the offered bids (the nearest one at or below it; the lowest when below all). */
export function clampBid(amounts: readonly number[], amount: number): number {
  if (amounts.length === 0) return 0;
  let best = amounts[0]!;
  for (const a of amounts) if (a <= amount) best = a;
  return best;
}

/** One step of − / + through the offered bids (stays put at either end). */
export function stepBid(amounts: readonly number[], amount: number, dir: 1 | -1): number {
  const i = amounts.indexOf(clampBid(amounts, amount));
  const j = Math.max(0, Math.min(amounts.length - 1, i + dir));
  return amounts[j] ?? 0;
}

/** The highest offered bid (Max). */
export function maxBid(amounts: readonly number[]): number {
  return amounts.length > 0 ? amounts[amounts.length - 1]! : 0;
}

/** The Runner's `bid` stops the trace: it reaches the engine's `needed` (credits to tie = escape). */
export function escapes(t: Pick<TraceView, 'needed'>, bid: number): boolean {
  return bid >= t.needed;
}

/** What `bid` makes of the trace: the Corp's strength, or the Runner's link total and whether he escapes. */
export function bidTotal(kind: TraceKind, t: TraceView, bid: number): number {
  return kind === 'trace_corp' ? t.base + bid : t.link + bid;
}

/**
 * The bid panel's step line. The deciding seat: "Trace 3: add credits?" (Corp) /
 * "Trace strength 5 · your link 1 · spend 4 to stop it" (Runner, from the engine's
 * `needed`); the other seat (online): "Corp is choosing its trace bid…".
 */
export function traceStepLabel(c: TraceChoice, mine: boolean): string {
  if (!mine) return bidWaitText(c.waitingOn);
  const t = c.trace;
  if (c.kind === 'trace_corp') return `${TERMS.trace} ${t.base}: add credits?`;
  return `${TERMS.trace} ${TERMS.strength.toLowerCase()} ${t.strength} · your ${TERMS.link.toLowerCase()} ${t.link} · spend ${t.needed} to stop it`;
}

/** Info lines under the step line, live with the bid shown in the control. */
export function traceLines(c: TraceChoice, bid: number, mine: boolean): string[] {
  const t = c.trace;
  if (c.kind === 'trace_corp') {
    // The Corp sees what the Runner can answer with (link + his most).
    const runner = `${SIDE_NAME.runner}: ${TERMS.link.toLowerCase()} ${t.link}, up to +${t.runnerMaxBid}`;
    return mine ? [`${TERMS.trace} ${t.base} + ${bid} → ${TERMS.strength.toLowerCase()} ${t.base + bid}`, runner] : [`${TERMS.trace} ${t.base}`, runner];
  }
  if (!mine) return [`${TERMS.trace} ${TERMS.strength.toLowerCase()} ${t.strength} vs ${TERMS.link.toLowerCase()} ${t.link}`];
  // Escape / short from the engine's `needed` (the bid that ties = escapes); no tie rule here.
  const total = t.link + bid;
  return [`${TERMS.link} ${t.link} + ${bid} = ${total}: ${escapes(t, bid) ? 'you escape' : `${t.needed - bid} short`}`];
}

/** The small line under the big bid number: "strength 5" (Corp) / "link 5 · escape" (Runner). */
export function bidCaption(c: TraceChoice, bid: number): string {
  const t = c.trace;
  if (c.kind === 'trace_corp') return `${TERMS.strength.toLowerCase()} ${t.base + bid}`;
  return `${TERMS.link.toLowerCase()} ${t.link + bid} · ${escapes(t, bid) ? 'escape' : 'short'}`;
}

/** The Bid button: "Bid 2" ("Bid 0" is the default). */
export function bidButtonLabel(bid: number): string {
  return `Bid ${bid}`;
}

// ---- Sprint 10: the same control for an amount (Bank Job: take 1..N credits) --------

/**
 * "uid:ability" of a card ability the player names an amount for (the engine offers one
 * `activate` option per amount, `amount` set), or null.
 */
export function amountKey(o: CardOption): string | null {
  const a = o.action;
  return a.type === 'activate' && a.amount !== undefined ? `${a.uid}:${a.ability}` : null;
}

/** The amounts the engine offers for ability `key`, lowest to highest. */
export function offeredAmounts(options: readonly CardOption[], key: string): number[] {
  const out: number[] = [];
  for (const o of options) if (amountKey(o) === key && o.action.type === 'activate' && o.action.amount !== undefined) out.push(o.action.amount);
  return [...new Set(out)].sort((a, b) => a - b);
}

/** The offered option for `amount` of ability `key`, if any. */
export function amountOption(options: readonly CardOption[], key: string, amount: number): CardOption | null {
  return options.find((o) => amountKey(o) === key && o.action.type === 'activate' && o.action.amount === amount) ?? null;
}

/** The confirm button: "Take 3". */
export function takeButtonLabel(amount: number): string {
  return `Take ${amount}`;
}

/** Under the big number: "5 stay" (the highest offered amount is all the card holds). */
export function amountCaption(amounts: readonly number[], amount: number): string {
  return `${maxBid(amounts) - amount} stay`;
}

// ---- results ---------------------------------------------------------------------

/** "Corp bid 0" for a window the engine skipped (the bid could not matter). */
export function autoBidText(e: Extract<GameEvent, { type: 'trace_bid' }>): string {
  return `${SIDE_NAME[e.player]} bid ${e.credits}`;
}

/** What the trace did to the Runner, from the events after its `trace_resolved` (tags, damage). */
function successParts(batch: readonly GameEvent[], from: number, you: boolean): string[] {
  const parts: string[] = [];
  for (let i = from + 1; i < batch.length; i++) {
    const e = batch[i]!;
    if (e.type === 'trace_started' || e.type === 'trace_resolved' || e.type === 'subroutine_resolved') break;
    if (e.type === 'tags_changed' && e.amount > 0) parts.push(you ? `you got ${plural(e.amount, 'tag', 'tags')}` : 'tagged');
    if (e.type === 'brain_damage') parts.push(`${you ? 'you took ' : ''}${e.amount} ${TERMS.brainDamage.toLowerCase()}`);
    if (e.type === 'meat_damage') parts.push(`${you ? 'you took ' : ''}${e.amount} ${TERMS.meatDamage.toLowerCase()}`);
    if (e.type === 'net_damage') parts.push(`${you ? 'you took ' : ''}${e.amount} ${TERMS.netDamage.toLowerCase()}`);
  }
  return parts;
}

/**
 * The trace's result, both totals: "Hunter: trace 5 vs link 5: Runner escaped",
 * "Hunter: trace 5 vs link 3: Runner tagged" (`index`: the event's place in `batch`).
 */
export function traceResultText(batch: readonly GameEvent[], index: number): string {
  const e = batch[index] as Extract<GameEvent, { type: 'trace_resolved' }>;
  const head = `${cardName(e.cardId)}: ${TERMS.trace.toLowerCase()} ${e.strength} vs ${TERMS.link.toLowerCase()} ${e.total}`;
  if (!e.success) return `${head}: ${SIDE_NAME.runner} escaped`;
  const parts = successParts(batch, index, false);
  if (parts.length === 0) return `${head}: ${TERMS.trace.toLowerCase()} succeeded`;
  const [first, ...rest] = parts;
  return `${head}: ${SIDE_NAME.runner} ${first}${rest.length > 0 ? `, ${rest.join(', ')}` : ''}`;
}

/** The same for the ICE report (said to the Runner): "trace 5 vs link 3: you got 1 tag, you took 1 brain damage". */
export function traceReportText(batch: readonly GameEvent[], index: number): string {
  const e = batch[index] as Extract<GameEvent, { type: 'trace_resolved' }>;
  const head = `${TERMS.trace.toLowerCase()} ${e.strength} vs ${TERMS.link.toLowerCase()} ${e.total}`;
  if (!e.success) return `${head}: you escaped`;
  const parts = successParts(batch, index, true);
  return `${head}: ${parts.length > 0 ? parts.join(', ') : `${TERMS.trace.toLowerCase()} succeeded`}`;
}

/** The toast lines for traces in one action: skipped windows ("Corp bid 0") and each result. */
export function traceNotices(batch: readonly GameEvent[]): string[] {
  const out: string[] = [];
  // QA-S9-1: a skipped window is said inside its trace's result, one sentence:
  // "SEA Source: trace 4 vs link 1: Runner tagged (Runner bid 0)". Alone ("Corp bid 0") only
  // while the trace is still waiting on the other bid.
  let autos: string[] = [];
  batch.forEach((e, i) => {
    if (e.type === 'trace_bid' && e.auto) autos.push(autoBidText(e));
    if (e.type === 'trace_resolved') {
      const result = traceResultText(batch, i);
      out.push(autos.length > 0 ? `${result} (${autos.join(', ')})` : result);
      autos = [];
    }
  });
  out.push(...autos);
  return out;
}

// ---- tags, basic actions, meat damage ------------------------------------------------

/** The Runner's tag marker: "Tagged 1". */
export function taggedText(n: number): string {
  return `${TERMS.tagged} ${n}`;
}

/** The Runner's link readout: "Link 1". */
export function linkText(n: number): string {
  return `${TERMS.link} ${n}`;
}

/** "1 click + 2 credits", "1 click", "2 credits": a basic action's price (from the engine's option). */
export function clickCreditText(o: Pick<CardOption, 'clicks' | 'cost'>): string {
  const parts: string[] = [];
  if (o.clicks) parts.push(plural(o.clicks, 'click', 'clicks'));
  if (o.cost > 0) parts.push(plural(o.cost, 'credit', 'credits'));
  return parts.join(' + ') || 'free';
}

/** "Remove 1 tag · 1 click + 2 credits" / "Trash · 1 click + 2 credits". */
export function basicOptionLabel(o: CardOption): string | null {
  const price = clickCreditText(o);
  if (o.action.type === 'remove_tag') return `Remove 1 tag · ${price}`;
  if (o.action.type === 'trash_resource') return `${TERMS.trash} · ${price}`;
  return null;
}

/** The notice for a tag change: "Runner gets 1 tag" / "Runner removed 1 tag". */
export function tagsChangedText(e: Extract<GameEvent, { type: 'tags_changed' }>): string {
  return e.amount > 0 ? `${SIDE_NAME.runner} gets ${plural(e.amount, 'tag', 'tags')}` : `${SIDE_NAME.runner} removed ${plural(-e.amount, 'tag', 'tags')}`;
}

/** The notice for the Corp's basic trash: "Corp trashed Armitage Codebusting (Runner tagged)". */
export function taggedTrashText(cardId: string): string {
  return `${SIDE_NAME.corp} trashed ${cardName(cardId)} (${SIDE_NAME.runner} ${TERMS.tagged.toLowerCase()})`;
}

/** The notice for meat damage, naming the cards: "1 meat damage: Sure Gamble to the Heap". */
export function meatDamageText(e: Extract<GameEvent, { type: 'meat_damage' }>): string {
  const head = `${e.amount} ${TERMS.meatDamage.toLowerCase()}`;
  if (e.cardIds.length === 0) return head;
  return `${head}: ${e.cardIds.map((id) => cardName(id)).join(', ')} to the ${TERMS.heap}`;
}
