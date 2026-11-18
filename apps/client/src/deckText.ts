// Sprint 13 (S-13-1..5): plain words for the deck builder. Codes in, words out: every number and
// every rule comes from `@overclock/cards` (`deckStatus`, `addBlock`, `checkDeck`); nothing here
// counts cards or decides what is legal.
import { type AddBlock, type CardType, type DeckProblem, type DeckStatus, type Faction, getCard } from '@overclock/cards';
import type { Side } from '@overclock/engine';
import { plural } from './terms';

export const DECK_TEXT = {
  decks: 'Decks',
  decksSub: 'Build your own',
  title: 'Your decks',
  newDeck: (side: Side) => `New ${SIDE_WORD[side]} deck`,
  newTitle: (side: Side) => `New ${SIDE_WORD[side]} deck`,
  fromStandard: 'Start from the standard deck',
  fromStandardSub: 'The 45 cards you play today',
  empty: 'Start empty',
  emptySub: 'Build from scratch',
  copyToEdit: 'Copy to edit',
  delete: 'Delete',
  keep: 'Keep',
  deleteAsk: (name: string) => `Delete "${name}"? This can't be undone.`,
  inDeck: 'In deck',
  readOnly: 'Standard deck: read only',
  ready: 'Ready to play',
  rename: 'Deck name',
  pickTitle: 'Pick your decks',
  corpDeck: 'Corp deck',
  runnerDeck: 'Runner deck',
  start: 'Start',
  onlineStandard: 'Online games use the standard decks for now.',
  newer: 'These decks were saved by a newer version of the game. Update to change them.',
  notKept: "Decks can't be kept on this device (storage is off).",
} as const;

const SIDE_WORD: Record<Side, string> = { corp: 'Corp', runner: 'Runner' };

export const FACTION_NAME: Record<Faction, string> = {
  haas_bioroid: 'Haas-Bioroid',
  jinteki: 'Jinteki',
  nbn: 'NBN',
  weyland: 'Weyland',
  anarch: 'Anarch',
  criminal: 'Criminal',
  shaper: 'Shaper',
  neutral: 'Neutral',
};

/** Group headings in the editor ("Agendas", "ICE", ...). */
export const GROUP_NAME: Partial<Record<CardType, string>> = {
  agenda: 'Agendas',
  ice: 'ICE',
  asset: 'Assets',
  upgrade: 'Upgrades',
  operation: 'Operations',
  event: 'Events',
  hardware: 'Hardware',
  resource: 'Resources',
  program: 'Programs',
};

/** "Standard Corp deck (Haas-Bioroid)" / "Standard Runner deck (Kate)". */
export function standardDeckName(side: Side, identity: string): string {
  return `Standard ${SIDE_WORD[side]} deck (${identityShort(identity)})`;
}

/** A short name for an identity: the part before the colon ("Haas-Bioroid", "Kate \"Mac\" McCaffrey" -> "Kate"). */
export function identityShort(identity: string): string {
  const name = getCard(identity)?.name ?? identity;
  const head = name.split(':')[0]!.trim();
  // Runner identities are people: first name only ("Kate").
  return getCard(identity)?.side === 'runner' ? head.split(/[\s"]/)[0]! : head;
}

/** "My Corp deck 3": the first number not taken by `names`. */
export function newDeckName(side: Side, names: readonly string[]): string {
  const taken = new Set(names);
  for (let n = 1; ; n++) {
    const name = `My ${SIDE_WORD[side]} deck ${n}`;
    if (!taken.has(name)) return name;
  }
}

/** "45 cards" (a deck list's count). */
export function cardCountText(n: number): string {
  return plural(n, 'card', 'cards');
}

/** The bar's card count: "41 / 45 cards". */
export function sizeText(s: DeckStatus): string {
  return `${s.size} / ${s.minSize} cards`;
}

/** The bar's influence: "Influence 8 / 15". */
export function influenceText(s: DeckStatus): string {
  return `Influence ${s.influence} / ${s.influenceLimit}`;
}

/** The bar's agenda points (Corp): "Agenda points 18 (needs 20–21)"; null for the Runner. */
export function agendaText(s: DeckStatus): string | null {
  if (!s.agendaRange) return null;
  const { min, max } = s.agendaRange;
  return `Agenda points ${s.agendaPoints} (needs ${min === max ? min : `${min}–${max}`})`;
}

/** Which bar parts are red: each part is red exactly when `checkDeck` reports its problem. */
export function barFlags(s: DeckStatus): { size: boolean; influence: boolean; agenda: boolean } {
  return {
    size: s.problems.some((p) => p.kind === 'too_small'),
    influence: s.problems.some((p) => p.kind === 'influence'),
    agenda: s.problems.some((p) => p.kind === 'agenda_points'),
  };
}

const cardName = (id: string) => getCard(id)?.name ?? 'A card';

/** One problem in plain words ("4 cards short", "2 influence over the limit"). */
export function problemText(p: DeckProblem, identity: string): string {
  switch (p.kind) {
    case 'too_small': {
      const n = p.min - p.size;
      return `${plural(n, 'card', 'cards')} short`;
    }
    case 'influence': {
      const n = p.used - p.limit;
      return `${n} influence over the limit`;
    }
    case 'agenda_points':
      return p.points < p.min
        ? `${plural(p.min - p.points, 'agenda point', 'agenda points')} short`
        : `${plural(p.points - p.max, 'agenda point', 'agenda points')} too many`;
    case 'too_many_copies':
      return `${cardName(p.cardId)}: max 3 copies`;
    case 'agenda_faction': {
      const card = getCard(p.cardId);
      const idf = getCard(identity)?.faction;
      return card && idf ? `${card.name}: ${agendaFactionText(idf, card.faction)}` : `${cardName(p.cardId)} can't be used`;
    }
    case 'wrong_side':
      return `${cardName(p.cardId)} is a card for the other side`;
    case 'identity_in_deck':
      return `${cardName(p.cardId)} can't go in a deck`;
    case 'unknown_card':
      return p.cardId === identity ? "This deck's identity isn't in this version" : "A card isn't in this version";
    case 'not_identity':
      return "This deck's identity isn't an identity card";
  }
}

/** "Haas-Bioroid can't use Weyland agendas". */
export function agendaFactionText(identityFaction: Faction, cardFaction: Faction): string {
  return `${FACTION_NAME[identityFaction]} can't use ${FACTION_NAME[cardFaction]} agendas`;
}

/** Why a + is dimmed ("Max 3 copies", "Haas-Bioroid can't use Weyland agendas"). */
export function addBlockText(b: AddBlock): string {
  switch (b.kind) {
    case 'max_copies':
      return `Max ${b.limit} copies`;
    case 'agenda_faction':
      return agendaFactionText(b.identityFaction, b.cardFaction);
    case 'wrong_side':
      return 'That card is for the other side';
    case 'unknown_card':
      return "That card can't go in a deck";
  }
}

/** A deck's short note: "Ready to play", or its first problem in words (red). */
export function deckNote(s: DeckStatus, identity: string): { ready: boolean; text: string } {
  const first = s.problems[0];
  return first ? { ready: false, text: problemText(first, identity) } : { ready: true, text: DECK_TEXT.ready };
}

/** Every problem in words (the editor's note line), most important first as `checkDeck` lists them. */
export function problemsText(s: DeckStatus, identity: string): string[] {
  return [...new Set(s.problems.map((p) => problemText(p, identity)))];
}

/** "2 / 3": copies in the deck against the copy limit. */
export function copiesText(n: number, limit: number): string {
  return `${n} / ${limit}`;
}
