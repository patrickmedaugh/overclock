# Sprint 6 tech plan (architect)

Scope: S-06-1..5 (start/join by code, two-phone game, come back, service goes live, pass-the-phone cover). Owner answers: Cloudflare free plan, private code-only games, the starter picks the side (DECISIONS 2026-11-13). engine-dev (`sprint-06-engine`) and ui-dev (`sprint-06-ui`) start **at the same time** in separate worktrees; only U3/U4/U5 wait on E1. Contract changes go through the architect.

## Architecture
- **`packages/protocol`** (new, pure TS, depends on engine *types* only): message types, `PROTOCOL_VERSION = 1`, `parseClientMsg` / `parseServerMsg` (shape checks, never throw, max 8 KB), game-code helpers. Imported by server and client.
- **`apps/server`** (new): Cloudflare Worker + one SQLite-backed Durable Object (`GameRoom`) per game (free plan supports only SQLite DOs). `src/room.ts` = **pure room logic** (no `cloudflare:` imports; clock, random and storage injected) wrapping `LocalMatch`; `src/do.ts` + `src/worker.ts` = thin wrapper (WebSocket hibernation API, storage, alarm). Deps pinned exactly: `wrangler@4.162.0` (needs Node ≥ 22.12), `@cloudflare/workers-types@5.20261113.1`. Verified in this sandbox: install works through the proxy, `wrangler dev` runs a DO + WebSocket offline with no account, and `LocalMatch` bundles (64 KB) and runs in workerd.
- Routes: `GET /health` → `{ok, build, protocol}`; WebSocket `GET /v1/create` (Worker picks a free code, forwards to that DO) and `GET /v1/games/<CODE>`. Origin allowlist from `ALLOWED_ORIGINS` var (Pages, Netlify, `https://localhost` for the app, `http://localhost:*` in dev). WebSockets only: no HTTP API, so no CORS.
- **Game code**: 4 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O/1/I/L; 31⁴ ≈ 920k). Input normalised: upper-case, spaces/dashes dropped. DO = `idFromName(code)`; create retries up to 5 codes if the room is in use.
- **Seat token**: 128-bit random (`crypto.getRandomValues`, base64url) per seat; the DO stores only its SHA-256. Sent in the first message, never in a URL. Client keeps `localStorage['overclock.online.v1'] = {server, code, seat, token}`.
- **Persistence** (DO storage): `meta` {code, seed, hostSide, tokenHashes, options, createdAt, lastActive, build}, `state` (GameState snapshot), `a:<seq 6 digits>` (accepted actions). One `put({...})` per accepted action (3 rows). Restore on wake: snapshot if `meta.build` = current build, else `replay(seed, actions, options)` (a deploy mid-game keeps the game going under the new code).
- **Cleanup** (single DO alarm; room returns `nextWakeAt()`): lobby with no joiner 2 h, idle game 3 days, finished game 1 h → `storage.deleteAll()`, sockets closed with `expired`; the code is free again.
- **Free plan**: hibernation (`ctx.acceptWebSocket(ws, [seat])`) + `setWebSocketAutoResponse` for ping/pong so idle games cost no duration; a ~400-action game ≈ 1.2k rows written (100k/day free). Seeds come from the Worker's `crypto`, not the engine.

## Protocol v1 (pinned; `packages/protocol/src/index.ts`, README "Sprint 6 interface")
Every message is JSON with `v: 1` and `t`. Client → server:
`{t:'create', side: Side, test?: {seed, actions}}` (on `/v1/create`; `test` honoured only when `OVERCLOCK_TEST_MODE=1`) · `{t:'join'}` (claims the empty seat) · `{t:'resume', token, since: number}` · `{t:'act', id: number, action: Action}` · ping = exact string `{"v":1,"t":"ping"}` (auto-answered `{"v":1,"t":"pong"}`).
Server → client:
`{t:'seated', code, seat, token}` (after create/join; the client stores it) · `{t:'lobby', code, seat}` (waiting for the joiner) · `{t:'sync', seq, view: PlayerView, opponent: Presence}` (full state, no animation: on start, resume, gap) · `{t:'update', seq, view, events: GameEvent[], ack?: id}` (one per accepted action; `events` = `viewEvents(seat, …)`; `ack` only to the submitter) · `{t:'rejected', ack, view, events}` (submitter only; seq unchanged) · `{t:'presence', opponent: Presence}` · `{t:'error', code: 'no_game'|'full'|'bad_token'|'version'|'bad_message'|'expired'|'replaced'}`.
`Presence = 'none' | 'here' | 'away'`. `seq` = accepted actions so far. A client that sees `seq ≠ last + 1` sends `resume{since}` and gets `sync`. A second socket for the same seat replaces the first (`replaced`). A third phone's `join` on a full game gets `full`; only a valid token can resume a seat. **Nothing goes to a seat except `viewFor(seat)` / `viewEvents(seat)` output and the fields above.**

## Rez-window leak (S-06-2 AC5) — engine option
`newGame(seed, options?: GameOptions)`, `GameOptions = { rezWindow: 'affordable' | 'always' }` (default `'affordable'` = today), stored in `GameState.options`; `replay(seed, actions, options?)`, `new LocalMatch(seed, options?)`, `LocalMatch.restore(seed, actions, options?)`. With `'always'` the approach of any unrezzed ICE waits on the Corp; the Corp's `run.options` = `rez` (reject `no_credits` when unaffordable) + `pass`. Online games use `'always'`; hot-seat keeps `'affordable'`. The **room** (not engine, not client) answers `pass` for the Corp after a random 1.2–2.4 s when the Corp's only legal action is `pass` at approach (alarm-driven, server randomness; the logged action is a plain `pass`). The Corp may tap Don't rez sooner. The Runner sees `run.waitingOn = 'corp'` → "Corp is deciding…".

## Client
- `Session` interface (`apps/client/src/session.ts`): `kind`, `seat` (bottom), `view()`, `decision()`, `submit(action)`, `onPresent(cb)`, `lastEvents()`, `status()`. `HotSeat` implements it (calls `cb` synchronously, timing unchanged); `OnlineMatch` implements it over the protocol. The board talks only to `Session`. No rules in either: both only forward views/events.
- Start screen: DOM overlay (needs a real text field for the code): **Play on this phone** / **Play online** → **Start a game** (Corp / Runner) → code + **Share** + "Waiting for the other player…"; **Join** + code field; **Rejoin game K7QF** when a stored seat exists (dropped on `no_game`/`expired`/game over). `?join=CODE` joins at load. Share = `navigator.share` (fallback: copy). Share URL = current page in the web build, `OVERCLOCK_WEB_URL` in the app.
- Online board: own seat always at the bottom; "Corp's turn" / "Corp is deciding…" / "Waiting for the other player to come back…" banners (non-blocking); game over → **Back to start**. Taps get instant press feedback; input for that control locks until `ack` (5 s timeout → reconnect).
- Reconnect: backoff 0.5, 1, 2, 4, 8 s (cap 10 s, jitter); immediately on `visibilitychange`/Capacitor `resume`; ping every 20 s while visible, no pong in 10 s → reconnect. Android Back in an online game: "Leave the game?" Leave → start screen (seat kept for Rejoin).
- Build config: `OVERCLOCK_SERVER_URL` (e.g. `wss://overclock.<sub>.workers.dev`) and `OVERCLOCK_WEB_URL` at build time (web + android). Unset → **Play online** says "Online play isn't set up yet". CSP `connect-src 'self' <that wss origin>` only. `check-android-bundle` allows exactly that origin.
- **S-06-5** (hot-seat only): opaque cover on every `handoff` and when the Corp's rez decision opens/closes ("Pass the phone to the Corp/Runner. Tap when ready"); the next board is drawn behind the cover, so the tap only removes it (< 100 ms).

## Tasks
| # | Owner | Depends | Task |
|---|---|---|---|
| E1 | engine-dev | — | `packages/protocol` (types, parsers, code helpers + tests), `GameOptions` types, README "Sprint 6 interface", stubs. **Push first.** |
| E2 | engine-dev | E1 | `rezWindow: 'always'` + LocalMatch options/restore. Tests: window opens when unaffordable, `rez` rejects `no_credits`; **Runner view + events identical** for cheap vs. unaffordable face-down ICE (AC5); replay with options; default unchanged. RULES_SPEC note. |
| E3 | engine-dev | E1, E2 | `apps/server/src/room.ts` + Vitest: create/join/full/resume/bad token/replaced, seq + `sync` on gap, rejections to submitter only, presence, auto-pass timing, TTL wake-ups, restore by snapshot and by replay. **Leak test**: random games through the room; every Runner message equals the projection and names no hidden Corp card (reuse the `hidden.ts` checks via `@overclock/match/testing`). |
| E4 | engine-dev | E3 | DO + Worker + `wrangler.jsonc` (migration `v1`, `new_sqlite_classes: ["GameRoom"]`), `/health`, Origin check, test-mode gate. `npm run test:dev -w apps/server`: starts `wrangler dev`, two WS clients play a few actions, a third gets `full`, restart keeps the game. `apps/server/README.md`: owner steps (sign up, API token "Edit Cloudflare Workers" template, account id, GitHub secrets, variable). |
| U1 | ui-dev | — | `Session` refactor (HotSeat behind it; existing e2e unchanged), start screen, `?join=`, plain-language texts. |
| U2 | ui-dev | — | S-06-5 cover screen + e2e (cover hides cards, tap → board < 100 ms). |
| U3 | ui-dev | E1 | `OnlineMatch` (protocol client, storage, reconnect, ping) + unit tests with a fake WebSocket. |
| U4 | ui-dev | U1, U3 | Online board states, Corp rez with dimmed Rez, game over, Android Back/resume. |
| U5 | ui-dev | E4, U4 | Build vars + CSP; Playwright `webServer` adds `wrangler dev` (port `PORT+600`, fresh `--persist-to`, `--var OVERCLOCK_TEST_MODE:1`); e2e with **two browser contexts**: S-06-1 (code, join, wrong code), S-06-2 (backs only, opponent move < 1 s, not-your-turn, rez prompt vs. "Corp is deciding…", **WS frames of the Runner page never contain the Corp's hand ids**, game over), S-06-3 (`context.setOffline` → catch-up, away banner, third context rejected, reload → Rejoin). |
| U6 | ui-dev | E4 | `server.yml` (main + `sprint-[0-9][0-9]`, never cancels; skips with a notice when `CLOUDFLARE_API_TOKEN` is empty; deploy; then `/health` must report this commit), `deploy.yml`/`android.yml` pass `vars.OVERCLOCK_SERVER_URL`; CI `checks`/`e2e` move to Node 22. |

Merge order: E1 → ui-dev merges engine branch before U3 → E2–E4 → U5/U6 → final merge by the lead.

## Test strategy
Pure Vitest for protocol, engine option and room (Node, no Cloudflare); one `wrangler dev` integration script in CI `checks`; two-context e2e in the existing shards (no secrets anywhere). Only the touched specs locally (`docs/TESTING.md`). S-06-4 proof = the `server` workflow run once the owner adds the secret; before that it must show "skipped", green.

## Risks (cut first if late: **Rejoin after a full close**, then the share link's auto-join)
- Network round trip vs. the 100 ms budget: press feedback is local; the move itself appears on the server's answer.
- The board assumed bottom = active seat; online the bottom seat watches the other's turn. Biggest client change; hot-seat e2e must stay green.
- `wrangler dev` in CI shards (workerd binary, ports, startup time): if flaky, start it once per shard with a health wait.
- Node 22 bump for CI (wrangler needs ≥ 22.12): run the full CI once early on `sprint-06`.
- Deploys while a game runs: restore by replay if the build changed; a rules change could still alter that game.
- Owner's account not ready by demo: everything is tested locally; S-06-4 stays "waiting on you".
