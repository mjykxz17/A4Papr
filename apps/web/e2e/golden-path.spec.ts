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

  // export PDF — only assert the request fires; mocking the worker is overkill here.
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/cheatsheets/') && r.url().endsWith('/export'),
    ),
    page.getByRole('button', { name: /Export PDF/ }).click(),
  ]);
});
