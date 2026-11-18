# Sprint 12 tech plan (architect)

Scope: S-12-1…S-12-6 (S-12-6 cut first). Owner answers (recommended, DECISIONS 2026-11-18): 45-card decks, the six cards, Melange "Click ×3". engine-dev (`s12-engine`) and ui-dev (`s12-ui`) work in **two worktrees** on their own local branches; the lead merges into `sprint-12`. **`RULES_VERSION` 4 → 5** (decks and rules change: Sprint 11 saves/online games show the Q3 note). `PROTOCOL_VERSION` stays 1 (additive). Numbers below were checked against `netrunner-cards-json` `pack/core.json` on 2026-11-18 (DECISIONS).

## Card data (`packages/cards`, 2012 wording in our spelling: "ICE", "memory", "link", "credits")
| id | Card | Numbers | DSL |
|---|---|---|---|
| c23 | Accelerated Beta Test (HB agenda) | adv 3, 2 pts | `onScore: [{op:'look_install_top', count:3, types:['ice']}]` (last effect, opens a choice) |
| c24 | Archived Memories (HB op) | cost 0, inf 2 | `playIf:'corp_archives_not_empty'`, `onPlay:[{op:'archives_to_hand'}]` (opens a choice) |
| c25 | Experiential Data (HB upgrade) | rez 2, trash 2, inf 1 | `iceStrengthBonus: 1` (rezzed: ICE protecting its server; like `iceRezDiscount`) |
| r19 | The Toolbox (Shaper hardware, unique) | cost 9, inf 2 | `memoryBonus:2, link:2, recurringCredits:{amount:2, for:'icebreaker'}`: data only |
| r20 | Modded (Shaper event) | cost 0, inf 2 | `playIf:'has_install_target'`, `onPlay:[{op:'install_from_hand', types:['program','hardware'], discount:3}]` |
| r21 | Infiltration (neutral event) | cost 0, inf 0 | `modes:[{label:'Gain 2 credits', effects:[gain 2]}, {label:'Expose 1 card', effects:[{op:'expose'}]}]` |

**Deck builder readiness (data only, no builder now):** every card keeps `faction` and `influence` set (0 explicit for in-faction/neutral is fine); add `code` (NetrunnerDB code, e.g. `'01055'`, so a later pool check is a lookup) and `unique?: true` (The Toolbox; not enforced, 1 copy). Deck limit = `MAX_COPIES` (3) for every Core card; add `deckLimit?` only when a card differs. A cards test asserts every non-identity card has `code`, `faction`, an integer `influence ≥ 0`.

**Decks:** new `CORP_CORE45_DECK` / `RUNNER_CORE45_DECK` (proposal table: Corp 45, 21 points, influence 8; Runner 45, influence 10), `checkDeck(deck)` with the identity's own minimum (45) = `[]`. New `DeckSet 'core45'` = default (`DEFAULT_OPTIONS`, hot-seat, `ONLINE_OPTIONS`). **`'core'` (30-card Sprint 11 decks) is frozen as a test fixture**, like `'starter'` in Sprint 8: specs that say `deckSet:'core'` keep their seeds; `goalDeckSet` = `'core45'` for `SPRINT12_GOALS`.

## Engine interface (E1 pins it in README "Sprint 12 interface"; stubs answer `not_implemented`)
- **One new action** `{type:'select', player, card:number, server?: ServerId|'new'}` answering the two new choices. `play` gains optional `installIndex` (Modded: the Grip card, index before play), `mode` (index into `modes`), `uid` (expose target).
- **`look_install` choice (ABT):** on score, the top `min(3, deck)` cards are set aside in `ChoiceState.looked` (0 cards = no choice, no loss). Options: one `select{card, server}` (cost 0) per looked ICE × (servers in order, then `'new'`), then `pass` ("Done"). A select installs (no click, no ICE install tax) and rezzes it free; HB's first-install credit fires; the choice stays open; it closes by itself when nothing is left. `pass` trashes the rest to Archives **face down** (`rd_cards_trashed{count, cardIds: Corp only}`). Events: `cards_looked_at{count, cardIds: Corp only}`, `card_installed` (as today), `ice_rezzed`. View: `ChoiceView.looked: (string|null)[]` (Runner: nulls, count only).
- **`archives_pick` choice (AM):** options one `select{card}` per Archives index except the playing copy. Event `card_returned_to_hand{player:'corp', archivesIndex, faceUp, cardId?}`; Runner gets `cardId` only if the entry was face up.
- **Strength:** `iceStrength(state, ice)` = printed + advancements + rezzed `iceStrengthBonus` in its server; used by `too_weak`, run view, break-all, planner. `InstalledView.strength?: number` on ICE the viewer can see (board badge).
- **Modded:** hand options = one `play{installIndex}` per Grip program/hardware (cost = install after Modded −3 and Kate −1 (first install), ≥ 0; `discount` = total off; `no_memory`/`no_credits` in `reject`); none → one `play` rejected `condition_not_met`. It counts as the turn's install for Kate.
- **Infiltration:** options `play{mode:0}` + `play{mode:1, uid}` per face-down installed Corp card. Expose = public `card_exposed{uid, cardId, server}`; no state change (stays unrezzed); the engine keeps no memory of it.

## Tasks
| # | Owner | Dep | Task |
|---|---|---|---|
| E1 | engine | — | Interface: types (`select`, play fields, choice kinds, effect ops, `CardDef` fields, events, views), validation-table rows, stubs, README "Sprint 12 interface", `viewEvents` stripping. **Commit and push first.** |
| E2 | engine | E1 | ABT flow + data c23 + `sprint12-abt.test.ts` (3/1/0 ICE, R&D 2 and 0, free/no click/no tax, HB +1, face-down Archives, winning score skips it, Runner view/events hold no ids). |
| E3 | engine | E1 | AM + ED (c24, c25), `iceStrength(state, …)` refactor, tests (face-down pick, not itself, dimmed; ED rezzed vs face-down/trashed, central and remote, + Ice Wall counters). |
| E4 | engine | E1 | Toolbox, Modded, Infiltration (r19–r21), tests (MU/link/2 credits for breaks and pumps only, refill; Modded 0-floor, stacking, no extra click, `no_memory`; expose public, nothing else changes). |
| E5 | engine | E2–E4 | 45-card decks, `'core45'` everywhere (`resolveOptions`, `saved-game.ts`, protocol `deckSet`, room), `RULES_VERSION = 5`; golden: re-pin Sprint 11 file (hashes must not move: old cards unchanged) + "a rulesVersion-4 save loads `outdated`"; new `sprint12-saves.json` (ABT, AM, ED, Modded, Infiltration, Toolbox games); `SPRINT12_GOALS`: `abt_scorable`, `abt_scorable_no_ice`, `archived_memories_ready`, `experiential_data_encounter`, `toolbox_encounter`, `modded_ready`, `infiltration_ready`; hidden-checks know `looked`/`card_exposed`; `sprint12-properties.test.ts` (300 random core45 games: card invariants + no hidden id leaks); RULES_SPEC/GLOSSARY lines. |
| E6 | engine | E2–E4 | AI (view only): `look_install` installs every ICE on the offered server with the fewest ICE, then Done; `archives_pick` takes the most agenda points, then the highest cost; tests. |
| U1 | ui | — | S-12-6 Melange: card face renders "Click, click, click:" as the click symbol "×3" (`cardFace.ts`); button "Gain 7 credits · 3 clicks" from `option.clicks`. Test boards: `decks=core` / `core45` flag (`main.ts`), `e2e/helpers.ts` opens the page with `plan.deckSet`. `s12-melange.spec.ts`. |
| U2 | ui | E1 (E2 for e2e) | "Look at 3 cards" screen from `choice.looked`: ICE tap → servers light from `select` options → tap; "Trash the rest (N)" / one-tap "Trash 3 cards"; Runner sees "Corp looks at 3 cards" + face-down count into Archives. `s12-abt.spec.ts`. |
| U3 | ui | E1 (E3) | Archives pick sheet (Corp's own pile, face-down shown to Corp only), dimmed hint "Archives is empty"; ED: board strength badge from `strength`, run panel already reads `run.ice.strength`. `s12-archives.spec.ts`. |
| U4 | ui | E1 (E4) | Modded: lit Grip cards with price; hint "No program or hardware in your Grip". Infiltration: two-button sheet; Expose lights face-down cards; `card_exposed` shows the card on both devices until tapped away (each device; cleared on the next move). Toolbox "pays" text check. `s12-runner.spec.ts`. |
| U5 | ui | E5, U2–U4 | 45-card deal counts; Sprint 11 save → Q3 note; `s12-online.spec.ts` (two contexts: only Corp's page has the 3 ids; expose on both, nothing else); android spec (default decks now 45). |

**Parallel:** engine ‖ ui throughout (engine never touches `apps/client`; ui never touches `packages/*`). Engine E2→E3→E4 run **in sequence in one worktree** (all touch `apply.ts`, `run.ts`, `rules.ts`, `view.ts`); E6 (`packages/ai` only) may run in a third worktree after E4 lands. ui order U1 → U2 → U3 → U4 → U5 (shared `board.ts`, `panels.ts`, `hints.ts`); U1 needs nothing from engine and starts day one.

## Tests (`docs/TESTING.md`)
Unit: the files above + `cards` tests (data vs core.json numbers, deck legality, copies table). e2e at phone, phone-small, desktop; new `s12-*` specs join `SHORT_SPECS` except `s12-online`. Re-run only touched old specs: `s11-save`, `s11-cards` (new faces), `s08-cards`, `s10-bankjob`, `android`, plus any spec whose page default changed to 45 cards (U1 flag fix). No full pass locally; CI runs it.

## Risks
- **Default deck switch** moves page defaults under old e2e specs: freezing `'core'` + explicit `decks` flag keeps their seeds; android bundle (no test hook) now deals 45.
- **Hidden info**: ABT ids and face-down Archives picks: view projection + `viewEvents` + hidden-checks + online e2e.
- **"You may look"** is played as always-look (AC: one tap); logged, PM asks the owner at demo.
- **ABT late** → proposal fallback (30-card decks with the other cards); E5 keeps the 45 lists in one place to switch.
