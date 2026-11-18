// Sprint 10: the AI with the advance cap (never offered, so never sends, Advance on an agenda at its
// requirement) and Bank Job's amount (takes the most offered).
import { getCard } from '@overclock/cards';
import { apply, legalActions, newGame as engineNewGame, viewFor, waitingOn, type Action, type GameOptions, type GameState, type Side } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/index';

/** Sprint 12: these AI tests keep the 30-card core decks (the frozen 'core' fixture; 'core45' is the new default). */
const newGame = (seed: number, options: Partial<GameOptions> = {}): GameState => engineNewGame(seed, { deckSet: 'core', ...options });

function prng(seed: number): (n: number) => number {
  let x = (seed * 2654435761) >>> 0 || 9;
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

/** Installed agendas at (or past) their requirement. */
function limitAgendas(s: GameState): string[] {
  return s.servers
    .flatMap((sv) => sv.content)
    .filter((c) => {
      const card = getCard(c.cardId);
      return card?.type === 'agenda' && c.advancements >= (card.advancementRequirement ?? 0);
    })
    .map((c) => c.uid);
}

/** The Corp's turn with Hostile Takeover (requirement 2) in remote1 holding `advancements`. */
function corpWithAgenda(advancements: number): GameState {
  const s = withP(newGame(5), 'corp', { clicks: 3, credits: 5 });
  const agenda = { uid: 'i9', cardId: 'c08', rezzed: false, advancements, hostedCredits: 0 };
  return { ...s, servers: [...s.servers, { id: 'remote1', ice: [], content: [agenda] }] };
}

/** The Runner's turn; Bank Job (i8) holds `credits`; a successful run on remote1 (PAD Campaign) stops at step success. */
function bankJobSuccess(credits: number): GameState {
  let s = newGame(5);
  s = withP({ ...s, activePlayer: 'runner', turn: 2 }, 'runner', { clicks: 4, credits: 2 });
  s = { ...s, rig: [{ uid: 'i8', cardId: 'r10', rezzed: false, advancements: 0, hostedCredits: credits }] };
  s = { ...s, servers: [...s.servers, { id: 'remote1', ice: [], content: [{ uid: 'i9', cardId: 'c03', rezzed: false, advancements: 0, hostedCredits: 0 }] }] };
  s = apply(s, { type: 'run', player: 'runner', server: 'remote1' }).state;
  expect(s.run?.step).toBe('success');
  return s;
}

describe('Sprint 10: advance cap', () => {
  it('an agenda at its requirement: no Advance in the view the AI reads; one short: offered', () => {
    const adv: Action = { type: 'advance', player: 'corp', uid: 'i9' };
    expect(viewFor('corp', corpWithAgenda(2)).legalActions).not.toContainEqual(adv);
    expect(viewFor('corp', corpWithAgenda(2)).legalActions).toContainEqual({ type: 'score', player: 'corp', uid: 'i9' });
    expect(viewFor('corp', corpWithAgenda(1)).legalActions).toContainEqual(adv);
    expect(chooseAction(viewFor('corp', corpWithAgenda(2)))).not.toEqual(adv);
  });

  it('in 120 random core games (advance favoured), the Corp view never lists Advance on an agenda at its limit; AI answers are legal', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const pick = prng(seed);
      let s: GameState = newGame(seed);
      for (let step = 0; step < 600 && s.phase !== 'over'; step++) {
        const me = waitingOn(s)!;
        const view = viewFor(me, s);
        const full = limitAgendas(s);
        if (me === 'corp') for (const uid of full) expect(view.legalActions, `seed ${seed} step ${step}`).not.toContainEqual({ type: 'advance', player: 'corp', uid });
        let action: Action;
        if (step % 3 === 0 || s.run?.step === 'success') {
          action = chooseAction(view) as Action;
          expect(view.legalActions).toContainEqual(action);
          if (action.type === 'advance') expect(full).not.toContain(action.uid);
        } else {
          const legal = legalActions(s, me);
          const adv = legal.filter((a) => a.type === 'advance' || a.type === 'install');
          const list = adv.length > 0 && pick(3) > 0 ? adv : legal;
          action = list[pick(list.length)]!;
        }
        const r = apply(s, action);
        expect(r.events.some((e) => e.type === 'action_rejected'), `seed ${seed} step ${step} ${JSON.stringify(action)}`).toBe(false);
        s = r.state;
      }
    }
  });
});

describe('Sprint 10: Bank Job amount', () => {
  it.each([8, 5, 1])('Bank Job holding %i: the Runner takes all of it (the highest offered amount)', (credits) => {
    const s = bankJobSuccess(credits);
    expect(chooseAction(viewFor('runner', s))).toEqual({ type: 'activate', player: 'runner', uid: 'i8', ability: 0, amount: credits });
    expect(chooseAction(viewFor('corp', s))).toBeNull();
    const r = apply(s, chooseAction(viewFor('runner', s))!);
    expect(r.state.players.runner.credits).toBe(2 + credits);
    expect(r.state.rig).toEqual([]);
  });
});
