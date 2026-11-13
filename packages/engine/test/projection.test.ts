// Sprint 3 E6: viewEvents projections for every event type. The sample table is a
// Record over GameEvent['type'], so a new event without a projection test is a type error.
import { describe, expect, it } from 'vitest';
import { viewEvents, type GameEvent, type Side } from '../src/index';

type Samples = { [T in GameEvent['type']]: Extract<GameEvent, { type: T }>[] };

const SAMPLES: Samples = {
  card_drawn: [{ type: 'card_drawn', player: 'corp', cardId: 'c01' }],
  credit_gained: [{ type: 'credit_gained', player: 'runner', amount: 1 }],
  discard_required: [{ type: 'discard_required', player: 'corp', count: 1 }],
  cards_discarded: [{ type: 'cards_discarded', player: 'corp', count: 1, handIndices: [0], cardIds: ['c02'] }],
  turn_ended: [{ type: 'turn_ended', player: 'corp' }],
  turn_started: [{ type: 'turn_started', player: 'runner', turn: 2, clicks: 4 }],
  game_over: [
    { type: 'game_over', winner: 'runner', reason: 'agenda_points' },
    { type: 'game_over', winner: 'corp', reason: 'flatline' },
  ],
  action_rejected: [{ type: 'action_rejected', reason: 'too_weak' }],
  credits_spent: [
    { type: 'credits_spent', player: 'corp', amount: 3 },
    { type: 'credits_spent', player: 'runner', amount: 2, temp: 1 },
  ],
  server_created: [{ type: 'server_created', server: 'remote1' }],
  card_installed: [{ type: 'card_installed', player: 'corp', uid: 'i1', zone: 'ice', server: 'hq', handIndex: 0, cardId: 'c04' }],
  card_played: [{ type: 'card_played', player: 'runner', cardId: 'r07', handIndex: 0 }],
  run_started: [
    { type: 'run_started', server: 'hq' },
    { type: 'run_started', server: 'rd', cardId: 'r07' },
  ],
  ice_approached: [{ type: 'ice_approached', uid: 'i1', position: 0 }],
  ice_rezzed: [{ type: 'ice_rezzed', uid: 'i1', cardId: 'c04' }],
  ice_encountered: [{ type: 'ice_encountered', uid: 'i1' }],
  ice_bypassed: [{ type: 'ice_bypassed', uid: 'i1' }],
  strength_changed: [{ type: 'strength_changed', uid: 'i2', strength: 3 }],
  subroutine_broken: [{ type: 'subroutine_broken', iceUid: 'i1', sub: 0, breakerUid: 'i2' }],
  subroutine_fired: [{ type: 'subroutine_fired', iceUid: 'i1', sub: 1 }],
  clicks_lost: [{ type: 'clicks_lost', player: 'runner', amount: 1 }],
  net_damage: [{ type: 'net_damage', amount: 3, cardIds: ['r01', 'r02', 'r03'] }],
  ice_passed: [{ type: 'ice_passed', uid: 'i1' }],
  run_successful: [{ type: 'run_successful', server: 'archives' }],
  card_accessed: [
    { type: 'card_accessed', cardId: 'c08', from: 'hq' },
    { type: 'card_accessed', cardId: 'c08', from: 'rd' },
    { type: 'card_accessed', cardId: 'c08', from: 'archives' },
    { type: 'card_accessed', cardId: 'c08', from: 'remote', uid: 'i3' },
  ],
  agenda_stolen: [{ type: 'agenda_stolen', cardId: 'c09', points: 2 }],
  card_trashed: [{ type: 'card_trashed', cardId: 'c03', from: 'remote', uid: 'i4' }],
  run_ended: [{ type: 'run_ended', server: 'hq', outcome: 'ended_by_ice' }],
  card_advanced: [{ type: 'card_advanced', uid: 'i5', advancements: 2 }],
  agenda_scored: [{ type: 'agenda_scored', uid: 'i5', cardId: 'c08', points: 1 }],
  bad_publicity_gained: [{ type: 'bad_publicity_gained', amount: 1, total: 2 }],
  choice_opened: [{ type: 'choice_opened', kind: 'free_rez', player: 'corp', cardId: 'c10' }],
  choice_closed: [
    { type: 'choice_closed', kind: 'free_rez', skipped: true },
    { type: 'choice_closed', kind: 'free_rez', skipped: false },
  ],
  temp_credits_gained: [{ type: 'temp_credits_gained', amount: 1 }],
  temp_credits_lost: [{ type: 'temp_credits_lost', amount: 1 }],
};

/** Sprint 1/2 events have their own projection tests (view.test.ts, install-play.test.ts). */
const OLDER = new Set(['card_drawn', 'cards_discarded', 'card_installed', 'card_played']);

describe('viewEvents for the Sprint 3 and 4 events', () => {
  const sides: Side[] = ['corp', 'runner'];
  const sprint3 = (Object.entries(SAMPLES) as [string, GameEvent[]][]).filter(([t]) => !OLDER.has(t));

  it.each(sprint3)('%s is public to both sides (unchanged)', (type, events) => {
    for (const side of sides) {
      for (const e of events) {
        if (type === 'card_accessed' && side === 'corp' && e.type === 'card_accessed' && e.from === 'rd') continue;
        expect(viewEvents(side, [e])).toEqual([e]);
      }
    }
  });

  it('card_accessed from R&D loses cardId for the Corp only (deck order is hidden from the Corp too)', () => {
    const e: GameEvent = { type: 'card_accessed', cardId: 'c08', from: 'rd' };
    expect(viewEvents('corp', [e])).toEqual([{ type: 'card_accessed', from: 'rd' }]);
    expect(viewEvents('runner', [e])).toEqual([e]);
  });

  it('projection never mutates its input', () => {
    const all = Object.values(SAMPLES).flat() as GameEvent[];
    const copy = JSON.parse(JSON.stringify(all));
    viewEvents('corp', all);
    viewEvents('runner', all);
    expect(all).toEqual(copy);
  });
});
