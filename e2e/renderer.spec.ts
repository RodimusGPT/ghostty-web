import { expect, test } from '@playwright/test';

const scenarios = [
  'basic-text',
  'ansi-16-colors',
  'rgb-colors',
  'text-styles',
  'underline-styles',
  'wide-chars',
  'dense-content',
];

const cursorScenarios = [
  { scenario: 'cursor-block', cursor: 'block' },
  { scenario: 'cursor-underline', cursor: 'underline' },
  { scenario: 'cursor-bar', cursor: 'bar' },
];

async function waitForTerminal(page: any) {
  const errors: string[] = [];
  page.on('pageerror', (err: any) => errors.push(err.message));
  page.on('console', (msg: any) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page
    .waitForFunction(() => document.title !== 'loading', null, { timeout: 15000 })
    .catch(() => {
      throw new Error(`Terminal failed to load. Errors: ${errors.join('; ') || 'none captured'}`);
    });

  const title = await page.title();
  if (title.startsWith('error:')) {
    throw new Error(`Terminal init failed: ${title}`);
  }

  await page.waitForTimeout(200);
}

for (const scenario of scenarios) {
  test(`visual: ${scenario}`, async ({ page }) => {
    await page.goto(`/e2e/visual-test.html?scenario=${scenario}`);
    await waitForTerminal(page);

    const canvas = page.locator('canvas');
    await expect(canvas).toHaveScreenshot(`${scenario}.png`, {
      maxDiffPixelRatio: 0.01,
    });
  });
}

for (const { scenario, cursor } of cursorScenarios) {
  test(`visual: ${scenario}`, async ({ page }) => {
    await page.goto(`/e2e/visual-test.html?scenario=${scenario}&cursor=${cursor}`);
    await waitForTerminal(page);

    const canvas = page.locator('canvas');
    await expect(canvas).toHaveScreenshot(`${scenario}.png`, {
      maxDiffPixelRatio: 0.01,
    });
  });
}
