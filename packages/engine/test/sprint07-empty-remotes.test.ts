// Sprint 7 E2 (S-07-1): a remote left with no ICE and no cards disappears (steal, trash, score);
// one with ICE stays and takes installs; ids are never reused. Reached by real play only.
import { describe, expect, it } from 'vitest';
import { apply, viewEvents, viewFor, type Action, type GameState, type ServerId } from '../src/index';
import { handOptions } from '../src/apply';
import { finishTurn, run, withHand, withPlayer, newGame } from './helpers';

const install = (handIndex: number, server: ServerId | 'new'): Action => ({ type: 'install', player: 'corp', handIndex, server });
const runOn = (server: ServerId): Action => ({ type: 'run', player: 'runner', server });
const pass = (player: 'corp' | 'runner'): Action => ({ type: 'pass', player });
const ids = (s: GameState) => s.servers.map((sv) => sv.id);

/** Corp turn 1 on seed 21 with `hand`, playing `actions`; then the Runner's turn starts. */
function corpThenRunner(hand: string[], actions: Action[]): GameState {
  const s = run(withHand(newGame(21), 'corp', hand), actions).state;
  return finishTurn(s).state;
}

describe('S-07-1: empty remotes disappear', () => {
  // remote1: Hostile Takeover, remote2: PAD Campaign, remote3: Private Security Force (no ICE anywhere).
  const start = () => corpThenRunner(['c08', 'c03', 'c09'], [install(0, 'new'), install(0, 'new'), install(0, 'new')]);

  it('AC1: the Runner steals the only card of an ICE-less remote: run_ended, then server_removed; gone for both', () => {
    const s = start();
    expect(ids(s)).toEqual(['hq', 'rd', 'archives', 'remote1', 'remote2', 'remote3']);
    const r = run(s, [runOn('remote1'), { type: 'steal', player: 'runner', card: 0 }]);
    expect(r.events.slice(-3)).toEqual([
      { type: 'agenda_stolen', cardId: 'c08', points: 1 },
      { type: 'run_ended', server: 'remote1', outcome: 'accessed' },
      { type: 'server_removed', server: 'remote1' },
    ]);
    for (const side of ['corp', 'runner'] as const) {
      expect(viewFor(side, r.state).corpServers.map((sv) => sv.id)).toEqual(['hq', 'rd', 'archives', 'remote2', 'remote3']);
      expect(viewEvents(side, r.events)).toContainEqual({ type: 'server_removed', server: 'remote1' });
    }
    // The Runner can no longer run on it.
    expect(viewFor('runner', r.state).runOptions.map((o) => (o.action as { server: string }).server)).not.toContain('remote1');
  });

  it('AC1: the Runner trashes the only card (PAD Campaign): the server goes too', () => {
    const r = run(start(), [runOn('remote2'), { type: 'trash', player: 'runner', card: 0 }]);
    expect(r.events.slice(-3)).toEqual([
      { type: 'card_trashed', cardId: 'c03', from: 'remote', uid: 'i2' },
      { type: 'run_ended', server: 'remote2', outcome: 'accessed' },
      { type: 'server_removed', server: 'remote2' },
    ]);
    expect(ids(r.state)).toEqual(['hq', 'rd', 'archives', 'remote1', 'remote3']);
  });

  it('a card left in place (Leave it) keeps the server', () => {
    const r = run(start(), [runOn('remote2'), pass('runner')]);
    expect(r.events.map((e) => e.type)).not.toContain('server_removed');
    expect(ids(r.state)).toContain('remote2');
  });

  it('AC2: the Corp scores the only agenda of an ICE-less remote: the server goes (after the bonus)', () => {
    let s = withPlayer(withHand(newGame(21), 'corp', ['c08']), 'corp', { credits: 5 });
    s = run(s, [install(0, 'new'), { type: 'advance', player: 'corp', uid: 'i1' }, { type: 'advance', player: 'corp', uid: 'i1' }]).state;
    const r = apply(s, { type: 'score', player: 'corp', uid: 'i1' });
    expect(r.events).toEqual([
      { type: 'agenda_scored', uid: 'i1', cardId: 'c08', points: 1 },
      { type: 'credit_gained', player: 'corp', amount: 7 },
      { type: 'bad_publicity_gained', amount: 1, total: 1 },
      { type: 'server_removed', server: 'remote1' },
    ]);
    expect(ids(r.state)).toEqual(['hq', 'rd', 'archives']);
    expect(viewFor('runner', r.state).corpServers.map((sv) => sv.id)).toEqual(['hq', 'rd', 'archives']);
  });

  it('AC3 + AC5: after removals, an agenda is offered only "new" (no gap); others keep their names; the next server gets a new number', () => {
    let s = run(start(), [runOn('remote1'), { type: 'steal', player: 'runner', card: 0 }]).state;
    s = run(s, [runOn('remote2'), { type: 'trash', player: 'runner', card: 0 }]).state;
    expect(ids(s)).toEqual(['hq', 'rd', 'archives', 'remote3']);
    expect(s.nextRemote).toBe(4); // never reused
    s = finishTurn(s).state; // Corp turn 3
    s = withHand(s, 'corp', ['c10', 'c04']);
    const agendaTargets = handOptions(s, 'corp')[0]!.map((o) => (o.action as { server: string }).server);
    expect(agendaTargets).toEqual(['new']); // remote3 holds an agenda already; remote1/2 are gone
    const iceTargets = handOptions(s, 'corp')[1]!.map((o) => (o.action as { server: string }).server);
    expect(iceTargets).toEqual(['hq', 'rd', 'archives', 'remote3', 'new']);
    const r = apply(s, install(0, 'new'));
    expect(r.events[0]).toEqual({ type: 'server_created', server: 'remote4' });
    expect(ids(r.state)).toEqual(['hq', 'rd', 'archives', 'remote3', 'remote4']);
  });

  it('AC4: a remote with ICE stays when its last card is stolen, and the Corp can install into it again', () => {
    // remote1: Wall of Static (ICE) + Hostile Takeover.
    let s = corpThenRunner(['c04', 'c08'], [install(0, 'new'), install(0, 'remote1')]);
    const r = run(s, [runOn('remote1'), pass('corp'), pass('runner'), { type: 'steal', player: 'runner', card: 0 }]);
    expect(r.events.at(-1)).toEqual({ type: 'run_ended', server: 'remote1', outcome: 'accessed' });
    expect(r.events.map((e) => e.type)).not.toContain('server_removed');
    s = r.state;
    expect(s.servers.find((sv) => sv.id === 'remote1')).toMatchObject({ content: [], ice: [{ cardId: 'c04' }] });
    s = withHand(finishTurn(s).state, 'corp', ['c09']);
    const opt = handOptions(s, 'corp')[0]!.find((o) => o.action.type === 'install' && o.action.server === 'remote1');
    expect(opt).toEqual({ action: install(0, 'remote1'), cost: 0, reject: null });
    const after = apply(s, install(0, 'remote1'));
    expect(after.state.servers.find((sv) => sv.id === 'remote1')!.content.map((c) => c.cardId)).toEqual(['c09']);
  });

  it('a run ended by ICE or jacked out never removes a server that still has ICE', () => {
    let s = corpThenRunner(['c04'], [install(0, 'new')]);
    s = run(s, [runOn('remote1'), pass('corp'), { type: 'jack_out', player: 'runner' }]).state;
    expect(ids(s)).toContain('remote1');
  });
});
