// Sprint 3 screenshots for the demo notes (docs/sprints/sprint-03-screens/).
// Always runs (it walks a run from Run to the win screen and checks each screen is
// clean), but only writes the PNGs with SAVE_SCREENS=1, so a normal e2e run leaves
// the docs untouched.
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';
import { expectCleanLayout, layout, openBoard, runButtonOf, startRun, tap, targetOf, toRunnerTurn, toStep, waitIdle } from './helpers';

const DIR = fileURLToPath(new URL('../../../docs/sprints/sprint-03-screens/', import.meta.url));
const SAVE = process.env.SAVE_SCREENS === '1';

async function shot(page: Page, name: string): Promise<void> {
  const l = await waitIdle(page);
  expectCleanLayout(l);
  // The small phone and the computer: the two ends of the supported sizes.
  if (SAVE && test.info().project.name !== 'phone') await page.screenshot({ path: `${DIR}${name}-${test.info().project.name}.png` });
}

test('Sprint 3 screens: Run, rez, encounter, access, advance, win', async ({ page }) => {
  test.setTimeout(90_000);
  await openBoard(page, 1);
  await toRunnerTurn(page);
  await tap(page, (await layout(page)).runButton!.box);
  await shot(page, '01-run-servers-lit');
  await tap(page, targetOf(await layout(page), 'run', 'rd').box);
  await shot(page, '02-access-rd-steal');

  await openBoard(page, 1);
  await toStep(page, 1, 'corp_rez_prompt');
  await shot(page, '03-corp-rez-prompt');

  await openBoard(page, 2);
  await toStep(page, 2, 'wall_of_static_encounter');
  await shot(page, '04-encounter-wall-of-static');
  await tap(page, runButtonOf(await layout(page), /strength/).box);
  await waitIdle(page);
  await tap(page, runButtonOf(await layout(page), /^Break/).box);
  await shot(page, '05-subroutine-broken-continue');

  await openBoard(page, 2);
  await toRunnerTurn(page);
  await startRun(page, 'rd');
  await shot(page, '06-access-trash-or-leave');

  await openBoard(page, 1);
  const plan = await toStep(page, 1, 'agenda_one_advance');
  const card = (await layout(page)).servers.flatMap((s) => s.content).find((c) => c.uid === plan.info.uid)!;
  await tap(page, card.box);
  await tap(page, targetOf(await layout(page), 'advance').box);
  await shot(page, '07-corp-advance-and-score');

  await openBoard(page, 1);
  const win = await toStep(page, 1, 'corp_one_score_from_win');
  const agenda = (await layout(page)).servers.flatMap((s) => s.content).find((c) => c.uid === win.info.uid)!;
  await tap(page, agenda.box);
  await tap(page, targetOf(await layout(page), 'score').box);
  await page.waitForTimeout(300);
  const l = await waitIdle(page);
  expect(l.gameOver?.title).toBe('Corp wins');
  await shot(page, '08-corp-wins');
});
