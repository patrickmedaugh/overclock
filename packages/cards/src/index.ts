import { CORP_CARDS, CORP_STARTER_DECK } from './corp';
import { RUNNER_CARDS, RUNNER_STARTER_DECK } from './runner';
import type { CardDef } from './types';

export type * from './types';
export { CORP_CARDS, CORP_STARTER_DECK, RUNNER_CARDS, RUNNER_STARTER_DECK };

export const ALL_CARDS: readonly CardDef[] = [...RUNNER_CARDS, ...CORP_CARDS];

const BY_ID: ReadonlyMap<string, CardDef> = new Map(ALL_CARDS.map((c) => [c.id, c]));

/** Look up a card definition by id. Returns undefined for unknown ids. */
export function getCard(id: string): CardDef | undefined {
  return BY_ID.get(id);
}
