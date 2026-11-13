// Plain-language hints for actions the engine refused (its RejectReason),
// shown in the small hint toast. Pure, so every reason is unit tested.
import type { PlayerView, RejectReason } from '@overclock/engine';
import { TERMS } from './terms';

/** S-04-4: what to do while the Corp's free-rez choice is open. */
export const CHOICE_HINT = 'Rez one ICE for free, or tap Skip';

export function hintFor(reason: RejectReason, view: (Pick<PlayerView, 'viewer' | 'pendingDiscard'> & { choice?: PlayerView['choice'] }) | null): string {
  switch (reason) {
    case 'no_clicks':
      return 'No clicks left';
    case 'not_your_turn':
      return 'Not your turn';
    case 'deck_empty':
      return view?.viewer === 'corp' ? `${TERMS.rd} is empty` : `Your ${TERMS.stack} is empty`;
    case 'game_over':
      return 'The game is over';
    case 'wrong_phase':
      if (view?.pendingDiscard) return 'Pick your discards first';
      return view?.choice ? CHOICE_HINT : "You can't do that right now";
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
