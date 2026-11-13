/**
 * Pure reading of the Worker's vars (no `cloudflare:` imports, so Vitest can check it).
 *
 * Test mode lets `create` pick the seed and replay a prelude of actions. It is on only
 * when `OVERCLOCK_TEST_MODE` is `'1'` **and** `BUILD` is `'dev'` (local `wrangler dev`):
 * every deploy sets `BUILD` to the git commit (server.yml), so even a mistaken
 * `OVERCLOCK_TEST_MODE` in production can't switch it on (architect review, Sprint 6).
 */
export function testModeOn(env: { OVERCLOCK_TEST_MODE?: string; BUILD: string }): boolean {
  return env.OVERCLOCK_TEST_MODE === '1' && env.BUILD === 'dev';
}
