# OVERCLOCK online service (`apps/server`)

The small online service that lets two phones play one game. It runs on **Cloudflare's free plan**: a *Worker* (a tiny program that answers web requests) and one *Durable Object* per game (a little box that holds one game and talks to both phones). The service runs the rules and sends each phone only what that player may see.

---

## For the owner: switch it on (about 10 minutes, once)

You need a free Cloudflare account. **No card is needed, and nothing costs money**: without a card on file Cloudflare cannot charge you, and our game stays far inside the free limits.

1. **Sign up.** Go to <https://dash.cloudflare.com/sign-up>, sign up with your email and password, and click the link in the email Cloudflare sends you.
2. **Pick your web name.** In the Cloudflare dashboard, open **Workers & Pages** (left menu, under "Compute"). If it asks you to choose a `workers.dev` subdomain, type a short name (for example your name) and save. Write it down: we call it `<your-subdomain>` below.
3. **Copy your Account ID.** Still on **Workers & Pages**, find **Account ID** on the right-hand side and click to copy it. Keep it in a note for step 5.
4. **Make a key for GitHub** (an "API token": a password that only lets GitHub update the game service).
   - Click your profile icon (top right) → **My Profile** → **API Tokens** → **Create Token**.
   - Next to **Edit Cloudflare Workers**, click **Use template**.
   - Under **Account Resources** choose *Include* → your account. Under **Zone Resources** choose *Include* → *All zones* (we use none, the template just asks).
   - Click **Continue to summary** → **Create Token**, then **Copy** the token. Cloudflare shows it only once.
5. **Give the key to GitHub.** On GitHub, open the `overclock` repository → **Settings** → **Secrets and variables** → **Actions**.
   - **Secrets** tab → **New repository secret**: name `CLOUDFLARE_API_TOKEN`, value = the token from step 4 → **Add secret**.
   - **New repository secret** again: name `CLOUDFLARE_ACCOUNT_ID`, value = the Account ID from step 3 → **Add secret**.
   - (No variable needed: the service address `wss://overclock.patrickmedaugh.workers.dev` is built in. A repository variable `OVERCLOCK_SERVER_URL` would override it.)
6. **Tell the team** in the sprint PR ("Cloudflare is set up"). From then on every update of the game also updates the online service by itself. The team then re-runs the latest build once, so the web link and the app learn the service's address (and adds it for the Netlify copy).

**Check it works:** open `https://overclock.<your-subdomain>.workers.dev/health` in a browser. You should see `{"ok":true,…}`.

---

## For developers

Everything below runs offline, with no Cloudflare account. Needs Node ≥ 22.12 (wrangler 4).

| Command (from the repo root) | What it does |
|---|---|
| `npm test -w apps/server` | Vitest: room logic (`src/room.ts`), leak test, hashing, Origin check. Plain Node, no Cloudflare. |
| `npm run test:dev -w apps/server` | Starts the real Worker + Durable Object with `wrangler dev` (fresh storage in a temp folder, test mode on), plays a short two-phone game, checks `full`/`no_game`/`bad_token`/Origin, restarts the server and checks the game survived. ~5 s. Optional `DEV_PORT`. |
| `npm run dev -w apps/server` | `wrangler dev` with `wrangler.jsonc` as is (production allowlist, test mode off). For local play see below. |

**Local server for e2e / local play:**

```sh
cd apps/server
npx wrangler dev --port 8787 --ip 127.0.0.1 --persist-to <fresh empty dir> \
  --var OVERCLOCK_TEST_MODE:1 --var "ALLOWED_ORIGINS:http://localhost:*,http://127.0.0.1:*" \
  --show-interactive-dev-session=false
```
Ready when `GET http://127.0.0.1:8787/health` answers `{"ok":true,"build":"dev","protocol":1}` (usually 1–3 s). The client connects to `ws://127.0.0.1:8787`.

**Test mode** (`OVERCLOCK_TEST_MODE=1` *and* `BUILD=dev`, so never in a deployed build — `src/config.ts`): `create` may carry `test: {seed, actions}`; the game starts from that seed and replays the actions (refused ones are skipped), so a test can start at any board. Without test mode the field is ignored and the seed is random.

**Vars** (`wrangler.jsonc`, override with `--var NAME:value`): `BUILD` (shown by `/health`; CI deploys with `--var BUILD:<commit sha>`), `ALLOWED_ORIGINS` (comma-separated; `*` = one run of letters/digits/dashes, e.g. a port or a preview prefix), `OVERCLOCK_TEST_MODE`.

**Deploy** (CI, `server.yml`): `npx wrangler deploy --var BUILD:$GITHUB_SHA` from `apps/server` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment; then `/health` must report that sha.

### Layout
- `src/room.ts` — all game-server logic, pure (clock, randomness, storage, sockets injected). Protocol: `packages/engine/README.md` "Sprint 6 interface".
- `src/do.ts` — the Durable Object `GameRoom`: WebSocket hibernation, synchronous KV storage, alarm, ping/pong auto-response.
- `src/worker.ts` — routes `/health`, `/v1/create` (picks a free code, up to 5 tries), `/v1/games/<CODE>`; Origin check.
- `src/hash.ts` — synchronous SHA-256 (seat tokens are stored only as hashes) and base64url.
- Storage per game: `meta`, `state` (snapshot), `a:000001…` (accepted actions). Restored from the snapshot when the same build wrote it, else by replaying the actions. Cleanup alarm: lobby 2 h, idle game 3 days, finished game 1 h.
