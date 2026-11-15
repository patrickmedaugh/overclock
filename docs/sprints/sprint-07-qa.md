# Sprint 7: QA report

QA date: 2026-11-14 · Branch `sprint-07` · Code checked at **a9364a1**. QA tests and screenshots were added in **0865b64**, which changes no product code. QA did not write the code it checked.

**Summary: 36 acceptance criteria. 36 PASS, 0 FAIL.** QA found **2 low-severity screen issues** (QA-S7-1, QA-S7-2). Neither one breaks a criterion.

**What CI checked on 0865b64 (includes every QA test):**
- `checks` passed: lint, typecheck, **1425 unit tests**, and the `wrangler dev` integration check.
- Full screen-test suite, all 4 parts: **933 passed / 6 skipped / 0 failed / 0 flaky**.
  - Parts 1 to 4: 234 / 233 / 233 / 233 passed.
  - CI retries a failed test once. "0 flaky" means no test needed that retry.
- `guard-mutation`, `android` (build + publish), `deploy` (web) and `server` all passed.
- The `server` check deployed the live online service. `/health` reported `0865b64…` on the first try.

The code commit a9364a1 also passed CI on its own: 886 passed / 6 skipped / 0 flaky.

As instructed, the "Workers Builds: overclock" check is ignored. It is the owner's own Cloudflare integration.

**How to read the Evidence column**

| Label | Meaning |
|---|---|
| P | A developer's screen test (Playwright) |
| E | A developer's unit test (Vitest) |
| QA | A test written by QA |

The screen-test sizes are:
- `phone`: 844×390, touch
- `phone-small`: 640×360, touch
- `desktop`: 1280×800, mouse
- `android`: the Android app's own bundle, at both phone sizes

**QA's tests (in 0865b64):**
- `packages/engine/test/qa-sprint07.test.ts` (23 tests): rules checks, plus a sweep of 250 random games checked against QA's own rules.
- `apps/server/test/qa-sprint07.test.ts` (3 tests): the online room.
- `apps/client/e2e/qa-sprint07.spec.ts` (15 tests × 3 sizes).
- `apps/client/e2e/qa-sprint07-android.spec.ts` (app bundle, 2 sizes).

Screenshots are in `docs/sprints/sprint-07-qa/` and named `<size>-NN-<what>.png`. QA's last local run of the e2e spec: **45/45 passed** on the three sizes.

## Acceptance criteria

### S-07-1 Empty servers vanish; abandoned online games close

| Criterion (short) | Result | Evidence |
|---|---|---|
| Last card of an ICE-less remote stolen or trashed: the server disappears from both boards | **PASS** | E `sprint07-empty-remotes` (steal, trash). QA e2e (3 sizes), a real Steal tap: the column folds away in ≤ 200 ms without blocking taps, its name is gone, and the Corp's board agrees (`*-01/02/03-s07-1-*`). QA engine: `server_removed` is public, and both views lose the server at the same moment. |
| The Corp scores the only agenda in an ICE-less remote: the server goes | **PASS** | E `sprint07-empty-remotes` AC2 (removed after the score bonus). P `s03-corp-score` expects `server_removed`. QA sweep: 448 removals in 250 games. After every action outside a run, no empty remote is left. |
| After a removal, only one "New server" place lights, with no gap | **PASS** | P `s07-cards` S-07-1 (one `new_server` target, one column past the last). E AC3. |
| A remote with ICE stays when its last card goes, and the Corp can install there again | **PASS** | E AC4. QA engine: when the stolen agenda shares a server with a face-down upgrade, the server stays because the upgrade is still there. |
| Other servers keep their names; the next new server gets a new number (automated) | **PASS** | E AC5. QA engine: two removals, then `remote4` and `remote5` are created (numbers are never reused). QA sweep: no server number was reused in 17,784 actions. QA e2e: every other label is unchanged on both boards. |
| A lobby given up with Back: another device typing the code sees "No game with that code" (automated) | **PASS** | P `s07-online` (two contexts, local service). E `sprint07-room`. QA room: the leaver's own token answers `no_game` too. A socket with no seat can't close someone else's lobby with `leave` (`bad_message`), and that lobby still takes a joiner. This fixes QA-S6-1. |

### S-07-2 PAD Campaign and Akitaro Watanabe

| Criterion (short) | Result | Evidence |
|---|---|---|
| The Corp taps face-down PAD: **Rez · 2 credits**. It takes 2 credits and no click, and the card turns face up on both boards. Akitaro shows **Rez · 1 credit**. | **PASS** | QA e2e (3 sizes, real taps):<br>- **PAD:** button ≥ 44 px, inside the screen. The tap is handled in < 100 ms. Credits −2, clicks unchanged. The flip takes ≤ 300 ms. The Runner's board shows it face up (`*-04/05/06-s07-2-pad-*`).<br>- **Akitaro:** face down on the Corp's turn it shows "Rez · 1 credit". Tapping it gives `credits_spent` then `card_rezzed` (`*-08-s07-2-akitaro-rez-button`).<br>- **The Runner** never gets a Rez button or options for Corp cards (QA e2e, QA engine, QA sweep). |
| Fewer credits than the cost: Rez is dimmed, "Not enough credits" | **PASS** | P `s07-cards` (dim, note, tapping changes nothing). E AC2. QA engine: Ice Wall advance with 0 credits gives the same `no_credits`. |
| Face-up PAD: +1 credit and the note "PAD Campaign: +1 credit" at the Corp's turn start. Face down gives nothing. | **PASS** | QA e2e: a full round face down gives no credit and no note. After the rez, exactly +1 and one note (`*-07-s07-2-pad-plus-1-note`). P: with the pass-and-play cover on, the note waits until the cover is tapped away.<br>QA engine:<br>- The trigger comes after `turn_started` and before the Corp's draw, matching the real rule ("when your turn begins").<br>- Once the Runner trashes PAD, it gives nothing more.<br>- In the sweep, PAD triggered 229 times, always while face up. |
| Face-up Akitaro: face-down ICE in its server costs 2 less; ICE elsewhere costs full price | **PASS** | QA engine:<br>- Akitaro face down: Wall of Static costs 3.<br>- Akitaro face up: 1 in its own server, still 3 in another server, and exactly 1 credit is paid.<br>- Akitaro on HQ: Ice Wall costs 0.<br>E `sprint07-rez-assets`. |
| Pass-and-play, Corp at 1 credit with Akitaro face up: the Corp is asked about Wall of Static | **PASS** | QA e2e (3 sizes): "Rez Wall of Static · 1 credit" is lit with the Corp at exactly 1 credit. After the tap the Corp has 0 and the Runner is encountering the ICE (`*-09-…`). QA engine: with 0 credits on HQ the Corp is still asked about Ice Wall (price 0). Without Akitaro, a Corp at 1 credit is **not** asked about Wall of Static. |
| Online, PAD/Akitaro rezzed and the turn moves on: both devices match pass-and-play (automated) | **PASS** | QA online (two contexts, 3 sizes):<br>- **PAD:** rezzed with a real tap, then both turns end. Both devices equal a `LocalMatch` with the same actions. Corp credits are +1 on both devices, and the Corp's device shows the note (`*-31/32-online-*`).<br>- **Akitaro:** before the rez the Runner's device shows a card back. The Corp's device rezzes it with a tap. At Wall of Static the Corp's device offers "Rez … · 1 credit" while the Runner's device has no lit buttons. Both devices match pass-and-play before and after the rez (`*-33/34-online-*`).<br>P `s07-online` (PAD). |

### S-07-3 Armitage Codebusting and Akamatsu Mem Chip

| Criterion (short) | Result | Evidence |
|---|---|---|
| Armitage installed: shows **12** on the card for both players | **PASS** | QA e2e: the pill reads 12, its digits are ≥ 14 px, and it sits on the card (`*-10-s07-3-armitage-12`). The Corp's board shows the same number (`*-13-…`). E AC1. See QA-S7-1 (the pill covers the type line at 640×360). |
| Runner's turn, no run: **Take 2 credits · 1 click**. 12 → 10, +2 credits, −1 click. | **PASS** | QA e2e (3 sizes): button ≥ 44 px, tap handled < 100 ms, card 12 → 10, Runner +2 credits, −1 click (`*-11-…`). QA engine: two Armitages keep separate credits. Taking during a run is refused (`wrong_phase`) and so is using an ability that doesn't exist (`bad_target`). |
| No clicks left: the button is dimmed and says "No clicks left" | **PASS** | QA e2e: dimmed, note "No clicks left", and a tap changes nothing in the game (`*-12-…`). QA engine: `no_clicks`, and the option is listed with that reason. |
| Last 2 credits taken: the card goes to the Heap | **PASS** | QA engine: 6 takes over several turns give exactly +12. The card leaves the table and goes face up to the Heap. P `s07-cards` (real tap, `rig_trash_flight`). QA sweep: credits on Armitage only ever showed 12/10/…/2. |
| Akamatsu installed: memory reads "…/5" | **PASS** | QA e2e: "…/4" before, "…/5" after (`*-14-s07-3-memory-5`). QA engine: limit 5 with the chip, 4 without. The sweep checked memory = 4 + chips after every action. |
| Online: the Corp's device sees Armitage's credits go down (automated) | **PASS** | P `s07-online` (the Corp's device shows 10; both devices equal pass-and-play). QA room sweep (frame-exact, below) covers 38 card abilities. |

### S-07-4 Cyberfeeder and Bank Job

| Criterion (short) | Result | Evidence |
|---|---|---|
| Cyberfeeder shows 1 credit on it | **PASS** | QA e2e: pill "1", ≥ 14 px (`*-15-…`). E AC1. |
| No credits of his own: he breaks Ice Wall with Corroder, Cyberfeeder pays, and the button says so | **PASS** | QA e2e (3 sizes): "Break "End the run" · Cyberfeeder pays", lit, with the Runner at 0 credits. The payment comes from the card (`hosted: 1`), the pill disappears, and the subroutine is broken (`*-15/16-…`). QA engine: it also pays strength pumps. The real text says "pay for using icebreakers", so this is correct. |
| Used credit is back at the next Runner turn (never more than 1) | **PASS** | QA e2e: the pill reads 1 again on the Runner's next turn. QA engine: an unused credit stays at 1 across a whole round. In the sweep the value was always 0 or 1. |
| Never pays a trash cost or an install (automated) | **PASS** | QA engine:<br>- With 0 own credits plus Cyberfeeder's 1, Akamatsu (cost 1) can't be installed (`no_credits`).<br>- With 3 own credits plus 1 on Cyberfeeder, PAD (trash cost 4) can't be trashed (`no_credits`).<br>QA sweep: no install or trash ever spent card credits or changed Cyberfeeder. Card credits were spent only by breaker abilities (18 times). |
| Bank Job installed: shows **8** | **PASS** | QA e2e: pill "8" (`*-17-…`). See QA-S7-1. |
| Successful remote run: **Take 8 credits from Bank Job** or **Access cards**. Taking gives +8, accesses nothing, and Bank Job goes to the Heap. | **PASS** | QA e2e (3 sizes): exactly those two buttons, both lit, ≥ 44 px (`*-18-s07-4-bank-job-choice`). Take gives +8, no access, Bank Job in the Heap, and the note "Bank Job: +8 credits, nothing accessed" (`*-19-…`). QA engine: taken on a remote holding an agenda, the agenda is not stolen and the server and card stay. The Runner's events never name the face-down agenda. The Corp can't act at that step. |
| HQ, R&D or Archives: Bank Job not offered | **PASS** | E AC7. P `s07-cards` (HQ). QA engine: also not offered through The Maker's Eye (R&D) or Inside Job on HQ. QA sweep: the choice appeared 78 times, always on a remote with Bank Job holding credits. |
| Online, Cyberfeeder / Bank Job: both devices match pass-and-play (automated) | **PASS** | P `s07-online` (both, two contexts, equal to `LocalMatch`). QA room sweep: 5 Bank Job choices, every frame exact. |

### S-07-5 Ice Wall can be advanced

| Criterion (short) | Result | Evidence |
|---|---|---|
| Tapping Ice Wall (face up or down) shows **Advance · 1 credit**. It uses 1 click and 1 credit and adds a counter both players see. | **PASS** | QA e2e: button ≥ 44 px. Two taps cost 2 clicks and 2 credits and show counter "2" (`*-20/21-…`). The **Runner's** board shows the "2" on the **card back** (still no card name) (`*-22-…`). QA online: after the Corp taps Advance, the Runner's device shows "1" on a card back. QA engine: Advance with 0 credits gives `no_credits`; on the Runner's turn, `not_your_turn`. |
| Face up with 2 counters: strength 3, and Corroder must pump before it breaks | **PASS** | QA e2e: "Strength 3". Break is dimmed (`too_weak`). After one real tap on +1 strength, Break works and the subroutine is broken (`*-23-…`). QA engine: 3 counters give strength 4, which needs 2 pumps. Ice Wall can't be scored. The sweep checked strength = 1 + counters in 349 encounters. |
| Other ICE: no Advance (automated) | **PASS** | QA engine: Wall of Static, Enigma and Neural Katana installed together show no options at all, and `advance` on each is refused (`bad_target`). Note: the developer's e2e check (`s07-cards` "tapping other ICE shows no Advance") would pass with nothing to check if the board had no other ICE. The QA engine test closes that gap. |

### S-07-6 Hand: tap to open, long-press to light places, drag to play

| Criterion (short) | Result | Evidence |
|---|---|---|
| Tap the hand: it opens big and readable | **PASS** | QA e2e: the view is drawn < 100 ms after the tap. The big card is > 60% of the screen height with no text overflow (`*-24-…`). P `s07-hand`. |
| Long-press a card: every place it can go lights up | **PASS** | QA e2e: the number of lit places equals the card's options (`*-25-…`). P (refused places are dimmed). |
| Drag onto a lit place and let go: it is played there | **PASS** | QA e2e (3 sizes): the card hovers over "New server" and is played on release. Hand −1, one new server (`*-26/27-…`).<br>**QA app bundle (no test hook, real touches, 844×390 and 640×360):**<br>- Tap the hand, long-press, drag onto New server, let go.<br>- A card is now drawn in the new server's place, matching the web build after the same drag, with no page errors.<br>- 2/2 sizes, run twice each.<br>- Screenshots: `android-app-*-01/02/03-*`. The final screenshot shows "Server 1" and 2 clicks left.<br>P `android.spec` (let go away, in the app). |
| Let go away from a lit place: nothing is played and the hand view is back | **PASS** | QA e2e: the game is unchanged and the view is back on the same card (`*-28-…`). P (the return flight takes ≤ 150 ms). |
| Tap outside the open hand: it closes | **PASS** | QA e2e: the tap lands on a board control, so in normal play it would do something. Here it only closes the view, and the game is unchanged. At 640×360 the side cards of the hand view cover the Corp's credits, so QA's test picks a control that isn't covered. P `s07-hand`. |
| The card follows the finger without lag (< 0.1 s per move, automated) | **PASS** | QA's own measure: a continuous drag, one move every ~16 ms, nothing waited for between moves. A move counts as drawn only on the first frame where the lifted card is drawn at that move's x. Results: see "Drag timing" below. One unexplained slow move was recorded during setup and is also listed there. P `s07-hand` (6× slow-down: max 35.1 ms). |
| Pass-and-play and online drags work the same (automated) | **PASS** | P `s07-hand` (Corp drag, two contexts). QA online (3 sizes): the **Runner** drags a card onto its lit place on his device. Both devices equal a `LocalMatch` with that install. The same drag in pass-and-play gives an identical rig and identical Runner numbers (`*-36-…`). |

### Drag timing

All runs recorded every move in each drag.

| Run | Repeats | Slowest move | Middle move |
|---|---|---|---|
| phone, alone | 4 | ≤ 35.1 ms | ~24 ms |
| phone-small, alone | 4 | ≤ 35.6 ms | ~27 ms |
| desktop, alone | 1 | 18.3 ms | — |
| **6× CPU slow-down**, both phone sizes | 3 each | ≤ 51.0 ms | 28–34 ms |
| Final full run, 2 workers | 1 | 39.3 ms (phone), 35.6 ms (phone-small), 27.7 ms (desktop) | — |

Two earlier failures are recorded here so nothing is hidden:

- **Overloaded sandbox (test setup, not the game).** These two came from QA's first runs: 4 test workers plus the local service on a 2-CPU sandbox.
  - desktop: 107 ms
  - phone: timeout
- **One unexplained slow move.** In one later run, alone (1 worker), one phone move took **196 ms**.
  - It did not come back in the 14 timing runs listed in the table.
  - QA's measure also reads the whole screen layout once per frame during the drag, which may add load.
  - QA can't confirm the 196 ms was the game. A drag on a real phone is still owner check 2.

## Bugs / findings

**QA-S7-1: At 640×360 the credits pill covers the card's type line (Low, cosmetic)**
- Steps:
  1. Play on a 640×360 screen.
  2. As the Runner, install Armitage Codebusting or Bank Job.
- Expected: the card's name, type and credits are all readable on the table.
- Actual: the yellow "12" / "8" pill sits over the bottom-left of the card and hides most of "RESOURCE" (only "…CE" / "URCE" shows). Armitage's name is also cut to "Armitage Codebustin". Holding the card to read it still shows everything. Screens: `phone-small-10-s07-3-armitage-12.png`, `phone-small-17/18-…bank-job…png`. At 844×390 it is less crowded but the pill still overlaps the type line.
- Severity: low. Every criterion passes (the 12/8/1 is readable).

**QA-S7-2: Advancement counters and credits-on-card look the same (Low, design note)**
- Steps: as the Corp, advance Ice Wall twice. As the Runner, look at it. Compare with Armitage's "12".
- Expected: a counter and money on a card are easy to tell apart.
- Actual: both are yellow discs with a dark number (`phone-21-…ice-wall-2-counters-corp.png`, `phone-small-22-…runner-face-down.png`, `phone-small-10-…armitage-12.png`). Advancement discs were yellow before this sprint. The new credits pill uses the same "credit colour". A player could read the "2" on a face-down Ice Wall as "2 credits on it". The two discs sit in opposite corners (as the plan says), which helps a little.
- Severity: low. A question for the owner or ui-dev: give one of them a different colour or an icon.

**Not a product bug: a hand tap after mixed test touches.** In one QA app-bundle attempt, a hand tap after a lift → let go → Back did not open the view. That attempt mixed two kinds of test touch input. QA could not reproduce it with one input kind: 8/8 tries reopened the view, on both phone sizes. QA's spec was changed to use a single gesture, and the result is not counted.

## Hidden information (what was checked)

- **Engine sweep (QA, 250 random games, 17,784 actions):** after every action, QA checked:
  - every face-down Corp card is a card back in the Runner's view;
  - the Runner gets options only for his own table cards;
  - no Runner event names a face-down Corp card unless the Runner is accessing it;
  - a Corp `card_installed` never carries a card name to the Runner.

  In the sweep, Akitaro was rezzed 150 times and PAD triggered 229 times.
- **Online room (QA, 14 random games, 2366 updates, weighted toward the Sprint 7 actions):**
  - **Every** update each device received is **exactly** that seat's projection of the true game (view and events).
  - No face-down card is named in the Runner's frames.
  - The covered actions include 14 asset rezzes, 38 card abilities, 40 card-credit changes, 34 server removals and 5 Bank Job choices.
- **Online e2e (QA, two browser contexts):** every frame the Runner's device received in the 5 QA online tests was checked:
  - no face-down card is named, and no Corp hand is sent;
  - the Runner gets no options on Corp cards;
  - a Corp install arrives without a card name;
  - no `seed`/`rng`/`deck` field.
- **The one intended reveal: Ice Wall counters.** The Runner sees counters on a face-down Ice Wall. In the real game advancement counters are public, so this matches the card. With these decks, only Ice Wall can be advanced, so a counter on face-down ICE tells the Runner it is Ice Wall. The real Core Set behaves the same way.

## Card text vs behaviour

Card text checked against the official cards (as QA remembers them; the repo has no source for the text).

- **PAD Campaign** (rez 2, trash 4): "Gain 1 credit when your turn begins". Only while face up, before the draw. ✓
- **Akitaro Watanabe** (rez 1, trash 3): "The rez cost of ICE protecting this server is lowered by 2". Its own server only, central servers too, never below 0. ✓
- **Armitage Codebusting** (install 1): 12 credits from the bank; "Click: take 2"; goes to the trash when empty. ✓
- **Akamatsu Mem Chip** (install 1): +1 memory. ✓
- **Cyberfeeder** (install 2): 1 recurring credit, for using icebreakers (break **and** strength). It never pays installs or trash costs. Virus programs are not modelled (there are none in these decks), as logged in DECISIONS. ✓
- **Bank Job** (install 1): 8 credits; remote servers only; replaces access.
  - The card says "any number of credits". The team takes all of them, and this simplification is accepted in the proposal.
  - With these decks, taking fewer could matter in one case only: keeping Bank Job on the table for a later run. The owner can ask for a picker.
- **Ice Wall** (rez 1, strength 1): can be advanced face up or face down; +1 strength per counter; can't be scored. ✓

## The developers' edits to QA-owned tests (DECISIONS 2026-11-14)

QA reviewed each edit. **All keep their intent**; none loosens a check.

| Spec | Edit | QA's view |
|---|---|---|
| `qa-sprint02` | The timed tap is now the tap on the big card, still < 100 ms. "No clicks left" and "Not enough credits" go through `pickHand`. Two desktop tests get 90 s limits. | Agree. The timing and assertions are unchanged; each pick now takes more taps. |
| `qa-sprint03-pass2` | The `advanceBroke` situation and the Advance test now pick an *agenda*. The "no Advance on ICE/assets" test leaves out Ice Wall (`c05`) and still checks the other ICE and assets. | Agree. Ice Wall is advanceable by design now, and the QA engine test covers the other three ICE completely. |
| `qa-sprint04` | After a hold-slide, the view stays open (asserted), then Back or a tap outside closes it. Nothing played, view unchanged, then a pick still works. | Agree. It even adds checks (`drag` null, view equal after closing). |
| `qa-sprint05` | After the ICE report, the hand-view tap and the big-card tap are **both** timed < 100 ms. Carousel tests close the view with Back. | Agree. Stricter than before (two timings instead of one). |
| `qa-sprint06` | "Not your turn": hand cards now open the view for reading. The pick says "Not your turn" and nothing is sent. The "Play on this device" wording is updated. | Agree. The counter of `act` frames sent is still checked after the picks. |
| `qa-sprint04-android`, `qa-sprint06-android` | Button name "Play on this device". | Agree (owner's wording). |
| `apps/server/test/qa-sprint06.test.ts` | 16 random games instead of 12, so the 2000-frame minimum is still reached. **Not listed in DECISIONS**, only in a code comment. | Agree with the change: the minimum is unchanged and more games is stricter. For the record, the list in DECISIONS missed this one. |

## "Device" wording (owner request)

- **Start screen:** "Play on this device" / "Take turns on one screen" / "Each player on their own device". The words "phone" appear nowhere on the home or online pages (QA e2e, 3 sizes, `*-29-…`).
- **Cover:** "Pass to the Runner — tap when ready", on one line (`*-30-…`).
- **Code search:** every other "phone" in `apps/client/src` is in code comments.
- **Exceptions:**
  - "Turn your phone sideways" only appears on upright phones, as the owner decided.
  - The cover still **draws a small phone picture** (no words). This is fine as wording, but the owner may want a different picture since desktops use the cover too.

## Snappiness and empty timing windows

- **Taps:** QA timed these from the moment the game handles the tap until the game changes. All were < 100 ms:
  - Rez, Take 2 credits, Steal, Bank Job's take
  - opening the hand view (< 100 ms until it is drawn)
- **Animations:** every new animation stays inside the budget:
  - asset flip ≤ 300 ms
  - server fold ≤ 200 ms
  - return flight ≤ 150 ms
  - credit pop ≤ 600 ms
  - none blocks input
- **Drag:** see the S-07-6 timing table above.
- **Empty timing windows:** a window is a moment where the game waits for a player's choice. The game still skips one when nobody has a choice.
  - The new Bank Job step appears only when Bank Job holds credits, on a remote. The QA sweep found no case where it appeared without a choice to make (78/78 had the take option).
  - Without a usable Bank Job, the run goes straight to access (E, QA).
  - The Corp's own turn has no new pause: the Corp rezzes assets in its action phase, with no new window (owner answer 3A).

## Sprint 6 S-06-4 "blocked on owner setup": now verifiable

Also recorded as an addendum in `docs/sprints/sprint-06-qa.md`.

| S-06-4 criterion | New result | Evidence |
|---|---|---|
| Once the account exists, updating the game updates the online service by itself (automated) | **PASS** | The `server` workflow's job logs:<br>- 52d38aa (18:27 UTC): skipped with the "secrets not set" notice.<br>- Every push since the secrets were added deployed the live service, and `/health` reported **that exact commit**:<br>&nbsp;&nbsp;- 8295307: on the 2nd try (job 132551978053)<br>&nbsp;&nbsp;- f0c03c5: on the 1st try (job 132557584927)<br>&nbsp;&nbsp;- a9364a1: on the 1st try (job 132564095994, `{"ok":true,"build":"a9364a1676…","protocol":1}`)<br>&nbsp;&nbsp;- 0865b64: on the 1st try (job 132576325600)<br>The deploy shows `OVERCLOCK_TEST_MODE ("0")` and the service address `wss://overclock.patrickmedaugh.workers.dev`. |
| Web link and app both play online; web device vs app device | **Builds PASS; live play = owner check 1** | Built correctly for the live service:<br>- **Web:** Pages deploy of a9364a1 is built with `OVERCLOCK_SERVER_URL=wss://overclock.patrickmedaugh.workers.dev` (deploy log). A local build with the same setting has CSP `connect-src 'self' wss://overclock.patrickmedaugh.workers.dev` and nothing else.<br>- **App:** `app-sprint-07` (android log: same address, `check-android-bundle: OK`). The app build's CSP is the same.<br>- **Service:** its allowed list includes `https://patrickmedaugh.github.io` and `https://localhost` (the app).<br>QA can't reach `workers.dev` or `github.io` from this sandbox (the proxy refuses), so a game against the **live** service was not played by QA. The same Worker code is played online in every QA/P online test against `wrangler dev`. |
| Nothing charged, no card needed | **Owner check 4** (unchanged) | Only the owner can see the Cloudflare account. |

## Owner checks (things only you can do)

1. **Online play against the live service on two real devices**, e.g. one phone on the web link and one on the app. In a game:
   - rez PAD Campaign and see +1 credit on both devices at the Corp's turn start;
   - take 2 credits from Armitage;
   - make a Bank Job run.
   - Also: start a game and tap Back; your friend should get "No game with that code".
2. **Drag on a real Android phone.** In the app:
   - tap the hand, hold a card, drag it onto a lit place: it should follow the finger smoothly;
   - swipe in from the screen edge mid-drag: the card should go back and nothing is played.
3. **Read the table at small size.** Is the "12"/"8" on Armitage / Bank Job clear enough, and can you tell it from the advancement counters on Ice Wall (QA-S7-1, QA-S7-2)?
4. Your Cloudflare dashboard shows no charges.
