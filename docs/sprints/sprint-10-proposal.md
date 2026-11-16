# Sprint 10 proposal — Make the board clearer

**Approved by the owner in chat, 2026-11-16 23:56 UTC** (recorded on PR #23). His answers: **Q1 A** (board clarity now; save a game in Sprint 11). **Q2 A** (Runner's pile at the far right of his row, same as the Corp's, to keep it symmetrical). **Q3: keep the run panel as it is** for now, until he can reproduce a problem himself, so **S-10-4 is dropped** and goes back to the backlog. **Q4 A** (include S-10-5). The sprint is S-10-1, S-10-2, S-10-3, S-10-5 and S-10-6.

## Goal
Everything you said after playing Sprint 9, fixed. Scored agendas get their own pile on the board that you can tap and browse, so Private Security Force is easy to find. Link and Tagged sit together next to memory. Advance stops once an agenda is ready to score. Bank Job lets you choose how many credits to take. The run panel stays easy to tap even with lots of icebreakers out. Archives stops jumping around, and the discard step opens with a tap like everywhere else.

All of it works in pass-the-phone and online games, on sideways phones (844×390 and the small 640×360), on your own phone with Chrome's address bar showing (891×296), and on a computer.

## Your question from the review: "is there a maximum for Runner options?"
**No, there is no maximum today.** When there are more buttons than fit, they wrap into more rows and each one gets shorter. Three or four are fine. With five or more (for example several icebreakers, plus Let it fire and Jack out) they can get too short to tap comfortably on a small phone or on yours. S-10-4 fixes that, and question 3 lets you pick how.

## Stories

### S-10-1: A scored-agenda pile for each side
*Why it matters:* you couldn't find where scored agendas go, so you couldn't use Private Security Force.

Today scored agendas only live inside the small **"Corp N points"** label at the top of the screen. You have to tap that label to use Private Security Force, and nothing tells you so. This story gives each side a real pile on the table, like the Heap or Archives.

*Acceptance criteria:*
- Given the Corp has scored an agenda, when the board shows, then a face-up pile with that agenda and a count ("2 agendas · 3 points") sits at the **far right of the Corp's row**, on both players' screens.
- Given the Runner has stolen an agenda, when the board shows, then his pile shows it in the same way, at the **far right of his row**, the same as the Corp's (owner Q2 A).
- Given a pile with 2 or more agendas, when you tap it, then it opens big, like your hand: you slide side to side to read each card, and tap outside to close it. Holding the pile to read it still works too.
- Given a scored Private Security Force, a tagged Runner and the Corp's turn, when the Corp opens his pile and taps PSF, then **"Do 1 meat damage · 1 click"** shows and works as in Sprint 9.
- Given an installed Private Security Force that is **not scored yet**, when the Corp taps it, then a dimmed **"Do 1 meat damage: score it first"** shows next to its Advance button.
- Given no scored agendas, when the board shows, then the pile spot is empty (or shows a faint outline) and takes no taps.
- Given 844×390, 640×360, 891×296 and a computer, when both piles have cards and the rows are full, then the piles are at least thumb size and don't cover any card, button or counter. (automated check)
- Given the score labels at the top, when you look, then they still show each side's points. (automated check)

*Size:* L

### S-10-2: Link and Tagged next to memory
*Why it matters:* you asked for the Runner's trace numbers to sit together and off Kate's picture.

*Acceptance criteria:*
- Given Kate has 1 link, when the board shows, then **"Link 1"** sits next to the memory counter at the end of the Runner's row, and nothing is drawn over Kate's identity card.
- Given the Runner installs Access to Globalsec, when the board updates, then it reads **Link 2**.
- Given the Runner has 1 tag, when the board shows, then a red **"Tagged 1"** shows next to Link, on both players' screens, and no longer by his name.
- Given the Runner is tagged on his turn, when he taps **Tagged 1**, then **"Remove 1 tag · 1 click + 2 credits"** shows as before.
- Given his tags go back to 0, when the board updates, then Tagged goes away and Link stays where it was.
- Given 844×390, 640×360, 891×296 and a computer, when the Runner is tagged and his row is full of cards, then Tagged, Link, memory and his cards don't overlap. (automated check)

*Size:* M

### S-10-3: Advance stops at the limit, and Bank Job lets you choose
*Why it matters:* two card rules you asked for in chat.

**Advance stops at the limit** (you already chose this). Once an agenda has as many advancement counters as it needs, only **Score** is offered. This is a small house rule. The real game lets you keep advancing, which is almost never useful. **Ice Wall** is ICE, not an agenda, so it can still be advanced as before.

**Bank Job.** The card says "you may take any number of credits". Today it takes all of them. Now you pick the amount with the same − / + / **Max** control you use to bid in traces.

*Acceptance criteria:*
- Given an agenda with all the advancements it needs, when the Corp taps it, then only **Score** shows. There is no Advance button.
- Given an agenda one short, when the Corp advances it once, then the next tap shows only Score.
- Given an agenda at its limit, when something asks to advance it anyway, then the game refuses. (automated check)
- Given an advanced Ice Wall, when the Corp taps it, then Advance is still offered.
- Given Bank Job holds 8 credits and the Runner gets into a remote server, when he picks **Take credits**, sets **3** and confirms, then he gains 3, Bank Job keeps 5, and nothing is accessed.
- Given the same choice, when he picks **Access cards** instead, then he accesses as normal and Bank Job keeps all 8.
- Given he takes Bank Job's last credits, when it's empty, then it goes to his Heap as today.
- Given 640×360 and 891×296, when the amount control shows, then −, the number, +, Max and confirm are all thumb size and readable. (automated check)
- Given an online game, when the Runner picks an amount, then both devices show the same credits on Bank Job. (automated check)

*Size:* M

### ~~S-10-4: The run panel works with lots of options~~ — dropped (owner Q3: keep as is until he can reproduce it; back to the backlog)
*Why it matters:* with several icebreakers out, the buttons could get too small to tap.

*Acceptance criteria:*
- Given an encounter with **8 options** (several icebreakers, plus Let it fire and Jack out), when the run panel shows at 640×360, 891×296, 844×390 and a computer, then every option can be reached, every button is at least thumb size (44 px tall), its words are readable, and nothing overlaps. (automated check)
- Given an encounter with 5 or more options on your phone, when you look at the run panel, then you can tell at a glance which button belongs to which icebreaker.
- Given an encounter with 3 or fewer options, when the run panel shows, then it looks and works exactly as today.
- Given any run panel, when you tap a button, then it answers in under 0.1 s, as today. (automated check)

*Size:* M

### S-10-5: Archives stays put, and the discard step opens with a tap
*Why it matters:* two things from your Sprint 9 play that looked wrong or felt inconsistent.

**Archives** (the Corp's discard pile) should always be its own lane, from the start of the game. Today, when a remote server empties, its lane can seem to "turn into" Archives or the next server. **Discard step:** when you have too many cards at the end of your turn, the picker still uses the old hold-and-slide strip. It should open with a tap, like your hand does everywhere else.

*Acceptance criteria:*
- Given a new game, when the board shows, then Archives has its own lane on the Corp's row, even when it's empty.
- Given Server 1 has one card and no ICE, when the Runner trashes or steals it, then Server 1's lane folds away, and Archives and the other servers keep their names and don't swap places.
- Given a card is trashed from a server, when it moves, then you can see it fly into the Archives lane.
- Given you must discard at the end of your turn, when you tap your hand, then it opens big, as usual. You tap the cards to throw away and confirm. No holding needed.
- Given 844×390, 640×360, 891×296 and a computer, when a server empties, or when the discard step shows, then nothing overlaps and every button is thumb size. (automated check)

*Size:* M

### S-10-6: Two small screen fixes on a computer (first to cut)
*Why it matters:* tidy-ups QA found in Sprint 9 (QA-S9-4 and QA-S9-5). They're only on a computer screen, so they're cut first if time runs short.

*Acceptance criteria:*
- Given a computer screen (1280×800) and a trace result note on the Corp's turn, when the note shows, then it doesn't cover the End turn button. (automated check)
- Given the same note at 844×390, 640×360 and 891×296, when it shows, then it is still clear of every button. (automated check)
- Given the game-over box ("Corp wins"), when it shows at any size, then the small "Built …" date isn't drawn inside it. (automated check)

*Size:* S

## Not in this sprint (and why)
- **Save a game in progress** (your P1: leave a game and pick it up later, also after Android closes the app). It was our earlier pick for Sprint 10. But your review notes were all about the board, so we put those first. Save a game is recommended for Sprint 11. Question 1 lets you swap them.
- **Smooth slide between cards in the hand view** (P2, you said "not super high priority"). Sprint 11 or later.
- **"Click ×3" instead of "click, click, click"** on Melange Mining Corp. (P2). Small. It fits well with the next round of screen polish.
- **More real cards** (the rest of Haas-Bioroid's and Kate's Core Set cards, toward the full 45-card decks). This waits until the board is clear and saving works.
- **Behind-the-scenes items** (an instant "Not your turn" in online games, test tidy-ups). We'll slip one in only if it touches the same screen code anyway.

## Questions for you
1. **Is this the right theme for Sprint 10?** — **Recommended:** A. Options:
   A) **Make the board clearer** (this proposal). Save a game comes next, in Sprint 11.
   B) **Save a game now**, plus only the scored-agenda pile (S-10-1) and Link/Tagged (S-10-2). The rest waits for Sprint 11.
2. **Where does the Runner's pile of stolen agendas go?** — **Recommended:** A. Options:
   A) **Far right of his row, the same as the Corp's.** "Scored pile = far right" is one easy rule for both sides. Memory, Link and Tagged move just left of it.
   B) **Right after his Heap**, with his other piles on the left. This keeps the far-right corner for his counters.
   C) **No pile for the Runner.** His stolen agendas stay inside the score label at the top. (He has no abilities on stolen agendas today.)
3. **How should the run panel handle lots of options?** — **Recommended:** A. Options:
   A) **Buttons never get smaller than a thumb.** If they don't all fit, they go into two neat columns, and if needed a **More ▸** button shows the rest. The common case (4 or fewer) stays one tap.
   B) **Group by icebreaker.** First you see one button per icebreaker, plus Let it fire and Jack out. Tap an icebreaker to see its own choices (raise strength, break). Very tidy, but one extra tap every time.
   C) **One big "Break all" button first**, using the cheapest icebreaker, with "Other ways ▸" for the rest. Fastest, but you see the choices less clearly.
4. **Include the Archives lane and tap-to-open discard fixes (S-10-5)?** — **Recommended:** A. Options:
   A) **Yes, in this sprint.** Both are about the board looking right, which is this sprint's theme.
   B) **Push them to Sprint 11** to keep this sprint smaller.

## Risks
- **The rows are already full on small phones.** A scored pile, plus Link and Tagged, all need room at 640×360 and on your 891×296 screen. *What we'll do:* the team lays out every size first, adds automated checks at all four sizes, and keeps the "nothing overlaps, thumb-size buttons" rule. If something has to shrink, it will be the labels, not the buttons.
- **Making Bank Job and Advance work differently changes the rules.** Any online game that is running when we update will end ("That game has ended"), as after earlier sprints. *What we'll do:* we'll say so in the demo notes. Just start a new game.
- **Moving Private Security Force's button to the new pile** could break the Sprint 9 checks that tap the score label. *What we'll do:* tapping the label keeps working as a shortcut, and QA re-runs the Sprint 9 PSF checks.
- **Six stories is a full sprint.** *What we'll do:* S-10-6 is cut first, then S-10-5 (question 4), and you'll be told in the demo notes.
