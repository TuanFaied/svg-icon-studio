import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { cellCenter, grid, linePoints, makeImage, openApp, showPanel } from './helpers';

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  (page as unknown as { __errors: string[] }).__errors = errors;
  await openApp(page);
});

test.afterEach(async ({ page }) => {
  // Done means no console errors (VTracer fallback warnings are not errors).
  expect((page as unknown as { __errors: string[] }).__errors).toEqual([]);
});

test('fast mouse drags leave no gaps', async ({ page }) => {
  const segments: Array<[number, number, number, number]> = [
    [1, 1, 22, 20],
    [22, 20, 2, 22],
    [2, 22, 20, 3],
  ];
  const start = await cellCenter(page, segments[0][0], segments[0][1]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const [, , x1, y1] of segments) {
    const p = await cellCenter(page, x1, y1);
    await page.mouse.move(p.x, p.y, { steps: 1 }); // one jump per segment: worst case for gaps
  }
  await page.mouse.up();

  const g = await grid(page);
  for (const [x0, y0, x1, y1] of segments) {
    for (const [x, y] of linePoints(x0, y0, x1, y1)) {
      expect(g.data[y * g.width + x], `cell ${x},${y}`).not.toBe(0);
    }
  }
});

test('undo and redo via keyboard group whole strokes', async ({ page }) => {
  const a = await cellCenter(page, 3, 3);
  const b = await cellCenter(page, 12, 3);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  const painted = (await grid(page)).data.filter(Boolean).length;
  expect(painted).toBe(10);

  await page.keyboard.press('Control+z');
  expect((await grid(page)).data.filter(Boolean).length).toBe(0);
  await page.keyboard.press('Control+Shift+z');
  expect((await grid(page)).data.filter(Boolean).length).toBe(10);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+y');
  expect((await grid(page)).data.filter(Boolean).length).toBe(10);
});

test('shortcuts are ignored while typing in a text field', async ({ page }) => {
  await page.getByLabel('Project name').fill('Rocket');
  await page.keyboard.press('e');
  await expect(page.getByRole('button', { name: 'Pencil' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('pixel-canvas').focus();
  await page.keyboard.press('e');
  await expect(page.getByRole('button', { name: 'Eraser' })).toHaveAttribute('aria-pressed', 'true');
});

test('downloads SVG and a PNG whose pixels match the grid at 1×', async ({ page }) => {
  // Two colors so the PNG check covers more than one value.
  for (const [x, y] of [[0, 0], [5, 5], [23, 23]]) {
    const p = await cellCenter(page, x, y);
    await page.mouse.click(p.x, p.y);
  }
  const p2 = await cellCenter(page, 10, 2);
  await page.mouse.click(p2.x, p2.y, { button: 'right' }); // secondary (white)
  const g = await grid(page);

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  const [svgDl] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download SVG' }).click()]);
  expect(svgDl.suggestedFilename()).toBe('untitled-icon.svg');
  const svg = await readFile(await svgDl.path(), 'utf8');
  expect(svg).toContain('viewBox="0 0 24 24"');

  await dialog.getByRole('button', { name: 'PNG' }).click();
  await dialog.getByRole('radio', { name: '1×' }).click();
  const [pngDl] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download PNG' }).click()]);
  const png = await readFile(await pngDl.path());

  const pixels = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
    ctx.drawImage(bmp, 0, 0);
    return { w: bmp.width, h: bmp.height, data: Array.from(ctx.getImageData(0, 0, bmp.width, bmp.height).data) };
  }, png.toString('base64'));

  expect([pixels.w, pixels.h]).toEqual([g.width, g.height]);
  for (let i = 0; i < g.data.length; i++) {
    const c = g.data[i] >>> 0;
    const rgba = [c >>> 24, (c >>> 16) & 255, (c >>> 8) & 255, c & 255];
    expect(pixels.data.slice(i * 4, i * 4 + 4), `pixel ${i}`).toEqual(rgba);
  }
});

test.describe('convert', () => {
  test.beforeEach(async ({ page }) => {
    await page.getByRole('radio', { name: 'Convert' }).click();
  });

  test('traces a transparent PNG as a silhouette', async ({ page }) => {
    const png = await makeImage(page, 'transparent');
    await page.getByTestId('image-input').setInputFiles({ name: 'tri.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByText('Has transparency')).toBeVisible();
    await page.getByRole('radio', { name: /Silhouette/ }).click();
    await expect(page.getByText(/potrace · \d+ ms/)).toBeVisible({ timeout: 20_000 });
    await showPanel(page, 'Code');
    await expect(page.getByTestId('code-editor')).toContainText('<path');
  });

  test('a large photo is downscaled, traced off the main thread, and warns about size', async ({ page }) => {
    // Color-tracing a 1600×1200 photo is the heaviest job in the suite; with
    // other tests running in parallel it can take 40–50s, so give it 3× the budget.
    test.slow();
    const jpg = await makeImage(page, 'photo');
    await page.getByTestId('image-input').setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: jpg });
    await expect(page.getByText(/processed at|No transparency/).first()).toBeVisible();
    await page.getByRole('radio', { name: /Color Vector/ }).click();
    // While tracing, the UI stays interactive.
    const cancel = page.getByRole('button', { name: 'Cancel' });
    await expect(cancel).toBeVisible({ timeout: 10_000 });
    const t0 = Date.now();
    await page.getByRole('switch', { name: /Path outlines/ }).click();
    expect(Date.now() - t0).toBeLessThan(1500);
    await expect(page.getByText(/vtracer|imagetracer/)).toBeVisible({ timeout: 40_000 });
    await expect(page.getByRole('alert').filter({ hasText: 'vectorize well' })).toBeVisible();
  });

  test('rejects a renamed .txt file', async ({ page }) => {
    await page.getByTestId('image-input').setInputFiles({ name: 'notes.png', mimeType: 'image/png', buffer: Buffer.from('just some text') });
    await expect(page.getByRole('alert').filter({ hasText: 'could not be decoded' })).toBeVisible();
  });

  test('pixel art import opens in the editor', async ({ page }) => {
    const png = await makeImage(page, 'transparent');
    await page.getByTestId('image-input').setInputFiles({ name: 'tri.png', mimeType: 'image/png', buffer: png });
    await page.getByRole('radio', { name: /Pixel Art/ }).click();
    await page.getByRole('button', { name: 'Open in pixel editor' }).click();
    await expect(page.getByRole('radio', { name: 'Draw' })).toHaveAttribute('aria-checked', 'true');
    const g = await grid(page);
    expect([g.width, g.height]).toEqual([32, 32]);
    expect(g.data.filter(Boolean).length).toBeGreaterThan(50);
    expect(g.data[0]).toBe(0); // transparent corner stays transparent
  });
});
