// Plain-language hints for actions the engine refused (its RejectReason),
// shown in the small hint toast. Pure, so every reason is unit tested.
import type { PlayerView, RejectReason } from '@overclock/engine';
import { TERMS } from './terms';

export function hintFor(reason: RejectReason, view: Pick<PlayerView, 'viewer' | 'pendingDiscard'> | null): string {
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
      return view?.pendingDiscard ? 'Pick your discards first' : "You can't do that right now";
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
      return 'Needs runs (coming soon)';
  }
}
