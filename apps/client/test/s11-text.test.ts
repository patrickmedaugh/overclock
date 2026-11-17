// Sprint 11 (S-11-1 / S-11-2): run buttons name their card and the ICE type; "up to N"
// only when the engine offers a pick of N >= 2; the shortening ladder (owner Q1 A).
import type { CardOption, RunView } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { labelLadder, optionLabel, partsLabel, runOptionParts } from '../src/runText';
import { minButtonPx } from '../src/runDisplay';
import { ICE_TYPE } from '../src/terms';

const opt = (action: CardOption['action'], cost = 0, reject: CardOption['reject'] = null): CardOption => ({ action, cost, reject });
const ram = (subs: number[], reject: CardOption['reject'] = null) => opt({ type: 'use_ability', player: 'runner', uid: 'ram', ability: 0, subs }, 2, reject);
const ramPump = opt({ type: 'use_ability', player: 'runner', uid: 'ram', ability: 1 }, 1);
const gordian = (sub: number) => opt({ type: 'use_ability', player: 'runner', uid: 'gb', ability: 0, sub }, 1);
const gordianPump = opt({ type: 'use_ability', player: 'runner', uid: 'gb', ability: 1 }, 1);
const pass = opt({ type: 'pass', player: 'runner' });
const rig = { ram: 'r17', gb: 'r05', cf: 'r08', bj: 'r10' };

function run(ice: string, subs: string[], options: CardOption[], broken: boolean[] = []): RunView {
  return {
    server: 'remote1',
    position: 0,
    step: 'encounter',
    waitingOn: 'runner',
    iceUid: 'i1',
    ice: { cardId: ice, strength: 1, subroutines: subs.map((text, i) => ({ text, broken: broken[i] ?? false })) },
    breakerStrength: {},
    access: null,
    extraAccess: 0,
    bypassPending: false,
    options,
    tempCredits: 0,
    letFire: null,
    breakAll: [],
  };
}
const labels = (r: RunView) => r.options.map((o) => optionLabel(o, r, r.options, rig));

describe('S-11-1 break buttons name their card and the ICE type', () => {
  it('Ice Wall with Battering Ram: the break and the strength buttons both name Battering Ram; the break says barrier', () => {
    const r = run('c05', ['End the run'], [ram([0]), ramPump, pass]);
    expect(labels(r)).toEqual(['Battering Ram: break barrier sub · 2 credits', 'Battering Ram: +1 str · 1 credit', 'Let it through']);
    expect(runOptionParts(r.options[0]!, r, r.options, rig)).toMatchObject({ who: 'Battering Ram', source: 'r17', price: '2 credits' });
  });

  it('Battering Ram and Gordian Blade both installed: each button alone says which card it is', () => {
    // Enigma (code gate, 2 subroutines): Gordian Blade can break either, so its subroutine text shows.
    const r = run('c06', ['The Runner loses 1 click, if able', 'End the run'], [gordian(0), gordian(1), gordianPump, ramPump, pass]);
    expect(labels(r)).toEqual([
      'Gordian Blade: break code gate sub "The Runner loses 1 click, if able" · 1 credit',
      'Gordian Blade: break code gate sub "End the run" · 1 credit',
      'Gordian Blade: +1 str · 1 credit',
      'Battering Ram: +1 str · 1 credit',
      'Let it through',
    ]);
  });

  it('a subroutine text shows only when that ability has more than one open subroutine', () => {
    const r = run('c06', ['The Runner loses 1 click, if able', 'End the run'], [gordian(1), pass], [true, false]);
    expect(labels(r)[0]).toBe('Gordian Blade: break code gate sub · 1 credit');
  });

  it('Heimdall 1.0 (3 barrier subroutines): "break up to 2"; with one open: no "up to"', () => {
    const three = run('c18', ['Do 2 brain damage', 'End the run', 'End the run'], [ram([0]), ram([1]), ram([2]), ram([0, 1]), ram([0, 2]), ram([1, 2]), ramPump, pass]);
    expect(labels(three)[0]).toBe('Battering Ram: break up to 2 barrier subs · 2 credits');
    const one = run('c18', ['Do 2 brain damage', 'End the run', 'End the run'], [ram([2]), ramPump, pass], [true, true, false]);
    expect(labels(one)[0]).toBe('Battering Ram: break barrier sub · 2 credits');
    // Two picks of one subroutine each (never offered today): still no "up to".
    const singles = run('c18', ['A', 'B', 'C'], [ram([0]), ram([1]), pass]);
    expect(labels(singles)[0]).toBe('Battering Ram: break barrier sub · 2 credits');
  });

  it('other card buttons in a run name their card: Bank Job, Cyberfeeder paying', () => {
    const take = (n: number): CardOption => ({ ...opt({ type: 'activate', player: 'runner', uid: 'bj', ability: 0, amount: n }), gain: n });
    const success: RunView = { ...run('c05', [], [take(1), take(2), pass]), step: 'success', ice: null, iceUid: null };
    expect(labels(success)).toEqual(['Bank Job: take credits', 'Bank Job: take credits', 'Access cards']);
    const paid: CardOption = { ...gordian(0), hostedPay: [{ uid: 'cf', amount: 1 }] };
    const r = run('c06', ['X'], [paid, pass]);
    expect(labels(r)[0]).toBe('Gordian Blade: break code gate sub · Cyberfeeder pays');
  });

  it('ICE type words', () => {
    expect(ICE_TYPE).toEqual({ barrier: 'barrier', code_gate: 'code gate', sentry: 'sentry' });
  });
});

describe('S-11-1 shortening ladder: subroutine text first, then the card name; never the price', () => {
  const parts = { who: 'Gordian Blade', source: 'r05', what: 'break code gate sub', sub: 'End the run', price: '1 credit' };

  it('starts with the full label and only gets shorter', () => {
    const l = labelLadder(parts);
    expect(l[0]).toBe('Gordian Blade: break code gate sub "End the run" · 1 credit');
    expect(l).toContain('Gordian Blade: break code gate sub "End the r…" · 1 credit');
    for (let i = 1; i < l.length; i++) expect(l[i]!.length).toBeLessThan(l[i - 1]!.length);
    // Every rung keeps the price and the action words.
    for (const x of l) {
      expect(x.endsWith(' · 1 credit')).toBe(true);
      expect(x).toContain(': break code gate sub');
    }
    // The name is cut only after the subroutine text is as short as it gets.
    const firstNameCut = l.findIndex((x) => !x.startsWith('Gordian Blade:'));
    expect(l[firstNameCut]).toBe('Gordian Bla…: break code gate sub "End…" · 1 credit');
    expect(l.at(-1)).toBe('Gord…: break code gate sub "End…" · 1 credit');
  });

  it('a label without a card or subroutine has one rung', () => {
    expect(labelLadder({ who: null, source: null, what: "Don't rez", price: '' })).toEqual(["Don't rez"]);
    expect(partsLabel({ who: 'Battering Ram', source: 'r17', what: '+1 str', price: '1 credit' }, Infinity, 9)).toBe('Battering…: +1 str · 1 credit');
  });

  it('the text floor before shortening: 14 px on a phone and a computer, 11.5 on the small phones', () => {
    expect(minButtonPx(1)).toBe(14);
    expect(minButtonPx(0.9)).toBe(11.5);
    expect(minButtonPx(0.8)).toBe(11.5);
    expect(minButtonPx(1.4)).toBe(14);
  });
});
