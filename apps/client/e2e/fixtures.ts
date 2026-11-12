// Shared Playwright `test` for every spec. With E2E_CPU_THROTTLE=<rate> (e.g. 6) each
// test's page runs under Chrome's CPU throttling (CDP Emulation.setCPUThrottlingRate),
// which is how the timing specs are proven stable on slow CI runners:
//   E2E_CPU_THROTTLE=6 npx playwright test --repeat-each=10 turn.spec.ts qa-sprint01.spec.ts
import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';
export type { Page } from '@playwright/test';

const rate = Number(process.env.E2E_CPU_THROTTLE ?? '1');

export const test = base.extend<{ cpuThrottle: number }>({
  cpuThrottle: [
    async ({ page }, use) => {
      if (rate > 1) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate });
        test.info().annotations.push({ type: 'cpu throttle', description: `${rate}x` });
      }
      await use(rate);
    },
    { auto: true },
  ],
});
