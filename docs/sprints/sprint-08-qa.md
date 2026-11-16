# Sprint 8: QA report

QA date: 2026-11-16 · Branch `sprint-08` · Code checked at **6027b22**. QA tests and screenshots were added in **ef61360**, which changes no product code. QA did not write the code it checked.

**Summary: 36 acceptance criteria. 34 PASS, 2 FAIL.** Both failures are small screen-text problems, not rules problems:
- **QA-S8-1:** Melange Mining Corp. says "No clicks left" when the Corp still has 1 or 2 clicks.
- **QA-S8-2:** Heimdall 1.0 against Corroder: the screen never adds up the total price.

QA also found **1 low-severity cosmetic issue** (QA-S8-3). The card data matches the 2012 Core Set, both decks follow the deck rules, and no hidden card leaked in any check.

**What CI checked on ef61360 (includes every QA test):**
- `checks` passed: lint, typecheck, **1768 unit tests**, and the `wrangler dev` integration check.
- Full screen-test suite, all 4 parts: **1062 passed / 6 skipped / 0 failed / 0 flaky**.
  - Parts 1 to 4: 266 / 265 / 265 / 266 passed.
  - The 3 "✘" lines for `QA-S8-1` in the log are QA's expected failures, and they count as passed. That test is marked "expected to fail" while the bug is open. Once the bug is fixed it will report "unexpected pass", so CI will flag the fix.
- `guard-mutation`, `android` (build + publish), `deploy` (web) and `server` all passed.
- **Live service:** the `server` job (133034316257) deployed ef61360, and `/health` reported `{"ok":true,"build":"ef6136088621…","protocol":1}` on the 2nd try. The 1st try still showed 6027b22.

The code commit 6027b22 also passed CI on its own: 1720 unit tests, and e2e 1008 passed / 6 skipped / 0 flaky. Its `server` job (133023890565) got `/health` = `6027b22cde3c…` on the 1st try. The deploy log shows `OVERCLOCK_TEST_MODE ("0")`.

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

**QA's tests (in ef61360):**
- `packages/engine/test/qa-sprint08.test.ts` (37 tests): QA's own table of 2012 card numbers and texts, QA's own deck count, rule edge cases, and a sweep of 150 random core-deck games (12,515 actions) checked against QA's own bookkeeping.
- `apps/server/test/qa-sprint08.test.ts` (11 tests): the online room.
  - 16 random production-rules games, 2522 updates: every frame was checked exactly.
  - Rototurret / Construct (5 seeds), Viktor and Battering Ram over the sockets.
  - A production room ignores a test `deckSet`.
- `apps/client/e2e/qa-sprint08.spec.ts` (19 tests × 3 sizes, real taps).
  - Includes one "expected to fail" test for QA-S8-1.
  - QA's last local run: 54 passed + 3 expected failures on the three sizes.

Screenshots are in `docs/sprints/sprint-08-qa/`, named `<size>-NN-<what>.png`. Every new tap was timed: from the moment the game handles the tap until the game changes, it took < 100 ms.

## Acceptance criteria

### S-08-1 Play as real identities

| Criterion (short) | Result | Evidence |
|---|---|---|
| New game (pass-the-phone or online): Haas-Bioroid and Kate sit on the table; holding either zooms it so its full text is readable | **PASS** | QA e2e (3 sizes, real hold):<br>- Both cards are drawn for both seats (`*-01`, `*-04`).<br>- The zoom has no text overflow, and every word of the card text is drawn (`*-02/03-identity-zoom-*`).<br>QA room: the first frame each device gets names both identities (`id:corp`/c13, `id:runner`/r13). P `s08-identity`, `s08-online`. |
| Corp's first install of the turn (any type) +1 credit with the note; the second install gives nothing | **PASS** | QA e2e: real tap, credits = before − price + 1, note "Engineering the Future: +1 credit" (`*-05`). A second install gives no trigger and no credit.<br>QA engine:<br>- ICE on HQ (a central server) first gives +1. An upgrade second gives nothing.<br>- Biotic Labor + 3 installs in one turn still give +1 only once.<br>- A Runner install never gives it.<br>QA sweep: 889 first-install credits. Every Corp install was checked: the credit came exactly on the first install of that turn. |
| Runner, no program/hardware yet: Corroder's lit place shows **1** and costs 1 | **PASS** | QA e2e: the lit place reads "Install · 1 credit (−1)" and the tap takes exactly 1 (`*-06-kate-corroder-price-1`). |
| After a program/hardware, the next is full price; a resource first does not use the discount | **PASS** | QA e2e: Armitage/Bank Job was installed first and Corroder still cost 1. Afterwards every program/hardware in the Grip shows full price with no "(−1)".<br>QA engine:<br>- Cyberfeeder (hardware) first, then Corroder costs 2.<br>- Sacrificial Construct (a free resource) and Easy Mark first, then Battering Ram costs 4.<br>QA sweep: every Runner install price equals QA's own sum. The Kate note appeared exactly when the price dropped (199 times). |
| Akamatsu Mem Chip first costs 0 (automated) | **PASS** | E `sprint08-identities` AC5. QA sweep: free first installs never showed the note and never went below 0. |
| Online: same credits as pass-the-phone (automated) | **PASS** | QA room sweep: every frame equals the seat's projection, with 87 Haas-Bioroid and 23 Kate triggers. P `s08-online` (two contexts). |

### S-08-2 Adonis Campaign, Melange Mining Corp., Biotic Labor

| Criterion (short) | Result | Evidence |
|---|---|---|
| Rez Adonis (**Rez · 4 credits**): 12 on the card, seen by both | **PASS** | QA e2e: the button is ≥ 44 px, the tap costs 4, the card shows "12", and the Runner's board shows the face-up card with "12" (`*-07`, `*-08`). |
| Corp turn start: 3 move to the Corp with the note; empty: to Archives | **PASS** | QA e2e: "Adonis Campaign: +3 credits", 12 → 9, Corp +3 (`*-09`).<br>QA engine:<br>- Exactly 12 credits in total over the card's life, then the card is face up in Archives.<br>- A Runner trashing a face-up Adonis that holds 9 gives the Corp nothing.<br>- A face-down Adonis can be trashed for 3 and never had credits.<br>QA sweep: 281 takes and 41 emptied; no card ever gave more than 12. |
| Melange with 3 clicks: **Gain 7 credits · 3 clicks**, uses all 3, +7. **With fewer than 3 clicks: dimmed and says why** | **FAIL** (QA-S8-1) | The working part passes: QA e2e real tap gives +7 credits and 0 clicks (`*-11`). With 2 clicks the button is dimmed and a tap changes nothing.<br>**But it says "No clicks left" while the Corp has 2 clicks** (`*-10-melange-dim-2-clicks`). The reason given is wrong. |
| Biotic Labor: +2 clicks, usable this turn | **PASS** | QA e2e: the counter reads 4 and all 4 clicks are used (`*-12`). QA engine: the next Corp turn starts at 3 again. Melange is usable after Biotic Labor brings the Corp from 1 to 3 clicks. |
| Face-down Adonis/Melange: nothing happens, nothing leaks (automated) | **PASS** | QA engine:<br>- The Corp gets only "Rez" on a face-down card.<br>- The Runner's view has no card name, no credits and no option on it.<br>QA sweep, after every action:<br>- No face-down Corp card ever holds credits.<br>- No face-down Corp card has an option other than rez/advance/score.<br>- No face-down Corp card ever triggers.<br>- No Runner event names a face-down card.<br>E `sprint08-hb-money` AC5. |
| Online: same as pass-the-phone (automated) | **PASS** | QA room sweep: 29 Adonis triggers and 10 Melange uses, every frame exact. P `s08-online`, E `sprint08-parity`. |

### S-08-3 Viktor 1.0, Heimdall 1.0, brain damage

| Criterion (short) | Result | Evidence |
|---|---|---|
| Viktor fires: 1 random Grip card to the Heap, max 5 → 4, run ends; a message names Viktor | **PASS** | QA e2e: button "Let it fire: take 1 brain damage, run ends". The report names Viktor 1.0 and brain damage (`*-13-viktor-report`). QA engine: with exactly 1 Grip card he loses it, max 4, and there is no flatline. |
| "Hand max 4" shown; end of turn discards down to 4 | **PASS** | QA e2e: the "Hand max 4" tag shows by the Runner's credits (`*-14`). After draws, End turn asks to discard down to 4 (`*-15-discard-down-to-4`). QA engine: at max 3 with 4 cards he discards exactly 1, and the wrong count is refused. |
| Heimdall (6) vs Corroder (2): breaking all three needs +4 first, **and the price shown adds that up** | **FAIL** (QA-S8-2) | The rules part passes:<br>- QA e2e: each Break is dimmed "Raise strength first" until 4 pumps. After 4 real pump taps and 3 breaks, exactly 7 credits are spent (`*-17`).<br>- QA engine: same result.<br>**But the screen never shows a total.** Each Break says "· 1 credit" and the pump says "+1 strength · 1 credit" (`*-16-heimdall-corroder-prices`). No "7" or "4 + 3" appears anywhere. |
| Empty Grip + brain damage: flatline, Corp wins (automated) | **PASS** | QA engine: Heimdall with an empty Grip ends the game at the first subroutine; no more subroutines fire and nobody can act. QA sweep: 49 flatlines by brain damage. E AC4. |
| Hand limit below 0 at end of turn: flatline (automated) | **PASS** | QA engine: at 6 brain damage, End turn with an empty Grip gives only `game_over{corp, flatline}`. E AC5. |
| Online: both devices show the lower limit and the same lost card face up (automated) | **PASS** | QA room (seeds 1, 42): both devices get max 4, the same Heap top card, and the same `brain_damage` event. P `s08-online`. |

### S-08-4 Sure Gamble, Magnum Opus, Pipeline, Battering Ram

| Criterion (short) | Result | Evidence |
|---|---|---|
| Sure Gamble: 5 → 9 | **PASS** | QA e2e: real tap (`*-22`). QA engine: with 4 credits it is refused (`no_credits`). |
| Magnum Opus: **Gain 2 credits · 1 click**, never runs out | **PASS** | QA e2e: every click is used, +2 each, and the card is still on the table (`*-21`). QA engine: 11 uses over 3 turns. |
| Pipeline vs Neural Katana: 2 credits twice, then 1 credit breaks; extra strength for the run | **PASS** | QA e2e: pump "· 2 credits" twice, "Pipeline 3", the break costs 1, 5 credits in total (`*-20`). QA engine: the boost carries on to Rototurret later in the same run. |
| Heimdall + Battering Ram: **Break up to 2 · 2 credits**, pick two, one payment | **PASS** | QA e2e: real taps on subroutines 1 and 3, then "Break 2 · 2 credits". Result: subroutines 1 and 3 broken, −2 credits (`*-18`, `*-19`).<br>QA engine:<br>- Refused: descending order, three subroutines, a subroutine already broken, and duplicates.<br>- Wall of Static offers only one choice; a code gate offers none.<br>- The pump lasts into the next barrier of the run. |
| Ram + Gordian + Pipeline + Magnum Opus with no Akamatsu: "Not enough memory" | **PASS** | QA e2e: QA's own planner reached a board with 4/4 memory used. The program in hand is dimmed, and a tap shows "Not enough memory"; the rig is unchanged (`*-23`). QA engine: `no_memory` both as a listed reason and when the action is applied. |
| Online, Ram's two-at-once break: same as pass-the-phone (automated) | **PASS** | QA room (seeds 1, 42): after 3 pumps, `subs:[0,2]` gives the same `subroutine_broken` 0 and 2 on both devices, and both show broken = [true, false, true]. P `s08-online`. |

### S-08-5 The two 30-card decks

| Criterion (short) | Result | Evidence |
|---|---|---|
| R&D 25 before the first draw, Stack 25 | **PASS** | QA engine, seeds 1–200: Stack 25 + Grip 5. The Corp holds 6 after its mandatory first draw, so R&D held 25 before it.<br>Note for the owner: the R&D badge at the start reads **24** because the Corp has already drawn (`*-02`). |
| 30 cards, ≤ 3 copies, own-faction/neutral agendas, influence ≤ 15 (automated) | **PASS** | QA engine, with QA's own arithmetic (not `checkDeck`): Corp influence 9/15, Runner 14/15. Hostile Takeover and Ninja are out. E `sprint08-decks`. |
| 15 agenda points (3 Priority Requisition, 3 Private Security Force) (automated) | **PASS** | QA engine: 15 points in every deal, seeds 1–200. |
| Every card works as the table says; no invented card (automated) | **PASS** | QA engine: QA's own table of the 2012 Core Set (all 36 cards, see below), the new cards' text, and the subroutine order. E `no-invented-names`, `sprint08-decks`. |

### S-08-6 QA-S7-1 and QA-S7-2

| Criterion (short) | Result | Evidence |
|---|---|---|
| 640×360: Armitage, Bank Job, Magnum Opus, Adonis: full name, type and credits readable, nothing covering | **PASS** | QA e2e, with QA's own check: the full name is drawn, the name and type boxes sit inside the card, the credits pill is clear of both, and no other card overlaps.<br>- Armitage 12 (`phone-small-32`)<br>- Bank Job 8 (`-33`)<br>- Adonis 12 on both seats (`-08`)<br>- Magnum Opus (no credits on it; name and PROGRAM line)<br>P `s08-markers`. |
| 844×390: same (automated) | **PASS** | Same QA tests on `phone` and `desktop`. |
| Advanced Ice Wall and Armitage with credits together: tell them apart (colour + icon) | **PASS** | QA e2e: QA's planner put both on the table at once. Ice Wall has a green chevron "2" tag; Armitage has a gold coin pill; the two colours differ. Checked from both seats (`*-34`, `*-35`). |

### S-08-7 Rototurret and Sacrificial Construct

| Criterion (short) | Result | Evidence |
|---|---|---|
| "Trash 1 program" fires: a program of the Corp's choice to the Heap (none if no program) | **PASS** | QA e2e: the Corp gets one lit ≥ 44 px button per program (`*-25`).<br>QA engine:<br>- Only programs are offered: never hardware, resources or the Construct. Their uids are refused (`bad_target`).<br>- One program and no Construct: it is trashed with no question (snappiness rule).<br>- The trashed program frees its memory. |
| "End the run" fires: the run ends | **PASS** | QA engine (several tests). If Pipeline breaks "Trash 1 program", only the run ends and nothing is trashed. |
| Construct installed: "Save it? Trash Sacrificial Construct instead" | **PASS** | QA e2e: "Rototurret: trash Gordian Blade?" with "Trash Sacrificial Construct instead" / "Let it be trashed" (`*-26`). Saving keeps the program, puts the Construct in the Heap, and the report says so (`*-27`). QA engine: with one program + Construct the Runner is asked directly, and once the Construct is gone the next hit just trashes. |
| Declines (or no Construct): to the Heap as normal | **PASS** | QA e2e online: "Let it be trashed", and the program leaves both boards (`*-31`). E `sprint08-rototurret`. |
| Pass-and-play and online work the same (automated) | **PASS** | QA e2e pass-and-play, cover on, real taps: Runner → cover "to the Corp" (full-screen, `*-24`) → Corp picks → cover back → Runner saves.<br>QA e2e online, two contexts, seed 9:<br>- The Runner's device shows "Corp is choosing…" with no buttons (`*-28`). The Corp picks on its own device (`*-29`).<br>- The Corp's device shows "Runner is choosing…" while the Runner decides (`*-30`).<br>- Both devices equal a `LocalMatch` with the same moves.<br>QA room: 5 seeds, every frame exact. |

## Bugs / findings

**QA-S8-1: Melange Mining Corp. says "No clicks left" when the Corp still has 1 or 2 clicks (Low–Medium, wrong reason on screen)**
- Steps:
  1. Corp's turn. Install Melange Mining Corp. and rez it (rez costs no click), so the Corp has 2 clicks left.
  2. Tap Melange.
- Expected: the dimmed "Gain 7 credits · 3 clicks" button says why it can't be used, e.g. "Needs 3 clicks".
- Actual: the dimmed button reads "No clicks left", while the click counter shows 2 (`phone-10-melange-dim-2-clicks.png`). The engine's reason `no_clicks` is turned into text by `hintFor` (`apps/client/src/hints.ts`), which always says "No clicks left". It was written when every action cost exactly 1 click.
- Severity: low–medium. It breaks the "says why" part of S-08-2 AC3. A first-time player would think the click counter is wrong.
- Test: `qa-sprint08.spec.ts` "QA-S8-1: …", marked expected-to-fail. Remove the `test.fail` line when fixing.

**QA-S8-2: Heimdall 1.0 vs Corroder: the screen never adds up the price (Low, criterion wording)**
- Steps: run on a server with a rezzed Heimdall 1.0 while Corroder is the only barrier breaker (planner goal `heimdall_corroder_encounter`, seed 1).
- Expected (S-08-3 AC3): "breaking all three subroutines needs +4 strength first, and the price shown adds that up". That means a visible total: 4 + 3 = 7 credits.
- Actual (`phone-16-heimdall-corroder-prices.png`): the panel shows "Strength 6", "Corroder 2", "+1 strength · 1 credit", and three dimmed "Break "…" · 1 credit" buttons. No total is shown anywhere. The rules are right (7 credits are spent). The developers' tests check only the rules and that the buttons exist.
- Severity: low. If the owner is happy with per-button prices, the pm can reword the criterion instead.

**QA-S8-3: A note can cover the run panel's subroutine list (Low, cosmetic)**
- Steps: let Rototurret fire with 2 programs, then look at the Corp's choice screen (`phone-25-rototurret-corp-picks.png`, `phone-small-28-…`).
- Actual: the "Rototurret: Trash 1 program" note sits over the subroutine lines of the run panel for about 1.4 s. The phone-16 screenshot shows the same with an earlier note. The buttons are not covered, and the note does not block input.
- Severity: low.

**Timing note (not a bug):** in QA's first 3-worker local run, one Viktor "Let it fire" tap at 640×360 took 192 ms until the state changed. Repeats gave no slow tap:
- 12 runs alone (phone + phone-small): all passed;
- 9 runs with 3 workers: 11–52 ms, recorded;
- CI: every QA tap test passed with no retry.

It looks like local load, but a real device is owner check 2.

## Card text, costs and influence vs the 2012 Core Set

QA wrote its own table from memory of the official 2012 cards (`CORE_2012` in the QA engine test) and compared all 36 cards field by field. **Everything matches.** That covers name, faction, influence, cost, type, subtype, strength, memory, trash cost, agenda numbers, and identity 45/15 with Kate's 1 link. The corrected influence values in DECISIONS (Adonis 2, Heimdall 2, Rototurret 1, Neural Katana 2) agree with QA's memory, and so does the full stop in "Melange Mining Corp.".

The texts of the 12 new cards also match QA's reading of the 2012 print:
- Battering Ram's and Pipeline's "for the remainder of this run" is the printed text. The tech plan's "encounter" was the error, and the data is right.
- Viktor and Heimdall: "Do 1 brain damage" with no click-break line, correct for 2012.
- Rototurret: "Trash 1 program."
- Sacrificial Construct: the original "Prevent an installed program or an installed piece of hardware from being trashed".

**Haas-Bioroid's wording:** the 2012 print may say "Whenever you install a card, if it is the first card you install this turn, gain 1 credit." The data says "The first time you install a card each turn, gain 1 credit." The effect is identical. QA does not count this as a defect; DECISIONS already notes it.

**Deck rules:** both decks are legal by QA's own arithmetic.
- Corp: 30 cards, 9/15 influence, 15 points, neutral agendas only.
- Runner: 30 cards, 14/15 influence.
- The proposal stated these deck rules: max 3 copies, own-faction/neutral agendas, influence ≤ 15, and the house size of 30.

**IP check:** no images were added, and every card uses a runtime-drawn `glyph:` art key. Real names and text are allowed by the owner's rule 3. Nothing is published.

## Review of DECISIONS entries (QA sign-off)

| Entry | QA's view |
|---|---|
| Corp deck: Rototurret ×2 in place of 1 Wall of Static + 1 Enigma | **Sign off.** Required for S-08-7 ("Rototurret in its deck"); the list is still legal. |
| Battering Ram cut fallback (withdraws the illegal "second Corroder") | **Sign off.** Not used, because Ram shipped. The math (15/15) is right. |
| Corrected influence / Melange name / Ram "for this run" | **Sign off.** Matches QA's table. |
| 2012 wording kept (brain damage, no click-break, original Rototurret/Construct text) | **Sign off.** Matches the owner's rule (real 2012 cards). |
| Hidden-info allowlist (1): the Corp identity is public | **Sign off.** In the real game it is face up. The check pins it to the state's identity, and it is the only Corp card id allowed in the identity field. |
| Allowlist (2): `corp_card_trashed` / same-batch `ability_triggered` may name a card face up in Archives | **Sign off, with a note.** The check matches by card id, not uid: another face-up copy in Archives would satisfy it. QA's own sweep closes the gap: every `corp_card_trashed` was checked to be a card that was **rezzed before** the action (41/41). |
| Allowlist (3): an in-run choice may name the rezzed current ICE | **Sign off.** Narrow: it must be the run's current ICE and rezzed. In `qa-sprint03-pass2` it is also limited to non-`free_rez` choices. |
| Edits to QA-owned specs (`qa-sprint03-pass2`, `qa-sprint05`, `qa-sprint06`, `qa-sprint07`, `qa-sprint07-android`, `qa-s03-scenarios`, `qa-no-empty-windows`; also `s02-qa-fixes`) | **Agree.** QA read every diff.<br>- Each one is a deck-set pin (`deckSet: 'starter'` / `decks=starter`) or an import move. No assertion was loosened.<br>- `qa-sprint03-pass2` also gains a 100-game core-deck run of its own checks, which is stricter.<br>- `s02-qa-fixes` (a developer spec about a QA finding) now leaves identities out of the "longest name" check. That is fair: identities are read in their own slot and zoom, which QA checked. |
| Online stall on an away Corp's Rototurret choice | **Agree** for this sprint: same as the existing rez window. |
| `RULES_VERSION = 2` | **Confirmed** (QA engine). Live games on the old rules end on deploy, as the proposal says. |

## Hidden information (what was checked)

- **Engine sweep (QA, 150 core-deck games, 12,515 actions), after every action:**
  - Every face-down Corp card is a card back in the Runner's view, holds no credits, and gets no Runner option.
  - The Corp gets only rez/advance/score on face-down cards.
  - No Runner event names a face-down card outside access.
  - `installedThisTurn` never appears in either view.
  - During a Corp choice the Runner's choice has no options.
  - Replay gives the same state.
- **Online room (QA, 16 games, 2522 updates, production rules):**
  - Every frame each device got is exactly that seat's projection.
  - Runner frames: no Corp hand, no face-down card named, and options only on his own cards.
  - Corp frames: no Grip, and Runner draws carry no card id.
  - No `seed`/`rng`/`deck`/`installedThisTurn` field.
  - In an in-run choice, the waiting seat gets no options and the run stays visible to both.
- **Rototurret / Construct over sockets (5 seeds):** the same checks on the `trash_target` and `prevent_trash` frames. A Runner move during the Corp's pick is refused to him only (`not_your_turn`); the Corp gets nothing.
- **Online e2e (two contexts):** every frame both devices received in the Rototurret game passed the same checks.

## Snappiness and empty timing windows

- **Taps:** every new tap took < 100 ms until the game changed:
  - Haas-Bioroid install, Kate install, Rez Adonis, Melange, Biotic Labor
  - Viktor let-fire, Ram "Break 2", Magnum Opus, Sure Gamble
  - Corp pick, Construct save
- **Animations:** every new animation is ≤ 600 ms. Notes and the ICE report do not block input.
- **Empty windows:**
  - `trash_target` opens only with ≥ 2 programs. With 0 or 1 there is no question.
  - `prevent_trash` opens only when a Construct can save the card, and always offers save or decline.
  - The QA sweep checked that every open choice was a real decision (3 Corp picks, 7 Construct questions, 5 saves).
  - The 300-game developer property test and QA's `qa-sprint03-pass2` core-deck run check that no other empty window exists.

## Owner checks (things only you can do)

1. **Play online against the live service on two real devices** (QA can't reach `workers.dev` from here). Check:
   - the identities on both screens;
   - a Rototurret pick on the Corp's device while the Runner's device shows "Corp is choosing…";
   - Viktor's "Hand max 4" on both devices.
2. **Feel on a real phone:** Battering Ram's "Break up to 2", then tap two subroutines, then "Break 2"; holding an identity card to read it; the Viktor tap.
3. **Read the table at 640×360:** are the identity cards and "Hand max" easy to read?
4. **Decide on QA-S8-2:** should the screen show a total price when a breaker must raise its strength first (e.g. "7 credits to break all")? Or are per-button prices enough?

---

## Round 2 (2026-11-16)

**Code checked at d207696.** The fixes since round 1 are:
- 3b74ab5: QA-S8-1.
- 166d714: the engine's new `RunView.breakAll`.
- bf6b4d3 and d207696: the "Break all" line in the client, and toasts moved to the End turn slot (QA-S8-3).

QA's round-2 tests are in **9d3751d**, which changes no product code. QA did not write the fixes.

**Summary: 36 acceptance criteria. 36 PASS, 0 FAIL.**
- QA-S8-1, QA-S8-2 and QA-S8-3 are **fixed and verified**.
- No new bugs.
- One owner check is added: the size of the run panel's text at 640×360.

**CI:**
- **d207696** (the last code commit): all green. 1063 passed / 6 skipped / 0 flaky, all 4 parts (266 / 265 / 265 / 266).
- **9d3751d** (QA tests): all green. `checks` passed with **1777 unit tests**.
  - Screen tests, all 4 parts: 1058 passed + 2 flaky / 6 skipped / 0 failed.
  - The 2 flaky tests are older QA timing checks. Each failed its 1st try and passed its CI retry:
    - `qa-sprint05` "slide the moment the zoom opens", desktop: 467 ms on the 1st try.
    - `qa-sprint07` "drag latency", phone-small: 508 ms on the 1st try.
  - These parts ran at 14–16 min instead of the usual ~8. The product code is identical to d207696, where both passed first time.
  - QA repeated just these two locally (allowed for timing tests): **5/5 and 5/5 passed**. QA reads this as a slow CI machine, not a regression. If it comes back, these two are the ones to watch.
- **Live service:** `/health` reported `9d3751d…` on the 1st try. That is the deploy of the QA test commit, which carries d207696's product code.
- As before, "Workers Builds: overclock" is ignored.

**Correction to round 1:** `qa-sprint08.spec.ts` has **18** tests, not 19, which makes 54 runs over the three sizes. Round 1's "54 passed + 3 expected failures" should read **51 passed + 3 expected failures = 54**. QA's local run in round 2: **54/54 passed**.

### Re-checked criteria

| Criterion | Round 2 | Evidence |
|---|---|---|
| S-08-2 AC3: Melange with fewer than 3 clicks is dimmed **and says why** | **PASS** (QA-S8-1 fixed) | QA e2e (3 sizes), now asserting the right words:<br>- With 2 clicks the dim button's note is "Needs 3 clicks". A tap shows the hint "Needs 3 clicks" and changes nothing in the game.<br>- At 0 clicks it still says "No clicks left" (`*-36-round2-melange-needs-3-clicks`).<br>- The "+7 · 3 clicks" part was re-run and still passes. |
| S-08-3 AC3: Heimdall vs Corroder needs +4 first, **and the price shown adds that up** | **PASS** (QA-S8-2 fixed) | QA e2e (3 sizes): the run panel shows **"Break all: 4 + 3 = 7 credits"** (`*-16`). After the 4 pump taps it shows "Break all: 3 credits". The real taps spend exactly 7.<br>QA engine: Corroder {7 = 4 + 3} and Battering Ram {7 = 3 + 4} side by side. With 6 credits, neither can break it all, and the panel adds no line. One Ram pump lowers Ram's plan to 6. |
| QA-S8-3: no note over the run panel | **Fixed** | QA e2e (3 sizes): a deterministic toast during a run (tap a dim Break: "Raise strength first") is clear of the run panel and of every run button. It sits in the End turn slot, which is hidden during runs (`*-37-round2-toast-clear-of-run-panel`). The Rototurret note on the Corp's pick screen is checked the same way. |

### breakAll never leaks hidden information (QA's own probe)

New in `packages/engine/test/qa-sprint08.test.ts`: 120 random core-deck games. Two thirds of them give the Runner 40 credits so that more full breaks are affordable. At 908 encounters with rezzed ICE, QA checked:

- The **Corp's view** always gets `breakAll = []`. Every other run step gets `[]` too.
- **Each entry equals QA's own price**, worked out from card data: pumps up to the ICE's current strength (Ice Wall counters included), then breaks of the unbroken subroutines, 1 or 2 at a time. This covered 275 entries, 59 of them with pumps.
  - A breaker of the right type is missing only when the Runner can't pay: never while his own credits cover QA's price.
- **Hidden-info invariance:** at all 923 encounters QA built a second game that differs only in hidden Corp information:
  - the HQ cards swapped for others;
  - R&D order reversed;
  - every face-down card on the table (other than the current ICE) changed to a different card.

  The Runner's `breakAll` was identical every time.
- The real state is untouched by the throw-away preview.
- Face-down ICE is never *encountered* (it is passed at approach), so the "face-down ICE gives `[]`" guard never fired. The engine code returns `[]` for it.

### Mutation checks (each mutation was reverted; the source is clean)

| Mutation | Caught by |
|---|---|
| Engine: a break costs 1 whatever its price | QA engine probe and the Heimdall test (Ram's 2-credit break) |
| Engine: the plan breaks the *fewest* subroutines per payment (Ram one at a time) | QA engine probe ("expected 9 to be 7") and the Heimdall test |
| Engine: drop the "Runner's view only" guard | **Not caught: equivalent mutant.** The Corp's view never has breaker options, so its list stays empty either way. The probe checks the result directly. |
| Client: `clicksHint` always "No clicks left" | QA e2e QA-S8-1 |
| Client: no "Break all" line | QA e2e Heimdall |
| Client: toasts back in the old hint slot during runs | QA e2e Heimdall ("toast over the run panel", phone and phone-small) and the Rototurret pass-and-play test ("note over the run panel") |

### Developers' and architect's edits to QA-owned specs

| Spec | Edit | QA's view |
|---|---|---|
| `qa-sprint08.spec.ts` | Removed only the `test.fail` marker on QA-S8-1 | **Agree.** QA has now rewritten that test to assert the fixed words ("Needs 3 clicks"; "No clicks left" at 0) and updated its comment. |
| `qa-sprint03.spec.ts` "Enigma vs Gordian Blade" | The exact line list gains `'Break all: 2 credits'` | **Confirmed.** Gordian Blade 2 vs Enigma 2 needs no pump; 2 subroutines × 1 credit = 2, so the line has no "+". No assertion was loosened. |

### Regression check of nearby criteria

- The full QA e2e spec passed on all 3 sizes (54/54). Re-checked this way:
  - S-08-1 notes and Kate's price, Adonis, Biotic Labor;
  - Viktor's report, "Hand max 4" and discard down to 4;
  - Battering Ram break-2, Pipeline (also shows "Break all: 4 + 1 = 5 credits"), Magnum Opus, Sure Gamble, "Not enough memory";
  - Rototurret and the Construct through the cover and online, with frame checks;
  - QA-S7-1/2 markers.
- All QA engine (39) and room (11) tests pass.
- The developers' `s03-encounter` now expects the Break all lines for Wall of Static vs Corroder ("1 + 1 = 2 credits", then "1 credit"). QA checked these by hand: correct.
- **Snappiness:** every QA tap is still < 100 ms. The toast now uses End turn's slot during runs; End turn can't be used during a run, so nothing usable is hidden.

### Owner check added

5. **Run panel text on the smallest phone.** At 640×360, with a 3-subroutine ICE (Heimdall 1.0), the smallest text in the run panel is **8.3 px** (QA measure; 10 px at 844×390, 12 px on desktop). It was about 9 px before the new "Break all" line.
   - Screenshot: `phone-small-16-heimdall-corroder-prices.png`. It looks crisp on a 2× screen.
   - Please check on your real phone: can you read the run panel during a Heimdall encounter?
   - The architect accepted this for Sprint 8 as an owner check. If it's too small, a wider panel during runs goes on the backlog.
