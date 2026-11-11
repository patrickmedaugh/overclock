# Sprint 0 proposal — Foundations you can tap

**Reply "approved" to start, or comment on any story to change it.**

## Goal
By the end of this sprint you can open a link on your phone, see an empty game board laid out for both players, and tap a deck to draw cards with a snappy animation. Behind the scenes, the project is set up so every future sprint ships a playable demo automatically.

## Stories

### S-00-1: Project skeleton and automatic checks
*Why it matters:* every future feature gets tested automatically, so broken builds don't reach you.
*Acceptance criteria:*
- Given the repo, when code is pushed, then lint, type checks, and tests run automatically and show green/red on the PR. (automated check)
- Given a failing test, when it is pushed, then the PR shows red and cannot be merged. (automated check)
*Size:* S

### S-00-2: Demo link that updates every sprint
*Why it matters:* you can play each demo on your phone without installing anything.
*Acceptance criteria:*
- Given a sprint demo PR, when you open the link in it on your phone, then the game loads in under 5 seconds.
- Given a new sprint, when it's deployed, then the same link shows the newest version.
*Size:* S

### S-00-3: The game board
*Why it matters:* first look at the layout and style of the game.
*Acceptance criteria:*
- Given you open the demo on a phone held upright, when it loads, then you see the Corp's side at the top and the Runner's side at the bottom, each with a deck, a credits counter, and a clicks counter.
- Given the board, when you look at it, then nothing is cut off or overlapping on a phone or a desktop browser.
*Size:* M

### S-00-4: Draw a card (first taste of game feel)
*Why it matters:* proves the "snappy" feel before we build lots of rules.
*Acceptance criteria:*
- Given the Runner has clicks left, when you tap the Runner's deck, then a card flies into the hand within a fraction of a second and one click is used up.
- Given 0 clicks left, when you tap the deck, then nothing is drawn and a small "no clicks" hint appears.
- Given a card in hand, when you long-press it, then it zooms up so you can read it, and lets go when you release.
- Given cards have placeholder names and art, then all of them are original (no official game names or art). (automated check)
*Size:* M

### S-00-5: Rules engine starter
*Why it matters:* the "brain" of the game that later sprints build on; it's tested separately from the screen.
*Acceptance criteria:*
- Given a new game with the same seed, when it's started twice, then both games deal exactly the same cards. (automated check)
- Given a draw action, when the engine runs it, then it returns the new state and a "card drawn" event the screen animates. (automated check)
*Size:* S

## Not in this sprint (and why)
- Installing cards, runs, ICE — need the turn loop first (Sprint 1–2).
- AI opponent — needs real rules to play against.
- Android app — the browser link is faster for demos; Android comes once the game is playable.

## Questions for you
1. **Visual style direction?** — **Recommended:** A. Options: A) Neon cyberpunk (dark, glowing cyan/magenta) B) Clean corporate-dystopia (white/grey with red accents) C) Gritty street (grunge textures, warm tones)
2. **Working title?** "Project OVERCLOCK" is a placeholder. Suggest a name, or say "keep it" for now.

## Risks
- The rules of this genre have many special timing cases. We'll build them a piece at a time with automated tests, so mistakes show up early instead of piling up.
