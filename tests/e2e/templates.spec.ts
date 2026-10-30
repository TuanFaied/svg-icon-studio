import { expect, type Locator, type Page, test } from '@playwright/test';
import { cellCenter, grid, menuAction, openApp, showPanel } from './helpers';

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Loader templates' });
const card = (page: Page, id: string) => dialog(page).locator(`[data-template="${id}"]`);
const imgSource = (img: Locator) => img.evaluate(async (el: HTMLImageElement) => (await fetch(el.src)).text());

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('loads a template in one undoable step', async ({ page }) => {
  const p = await cellCenter(page, 5, 5);
  await page.mouse.click(p.x, p.y);
  const drawn = await grid(page);

  await menuAction(page, 'Loader templates');
  await dialog(page).getByRole('radio', { name: '32×32' }).click();
  await card(page, 'chasing-dots').click();

  await expect(dialog(page)).toBeHidden();
  await expect(page.getByText('Loaded “Chasing dots”. Undo to go back.')).toBeVisible();
  await expect(page.getByLabel('Project name')).toHaveValue('Chasing dots');
  await expect(page.getByLabel('Preset', { exact: true })).toHaveValue('sequence');
  const t = await grid(page);
  expect([t.width, t.height]).toEqual([32, 32]);
  expect(new Set(t.data.filter(Boolean)).size).toBe(8);
  await showPanel(page, 'Code');
  await expect(page.getByTestId('code-editor')).toContainText('-sequence');
  await showPanel(page, 'Properties');

  await page.getByTestId('pixel-canvas').focus();
  await page.keyboard.press('Control+z');
  const back = await grid(page);
  expect(back).toEqual(drawn);
  await expect(page.getByLabel('Project name')).toHaveValue('Untitled icon');
  await expect(page.getByLabel('Preset', { exact: true })).toHaveValue('none');

  await page.keyboard.press('Control+Shift+z');
  expect(await grid(page)).toEqual(t);
  await expect(page.getByLabel('Project name')).toHaveValue('Chasing dots');
});

test('the previous project stays in Recent projects', async ({ page }) => {
  await page.getByLabel('Project name').fill('Before template');
  const p = await cellCenter(page, 2, 2);
  await page.mouse.click(p.x, p.y);
  await menuAction(page, 'Loader templates');
  await card(page, 'bar-loader').click();
  await expect(page.getByLabel('Project name')).toHaveValue('Bar loader');

  await menuAction(page, 'Recent projects');
  const recent = page.getByRole('dialog', { name: 'Recent projects' });
  await expect(recent.getByText('Before template', { exact: true })).toBeVisible();
});

test('thumbnails animate only while hovered or focused', async ({ page }) => {
  await menuAction(page, 'Loader templates');
  const ring = card(page, 'ring-spinner');
  const img = ring.locator('img');
  await expect(img).toHaveAttribute('src', /^blob:/);
  await page.mouse.move(0, 0);
  await expect.poll(() => imgSource(img)).not.toContain('@keyframes');

  await ring.hover();
  await expect.poll(() => imgSource(img)).toContain('-spin{');
  await page.mouse.move(0, 0);
  await expect.poll(() => imgSource(img)).not.toContain('@keyframes');

  await card(page, 'three-dot-pulse').focus();
  await expect.poll(() => imgSource(card(page, 'three-dot-pulse').locator('img'))).toContain('-sequence{');
});

test('every template loads at every size', async ({ page }) => {
  const expected: Record<string, number> = { 'ring-spinner': 2, 'chasing-dots': 8, 'three-dot-pulse': 3, 'bar-loader': 5 };
  for (const size of [16, 24, 32]) {
    for (const [id, colors] of Object.entries(expected)) {
      await menuAction(page, 'Loader templates');
      await dialog(page).getByRole('radio', { name: `${size}×${size}` }).click();
      await card(page, id).click();
      await expect(dialog(page)).toBeHidden();
      const g = await grid(page);
      expect([g.width, g.height, new Set(g.data.filter(Boolean)).size], `${id} ${size}`).toEqual([size, size, colors]);
    }
  }
});

test('the Reset dialog offers templates', async ({ page }) => {
  await menuAction(page, 'Reset…');
  await page.getByRole('dialog', { name: 'Reset' }).getByRole('button', { name: 'Templates' }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).locator('[data-template]')).toHaveCount(4);
});
