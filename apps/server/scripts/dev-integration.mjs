// Sprint 6 E4: local integration check of the real Worker + Durable Object under `wrangler dev`
// (offline, no Cloudflare account). Two phones play a few moves, a third gets `full`, a bad
// Origin is refused, and after a restart of the server the game is still there.
//
//   npm run test:dev -w apps/server
//
// Env: DEV_PORT (default: a free port). Exits non-zero on the first failed check.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = join(here, '..');
const ORIGIN = 'http://localhost:5173';
const persist = mkdtempSync(join(tmpdir(), 'overclock-dev-'));
let port = Number(process.env.DEV_PORT) || 0;
let child = null;
let failed = false;

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

function check(ok, what) {
  if (!ok) throw new Error(`FAILED: ${what}`);
  console.log(`ok - ${what}`);
}

async function startServer() {
  const args = [
    'wrangler', 'dev', '--port', String(port), '--ip', '127.0.0.1', '--persist-to', persist,
    '--var', 'OVERCLOCK_TEST_MODE:1', '--var', 'ALLOWED_ORIGINS:http://localhost:*,http://127.0.0.1:*',
    '--show-interactive-dev-session=false',
  ];
  child = spawn('npx', args, { cwd: serverDir, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const until = Date.now() + 90_000;
  while (Date.now() < until) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return res.json();
    } catch {
      // not up yet
    }
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`wrangler dev did not start:\n${log}`);
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  const done = new Promise((r) => child.once('exit', r));
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // already gone
  }
  await Promise.race([done, new Promise((r) => setTimeout(r, 5000))]);
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    // already gone
  }
}

/** A phone: a WebSocket with a queue of parsed messages. */
function phone(path, origin = ORIGIN) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers: { Origin: origin } });
  const queue = [];
  const waiters = [];
  const p = {
    ws,
    closed: null,
    opened: new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error(`socket error on ${path}`));
    }),
    send: (msg) => ws.send(typeof msg === 'string' ? msg : JSON.stringify({ v: 1, ...msg })),
    /** The next message (fails after `ms`). */
    next(ms = 5000) {
      if (queue.length) return Promise.resolve(queue.shift());
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`no message on ${path} within ${ms}ms`)), ms);
        waiters.push((m) => {
          clearTimeout(t);
          resolve(m);
        });
      });
    },
    /** Nothing arrives within `ms`. */
    async quiet(ms = 400) {
      await new Promise((r) => setTimeout(r, ms));
      return queue.length === 0;
    },
  };
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data));
    const w = waiters.shift();
    if (w) w(m);
    else queue.push(m);
  };
  ws.onclose = (e) => (p.closed = e.code);
  return p;
}

async function main() {
  if (!port) port = await freePort();
  console.log(`wrangler dev on port ${port}, storage in ${persist}`);
  const health = await startServer();
  check(health.ok === true && health.protocol === 1 && typeof health.build === 'string', `/health → ${JSON.stringify(health)}`);

  // Origin allowlist.
  const evil = phone('/v1/create', 'https://evil.example');
  const refused = await evil.opened.then(() => false, () => true);
  check(refused, 'a page from another origin cannot open a socket');

  // Phone A starts a game as the Corp (test mode: fixed seed).
  const a = phone('/v1/create');
  await a.opened;
  a.send({ t: 'create', side: 'corp', test: { seed: 42, actions: [] } });
  const seatedA = await a.next();
  check(seatedA.t === 'seated' && seatedA.seat === 'corp' && /^[A-Z2-9]{4}$/.test(seatedA.code), `A seated as Corp in game ${seatedA.code}`);
  check((await a.next()).t === 'lobby', 'A waits in the lobby');
  const code = seatedA.code;

  // Phone B joins with the code (lower case, with a dash: normalised).
  const b = phone(`/v1/games/${code.slice(0, 2).toLowerCase()}-${code.slice(2).toLowerCase()}`);
  await b.opened;
  b.send({ t: 'join' });
  const seatedB = await b.next();
  check(seatedB.t === 'seated' && seatedB.seat === 'runner', 'B joined as the Runner');
  const syncB = await b.next();
  const syncA = await a.next();
  check(syncA.t === 'sync' && syncB.t === 'sync' && syncA.seq === 0 && syncB.opponent === 'here', 'both phones get the board');
  check(syncB.view.viewer === 'runner' && syncB.view.players.corp.hand === null, 'B sees only the backs of the Corp hand');

  // A few moves.
  a.send({ t: 'act', id: 1, action: { type: 'gain_credit', player: 'corp' } });
  const upA = await a.next();
  const upB = await b.next();
  check(upA.t === 'update' && upA.seq === 1 && upA.ack === 1, 'A gets its move with ack');
  check(upB.t === 'update' && upB.seq === 1 && !('ack' in upB), 'B sees the move (no ack)');
  a.send({ t: 'act', id: 2, action: { type: 'draw', player: 'corp' } });
  await a.next();
  const drawn = await b.next();
  check(drawn.events.length === 1 && drawn.events[0].type === 'card_drawn' && !('cardId' in drawn.events[0]), "B doesn't learn the Corp's drawn card");
  b.send({ t: 'act', id: 1, action: { type: 'gain_credit', player: 'runner' } });
  const rej = await b.next();
  check(rej.t === 'rejected' && rej.events[0].reason === 'not_your_turn', "B can't move on the Corp's turn");
  check(await a.quiet(), 'A hears nothing about B’s refused move');

  // Ping is answered (by the runtime).
  b.send('{"v":1,"t":"ping"}');
  check((await b.next()).t === 'pong', 'ping → pong');

  // A third phone can't take a seat; unknown / malformed codes.
  const c = phone(`/v1/games/${code}`);
  await c.opened;
  c.send({ t: 'join' });
  const full = await c.next();
  check(full.t === 'error' && full.code === 'full', 'a third phone gets "full"');
  const unknownCode = code === 'ZZZZ' ? 'YYYY' : 'ZZZZ';
  const d = phone(`/v1/games/${unknownCode}`);
  await d.opened;
  d.send({ t: 'join' });
  check((await d.next()).code === 'no_game', 'an unknown code gets "no_game"');
  const e = phone('/v1/games/NOT-A-CODE!');
  await e.opened;
  check((await e.next()).code === 'no_game', 'a malformed code gets "no_game"');

  // The Corp can't pay for the approached ICE: the room passes for it after 1.2–2.4 s (DO alarm).
  const fixture = JSON.parse(readFileSync(join(serverDir, 'test/fixtures/corp-only-pass.json'), 'utf8'));
  const corp = phone('/v1/create');
  await corp.opened;
  corp.send({ t: 'create', side: 'corp', test: fixture });
  const seatedCorp = await corp.next();
  await corp.next(); // lobby
  const runner = phone(`/v1/games/${seatedCorp.code}`);
  await runner.opened;
  runner.send({ t: 'join' });
  await runner.next(); // seated
  const deciding = await runner.next();
  const t0 = Date.now();
  check(deciding.t === 'sync' && deciding.view.run?.waitingOn === 'corp', 'Runner sees the Corp deciding');
  await corp.next(); // sync
  const passed = await runner.next(5000);
  const waited = Date.now() - t0;
  check(passed.t === 'update' && passed.events.some((x) => x.type === 'ice_passed') && !('ack' in passed), `the room passed for the Corp after ${waited} ms`);
  check(waited >= 1000 && waited <= 3500, 'the pause is about 1.2–2.4 s');
  check((await corp.next()).seq === passed.seq, 'the Corp phone sees the same move');
  corp.ws.close();
  runner.ws.close();

  // Presence: B drops, A sees "away".
  b.ws.close();
  const away = await a.next();
  check(away.t === 'presence' && away.opponent === 'away', 'A sees B away');
  a.ws.close();
  const before = drawn.view;

  // Restart the server on the same storage: the game is still there.
  await stopServer();
  await startServer();
  const b2 = phone(`/v1/games/${code}`);
  await b2.opened;
  b2.send({ t: 'resume', token: seatedB.token, since: 2 });
  const back = await b2.next();
  check(back.t === 'sync' && back.seq === 2 && JSON.stringify(back.view) === JSON.stringify(before), 'after a restart B resumes the same game (seq 2, same board)');
  check(back.opponent === 'away', 'A is still away');
  const a2 = phone(`/v1/games/${code}`);
  await a2.opened;
  a2.send({ t: 'resume', token: seatedA.token, since: 2 });
  check((await a2.next()).t === 'sync', 'A resumes');
  check((await b2.next()).opponent === 'here', 'B sees A back');
  a2.send({ t: 'act', id: 3, action: { type: 'gain_credit', player: 'corp' } });
  const up3 = await a2.next();
  check(up3.t === 'update' && up3.seq === 3 && (await b2.next()).seq === 3, 'play goes on (seq 3)');
  const wrong = phone(`/v1/games/${code}`);
  await wrong.opened;
  wrong.send({ t: 'resume', token: 'AAAAAAAAAAAAAAAAAAAAAA', since: 0 });
  check((await wrong.next()).code === 'bad_token', 'a wrong token gets "bad_token"');
  for (const p of [a2, b2, c, d, e, wrong]) p.ws.close();
}

try {
  await main();
  console.log('dev integration: all checks passed');
} catch (err) {
  failed = true;
  console.error(err instanceof Error ? err.message : err);
} finally {
  await stopServer();
  rmSync(persist, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}
