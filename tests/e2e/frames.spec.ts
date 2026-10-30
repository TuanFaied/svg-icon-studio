import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { GifReader } from 'omggif';
import { createGrid } from '../../src/core/grid/grid';
import { pack } from '../../src/core/grid/color';
import { DEFAULT_SVG_OPTIONS } from '../../src/core/svg/generate';
import { serializeProject } from '../../src/core/project/project';
import { cellCenter, menuAction, openApp, showPanel } from './helpers';

const frames = (page: Page) => page.evaluate(() => window.__SIS__.frames());
const timeline = (page: Page) => page.getByRole('region', { name: 'Animation timeline' });
const currentFrameNumber = async (page: Page) =>
  Number(await timeline(page).locator('[aria-current="true"]').getAttribute('data-frame'));

async function click(page: Page, x: number, y: number) {
  const p = await cellCenter(page, x, y);
  await page.mouse.click(p.x, p.y);
}

/** Four frames, each with one red dot further right: (2,12), (7,12), (12,12), (17,12). */
async function drawWalk(page: Page) {
  await click(page, 2, 12);
  for (let k = 1; k < 4; k++) {
    await timeline(page).getByRole('button', { name: /^Add (blank frame|frame to animate)$/ }).click();
    await click(page, 2 + 5 * k, 12);
  }
}

async function previewSource(page: Page): Promise<string> {
  const img = page.getByRole('img', { name: /Preview of/ }).locator('img');
  await expect(img).toHaveAttribute('src', /^blob:/);
  return img.evaluate(async (el: HTMLImageElement) => (await fetch(el.src)).text());
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('draw a 4-frame animation, play it, and export SVG, GIF and a sprite sheet', async ({ page }) => {
  await drawWalk(page);
  const f = await frames(page);
  expect(f.frames).toHaveLength(4);
  f.frames.forEach((fr, k) => {
    const dots = fr.data.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    expect(dots, `frame ${k}`).toEqual([12 * 24 + 2 + 5 * k]);
  });
  await expect(timeline(page)).toContainText('4 frames');

  // Preview: one group per frame, exactly one visible at a time.
  await expect.poll(() => previewSource(page)).toMatch(/-f3[" ]/);
  const svg = await previewSource(page);
  const visible = await page.evaluate(async (markup) => {
    const host = document.createElement('div');
    host.innerHTML = markup;
    document.body.appendChild(host);
    const seen: number[] = [];
    for (let t = 0; t < 8; t++) {
      const shown = [...host.querySelectorAll('[class*="-fr "]')].filter((g) => getComputedStyle(g).opacity === '1');
      if (shown.length !== 1) return { error: `${shown.length} frames visible` };
      seen.push(Number(shown[0].getAttribute('class')?.match(/-f(\d+)$/)?.[1]));
      await new Promise((r) => setTimeout(r, 60));
    }
    host.remove();
    return { seen };
  }, svg);
  expect(visible).not.toHaveProperty('error');
  expect(new Set((visible as { seen: number[] }).seen).size).toBeGreaterThan(1);

  // Play on the canvas: the current frame advances by itself, then stops on pause.
  await timeline(page).getByRole('button', { name: 'Play animation' }).click();
  const seenOnCanvas = new Set<number>();
  for (let i = 0; i < 12; i++) {
    seenOnCanvas.add(await currentFrameNumber(page));
    await page.waitForTimeout(60);
  }
  expect(seenOnCanvas.size).toBeGreaterThanOrEqual(3);
  await timeline(page).getByRole('button', { name: 'Pause animation' }).click();
  const stopped = await currentFrameNumber(page);
  await page.waitForTimeout(300);
  expect(await currentFrameNumber(page)).toBe(stopped);

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });

  const [svgDl] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download SVG' }).click()]);
  const svgFile = await readFile(await svgDl.path(), 'utf8');
  for (let i = 0; i < 4; i++) expect(svgFile).toMatch(new RegExp(`-f${i}"`));

  await dialog.getByRole('button', { name: 'Animated GIF' }).click();
  await expect(dialog.getByText(/4 frames · 0\.40 s loop/)).toBeVisible();
  await dialog.getByRole('radio', { name: '1×' }).click();
  const [gifDl] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download GIF' }).click()]);
  expect(gifDl.suggestedFilename()).toBe('untitled-icon.gif');
  const gif = new GifReader(new Uint8Array(await readFile(await gifDl.path())));
  expect([gif.width, gif.height, gif.numFrames()]).toEqual([24, 24, 4]);
  for (let k = 0; k < 4; k++) {
    expect(gif.frameInfo(k).delay).toBe(10);
    const px = new Uint8Array(24 * 24 * 4);
    gif.decodeAndBlitFrameRGBA(k, px);
    const at = (x: number) => Array.from(px.slice((12 * 24 + x) * 4, (12 * 24 + x) * 4 + 4));
    // Dots are drawn in the default primary color, black; the next frame's spot is empty.
    expect(at(2 + 5 * k), `GIF frame ${k}`).toEqual([0, 0, 0, 255]);
    expect(at(2 + 5 * ((k + 1) % 4))[3], `GIF frame ${k} elsewhere`).toBe(0);
  }

  await dialog.getByRole('button', { name: 'PNG' }).click();
  await dialog.getByRole('radio', { name: /Sprite sheet \(4\)/ }).click();
  await dialog.getByRole('radio', { name: '1×' }).click();
  await expect(dialog.getByText('96 × 24 px · 4 frames left to right')).toBeVisible();
  const [pngDl] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download PNG' }).click()]);
  const png = await readFile(await pngDl.path());
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([96, 24]); // IHDR width, height
});

test('undo and redo cover frame list changes and pixel edits on other frames', async ({ page }) => {
  await click(page, 1, 1);
  const tl = timeline(page);
  await tl.getByRole('button', { name: 'Duplicate frame' }).click();
  await click(page, 5, 5);
  await tl.getByRole('button', { name: 'Move frame left' }).click();
  expect((await frames(page)).index).toBe(0);

  await page.getByTestId('pixel-canvas').focus();
  await page.keyboard.press('Control+z'); // reorder
  expect((await frames(page)).index).toBe(1);
  await page.keyboard.press('Control+z'); // dot on the duplicate
  expect((await frames(page)).frames[1].data[5 * 24 + 5]).toBe(0);
  await page.keyboard.press('Control+z'); // duplicate
  expect((await frames(page)).frames).toHaveLength(1);
  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Control+Shift+z');
  const f = await frames(page);
  expect(f.frames).toHaveLength(2);
  expect(f.frames[0].data[5 * 24 + 5]).not.toBe(0); // reordered: the edited copy is first
});

test('keyboard: comma / period step frames, Enter plays', async ({ page }) => {
  await drawWalk(page);
  await page.getByTestId('pixel-canvas').focus();
  expect(await currentFrameNumber(page)).toBe(3);
  await page.keyboard.press('Period');
  expect(await currentFrameNumber(page)).toBe(0);
  await page.keyboard.press('Comma');
  expect(await currentFrameNumber(page)).toBe(3);
  await page.keyboard.press('Enter');
  await expect(timeline(page).getByRole('button', { name: 'Pause animation' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(timeline(page).getByRole('button', { name: 'Play animation' })).toBeVisible();
});

test('onion skin shows the previous frame faintly on the canvas', async ({ page }) => {
  await click(page, 6, 6);
  await timeline(page).getByRole('button', { name: /^Add (blank frame|frame to animate)$/ }).click();
  const p = await cellCenter(page, 6, 6);
  const sample = () =>
    page.evaluate(({ x, y }) => {
      const c = document.querySelector('canvas[aria-hidden]') as HTMLCanvasElement;
      const r = c.getBoundingClientRect();
      const d = c.width / r.width;
      return Array.from(c.getContext('2d')!.getImageData(Math.round((x - r.left) * d), Math.round((y - r.top) * d), 1, 1).data);
    }, p);
  await page.waitForTimeout(100);
  const withOnion = await sample();
  await timeline(page).getByRole('button', { name: 'Onion skin' }).click();
  await page.waitForTimeout(100);
  const without = await sample();
  // The previous frame's black dot shows through faintly: darker than the bare background, not black.
  const brightness = (px: number[]) => px[0] + px[1] + px[2];
  expect(brightness(withOnion)).toBeLessThan(brightness(without));
  expect(brightness(withOnion)).toBeGreaterThan(0);
});

test('a v1 project file (no frames) still opens', async ({ page }) => {
  const g = createGrid(8, 8);
  g.data[9] = pack(255, 0, 0);
  const v1 = JSON.parse(serializeProject({ name: 'Old icon', grid: g, palette: [], svg: DEFAULT_SVG_OPTIONS }));
  delete v1.frames;
  v1.version = 1;
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), menuAction(page, 'Open project file…')]);
  await chooser.setFiles({ name: 'old.icon.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(v1)) });
  await expect(page.getByLabel('Project name')).toHaveValue('Old icon');
  const f = await frames(page);
  expect(f.frames).toHaveLength(1);
  expect(f.frames[0].data[9]).not.toBe(0);
  await expect(timeline(page)).toContainText('1 frame');
});

test('128×128 with 16 frames stays responsive while drawing @perf', async ({ page }) => {
  test.slow();
  // A busy 16-frame project: noisy pixels in three colors.
  const big = Array.from({ length: 16 }, (_, k) => {
    const grid = createGrid(128, 128);
    let seed = k + 1;
    for (let i = 0; i < grid.data.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      if (seed % 4 === 0) grid.data[i] = [pack(239, 68, 68), pack(59, 130, 246), pack(34, 197, 94)][seed % 3];
    }
    return { grid, duration: 80 };
  });
  const json = serializeProject({ name: 'Big', grid: big[0].grid, palette: [], svg: DEFAULT_SVG_OPTIONS, frames: big });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), menuAction(page, 'Open project file…')]);
  await chooser.setFiles({ name: 'big.icon.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await expect(timeline(page)).toContainText('16 frames');
  await showPanel(page, 'Code');
  await expect(page.getByTestId('code-editor')).toContainText('-f15', { timeout: 20_000 });
  await showPanel(page, 'Properties');

  // Record long main-thread tasks (start time + duration) around a stroke.
  type W = { __long: Array<[number, number]> };
  await page.evaluate(() => {
    (window as unknown as W).__long = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (window as unknown as W).__long.push([e.startTime, e.duration]))).observe({ type: 'longtask' });
  });
  const before = await previewSource(page);
  const a = await cellCenter(page, 10, 64);
  const b = await cellCenter(page, 118, 70);
  await page.mouse.move(a.x, a.y);
  const strokeStart = await page.evaluate(() => performance.now());
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 20 });
  await page.mouse.up();
  const strokeEnd = await page.evaluate(() => performance.now());
  const t0 = Date.now();
  await expect.poll(() => previewSource(page), { timeout: 10_000 }).not.toBe(before);
  const previewMs = Date.now() - t0;

  // Drawing stays responsive: no long task while the pointer is down. The preview
  // catches up afterwards; rasterizing ~150k shapes once can take over a second.
  const tasks = await page.evaluate(() => (window as unknown as W).__long);
  const during = tasks.filter(([start]) => start >= strokeStart && start <= strokeEnd).map(([, d]) => Math.round(d));
  const after = tasks.filter(([start]) => start > strokeEnd).map(([, d]) => Math.round(d));
  test.info().annotations.push({ type: 'perf', description: `stroke tasks ${JSON.stringify(during)}; after ${JSON.stringify(after)}; preview ${previewMs}ms` });
  // Measured alone (the "perf" project), the worst task is ~150 ms: the commit at
  // mouse-up regenerating the 7 MB SVG once.
  expect(Math.max(0, ...during), `long tasks during the stroke: ${JSON.stringify(during)}`).toBeLessThan(300);
  expect(previewMs, `preview updated after ${previewMs}ms`).toBeLessThan(8000);
});
