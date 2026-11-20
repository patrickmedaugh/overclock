// Sprint 13 (S-13-1..5): plain words for the deck builder. Codes in, words out: every number and
// every rule comes from `@overclock/cards` (`deckStatus`, `addBlock`, `checkDeck`); nothing here
// counts cards or decides what is legal.
import { type AddBlock, type CardType, type DeckProblem, type DeckStatus, type Faction, MAX_COPIES, getCard } from '@overclock/cards';
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
  newer: 'These decks were saved by a newer version of the game. Update to change them.',
  notKept: "Decks can't be kept on this device (storage is off).",
  otherSide: "This deck's identity is for the other side",
} as const;

/** "2 minutes" (whole minutes, rounded up, at least 1). */
function minutesText(ms: number): string {
  return plural(Math.max(1, Math.ceil(ms / 60_000)), 'minute', 'minutes');
}

/** Sprint 14 (S-14-1, S-14-2): the decks kept online and the deck code. */
export const SYNC_TEXT = {
  saved: 'Saved online',
  saving: 'Saving online…',
  pending: "Saved on this device · goes online when you're connected",
  myCode: 'My deck code',
  haveCode: 'I have a deck code',
  codeTitle: 'Your deck code',
  codeNote: 'On your other device, tap Decks, then I have a deck code, and type it.',
  keepSafe: "Keep it safe (a screenshot or a note): it's the key to your decks. Share it only between your own devices.",
  copy: 'Copy',
  copied: 'Code copied',
  gettingCode: 'Getting your code…',
  noService: "Can't reach the online service. Check your connection and try again.",
  linkTitle: 'I have a deck code',
  linkNote: 'Type the code from your other device. The decks on both devices end up on both.',
  link: 'Link',
  linking: 'Linking…',
  linked: 'Linked: your decks are here now',
  badCode: 'Deck codes are 12 letters or numbers, like KX4P-9MTR-QZ7D',
  noDecks: 'No decks with that code',
  /** "Too many wrong codes. Try again in 2 minutes." (whole minutes, rounded up). */
  wait: (ms: number) => `Too many wrong codes. Try again in ${minutesText(ms)}.`,
  /** Too many new codes asked for from this device (the service's limit). */
  waitNew: (ms: number) => `Too many new codes from this device. Try again in ${minutesText(ms)}.`,
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
      return `${cardName(p.cardId)}: max ${MAX_COPIES} copies`;
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

/** Sprint 14 (S-14-3): online deck picking. */
export const ONLINE_DECK_TEXT = {
  /** Host, after picking a side: "Pick your Corp deck". */
  pickTitle: (side: Side) => `Pick your ${SIDE_WORD[side]} deck`,
  start: 'Get the code',
  /** Guest, after typing the code: "You'll play the Runner". */
  youPlay: (side: Side) => `You'll play the ${SIDE_WORD[side]}`,
  join: 'Join',
  friendPicking: 'Your friend is picking a deck…',
  refused: "This deck isn't ready to play",
} as const;

/**
 * The online service refused a deck (S-14-4): "This deck isn't ready to play: 4 copies of Hedge
 * Fund". `problems` come from the service (checked only for a string `kind`), so anything this
 * build can't word falls back to the short sentence.
 */
export function refusedText(problems: readonly { kind: string }[], identity: string): string {
  const words: string[] = [];
  for (const p of problems) {
    let w: string | undefined;
    try {
      const q = p as DeckProblem;
      if (q.kind === 'too_many_copies' && typeof q.copies === 'number' && typeof q.cardId === 'string') w = `${q.copies} copies of ${getCard(q.cardId)?.name ?? 'a card'}`;
      else w = problemText(q, identity) as string | undefined;
    } catch {
      w = undefined;
    }
    if (typeof w === 'string' && w && !words.includes(w)) words.push(w);
  }
  return words.length > 0 ? `${ONLINE_DECK_TEXT.refused}: ${words.join(' · ')}` : ONLINE_DECK_TEXT.refused;
}
