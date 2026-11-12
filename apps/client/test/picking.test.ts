// U4: what a tap on a hand card does, from the engine's options only, and
// the words on lit targets and hints (S-02-1..4).
import type { Action, CardOption, RejectReason } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { hintFor, pickOutcome, targetText } from '../src/picking';

const install = (server?: string): Action =>
  server === undefined
    ? { type: 'install', player: 'runner', handIndex: 0 }
    : { type: 'install', player: 'corp', handIndex: 0, server: server as 'hq' };
const opt = (action: Action, cost: number, reject: RejectReason | null): CardOption => ({ action, cost, reject });

describe('pickOutcome', () => {
  it('lights every offered spot, refused ones included (they show their price; a tap explains)', () => {
    const options = [opt(install('hq'), 0, null), opt(install('remote1'), 2, 'no_credits'), opt(install('new'), 0, null)];
    expect(pickOutcome(options)).toEqual({ kind: 'targets', options });
  });

  it('a program that does not fit memory still lights Install (S-02-3: the hint comes on tapping it)', () => {
    const options = [opt(install(), 2, 'no_memory')];
    expect(pickOutcome(options)).toEqual({ kind: 'targets', options });
    expect(hintFor('no_memory', null)).toBe('Not enough memory');
  });

  it('a card you cannot afford still lights its Play button with the price', () => {
    const options = [opt({ type: 'play', player: 'corp', handIndex: 2 }, 5, 'no_credits')];
    expect(pickOutcome(options).kind).toBe('targets');
    expect(hintFor('no_credits', null)).toBe('Not enough credits');
  });

  it.each(['no_clicks', 'not_implemented', 'wrong_phase', 'not_your_turn', 'game_over'] as const)(
    'when every option is refused with %s, the hint shows at once and nothing lights',
    (reason) => {
      const options = [opt(install('hq'), 0, reason), opt(install('new'), 0, reason)];
      expect(pickOutcome(options)).toEqual({ kind: 'hint', reason });
    },
  );

  it('cards that need runs say so (S-02-4)', () => {
    expect(pickOutcome([opt({ type: 'play', player: 'runner', handIndex: 1 }, 2, 'not_implemented')])).toEqual({
      kind: 'hint',
      reason: 'not_implemented',
    });
    expect(hintFor('not_implemented', null)).toBe('Needs runs (coming soon)');
  });

  it('no options: nothing to light', () => {
    expect(pickOutcome([])).toEqual({ kind: 'none' });
  });
});

describe('targetText', () => {
  it('servers show their name and price; New server; Install; Play', () => {
    expect(targetText(install('hq'), 0).label).toBe('HQ · free');
    expect(targetText(install('remote1'), 2).label).toBe('Server 1 · 2 credits');
    expect(targetText(install('new'), 0)).toEqual({ label: 'New server · free', chip: 'New server\nfree' });
    expect(targetText(install(), 3)).toEqual({ label: 'Install · 3 credits', chip: 'Install\n3 credits' });
    expect(targetText({ type: 'play', player: 'corp', handIndex: 0 }, 5).label).toBe('Play · 5 credits');
    expect(targetText({ type: 'play', player: 'runner', handIndex: 0 }, 0).label).toBe('Play · free');
    expect(targetText(install('rd'), 1).label).toBe('R&D · 1 credit');
  });
});
