# Sprint 13 tech plan (architect)

Scope: S-13-1…S-13-5 (S-13-2 "In deck" switch and S-13-4 rename slip first). Owner answers (all A, DECISIONS 2026-11-18): start from standard or empty, 45-card minimum (identity's own), unfinished decks kept but not pickable, decks kept per device, in a **versioned format that can later be uploaded**. engine-dev (`s13-engine`) and ui-dev (`s13-ui`) work in **two worktrees**; the lead merges into `sprint-13`. **No rule or card change: `RULES_VERSION` stays 5** (Sprint 12 saves and live online games keep working). **`SAVE_FORMAT` 1 → 2** (options may hold deck lists; format-1 saves still load). `PROTOCOL_VERSION` stays 1 (online unchanged).

## One rule check, two users (`packages/cards/src/deck.ts`, pure)
The editor and the game both call `checkDeck` (the check the core decks already pass). New helpers are built **on top of it**, never beside it:
- `deckPool(side): readonly {type: CardType; cards: readonly CardDef[]}[]`: every non-identity card of `side` (Corp 24, Runner 20), groups in AC order (agenda, ice, asset, upgrade, operation / event, hardware, resource, program), by name inside a group. New cards show up by themselves.
- `IDENTITIES: Record<Side, string>` (`c13`, Kate) and `STANDARD_DECKS: Record<Side, DeckDef>` (= the core45 decks).
- `deckStatus(deck): DeckStatus` = `{size, minSize, influence, influenceLimit, agendaPoints, agendaRange: {min, max} | null, problems: DeckProblem[], legal: boolean}`; `legal === (checkDeck(deck).length === 0)` by construction.
- `addBlock(deck, cardId): AddBlock | null`: runs `checkDeck` on the deck plus one copy and returns the new per-card problem: `{kind:'max_copies', limit}` | `{kind:'agenda_faction', identityFaction, cardFaction}` | `{kind:'wrong_side'}` | `{kind:'unknown_card'}`. Influence and agenda points never block a **+** (AC: you can go over, the bar goes red).
- `countsOf(deck)` / `deckFromCounts(identity, counts)`: id→copies map ⇄ `DeckDef` in **canonical order** (`ALL_CARDS` order, copies adjacent), so a deck always deals the same for a seed.
- **The client only turns codes into words** (`apps/client/src/deckText.ts`: "Max 3 copies", "Haas-Bioroid can't use Weyland agendas", "4 cards short", "2 influence over the limit", "Agenda points 18 (needs 20–21)", "Ready to play"; faction names live there). No counting or rule in the client.

## Custom decks in a game (`packages/engine/src/state.ts`, `packages/match`)
- `GameOptions.decks?: Partial<Record<Side, DeckDef>>`: a side given here is dealt instead of `deckSet`'s deck. `resolveOptions` keeps the key **only when present** (state hash = `JSON.stringify(state)`, so every golden hash stays). `newGame` **throws** `Error('illegal_deck')` if a given deck fails `checkDeck` or its identity is the other side's (the game refuses what the editor would refuse; the client never passes one).
- The client passes `decks` only for sides with a non-standard pick; standard-vs-standard games are exactly today's (`{deckSet:'core45'}`), so `?play=here`, Android save checks and all seeded specs are unmoved.
- **Saves hold the dealt lists:** `LocalMatch.save()` already copies `options`, so the card lists ride along; `SAVE_FORMAT = 2`, `parseSavedGame` accepts 1 and 2, keeps `options.decks` (shape: identity string, ≤ 200 string ids) and returns `broken` if a deck fails `checkDeck`. Continue never reads the deck store, so editing or deleting a deck can't touch a saved game. A Sprint 12 build reading a format-2 save shows its "outdated" note (never a wrong deal).
- Online: `ONLINE_OPTIONS`, protocol `deckSet` and the room are unchanged; the room never accepts `decks` (next sprint's job, with secret lists).

## Deck storage (`packages/match/src/saved-decks.ts` format, `apps/client/src/deckStore.ts` I/O)
`localStorage['overclock.decks.v1']` = `DeckStore {format: 1, decks: StoredDeck[]}`, `StoredDeck {id, side, name, identity, cards: Record<cardId, copies>, createdAt, updatedAt}` (ms). `id` = random UUID made by the client (stable key for a later upload/merge); standard decks are never stored (id `'standard-corp'|'standard-runner'`, read-only). `parseDeckStore(x) → DeckStore | 'broken' | 'newer'`: unknown card ids are kept (the deck just isn't Ready). Broken data is moved to `overclock.decks.v1.bak`, never overwritten silently; `'newer'` = read-only list. Writes: same pattern as `SaveWriter` (after the tap's frame, flushed on `pagehide` / hidden / leaving the editor). Android: the WebView's localStorage survives app close (as the Sprint 11 save), so no Capacitor plugin; browser and app keep their own (Q4 A).

## Tasks
| # | Owner | Dep | Task (AC) |
|---|---|---|---|
| E1 | engine | — | Interface: types + stubs for everything above, README "Sprint 13 interface". **Commit and push first.** |
| E2 | engine | E1 | `deckPool`, `deckStatus`, `addBlock`, counts helpers + `sprint13-decks.test.ts`: pool sizes/groups, Max 3, Hostile Takeover blocked for HB, influence 17/15 not blocked, standard decks legal, **`deckStatus().legal` ≡ `checkDeck` ≡ `newGame` accepts** on the standard decks and 300 random built decks (S-13-3 last AC). |
| E3 | engine | E1 | `GameOptions.decks`, `newGame` deal + `illegal_deck`, `SAVE_FORMAT` 2, `parseSavedGame` decks; tests: 46-card Corp deck → R&D + HQ = those 46 ids (S-13-5), save → edit store → load = same game, format-1 golden fixture still loads with unchanged hashes, illegal/oversized decks in a save = `broken`, standard picks = byte-identical to today. |
| E4 | engine | E1 | `saved-decks.ts` (`DeckStore`, `parseDeckStore`, `DECK_STORE_FORMAT`) + tests; RULES_SPEC "Deck building (Sprint 13)", GLOSSARY Identity/Influence/Agenda points. |
| U1 | ui | E1 | Start screen **Decks** button; DOM Decks screen (`decksScreen.ts`): standard decks + mine with count and Ready tick / red note, New Corp/Runner deck → "Start from the standard deck" / "Start empty" → editor named "My Corp deck N"; standard = read-only + **Copy to edit**; Delete + confirm; Back. `deckStore.ts`, `deckText.ts`. (S-13-1, S-13-4) |
| U2 | ui | E1 (E2) | Editor (DOM, native scroll): identity on top, grouped rows (name, cost, influence dots, "2 / 3"), −/+ ≥ 44 px, dimmed + with tapped reason, live bar (green/red parts), hold → the game's zoom face, In deck switch, rename. A tap updates its row and the bar only (< 100 ms). (S-13-2, S-13-3) |
| U3 | ui | E1 (E3) | Play on this device → picker (Corp deck, Runner deck, Start; standard preselected; not-Ready dimmed with note), `new HotSeat(seed, {decks})`; online screens say "Online games use the standard decks for now." (S-13-5) |
| U4 | ui | U1–U3 | Specs (below), `seedDecks(page, store)` helper, update the ~10 specs that tap "Play on this device" (one more tap: Start). |

**Parallel:** ui codes against E1 types from day one (`deckStatus` stub is enough for layout). Engine E2 → E3 → E4 in one worktree; ui U1 → U2 → U3 → U4 (shared `startScreen.ts`, `start.css`).

## Tests and hooks (`docs/TESTING.md`)
Hooks: specs seed decks with `page.addInitScript` writing `overclock.decks.v1` (`seedDecks`); DOM rows carry `data-card=<id>` and `data-testid` (`deck-row`, `deck-bar`, `deck-plus`, `deck-minus`); `__overclockStart.decks()` returns the parsed store (test build only). New specs: `s13-decks` (S-13-1, S-13-4 incl. reload = "closing the browser", delete, rename), `s13-editor` (S-13-2: 24/20 rows, ±, zoom, 44 px at phone, phone-small, phone-short, desktop), `s13-rules` (S-13-3: bar texts, Max 3, Weyland, 17/15, Ready; editor Ready ≡ `checkDeck` for seeded decks), `s13-play` (S-13-5: 46-card deal count, not-Ready can't be picked, Continue after editing **and** deleting the deck, online note). All join `SHORT_SPECS` (phone-short). Re-run only touched old specs (`s06-start`, `s11-save`, `android`, the edited "Play on this device" specs). Android app close → manual demo check.

## Risks
- **891×296 editor**: bar + list + 44 px buttons; bar is one line, rows 44 px, list scrolls under it.
- **Extra tap on Play on this device** moves ~10 specs; `?play=here` stays a direct standard-deck start.
- **Open (pm):** "New game" after a custom-deck game: proposed = opens the picker with the same decks preselected (today it deals standard decks).
