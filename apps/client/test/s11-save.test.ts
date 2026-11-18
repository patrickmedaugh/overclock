// Sprint 11 (S-11-3, U2): the pass-the-phone save on this device. Storage is a
// fake (or one that throws); the game is rebuilt by `LocalMatch.load` (engine-dev).
import { RULES_VERSION } from '@overclock/engine';
import { LocalMatch, type SavedGame } from '@overclock/match';
import { planToStep } from '@overclock/match/testing';
import { describe, expect, it } from 'vitest';
import { HotSeat } from '../src/hotseat';
import { HOTSEAT_KEY, SaveWriter, forgetHotSeatSave, readHotSeatSave, writeHotSeatSave } from '../src/savedGame';
import { continueHereSub, continueOnlineLabel, continueOnlineSub } from '../src/startScreen';
import { LEAVE_BUTTON, LEAVE_TEXT, LEAVE_TEXT_ONLINE } from '../src/leaveDialog';

class MemStore {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

/** Storage that refuses everything (private mode, blocked, full). */
const BROKEN_STORE = {
  getItem(): string | null {
    throw new Error('blocked');
  },
  setItem(): void {
    throw new Error('full');
  },
  removeItem(): void {
    throw new Error('blocked');
  },
};

/** A pass-the-phone game played to `goal` (core decks), every move accepted. */
function playedTo(seed: number, goal: Parameters<typeof planToStep>[1]) {
  const plan = planToStep(seed, goal);
  const h = new HotSeat(seed, { deckSet: plan.deckSet });
  for (const a of plan.actions) h.submit(a);
  expect(h.save().actions).toHaveLength(plan.actions.length);
  return { h, plan };
}

/** A save of a game that has ended (the Corp scores its 7th point). */
function finishedSave(): SavedGame {
  const { h } = playedTo(1, 'corp_one_score_from_win');
  const score = h.view().legalActions.find((a) => a.type === 'score');
  expect(score).toBeDefined();
  h.submit(score!);
  expect(h.over()).toBe(true);
  return h.save();
}

describe('S-11-3 HotSeat save / restore', () => {
  it('onSaved fires after each accepted move (after the presentation), never for a refused one', () => {
    const h = new HotSeat(7, { deckSet: 'starter' });
    const order: string[] = [];
    h.onPresent(() => order.push('present'));
    h.onSaved(() => order.push('saved'));
    h.submit({ type: 'gain_credit', player: 'corp' });
    expect(order).toEqual(['present', 'saved']);
    h.submit({ type: 'draw', player: 'runner' }); // not the Runner's turn: refused
    expect(order).toEqual(['present', 'saved', 'present']);
    expect(h.save().actions).toEqual([{ type: 'gain_credit', player: 'corp' }]);
    expect(h.save().rulesVersion).toBe(RULES_VERSION);
  });

  it('restore: the same game, the active player at the bottom, the same views for both seats', () => {
    const { h, plan } = playedTo(3, 'runner_one_steal_from_win');
    const r = LocalMatch.load(JSON.stringify(h.save()));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const back = HotSeat.restore(r.match);
    expect(back.seat).toBe(plan.activePlayer);
    expect(back.seat).toBe(h.seat);
    expect(back.view()).toEqual(h.view());
    expect(back.decision()).toEqual(h.decision());
    expect(back.toAct).toBe(h.toAct);
    // The bottom seat's view never holds the other hand.
    const other = back.seat === 'corp' ? 'runner' : 'corp';
    expect(back.view().players[other].hand).toBeNull();
  });

  it("restore mid-run with the Corp's rez decision open: toAct is the Corp (the cover goes to the Corp)", () => {
    const { h } = playedTo(1, 'corp_rez_prompt');
    expect(h.seat).toBe('runner');
    expect(h.decision()?.seat).toBe('corp');
    const r = LocalMatch.load(h.save());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const back = HotSeat.restore(r.match);
    expect(back.seat).toBe('runner');
    expect(back.toAct).toBe('corp');
    expect(back.decision()).toEqual(h.decision());
  });

  it('over() once the game has a result', () => {
    const h = new HotSeat(7, { deckSet: 'starter' });
    expect(h.over()).toBe(false);
    expect(LocalMatch.load(finishedSave())).toEqual({ ok: false, reason: 'finished' });
  });
});

describe('S-11-3 the save slot (savedGame.ts)', () => {
  it('none / ready / outdated; broken and finished saves are deleted and never offered', () => {
    const store = new MemStore();
    expect(readHotSeatSave(store)).toEqual({ kind: 'none' });
    expect(readHotSeatSave(null)).toEqual({ kind: 'none' });

    const { h } = playedTo(3, 'runner_one_steal_from_win');
    expect(writeHotSeatSave(store, h.save())).toBe(true);
    const ready = readHotSeatSave(store);
    expect(ready.kind).toBe('ready');
    if (ready.kind === 'ready') {
      expect(ready.turn).toBe('runner');
      expect(ready.match.view('runner')).toEqual(h.view());
    }

    // Owner Q3 A: another rules version is offered, then explains itself (the slot is kept until then).
    store.setItem(HOTSEAT_KEY, JSON.stringify({ ...h.save(), rulesVersion: RULES_VERSION - 1 }));
    expect(readHotSeatSave(store)).toEqual({ kind: 'outdated' });
    expect(store.getItem(HOTSEAT_KEY)).not.toBeNull();

    store.setItem(HOTSEAT_KEY, '{not json');
    expect(readHotSeatSave(store)).toEqual({ kind: 'none' });
    expect(store.getItem(HOTSEAT_KEY)).toBeNull();

    store.setItem(HOTSEAT_KEY, JSON.stringify(finishedSave()));
    expect(readHotSeatSave(store)).toEqual({ kind: 'none' });
    expect(store.getItem(HOTSEAT_KEY)).toBeNull();
  });

  it('storage that throws never breaks anything', () => {
    expect(readHotSeatSave(BROKEN_STORE)).toEqual({ kind: 'none' });
    expect(writeHotSeatSave(BROKEN_STORE, new HotSeat(1).save())).toBe(false);
    expect(() => forgetHotSeatSave(BROKEN_STORE)).not.toThrow();
    const w = new SaveWriter(BROKEN_STORE, (fn) => fn());
    expect(() => w.mark(new HotSeat(1))).not.toThrow();
  });

  it('SaveWriter: writes after the tap (scheduled), once per batch; a finished game deletes the save', () => {
    const store = new MemStore();
    const queue: (() => void)[] = [];
    const w = new SaveWriter(store, (fn) => queue.push(fn));
    const h = new HotSeat(7, { deckSet: 'starter' });
    h.onSaved((g) => w.mark(g));
    h.submit({ type: 'gain_credit', player: 'corp' });
    h.submit({ type: 'gain_credit', player: 'corp' });
    // Nothing written in the tap itself.
    expect(store.getItem(HOTSEAT_KEY)).toBeNull();
    expect(queue).toHaveLength(1);
    queue.shift()!();
    expect(w.writes).toBe(1);
    expect((JSON.parse(store.getItem(HOTSEAT_KEY)!) as SavedGame).actions).toHaveLength(2);

    // flush() writes at once (the page is being hidden).
    h.submit({ type: 'draw', player: 'corp' });
    w.flush();
    expect((JSON.parse(store.getItem(HOTSEAT_KEY)!) as SavedGame).actions).toHaveLength(3);
    queue.shift()!(); // the scheduled one finds nothing left to write
    expect(w.writes).toBe(2);

    // Game over: the slot is emptied.
    w.mark({ save: () => finishedSave(), over: () => true });
    queue.shift()!();
    expect(store.getItem(HOTSEAT_KEY)).toBeNull();
  });
});

describe('S-11-3 words', () => {
  it('Continue rows and the leave question', () => {
    expect(continueOnlineLabel('K7QF')).toBe('Continue game · K7QF');
    expect(continueOnlineSub('runner')).toBe('Online · you play the Runner');
    expect(continueHereSub('corp')).toBe("On this device · Corp's turn");
    expect(continueHereSub(null)).toBe('On this device');
    expect(LEAVE_TEXT).toBe('The game is saved. Continue it from the start screen.');
    expect(LEAVE_TEXT_ONLINE).toBe(LEAVE_TEXT);
    expect(LEAVE_BUTTON).toBe('Leave for now');
  });
});
