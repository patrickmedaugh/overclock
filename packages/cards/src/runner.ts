import type { CardDef, DeckDef, DeckList } from './types';

/**
 * Runner starter pool: real cards from the original Core Set (2012), official
 * names, stats and text, with symbols spelled as words ("1 credit", "Click",
 * "Trash", "memory"). Taken from memory of the official card list (no source
 * in the repo): see docs/DECISIONS.md, spot-check before relying on exact text.
 * Art keys are our own runtime-drawn glyphs.
 */
export const RUNNER_CARDS: readonly CardDef[] = [
  {
    id: 'r01',
    name: 'Easy Mark',
    side: 'runner',
    type: 'event',
    faction: 'criminal',
    influence: 1,
    cost: 0,
    text: 'Gain 3 credits.',
    art: 'glyph:coin-stack',
    onPlay: [{ op: 'gain_credits', amount: 3 }],
  },
  {
    id: 'r02',
    name: 'Armitage Codebusting',
    side: 'runner',
    type: 'resource',
    faction: 'neutral',
    cost: 1,
    text:
      'Place 12 credits from the bank on Armitage Codebusting when it is installed. When there are no credits left on Armitage Codebusting, trash it.\nClick: Take 2 credits from Armitage Codebusting.',
    art: 'glyph:handshake',
    onInstall: [{ op: 'place_credits', amount: 12 }],
    trashWhenEmpty: true,
    cardAbilities: [
      {
        label: 'Take {gain} credits',
        when: 'click',
        clicks: 1,
        credits: 0,
        requires: 'hosted_credits',
        effects: [{ op: 'take_credits', amount: 2 }],
      },
    ],
  },
  {
    id: 'r03',
    name: 'Diesel',
    side: 'runner',
    type: 'event',
    faction: 'shaper',
    influence: 2,
    cost: 0,
    text: 'Draw 3 cards.',
    art: 'glyph:folder-open',
    onPlay: [{ op: 'draw', count: 3 }],
  },
  {
    id: 'r04',
    name: 'Corroder',
    side: 'runner',
    type: 'program',
    faction: 'anarch',
    influence: 2,
    subtype: 'breaker_barrier',
    cost: 2,
    memory: 1,
    strength: 2,
    text: '1 credit: Break barrier subroutine.\n1 credit: +1 strength.',
    art: 'glyph:teeth',
    abilities: [
      { op: 'break', cost: 1, iceType: 'barrier', count: 1 },
      { op: 'strength', cost: 1, amount: 1, until: 'encounter' },
    ],
  },
  {
    id: 'r05',
    name: 'Gordian Blade',
    side: 'runner',
    type: 'program',
    faction: 'shaper',
    influence: 3,
    subtype: 'breaker_code_gate',
    cost: 4,
    memory: 1,
    strength: 2,
    text: '1 credit: Break code gate subroutine.\n1 credit: +1 strength for the remainder of this run.',
    art: 'glyph:keyhole',
    abilities: [
      { op: 'break', cost: 1, iceType: 'code_gate', count: 1 },
      { op: 'strength', cost: 1, amount: 1, until: 'run' },
    ],
  },
  {
    id: 'r06',
    name: 'Ninja',
    side: 'runner',
    type: 'program',
    faction: 'criminal',
    influence: 2,
    subtype: 'breaker_sentry',
    cost: 4,
    memory: 1,
    strength: 0,
    text: '1 credit: Break sentry subroutine.\n3 credits: +5 strength.',
    art: 'glyph:muzzle',
    abilities: [
      { op: 'break', cost: 1, iceType: 'sentry', count: 1 },
      { op: 'strength', cost: 3, amount: 5, until: 'encounter' },
    ],
  },
  {
    id: 'r07',
    name: "The Maker's Eye",
    side: 'runner',
    type: 'event',
    faction: 'shaper',
    influence: 2,
    cost: 2,
    text: 'Make a run on R&D. If successful, access 2 additional cards from R&D.',
    art: 'glyph:pin',
    onPlay: [{ op: 'run', server: 'rd', extraAccess: 2 }],
  },
  {
    id: 'r08',
    name: 'Cyberfeeder',
    side: 'runner',
    type: 'hardware',
    faction: 'anarch',
    influence: 1,
    cost: 2,
    text: '1 recurring credit.\nUse this credit to pay for using icebreakers or for installing virus programs.',
    art: 'glyph:lung',
    recurringCredits: { amount: 1, for: 'icebreaker' },
  },
  {
    id: 'r09',
    name: 'Akamatsu Mem Chip',
    side: 'runner',
    type: 'hardware',
    faction: 'shaper',
    influence: 1,
    cost: 1,
    text: '+1 memory.',
    art: 'glyph:halo',
    memoryBonus: 1,
  },
  {
    id: 'r10',
    name: 'Bank Job',
    side: 'runner',
    type: 'resource',
    faction: 'criminal',
    influence: 2,
    cost: 1,
    text:
      'Place 8 credits from the bank on Bank Job when it is installed. When there are no credits left on Bank Job, trash it.\nWhenever you make a successful run on a remote server, instead of accessing cards you may take any number of credits from Bank Job.',
    art: 'glyph:cross',
    onInstall: [{ op: 'place_credits', amount: 8 }],
    trashWhenEmpty: true,
    cardAbilities: [
      {
        // Sprint 10: the Runner picks the amount (1..what it holds).
        label: 'Take credits',
        when: 'successful_run_remote',
        clicks: 0,
        credits: 0,
        requires: 'hosted_credits',
        replacesAccess: true,
        effects: [{ op: 'take_credits', amount: 'chosen' }],
      },
    ],
  },
  {
    id: 'r11',
    name: 'Inside Job',
    side: 'runner',
    type: 'event',
    faction: 'criminal',
    influence: 3,
    cost: 2,
    text: 'Make a run. Bypass the first piece of ICE encountered during this run.',
    art: 'glyph:wave-cut',
    onPlay: [{ op: 'run', bypassFirst: true }],
  },
  {
    id: 'r12',
    name: 'Sacrificial Construct',
    side: 'runner',
    type: 'resource',
    faction: 'shaper',
    influence: 1,
    cost: 0,
    text: 'Trash: Prevent an installed program or an installed piece of hardware from being trashed.',
    art: 'glyph:mask',
    trashPrevention: { types: ['program', 'hardware'] },
  },
  // ---- Sprint 8: Kate (identity + 4 cards). Numbers checked against the official Core Set list. ----
  {
    id: 'r13',
    name: 'Kate "Mac" McCaffrey: Digital Tinker',
    side: 'runner',
    type: 'identity',
    faction: 'shaper',
    cost: 0,
    minDeckSize: 45,
    influenceLimit: 15,
    link: 1,
    text: 'Lower the install cost of the first program or piece of hardware you install each turn by 1.',
    art: 'glyph:wrench-spark',
    installDiscount: { amount: 1, firstEachTurn: true, types: ['program', 'hardware'] },
  },
  {
    id: 'r14',
    name: 'Sure Gamble',
    side: 'runner',
    type: 'event',
    faction: 'neutral',
    cost: 5,
    text: 'Gain 9 credits.',
    art: 'glyph:dice',
    onPlay: [{ op: 'gain_credits', amount: 9 }],
  },
  {
    id: 'r15',
    name: 'Magnum Opus',
    side: 'runner',
    type: 'program',
    faction: 'shaper',
    influence: 2,
    cost: 5,
    memory: 2,
    text: 'Click: Gain 2 credits.',
    art: 'glyph:opus',
    cardAbilities: [{ label: 'Gain {gain} credits', when: 'click', clicks: 1, credits: 0, effects: [{ op: 'gain_credits', amount: 2 }] }],
  },
  {
    id: 'r16',
    name: 'Pipeline',
    side: 'runner',
    type: 'program',
    subtype: 'breaker_sentry',
    faction: 'shaper',
    influence: 1,
    cost: 3,
    memory: 1,
    strength: 1,
    text: '1 credit: Break sentry subroutine.\n2 credits: +1 strength for the remainder of this run.',
    art: 'glyph:pipe',
    abilities: [
      { op: 'break', cost: 1, iceType: 'sentry', count: 1 },
      { op: 'strength', cost: 2, amount: 1, until: 'run' },
    ],
  },
  {
    id: 'r17',
    name: 'Battering Ram',
    side: 'runner',
    type: 'program',
    subtype: 'breaker_barrier',
    faction: 'shaper',
    influence: 2,
    cost: 5,
    memory: 2,
    strength: 3,
    text: '2 credits: Break up to 2 barrier subroutines.\n1 credit: +1 strength for the remainder of this run.',
    art: 'glyph:ram',
    abilities: [
      { op: 'break', cost: 2, iceType: 'barrier', count: 2 },
      { op: 'strength', cost: 1, amount: 1, until: 'run' },
    ],
  },
  // ---- Sprint 9: link. Numbers and wording checked against netrunner-cards-json (DECISIONS 2026-11-16). ----
  {
    id: 'r18',
    name: 'Access to Globalsec',
    side: 'runner',
    type: 'resource',
    faction: 'neutral',
    cost: 1,
    link: 1,
    text: '+1 link.',
    art: 'glyph:relay-mast',
  },
  // ---- Sprint 12: Shaper + neutral. Numbers and 2012 wording checked against netrunner-cards-json pack/core.json (DECISIONS 2026-11-18). ----
  {
    id: 'r19',
    name: 'The Toolbox',
    side: 'runner',
    type: 'hardware',
    faction: 'shaper',
    influence: 2,
    code: '01041',
    unique: true,
    cost: 9,
    text: '+2 memory. +2 link.\n2 recurring credits.\nUse these credits to pay for using icebreakers.',
    art: 'glyph:toolbox',
    memoryBonus: 2,
    link: 2,
    recurringCredits: { amount: 2, for: 'icebreaker' },
  },
  {
    id: 'r20',
    name: 'Modded',
    side: 'runner',
    type: 'event',
    faction: 'shaper',
    influence: 2,
    code: '01035',
    cost: 0,
    text: 'Install a program or piece of hardware, lowering the install cost by 3.',
    art: 'glyph:solder-iron',
    // Sprint 12: the Grip card travels in `play.installIndex`; dimmed with no program or hardware in the Grip.
    playIf: 'has_install_target',
    onPlay: [{ op: 'install_from_hand', types: ['program', 'hardware'], discount: 3 }],
  },
  {
    id: 'r21',
    name: 'Infiltration',
    side: 'runner',
    type: 'event',
    faction: 'neutral',
    influence: 0,
    code: '01049',
    cost: 0,
    text: 'Gain 2 credits or expose 1 card.',
    art: 'glyph:peek-eye',
    // Sprint 12: `play.mode` picks one; "expose" names a face-down installed Corp card in `play.uid`.
    modes: [
      { label: 'Gain 2 credits', effects: [{ op: 'gain_credits', amount: 2 }] },
      { label: 'Expose 1 card', effects: [{ op: 'expose' }] },
    ],
  },
];

/** 15-card starter deck: one of each, plus an extra Easy Mark, Armitage Codebusting and Diesel. */
export const RUNNER_STARTER_DECK: DeckList = [
  // The 12 Sprint 2 cards, one each (frozen: Sprint 8 cards are not in it).
  ...['r01', 'r02', 'r03', 'r04', 'r05', 'r06', 'r07', 'r08', 'r09', 'r10', 'r11', 'r12'],
  'r01',
  'r02',
  'r03',
];

/**
 * The 30-card Kate core deck (proposal S-08 table; Sprint 9: −1 Easy Mark −1 Inside Job +2 Access to
 * Globalsec). Influence 10 of 15.
 */
export const RUNNER_CORE_DECK: DeckDef = {
  identity: 'r13',
  cards: [
    ...['r14', 'r14', 'r14'], // Sure Gamble
    'r01', // Easy Mark
    ...['r03', 'r03', 'r03'], // Diesel
    ...['r02', 'r02'], // Armitage Codebusting
    'r10', // Bank Job
    ...['r15', 'r15'], // Magnum Opus
    ...['r07', 'r07', 'r07'], // The Maker's Eye
    'r11', // Inside Job
    'r04', // Corroder
    ...['r05', 'r05'], // Gordian Blade
    ...['r16', 'r16'], // Pipeline
    ...['r17', 'r17'], // Battering Ram
    ...['r09', 'r09'], // Akamatsu Mem Chip
    ...['r08', 'r08'], // Cyberfeeder
    'r12', // Sacrificial Construct
    ...['r18', 'r18'], // Access to Globalsec
  ],
};
