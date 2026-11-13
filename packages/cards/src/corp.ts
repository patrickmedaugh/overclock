import type { CardDef, DeckList } from './types';

/**
 * Corp starter pool: real cards from the original Core Set (2012), official
 * names, stats and text, with symbols spelled as words ("1 credit", "click",
 * "Subroutine:"). Taken from memory of the official card list (no source in
 * the repo): see docs/DECISIONS.md, spot-check before relying on exact text.
 * Art keys are our own runtime-drawn glyphs.
 */
export const CORP_CARDS: readonly CardDef[] = [
  {
    id: 'c01',
    name: 'Hedge Fund',
    side: 'corp',
    type: 'operation',
    cost: 5,
    text: 'Gain 9 credits.',
    art: 'glyph:chart-up',
    onPlay: [{ op: 'gain_credits', amount: 9 }],
  },
  {
    id: 'c02',
    name: 'Anonymous Tip',
    side: 'corp',
    type: 'operation',
    cost: 0,
    text: 'Draw 3 cards.',
    art: 'glyph:memo',
    onPlay: [{ op: 'draw', count: 3 }],
  },
  {
    id: 'c03',
    name: 'PAD Campaign',
    side: 'corp',
    type: 'asset',
    cost: 2,
    trashCost: 4,
    text: 'Gain 1 credit when your turn begins.',
    art: 'glyph:kiosk',
  },
  {
    id: 'c04',
    name: 'Wall of Static',
    side: 'corp',
    type: 'ice',
    subtype: 'barrier',
    cost: 3,
    strength: 3,
    text: 'Subroutine: End the run.',
    art: 'glyph:lattice',
    subroutines: [{ text: 'End the run', effect: { op: 'end_run' } }],
  },
  {
    id: 'c05',
    name: 'Ice Wall',
    side: 'corp',
    type: 'ice',
    subtype: 'barrier',
    cost: 1,
    strength: 1,
    text: 'Ice Wall can be advanced and has +1 strength for each advancement token on it.\nSubroutine: End the run.',
    art: 'glyph:fence',
    subroutines: [{ text: 'End the run', effect: { op: 'end_run' } }],
  },
  {
    id: 'c06',
    name: 'Enigma',
    side: 'corp',
    type: 'ice',
    subtype: 'code_gate',
    cost: 3,
    strength: 2,
    text: 'Subroutine: The Runner loses 1 click, if able.\nSubroutine: End the run.',
    art: 'glyph:turnstile',
    subroutines: [
      { text: 'The Runner loses 1 click, if able', effect: { op: 'lose_clicks', amount: 1 } },
      { text: 'End the run', effect: { op: 'end_run' } },
    ],
  },
  {
    id: 'c07',
    name: 'Neural Katana',
    side: 'corp',
    type: 'ice',
    subtype: 'sentry',
    cost: 4,
    strength: 3,
    text: 'Subroutine: Do 3 net damage.',
    art: 'glyph:drone',
    subroutines: [{ text: 'Do 3 net damage', effect: { op: 'net_damage', amount: 3 } }],
  },
  {
    id: 'c08',
    name: 'Hostile Takeover',
    side: 'corp',
    type: 'agenda',
    cost: 0,
    advancementRequirement: 2,
    agendaPoints: 1,
    text: 'When you score Hostile Takeover, gain 7 credits and take 1 bad publicity.',
    art: 'glyph:merge',
    onScore: [
      { op: 'gain_credits', amount: 7 },
      { op: 'bad_publicity', amount: 1 },
    ],
  },
  {
    id: 'c09',
    name: 'Private Security Force',
    side: 'corp',
    type: 'agenda',
    cost: 0,
    advancementRequirement: 4,
    agendaPoints: 2,
    text: 'If the Runner is tagged, Private Security Force gains: "Click: Do 1 meat damage."',
    art: 'glyph:towers',
  },
  {
    id: 'c10',
    name: 'Priority Requisition',
    side: 'corp',
    type: 'agenda',
    cost: 0,
    advancementRequirement: 5,
    agendaPoints: 3,
    text: 'When you score Priority Requisition, you may rez a piece of ICE ignoring all costs.',
    art: 'glyph:brain-lock',
    onScore: [{ op: 'free_rez', what: 'ice' }],
  },
  {
    id: 'c11',
    name: 'Akitaro Watanabe',
    side: 'corp',
    type: 'upgrade',
    cost: 1,
    trashCost: 3,
    text: 'The rez cost of ICE protecting this server is lowered by 2.',
    art: 'glyph:eye-shield',
  },
  {
    id: 'c12',
    name: 'Neural EMP',
    side: 'corp',
    type: 'operation',
    cost: 2,
    text: 'Play only if the Runner made a run during his or her last turn.\nDo 1 net damage.',
    art: 'glyph:spike',
    playIf: 'runner_ran_last_turn',
    onPlay: [{ op: 'net_damage', amount: 1 }],
  },
];

/**
 * 17-card starter deck: one of each, plus an extra Hedge Fund, Ice Wall and
 * Enigma (6 ICE, enough for the busy board: 3 servers with 2 ICE each), and
 * from Sprint 3 an extra Hostile Takeover and Private Security Force (9 agenda
 * points, so a 7-point win is possible; owner Q2 A).
 */
export const CORP_STARTER_DECK: DeckList = [
  ...CORP_CARDS.map((c) => c.id),
  'c01',
  'c05',
  'c06',
  'c08',
  'c09',
];
