import { CORP_CARDS, CORP_CORE45_DECK, CORP_CORE_DECK, CORP_STARTER_DECK } from './corp';
import { RUNNER_CARDS, RUNNER_CORE45_DECK, RUNNER_CORE_DECK, RUNNER_STARTER_DECK } from './runner';
import type { CardDef } from './types';

export type * from './types';
export { TRACE_SUCCESS_OPS } from './types';
export { CORP_CARDS, CORP_CORE45_DECK, CORP_CORE_DECK, CORP_STARTER_DECK, RUNNER_CARDS, RUNNER_CORE45_DECK, RUNNER_CORE_DECK, RUNNER_STARTER_DECK };
export { checkDeck, deckAgendaPoints, deckInfluence, HOUSE_MIN_DECK_SIZE, MAX_COPIES, type DeckProblem } from './deck';

export const ALL_CARDS: readonly CardDef[] = [...RUNNER_CARDS, ...CORP_CARDS];

const BY_ID: ReadonlyMap<string, CardDef> = new Map(ALL_CARDS.map((c) => [c.id, c]));

/** Look up a card definition by id. Returns undefined for unknown ids. */
export function getCard(id: string): CardDef | undefined {
  return BY_ID.get(id);
}
