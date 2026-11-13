# Sprint 03 demo — The Runner breaks in

> **Written after the fact, as a record.** You merged Sprint 3 yourself (PR #10, 2026-11-13) and told us in chat to count it as accepted, so there is no demo PR and nothing here needs an answer. The open checks below are optional, whenever you next play.

**▶ Play it:** https://patrickmedaugh.github.io/overclock/  (hold your phone sideways)
Backup link: https://overcloc.netlify.app

## What's new
- **Runs.** On the Runner's turn, tap **Run**, then a lit server (HQ, R&D, Archives or Server 1, 2…). It costs 1 click. Tap Run again to cancel.
- **Rez.** When the Runner reaches face-down ICE, the Corp gets **Rez [name] · [cost] credits?** with **Rez** / **Don't rez** on the board. If the Corp can't afford it, the question is skipped.
- **ICE fights back.** Face-up ICE fires its lines ("subroutines") unless broken: **End the run**, **The Runner loses 1 click**, **Do 3 net damage** (3 random cards from the Runner's hand to the Heap).
- **Icebreakers.** Corroder breaks barriers, Gordian Blade code gates, Ninja sentries. Buttons show prices, e.g. **+1 strength · 1 credit** and **Break "End the run" · 1 credit**. Broken lines are crossed out.
- **Access, steal and trash.** Getting in shows what you find: HQ = 1 random card, R&D = the top card, Archives = everything, a remote = every card in it. Agendas are stolen; assets and upgrades can be trashed for their price; anything else gets **Done**. A run that finds nothing says "Nothing to access in …".
- **Advance and score.** The Corp taps its installed agenda: **Advance · 1 credit** puts a counter on it (both players see the number). With enough counters, **Score** moves it to the Corp's points.
- **7 points wins.** Points show as "Corp 1 point" / "Runner 2 points". First to 7 gets a "Corp wins" / "Runner wins" screen with the reason.
- **Flatline.** If net damage is more than the Runner's hand, the Corp wins at once ("Runner flatlined").
- **The three "Needs runs" cards now work:** The Maker's Eye (run on R&D, see 3 cards), Inside Job (skip the first face-up ICE), Neural EMP (1 net damage, only if the Runner ran last turn).
- **Sturdier checks behind the scenes.** The team's End turn double-tap tests no longer go red on a busy test machine, and a quick tap is no longer mistaken for a "hold" when a slow phone stalls mid-tap.

New words (run, rez, encounter, break, access, steal, trash, advance, score, flatline…) are in `docs/GLOSSARY.md`.

## Try this (≈2 minutes)
Any deal works; these are the things to look for.
- [ ] **S-03-1:** on the Runner's turn tap **Run**: every Corp server lights up. Run on **R&D**: you see the top card. If it's an agenda, tap **Steal** and watch "Runner N points" go up.
- [ ] **S-03-3:** let the Corp put ICE on a server, then run on it. The Corp gets **Rez / Don't rez**. Rez it, then (with no matching breaker) tap **Let it through**: "End the run" stops the run.
- [ ] **S-03-4:** install **Corroder** and run on a server with **Wall of Static** rezzed. **Break** is dimmed until you tap **+1 strength**; then break it and get in.
- [ ] **S-03-2:** as the Corp, install an agenda in a new server, tap it and tap **Advance · 1 credit** until **Score** appears. Tap Score: the Corp's points go up.
- [ ] **S-03-5:** play **The Maker's Eye**: a run on R&D that shows 3 cards one after another.
- [ ] **S-03-3, criterion 6 (your call):** play one run past two pieces of ICE. Is it clear which ICE you're meeting and what just happened?

**Automated checks (nothing to do):** both sides can really reach 7 points with the starter decks (S-03-2); the Runner's side of the game only ever learns the names of cards it accessed or that were rezzed (S-03-1); Gordian Blade's raised strength lasts the whole run (S-03-4); the End turn double-tap tests pass 150 times in a row on a busy and a 6× slowed-down test machine, and fail when the protection is broken on purpose (S-03-6). QA result: 31 of 31 checks pass.

## Screenshots
From the automated checks, small phone (640×360) and computer.
- [Run: servers lit](sprint-03-screens/01-run-servers-lit-phone-small.png) · [R&D access: Steal](sprint-03-screens/02-access-rd-steal-phone-small.png) · [Corp's Rez prompt](sprint-03-screens/03-corp-rez-prompt-phone-small.png)
- [Meeting Wall of Static](sprint-03-screens/04-encounter-wall-of-static-phone-small.png) · [Subroutine broken, Continue](sprint-03-screens/05-subroutine-broken-continue-phone-small.png) · [Trash or Leave it](sprint-03-screens/06-access-trash-or-leave-phone-small.png)
- [Corp: Advance and Score](sprint-03-screens/07-corp-advance-and-score-phone-small.png) · [Corp wins](sprint-03-screens/08-corp-wins-phone-small.png)

More: `docs/sprints/sprint-03-qa/` and `docs/sprints/sprint-03-qa-pass2/` (QA's full playthrough on all three sizes).

## Didn't make it / known gaps
Nothing was dropped: all 6 stories were built and pass. Things you may notice, all on the backlog:
- **The Corp rarely wins on points.** The Corp can only reach 7 if Priority Requisition (5 counters needed) turns up in time; that happens in about 8 of 10 deals. The Runner can reach 7 in every deal we tried. The full real decks (coming) have more agendas, which should fix this.
- **Some extra taps.** After each piece of ICE you tap **Let it through**, **Done** or **Continue** even when there's no real choice. We kept them so you see what happened. Tell us if it feels like too many.
- **Akitaro Watanabe's discount isn't applied** (ICE in its server should cost 2 less to rez). Card abilities on the table come with the bigger card-effects system.
- **Only agendas can be advanced** (e.g. not Ice Wall).
- **Agendas' "when scored" bonuses don't happen yet:** Hostile Takeover's 7 credits and bad publicity, Priority Requisition's free rez. They score their points. Proposed for Sprint 4.
- **QA and the architect found 6 problems, and all are fixed:** a late-game Archives showed as tiny cards; a run into an empty server ended with no message; long break buttons had tiny text on a computer; one team test could cry wolf and another could miss a broken double-tap guard; and a quick tap could count as a "hold" on a stalled slow phone.

## One thing to know about how this sprint went
- **Scheduled team runs overlapped again.** Two runs did the first QA round at the same time (so there are two QA reports), and a third pushed its own version of one test during the second round; we kept the stricter version. No work was lost. Since then the team's scheduled run is every 6 hours, and a run now leaves a "working" marker so a second one won't start on top of it.

## Owner checks still open (optional)
- **S-03-3, criterion 6:** is a run's step-by-step clear enough to follow? (See "Try this".)
- **Home-screen checks from Sprints 1 and 2** (S-01-6, S-02-6): add the link to your home screen and see it opens sideways with nothing under the notch. You said "we'll circle back". If the Android app arrives in Sprint 4, it replaces this check.
- **Leftover branches:** `sprint-02-run-0805`, `sprint-02-run-1005-superseded` and `sprint-02-scheduled-run-alt` are still on GitHub. You said yes to deleting them, but the team's connection isn't allowed to delete branches. On GitHub: Code → Branches, then the bin icon next to each.

## Questions for you
None. Sprint 3 is accepted. If anything above bothers you when you play, just say so in chat or on the Sprint 4 proposal.

## How to respond
Nothing needed: you already accepted Sprint 3 in chat.
