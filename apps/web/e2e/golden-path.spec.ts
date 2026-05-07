import { test, expect } from '@playwright/test';

/**
 * The DoD's one mandatory E2E:
 *   land → create text block → drag onto canvas → export PDF.
 *
 * Auth is not in the MVP, so the "sign up" step is replaced with the
 * anonymous landing flow that gives every visitor a device cookie.
 *
 * Skipped automatically unless the DB and worker are running. Run with:
 *   docker compose up -d postgres
 *   pnpm db:migrate
 *   pnpm --filter @cheatsheet/worker dev   # terminal 2
 *   pnpm --filter @cheatsheet/web dev      # terminal 3
 *   pnpm --filter @cheatsheet/web test:e2e
 */

test('anonymous user creates a text block and drags it onto the canvas', async ({ page }) => {
  await page.goto('/');
  // landing redirects into /editor/<id>
  await expect(page).toHaveURL(/\/editor\/[0-9a-f-]+/);

  // open the new block modal
  await page.getByRole('button', { name: '+ New block' }).click();
  await page.getByRole('heading', { name: 'New block' }).waitFor();

  // type defaults to text — type some markdown
  await page.locator('textarea').first().fill('**Bayes** says hi');
  await page.getByRole('button', { name: 'Save' }).click();

  // sidebar card should now show a draggable block
  const sidebarCard = page.locator('aside li').first();
  await expect(sidebarCard).toBeVisible();

  // drag from the sidebar card onto the canvas
  const canvas = page.locator('.a4-page');
  await sidebarCard.dragTo(canvas, { targetPosition: { x: 100, y: 80 } });

  // a placement renders on the page
  await expect(page.locator('.canvas-block')).toHaveCount(1);

  // duplicate via ⌘D (Cmd on macOS, Ctrl elsewhere) — verifies undo
  // history captures the second placement.
  const ctrl = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.locator('.canvas-block').first().click();
  await page.keyboard.press(`${ctrl}+d`);
  await expect(page.locator('.canvas-block')).toHaveCount(2);

  // undo: pops back to one placement
  await page.keyboard.press(`${ctrl}+z`);
  await expect(page.locator('.canvas-block')).toHaveCount(1);

  // redo (Shift+Cmd/Ctrl+Z): restores the second placement
  await page.keyboard.press(`Shift+${ctrl}+z`);
  await expect(page.locator('.canvas-block')).toHaveCount(2);

  // export PDF — wait for the response, assert it's a real PDF.
  const [exportResponse] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/cheatsheets/') && r.url().endsWith('/export'),
    ),
    page.getByRole('button', { name: /Export PDF/ }).click(),
  ]);
  expect(exportResponse.status()).toBe(200);
  expect(exportResponse.headers()['content-type']).toMatch(/application\/pdf/);
  const body = await exportResponse.body();
  expect(body.byteLength).toBeGreaterThan(1000);
  // PDFs start with the magic bytes "%PDF"
  expect(body.subarray(0, 4).toString('ascii')).toBe('%PDF');
});
