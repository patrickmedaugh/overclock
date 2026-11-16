// Words for the run panel: button labels, the step line and the info lines.
// Pure (no Pixi), so every label is unit tested. No rules here: which moves
// exist, their prices and refusals come from the engine's `run.options`; the
// strengths come from `run.ice` / `run.breakerStrength`. Card data is read only
// for names and for an ability's printed "+N strength".
import { getCard } from '@overclock/cards';
import type { Action, CardOption, ChoiceView, GameEvent, LetFireView, RunView, Side, SubOutcome } from '@overclock/engine';
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
          return letFireLabel(run.letFire, run.ice?.subroutines) ?? 'Let it through';
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
  for (const e of batch) {
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
    const t = e.outcome.op === 'trash_installed' && e.outcome.amount > 0 && trashed ? `${nameOf(trashed, 'a program')} was trashed` : outcomeText(e.outcome, 'did');
    if (e.outcome.op === 'trash_installed') trashed = null;
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
