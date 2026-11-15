// Sprint 6 E3: the pure hidden-information checks exported from @overclock/match/testing
// agree with the engine's own checks on real games, and catch planted leaks.
import { apply, legalActions, viewEvents, viewFor, waitingOn, type GameEvent, type PlayerView } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { newGame, LocalMatch } from './legacy';
import { planBusyBoard, runnerEventLeaks, runnerViewLeaks } from '../src/testing';


describe('runnerViewLeaks / runnerEventLeaks', () => {
  it('report nothing over random games (both rez-window options)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let s = newGame(seed, { rezWindow: seed % 2 ? 'always' : 'affordable' });
      let x = seed;
      for (let i = 0; i < 300 && s.phase !== 'over'; i++) {
        const who = waitingOn(s)!;
        const legal = legalActions(s, who);
        x = (x * 1103515245 + 12345) >>> 0;
        const r = apply(s, legal[x % legal.length]!);
        s = r.state;
        expect(runnerViewLeaks(s)).toEqual([]);
        expect(runnerEventLeaks(viewEvents('runner', r.events), s)).toEqual([]);
      }
    }
  });

  it('catch a planted Corp hand card, a named face-down card and an unprojected event', () => {
    const plan = planBusyBoard(3);
    const m = LocalMatch.restore(plan.seed, plan.actions);
    const s = m.snapshot();
    const v = m.view('runner');
    expect(runnerViewLeaks(s, v)).toEqual([]);
    const handLeak = { ...v, players: { ...v.players, corp: { ...v.players.corp, hand: [...s.players.corp.hand] } } } as PlayerView;
    expect(runnerViewLeaks(s, handLeak).length).toBeGreaterThan(0);
    const faceDown = s.servers.flatMap((sv) => sv.ice).find((c) => !c.rezzed)!;
    const named = {
      ...v,
      corpServers: v.corpServers.map((sv) => ({ ...sv, ice: sv.ice.map((c) => (c.uid === faceDown.uid ? { ...c, cardId: faceDown.cardId } : c)) })),
    };
    expect(runnerViewLeaks(s, named).length).toBeGreaterThan(0);
    expect(runnerViewLeaks(s, viewFor('corp', s)).length).toBeGreaterThan(0);
    const drawn: GameEvent = { type: 'card_drawn', player: 'corp', cardId: s.players.corp.hand[0]! };
    expect(runnerEventLeaks([drawn], s).length).toBe(1);
    expect(runnerEventLeaks(viewEvents('runner', [drawn]), s)).toEqual([]);
  });
});

describe('Sprint 7 allowlist (narrow): card_rezzed / ability_triggered / Runner installedOptions', () => {
  it('accept a face-up card, catch a face-down one and a Corp uid in the Runner options', () => {
    const plan = planBusyBoard(3);
    const m = LocalMatch.restore(plan.seed, plan.actions);
    const s = m.snapshot();
    const faceDown = s.servers.flatMap((sv) => sv.ice).find((c) => !c.rezzed)!;
    const leak: GameEvent = { type: 'card_rezzed', uid: faceDown.uid, cardId: faceDown.cardId, server: 'remote1' };
    expect(runnerEventLeaks([leak], s).length).toBeGreaterThan(0);
    const trig: GameEvent = { type: 'ability_triggered', uid: faceDown.uid, cardId: faceDown.cardId, trigger: 'turn_start' };
    expect(runnerEventLeaks([trig], s).length).toBeGreaterThan(0);
    const rezzed = { ...s, servers: s.servers.map((sv) => ({ ...sv, ice: sv.ice.map((c) => (c.uid === faceDown.uid ? { ...c, rezzed: true } : c)) })) };
    expect(runnerEventLeaks([leak, trig], rezzed)).toEqual([]);
    const rigCard = s.rig[0]!;
    expect(runnerEventLeaks([{ type: 'ability_triggered', uid: rigCard.uid, cardId: rigCard.cardId, trigger: 'click' }], s)).toEqual([]);
    const v = m.view('runner');
    const planted = { ...v, installedOptions: { [faceDown.uid]: [] } } as PlayerView;
    expect(runnerViewLeaks(s, planted).length).toBeGreaterThan(0);
  });
});
