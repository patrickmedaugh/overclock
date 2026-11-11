# Project OVERCLOCK — kickoff package

Drop these files into the root of a new, empty GitHub repo.

## What's here
- `CLAUDE.md` — team charter the AI agents follow (rules, architecture, definition of done)
- `.claude/agents/` — the team: `pm`, `architect`, `engine-dev`, `ui-dev`, `qa`
- `prompts/sprint-loop.md` — the instructions each scheduled session runs
- `docs/STATE.md` — where the project is right now
- `docs/sprints/sprint-00-proposal.md` — the first sprint, waiting for your approval
- `docs/BACKLOG.md`, `docs/RULES_SPEC.md`, `docs/DECISIONS.md`, `docs/GLOSSARY.md`

## Setup (one time)
1. Create an empty GitHub repo and upload these files.
2. Connect the repo to Claude Code (claude.ai/code) with GitHub access.
3. Create a scheduled task (e.g. daily) with this prompt:
   > Follow `prompts/sprint-loop.md` in this repo exactly.
4. Run it once by hand. It opens the Sprint 0 proposal as a PR.

## Your job
- **Proposal PRs:** read it, answer the questions, comment `approved` (or comment changes).
- **Demo PRs:** open the link, run the checklist, say accepted / not accepted per story.
- That's it. Everything else is the team's job.
