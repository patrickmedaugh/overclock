// QA Sprint 11 (written by QA): S-11-1 / S-11-2 labels on REAL engine encounters. Every planner path
// (all sprints' goals, 3 seeds) is played in LocalMatch; at every Runner encounter step each run
// option's words are checked against card data and the engine's own options:
// - a button from a card starts with that card's whole name and ": ";
// - a break names the breaker's printed ICE type, which is the encountered ICE's type;
// - "up to N" shows exactly when the engine offers a pick of N >= 2 for that ability, N = the most;
// - the price is the engine's cost (or who pays it).
import { getCard } from '@overclock/cards';
import { LocalMatch } from '@overclock/match';
import { SPRINT10_GOALS, SPRINT11_GOALS, SPRINT7_GOALS, SPRINT8_GOALS, SPRINT9_GOALS, STEP_GOALS, planToStep, type StepGoal } from '@overclock/match/testing';
import { describe, expect, it } from 'vitest';
import { optionLabel, payText, type RigIds } from '../src/runText';
import { ICE_TYPE } from '../src/terms';

const GOALS = [...new Set<StepGoal>([...STEP_GOALS, ...SPRINT7_GOALS, ...SPRINT8_GOALS, ...SPRINT9_GOALS, ...SPRINT10_GOALS, ...SPRINT11_GOALS])];

describe('QA S-11-1 / S-11-2 labels on real encounters', () => {
  it('every card button names its card; breaks name the ICE type; "up to N" only with a real pick of N', () => {
    let checked = 0;
    let upTo = 0;
    const seen = new Set<string>();
    for (const goal of GOALS) {
      for (const seed of [7, 23, 101]) {
        let plan;
        try {
          plan = planToStep(seed, goal);
        } catch {
          continue;
        }
        const m = new LocalMatch(plan.seed, { deckSet: plan.deckSet });
        for (const a of plan.actions) {
          m.submit(a.player, a);
          const v = m.view('runner');
          const run = v.run;
          if (!run || run.step !== 'encounter' || run.waitingOn !== 'runner' || !run.ice?.cardId) continue;
          const rig: RigIds = Object.fromEntries(v.rig.map((c) => [c.uid, c.cardId]));
          const iceType = getCard(run.ice.cardId)!.subtype;
          for (const o of run.options) {
            const label = optionLabel(o, run, run.options, rig);
            if (o.action.type !== 'use_ability') continue;
            const action = o.action;
            const cardId = rig[action.uid]!;
            const card = getCard(cardId)!;
            seen.add(card.name);
            expect(label.startsWith(`${card.name}: `), label).toBe(true);
            expect(label.endsWith(` · ${payText(o, rig)}`), `${label} ends with its price`).toBe(true);
            const ab = card.abilities![action.ability]!;
            if (ab.op === 'break') {
              const word = ICE_TYPE[ab.iceType];
              expect(label, `${label} names ${word}`).toContain(` ${word} sub`);
              if (iceType) expect(ab.iceType, `${card.name} offered on ${run.ice.cardId}`).toBe(iceType);
              const group = run.options.filter((x) => x.action.type === 'use_ability' && x.action.uid === action.uid && x.action.ability === action.ability);
              const most = Math.max(...group.map((x) => (x.action.type === 'use_ability' ? (x.action.subs?.length ?? 1) : 1)));
              const open = run.ice.subroutines.filter((s) => !s.broken).length;
              if (most >= 2) {
                expect(label, label).toContain(`up to ${most} `);
                upTo++;
              } else expect(label, label).not.toContain('up to');
              if (open === 1) expect(label, `${label}: one open subroutine`).not.toContain('up to');
            } else {
              expect(label, label).toMatch(new RegExp(`^${card.name}: \\+\\d+ str · `));
            }
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
    expect(upTo, 'some Battering Ram "up to 2" seen').toBeGreaterThan(0);
    expect([...seen].sort()).toEqual(['Battering Ram', 'Corroder', 'Pipeline']);
  }, 120_000);
});
