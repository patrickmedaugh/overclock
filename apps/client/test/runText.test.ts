import type { CardOption, RunView } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { infoLines, optionLabel, runEndText, runTitle, stepLabel } from '../src/runText';

const base: RunView = {
  server: 'remote1',
  position: 0,
  step: 'encounter',
  waitingOn: 'runner',
  iceUid: 'i1',
  ice: { cardId: 'c06', strength: 2, subroutines: [{ text: 'The Runner loses 1 click, if able', broken: false }, { text: 'End the run', broken: false }] },
  breakerStrength: { i5: 2 },
  access: null,
  extraAccess: 0,
  bypassPending: false,
  options: [],
  tempCredits: 0,
  letFire: null,
};
const opt = (action: CardOption['action'], cost = 0, reject: CardOption['reject'] = null): CardOption => ({ action, cost, reject });
const rig = { i5: 'r05', i6: 'r04' };

describe('run panel labels', () => {
  it('rez names the ICE and its price; pass reads per step', () => {
    const run: RunView = { ...base, step: 'approach', waitingOn: 'corp' };
    const options = [opt({ type: 'rez', player: 'corp', uid: 'i1' }, 3), opt({ type: 'pass', player: 'corp' })];
    expect(options.map((o) => optionLabel(o, run, options, rig))).toEqual(['Rez Enigma · 3 credits', "Don't rez"]);
    expect(stepLabel(run, 'corp')).toBe('Corp: rez Enigma?');
    for (const [step, label] of [['encounter', 'Let it through'], ['continue', 'Continue']] as const) {
      expect(optionLabel(opt({ type: 'pass', player: 'runner' }), { ...base, step }, [], rig)).toBe(label);
    }
  });

  it('breaker abilities: +N strength and Break "subroutine", each with its price', () => {
    const options = [
      opt({ type: 'use_ability', player: 'runner', uid: 'i5', ability: 0, sub: 1 }, 1, 'too_weak'),
      opt({ type: 'use_ability', player: 'runner', uid: 'i5', ability: 1 }, 1),
      opt({ type: 'pass', player: 'runner' }),
    ];
    const run = { ...base, options };
    expect(options.map((o) => optionLabel(o, run, options, rig))).toEqual(['Break "End the run" · 1 credit', '+1 strength · 1 credit', 'Let it through']);
    expect(infoLines(run, rig)).toEqual(['Strength 2', 'Gordian Blade 2']);
    // Two breakers able to act: each label names its breaker.
    const two = [...options, opt({ type: 'use_ability', player: 'runner', uid: 'i6', ability: 1 }, 1)];
    expect(optionLabel(two[1]!, { ...run, options: two }, two, rig)).toBe('Gordian Blade: +1 strength · 1 credit');
  });

  it('no breaker for the ICE says so', () => {
    const options = [opt({ type: 'pass', player: 'runner' })];
    expect(infoLines({ ...base, options }, rig)).toContain('No breaker for this ICE');
  });

  it('continue says where the run goes next; jack out', () => {
    expect(infoLines({ ...base, step: 'continue', position: 0 }, rig)).toEqual(['Next: Server 1']);
    expect(infoLines({ ...base, step: 'continue', position: 2 }, rig)).toEqual(['Next: 2 more ICE']);
    expect(optionLabel(opt({ type: 'jack_out', player: 'runner' }), base, [], rig)).toBe('Jack out');
    expect(stepLabel({ ...base, step: 'continue', ice: { cardId: null, strength: null, subroutines: [] } }, 'runner')).toBe('Passed face-down ICE');
  });

  it('access: Steal / Trash · N / Leave it / Done; several cards are named', () => {
    const one: RunView = { ...base, step: 'access', position: -1, access: { cards: [{ cardId: 'c03', from: 'remote', stolen: false, uid: 'i2' }] } };
    const trashOpts = [opt({ type: 'trash', player: 'runner', card: 0 }, 4), opt({ type: 'pass', player: 'runner' })];
    expect(trashOpts.map((o) => optionLabel(o, one, trashOpts, rig))).toEqual(['Trash · 4 credits', 'Leave it']);
    expect(optionLabel(opt({ type: 'pass', player: 'runner' }), one, [opt({ type: 'pass', player: 'runner' })], rig)).toBe('Done');
    const archives: RunView = {
      ...one,
      server: 'archives',
      access: { cards: [{ cardId: 'c08', from: 'archives', stolen: false, uid: null }, { cardId: 'c09', from: 'archives', stolen: false, uid: null }] },
    };
    expect(optionLabel(opt({ type: 'steal', player: 'runner', card: 1 }), archives, [], rig)).toBe('Steal Private Security Force');
    expect(stepLabel(archives, 'runner')).toBe('Access: 2 cards');
    expect(runTitle(archives)).toBe('Run on Archives');
  });

  it("Inside Job and The Maker's Eye are mentioned while pending", () => {
    expect(infoLines({ ...base, step: 'approach', bypassPending: true, extraAccess: 2, ice: { cardId: null, strength: null, subroutines: [] } }, rig)).toEqual([
      'Inside Job: next ICE bypassed',
      '+2 R&D cards if you get in',
    ]);
  });
});

describe('runEndText (QA-S3-3)', () => {
  const ended = (outcome: 'accessed' | 'jacked_out' | 'ended_by_ice' | 'flatline', server: RunView['server'] = 'remote1') =>
    ({ type: 'run_ended', server, outcome }) as const;
  it('a run that got in and ended in the same action with nothing accessed says so', () => {
    const e = ended('accessed');
    expect(runEndText(e, [{ type: 'run_successful', server: 'remote1' }, e])).toBe('Nothing to access in Server 1');
    const a = ended('accessed', 'archives');
    expect(runEndText(a, [{ type: 'run_successful', server: 'archives' }, a])).toBe('Nothing to access in Archives');
  });
  it('a run that accessed cards ends quietly (the cards already showed)', () => {
    const e = ended('accessed', 'hq');
    expect(runEndText(e, [{ type: 'run_successful', server: 'hq' }, { type: 'card_accessed', from: 'hq', cardId: 'c01' }, e])).toBeNull();
    expect(runEndText(e, [e])).toBeNull();
  });
  it('jack out and ICE ending the run keep their notices', () => {
    expect(runEndText(ended('jacked_out'), [])).toBe('Jacked out');
    expect(runEndText(ended('ended_by_ice'), [])).toBe('Run ended');
    expect(runEndText(ended('flatline'), [])).toBeNull();
  });
});
