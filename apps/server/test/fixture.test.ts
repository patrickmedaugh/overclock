// The prelude used by scripts/dev-integration.mjs (and usable by e2e) to reach a Corp
// "can only pass" approach under online rules. This test keeps it valid when the engine
// changes; regenerate with UPDATE_FIXTURES=1 npx vitest run test/fixture.test.ts.
import { readFileSync, writeFileSync } from 'node:fs';
import { replay, viewFor, type Action, type DeckSet } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { ONLINE_OPTIONS } from '../src/room';
import { corpOnlyPass, planUntil } from './plans';

const FILE = new URL('./fixtures/corp-only-pass.json', import.meta.url);

describe('fixtures', () => {
  it('corp-only-pass.json reaches an approach where the Corp can only pass (Runner sees "Corp is deciding")', () => {
    if (process.env.UPDATE_FIXTURES === '1') {
      const plan = planUntil(corpOnlyPass);
      writeFileSync(FILE, JSON.stringify({ seed: plan.seed, actions: plan.actions, deckSet: ONLINE_OPTIONS.deckSet }) + '\n');
    }
    // Sprint 12: the fixture names its decks ('core', the 30-card decks it was planned on), so the room
    // (scripts/dev-integration.mjs sends it as `test`) deals the same cards as this replay.
    const f = JSON.parse(readFileSync(FILE, 'utf8')) as { seed: number; actions: Action[]; deckSet: DeckSet };
    expect(f.deckSet).toBe('core');
    const { state, events } = replay(f.seed, f.actions, { ...ONLINE_OPTIONS, deckSet: f.deckSet });
    expect(events.some((e) => e.type === 'action_rejected')).toBe(false);
    expect(corpOnlyPass(state)).toBe(true);
    expect(viewFor('runner', state).run?.waitingOn).toBe('corp');
  });
});
