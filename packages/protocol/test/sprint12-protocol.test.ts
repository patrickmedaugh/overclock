// Sprint 12 E5: test-mode `create.test.deckSet` accepts 'core45' (the new default decks) next to 'core' (the
// 30-card fixture) and 'starter'; anything else is a bad message. PROTOCOL_VERSION stays 1 (additive).
import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, encodeMsg, parseClientMsg, type ClientMsg } from '../src/index';

describe('Sprint 12: create.test.deckSet', () => {
  it('PROTOCOL_VERSION stayed 1 in Sprint 12 (additive); Sprint 14 made it 2', () => {
    expect(PROTOCOL_VERSION).toBe(2);
  });

  it.each(['core45', 'core', 'starter'] as const)('%s round-trips', (deckSet) => {
    const m: ClientMsg = { v: 2, t: 'create', side: 'corp', test: { seed: 7, actions: [], deckSet } };
    expect(parseClientMsg(encodeMsg(m))).toEqual({ ok: true, msg: m });
  });

  it('an unknown deck set is a bad message', () => {
    const raw = JSON.stringify({ v: 2, t: 'create', side: 'corp', test: { seed: 7, actions: [], deckSet: 'core30' } });
    expect(parseClientMsg(raw)).toEqual({ ok: false, error: 'bad_message' });
  });
});
