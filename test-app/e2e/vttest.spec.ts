/**
 * vttest conformance tests via Playwright.
 *
 * Runs vttest on a remote machine through the SSH terminal and
 * screenshots each test screen for visual verification.
 *
 * Prerequisites:
 *   - test-app server running on localhost:3000
 *   - vttest installed on the remote machine
 */

import { expect, test } from '@playwright/test';

// Helper: wait for terminal to connect
async function waitForShell(page: any) {
  await page.goto('/');
  await page.waitForFunction(
    () => document.getElementById('status')?.textContent === 'Connected',
    null,
    { timeout: 15000 }
  );
  await page.waitForTimeout(2000);
}

// Helper: type and press enter
async function send(page: any, text: string, waitMs = 1500) {
  await page.keyboard.type(text, { delay: 20 });
  await page.waitForTimeout(waitMs);
}

// Helper: press Enter (advance vttest)
async function enter(page: any, waitMs = 1000) {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(waitMs);
}

// Helper: screenshot the terminal
async function screenshot(page: any, name: string) {
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveScreenshot(name, {
    maxDiffPixelRatio: 0.05, // vttest output can vary slightly
  });
}

// Helper: start vttest and select a menu option
async function startVttest(page: any, menuChoice: string) {
  await waitForShell(page);
  await send(page, 'vttest');
  await enter(page, 2000); // wait for vttest menu to render
  await send(page, menuChoice);
  await enter(page, 2000); // wait for test screen
}

// ============================================================================
// vttest conformance tests
// ============================================================================

test.describe('vttest conformance', () => {
  test.describe.configure({ timeout: 60000 });

  test('1. Cursor movements', async ({ page }) => {
    await startVttest(page, '1');

    // vttest shows multiple sub-screens for cursor tests
    // Screenshot each, pressing Enter to advance
    await screenshot(page, 'vttest-1-cursor-1.png');
    await enter(page, 1500);
    await screenshot(page, 'vttest-1-cursor-2.png');
    await enter(page, 1500);
    await screenshot(page, 'vttest-1-cursor-3.png');
    await enter(page, 1500);
    await screenshot(page, 'vttest-1-cursor-4.png');
    await enter(page, 1500);
    await screenshot(page, 'vttest-1-cursor-5.png');

    // Return to main menu
    await enter(page);
  });

  test('2. Screen features', async ({ page }) => {
    await startVttest(page, '2');

    await screenshot(page, 'vttest-2-screen-1.png');
    await enter(page, 1500);
    await screenshot(page, 'vttest-2-screen-2.png');
    await enter(page, 1500);
    await screenshot(page, 'vttest-2-screen-3.png');
    await enter(page, 1500);
    await screenshot(page, 'vttest-2-screen-4.png');
    await enter(page, 1500);
    await screenshot(page, 'vttest-2-screen-5.png');

    await enter(page);
  });

  test('3. Character sets', async ({ page }) => {
    await startVttest(page, '3');

    await screenshot(page, 'vttest-3-charset-1.png');
    await enter(page, 1500);
    await screenshot(page, 'vttest-3-charset-2.png');
    await enter(page, 1500);
    await screenshot(page, 'vttest-3-charset-3.png');

    await enter(page);
  });

  test('4. Double-sized characters', async ({ page }) => {
    await startVttest(page, '4');

    await screenshot(page, 'vttest-4-double-1.png');
    await enter(page, 1500);
    await screenshot(page, 'vttest-4-double-2.png');
    await enter(page, 1500);
    await screenshot(page, 'vttest-4-double-3.png');

    await enter(page);
  });

  test('6. Terminal reports', async ({ page }) => {
    await startVttest(page, '6');

    await screenshot(page, 'vttest-6-reports-1.png');
    await enter(page, 1500);
    await screenshot(page, 'vttest-6-reports-2.png');
    await enter(page, 1500);
    await screenshot(page, 'vttest-6-reports-3.png');

    await enter(page);
  });

  test('8. VT102 Insert/Delete', async ({ page }) => {
    await startVttest(page, '8');

    // VT102 has a sub-menu
    await screenshot(page, 'vttest-8-vt102-menu.png');
    // Select test 1: insert/delete line
    await send(page, '1');
    await enter(page, 2000);

    await screenshot(page, 'vttest-8-vt102-1.png');
    await enter(page, 1500);
    await screenshot(page, 'vttest-8-vt102-2.png');
    await enter(page, 1500);
    await screenshot(page, 'vttest-8-vt102-3.png');

    // Return to sub-menu then main menu
    await enter(page);
    await send(page, '0');
    await enter(page);
  });

  test('11. Non-VT100 (VT220/XTERM) features', async ({ page }) => {
    await startVttest(page, '11');

    // Sub-menu for VT220/XTERM tests
    await screenshot(page, 'vttest-11-menu.png');

    // Test 1: status line
    await send(page, '1');
    await enter(page, 2000);
    await screenshot(page, 'vttest-11-1.png');
    await enter(page, 1500);
    await screenshot(page, 'vttest-11-2.png');
    await enter(page, 1500);

    // Return to sub-menu then main menu
    await enter(page);
    await send(page, '0');
    await enter(page);
  });
});
