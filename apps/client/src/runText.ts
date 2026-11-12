// Words for the run panel: button labels, the step line and the info lines.
// Pure (no Pixi), so every label is unit tested. No rules here: which moves
// exist, their prices and refusals come from the engine's `run.options`; the
// strengths come from `run.ice` / `run.breakerStrength`. Card data is read only
// for names and for an ability's printed "+N strength".
import { getCard } from '@overclock/cards';
import type { Action, CardOption, GameEvent, RunView, Side } from '@overclock/engine';
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
      return `${who}${what} · ${priceText(o.cost)}`;
    }
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
          return 'Let it through';
        case 'continue':
          return 'Continue';
        case 'access':
          return options.some((x) => x.action.type === 'trash') ? 'Leave it' : 'Done';
      }
      return 'Pass';
    default:
      return a.type;
  }
}

/** "Run on Server 1". */
export function runTitle(run: RunView): string {
  return `${TERMS.run} on ${serverLabel(run.server)}`;
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

/** What a run's end says in the notice (the result of a run that did not end the game). */
export const RUN_END: Record<string, string> = {
  jacked_out: 'Jacked out',
  ended_by_ice: 'Run ended',
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
  return RUN_END[e.outcome] ?? null;
}
