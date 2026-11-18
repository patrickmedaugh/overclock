// Sprint 9 E7: the AI bids in traces (from the public numbers in the view), uses tags (Private Security
// Force, trash the costliest resource, remove a tag with ≥ 4 credits), and stays legal on the core decks.
import { apply, legalActions, newGame as engineNewGame, viewFor, waitingOn, type Action, type GameOptions, type GameState, type Side } from '@overclock/engine';
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

const withP = (s: GameState, side: Side, patch: Partial<GameState['players']['corp']>): GameState => ({ ...s, players: { ...s.players, [side]: { ...s.players[side], ...patch } } });

/** The Runner (Kate, link 1) lets a rezzed Hunter on HQ fire; Corp / Runner credits as given. */
function hunterTrace(corpCredits: number, runnerCredits: number): GameState {
  let s = newGame(5);
  s = { ...s, activePlayer: 'runner', turn: 2 };
  s = withP(withP(s, 'runner', { clicks: 4, credits: runnerCredits }), 'corp', { credits: corpCredits });
  const hunter = { uid: 'i9', cardId: 'c20', rezzed: true, advancements: 0, hostedCredits: 0 };
  s = { ...s, servers: s.servers.map((sv) => (sv.id === 'hq' ? { ...sv, ice: [hunter] } : sv)) };
  s = apply(s, { type: 'run', player: 'runner', server: 'hq' }).state;
  return apply(s, { type: 'pass', player: 'runner' }).state;
}

describe('Sprint 9: trace bids', () => {
  it('Corp: the least bid that beats the Runner’s best answer (link 1 + 3 credits → strength 5 = bid 2)', () => {
    const s = hunterTrace(6, 3);
    expect(s.choice?.kind).toBe('trace_corp');
    expect(chooseAction(viewFor('corp', s))).toEqual({ type: 'trace_bid', player: 'corp', credits: 2 });
    expect(chooseAction(viewFor('runner', s))).toBeNull();
  });

  it('Corp: bids 0 when it cannot outbid the Runner (link 1 + 5 credits vs Trace 3 + 2)', () => {
    expect(chooseAction(viewFor('corp', hunterTrace(2, 5)))).toEqual({ type: 'trace_bid', player: 'corp', credits: 0 });
  });

  it('Runner: bids `needed` (the tie that escapes)', () => {
    const s = apply(hunterTrace(4, 5), { type: 'trace_bid', player: 'corp', credits: 1 }).state;
    expect(s.choice?.kind).toBe('trace_runner');
    expect(chooseAction(viewFor('runner', s))).toEqual({ type: 'trace_bid', player: 'runner', credits: 3 });
  });
});

describe('Sprint 9: tag actions', () => {
  /** The Corp's turn with the Runner tagged, rig Armitage (cost 1), Bank Job (1), Access to Globalsec (1) or Sure Gamble-cost cards. */
  function corpTurn(rig: string[], scored: string[] = [], tags = 1): GameState {
    let s = newGame(5);
    s = { ...s, rig: rig.map((cardId, i) => ({ uid: `i${i + 1}`, cardId, rezzed: false, advancements: 0, hostedCredits: 0 })) };
    return withP(withP(s, 'runner', { tags }), 'corp', { scoreArea: scored, credits: 5 });
  }

  it('Corp: Private Security Force first when the Runner is tagged', () => {
    expect(chooseAction(viewFor('corp', corpTurn(['r02'], ['c09'])))).toEqual({ type: 'activate', player: 'corp', uid: 'score:corp:0', ability: 0 });
  });

  it('Corp: else trashes the costliest resource (Sacrificial Construct 0 < Armitage 1; first on a tie)', () => {
    expect(chooseAction(viewFor('corp', corpTurn(['r12', 'r02', 'r18'])))).toEqual({ type: 'trash_resource', player: 'corp', uid: 'i2' });
  });

  it('Corp: untagged, neither (first legal action as before)', () => {
    const s = corpTurn(['r02'], ['c09'], 0);
    expect(chooseAction(viewFor('corp', s))).toEqual(legalActions(s, 'corp')[0]);
  });

  it('Runner: removes a tag with ≥ 4 credits, not with 3', () => {
    let s = newGame(5);
    s = { ...s, activePlayer: 'runner', turn: 2 };
    const rich = withP(s, 'runner', { clicks: 4, credits: 4, tags: 1 });
    expect(chooseAction(viewFor('runner', rich))).toEqual({ type: 'remove_tag', player: 'runner' });
    const poor = withP(s, 'runner', { clicks: 4, credits: 3, tags: 1 });
    expect(chooseAction(viewFor('runner', poor))).not.toEqual({ type: 'remove_tag', player: 'runner' });
  });
});

describe('Sprint 9: AI-only core-deck games stay legal and use the new rules', () => {
  it('120 games (AI both seats, some random moves): every answer is legal; traces, tags and PSF come up', () => {
    const tally = { traces: 0, tags: 0, trashed: 0, removed: 0, meat: 0 };
    for (let game = 1; game <= 120; game++) {
      const pick = prng(game * 31 + 7);
      let s = newGame(game, game % 2 ? { rezWindow: 'always' } : {});
      for (let i = 0; i < 600 && s.phase !== 'over'; i++) {
        const seat = waitingOn(s)!;
        const v = viewFor(seat, s);
        const ai = chooseAction(v);
        expect(ai, `game ${game} step ${i}`).not.toBeNull();
        const legal = legalActions(s, seat);
        expect(legal, `game ${game} step ${i}`).toContainEqual(ai);
        const a: Action = pick(4) === 0 ? legal[pick(legal.length)]! : ai!;
        const r = apply(s, a);
        expect(r.events.some((e) => e.type === 'action_rejected')).toBe(false);
        for (const e of r.events) {
          if (e.type === 'trace_resolved') tally.traces++;
          if (e.type === 'tags_changed' && e.amount > 0) tally.tags++;
          if (e.type === 'tags_changed' && e.amount < 0) tally.removed++;
          if (e.type === 'rig_card_trashed' && e.cause === 'tagged') tally.trashed++;
          if (e.type === 'meat_damage') tally.meat++;
        }
        s = r.state;
      }
    }
    expect(tally.traces).toBeGreaterThan(0);
    expect(tally.tags).toBeGreaterThan(0);
  });
});
