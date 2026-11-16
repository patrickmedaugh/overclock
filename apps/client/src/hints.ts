// Plain-language hints for actions the engine refused (its RejectReason),
// shown in the small hint toast. Pure, so every reason is unit tested.
import type { CardOption, PlayerView, RejectReason } from '@overclock/engine';
import { TERMS } from './terms';

/** S-04-4: what to do while the Corp's free-rez choice is open. */
export const CHOICE_HINT = 'Rez one ICE for free, or tap Skip';
/** S-08-7: what to do while a choice inside a run (Rototurret) is open. */
export const RUN_CHOICE_HINT = 'Tap one of the lit buttons first';

/** The hint for an open choice (free rez, or one inside a run). */
export function choiceHint(choice: PlayerView['choice'] | undefined): string {
  return choice && choice.kind !== 'free_rez' ? RUN_CHOICE_HINT : CHOICE_HINT;
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
