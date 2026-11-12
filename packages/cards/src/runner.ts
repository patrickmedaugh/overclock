import type { CardDef, DeckList } from './types';

// Real cards from the original core set (2012), official names and text, with
// symbols spelled as words (owner decision 2026-11-12, CLAUDE.md rule 3; source
// and any uncertain text: docs/DECISIONS.md). Art keys are our own glyphs.
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
      'Place 12 credits from the bank on Armitage Codebusting when it is installed. ' +
      'When there are no credits left on Armitage Codebusting, trash it. ' +
      'Click: Take 2 credits from Armitage Codebusting.',
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
    text: '1 credit: Break barrier subroutine. 1 credit: +1 strength.',
    art: 'glyph:teeth',
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
    text: '1 credit: Break code gate subroutine. 1 credit: +1 strength for the remainder of this run.',
    art: 'glyph:keyhole',
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
    text: '1 credit: Break sentry subroutine. 3 credits: +5 strength.',
    art: 'glyph:muzzle',
  },
  {
    id: 'r07',
    name: "The Maker's Eye",
    side: 'runner',
    type: 'event',
    cost: 2,
    text: 'Make a run on R&D. If successful, access 2 additional cards from R&D.',
    art: 'glyph:pin',
    needs: 'runs',
  },
  {
    id: 'r08',
    name: 'Cyberfeeder',
    side: 'runner',
    type: 'hardware',
    cost: 2,
    text: '1 recurring credit. Use this credit to pay for using icebreakers or for installing virus programs.',
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
    name: 'Wyldside',
    side: 'runner',
    type: 'resource',
    cost: 3,
    text: 'When your turn begins, draw 2 cards and lose 1 click.',
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
    needs: 'runs',
  },
  {
    id: 'r12',
    name: 'Magnum Opus',
    side: 'runner',
    type: 'program',
    cost: 5,
    memory: 2,
    text: 'Click: Gain 2 credits.',
    art: 'glyph:mask',
  },
];

/**
 * 15-card starter deck: one of each, plus a second Easy Mark, Diesel and
 * Magnum Opus (the second 2-memory program makes "memory full" reachable).
 */
export const RUNNER_STARTER_DECK: DeckList = [
  ...RUNNER_CARDS.map((c) => c.id),
  'r01',
  'r03',
  'r12',
];
