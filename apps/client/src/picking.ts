// Tap-to-play decisions that need no Pixi (unit tested): what a tap on a hand
// card does, given the engine's options for it, and the plain-language hint
// for each refusal reason. No rules here: options, prices and reasons all come
// from view.handOptions / action_rejected.
import type { Action, CardOption, PlayerView, RejectReason } from '@overclock/engine';
import { TERMS, priceText, serverLabel } from './terms';

/** Plain-language hints for refused actions. */
export function hintFor(reason: RejectReason, view: PlayerView | null): string {
  switch (reason) {
    case 'no_clicks':
      return 'No clicks left';
    case 'not_your_turn':
      return 'Not your turn';
    case 'deck_empty':
      return 'Your deck is empty';
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
      return 'Not enough memory';
    case 'not_implemented':
      return 'Needs runs (coming soon)';
  }
}


/** Reasons that refuse every use of a card right now, whatever spot you pick: say so at once. */
export const BLOCKING: ReadonlySet<RejectReason> = new Set(['no_clicks', 'not_your_turn', 'wrong_phase', 'game_over', 'not_implemented']);

export type PickOutcome =
  /** Nothing offered for this card (should not happen in action phase). */
  | { kind: 'none' }
  /** Every option is refused for the same reason no spot can fix: show the hint, light nothing. */
  | { kind: 'hint'; reason: RejectReason }
  /** Light every option (refused ones too: they show their price, a tap shows why). */
  | { kind: 'targets'; options: readonly CardOption[] };

export function pickOutcome(options: readonly CardOption[]): PickOutcome {
  if (options.length === 0) return { kind: 'none' };
  const first = options[0]!.reject;
  if (first !== null && BLOCKING.has(first) && options.every((o) => o.reject === first)) return { kind: 'hint', reason: first };
  return { kind: 'targets', options };
}

/**
 * What a lit target says: `label` for the test hook / screen readers ("Server 1 · 2 credits",
 * "New server · free", "Install · 3 credits", "Play · 5 credits"), `chip` drawn on it.
 */
export function targetText(action: Action, cost: number): { label: string; chip: string } {
  const price = priceText(cost);
  if (action.type === 'install' && action.server !== undefined) {
    const name = serverLabel(action.server);
    return { label: `${name} · ${price}`, chip: action.server === 'new' ? `${name}\n${price}` : price };
  }
  if (action.type === 'install') return { label: `${TERMS.install} · ${price}`, chip: `${TERMS.install}\n${price}` };
  if (action.type === 'play') return { label: `${TERMS.play} · ${price}`, chip: `${TERMS.play} · ${price}` };
  return { label: action.type, chip: action.type };
}
