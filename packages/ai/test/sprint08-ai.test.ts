// Sprint 8 E8: the AI stays legal with the new choices (trash_target, prevent_trash), Corp click
// abilities and Battering Ram's multi-break, on the core decks; it reads only the deciding seat's view.
import { apply, legalActions, newGame as engineNewGame, viewFor, waitingOn, type Action, type GameOptions, type GameState } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/index';

/** Sprint 12: these AI tests keep the 30-card core decks (the frozen 'core' fixture; 'core45' is the new default). */
const newGame = (seed: number, options: Partial<GameOptions> = {}): GameState => engineNewGame(seed, { deckSet: 'core', ...options });

function prng(seed: number): (n: number) => number {
  let x = (seed * 2654435761) >>> 0 || 11;
  return (n) => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x % n;
  };
}

/** A Runner encountering a rezzed Rototurret on HQ with `rig` installed (core decks). */
function atTurret(rig: string[]): GameState {
  let s = newGame(5);
  s = { ...s, activePlayer: 'runner', turn: 2, players: { ...s.players, runner: { ...s.players.runner, clicks: 4 } } };
  s = { ...s, rig: rig.map((cardId, i) => ({ uid: `i${i + 1}`, cardId, rezzed: false, advancements: 0, hostedCredits: 0 })) };
  const turret = { uid: 'i9', cardId: 'c19', rezzed: true, advancements: 0, hostedCredits: 0 };
  s = { ...s, servers: s.servers.map((sv) => (sv.id === 'hq' ? { ...sv, ice: [turret] } : sv)) };
  s = apply(s, { type: 'run', player: 'runner', server: 'hq' }).state;
  return apply(s, { type: 'pass', player: 'runner' }).state;
}

describe('Sprint 8: chooseAction in the new choices', () => {
  it('trash_target: the Corp AI trashes the costliest program (Battering Ram 5 over Corroder 2)', () => {
    const s = atTurret(['r04', 'r17']);
    expect(s.choice?.kind).toBe('trash_target');
    expect(chooseAction(viewFor('corp', s))).toEqual({ type: 'choose', player: 'corp', uid: 'i2' });
    expect(chooseAction(viewFor('runner', s))).toBeNull();
  });

  it('prevent_trash: the Runner AI trashes Sacrificial Construct to save the program', () => {
    const s = atTurret(['r04', 'r12']);
    expect(s.choice?.kind).toBe('prevent_trash');
    expect(chooseAction(viewFor('runner', s))).toEqual({ type: 'choose', player: 'runner', uid: 'i2' });
    expect(chooseAction(viewFor('corp', s))).toBeNull();
  });

  it('in 150 random core-deck games every AI answer is legal and accepted, and the new choices come up', () => {
    let choices = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const pick = prng(seed);
      let s: GameState = newGame(seed);
      for (let step = 0; step < 700 && s.phase !== 'over'; step++) {
        const me = waitingOn(s)!;
        let action: Action;
        if (step % 3 === 0 || s.phase === 'choice') {
          const view = viewFor(me, s);
          action = chooseAction(view) as Action;
          expect(action, `seed ${seed} step ${step}`).not.toBeNull();
          expect(view.legalActions).toContainEqual(action);
          if (s.choice && s.choice.kind !== 'free_rez') choices++;
        } else {
          const legal = legalActions(s, me);
          const runs = legal.filter((a) => a.type === 'run' || a.type === 'install' || a.type === 'rez');
          const list = runs.length > 0 && pick(2) === 0 ? runs : legal;
          action = list[pick(list.length)]!;
        }
        const r = apply(s, action);
        expect(r.events.some((e) => e.type === 'action_rejected'), `seed ${seed} step ${step} ${JSON.stringify(action)}`).toBe(false);
        s = r.state;
      }
    }
    expect(choices).toBeGreaterThan(0);
  }, 120_000);
});
