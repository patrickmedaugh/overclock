import type { CardDef, DeckDef, DeckList } from './types';

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
    faction: 'neutral',
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
    faction: 'nbn',
    influence: 1,
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
    faction: 'neutral',
    cost: 2,
    trashCost: 4,
    text: 'Gain 1 credit when your turn begins.',
    art: 'glyph:kiosk',
    onTurnStart: [{ op: 'gain_credits', amount: 1 }],
  },
  {
    id: 'c04',
    name: 'Wall of Static',
    side: 'corp',
    type: 'ice',
    faction: 'neutral',
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
    faction: 'weyland',
    influence: 1,
    subtype: 'barrier',
    cost: 1,
    strength: 1,
    text: 'Ice Wall can be advanced and has +1 strength for each advancement token on it.\nSubroutine: End the run.',
    art: 'glyph:fence',
    advanceable: true,
    strengthPerAdvancement: 1,
    subroutines: [{ text: 'End the run', effect: { op: 'end_run' } }],
  },
  {
    id: 'c06',
    name: 'Enigma',
    side: 'corp',
    type: 'ice',
    faction: 'neutral',
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
    faction: 'jinteki',
    influence: 2,
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
    faction: 'weyland',
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
    faction: 'neutral',
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
    faction: 'neutral',
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
    faction: 'jinteki',
    influence: 2,
    cost: 1,
    trashCost: 3,
    text: 'The rez cost of ICE protecting this server is lowered by 2.',
    art: 'glyph:eye-shield',
    iceRezDiscount: 2,
  },
  {
    id: 'c12',
    name: 'Neural EMP',
    side: 'corp',
    type: 'operation',
    faction: 'jinteki',
    influence: 2,
    cost: 2,
    text: 'Play only if the Runner made a run during his or her last turn.\nDo 1 net damage.',
    art: 'glyph:spike',
    playIf: 'runner_ran_last_turn',
    onPlay: [{ op: 'net_damage', amount: 1 }],
  },
  // ---- Sprint 8: Haas-Bioroid (identity + 6 cards). Numbers checked against the official Core Set list. ----
  {
    id: 'c13',
    name: 'Haas-Bioroid: Engineering the Future',
    side: 'corp',
    type: 'identity',
    faction: 'haas_bioroid',
    cost: 0,
    minDeckSize: 45,
    influenceLimit: 15,
    text: 'The first time you install a card each turn, gain 1 credit.',
    art: 'glyph:gear-helix',
    whenYouInstall: { firstEachTurn: true, effects: [{ op: 'gain_credits', amount: 1 }] },
  },
  {
    id: 'c14',
    name: 'Adonis Campaign',
    side: 'corp',
    type: 'asset',
    faction: 'haas_bioroid',
    influence: 2,
    cost: 4,
    trashCost: 3,
    text:
      'Put 12 credits from the bank on Adonis Campaign when rezzed. When there are no credits left on Adonis Campaign, trash it.\nTake 3 credits from Adonis Campaign when your turn begins.',
    art: 'glyph:billboard',
    onRez: [{ op: 'place_credits', amount: 12 }],
    onTurnStart: [{ op: 'take_credits', amount: 3 }],
    trashWhenEmpty: true,
  },
  {
    id: 'c15',
    name: 'Melange Mining Corp.',
    side: 'corp',
    type: 'asset',
    faction: 'neutral',
    cost: 1,
    trashCost: 1,
    text: 'Click, click, click: Gain 7 credits.',
    art: 'glyph:drill',
    cardAbilities: [{ label: 'Gain {gain} credits', when: 'click', clicks: 3, credits: 0, effects: [{ op: 'gain_credits', amount: 7 }] }],
  },
  {
    id: 'c16',
    name: 'Biotic Labor',
    side: 'corp',
    type: 'operation',
    faction: 'haas_bioroid',
    influence: 4,
    cost: 4,
    text: 'Gain 2 clicks.',
    art: 'glyph:cell-split',
    onPlay: [{ op: 'gain_clicks', amount: 2 }],
  },
  {
    id: 'c17',
    name: 'Viktor 1.0',
    side: 'corp',
    type: 'ice',
    subtype: 'code_gate',
    faction: 'haas_bioroid',
    influence: 2,
    cost: 3,
    strength: 3,
    text: 'Subroutine: Do 1 brain damage.\nSubroutine: End the run.',
    art: 'glyph:bioroid-face',
    subroutines: [
      { text: 'Do 1 brain damage', effect: { op: 'brain_damage', amount: 1 } },
      { text: 'End the run', effect: { op: 'end_run' } },
    ],
  },
  {
    id: 'c18',
    name: 'Heimdall 1.0',
    side: 'corp',
    type: 'ice',
    subtype: 'barrier',
    faction: 'haas_bioroid',
    influence: 2,
    cost: 8,
    strength: 6,
    text: 'Subroutine: Do 1 brain damage.\nSubroutine: End the run.\nSubroutine: End the run.',
    art: 'glyph:sentinel-gate',
    subroutines: [
      { text: 'Do 1 brain damage', effect: { op: 'brain_damage', amount: 1 } },
      { text: 'End the run', effect: { op: 'end_run' } },
      { text: 'End the run', effect: { op: 'end_run' } },
    ],
  },
  {
    id: 'c19',
    name: 'Rototurret',
    side: 'corp',
    type: 'ice',
    subtype: 'sentry',
    faction: 'haas_bioroid',
    influence: 1,
    cost: 4,
    strength: 0,
    text: 'Subroutine: Trash 1 program.\nSubroutine: End the run.',
    art: 'glyph:turret',
    subroutines: [
      { text: 'Trash 1 program', effect: { op: 'trash_installed', types: ['program'] } },
      { text: 'End the run', effect: { op: 'end_run' } },
    ],
  },
];

/**
 * 17-card starter deck: one of each, plus an extra Hedge Fund, Ice Wall and
 * Enigma (6 ICE, enough for the busy board: 3 servers with 2 ICE each), and
 * from Sprint 3 an extra Hostile Takeover and Private Security Force (9 agenda
 * points, so a 7-point win is possible; owner Q2 A).
 */
export const CORP_STARTER_DECK: DeckList = [
  // The 12 Sprint 2 cards, one each (frozen: Sprint 8 cards are not in it).
  ...['c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07', 'c08', 'c09', 'c10', 'c11', 'c12'],
  'c01',
  'c05',
  'c06',
  'c08',
  'c09',
];

/**
 * Sprint 8: the 30-card Haas-Bioroid core deck (proposal S-08 table, Rototurret ×2 in place of
 * 1 Wall of Static + 1 Enigma: DECISIONS 2026-11-15). 15 agenda points; influence 9 of 15.
 */
export const CORP_CORE_DECK: DeckDef = {
  identity: 'c13',
  cards: [
    ...['c01', 'c01', 'c01'], // Hedge Fund
    'c02', // Anonymous Tip
    'c12', // Neural EMP
    'c16', // Biotic Labor
    ...['c03', 'c03', 'c03'], // PAD Campaign
    ...['c14', 'c14'], // Adonis Campaign
    ...['c15', 'c15'], // Melange Mining Corp.
    'c11', // Akitaro Watanabe
    ...['c05', 'c05'], // Ice Wall
    'c04', // Wall of Static
    'c06', // Enigma
    ...['c19', 'c19'], // Rototurret
    'c07', // Neural Katana
    ...['c17', 'c17'], // Viktor 1.0
    'c18', // Heimdall 1.0
    ...['c10', 'c10', 'c10'], // Priority Requisition
    ...['c09', 'c09', 'c09'], // Private Security Force
  ],
};
