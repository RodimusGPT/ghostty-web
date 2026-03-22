/**
 * End-to-end terminal tests against a live SSH session.
 *
 * Prerequisites:
 *   - test-app server running on localhost:3000
 *   - Fly machine started and reachable
 *
 * Run: cd test-app && bunx playwright test
 */

import { expect, test } from '@playwright/test';

// Helper: wait for terminal to connect and show a shell prompt
async function waitForShell(page: any) {
  await page.goto('/');

  // Wait for "Connected" status
  await page.waitForFunction(
    () => document.getElementById('status')?.textContent === 'Connected',
    null,
    { timeout: 15000 }
  );

  // Wait for shell prompt to appear (canvas renders, so check for prompt via delay)
  await page.waitForTimeout(2000);
}

// Helper: type a command and wait for output
async function typeCommand(page: any, command: string, waitMs = 1000) {
  // Type into the terminal (it captures keyboard events on the container)
  await page.keyboard.type(command, { delay: 30 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(waitMs);
}

// Helper: screenshot the terminal canvas
async function screenshotTerminal(page: any, name: string) {
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveScreenshot(name, {
    maxDiffPixelRatio: 0.02,
  });
}

// ============================================================================
// Tests
// ============================================================================

test.describe('Live Terminal', () => {
  test('connects and shows shell prompt', async ({ page }) => {
    await page.goto('/');

    // Should show "Connecting..." initially
    const status = page.locator('#status');
    await expect(status).toHaveText('Connected', { timeout: 15000 });

    // Canvas should exist
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    // Wait for shell to initialize
    await page.waitForTimeout(2000);

    // Take screenshot of initial state
    await screenshotTerminal(page, 'initial-prompt.png');
  });

  test('can execute echo command', async ({ page }) => {
    await waitForShell(page);

    await typeCommand(page, 'echo "Hello from ghostty-web"');

    await screenshotTerminal(page, 'echo-output.png');
  });

  test('supports ANSI colors', async ({ page }) => {
    await waitForShell(page);

    // Print colored text
    await typeCommand(page, 'printf "\\e[31mRed\\e[32m Green\\e[34m Blue\\e[33m Yellow\\e[0m\\n"');

    await screenshotTerminal(page, 'ansi-colors.png');
  });

  test('supports bold and italic styles', async ({ page }) => {
    await waitForShell(page);

    await typeCommand(
      page,
      'printf "\\e[1mBold\\e[0m \\e[3mItalic\\e[0m \\e[1;3mBold+Italic\\e[0m\\n"'
    );

    await screenshotTerminal(page, 'text-styles.png');
  });

  test('handles cursor movement', async ({ page }) => {
    await waitForShell(page);

    // Use tput or escape sequences to move cursor
    await typeCommand(page, 'printf "\\e[5;10HMoved cursor here"');

    await screenshotTerminal(page, 'cursor-movement.png');
  });

  test('handles clear screen', async ({ page }) => {
    await waitForShell(page);

    await typeCommand(page, 'echo "Before clear"');
    await typeCommand(page, 'clear');
    await page.waitForTimeout(500);

    await screenshotTerminal(page, 'after-clear.png');
  });

  test('handles ls with colors', async ({ page }) => {
    await waitForShell(page);

    await typeCommand(page, 'ls --color=always /');

    await screenshotTerminal(page, 'ls-colors.png');
  });

  test('handles multiline output', async ({ page }) => {
    await waitForShell(page);

    await typeCommand(page, 'seq 1 20');

    await screenshotTerminal(page, 'multiline-output.png');
  });

  test('handles vim-style cursor change', async ({ page }) => {
    await waitForShell(page);

    // Send DECSCUSR to change cursor to bar
    await typeCommand(page, 'printf "\\e[5 q"', 500);

    await screenshotTerminal(page, 'bar-cursor.png');

    // Change back to block
    await typeCommand(page, 'printf "\\e[2 q"', 500);

    await screenshotTerminal(page, 'block-cursor.png');
  });

  test('handles wide characters', async ({ page }) => {
    await waitForShell(page);

    await typeCommand(page, 'echo "中文 日本語 한국어 ★ ♥"');

    await screenshotTerminal(page, 'wide-chars.png');
  });

  test('handles underline styles', async ({ page }) => {
    await waitForShell(page);

    await typeCommand(
      page,
      'printf "\\e[4mSingle\\e[0m \\e[4:3mCurly\\e[0m \\e[4:4mDotted\\e[0m\\n"'
    );

    await screenshotTerminal(page, 'underline-styles.png');
  });

  test('handles keyboard input correctly', async ({ page }) => {
    await waitForShell(page);

    // Type a command character by character and verify it shows
    await page.keyboard.type('echo test123', { delay: 50 });
    await page.waitForTimeout(500);

    // Screenshot should show the typed text before pressing Enter
    await screenshotTerminal(page, 'typed-input.png');

    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    await screenshotTerminal(page, 'input-result.png');
  });

  test('handles tab completion', async ({ page }) => {
    await waitForShell(page);

    await page.keyboard.type('ech', { delay: 50 });
    await page.keyboard.press('Tab');
    await page.waitForTimeout(1000);

    await screenshotTerminal(page, 'tab-completion.png');
  });

  test('handles Ctrl+C interrupt', async ({ page }) => {
    await waitForShell(page);

    // Start a long-running command
    await typeCommand(page, 'sleep 100', 500);

    // Send Ctrl+C
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(1000);

    await screenshotTerminal(page, 'ctrl-c.png');
  });
});
