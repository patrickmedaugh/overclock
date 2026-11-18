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
    // Sprint 9: usable from the Corp's score area while the Runner is tagged.
    scoredAbilities: [
      { label: 'Do 1 meat damage', when: 'click', clicks: 1, credits: 0, requires: 'runner_tagged', effects: [{ op: 'meat_damage', amount: 1 }] },
    ],
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
  // ---- Sprint 9: trace cards. Numbers and 2012 wording checked against netrunner-cards-json (DECISIONS 2026-11-16). ----
  {
    id: 'c20',
    name: 'Hunter',
    side: 'corp',
    type: 'ice',
    subtype: 'sentry',
    faction: 'neutral',
    cost: 1,
    strength: 4,
    text: 'Subroutine: Trace 3 – If successful, give the Runner 1 tag.',
    art: 'glyph:crosshair',
    subroutines: [
      { text: 'Trace 3 – If successful, give the Runner 1 tag', effect: { op: 'trace', base: 3, onSuccess: [{ op: 'give_tags', amount: 1 }] } },
    ],
  },
  {
    id: 'c21',
    name: 'Ichi 1.0',
    side: 'corp',
    type: 'ice',
    subtype: 'sentry',
    faction: 'haas_bioroid',
    influence: 2,
    cost: 5,
    strength: 4,
    text:
      'Subroutine: Trash 1 program.\nSubroutine: Trash 1 program.\nSubroutine: Trace 1 – If successful, give the Runner 1 tag and do 1 brain damage.',
    art: 'glyph:bioroid-blade',
    subroutines: [
      { text: 'Trash 1 program', effect: { op: 'trash_installed', types: ['program'] } },
      { text: 'Trash 1 program', effect: { op: 'trash_installed', types: ['program'] } },
      {
        text: 'Trace 1 – If successful, give the Runner 1 tag and do 1 brain damage',
        effect: {
          op: 'trace',
          base: 1,
          onSuccess: [
            { op: 'give_tags', amount: 1 },
            { op: 'brain_damage', amount: 1 },
          ],
        },
      },
    ],
  },
  {
    id: 'c22',
    name: 'SEA Source',
    side: 'corp',
    type: 'operation',
    faction: 'nbn',
    influence: 2,
    cost: 2,
    text: 'Play only if the Runner made a successful run during his or her last turn.\nTrace 3 – If successful, give the Runner 1 tag.',
    art: 'glyph:radar-sweep',
    playIf: 'runner_successful_run_last_turn',
    onPlay: [{ op: 'trace', base: 3, onSuccess: [{ op: 'give_tags', amount: 1 }] }],
  },
  // ---- Sprint 12: Haas-Bioroid. Numbers and 2012 wording checked against netrunner-cards-json pack/core.json (DECISIONS 2026-11-18). ----
  {
    id: 'c23',
    name: 'Accelerated Beta Test',
    side: 'corp',
    type: 'agenda',
    faction: 'haas_bioroid',
    influence: 0,
    code: '01055',
    cost: 0,
    advancementRequirement: 3,
    agendaPoints: 2,
    text:
      'When you score Accelerated Beta Test, you may look at the top 3 cards of R&D. If any of those cards are ICE, you may install and rez them, ignoring all costs. Trash the rest of the cards you looked at.',
    art: 'glyph:beta-flask',
    // Sprint 12: always looks (the "may" is played as one tap; DECISIONS 2026-11-18); the rest go to Archives face down.
    onScore: [{ op: 'look_install_top', count: 3, types: ['ice'] }],
  },
  {
    id: 'c24',
    name: 'Archived Memories',
    side: 'corp',
    type: 'operation',
    faction: 'haas_bioroid',
    influence: 2,
    code: '01058',
    cost: 0,
    text: 'Add 1 card from Archives to HQ.',
    art: 'glyph:archive-return',
    // Sprint 12: any Archives card (face down too) except this copy; dimmed while Archives is empty.
    playIf: 'corp_archives_not_empty',
    onPlay: [{ op: 'archives_to_hand' }],
  },
  {
    id: 'c25',
    name: 'Experiential Data',
    side: 'corp',
    type: 'upgrade',
    faction: 'haas_bioroid',
    influence: 1,
    code: '01066',
    cost: 2,
    trashCost: 2,
    text: 'All ICE protecting this server has +1 strength.',
    art: 'glyph:signal-boost',
    iceStrengthBonus: 1,
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
 * The 30-card Haas-Bioroid core deck. Sprint 8 list (DECISIONS 2026-11-15), Sprint 9 swaps (proposal S-09
 * table): −1 Anonymous Tip +1 SEA Source, −1 PAD Campaign +1 Hunter, −1 Neural Katana +1 Hunter,
 * −1 Rototurret +1 Ichi 1.0. 15 agenda points; influence 8 of 15.
 */
export const CORP_CORE_DECK: DeckDef = {
  identity: 'c13',
  cards: [
    ...['c01', 'c01', 'c01'], // Hedge Fund
    'c22', // SEA Source
    'c12', // Neural EMP
    'c16', // Biotic Labor
    ...['c03', 'c03'], // PAD Campaign
    ...['c14', 'c14'], // Adonis Campaign
    ...['c15', 'c15'], // Melange Mining Corp.
    'c11', // Akitaro Watanabe
    ...['c05', 'c05'], // Ice Wall
    'c04', // Wall of Static
    'c06', // Enigma
    ...['c20', 'c20'], // Hunter
    'c19', // Rototurret
    'c21', // Ichi 1.0
    ...['c17', 'c17'], // Viktor 1.0
    'c18', // Heimdall 1.0
    ...['c10', 'c10', 'c10'], // Priority Requisition
    ...['c09', 'c09', 'c09'], // Private Security Force
  ],
};
