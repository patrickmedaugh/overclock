// Sprint 10: the AI with the advance cap (never offered, so never sends, Advance on an agenda at its
// requirement) and (E3) Bank Job's amount (takes the most offered).
import { getCard } from '@overclock/cards';
import { apply, legalActions, newGame, viewFor, waitingOn, type Action, type GameState } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/index';

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

describe('Sprint 10: chooseAction', () => {
  it('in 120 random core games (advance favoured), the Corp view never lists Advance on an agenda at its limit; AI answers are legal', () => {
    let seen = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const pick = prng(seed);
      let s: GameState = newGame(seed);
      for (let step = 0; step < 600 && s.phase !== 'over'; step++) {
        const me = waitingOn(s)!;
        const view = viewFor(me, s);
        const full = limitAgendas(s);
        if (me === 'corp' && full.length > 0) {
          seen++;
          for (const uid of full) expect(view.legalActions, `seed ${seed} step ${step}`).not.toContainEqual({ type: 'advance', player: 'corp', uid });
        }
        let action: Action;
        if (step % 3 === 0) {
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
    expect(seen).toBeGreaterThan(5);
  });
});
