// Sprint 8 client words (U2-U5): identity notes, Adonis notes, brain damage and
// Rototurret texts, the in-run choice labels. Pure functions over engine events/views.
import type { CardOption, ChoiceView, GameEvent } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { choiceHint } from '../src/hints';
import { choiceOptionLabel, choiceStepLabel, iceReport, installNotices, isRunChoice, letFireLabel, outcomeText, shortName, turnStartNotices } from '../src/runText';
import { handMaxText } from '../src/terms';

const opt = (action: CardOption['action'], cost = 0, reject: CardOption['reject'] = null): CardOption => ({ action, cost, reject });

describe('S-08-1 identity notes', () => {
  it('an identity is named by its own title', () => {
    expect(shortName('c13')).toBe('Engineering the Future');
    expect(shortName('r13')).toBe('Digital Tinker');
    expect(shortName('c14')).toBe('Adonis Campaign');
  });

  it('Haas-Bioroid: "+1 credit" after the first install; Kate: "1 credit off"', () => {
    const hb: GameEvent[] = [
      { type: 'card_installed', player: 'corp', uid: 'u1', zone: 'content', server: 'remote1' },
      { type: 'ability_triggered', uid: 'id:corp', cardId: 'c13', trigger: 'install' },
      { type: 'credit_gained', player: 'corp', amount: 1 },
    ];
    expect(installNotices(hb)).toEqual(['Engineering the Future: +1 credit']);
    const kate: GameEvent[] = [{ type: 'ability_triggered', uid: 'id:runner', cardId: 'r13', trigger: 'install_discount' }];
    expect(installNotices(kate)).toEqual(['Digital Tinker: 1 credit off']);
    expect(installNotices([{ type: 'credit_gained', player: 'corp', amount: 1 }])).toEqual([]);
  });
});

describe('S-08-2 Adonis Campaign at the turn start', () => {
  it('"+3 credits" past its own credits going down; empty: "to Archives"', () => {
    const batch: GameEvent[] = [
      { type: 'ability_triggered', uid: 'a1', cardId: 'c14', trigger: 'turn_start' },
      { type: 'hosted_credits_changed', uid: 'a1', cardId: 'c14', credits: 0 } as GameEvent,
      { type: 'credit_gained', player: 'corp', amount: 3 },
      { type: 'corp_card_trashed', uid: 'a1', cardId: 'c14', server: 'remote1' },
    ];
    expect(turnStartNotices(batch)).toEqual(['Adonis Campaign: +3 credits', 'Adonis Campaign: empty, to Archives']);
  });
});

describe('S-08-3 brain damage words', () => {
  it('ICE texts and the hand max note', () => {
    expect(outcomeText({ sub: 0, op: 'brain_damage', amount: 1 }, 'will')).toBe('take 1 brain damage');
    expect(outcomeText({ sub: 0, op: 'brain_damage', amount: 1 }, 'did')).toBe('you took 1 brain damage');
    expect(handMaxText(4)).toBe('Hand max 4');
    expect(letFireLabel({ iceCardId: 'c17', outcomes: [{ sub: 0, op: 'brain_damage', amount: 1 }, { sub: 1, op: 'end_run', amount: 0 }], ends: 'run' })).toBe('Let it fire: take 1 brain damage, run ends');
  });
});

describe('S-08-7 Rototurret', () => {
  const subs = [
    { text: 'Trash 1 program', broken: false },
    { text: 'End the run', broken: false },
  ];

  it('let it fire stops at the choice: the button says the waiting subroutine', () => {
    expect(letFireLabel({ iceCardId: 'c19', outcomes: [], ends: null }, subs)).toBe('Let it fire: trash 1 program…');
    // Exactly one program: the engine previews it in full.
    expect(letFireLabel({ iceCardId: 'c19', outcomes: [{ sub: 0, op: 'trash_installed', amount: 1 }, { sub: 1, op: 'end_run', amount: 0 }], ends: 'run' }, subs)).toBe('Let it fire: a program is trashed, run ends');
    // Everything broken: Continue (as before).
    expect(letFireLabel({ iceCardId: 'c19', outcomes: [], ends: null }, subs.map((x) => ({ ...x, broken: true })))).toBe('Continue');
  });

  it('the report says a program was trashed', () => {
    const batch: GameEvent[] = [{ type: 'subroutine_resolved', iceUid: 'i1', cardId: 'c19', outcome: { sub: 0, op: 'trash_installed', amount: 1 } }];
    expect(iceReport(batch)).toBe('Rototurret: a program was trashed.');
  });

  it('choice panels: the Corp picks; the Runner may trash Sacrificial Construct instead', () => {
    const rig = { p1: 'r04', p2: 'r17', sc: 'r12' };
    const pick: ChoiceView = { kind: 'trash_target', waitingOn: 'corp', cardId: 'c19', options: [opt({ type: 'choose', player: 'corp', uid: 'p1' }), opt({ type: 'choose', player: 'corp', uid: 'p2' })] };
    expect(isRunChoice(pick)).toBe(true);
    expect(choiceStepLabel(pick, rig, true)).toBe('Rototurret: pick a program to trash');
    expect(choiceStepLabel(pick, rig, false)).toBe('Corp is choosing…');
    expect(pick.options.map((o) => choiceOptionLabel(o, pick, rig))).toEqual(['Trash Corroder', 'Trash Battering Ram']);
    const save: ChoiceView = { kind: 'prevent_trash', waitingOn: 'runner', cardId: 'c19', target: 'p1', options: [opt({ type: 'choose', player: 'runner', uid: 'sc' }), opt({ type: 'pass', player: 'runner' })] };
    expect(choiceStepLabel(save, rig, true)).toBe('Rototurret: trash Corroder?');
    expect(save.options.map((o) => choiceOptionLabel(o, save, rig))).toEqual(['Trash Sacrificial Construct instead', 'Let it be trashed']);
    expect(choiceHint(save)).toBe('Tap one of the lit buttons first');
    const freeRez: ChoiceView = { kind: 'free_rez', waitingOn: 'corp', cardId: 'c02', options: [] };
    expect(isRunChoice(freeRez)).toBe(false);
    expect(choiceHint(freeRez)).toBe('Rez one ICE for free, or tap Skip');
  });
});

