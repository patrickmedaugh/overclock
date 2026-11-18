// Plain-language hints for actions the engine refused (its RejectReason),
// shown in the small hint toast. Pure, so every reason is unit tested.
import { getCard } from '@overclock/cards';
import type { CardOption, PlayerView, RejectReason } from '@overclock/engine';
import { SIDE_NAME, TERMS } from './terms';

/** S-04-4: what to do while the Corp's free-rez choice is open. */
export const CHOICE_HINT = 'Rez one ICE for free, or tap Skip';
/** S-08-7: what to do while a choice inside a run (Rototurret) is open. */
export const RUN_CHOICE_HINT = 'Tap one of the lit buttons first';

/** The hint for an open choice (free rez, or one inside a run). */
export function choiceHint(choice: PlayerView['choice'] | undefined): string {
  if (choice && (choice.kind === 'trace_corp' || choice.kind === 'trace_runner')) return TRACE_HINT;
  return choice && choice.kind !== 'free_rez' ? RUN_CHOICE_HINT : CHOICE_HINT;
}

/** Sprint 9: what to do while a trace bid window is open. */
export const TRACE_HINT = 'Pick your trace bid first';

/** Sprint 9: `condition_not_met` in words, keyed on the card's data (`playIf` / ability `requires`). */
export const CONDITION_TEXT = {
  runner_ran_last_turn: 'Only after the Runner made a run',
  runner_successful_run_last_turn: `${SIDE_NAME.runner} made no successful run last turn`,
  hosted_credits: 'No credits left on it',
  corp_archives_not_empty: 'Archives is empty',
  has_install_target: 'No program or hardware in your Grip',
  runner_tagged: `${SIDE_NAME.runner} isn't ${TERMS.tagged.toLowerCase()}`,
} as const;

type ConditionView = Pick<PlayerView, 'viewer' | 'players' | 'corpServers' | 'rig'>;

/** The card id behind an installed or scored uid (`score:corp:0`), as `view` sees it. */
function cardOfUid(view: ConditionView, uid: string): string | null {
  const scored = /^score:(corp|runner):(\d+)$/.exec(uid);
  if (scored) return view.players[scored[1] as 'corp' | 'runner'].scored[Number(scored[2])] ?? null;
  for (const srv of view.corpServers) for (const c of [...srv.ice, ...srv.content]) if (c.uid === uid) return c.cardId;
  return view.rig.find((c) => c.uid === uid)?.cardId ?? null;
}

/**
 * Sprint 9: why an option's condition does not hold, from card data: SEA Source
 * "Runner made no successful run last turn", Private Security Force "Runner isn't
 * tagged", an emptied Armitage "No credits left on it". Null when unknown.
 */
export function conditionText(option: Pick<CardOption, 'action'> | null | undefined, view: ConditionView | null | undefined): string | null {
  const a = option?.action;
  if (!a || !view) return null;
  if (a.type === 'play') {
    const id = view.players[view.viewer].hand?.[a.handIndex];
    const cond = id ? getCard(id)?.playIf : undefined;
    return cond ? CONDITION_TEXT[cond] : null;
  }
  if (a.type === 'activate') {
    const id = cardOfUid(view, a.uid);
    const def = id ? getCard(id) : undefined;
    const ability = a.uid.startsWith('score:') ? def?.scoredAbilities?.[a.ability] : def?.cardAbilities?.[a.ability];
    return ability?.requires ? CONDITION_TEXT[ability.requires] : null;
  }
  if (a.type === 'trash_resource') return CONDITION_TEXT.runner_tagged;
  if (a.type === 'remove_tag') return `No ${TERMS.tag.toLowerCase()}s to remove`;
  return null;
}

/** A refusal in words: `hintFor`, with `condition_not_met` said from the option's card (Sprint 9). */
export function rejectText(reason: RejectReason, view: (HintView & Partial<ConditionView>) | null, option?: Pick<CardOption, 'clicks' | 'action'> | null): string {
  if (reason === 'condition_not_met' && view?.players && view.corpServers && view.rig) {
    const t = conditionText(option, view as ConditionView);
    if (t) return t;
  }
  return hintFor(reason, view, option);
}

/**
 * QA-S8-1: a click ability that costs more than one click (Melange: 3) says what it
 * needs while some clicks are left ("Needs 3 clicks"); "No clicks left" only at 0.
 * Both numbers come from the engine: the option's `clicks` and the view's click count.
 */
export function clicksHint(option: Pick<CardOption, 'clicks'> | null | undefined, clicksLeft: number | null | undefined): string {
  const need = option?.clicks ?? 1;
  if (need > 1 && clicksLeft !== null && clicksLeft !== undefined && clicksLeft > 0) return `Needs ${need} clicks`;
  return 'No clicks left';
}

type HintView = Pick<PlayerView, 'viewer' | 'pendingDiscard'> & { choice?: PlayerView['choice']; players?: PlayerView['players'] };

/** `option`: the refused button's option, when known (its click price shapes the `no_clicks` words). */
export function hintFor(reason: RejectReason, view: HintView | null, option?: Pick<CardOption, 'clicks'> | null): string {
  switch (reason) {
    case 'no_clicks':
      return clicksHint(option, view?.players?.[view.viewer].clicks);
    case 'not_your_turn':
      return 'Not your turn';
    case 'deck_empty':
      return view?.viewer === 'corp' ? `${TERMS.rd} is empty` : `Your ${TERMS.stack} is empty`;
    case 'game_over':
      return 'The game is over';
    case 'wrong_phase':
      if (view?.pendingDiscard) return 'Pick your discards first';
      return view?.choice ? choiceHint(view.choice) : "You can't do that right now";
    case 'bad_discard':
      return 'Pick exactly the cards asked for';
    case 'invalid_action':
    case 'bad_card':
    case 'bad_target':
      return "That move isn't allowed";
    case 'no_credits':
      return 'Not enough credits';
    case 'no_memory':
      return `Not enough ${TERMS.memory.toLowerCase()}`;
    case 'not_implemented':
      // No starter card is unbuilt any more (Sprint 3); kept for future cards.
      return "That card can't be played yet";
    case 'too_weak':
      return 'Raise strength first';
    case 'condition_not_met':
      return 'Only after the Runner made a run';
  }
}

/**
 * S-10-6: a toast's identical lines in a row collapse into one with a count:
 * "PAD Campaign: +1 credit" four times -> "PAD Campaign: +1 credit ×4" (keeps it short
 * enough to stay readable in the small rail slot).
 */
export function collapseRepeats(text: string): string {
  const out: string[] = [];
  let prev: string | null = null;
  let n = 0;
  const flush = () => {
    if (prev !== null) out.push(n > 1 ? `${prev} ×${n}` : prev);
  };
  for (const line of text.split('\n')) {
    if (line === prev) {
      n++;
      continue;
    }
    flush();
    prev = line;
    n = 1;
  }
  flush();
  return out.join('\n');
}
