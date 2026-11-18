import type { CardOption, GameEvent, RunView } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { abilityLabel, iceReport, infoLines, installedOptionLabel, letFireLabel, optionLabel, payText, runEndText, runTitle, stepLabel, turnStartNotices } from '../src/runText';

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
  breakAll: [],
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

  it('breaker abilities: card name first, +N str and break <type> sub "subroutine", each with its price (S-11-1)', () => {
    const options = [
      opt({ type: 'use_ability', player: 'runner', uid: 'i5', ability: 0, sub: 1 }, 1, 'too_weak'),
      opt({ type: 'use_ability', player: 'runner', uid: 'i5', ability: 1 }, 1),
      opt({ type: 'pass', player: 'runner' }),
    ];
    const run = { ...base, options };
    // One open subroutine for Gordian Blade here: no subroutine text.
    expect(options.map((o) => optionLabel(o, run, options, rig))).toEqual(['Gordian Blade: break code gate sub · 1 credit', 'Gordian Blade: +1 str · 1 credit', 'Let it through']);
    expect(infoLines(run, rig)).toEqual(['Strength 2', 'Gordian Blade 2']);
    // Two breakers able to act: each label names its breaker.
    const two = [...options, opt({ type: 'use_ability', player: 'runner', uid: 'i6', ability: 1 }, 1)];
    expect(optionLabel(two[1]!, { ...run, options: two }, two, rig)).toBe('Gordian Blade: +1 str · 1 credit');
    expect(optionLabel(two[3]!, { ...run, options: two }, two, rig)).toBe('Corroder: +1 str · 1 credit');
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

describe('S-05-2 let it fire: the button says what will happen', () => {
  const lf = (outcomes: { sub: number; op: 'lose_clicks' | 'net_damage' | 'end_run' | 'gain_credits' | 'draw'; amount: number }[], ends: 'run' | 'game' | null) => ({ iceCardId: 'c06', outcomes, ends });

  it('Enigma with clicks: lose 1 click, run ends', () => {
    expect(letFireLabel(lf([{ sub: 0, op: 'lose_clicks', amount: 1 }, { sub: 1, op: 'end_run', amount: 0 }], 'run'))).toBe('Let it fire: lose 1 click, run ends');
  });

  it('a 0-size outcome is skipped (Enigma with no clicks left)', () => {
    expect(letFireLabel(lf([{ sub: 0, op: 'lose_clicks', amount: 0 }, { sub: 1, op: 'end_run', amount: 0 }], 'run'))).toBe('Let it fire: run ends');
  });

  it('Neural Katana: take 3 damage, and when it is fatal, you flatline (Corp wins)', () => {
    expect(letFireLabel(lf([{ sub: 0, op: 'net_damage', amount: 3 }], null))).toBe('Let it fire: take 3 damage');
    expect(letFireLabel(lf([{ sub: 0, op: 'net_damage', amount: 3 }], 'game'))).toBe('Let it fire: take 3 damage, you flatline (Corp wins)');
  });

  it('everything broken: Continue; no preview: the old label', () => {
    expect(letFireLabel(lf([], null))).toBe('Continue');
    expect(letFireLabel(null)).toBeNull();
    const allBroken = { ...base.ice!, subroutines: base.ice!.subroutines.map((x) => ({ ...x, broken: true })) };
    const run: RunView = { ...base, ice: allBroken, letFire: lf([], null) };
    expect(optionLabel(opt({ type: 'pass', player: 'runner' }), run, [], rig)).toBe('Continue');
    const enigma: RunView = { ...base, letFire: lf([{ sub: 1, op: 'end_run', amount: 0 }], 'run') };
    expect(optionLabel(opt({ type: 'pass', player: 'runner' }), enigma, [], rig)).toBe('Let it fire: run ends');
  });

  it('nothing left to say: nothing happens', () => {
    expect(letFireLabel(lf([{ sub: 0, op: 'lose_clicks', amount: 0 }], null))).toBe('Let it fire: nothing happens');
  });
});

describe('S-05-2 ICE report: what the ICE did', () => {
  const res = (cardId: string, sub: number, op: 'lose_clicks' | 'net_damage' | 'end_run', amount: number): GameEvent => ({ type: 'subroutine_resolved', iceUid: 'u1', cardId, outcome: { sub, op, amount } });
  const fired = (sub: number): GameEvent => ({ type: 'subroutine_fired', iceUid: 'u1', sub }) as GameEvent;

  it('Enigma: lost a click, then ended the run', () => {
    const batch: GameEvent[] = [
      fired(0),
      { type: 'clicks_lost', player: 'runner', amount: 1 } as GameEvent,
      res('c06', 0, 'lose_clicks', 1),
      fired(1),
      res('c06', 1, 'end_run', 0),
      { type: 'run_ended', server: 'hq', outcome: 'ended_by_ice' },
    ];
    expect(iceReport(batch)).toBe('Enigma: you lost 1 click. Enigma ended your run.');
  });

  it('Enigma with no clicks: only the end of the run', () => {
    expect(iceReport([res('c06', 0, 'lose_clicks', 0), res('c06', 1, 'end_run', 0), { type: 'run_ended', server: 'hq', outcome: 'ended_by_ice' }])).toBe('Enigma ended your run.');
  });

  it('Neural Katana: damage, the run goes on; or a flatline', () => {
    expect(iceReport([res('c07', 0, 'net_damage', 3)])).toBe('Neural Katana: you took 3 damage.');
    expect(iceReport([res('c07', 0, 'net_damage', 3), { type: 'run_ended', server: 'rd', outcome: 'flatline' }])).toBe('Neural Katana: you took 3 damage. You flatlined: the Corp wins.');
  });

  it('Ice Wall ends the run; no subroutine: no report', () => {
    expect(iceReport([res('c05', 0, 'end_run', 0), { type: 'run_ended', server: 'rd', outcome: 'ended_by_ice' }])).toBe('Ice Wall ended your run.');
    expect(iceReport([{ type: 'run_ended', server: 'rd', outcome: 'jacked_out' }])).toBeNull();
    expect(iceReport([res('c06', 0, 'lose_clicks', 0)])).toBe('Enigma: nothing happened.');
  });
});

// ---- Sprint 7 (U4 / U5) ----

describe('S-07-2/3/5 buttons of a picked card on the table', () => {
  it('Rez, Advance and Score with the engine price; a card ability from card data with {gain} and its click', () => {
    expect(installedOptionLabel(opt({ type: 'rez', player: 'corp', uid: 'a' }, 2), 'c03')).toBe('Rez · 2 credits');
    expect(installedOptionLabel(opt({ type: 'rez', player: 'corp', uid: 'a' }, 1), 'c11')).toBe('Rez · 1 credit');
    expect(installedOptionLabel(opt({ type: 'advance', player: 'corp', uid: 'a' }, 1), null)).toBe('Advance · 1 credit');
    expect(installedOptionLabel(opt({ type: 'score', player: 'corp', uid: 'a' }), null)).toBe('Score');
    const take: CardOption = { ...opt({ type: 'activate', player: 'runner', uid: 'r', ability: 0 }), clicks: 1, gain: 2 };
    expect(installedOptionLabel(take, 'r02')).toBe('Take 2 credits · 1 click');
    // Sprint 10 (S-10-3): Bank Job names no amount on its button; the amount control picks it.
    expect(abilityLabel('r10', 0, 8)).toBe('Take credits');
  });
});

describe('S-07-4 run panel: Bank Job and Cyberfeeder', () => {
  it('step success: "Take credits" (Sprint 10: one option per amount) or "Access cards"', () => {
    const take = (n: number): CardOption => ({ ...opt({ type: 'activate', player: 'runner', uid: 'b1', ability: 0, amount: n }), gain: n });
    const options: CardOption[] = [take(1), take(2), opt({ type: 'pass', player: 'runner' })];
    const run: RunView = { ...base, step: 'success', iceUid: null, ice: null, options };
    expect(options.map((o) => optionLabel(o, run, options, { b1: 'r10' }))).toEqual(['Bank Job: take credits', 'Bank Job: take credits', 'Access cards']);
    expect(stepLabel(run, 'runner')).toBe('Got into Server 1');
  });

  it('a breaker paid by Cyberfeeder says so; partly paid shows both', () => {
    const r = { i5: 'r04', cf: 'r08' };
    const full: CardOption = { ...opt({ type: 'use_ability', player: 'runner', uid: 'i5', ability: 0, sub: 0 }, 1), hostedPay: [{ uid: 'cf', amount: 1 }] };
    expect(payText(full, r)).toBe('Cyberfeeder pays');
    const part: CardOption = { ...full, cost: 2 };
    expect(payText(part, r)).toBe('2 credits · Cyberfeeder pays 1');
    expect(payText(opt({ type: 'use_ability', player: 'runner', uid: 'i5', ability: 0 }, 1), r)).toBe('1 credit');
    const options = [full];
    expect(optionLabel(full, { ...base, ice: { cardId: 'c05', strength: 1, subroutines: [{ text: 'End the run', broken: false }] }, options }, options, r)).toBe('Corroder: break barrier sub · Cyberfeeder pays');
  });

  it('Bank Job taken: the end notice says what it gave and that nothing was accessed', () => {
    const batch: GameEvent[] = [
      { type: 'ability_triggered', uid: 'b1', cardId: 'r10', trigger: 'successful_run' },
      { type: 'hosted_credits_changed', uid: 'b1', credits: 0 },
      { type: 'credit_gained', player: 'runner', amount: 8 },
      { type: 'rig_card_trashed', uid: 'b1', cardId: 'r10' },
      { type: 'run_ended', server: 'remote1', outcome: 'access_replaced' },
    ];
    expect(runEndText(batch.at(-1) as Extract<GameEvent, { type: 'run_ended' }>, batch)).toBe('Bank Job: +8 credits, nothing accessed');
  });
});

describe('S-07-2 turn-start notices', () => {
  it('"PAD Campaign: +1 credit"; a refill (no credits gained) says nothing', () => {
    const batch: GameEvent[] = [
      { type: 'turn_started', player: 'corp', turn: 3 } as GameEvent,
      { type: 'ability_triggered', uid: 'p1', cardId: 'c03', trigger: 'turn_start' },
      { type: 'credit_gained', player: 'corp', amount: 1 },
      { type: 'ability_triggered', uid: 'cf', cardId: 'r08', trigger: 'turn_start' },
      { type: 'hosted_credits_changed', uid: 'cf', credits: 1 },
    ];
    expect(turnStartNotices(batch)).toEqual(['PAD Campaign: +1 credit']);
    expect(turnStartNotices([])).toEqual([]);
  });
});
