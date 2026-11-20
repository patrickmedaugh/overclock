# Sprint 14 QA report

## Round 1 (2026-11-20, code at c65be96; branch head b70570b adds only STATE.md)

QA did not write the Sprint 14 code. Every criterion was checked by QA's own tests as well as the developers'. QA's tests use separate browser contexts as separate devices (each with its own storage and its own "IP" for the wrong-code limit, `?deckip=`) against the real online service running locally (`wrangler dev`, test mode), and drive everything by taps where a person would.

**Result: all 4 stories pass QA (S-14-1, S-14-2, S-14-3, S-14-4). No bugs found.** Two criteria can only be checked by the owner on real hardware and the real Cloudflare service (S-14-2 AC7 phone + Android app; the real deploy). They are recorded as **manual owner checks**, not as passes.

### QA's tests (new in this round)
- `apps/client/e2e/qa-sprint14.spec.ts`: 12 tests, run on `phone-short` (891×296, the owner's phone, added to `SHORT_SPECS`), `phone` (844×390), `phone-small` (640×360) and `desktop` (1280×800). `QA_SCREENS=1` writes the screenshots in `docs/sprints/sprint-14-qa/`. They include:
  - an empty device, by taps: first own deck → "✓ Saved online"; offline rename → pending line; back online → saved by itself; a second device linked with the code sees the offline edit;
  - two devices that **both** have a deck called "My Corp deck 1" link → both have both, plus the other's decks (Q2 A); the first device's open Decks list updates by itself;
  - **both devices offline**: the same deck renamed on each (the later rename wins on both), different decks renamed on each (all kept), a deck deleted on one while the other still had it (stays deleted);
  - clearing the **same** browser's storage, reloading, typing the code with dashes → every deck back with its exact cards;
  - 5 wrong codes → "No decks with that code" ×5, then "Too many wrong codes. Try again in 1 minute." with the box disabled; the device can still build decks;
  - a **whole online game to game over** with own decks on both sides (host Runner, guest Corp: a mix the developers' specs don't play), moves chosen at random from each phone's legal moves; every frame both phones received is checked;
  - Leave for now → rename and delete the dealt deck → Continue game: same Grip and deck size; the Corp phone loses signal and comes back: same HQ;
  - a deck tampered with on **join** (too few cards) → the guest's phone says "This deck isn't ready to play: 43 cards short", no game, host hears nothing; picking again starts the game;
  - a real protocol-1 (Sprint 13 app) frame sent to the real local service → `error version`;
  - a friend with no own decks joins straight in with the standard deck;
  - upright phone → "Turn your phone sideways" over My deck code, the link screen and the online deck picker;
  - tap-to-paint on My deck code, I have a deck code and a deck in the online picker.
  - Each also checks 44 px targets, text ≥ 10 px and that everything is inside the screen on the screens it opens.
- `apps/server/test/qa-sprint14.test.ts`: 16 Vitest tests through the deck service's real HTTP handler: 9 kinds of damaged upload and 2 kinds of far-too-big upload refused with nothing saved changed (and no new locker); two devices editing offline in both upload orders; a delete versus a stale copy versus a later edit; linking with same-named decks; the wrong-code limit (5 free, then a wait; the right code also waits; another device not affected; the wait ends and the count resets; waits grow and stop at 1 h).

### Runs
- `qa-sprint14.spec.ts`, 4 sizes, `--retries=0`: **47 passed, 1 skipped** (upright check on desktop: phones only). Phone-short was run first on its own (12/12 after fixing QA's own name lists to leave out the standard decks), then all 4 sizes together.
- Timing (the only timing criterion, the snappiness budget): tap-to-paint re-run `--repeat-each=5` on desktop and phone-short: all under 100 ms (desktop 6–20 ms, phone-short 24–36 ms). One earlier desktop reading of 90.8 ms happened while 4 whole-game tests ran in parallel; still under budget.
- `qa-sprint14.test.ts`: **16 passed**.
- `npm run test:dev -w apps/server` (real Worker and Durable Objects under `wrangler dev`): **all checks passed**, including "after a restart the decks are still there" and "the wait survives the restart too".
- `npm run lint`, `npm run typecheck`, `npm test` with QA's tests added: all pass.
- **Full e2e pass (CI):** CI on c65be96 (`c65be9630c7438c080d1f16a8de27c6b1602660c`) was **cancelled** by GitHub because the STATE-only commit b70570b was pushed right after it (its e2e/checks runs show `cancelled`, the rolled-up `e2e` check `failure` for that reason; `build`/`deploy`/`publish` success). b70570b (`b70570bd7eda06ae9f95ab06460ad44b00232dae`) has the same code (diff c65be96..b70570b = `docs/STATE.md` only), so QA records its CI: see "CI result" at the end.

### Per-criterion results

**S-14-1 Your decks are saved online: PASSED QA (5/5)**
| AC | Result | Evidence |
|---|---|---|
| Make/change a deck online → "✓ Saved online" a few seconds later | PASS | qa "empty device, by taps…" (line appeared 136–299 ms after Back, all 4 sizes; one `new` request); dev `s14-sync` "a deck you make goes online"; `r1-*-decks-saved.png` |
| Offline change kept on the device, line "Saved on this device · goes online when you're connected"; back online → "✓ Saved online" by itself | PASS | same qa test (exact text; back to saved within 12 s with no tap; another device then sees the offline rename); dev `s14-sync` "offline…"; `r1-*-decks-pending.png` |
| Offline build, play and edit work as in Sprint 13 | PASS | dev `s14-sync` "offline from the start: build a deck and play it"; qa "wrong code…" (a device waiting after wrong codes still builds); the `s13-*` and `qa-sprint13` specs are part of CI's full pass |
| Damaged or far-too-big deck list refused, nothing saved lost | PASS | qa server tests "damaged (…) → 400, locker unchanged" (9 kinds) and "far too big … → 413 too_big, locker unchanged" (300 KiB, 201 decks; refused `new` makes no locker); dev `sprint14-locker`, `test:dev` |
| A device with only the standard decks sends nothing | PASS | qa "empty device…" (no `/v1/decks` request before the first own deck, no line); dev `s14-sync` "a device with only the standard decks sends nothing online" |

**S-14-2 The same decks on your phone app and your browser: PASSED QA (6/6 automated; AC7 is a manual owner check)**
| AC | Result | Evidence |
|---|---|---|
| My deck code: 12 letters in three groups, no 0/O/1/I/L, Copy | PASS | qa "both have 'My Corp deck 1'…" (format, no 0/O/1/I/L, clipboard = code, "Keep it safe", 44 px, text ≥ 10 px); dev `s14-link`; `r1-*-my-deck-code.png` |
| Second device types the code → its Decks lists all decks within seconds; its own decks kept (Q2 A) | PASS | same qa test (link → list in < 5 s; both "My Corp deck 1" decks plus "Phone runner" on both); qa server "linking keeps both devices' decks…"; `r1-*-link-screen.png`, `r1-*-linked.png` |
| Change/rename/delete on one shows on the other next time Decks opens, or within seconds if open | PASS | qa: the open list on the other device updated by itself in 8.3–8.7 s (10 s check); qa "both offline…" (renames, delete); dev `s14-link` "linking keeps both… later changes on one reach the other" (rename, delete) |
| Same deck changed on both while one offline → most recent kept; different decks all kept | PASS | qa e2e "both offline…" (both devices end with "X from phone" (later), "Y from browser", "Z from phone"; deleted deck stays gone); qa server "same deck changed on both…" in both orders, "a delete … stays deleted … an edit made after the delete brings it back"; `r1-*-merged-after-offline.png` |
| Cleared browser data + code → all decks back | PASS | qa "clearing the browser data on the same device…" (localStorage cleared on the same context, code typed with dashes, exact card counts back); dev `s14-link`; `test:dev` (after a restart too) |
| Wrong code → "No decks with that code"; many wrong tries → wait | PASS | qa e2e (5 × exact "No decks with that code", 6th "Too many wrong codes. Try again in 1 minute.", box disabled); qa server (right code waits too; other device unaffected; growing wait, max 1 h); dev `sprint14-guard`, `s14-link`; `r1-*-wrong-code.png`, `r1-*-wrong-code-wait.png` |
| Owner's phone (browser 891×296 and the Android app) linked show the same decks | **MANUAL (owner)** | Not checkable here: needs the real Android app and the real Cloudflare service. The browser side at 891×296 is covered above. Owner: on the Android app (Sprint 14 build) tap Decks → I have a deck code, type the code from the browser, check both list the same decks. |

**S-14-3 Pick your own deck for an online game: PASSED QA (6/6)**
| AC | Result | Evidence |
|---|---|---|
| Start a game → side → deck picker (standard picked already, Ready decks listed, unfinished dimmed with red note) → code | PASS | qa whole-game/Leave tests (host Runner: "Standard Runner deck (Kate)" checked, "Not done · 1 card short" dimmed and not Ready, pick → Get the code); dev `s14-online-decks`; `r1-*-host-picker-runner.png` |
| Join → "You'll play the Runner/Corp" → pick → join | PASS | qa ("You'll play the Corp", host sees "Your friend is picking a deck…"); dev ("You'll play the Runner"); `r1-*-guest-picker-corp.png`, `r1-*-host-friend-picking.png` |
| Both own legal decks → each dealt from its own deck | PASS | qa whole game: Runner Stack+Grip = 47 (the built deck), Corp R&D+HQ = 46, every starting hand card from the own deck; dev `s14-online-decks`, `sprint14-room` (every mix, both host sides, exact dealt lists) |
| Standard vs own works; friend with no decks taps through | PASS | qa "a friend with no decks of their own…" (no picker, standard 45); dev `s14-online-decks` (both), `sprint14-room` |
| Leave for now / lost connection / service restart → same decks even after editing or deleting | PASS | qa "Leave for now, edit and delete the deck, lose signal…" (same Grip, 47 cards; Corp same HQ after signal back); dev `s14-online-decks` "closing the app and deleting the deck"; restart: dev `sprint14-room` "restart mid-game … same decks", `test:dev` restart |
| Sprint 13 note "Online games use the standard decks for now" gone | PASS | dev `s14-online-decks` first test; no picker/join screenshot in QA's set shows it |

**S-14-4 The service checks each deck and keeps it secret: PASSED QA (4/4)**
| AC | Result | Evidence |
|---|---|---|
| Illegal deck refused, phone says why in plain words, no game | PASS | qa "a deck the service refuses when JOINING…" ("This deck isn't ready to play: 43 cards short", only the guest hears it, no game until a legal pick); dev `s14-online-decks` (4 copies on create → "This deck isn't ready to play: 4 copies of …"), `sprint14-room` (4 copies, wrong side, too few, unknown card); `r1-*-join-refused.png` |
| Friend's phone never gets your card list (only what the game shows) | PASS | qa whole game to game over at 4 sizes (13–117 frames per phone; every frame to the Corp phone: no `deck`/`decks`/`seed`/`rng` key, no `options` object, not the Runner's copy counts, and none of the Runner cards still only in Stack/Grip at the end (11–19 card ids); Runner's hand always null to the Corp and vice versa; same key/count checks to the Runner phone); dev `sprint14-leak` (30 whole games, every mix, both directions) |
| After game over: opponent sees your list per Q3 (A: never) | PASS | qa whole game: game-over dialog has only "Back to start", no "Their deck"/"Show my deck"; frames up to and including game over checked as above (a reload after the end receives no further frames: a finished game isn't resumed); `r1-*-game-over-guest-corp.png`, `r1-*-game-over-host-runner.png` |
| Older app → "Update the game to play online" instead of breaking | PASS | qa: a real protocol-1 `create` sent to the real local service → `{t: "error", code: "version"}`; dev `s14-online-decks` (new app's text "Update the game to play online"), `sprint14-room` (every v1 frame → version), `sprint14-leak` (frozen Sprint 13 parser reads every v2 frame as `version`, which the old app shows as "out of date … update the app") |

### Definition of Done checks
- **Sizes:** all QA tests pass at 891×296, 844×390, 640×360 and 1280×800; upright phones show "Turn your phone sideways" over the new screens (`r1-*-upright-*.png`).
- **44 px targets / text ≥ 10 px / inside the screen:** checked on Decks (empty, saved, pending), My deck code, I have a deck code, the online pickers (host and guest), refused message, wrong-code wait: no failures.
- **Snappiness:** tap-to-paint under 100 ms everywhere (above). Deck sync never blocks a tap (the line updates afterwards). No new timing windows this sprint.
- **IP check:** real card names and text are allowed (owner, rule 3, 2026-11-12); art in all screenshots is the runtime-drawn style; no copied images or logos added this sprint. The deck service has no public list (codes are 2⁵⁹ server-minted, guessing limited).

### Bugs
None found in round 1.

### Observations (not bugs; for the owner/team)
1. **The wrong-code wait is per internet connection, not per device.** Two devices at home on the same Wi-Fi share one address, so if one types 6 wrong codes, the other can't sync either (even with the right code its line shows "Saved on this device · goes online when you're connected") until the wait ends (1 minute the first time). Nothing is lost; decks go online after the wait. This matches the design (DECISIONS 2026-11-20).
2. After a refused deck on Join, the picker goes back to the standard deck being selected (`r1-*-join-refused.png`), so a second Join tap without looking would join with the standard deck. Harmless (only reachable with a hand-edited deck, as the phone only offers Ready decks).

### Manual owner checks (not faked)
- S-14-2 AC7: link the Android app and the phone browser with the deck code on the real service.
- The real Cloudflare deploy (new deck storage, wrong-code limit using the real internet address, the Android app reaching the deck service). CI deployed it and the architect's preflight smoke check passed against the real service on bc03675.

### CI result
CI on **b70570bd7eda06ae9f95ab06460ad44b00232dae** (same code as c65be96), `gh api repos/patrickmedaugh/overclock/commits/b70570b…/check-runs`: `checks` (lint, typecheck, unit) success, `guard-mutation` success, `e2e` success (shards 1/4, 2/4, 3/4, 4/4 all success). This is the round's full pass; QA did not re-run the full suite. QA's commit adds only tests, one config line (`qa-sprint14` in `SHORT_SPECS`), screenshots and this report; CI will run QA's spec on that push.
