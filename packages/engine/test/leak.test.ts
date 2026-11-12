// S-02-1 AC6 / S-02-2 AC5: the Runner's side of the game never receives the
// ids of face-down Corp cards. Corp installables (agendas, assets, upgrades,
// ICE) can't be revealed by anything built this sprint (no rez, runs or
// trashing), so those ids must never appear in anything the Runner gets.
import { describe, expect, it } from 'vitest';
import { getCard } from '@overclock/cards';
import { apply, legalActions, newGame, viewEvents, viewFor, type Action, type GameState, type InstallTarget } from '../src/index';
import { run, withClicks, withHand } from './helpers';

const HIDDEN_IDS = ['c03', 'c04', 'c05', 'c06', 'c07', 'c08', 'c09', 'c10', 'c11'];
const hiddenIdPattern = new RegExp(`"(${HIDDEN_IDS.join('|')})"`);

function picker(seed: number): (n: number) => number {
  let s = seed >>> 0;
  return (n) => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s % n;
  };
}

describe('leak test: the Runner never sees face-down Corp card ids', () => {
  it('the hidden ids are exactly the Corp installables', () => {
    expect(HIDDEN_IDS.every((id) => ['agenda', 'asset', 'upgrade', 'ice'].includes(getCard(id)?.type ?? ''))).toBe(true);
  });

  it('scripted: installs into new servers, remotes and centrals stay hidden in view and events', () => {
    let s: GameState = withHand(newGame(15), 'corp', ['c08', 'c05', 'c11', 'c04', 'c06', 'c03']);
    const install = (handIndex: number, server: InstallTarget): Action => ({ type: 'install', player: 'corp', handIndex, server });
    const script = [install(0, 'new'), install(0, 'remote-1'), install(0, 'hq')];
    const runnerSaw: unknown[] = [];
    for (const a of script) {
      const r = run(s, [a]);
      s = r.state;
      runnerSaw.push(viewEvents('runner', r.events), viewFor('runner', s));
    }
    const json = JSON.stringify(runnerSaw);
    expect(json).not.toMatch(hiddenIdPattern);
    // ...while the Runner still sees where and how many.
    const rv = viewFor('runner', s);
    expect(rv.servers.map((x) => [x.id, x.ice.length, x.root.length])).toEqual([
      ['hq', 0, 1],
      ['rd', 0, 0],
      ['archives', 0, 0],
      ['remote-1', 1, 1],
    ]);
    expect(rv.servers[3]?.ice[0]).toEqual({ uid: 'i2', cardId: null, faceUp: false });
    expect(viewEvents('runner', apply(withClicks(s, 'corp', 1), install(0, 'new')).events)).toEqual([
      { type: 'server_created', serverId: 'remote-2', remote: 2 },
      { type: 'card_installed', player: 'corp', uid: 'i4', server: 'remote-2', slot: 'ice', index: 0 },
    ]);
    // The Corp sees its own cards (face down) and full events.
    const cv = viewFor('corp', s);
    expect(cv.servers[3]?.root[0]).toEqual({ uid: 'i1', cardId: 'c08', faceUp: false });
  });

  it('random games (installs, plays, discards): no hidden id ever reaches the Runner', () => {
    let installs = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const pick = picker(seed * 31 + 7);
      let s = newGame(seed);
      const seen: string[] = [JSON.stringify(viewFor('runner', s))];
      for (let step = 0; step < 400 && s.phase !== 'over'; step++) {
        const options = legalActions(s, s.activePlayer);
        // Prefer installs/plays so the board fills up.
        const busy = options.filter((a) => a.type === 'install' || a.type === 'play');
        const pool = busy.length > 0 && pick(4) > 0 ? busy : options;
        const a = pool[pick(pool.length)]!;
        if (a.type === 'install' && a.player === 'corp') installs++;
        const r = apply(s, a);
        s = r.state;
        seen.push(JSON.stringify(viewEvents('runner', r.events)), JSON.stringify(viewFor('runner', s)));
      }
      for (const chunk of seen) expect(chunk).not.toMatch(hiddenIdPattern);
    }
    expect(installs).toBeGreaterThan(100);
  });

  it('positive control: the same ids do show up in the Corp view and raw events', () => {
    const s = withHand(newGame(15), 'corp', ['c08']);
    const r = apply(s, { type: 'install', player: 'corp', handIndex: 0, server: 'new' });
    expect(JSON.stringify(viewFor('corp', r.state))).toMatch(hiddenIdPattern);
    expect(JSON.stringify(r.events)).toMatch(hiddenIdPattern);
  });
});
