# Sprint 2 tech plan (architect)

Scope: S-02-1..6 (owner answers: tap to play, real names and cards, landscape only on phones). Pinned types: this page, then `packages/engine/README.md` (E1) and `apps/client/src/hook-types.ts` (U1). Engine-dev lands E1 first; ui-dev codes against it with fixture views until E3-E6 land.

## Engine (`packages/engine`) — plain JSON, per-seat projections, card behavior from `@overclock/cards` data
- **State:** `GameState.nextUid`, `nextRemote` (counters, start at 1). `players.corp.servers: ServerState[]` = `hq`, `rd`, `archives`, then remotes in creation order. `ServerState {id: ServerId; ice: Installed[]; root: Installed[]}`, with `ice[0]` innermost and the **last entry outermost**. Remote root: at most one agenda/asset plus any upgrades; central root: upgrades only (HQ/R&D/Archives contents stay in hand/deck/discard). `players.runner.rig {program, hardware, resource: Installed[]}`, `BASE_MEMORY = 4`. `Installed {uid, cardId, rezzed: false}` (rez comes next sprint). The uid (`"i<n>"`) is given **at install time**, never at the deal, so it can't track a card's identity. `ServerId = 'hq'|'rd'|'archives'|\`remote-${number}\``; remote numbers are never reused. Discard entries become `{cardId, faceUp}` (Archives now holds face-up operations and face-down hand-limit discards).
- **Actions:** `install {player, handIndex, server?: ServerId|'new'}`. Corp: `server` is required. Agenda/asset/upgrade cost 0 credits; ICE costs its target server's ICE count ('new' = 0); 'new' creates the remote first. Runner: no `server`; pays `card.cost`; programs need `card.memory` free. `play {player, handIndex}`: operation/event, pays `card.cost`, runs `card.onPlay`, then the card goes to the discard pile face up. All cost 1 click.
- **Events:** `server_created {serverId, remote}` · `credits_spent {player, amount}` (only if > 0, before the install/play) · `card_installed {player, uid, handIndex?, cardId?, server?, slot: 'ice'|'root'|'program'|'hardware'|'resource', index}` · `card_played {player, handIndex?, cardId, cost}` → effect events (existing `credit_gained`, `card_drawn`) → `card_resolved {player, cardId}` (now face up on the pile).
- **Effect DSL v1 (`@overclock/cards` types):** `onPlay?: Effect[]`, with `Effect = {op:'gain_credits', amount} | {op:'draw', count}`, and `needs?: 'runs'` for cards that need unbuilt features. The interpreter is `effects.ts`: an exhaustive switch, with no card ids in the engine. `draw` takes what is there (short deck = fewer cards, no loss: deck-out stays on the mandatory draw only, RULES_SPEC).
- **Validation table additions** (`rules.ts`). The shared prefix stays shape → game_over → not_your_turn → wrong_phase(action) → no_clicks; then:

| action | shape (invalid_action) | then, in order |
|---|---|---|
| install | handIndex int, server string if present | bad_card (index out of range / not installable) → bad_target (Runner gave a server; Corp: none/unknown; agenda/asset to a central) → slot_taken → no_memory → no_credits |
| play | handIndex int | bad_card (not operation/event) → needs_runs → no_credits |

- **Prices for the client: `PlayerView.handOptions: HandOption[]`** (active viewer, action phase only). `HandOption {handIndex, places: PlaceOption[]}`, `PlaceOption {place: ServerId|'new'|'rig'|'play', cost, action, reason: RejectReason|null}`. Computed with the same table. Structurally impossible places (bad_target, slot_taken) are left out, so they are **not offered**. Places blocked by no_clicks/no_credits/no_memory/needs_runs are listed with their reason, so the client can show the price and the hint without any rules of its own. `legalActions` = draw, gain_credit, end_turn, discard, then every option with `reason === null` (all enumerated; finite).
- **viewFor:** `PlayerView.servers: ServerView[]` `{id, remote: number|null, ice: InstalledView[], root: InstalledView[]}` and `PlayerView.rig {program, hardware, resource: InstalledView[], memory: {used, limit}}`; `InstalledView {uid, cardId: string|null, faceUp}`. The Corp sees its own `cardId` (`faceUp: false`); **the Runner gets `cardId: null`**. Rig cards are face up to both. `PlayerSideView.discard` becomes `(string|null)[]` (null = face down to this viewer). **viewEvents:** the opponent loses `handIndex` everywhere, and the Runner loses `card_installed.cardId` for Corp installs. `card_played`/`card_resolved` stay public.
- `RULES_SPEC.md`: install/play rules, upgrades in any server, starter pool = real core-set cards. `packages/match`: no API change.

## Cards (`packages/cards`)
Ids `c01..c12`/`r01..r12` stay (fewer test changes); names, types, costs, strength, memory and text become official core-set (2012) values, transcribed by engine-dev from an official source, with QA spot-checks. Text keeps the symbols as tokens `[click]`, `[credit]`, `[subroutine]`, `[mu]`; `cardFace` draws them as glyphs. Optional `keywords` line ("Barrier", "Icebreaker - Fracter"). Mapping (closest by type/role, logged):
- **Corp:** c01 Hedge Fund · c02 Anonymous Tip · c03 PAD Campaign · c04 Wall of Static · c05 Ice Wall · c06 Enigma · c07 Neural Katana · c08 Hostile Takeover · c09 Private Security Force · c10 Priority Requisition · c11 Experiential Data · c12 Neural EMP (`needs: 'runs'`).
- **Runner:** r01 Easy Mark · r02 Armitage Codebusting · r03 Diesel · r04 Corroder · r05 Gordian Blade · r06 Ninja · r07 The Maker's Eye (runs) · r08 Cyberfeeder · r09 Akamatsu Mem Chip · r10 Wyldside · r11 Inside Job (runs) · r12 Data Dealer.
- `ip-check.test.ts` and `banned-words.ts` are deleted. `ip-art-and-ui.test.ts` keeps only the glyph-art-key and no-image/logo/raster-file checks. New `cards.test.ts` checks: the exact 24 real names; none of the 24 retired invented names in any card or deck; every operation/event has `onPlay` or `needs`; ICE has strength; programs have memory.

## Client (`apps/client`) — no rules: prices, reasons and actions come from `view.handOptions`
- **Select → target:** tapping a hand card selects it (UI state; the card rises). The lit places are the option's `places`, mapped to layout boxes: a server's ICE slot (outermost position) or root slot, a **New server** ghost slot, the Runner's **Install** spot ("Install · 3 credits"), or a **Play** button in the End turn slot ("Play · 5 credits"/"Play · free"). Tapping a place sends `place.action` verbatim. Tapping the card again or empty board cancels. Hints come from the reason (offered option or engine rejection): no_credits "Not enough credits", no_memory "Not enough memory", needs_runs "Needs runs (coming soon)" (shown at card tap when the only place has that reason), no_clicks "No clicks left".
- **Board:** servers sit in a row; the ICE stack grows toward the opponent, outermost farthest out. ICE is drawn as rotated (landscape) cards. Rig cards are face up. "Memory 2/4" is taken from `rig.memory`. The Corp's own installed cards show the face, dimmed with a face-down mark; the Runner's view shows backs. Long-press zoom works on any installed card (backs zoom as a back). Discard piles show face-up tops (played ops/events).
- **Words (decided):** HQ / R&D / Archives for the Corp's hand / deck / discard; **Grip / Stack / Heap** for the Runner's, plus **Rig**, **ICE**, **Server N**, **New server**, **Memory**. pm updates `GLOSSARY.md` with one plain line for each. Labels read e.g. "HQ · 6 cards", "GRIP · 5 cards".
- **Device mode (`device.ts`, DOM only):** `phone = matchMedia('(pointer: coarse)').matches && min(innerWidth, innerHeight) <= 500`. Phone + landscape → new `computeLayout(w, h, insets, 'phone')`. Phone + portrait → a DOM overlay "Turn your phone sideways" (canvas input off, match and fx untouched, relayout on rotate). Anything else keeps the desktop column (gaining server/rig zones in its center band). Manifest `orientation: "landscape"`.
- **Phone layout (pure, `layout.ts`):** right rail (both sides' piles, credits/clicks pills, banner, hint, End turn/Confirm/Play). The main area has an opponent band, a viewer band, and a hand *peek strip* at the bottom (card tops show; the selected card rises). It must fit 6 servers × 2 ICE and 6 rig cards with no scrolling; beyond that, cards shrink. Floors: buttons and pile targets ≥ 44×44; installed-card hit boxes ≥ 44 at 844×390 and ≥ 36 at 640×360. Hit boxes may extend into gaps but never overlap. Left/right/bottom insets come from the existing `#safe-probe`.

## Hook-types additions (pinned)
`LayoutSnapshot += { mode: 'phone'|'desktop'; rotatePrompt: boolean; servers: {id, label: string, box, ice: InstalledBox[], root: InstalledBox[]}[]` (ice innermost first) `; rig: {box, cards: InstalledBox[]}; memory: {text, box}|null; selected: {handIndex, cardId}|null; targets: {place, label, box, enabled}[]; play: {box, label}|null; labels: string[]` (every on-screen label) `}`. `InstalledBox {uid, cardId: string|null, faceUp, box}`. `text` gains `corpDiscardTop`/`runnerDiscardTop` (card id or ''). `AnimKind += 'install_flight' | 'play_reveal'`.

## First build task (U1): harden the Sprint 1 timing tests, budgets unchanged
Product: the End turn guard compares the **tap's native `timeStamp`** (hardware time, read from `FederatedEvent.nativeEvent`) with the `timeStamp` of the tap that ended the turn, not `performance.now()` when the handler runs. This is a pure `guardOpen(armedAt, tapAt, 300)` with unit tests. It is also the correct behavior on a busy phone, where a second tap gets delivered late. Tests: from the ending tap's `pointerup` listener, a synchronous loop **constructs** the poke PointerEvents at offsets 5..270ms (each event's timeStamp = when it was constructed). The loop dispatches them once the new board is up. So the pokes always land inside the guard, and every one must be refused. For "End turn answers ≤ 600ms after a 4-card discard": constructed End-turn taps at 0..600ms in 10ms steps. Then assert: the first accepted tap is stamped ≤ 600ms after Confirm, `turn_change.scheduledMs` ≤ 600, and the flip is started by a timer at the scheduled time, not by frames. Wall-clock flip and first-answer times stay annotations (DECISIONS 2026-11-12).

## Test strategy (E = engine/cards Vitest, L = client layout Vitest, P = Playwright on phone 844×390, phone-small 640×360, desktop 1280×800; portrait 390×844 only for the rotate spec)
| AC | Tests |
|---|---|
| 1-1 places light incl. New server | E handOptions for agenda/asset/upgrade; P select → `targets` incl. 'new' |
| 1-2 Server 1, 2; 1 click, 0 credits | E install new ×2 → `remote-1`/`remote-2` events, clicks −1, credits same; P labels "Server 1"/"Server 2" |
| 1-3 one per server, upgrades anywhere | E slot_taken; upgrade in hq/rd/archives ok; option omitted; P target absent |
| 1-4 cancel | P tap card again / empty board → `selected` null, view unchanged |
| 1-5 Corp zoom own face up | P long-press installed → zoom texts contain name |
| 1-6 Runner sees backs, no ids | E leak test: Runner view + events JSON contain no installed Corp cardId (ids unique to the install); P runner `InstalledBox.cardId` null |
| 2-1 every server lit with price | E ICE options for all servers + 'new', cost = ICE count; P target labels |
| 2-2/2-3 0 then 1/ICE, outermost | E costs, `ice` order, credits_spent; P second ICE farther from the root |
| 2-4 can't afford | E no_credits, state unchanged; P hint record "Not enough credits" |
| 2-5 Runner sees counts as backs | E view; P runner layout ice count, cardId null |
| 3-1..3 Install spot, pay, can't pay | E runner install success/no_credits/bad_target; P "Install · N credits", hint |
| 3-4/3-5 memory | E memory used/limit, no_memory before no_credits; P "Memory 2/4", hint |
| 3-6 rig face up to Corp | E Corp view cardIds; P corp-turn rig faceUp |
| 4-1..3 Play price, resolve, discard face up | E Hedge Fund 5→+9, Tip/Diesel draw 3 (short deck), Easy Mark +3, events order, discard faceUp; P Play label, `play_reveal`, pile top id both seats |
| 4-4 needs runs | E needs_runs, nothing spent; P hint |
| 4-5 hand > 5 after play → discard | E Diesel then end_turn → discard_required; P picker |
| 5-1 busy board fits | L busy fixture × {844×390, 640×360} × insets {0, notch L 47, notch R 47, bottom 21}: inside safe rect, no overlaps, floors; P same via hook + screenshots |
| 5-2 < 100ms / ≤ 600ms | P install + play: state < 100ms after the tap, anim started < 100ms, `scheduledMs` ≤ 600 |
| 5-3 real words | P `labels` include HQ, R&D, Archives, ICE, Grip, Stack, Heap; no "Deck"/"Discard"/"defense"; E GLOSSARY has every used term |
| 5-4 real cards | E `cards.test.ts`; P zoom of each deck card shows the official name |
| 6-1/6-2 fits, notch L/R | L + P as 5-1 on the empty and busy board |
| 6-3 portrait prompt, state kept | P 390×844: overlay visible, then resize to 844×390: same view JSON, board back |
| 6-4 manifest landscape | P fetch manifest → `orientation: "landscape"` |
| 6-5 desktop unchanged | P desktop `mode === 'desktop'`, Sprint 1 specs pass; L desktop boxes same as before for an empty board |
| 6-6 Sprint 1 turn on landscape | all Sprint 1 specs run on both phone projects |

## Task split (in sequence, one commit each)
**engine-dev:** E1 types + README pin (state, actions, events, views, handOptions, DSL types) · E2 24 real cards + DSL fields + cards tests + retire ip tests + RULES_SPEC · E3 Corp install (servers, ICE cost, slot rules) · E4 Runner install + memory · E5 `play` + `effects.ts` + needs_runs + discard `{cardId, faceUp}` · E6 handOptions/legalActions, viewFor/viewEvents hiding + leak test + match tests; the AI stub still compiles.
**ui-dev:** U1 flake hardening (above) · U2 `device.ts`, rotate overlay, manifest, Playwright projects 844×390/640×360/desktop (+ portrait spec) · U3 phone landscape `layout.ts` + L tests (busy fixture), desktop zones · U4 draw servers/ICE/rig/memory/discard tops from the view + installed-card zoom · U5 select → target flow, price labels, Play, cancel, hints, `install_flight`/`play_reveal` · U6 real labels, card text tokens, hook fields, e2e for every AC + demo screenshots. Architect reviews U3 screenshots before U4.

## Risks
640×360 with 6 servers is tight: the plan relies on the hand peek strip and rotated ICE, and the L tests decide. `pointer: coarse` under Playwright `hasTouch` must be verified in U2 (fallback: `navigator.maxTouchPoints > 0`). Akamatsu Mem Chip's "+1 memory" does not act this sprint (the proposal puts installed abilities later): pm says so in the demo notes. Official card text is transcribed without a reference in the repo, so QA spot-checks it.
