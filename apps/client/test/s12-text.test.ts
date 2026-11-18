// Sprint 12 (U2-U4): words for the look at R&D, the Archives pick and expose; the sheet grid.
import type { CardOption, ChoiceView, GameEvent } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { archivesHelpText, archivesTitle, lookDoneLabel, lookHelpText, lookInstallable, lookNotIceText, modeLabel, s12Notice } from '../src/choiceText';
import { choiceHint } from '../src/hints';
import { gridSlots } from '../src/sheetMath';

const sel = (card: number, server: 'rd' | 'new'): CardOption => ({ action: { type: 'select', player: 'corp', card, server }, cost: 0, reject: null });
const pass: CardOption = { action: { type: 'pass', player: 'corp' }, cost: 0, reject: null };
const look = (looked: (string | null)[], options: CardOption[]): ChoiceView => ({ kind: 'look_install', waitingOn: 'corp', cardId: 'c23', looked, options });

describe('Accelerated Beta Test look (S-12-1)', () => {
  it('Done says "Trash the rest (N)" while an ICE can go in, else "Trash N cards"', () => {
    expect(lookDoneLabel(look(['c01', 'c02', 'c03'], [sel(1, 'rd'), sel(1, 'new'), pass]))).toBe('Trash the rest (3)');
    expect(lookDoneLabel(look(['c02', 'c03', 'c04'], [pass]))).toBe('Trash 3 cards');
    expect(lookDoneLabel(look(['c02'], [pass]))).toBe('Trash 1 card');
    expect([...lookInstallable(look(['a', 'b', 'c'], [sel(0, 'rd'), sel(2, 'rd'), sel(2, 'new'), pass]))]).toEqual([0, 2]);
  });

  it('help: the Corp is told what to tap; the Runner only how many cards', () => {
    const c = look(['c01', 'c02', 'c03'], [sel(0, 'rd'), pass]);
    expect(lookHelpText(c, true, false)).toBe('Accelerated Beta Test: install any ICE here free.\nTap an ICE, then a server.');
    expect(lookHelpText(c, true, true)).toContain('Tap a lit server');
    expect(lookHelpText(look(['c02', 'c03', 'c04'], [pass]), true, false)).toBe('Accelerated Beta Test: no ICE to install.\nTap Trash 3 cards.');
    expect(lookHelpText(look([null, null, null], []), false, false)).toBe('Corp looks at the top 3 cards of R&D (Accelerated Beta Test)…');
    expect(choiceHint(c)).toContain('Install an ICE');
  });

  it('events: looked / trashed counts, never names for the Runner', () => {
    const looked: GameEvent = { type: 'cards_looked_at', count: 3 };
    expect(s12Notice(looked, 'corp')).toBe('You look at the top 3 cards of R&D');
    expect(s12Notice(looked, 'runner')).toBe('Corp looks at the top 3 cards of R&D');
    expect(s12Notice({ type: 'cards_looked_at', count: 1 }, 'runner')).toBe('Corp looks at the top card of R&D');
    expect(s12Notice({ type: 'rd_cards_trashed', count: 2 }, 'runner')).toBe('2 cards to Archives, face down');
    expect(lookNotIceText('c02')).toMatch(/isn't ICE: it goes to Archives$/);
  });
});

describe('Archived Memories (S-12-2) and Infiltration (S-12-4)', () => {
  it('Archives pick words', () => {
    const c: ChoiceView = { kind: 'archives_pick', waitingOn: 'corp', cardId: 'c24', options: [] };
    expect(archivesTitle(c)).toBe('Archived Memories: pick a card for HQ');
    expect(archivesHelpText(c, true)).toContain('tap a card to add it to HQ');
    expect(archivesHelpText(c, false)).toBe('Corp is picking a card from Archives (Archived Memories)…');
    expect(choiceHint(c)).toBe('Pick a card from Archives first');
  });

  it('a card back in HQ: named to the Runner only when it was face up', () => {
    expect(s12Notice({ type: 'card_returned_to_hand', player: 'corp', archivesIndex: 0, faceUp: false }, 'runner')).toBe('Corp takes a face-down card from Archives to HQ');
    expect(s12Notice({ type: 'card_returned_to_hand', player: 'corp', archivesIndex: 0, faceUp: true, cardId: 'c24' }, 'runner')).toBe('Corp takes Archived Memories from Archives to HQ');
    expect(s12Notice({ type: 'card_returned_to_hand', player: 'corp', archivesIndex: 0, faceUp: false, cardId: 'c24' }, 'corp')).toBe('Archived Memories back to HQ');
  });

  it('expose and modes come from card data', () => {
    expect(s12Notice({ type: 'card_exposed', uid: 'i1', cardId: 'c24', server: 'remote1' }, 'corp')).toBe('Exposed: Archived Memories (it stays face down)');
    expect(modeLabel('r21', 0)).toBe('Gain 2 credits');
    expect(modeLabel('r21', 1)).toBe('Expose 1 card');
    expect(modeLabel('c24', 0)).toBeNull();
  });
});

describe('gridSlots', () => {
  const area = { x: 0, y: 0, width: 400, height: 200 };
  it('fits all cards when it can, centred, never overlapping, never below the minimum', () => {
    const s = gridSlots(area, 6, 1.4, 80, 44, 8);
    expect(s.pages).toBe(1);
    expect(s.boxes).toHaveLength(6);
    for (const b of s.boxes) {
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height).toBeLessThanOrEqual(200);
    }
  });
  it('pages when there are too many', () => {
    const s = gridSlots(area, 40, 1.4, 80, 44, 8, 1);
    expect(s.pages).toBeGreaterThan(1);
    expect(s.boxes.length).toBeLessThanOrEqual(s.perPage);
    expect(s.boxes[0]!.width).toBeGreaterThanOrEqual(44);
  });
});
