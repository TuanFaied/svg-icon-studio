import { expect, test } from '@playwright/test';
import { cellCenter, grid, openApp } from './helpers';

test('draws with touch without scrolling the page', async ({ page }) => {
  await openApp(page);
  const canvas = page.getByTestId('pixel-canvas');
  await expect(canvas).toBeVisible();
  const a = await cellCenter(page, 2, 2);
  const b = await cellCenter(page, 18, 16);

  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await touch('touchStart', a.x, a.y);
  for (let i = 1; i <= 8; i++) await touch('touchMove', a.x + ((b.x - a.x) * i) / 8, a.y + ((b.y - a.y) * i) / 8);
  await touch('touchEnd', b.x, b.y);

  const g = await grid(page);
  expect(g.data[2 * g.width + 2]).not.toBe(0);
  expect(g.data[16 * g.width + 18]).not.toBe(0);
  expect(await page.evaluate(() => [window.scrollX, window.scrollY, document.scrollingElement?.scrollTop ?? 0])).toEqual([0, 0, 0]);

  // Mobile layout: bottom toolbar and panel tabs instead of side panels.
  await expect(page.getByRole('toolbar', { name: 'Drawing tools' })).toBeVisible();
  await page.getByRole('tab', { name: 'Code' }).click();
  await expect(page.getByTestId('code-editor')).toContainText('<svg');
});
