// Sprint 8 (U1): QA-S7-1 and QA-S7-2.
// QA-S7-1: credits on a card (Armitage 12, Bank Job 8, Cyberfeeder 1) never cover
// the card's name or type line, and the name is not cut ("Armitage Codebustin").
// QA-S7-2: credits on a card (dark pill, gold coin) and advancement counters
// (green tag, chevron) look clearly different, on both players' boards.
// Runs at all three sizes; 640x360 screenshots go to docs/sprints/sprint-08-screens/.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCard } from '@overclock/cards';
import { type Page, expect, test } from '@playwright/test';
import type { InstalledSnapshot, LayoutSnapshot } from '../src/hook-types';
import { dispatch, expectCleanLayout, expectMarkersClear, getView, openBoard, passTurn, toStep, waitIdle } from './helpers';

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/sprints/sprint-08-screens');

async function shot(page: Page, name: string): Promise<void> {
  const small = test.info().project.name === 'phone-small';
  if (small) mkdirSync(SHOTS, { recursive: true });
  const body = await page.screenshot(small ? { path: join(SHOTS, `${name}.png`) } : {});
  await test.info().attach(name, { body, contentType: 'image/png' });
}

function installedIn(l: LayoutSnapshot, uid: string): InstalledSnapshot {
  const c = [...l.servers.flatMap((s) => [...s.ice, ...s.content]), ...l.rig].find((x) => x.uid === uid);
  if (!c) throw new Error(`no installed card ${uid}`);
  return c;
}

/** The credits pill on `uid` reads `text`, is a gold coin pill (>= 14 px digits), and leaves the name and type readable. */
function expectReadablePill(l: LayoutSnapshot, uid: string, text: string): void {
  const c = installedIn(l, uid);
  expect(c.hosted).toMatchObject({ text, icon: 'coin' });
  expect(c.hosted!.fontPx).toBeGreaterThanOrEqual(14);
  expect(c.face, 'face up').not.toBeNull();
  // The whole name is drawn (not cut with an ellipsis, not split mid-word under the pill).
  expect(c.face!.nameText.replace(/\s+/g, ' ')).toBe(getCard(c.cardId!)!.name);
  // Name and type label are on the card.
  for (const b of [c.face!.name, c.face!.type]) {
    expect(b.x).toBeGreaterThanOrEqual(c.box.x - 0.5);
    expect(b.x + b.width).toBeLessThanOrEqual(c.box.x + c.box.width + 0.5);
  }
  expectMarkersClear(l);
}

test.describe('QA-S7-1 credits on a card never cover its name or type', () => {
  test('Armitage Codebusting: "12" pill, full name and RESOURCE readable', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'runner_armitage');
    const l = await waitIdle(page);
    expectReadablePill(l, plan.info['uid']!, '12');
    expectCleanLayout(l);
    await shot(page, 'u1-armitage-12');
  });

  test('Bank Job "8" and Cyberfeeder "1": pill clear of name and type', async ({ page }) => {
    await openBoard(page, 1);
    const bj = await toStep(page, 1, 'runner_bank_job_remote');
    let l = await waitIdle(page);
    expectReadablePill(l, bj.info['bankJobUid']!, '8');
    await shot(page, 'u1-bank-job-8');
    await openBoard(page, 1);
    const cf = await toStep(page, 1, 'runner_cyberfeeder_ice_wall');
    l = await waitIdle(page);
    expectReadablePill(l, cf.info['cyberfeederUid']!, '1');
  });
});

test.describe('QA-S7-2 advancement counters look different from credits', () => {
  test('Ice Wall with 2 counters: green chevron tag on both boards, not the gold coin pill', async ({ page }) => {
    await openBoard(page, 1);
    const plan = await toStep(page, 1, 'corp_ice_wall');
    const uid = plan.info['uid']!;
    for (let i = 0; i < 2; i++) {
      const events = await dispatch(page, { type: 'advance', player: 'corp', uid });
      expect(events.find((e) => e.type === 'action_rejected')).toBeUndefined();
    }
    let l = await waitIdle(page);
    const tag = installedIn(l, uid).counterBadge!;
    expect(tag).toMatchObject({ text: '2', icon: 'chevron' });
    expect(tag.fontPx).toBeGreaterThanOrEqual(12);
    expect(tag.box.height).toBeGreaterThanOrEqual(14);
    expectMarkersClear(l);
    await shot(page, 'u1-ice-wall-2-corp');
    // The Runner sees the same tag on the card back.
    await passTurn(page);
    expect((await getView(page)).viewer).toBe('runner');
    l = await waitIdle(page);
    const back = installedIn(l, uid);
    expect(back.faceUp).toBe(false);
    expect(back.counterBadge).toMatchObject({ text: '2', icon: 'chevron', color: tag.color });
    expectMarkersClear(l);
    await shot(page, 'u1-ice-wall-2-runner-back');
    // Compare with credits on a card: a different colour and icon.
    await openBoard(page, 1);
    const arm = await toStep(page, 1, 'runner_armitage');
    const pill = installedIn(await waitIdle(page), arm.info['uid']!).hosted!;
    expect(pill.icon).not.toBe(tag.icon);
    expect(pill.color).not.toBe(tag.color);
  });
});
