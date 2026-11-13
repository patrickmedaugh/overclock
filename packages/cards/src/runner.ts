import type { CardDef, DeckList } from './types';

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
    cost: 1,
    text:
      'Place 12 credits from the bank on Armitage Codebusting when it is installed. When there are no credits left on Armitage Codebusting, trash it.\nClick: Take 2 credits from Armitage Codebusting.',
    art: 'glyph:handshake',
  },
  {
    id: 'r03',
    name: 'Diesel',
    side: 'runner',
    type: 'event',
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
    cost: 2,
    text: '1 recurring credit.\nUse this credit to pay for using icebreakers or for installing virus programs.',
    art: 'glyph:lung',
  },
  {
    id: 'r09',
    name: 'Akamatsu Mem Chip',
    side: 'runner',
    type: 'hardware',
    cost: 1,
    text: '+1 memory.',
    art: 'glyph:halo',
  },
  {
    id: 'r10',
    name: 'Bank Job',
    side: 'runner',
    type: 'resource',
    cost: 1,
    text:
      'Place 8 credits from the bank on Bank Job when it is installed. When there are no credits left on Bank Job, trash it.\nWhenever you make a successful run on a remote server, instead of accessing cards you may take any number of credits from Bank Job.',
    art: 'glyph:cross',
  },
  {
    id: 'r11',
    name: 'Inside Job',
    side: 'runner',
    type: 'event',
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
    cost: 0,
    text: 'Trash: Prevent an installed program or an installed piece of hardware from being trashed.',
    art: 'glyph:mask',
  },
];

/** 15-card starter deck: one of each, plus an extra Easy Mark, Armitage Codebusting and Diesel. */
export const RUNNER_STARTER_DECK: DeckList = [
  ...RUNNER_CARDS.map((c) => c.id),
  'r01',
  'r02',
  'r03',
];
