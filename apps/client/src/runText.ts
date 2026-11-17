// Words for the run panel: button labels, the step line and the info lines.
// Pure (no Pixi), so every label is unit tested. No rules here: which moves
// exist, their prices and refusals come from the engine's `run.options`; the
// strengths come from `run.ice` / `run.breakerStrength`. Card data is read only
// for names and for an ability's printed "+N strength".
import { getCard } from '@overclock/cards';
import type { Action, CardOption, ChoiceView, GameEvent, LetFireView, RunView, Side, SubOutcome } from '@overclock/engine';
import { ICE_TYPE, SIDE_NAME, TERMS, plural, priceText, serverLabel } from './terms';
import { traceReportText } from './traceText';

/** A card's name, or `fallback` for a card the viewer can't see. */
export function nameOf(cardId: string | null | undefined, fallback = 'face-down ICE'): string {
  return (cardId ? getCard(cardId)?.name : undefined) ?? fallback;
}

/** Card id of each installed Runner card by uid (from view.rig): breakers are named in labels. */
export type RigIds = Readonly<Record<string, string | null>>;

/** Breaker uids that have options at this step, in option order. */
function breakersIn(options: readonly CardOption[]): string[] {
  const out: string[] = [];
  for (const o of options) if (o.action.type === 'use_ability' && !out.includes(o.action.uid)) out.push(o.action.uid);
  return out;
}

/** Access cards still to be decided (not stolen). */
function openAccess(run: RunView): number {
  return run.access?.cards.filter((c) => !c.stolen).length ?? 0;
}

/**
 * Sprint 11 (S-11-1): one run button's words in parts. `who` is the card the button
 * comes from (a breaker, Bank Job), named first; `sub` is a subroutine's text (shortened
 * first when space runs out); `price` is never shortened. Rez and choice buttons name
 * their card in `what` ("Rez Enigma"), so their `who` is null.
 */
export interface RunOptionParts {
  /** Card name the button comes from, or null. */
  who: string | null;
  /** That card's id (the test hook's `source`), or null. */
  source: string | null;
  what: string;
  sub?: string;
  /** "2 credits", "Cyberfeeder pays", or '' (no price). */
  price: string;
}

/** Options of breaker ability `uid:ability` at this step. */
function abilityGroup(options: readonly CardOption[], uid: string, ability: number): CardOption[] {
  return options.filter((x) => x.action.type === 'use_ability' && x.action.uid === uid && x.action.ability === ability);
}

/**
 * The words of one run option, e.g. {who: "Battering Ram", what: "break barrier sub", price: "2 credits"}.
 * Which options exist, prices and refusals: the engine's; names, ICE type and "+N": card data;
 * "up to N": the most subroutines among the engine's offered options for that ability.
 */
export function runOptionParts(o: CardOption, run: RunView, options: readonly CardOption[], rig: RigIds): RunOptionParts {
  const a: Action = o.action;
  const plain = (what: string, price = ''): RunOptionParts => ({ who: null, source: null, what, price });
  switch (a.type) {
    case 'rez':
      return plain(`${TERMS.rez} ${nameOf(run.ice?.cardId)}`, priceText(o.cost));
    case 'jack_out':
      return plain(TERMS.jackOut);
    case 'use_ability': {
      const breaker = rig[a.uid] ?? null;
      const ability = breaker ? getCard(breaker)?.abilities?.[a.ability] : undefined;
      const who = nameOf(breaker, 'Breaker');
      const price = payText(o, rig);
      if (ability?.op === 'strength') return { who, source: breaker, what: `+${ability.amount} ${TERMS.str}`, price };
      const type = ability?.op === 'break' ? `${ICE_TYPE[ability.iceType]} ` : '';
      const group = abilityGroup(options, a.uid, a.ability);
      if (a.subs !== undefined) {
        // S-11-2: "up to N" only when the engine offers a pick of N >= 2 (2+ open subroutines).
        const most = Math.max(1, ...group.map((x) => (x.action.type === 'use_ability' ? (x.action.subs?.length ?? 1) : 1)));
        const what = group.length > 1 && most >= 2 ? `${TERMS.break.toLowerCase()} up to ${most} ${type}${TERMS.subs}` : `${TERMS.break.toLowerCase()} ${type}${TERMS.sub}`;
        return { who, source: breaker, what, price };
      }
      const parts: RunOptionParts = { who, source: breaker, what: `${TERMS.break.toLowerCase()} ${type}${TERMS.sub}`, price };
      // The subroutine's text only when this ability could break another one too.
      const open = new Set(group.map((x) => (x.action.type === 'use_ability' ? x.action.sub : undefined)));
      const sub = a.sub !== undefined ? run.ice?.subroutines[a.sub]?.text : undefined;
      if (sub && open.size > 1) parts.sub = sub;
      return parts;
    }
    case 'activate': {
      // S-07-4 / S-10-3: "Bank Job: take credits" (the amount control picks how many).
      const cardId = rig[a.uid] ?? null;
      const label = abilityLabel(cardId, a.ability, o.gain);
      return { who: nameOf(cardId, 'Card'), source: cardId, what: label.replace(/^./, (c) => c.toLowerCase()), price: o.cost > 0 ? priceText(o.cost) : '' };
    }
    case 'steal':
    case 'trash': {
      const card = run.access?.cards[a.card];
      const verb = a.type === 'steal' ? TERMS.steal : TERMS.trash;
      const named = openAccess(run) > 1 ? `${verb} ${nameOf(card?.cardId, 'card')}` : verb;
      return plain(named, a.type === 'trash' ? priceText(o.cost) : '');
    }
    case 'pass':
      switch (run.step) {
        case 'approach':
          return plain("Don't rez");
        case 'encounter':
          return plain(letFireLabel(run.letFire, run.ice?.subroutines) ?? 'Let it through');
        case 'continue':
          return plain('Continue');
        case 'access':
          return plain(options.some((x) => x.action.type === 'trash') ? 'Leave it' : 'Done');
        case 'success':
          return plain('Access cards');
      }
      return plain('Pass');
    default:
      return plain(a.type);
  }
}

/** Shortest a shortened subroutine text / card name gets (characters before the "…"). */
const MIN_SUB_CHARS = 3;
const MIN_NAME_CHARS = 4;

/** Cuts `s` to `n` characters (no trailing space) and adds "…". */
function cut(s: string, n: number): string {
  return `${s.slice(0, n).trimEnd()}…`;
}

/** The label from its parts, with the subroutine text cut to `subChars` and the name to `whoChars`. */
export function partsLabel(p: RunOptionParts, subChars = Infinity, whoChars = Infinity): string {
  const who = p.who === null ? '' : `${p.who.length > whoChars ? cut(p.who, whoChars) : p.who}: `;
  const sub = p.sub === undefined ? '' : ` "${p.sub.length > subChars ? cut(p.sub, subChars) : p.sub}"`;
  return `${who}${p.what}${sub}${p.price ? ` · ${p.price}` : ''}`;
}

/**
 * Sprint 11: the label, then ever shorter versions for a button that is too small for it
 * (owner Q1 A / DECISIONS 2026-11-17): first the subroutine text ('"End the r…"'), then the
 * card name ("Battering…"). The price and the rest are never cut. First = the full label.
 */
export function labelLadder(p: RunOptionParts): string[] {
  const out = [partsLabel(p)];
  const subLen = p.sub?.length ?? 0;
  for (let n = subLen - 2; n >= MIN_SUB_CHARS; n--) out.push(partsLabel(p, n));
  const subMin = p.sub !== undefined ? Math.min(subLen, MIN_SUB_CHARS) : Infinity;
  const whoLen = p.who?.length ?? 0;
  for (let n = whoLen - 2; n >= MIN_NAME_CHARS; n--) out.push(partsLabel(p, subMin, n));
  return [...new Set(out)];
}

/** One rung of the ladder: a label and the smallest text size it may be drawn at. */
export interface LabelRung {
  text: string;
  minPx: number;
}

/**
 * Sprint 11: `labelLadder` with text floors for `PanelButton`: the full label and the
 * cut subroutine texts at `floor`; before the card name is cut, the label may shrink to
 * `lastFloor` (the name is worth a smaller letter).
 */
export function labelRungs(p: RunOptionParts, floor: number, lastFloor: number): LabelRung[] {
  const ladder = labelLadder(p);
  const named = p.who === null ? -1 : ladder.findIndex((x) => !x.startsWith(`${p.who}: `));
  const k = named < 0 ? ladder.length : named;
  const out = ladder.slice(0, k).map((text) => ({ text, minPx: floor }));
  if (lastFloor < floor) out.push({ text: ladder[k - 1]!, minPx: lastFloor });
  out.push(...ladder.slice(k).map((text) => ({ text, minPx: lastFloor })));
  return out;
}

/**
 * The label of one run option, e.g. "Rez Wall of Static · 3 credits", "Don't rez",
 * "Battering Ram: +1 str · 1 credit", "Battering Ram: break barrier sub · 2 credits",
 * 'Gordian Blade: break code gate sub "End the run" · 1 credit', "Let it through",
 * "Continue", "Jack out", "Steal", "Trash · 4 credits", "Leave it", "Done", "Bank Job: take credits".
 */
export function optionLabel(o: CardOption, run: RunView, options: readonly CardOption[], rig: RigIds): string {
  return partsLabel(runOptionParts(o, run, options, rig));
}

/** A card ability's label from card data with `{gain}` filled from the option ("Take 2 credits"). */
export function abilityLabel(cardId: string | null, ability: number, gain: number | undefined): string {
  const label = (cardId ? getCard(cardId)?.cardAbilities?.[ability]?.label : undefined) ?? 'Use';
  return label.replace('{gain}', String(gain ?? 0));
}

/**
 * S-07-2/3/5: the button of a picked card on the table: "Rez · 2 credits",
 * "Advance · 1 credit", "Score", "Take 2 credits · 1 click". Prices and the
 * click cost come from the engine's option; the words from card data.
 */
export function installedOptionLabel(o: CardOption, cardId: string | null): string {
  const a = o.action;
  switch (a.type) {
    case 'rez':
      return `${TERMS.rez} · ${priceText(o.cost)}`;
    case 'advance':
      return `${TERMS.advance} · ${priceText(o.cost)}`;
    case 'score':
      return TERMS.score;
    case 'activate': {
      const parts = [abilityLabel(cardId, a.ability, o.gain)];
      if (o.clicks) parts.push(plural(o.clicks, 'click', 'clicks'));
      if (o.cost > 0) parts.push(priceText(o.cost));
      return parts.join(' · ');
    }
    default:
      return a.type;
  }
}

/** "Run on Server 1". */
export function runTitle(run: RunView): string {
  return `${TERMS.run} on ${serverLabel(run.server)}`;
}

/** Online: the other phone is deciding (its choice is not shown here). */
export function decidingText(deciding: Side): string {
  return `${SIDE_NAME[deciding]} is deciding…`;
}

/** S-08-7: the choice kinds that open in the middle of a run (the run panel shows them). */
export function isRunChoice(c: ChoiceView | null | undefined): c is ChoiceView & { readonly kind: 'trash_target' | 'prevent_trash' } {
  return !!c && (c.kind === 'trash_target' || c.kind === 'prevent_trash');
}

/** What the ICE's choosing subroutine may trash ("program"), from card data. */
function trashWhat(iceId: string): string {
  for (const sub of getCard(iceId)?.subroutines ?? []) {
    if (sub.effect.op === 'trash_installed') return sub.effect.types.join(' or ');
  }
  return 'card';
}

/**
 * S-08-7: the run panel's step line during an in-run choice. Deciding seat: "Rototurret:
 * pick a program to trash" / "Rototurret: trash Corroder?"; the other seat (online):
 * "Corp is choosing…".
 */
export function choiceStepLabel(c: ChoiceView, rig: RigIds, mine: boolean): string {
  if (!mine) return `${SIDE_NAME[c.waitingOn]} is choosing…`;
  if (c.kind === 'trash_target') return `${nameOf(c.cardId)}: pick a ${trashWhat(c.cardId)} to trash`;
  return `${nameOf(c.cardId)}: trash ${nameOf(c.target ? (rig[c.target] ?? null) : null, 'a card')}?`;
}

/** S-08-7: a choice button: "Trash Corroder", "Trash Sacrificial Construct instead", "Let it be trashed". */
export function choiceOptionLabel(o: CardOption, c: ChoiceView, rig: RigIds): string {
  const a = o.action;
  if (a.type === 'choose') {
    const name = nameOf(rig[a.uid] ?? null, 'card');
    return c.kind === 'prevent_trash' ? `${TERMS.trash} ${name} instead` : `${TERMS.trash} ${name}`;
  }
  if (a.type === 'pass') return c.kind === 'prevent_trash' ? 'Let it be trashed' : TERMS.skip;
  return a.type;
}

/** What is happening now, for the deciding seat: "Corp: rez Wall of Static?", "Encounter: Enigma", ... */
export function stepLabel(run: RunView, deciding: Side): string {
  const ice = nameOf(run.ice?.cardId);
  switch (run.step) {
    case 'approach':
      return deciding === 'corp' ? `${SIDE_NAME.corp}: ${TERMS.rez.toLowerCase()} ${ice}?` : `Approaching ${ice}`;
    case 'encounter':
      return `Encounter: ${ice}`;
    case 'continue':
      return `Passed ${ice}`;
    case 'success':
      // S-07-4: in, before access: take Bank Job's credits instead, or access.
      return `Got into ${serverLabel(run.server)}`;
    case 'access': {
      const n = run.access?.cards.length ?? 0;
      return n > 1 ? `${TERMS.access}: ${plural(n, 'card', 'cards')}` : `${TERMS.access} ${serverLabel(run.server)}`;
    }
  }
}

/**
 * QA-S8-2: the whole price of breaking the ICE, from the engine's `breakAll`: "Break all:
 * 4 + 3 = 7 credits" (strength first, then the breaks). Several breakers: only the cheapest
 * (first on a tie), named — one line at most, so the run panel keeps its text size at 640x360.
 * Nothing when no breaker can break it all with the credits there are.
 */
export function breakAllLines(run: RunView, rig: RigIds): string[] {
  const all = run.breakAll ?? [];
  const best = all.reduce<(typeof all)[number] | null>((m, b) => (m === null || b.credits < m.credits ? b : m), null);
  if (!best) return [];
  // The sum written out: "Break all: 4 + 3 = 7 credits".
  const total = plural(best.credits, 'credit', 'credits');
  const sum = best.strengthCredits > 0 ? `${best.strengthCredits} + ${best.breakCredits} = ${total}` : total;
  return [all.length === 1 ? `Break all: ${sum}` : `Break all: ${sum} (${nameOf(rig[best.uid] ?? null, 'Breaker')})`];
}

/** Info lines under the step line: ICE strength, the breakers that can act and their strength, the next stop. */
export function infoLines(run: RunView, rig: RigIds): string[] {
  const lines: string[] = [];
  if ((run.step === 'approach' || run.step === 'encounter') && run.ice?.strength !== null && run.ice?.strength !== undefined) {
    lines.push(`${TERMS.strength} ${run.ice.strength}`);
  }
  if (run.step === 'encounter') {
    for (const uid of breakersIn(run.options)) {
      const s = run.breakerStrength[uid];
      if (s !== undefined) lines.push(`${nameOf(rig[uid] ?? null, 'Breaker')} ${s}`);
    }
    if (run.options.length > 0 && breakersIn(run.options).length === 0) lines.push('No breaker for this ICE');
    lines.push(...breakAllLines(run, rig));
  }
  if (run.step === 'continue') lines.push(run.position > 0 ? `Next: ${run.position} more ${TERMS.ice}` : `Next: ${serverLabel(run.server)}`);
  if (run.bypassPending && run.step !== 'access') lines.push('Inside Job: next ICE bypassed');
  if (run.extraAccess > 0 && run.step !== 'access') lines.push(`+${run.extraAccess} R&D ${run.extraAccess === 1 ? 'card' : 'cards'} if you get in`);
  return lines;
}

/**
 * S-07-2: what cards did by themselves at a turn's start, one line each:
 * "PAD Campaign: +1 credit", "Adonis Campaign: +3 credits", "Adonis Campaign: empty,
 * to Archives" (S-08-2). A refill of a card's own credits (Cyberfeeder)
 * says nothing (its disc shows it).
 */
export function turnStartNotices(batch: readonly GameEvent[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < batch.length; i++) {
    const e = batch[i]!;
    // S-08-2: an emptied card (Adonis Campaign) goes to Archives face up.
    if (e.type === 'corp_card_trashed') out.push(`${nameOf(e.cardId, 'Card')}: empty, to ${TERMS.archives}`);
    if (e.type !== 'ability_triggered' || e.trigger !== 'turn_start') continue;
    let gained = 0;
    for (let k = i + 1; k < batch.length; k++) {
      const n = batch[k]!;
      // Adonis: its own credits go down first (the disc shows it), then the Corp gains them.
      if (n.type === 'credit_gained') gained += n.amount;
      else if (n.type !== 'hosted_credits_changed') break;
    }
    if (gained > 0) out.push(`${nameOf(e.cardId, 'Card')}: +${plural(gained, 'credit', 'credits')}`);
  }
  return out;
}

/** "Haas-Bioroid: Engineering the Future" -> "Engineering the Future" (an identity's own title). */
export function shortName(cardId: string): string {
  const name = nameOf(cardId, 'Card');
  const i = name.lastIndexOf(': ');
  return i >= 0 ? name.slice(i + 2) : name;
}

/**
 * S-08-1: what a card did when its side installed (Haas-Bioroid "Engineering the
 * Future: +1 credit"; Kate "Digital Tinker: 1 credit off"). The discount's size is
 * the card's printed amount (the engine reports it only when it lowered the price).
 */
export function installNotices(batch: readonly GameEvent[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < batch.length; i++) {
    const e = batch[i]!;
    if (e.type !== 'ability_triggered') continue;
    if (e.trigger === 'install') {
      let gained = 0;
      for (let k = i + 1; k < batch.length; k++) {
        const n = batch[k]!;
        if (n.type === 'credit_gained') gained += n.amount;
        else break;
      }
      if (gained > 0) out.push(`${shortName(e.cardId)}: +${plural(gained, 'credit', 'credits')}`);
    } else if (e.trigger === 'install_discount') {
      const amount = getCard(e.cardId)?.installDiscount?.amount ?? 1;
      out.push(`${shortName(e.cardId)}: ${plural(amount, 'credit', 'credits')} off`);
    }
  }
  return out;
}

/**
 * S-07-4: a breaker's price with who pays it: "1 credit", "Cyberfeeder pays",
 * "2 credits · Cyberfeeder pays 1" (the engine's `hostedPay`).
 */
export function payText(o: CardOption, rig: RigIds): string {
  const paid = o.hostedPay ?? [];
  if (paid.length === 0) return priceText(o.cost);
  const covered = paid.reduce((n, p) => n + p.amount, 0);
  const who = paid.map((p) => nameOf(rig[p.uid] ?? null, 'A card')).join(' + ');
  return covered >= o.cost ? `${who} pays` : `${priceText(o.cost)} · ${who} pays ${covered}`;
}

/** What a run's end says in the notice (the result of a run that did not end the game). */
export const RUN_END: Record<string, string> = {
  jacked_out: 'Jacked out',
  ended_by_ice: 'Run ended',
  access_replaced: 'Took the credits instead of accessing',
};

/**
 * The notice for a run's end, given the events of the same action. A run that got
 * in (`run_successful`) and ended in that same action accessed nothing (a remote
 * holding only ICE, an empty Archives): say so instead of ending silently (QA-S3-3).
 */
export function runEndText(e: Extract<GameEvent, { type: 'run_ended' }>, batch: readonly GameEvent[]): string | null {
  if (e.outcome === 'accessed') {
    const gotIn = batch.some((x) => x.type === 'run_successful');
    const accessed = batch.some((x) => x.type === 'card_accessed');
    return gotIn && !accessed ? `Nothing to access in ${serverLabel(e.server)}` : null;
  }
  if (e.outcome === 'access_replaced') {
    // "Bank Job: +8 credits, nothing accessed".
    const by = batch.find((x): x is Extract<GameEvent, { type: 'ability_triggered' }> => x.type === 'ability_triggered' && x.trigger === 'successful_run');
    const gained = batch.filter((x): x is Extract<GameEvent, { type: 'credit_gained' }> => x.type === 'credit_gained').reduce((n, x) => n + x.amount, 0);
    if (by && gained > 0) return `${nameOf(by.cardId, 'Card')}: +${plural(gained, 'credit', 'credits')}, nothing accessed`;
  }
  return RUN_END[e.outcome] ?? null;
}

// ---- S-05-2: what the ICE does, before ("Let it fire: ...") and after (the report) ----

/** One subroutine outcome, in words: `will` (the button) or `did` (the report). Null: nothing to say (0-size, end the run). */
export function outcomeText(o: SubOutcome, tense: 'will' | 'did'): string | null {
  const n = o.amount;
  if (n <= 0) return null;
  const will = tense === 'will';
  switch (o.op) {
    case 'lose_clicks':
      return `${will ? 'lose' : 'you lost'} ${plural(n, 'click', 'clicks')}`;
    case 'net_damage':
      return `${will ? 'take' : 'you took'} ${n} damage`;
    case 'gain_credits':
      return `${SIDE_NAME.corp} ${will ? 'gains' : 'gained'} ${plural(n, 'credit', 'credits')}`;
    case 'draw':
      return `${SIDE_NAME.corp} ${will ? 'draws' : 'drew'} ${plural(n, 'card', 'cards')}`;
    case 'brain_damage':
      return `${will ? 'take' : 'you took'} ${n} brain damage`;
    case 'trash_installed':
      // S-08-7: the Corp picks which program (amount 1 = one was trashed; 0 = none, or saved).
      return will ? 'a program is trashed' : 'a program was trashed';
    case 'give_tags':
      // Sprint 9.
      return `${will ? 'you get' : 'you got'} ${plural(n, 'tag', 'tags')}`;
    case 'meat_damage':
      return `${will ? 'take' : 'you took'} ${n} ${TERMS.meatDamage.toLowerCase()}`;
    case 'trace':
      // Sprint 9: amount 1 = the trace succeeded, 0 = the Runner escaped (the report names the totals).
      return will ? 'a trace' : 'the trace succeeded';
    default:
      return null;
  }
}

/**
 * The encounter's `pass` button from the engine's preview (the client never
 * works out what ICE will do): "Let it fire: lose 1 click, run ends",
 * "Let it fire: take 3 damage", "Let it fire: take 3 damage, you flatline
 * (Corp wins)"; "Continue" when every subroutine is broken. Null: no preview.
 */
export function letFireLabel(p: LetFireView | null | undefined, subs?: readonly { readonly text: string; readonly broken: boolean }[]): string | null {
  if (!p) return null;
  // S-08-7: the preview stops where a choice opens (Rototurret with 2+ programs): an unbroken
  // subroutine it does not cover is the one waiting on that choice; say what it does.
  const covered = new Set(p.outcomes.map((o) => o.sub));
  const waiting = p.ends === null ? (subs ?? []).findIndex((x, i) => !x.broken && !covered.has(i)) : -1;
  if (p.outcomes.length === 0 && p.ends === null && waiting < 0) return 'Continue';
  const parts = p.outcomes.map((o) => outcomeText(o, 'will')).filter((t): t is string => t !== null);
  if (waiting >= 0) parts.push(`${subs![waiting]!.text.replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase())}…`);
  if (p.ends === 'run') parts.push('run ends');
  if (p.ends === 'game') parts.push(`you flatline (${SIDE_NAME.corp} wins)`);
  return `Let it fire: ${parts.length > 0 ? parts.join(', ') : 'nothing happens'}`;
}

/**
 * What the ICE did, from one action's events (`subroutine_resolved`, then the
 * run's end): "Enigma: you lost 1 click. Enigma ended your run.",
 * "Neural Katana: you took 3 damage.", "... You flatlined: the Corp wins."
 * Null when no subroutine fired.
 */
export function iceReport(batch: readonly GameEvent[]): string | null {
  const order: string[] = [];
  const said = new Map<string, string[]>();
  let last: string | null = null;
  // S-08-7: the program Rototurret trashed (named), and a Sacrificial Construct that saved one.
  let trashed: string | null = null;
  const saved: string[] = [];
  // Sprint 9: the last trace's result ("trace 5 vs link 3: you got 1 tag"), said with its subroutine.
  let traced: string | null = null;
  for (const [i, e] of batch.entries()) {
    if (e.type === 'trace_resolved') traced = traceReportText(batch, i);
    if (e.type === 'rig_card_trashed') trashed = e.cardId;
    if (e.type === 'trash_prevented') {
      saved.push(`${nameOf(e.byCardId, 'A card')} was trashed instead of ${nameOf(e.cardId, 'a card')}.`);
      trashed = null;
    }
    if (e.type !== 'subroutine_resolved') continue;
    last = e.cardId;
    if (!said.has(e.cardId)) {
      said.set(e.cardId, []);
      order.push(e.cardId);
    }
    const t =
      e.outcome.op === 'trace' && traced
        ? traced
        : e.outcome.op === 'trash_installed' && e.outcome.amount > 0 && trashed
          ? `${nameOf(trashed, 'a program')} was trashed`
          : outcomeText(e.outcome, 'did');
    if (e.outcome.op === 'trash_installed') trashed = null;
    if (e.outcome.op === 'trace') traced = null;
    if (t) said.get(e.cardId)!.push(t);
  }
  if (last === null) return null;
  const end = batch.find((e): e is Extract<GameEvent, { type: 'run_ended' }> => e.type === 'run_ended');
  const out: string[] = [];
  for (const id of order) {
    const parts = said.get(id)!;
    if (parts.length > 0) out.push(`${nameOf(id)}: ${parts.join(', ')}.`);
  }
  out.push(...saved);
  if (end?.outcome === 'ended_by_ice') out.push(`${nameOf(last)} ended your ${TERMS.run.toLowerCase()}.`);
  else if (end?.outcome === 'flatline') out.push(`You flatlined: the ${SIDE_NAME.corp} wins.`);
  if (out.length === 0) out.push(`${nameOf(last)}: nothing happened.`);
  return out.join(' ');
}
