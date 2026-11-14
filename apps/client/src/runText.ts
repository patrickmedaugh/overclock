// Words for the run panel: button labels, the step line and the info lines.
// Pure (no Pixi), so every label is unit tested. No rules here: which moves
// exist, their prices and refusals come from the engine's `run.options`; the
// strengths come from `run.ice` / `run.breakerStrength`. Card data is read only
// for names and for an ability's printed "+N strength".
import { getCard } from '@overclock/cards';
import type { Action, CardOption, GameEvent, LetFireView, RunView, Side, SubOutcome } from '@overclock/engine';
import { SIDE_NAME, TERMS, plural, priceText, serverLabel } from './terms';

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
 * The label of one run option, e.g. "Rez Wall of Static · 3 credits", "Don't rez",
 * "+1 strength · 1 credit", 'Break "End the run" · 1 credit', "Let it through",
 * "Continue", "Jack out", "Steal", "Trash · 4 credits", "Leave it", "Done".
 */
export function optionLabel(o: CardOption, run: RunView, options: readonly CardOption[], rig: RigIds): string {
  const a: Action = o.action;
  switch (a.type) {
    case 'rez':
      return `${TERMS.rez} ${nameOf(run.ice?.cardId)} · ${priceText(o.cost)}`;
    case 'jack_out':
      return TERMS.jackOut;
    case 'use_ability': {
      const breaker = rig[a.uid] ?? null;
      const ability = breaker ? getCard(breaker)?.abilities?.[a.ability] : undefined;
      let what: string;
      if (ability?.op === 'strength') what = `+${ability.amount} ${TERMS.strength.toLowerCase()}`;
      else {
        const sub = a.sub !== undefined ? run.ice?.subroutines[a.sub]?.text : undefined;
        what = sub ? `${TERMS.break} "${sub}"` : TERMS.break;
      }
      // Several breakers can act on this ICE: say which one.
      const who = breakersIn(options).length > 1 ? `${nameOf(breaker, 'Breaker')}: ` : '';
      return `${who}${what} · ${payText(o, rig)}`;
    }
    case 'activate':
      // S-07-4: "Take 8 credits from Bank Job" (the amount on the card, from the engine).
      return abilityLabel(rig[a.uid] ?? null, a.ability, o.gain);
    case 'steal':
    case 'trash': {
      const card = run.access?.cards[a.card];
      const verb = a.type === 'steal' ? TERMS.steal : TERMS.trash;
      const named = openAccess(run) > 1 ? `${verb} ${nameOf(card?.cardId, 'card')}` : verb;
      return a.type === 'trash' ? `${named} · ${priceText(o.cost)}` : named;
    }
    case 'pass':
      switch (run.step) {
        case 'approach':
          return "Don't rez";
        case 'encounter':
          return letFireLabel(run.letFire) ?? 'Let it through';
        case 'continue':
          return 'Continue';
        case 'access':
          return options.some((x) => x.action.type === 'trash') ? 'Leave it' : 'Done';
        case 'success':
          return 'Access cards';
      }
      return 'Pass';
    default:
      return a.type;
  }
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
  }
  if (run.step === 'continue') lines.push(run.position > 0 ? `Next: ${run.position} more ${TERMS.ice}` : `Next: ${serverLabel(run.server)}`);
  if (run.bypassPending && run.step !== 'access') lines.push('Inside Job: next ICE bypassed');
  if (run.extraAccess > 0 && run.step !== 'access') lines.push(`+${run.extraAccess} R&D ${run.extraAccess === 1 ? 'card' : 'cards'} if you get in`);
  return lines;
}

/**
 * S-07-2: what cards did by themselves at a turn's start, one line each:
 * "PAD Campaign: +1 credit". A refill of a card's own credits (Cyberfeeder)
 * says nothing (its disc shows it).
 */
export function turnStartNotices(batch: readonly GameEvent[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < batch.length; i++) {
    const e = batch[i]!;
    if (e.type !== 'ability_triggered' || e.trigger !== 'turn_start') continue;
    let gained = 0;
    for (let k = i + 1; k < batch.length; k++) {
      const n = batch[k]!;
      if (n.type === 'credit_gained') gained += n.amount;
      else break;
    }
    if (gained > 0) out.push(`${nameOf(e.cardId, 'Card')}: +${plural(gained, 'credit', 'credits')}`);
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
export function letFireLabel(p: LetFireView | null | undefined): string | null {
  if (!p) return null;
  if (p.outcomes.length === 0 && p.ends === null) return 'Continue';
  const parts = p.outcomes.map((o) => outcomeText(o, 'will')).filter((t): t is string => t !== null);
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
  for (const e of batch) {
    if (e.type !== 'subroutine_resolved') continue;
    last = e.cardId;
    if (!said.has(e.cardId)) {
      said.set(e.cardId, []);
      order.push(e.cardId);
    }
    const t = outcomeText(e.outcome, 'did');
    if (t) said.get(e.cardId)!.push(t);
  }
  if (last === null) return null;
  const end = batch.find((e): e is Extract<GameEvent, { type: 'run_ended' }> => e.type === 'run_ended');
  const out: string[] = [];
  for (const id of order) {
    const parts = said.get(id)!;
    if (parts.length > 0) out.push(`${nameOf(id)}: ${parts.join(', ')}.`);
  }
  if (end?.outcome === 'ended_by_ice') out.push(`${nameOf(last)} ended your ${TERMS.run.toLowerCase()}.`);
  else if (end?.outcome === 'flatline') out.push(`You flatlined: the ${SIDE_NAME.corp} wins.`);
  if (out.length === 0) out.push(`${nameOf(last)}: nothing happened.`);
  return out.join(' ');
}
