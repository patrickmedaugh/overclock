// Sprint 9 E4 (S-09-2): tags — shown to both players, they stay until removed; the tagged Runner's
// resources can be trashed by the Corp (1 click + 2 credits); the Runner removes a tag for 1 click + 2 credits.
import { describe, expect, it } from 'vitest';
import { apply, hasMeaningfulResponse, legalActions, viewFor, type Action, type GameState } from '../src/index';
import { act, board, finishTurn, liveness, rejection, withPlayer } from './helpers';
import { expectRunnerEventsClean, expectRunnerViewClean } from './hidden';

const CORE = { deckSet: 'core' } as const;
const removeTag: Action = { type: 'remove_tag', player: 'runner' };
const trashRes = (uid: string): Action => ({ type: 'trash_resource', player: 'corp', uid });

/** Runner's turn (Kate) with rig i1 Armitage Codebusting (12 credits), i2 Corroder, i3 Access to Globalsec. */
function runnerTurn(tags: number, patch: { credits?: number; clicks?: number } = {}): GameState {
  const s = board({ rig: ['r02', 'r04', 'r18'], runnerCredits: patch.credits ?? 5, runnerClicks: patch.clicks ?? 4 }, 77, CORE);
  const withHosted = { ...s, rig: s.rig.map((c) => (c.uid === 'i1' ? { ...c, hostedCredits: 12 } : c)) };
  return withPlayer(withHosted, 'runner', { tags });
}

/** The Corp's next turn (3 clicks) after `runnerTurn`. */
function corpTurn(tags: number, credits = 5): GameState {
  const s = finishTurn(runnerTurn(tags)).state;
  expect(s.activePlayer).toBe('corp');
  return withPlayer(s, 'corp', { credits });
}

describe('S-09-2 AC1: the Runner’s tags are public', () => {
  it('both views show tags and link (Kate 1 + Access to Globalsec 1 = 2)', () => {
    const s = runnerTurn(1);
    for (const viewer of ['corp', 'runner'] as const) {
      expect(viewFor(viewer, s).players.runner).toMatchObject({ tags: 1, link: 2 });
      expect(viewFor(viewer, s).players.corp).toMatchObject({ tags: 0, link: 0 });
    }
  });
});

describe('S-09-2 AC2/AC3: the Corp trashes a tagged Runner’s resource (1 click + 2 credits)', () => {
  it('tagged: each Runner resource gets a "trash_resource" option (cost 2, 1 click); programs do not', () => {
    const v = viewFor('corp', corpTurn(1));
    expect(v.installedOptions['i1']).toEqual([{ action: trashRes('i1'), cost: 2, clicks: 1, reject: null }]);
    expect(v.installedOptions['i3']).toEqual([{ action: trashRes('i3'), cost: 2, clicks: 1, reject: null }]);
    expect(v.installedOptions['i2']).toBeUndefined();
    expect(legalActions(corpTurn(1), 'corp')).toContainEqual(trashRes('i1'));
    // The Runner's own view keeps only his own abilities on these cards.
    expect(viewFor('runner', corpTurn(1)).installedOptions['i1']?.map((o) => o.action.type)).toEqual(['activate']);
  });

  it('trashing Armitage Codebusting: it goes face up to the Heap with its credits; the Corp pays 1 click + 2 credits', () => {
    const r = act(corpTurn(1), trashRes('i1'));
    expect(r.events).toEqual([
      { type: 'credits_spent', player: 'corp', amount: 2 },
      { type: 'rig_card_trashed', uid: 'i1', cardId: 'r02', cause: 'tagged' },
    ]);
    expect(r.state.rig.map((c) => c.uid)).toEqual(['i2', 'i3']);
    expect(r.state.players.runner.discard.at(-1)).toEqual({ cardId: 'r02', faceUp: true });
    expect(r.state.players.corp).toMatchObject({ credits: 3, clicks: 2 });
    // Trashing does not remove the tag.
    expect(r.state.players.runner.tags).toBe(1);
    expectRunnerEventsClean(r.events, 'trash resource', r.state);
    expectRunnerViewClean(r.state, 'trash resource');
    liveness(r.state);
  });

  it('trashing Access to Globalsec lowers the link at once', () => {
    const r = act(corpTurn(1), trashRes('i3'));
    expect(viewFor('runner', r.state).players.runner.link).toBe(1);
  });

  it('AC3 (automated check): not tagged: no trash option on any Runner card; the action is refused condition_not_met', () => {
    const s = corpTurn(0);
    const v = viewFor('corp', s);
    for (const uid of ['i1', 'i2', 'i3']) expect(v.installedOptions[uid], uid).toBeUndefined();
    expect(legalActions(s, 'corp').some((a) => a.type === 'trash_resource')).toBe(false);
    expect(rejection(apply(s, trashRes('i1')).events)).toBe('condition_not_met');
  });

  it('refusals: a program bad_target; 1 credit no_credits (option dimmed); no clicks no_clicks; the Runner sending it not_your_turn', () => {
    expect(rejection(apply(corpTurn(1), trashRes('i2')).events)).toBe('bad_target');
    const poor = corpTurn(1, 1);
    expect(viewFor('corp', poor).installedOptions['i1']).toEqual([{ action: trashRes('i1'), cost: 2, clicks: 1, reject: 'no_credits' }]);
    expect(rejection(apply(poor, trashRes('i1')).events)).toBe('no_credits');
    expect(rejection(apply(withPlayer(corpTurn(1), 'corp', { clicks: 0 }), trashRes('i1')).events)).toBe('no_clicks');
    expect(rejection(apply(corpTurn(1), { type: 'trash_resource', player: 'runner', uid: 'i1' }).events)).toBe('not_your_turn');
    // On the Runner's turn the Corp's options stay listed with the reason.
    expect(viewFor('corp', runnerTurn(1)).installedOptions['i1']).toEqual([{ action: trashRes('i1'), cost: 2, clicks: 1, reject: 'not_your_turn' }]);
  });
});

describe('S-09-2 AC4: the Runner removes a tag (1 click + 2 credits)', () => {
  it('tagged: basicOptions lists Remove 1 tag (cost 2, 1 click); using it lowers the count by 1', () => {
    const s = runnerTurn(2);
    expect(viewFor('runner', s).basicOptions).toEqual([{ action: removeTag, cost: 2, clicks: 1, reject: null }]);
    expect(viewFor('corp', s).basicOptions).toEqual([]);
    expect(legalActions(s, 'runner')).toContainEqual(removeTag);
    const r = act(s, removeTag);
    expect(r.events).toEqual([
      { type: 'credits_spent', player: 'runner', amount: 2 },
      { type: 'tags_changed', amount: -1, tags: 1 },
    ]);
    expect(r.state.players.runner).toMatchObject({ tags: 1, credits: 3, clicks: 3 });
    const r2 = act(r.state, removeTag);
    expect(r2.state.players.runner.tags).toBe(0);
    // Untagged: the option goes away.
    expect(viewFor('runner', r2.state).basicOptions).toEqual([]);
    expect(rejection(apply(r2.state, removeTag).events)).toBe('condition_not_met');
  });

  it('dimmed with the reason: too few credits (no_credits), no clicks left (no_clicks), the Corp’s turn (not_your_turn)', () => {
    expect(viewFor('runner', runnerTurn(1, { credits: 1 })).basicOptions).toEqual([{ action: removeTag, cost: 2, clicks: 1, reject: 'no_credits' }]);
    expect(viewFor('runner', runnerTurn(1, { clicks: 0 })).basicOptions).toEqual([{ action: removeTag, cost: 2, clicks: 1, reject: 'no_clicks' }]);
    expect(viewFor('runner', corpTurn(1)).basicOptions).toEqual([{ action: removeTag, cost: 2, clicks: 1, reject: 'not_your_turn' }]);
    expect(hasMeaningfulResponse(corpTurn(1), 'runner')).toBe(false);
  });

  it('not during a run (wrong_phase)', () => {
    const s0 = board({ servers: { hq: { ice: ['+c04'] } }, runnerCredits: 5 }, 77, CORE);
    const s = act(withPlayer(s0, 'runner', { tags: 1 }), { type: 'run', player: 'runner', server: 'hq' }).state;
    expect(s.phase).toBe('run');
    expect(rejection(apply(s, removeTag).events)).toBe('wrong_phase');
  });
});

describe('S-09-2 AC5: tags stay until removed (automated check)', () => {
  it('tags survive both players’ turns', () => {
    let s = runnerTurn(2);
    for (let k = 0; k < 4; k++) {
      s = finishTurn(s).state;
      expect(s.players.runner.tags, `after turn ${s.turn - 1}`).toBe(2);
    }
  });
});
