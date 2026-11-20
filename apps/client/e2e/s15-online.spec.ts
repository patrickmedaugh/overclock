// Sprint 15 (S-15-2, S-15-4): online, the other phone's moves fly in from their side. The Corp's
// phone installs a card in a new server; the Runner's phone sees a card back fly in from the top
// (never its face), and nothing in what the service sent changes (movement is client-only).
import { expect, test } from '@playwright/test';
import type { CardOption } from '@overclock/engine';
import { act, joinGame, layoutOf, openPhone, startTestGame, view, waitPlaying, waitView } from './online';

test.describe('S-15-2 online: the other player\'s cards fly in', () => {
  test("the Corp's install on the other phone flies in face down from the top on the Runner's phone", async ({ browser }) => {
    const corp = await openPhone(browser);
    const runner = await openPhone(browser, 'motion=hold');
    const code = await startTestGame(corp, 'corp', { seed: 1, actions: [], deckSet: 'starter' });
    await joinGame(runner, code);
    await Promise.all([waitPlaying(corp), waitPlaying(runner)]);
    const v = await view(corp);
    const opt = v.handOptions.flat().find((o: CardOption) => o.reject === null && o.action.type === 'install' && o.action.server === 'new')!;
    const framesBefore = runner.received.length;
    await runner.page.evaluate(() => window.__overclock!.clearAnims());
    await act(corp, opt.action);
    await waitView(runner, (w) => w.corpServers.length > 3);
    await runner.page.waitForFunction(() => window.__overclock!.layout().motion.flights.some((f) => f.kind === 'install'));
    const l = await layoutOf(runner);
    const f = l.motion.flights.find((x) => x.kind === 'install')!;
    expect(f.cardId, 'a card back').toBeNull();
    expect(f.box.y + f.box.height / 2, 'from the Corp side (top)').toBeLessThan(l.viewport.height / 2);
    // It lands on its place.
    const landed = await runner.page.evaluate(() => {
      window.__overclock!.advanceMotion(600);
      return window.__overclock!.layout();
    });
    expect(landed.motion.active).toBe(0);
    const rec = (await runner.page.evaluate(() => window.__overclock!.anims())).filter((a) => a.kind === 'opponent_flight');
    expect(rec.length).toBe(1);
    expect(rec[0]!.text).toBe('');
    expect(rec[0]!.scheduledMs).toBeLessThanOrEqual(600);
    // The service's frames are what they were before movement existed: no card id for the Runner.
    const cardId = v.players.corp.hand![v.handOptions.findIndex((os) => os.includes(opt))]!;
    for (const raw of runner.received.slice(framesBefore)) expect(raw.includes(`"${cardId}"`), 'the Runner never receives the card').toBe(false);
    await corp.context.close();
    await runner.context.close();
  });
});
