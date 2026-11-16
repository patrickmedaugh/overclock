// Sprint 9 (U1-U4): the words and numbers of traces, tags, link and meat damage.
// Pure functions over engine views/events (stub views: every number comes from
// the view, so the client stays rules-free). Card names use ids that exist today
// (Hunter c20 / SEA Source c22 come with the engine's card data, E2).
import type { CardOption, ChoiceView, GameEvent, PlayerView, TraceView } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { CONDITION_TEXT, TRACE_HINT, choiceHint, conditionText, rejectText } from '../src/hints';
import { bidLayout } from '../src/layout';
import { coverFor } from '../src/passCover';
import { iceReport, letFireLabel, outcomeText } from '../src/runText';
import type { Decision, Presentation } from '../src/session';
import {
  autoBidText,
  basicOptionLabel,
  bidAmounts,
  bidButtonLabel,
  bidCaption,
  bidOption,
  bidWaitText,
  clampBid,
  clickCreditText,
  escapes,
  isTraceChoice,
  linkText,
  maxBid,
  meatDamageText,
  stepBid,
  tagsChangedText,
  taggedText,
  taggedTrashText,
  traceLines,
  traceNotices,
  traceResultText,
  traceStepLabel,
  type TraceChoice,
} from '../src/traceText';

const ICE = 'c19'; // Rototurret stands in for Hunter until its card data lands (E2).

function bids(player: 'corp' | 'runner', max: number): CardOption[] {
  return Array.from({ length: max + 1 }, (_, credits) => ({ action: { type: 'trace_bid', player, credits }, cost: credits, reject: null }) as CardOption);
}

function traceChoice(kind: 'trace_corp' | 'trace_runner', t: Partial<TraceView>, options: CardOption[]): TraceChoice {
  const trace: TraceView = { base: 3, strength: 3, corpBid: null, link: 1, runnerMaxBid: 5, corpMaxBid: 4, needed: 2, ...t };
  return { kind, waitingOn: kind === 'trace_corp' ? 'corp' : 'runner', cardId: ICE, trace, options } as TraceChoice;
}

describe('S-09-1 bid control (−/+, Max, Bid) works only on the offered bids', () => {
  const options = bids('corp', 4);
  it('offered amounts, Max, clamping and − / + steps', () => {
    expect(bidAmounts(options)).toEqual([0, 1, 2, 3, 4]);
    expect(maxBid(bidAmounts(options))).toBe(4);
    expect(maxBid([])).toBe(0);
    expect(clampBid([0, 1, 2], 7)).toBe(2);
    expect(clampBid([0, 1, 2], -1)).toBe(0);
    expect(stepBid([0, 1, 2], 0, -1)).toBe(0);
    expect(stepBid([0, 1, 2], 0, 1)).toBe(1);
    expect(stepBid([0, 1, 2], 2, 1)).toBe(2);
    expect(bidOption(options, 3)?.action).toEqual({ type: 'trace_bid', player: 'corp', credits: 3 });
    expect(bidOption(options, 9)).toBeNull();
    expect(bidButtonLabel(2)).toBe('Bid 2');
  });

  it('is a trace choice only with the trace kinds and a trace view', () => {
    expect(isTraceChoice(traceChoice('trace_corp', {}, options))).toBe(true);
    expect(isTraceChoice({ kind: 'trash_target', waitingOn: 'corp', cardId: ICE, options: [] } as ChoiceView)).toBe(false);
    expect(isTraceChoice(null)).toBe(false);
  });
});

describe('S-09-1 trace words', () => {
  it('Corp: "Trace 3: add credits?" and the strength as the bid changes (3 + bid)', () => {
    const c = traceChoice('trace_corp', {}, bids('corp', 4));
    expect(traceStepLabel(c, true)).toBe('Trace 3: add credits?');
    expect(traceLines(c, 2, true)).toEqual(['Trace 3 + 2 → strength 5', 'Runner: link 1, up to +5']);
    expect(bidCaption(c, 2)).toBe('strength 5');
  });

  it('Runner: "Trace strength 5 · your link 1 · spend 4 to stop it" (needed from the engine)', () => {
    const c = traceChoice('trace_runner', { strength: 5, corpBid: 2, needed: 4 }, bids('runner', 6));
    expect(traceStepLabel(c, true)).toBe('Trace strength 5 · your link 1 · spend 4 to stop it');
    expect(traceLines(c, 3, true)).toEqual(['Link 1 + 3 = 4: 1 short']);
    expect(traceLines(c, 4, true)).toEqual(['Link 1 + 4 = 5: you escape']);
    expect(traceLines(c, 0, false)).toEqual(['Trace strength 5 vs link 1']);
    expect(bidCaption(c, 4)).toBe('link 5 · escape');
    expect(bidCaption(c, 1)).toBe('link 2 · short');
  });

  it('architect review: escape / short follow the engine\'s `needed`, not a tie rule in the client', () => {
    // A made-up view where `needed` disagrees with strength − link: the words must follow `needed`.
    const c = traceChoice('trace_runner', { strength: 5, corpBid: 2, needed: 2 }, bids('runner', 6));
    expect(traceLines(c, 2, true)).toEqual(['Link 1 + 2 = 3: you escape']);
    expect(traceLines(c, 1, true)).toEqual(['Link 1 + 1 = 2: 1 short']);
    expect(bidCaption(c, 2)).toBe('link 3 · escape');
    expect(escapes({ needed: 0 }, 0)).toBe(true);
  });

  it('online: the other phone is bidding', () => {
    expect(bidWaitText('corp')).toBe('Corp is choosing its trace bid…');
    expect(bidWaitText('runner')).toBe('Runner is choosing his trace bid…');
    const c = traceChoice('trace_corp', {}, []);
    expect(traceStepLabel(c, false)).toBe('Corp is choosing its trace bid…');
  });

  it('results: both totals; ties say the Runner escaped; auto bids say "Corp bid 0"', () => {
    const tagged: GameEvent[] = [
      { type: 'trace_bid', player: 'corp', credits: 0, total: 3, auto: true },
      { type: 'trace_bid', player: 'runner', credits: 2, total: 3 },
      { type: 'trace_resolved', cardId: ICE, strength: 5, total: 3, success: true },
      { type: 'tags_changed', amount: 1, tags: 1 },
    ];
    expect(traceResultText(tagged, 2)).toBe('Rototurret: trace 5 vs link 3: Runner tagged');
    expect(traceNotices(tagged)).toEqual(['Corp bid 0', 'Rototurret: trace 5 vs link 3: Runner tagged']);
    const tie: GameEvent[] = [{ type: 'trace_resolved', cardId: ICE, strength: 5, total: 5, success: false }];
    expect(traceResultText(tie, 0)).toBe('Rototurret: trace 5 vs link 5: Runner escaped');
    const ichi: GameEvent[] = [
      { type: 'trace_resolved', cardId: ICE, strength: 2, total: 1, success: true },
      { type: 'tags_changed', amount: 1, tags: 2 },
      { type: 'brain_damage', amount: 1, cardIds: ['r03'], maxHandSize: 4 },
    ];
    expect(traceResultText(ichi, 0)).toBe('Rototurret: trace 2 vs link 1: Runner tagged, 1 brain damage');
    expect(autoBidText({ type: 'trace_bid', player: 'runner', credits: 0, total: 1, auto: true })).toBe('Runner bid 0');
  });

  it('the ICE report says the trace with its subroutine (Hunter / Ichi 1.0 in a run)', () => {
    const batch: GameEvent[] = [
      { type: 'credits_spent', player: 'runner', amount: 2 },
      { type: 'trace_bid', player: 'runner', credits: 2, total: 3 },
      { type: 'trace_resolved', cardId: ICE, strength: 5, total: 3, success: true },
      { type: 'tags_changed', amount: 1, tags: 1 },
      { type: 'subroutine_resolved', iceUid: 'i1', cardId: ICE, outcome: { sub: 0, op: 'trace', amount: 1 } },
    ];
    expect(iceReport(batch)).toBe('Rototurret: trace 5 vs link 3: you got 1 tag.');
    const escaped: GameEvent[] = [
      { type: 'trace_resolved', cardId: ICE, strength: 5, total: 5, success: false },
      { type: 'subroutine_resolved', iceUid: 'i1', cardId: ICE, outcome: { sub: 0, op: 'trace', amount: 0 } },
    ];
    expect(iceReport(escaped)).toBe('Rototurret: trace 5 vs link 5: you escaped.');
    const ichi: GameEvent[] = [
      { type: 'trace_resolved', cardId: ICE, strength: 1, total: 0, success: true },
      { type: 'tags_changed', amount: 1, tags: 1 },
      { type: 'brain_damage', amount: 1, cardIds: [], maxHandSize: 4 },
      { type: 'subroutine_resolved', iceUid: 'i1', cardId: ICE, outcome: { sub: 2, op: 'trace', amount: 1 } },
    ];
    expect(iceReport(ichi)).toBe('Rototurret: trace 1 vs link 0: you got 1 tag, you took 1 brain damage.');
    expect(outcomeText({ sub: 0, op: 'give_tags', amount: 1 }, 'did')).toBe('you got 1 tag');
    expect(outcomeText({ sub: 0, op: 'meat_damage', amount: 2 }, 'will')).toBe('take 2 meat damage');
  });

  it('let it fire: a trace waiting on the bids is named from the subroutine text', () => {
    const label = letFireLabel({ iceCardId: ICE, outcomes: [], ends: null }, [{ text: 'Trace 3 – If successful, give the Runner 1 tag.', broken: false }]);
    expect(label).toBe('Let it fire: trace 3 – If successful, give the Runner 1 tag…');
  });
});

describe('S-09-2/3 tags, basic actions, meat damage', () => {
  it('marker, link and button labels (prices from the engine option)', () => {
    expect(taggedText(1)).toBe('Tagged 1');
    expect(linkText(2)).toBe('Link 2');
    expect(clickCreditText({ clicks: 1, cost: 2 })).toBe('1 click + 2 credits');
    expect(clickCreditText({ clicks: 1, cost: 0 })).toBe('1 click');
    const remove: CardOption = { action: { type: 'remove_tag', player: 'runner' }, cost: 2, clicks: 1, reject: null };
    const trash: CardOption = { action: { type: 'trash_resource', player: 'corp', uid: 'r1' }, cost: 2, clicks: 1, reject: null };
    expect(basicOptionLabel(remove)).toBe('Remove 1 tag · 1 click + 2 credits');
    expect(basicOptionLabel(trash)).toBe('Trash · 1 click + 2 credits');
    expect(basicOptionLabel({ action: { type: 'draw', player: 'corp' }, cost: 0, reject: null })).toBeNull();
  });

  it('notices', () => {
    expect(tagsChangedText({ type: 'tags_changed', amount: 1, tags: 1 })).toBe('Runner gets 1 tag');
    expect(tagsChangedText({ type: 'tags_changed', amount: -1, tags: 0 })).toBe('Runner removed 1 tag');
    expect(taggedTrashText('r02')).toBe('Corp trashed Armitage Codebusting (Runner tagged)');
    expect(meatDamageText({ type: 'meat_damage', amount: 1, cardIds: ['r03'] })).toBe('1 meat damage: Diesel to the Heap');
    expect(meatDamageText({ type: 'meat_damage', amount: 1, cardIds: [] })).toBe('1 meat damage');
  });

  it('refusals in the card\'s own words (keyed on playIf / requires, never on a card id)', () => {
    const view = {
      viewer: 'corp',
      players: { corp: { hand: ['c12', 'c02'], scored: ['c09'] }, runner: { hand: null, scored: [] } },
      corpServers: [],
      rig: [{ uid: 'u7', cardId: 'r02' }],
      pendingDiscard: 0,
    } as unknown as PlayerView;
    expect(conditionText({ action: { type: 'play', player: 'corp', handIndex: 0 } }, view)).toBe(CONDITION_TEXT.runner_ran_last_turn);
    expect(conditionText({ action: { type: 'trash_resource', player: 'corp', uid: 'u7' } }, view)).toBe("Runner isn't tagged");
    expect(CONDITION_TEXT.runner_successful_run_last_turn).toBe('Runner made no successful run last turn');
    // Armitage's "take credits" ability needs credits on it.
    const armitage = { action: { type: 'activate', player: 'runner', uid: 'u7', ability: 0 }, clicks: 1 } as const;
    expect(rejectText('condition_not_met', { ...view, viewer: 'runner' } as PlayerView, armitage)).toBe('No credits left on it');
    expect(rejectText('no_credits', view, armitage)).toBe('Not enough credits');
    expect(choiceHint(traceChoice('trace_corp', {}, []))).toBe(TRACE_HINT);
  });
});

describe('S-09-1 bid layout: every button >= 44 px at 640x360, 844x390 and desktop', () => {
  it.each([
    ['640x360 strip', { x: 4, y: 284, width: 520, height: 72 }, 0.92],
    ['844x390 strip', { x: 4, y: 309, width: 691, height: 77 }, 1],
    ['desktop strip', { x: 558, y: 608, width: 527, height: 102 }, 1.3],
    ['narrow strip', { x: 0, y: 0, width: 340, height: 44 }, 0.8],
  ])('%s', (_name, area, scale) => {
    const b = bidLayout(area, scale);
    const all = [b.dec, b.tile, b.inc, b.max, b.go];
    for (const x of all) expect(Math.min(x.width, x.height)).toBeGreaterThanOrEqual(44);
    for (let i = 1; i < all.length; i++) expect(all[i]!.x).toBeGreaterThanOrEqual(all[i - 1]!.x + all[i - 1]!.width);
    for (const x of all) {
      expect(x.y).toBeGreaterThanOrEqual(area.y);
      expect(x.y + x.height).toBeLessThanOrEqual(area.y + area.height + 0.5);
    }
    expect(b.go.x + b.go.width).toBeLessThanOrEqual(area.x + area.width + 0.5);
  });
});

describe('S-09-1 covers: SEA Source on the Corp\'s turn (Corp -> Runner -> Corp)', () => {
  const view = { viewer: 'corp' } as PlayerView;
  const runnerBid: Decision = { seat: 'runner', run: null, choice: traceChoice('trace_runner', {}, bids('runner', 3)) };
  const same = (decision: Decision | null): Presentation => ({ kind: 'same', view, events: [], decision });
  it('the Runner\'s bid hands the device to the Runner, its end hands it back to the Corp', () => {
    expect(coverFor(same(runnerBid), null)?.title).toBe('Pass to the Runner — tap when ready');
    expect(coverFor(same(runnerBid), 'runner')).toBeNull();
    expect(coverFor(same(null), 'runner')?.title).toBe('Pass back to the Corp — tap when ready');
  });
});
