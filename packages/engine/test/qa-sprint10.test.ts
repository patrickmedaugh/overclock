// QA Sprint 10 (written by QA, not the developers). Independent checks of S-10-3:
// advance stops at an agenda's requirement (house rule), Ice Wall still advances, and Bank Job's
// chosen amount. Real play from a new game; only hands/credits/clicks are set before the first action.
import { describe, expect, it } from 'vitest';
import { getCard } from '@overclock/cards';
import { apply, legalActions, viewFor, waitingOn, type Action, type GameState, type ServerId } from '../src/index';
import { coreGame, finishTurn, rejection, run, withHand, withPlayer, newGame } from './helpers';

const corpInstall = (handIndex: number, server: ServerId | 'new'): Action => ({ type: 'install', player: 'corp', handIndex, server });
const runnerInstall = (handIndex: number): Action => ({ type: 'install', player: 'runner', handIndex });
const runOn = (server: ServerId): Action => ({ type: 'run', player: 'runner', server });
const advance = (uid: string): Action => ({ type: 'advance', player: 'corp', uid });
const score = (uid: string): Action => ({ type: 'score', player: 'corp', uid });
const take = (uid: string, amount?: number): Action =>
  (amount === undefined ? { type: 'activate', player: 'runner', uid, ability: 0 } : { type: 'activate', player: 'runner', uid, ability: 0, amount }) as Action;
const passR: Action = { type: 'pass', player: 'runner' };

const installed = (s: GameState, uid: string) =>
  [...s.rig, ...s.servers.flatMap((sv) => [...sv.ice, ...sv.content])].find((c) => c.uid === uid);
const optTypes = (s: GameState, uid: string) => (viewFor('corp', s).installedOptions[uid] ?? []).map((o) => o.action.type);

function corpTurn(hand: string[], actions: Action[], credits = 10, clicks = 3): GameState {
  return run(withPlayer(withHand(newGame(44), 'corp', hand), 'corp', { credits, clicks }), actions).state;
}

describe('QA S-10-3 advance stops at the requirement', () => {
  it('Hostile Takeover (needs 2) at 2: only Score is offered; advance refused condition_not_met, state unchanged', () => {
    const s = corpTurn(['c08'], [corpInstall(0, 'new'), advance('i1'), advance('i1')], 10, 4);
    expect(installed(s, 'i1')!.advancements).toBe(2);
    expect(s.players.corp.clicks).toBe(1);
    expect(optTypes(s, 'i1')).toEqual(['score']);
    expect(legalActions(s, 'corp').some((a) => a.type === 'advance' && a.uid === 'i1')).toBe(false);
    const credits = s.players.corp.credits;
    const r = apply(s, advance('i1'));
    expect(rejection(r.events)).toBe('condition_not_met');
    expect(installed(r.state, 'i1')!.advancements).toBe(2);
    expect(r.state.players.corp.credits).toBe(credits);
    expect(r.state.players.corp.clicks).toBe(1);
    // Refusal events are only for the Corp seat: nothing broadcast besides the rejection.
    expect(r.events.every((e) => e.type === 'action_rejected')).toBe(true);
  });

  it('one short: Advance offered; then one advance -> only Score; scoring works', () => {
    const s = corpTurn(['c08'], [corpInstall(0, 'new'), advance('i1')], 10, 4);
    expect(installed(s, 'i1')!.advancements).toBe(1);
    expect(optTypes(s, 'i1')).toContain('advance');
    const t = run(s, [advance('i1')]).state;
    expect(optTypes(t, 'i1')).toEqual(['score']);
    const sc = run(t, [score('i1')]).state;
    expect(sc.players.corp.scoreArea).toEqual(['c08']);
  });

  it('Priority Requisition (needs 5): advance offered at 0..4, never at 5', () => {
    let s = corpTurn(['c10'], [corpInstall(0, 'new')], 20, 9);
    for (let k = 0; k < 5; k++) {
      expect(optTypes(s, 'i1'), `at ${k}`).toContain('advance');
      s = run(s, [advance('i1')]).state;
    }
    expect(installed(s, 'i1')!.advancements).toBe(5);
    expect(optTypes(s, 'i1')).toEqual(['score']);
    expect(rejection(apply(s, advance('i1')).events)).toBe('condition_not_met');
  });

  it('Ice Wall advanced (not an agenda) is still offered Advance and can go past any limit', () => {
    let s = corpTurn(['c05'], [corpInstall(0, 'new')], 20, 8);
    for (let k = 0; k < 6; k++) {
      expect(optTypes(s, 'i1'), `ice wall at ${k}`).toContain('advance');
      s = run(s, [advance('i1')]).state;
    }
    expect(installed(s, 'i1')!.advancements).toBe(6);
    expect(optTypes(s, 'i1')).toContain('advance');
  });

  it('core-deck random play (120 games): no agenda ever goes over its requirement; advance never offered at the limit', () => {
    let seen = 0;
    for (let seed = 10_000; seed < 10_120; seed++) {
      let s = coreGame(seed);
      let x = seed * 2654435761;
      const rnd = () => ((x = (x * 1103515245 + 12345) >>> 0) / 2 ** 32);
      for (let n = 0; n < 400 && s.phase !== 'over'; n++) {
        const who = waitingOn(s);
        if (!who) break;
        const all = legalActions(s, who);
        const adv = all.filter((a) => a.type === 'advance');
        const pool = adv.length > 0 && rnd() < 0.8 ? adv : all.filter((a) => a.type !== 'end_turn').length > 0 && rnd() < 0.9 ? all.filter((a) => a.type !== 'end_turn') : all;
        const a = pool[Math.floor(rnd() * pool.length)]!;
        const r = apply(s, a);
        expect(rejection(r.events), `seed ${seed} ${JSON.stringify(a)}`).toBeNull();
        s = r.state;
        // Using the card data: agendas installed in servers.
        for (const sv of s.servers)
          for (const c of sv.content) {
            const def = getCard(c.cardId) as { type?: string; advancementRequirement?: number } | undefined;
            const reqOf = def?.type === 'agenda' ? def.advancementRequirement : undefined;
            if (reqOf === undefined) continue;
            expect(c.advancements, `seed ${seed}: ${c.cardId} over its requirement`).toBeLessThanOrEqual(reqOf);
            if (c.advancements === reqOf) {
              seen++;
              expect(legalActions(s, 'corp').some((l) => l.type === 'advance' && l.uid === c.uid), `seed ${seed}: advance offered at limit`).toBe(false);
            }
          }
      }
    }
    expect(seen).toBeGreaterThan(0);
  }, 120_000);
});

describe('QA S-10-3 Bank Job amount', () => {
  /** PAD Campaign alone in remote1 (seed 52); Bank Job installed with 8; the Runner got in. */
  function atSuccess(): { s: GameState; uid: string } {
    let s = corpTurn(['c03'], [corpInstall(0, 'new')]);
    s = finishTurn(s).state;
    s = withPlayer(withHand(s, 'runner', ['r10']), 'runner', { credits: 5, clicks: 4 });
    s = run(s, [runnerInstall(0)]).state;
    const uid = s.rig.find((c) => c.cardId === 'r10')!.uid;
    s = run(s, [runOn('remote1')]).state;
    expect(s.run?.step).toBe('success');
    return { s, uid };
  }

  it('take 3 of 8: +3, Bank Job keeps 5, nothing accessed, PAD still in the server', () => {
    const { s, uid } = atSuccess();
    const c0 = s.players.runner.credits;
    const r = apply(s, take(uid, 3));
    expect(rejection(r.events)).toBeNull();
    expect(r.state.players.runner.credits).toBe(c0 + 3);
    expect(installed(r.state, uid)!.hostedCredits).toBe(5);
    expect(r.events.some((e) => e.type === 'card_accessed')).toBe(false);
    expect(r.state.run).toBeNull();
    expect(r.state.servers.find((v) => v.id === 'remote1')!.content.map((c) => c.cardId)).toEqual(['c03']);
  });

  it('Access cards instead: accesses as normal, Bank Job keeps all 8', () => {
    const { s, uid } = atSuccess();
    const r = apply(s, passR);
    expect(rejection(r.events)).toBeNull();
    expect(r.events.some((e) => e.type === 'card_accessed')).toBe(true);
    expect(installed(r.state, uid)!.hostedCredits).toBe(8);
  });

  it('take 3, then on a later run take the last 5: emptied -> Heap; no take of more than it holds', () => {
    const { s, uid } = atSuccess();
    let t = run(s, [take(uid, 3)]).state;
    expect(t.players.runner.clicks).toBeGreaterThan(0);
    t = run(t, [runOn('remote1')]).state;
    expect(t.run?.step).toBe('success');
    const amounts = viewFor('runner', t).run!.options.filter((o) => o.action.type === 'activate').map((o) => (o.action as { amount?: number }).amount);
    expect(amounts).toEqual([1, 2, 3, 4, 5]);
    expect(rejection(apply(t, take(uid, 6)).events)).toBe('bad_target');
    const c0 = t.players.runner.credits;
    const r = apply(t, take(uid, 5));
    expect(r.state.players.runner.credits).toBe(c0 + 5);
    expect(r.state.rig.some((c) => c.uid === uid)).toBe(false);
    expect(JSON.stringify(r.state.players.runner.discard)).toContain('r10');
  });

  it('bad amounts are refused and change nothing: missing, 0, -1, 9, 2.5', () => {
    const { s, uid } = atSuccess();
    expect(rejection(apply(s, take(uid)).events)).toBe('invalid_action');
    expect(rejection(apply(s, take(uid, 2.5)).events)).toBe('invalid_action');
    for (const n of [0, -1, 9]) {
      const r = apply(s, take(uid, n));
      expect(rejection(r.events), `amount ${n}`).toBe('bad_target');
      expect(installed(r.state, uid)!.hostedCredits).toBe(8);
      expect(r.state.players.runner.credits).toBe(s.players.runner.credits);
    }
  });

  it('an amount on a fixed-amount ability (Armitage Codebusting) is refused invalid_action', () => {
    let s = finishTurn(corpTurn([], [])).state;
    s = withPlayer(withHand(s, 'runner', ['r02']), 'runner', { credits: 5, clicks: 4 });
    s = run(s, [runnerInstall(0)]).state;
    const uid = s.rig.find((c) => c.cardId === 'r02')!.uid;
    expect(rejection(apply(s, take(uid, 2)).events)).toBe('invalid_action');
    expect(rejection(apply(s, take(uid)).events)).toBeNull();
  });
});
