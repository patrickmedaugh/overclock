// Architect review (Sprint 6): test mode can never be on in production.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { testModeOn } from '../src/config';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('test mode gate', () => {
  it('is on only with OVERCLOCK_TEST_MODE=1 on a dev build', () => {
    expect(testModeOn({ OVERCLOCK_TEST_MODE: '1', BUILD: 'dev' })).toBe(true);
    expect(testModeOn({ OVERCLOCK_TEST_MODE: '0', BUILD: 'dev' })).toBe(false);
    expect(testModeOn({ BUILD: 'dev' })).toBe(false);
    expect(testModeOn({ OVERCLOCK_TEST_MODE: 'true', BUILD: 'dev' })).toBe(false);
    // A deployed build (BUILD = git commit) never runs in test mode, whatever the var says.
    expect(testModeOn({ OVERCLOCK_TEST_MODE: '1', BUILD: 'd47e46c0123456789abcdef0123456789abcdef0' })).toBe(false);
  });

  it('wrangler.jsonc ships with test mode off; the deploy sets BUILD and never touches test mode', () => {
    expect(read('../wrangler.jsonc')).toMatch(/"OVERCLOCK_TEST_MODE":\s*"0"/);
    const deploy = read('../../../.github/workflows/server.yml');
    expect(deploy).toContain('wrangler deploy --var "BUILD:$GITHUB_SHA"');
    expect(deploy).not.toContain('OVERCLOCK_TEST_MODE');
  });
});
