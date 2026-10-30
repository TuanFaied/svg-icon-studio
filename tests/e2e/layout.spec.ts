import { expect, type Page, test } from '@playwright/test';
import { cellCenter, grid, menuAction, openApp, showPanel } from './helpers';

const frames = (page: Page) => page.evaluate(() => window.__SIS__.frames());
const timeline = (page: Page) => page.getByRole('region', { name: 'Animation timeline' });
const block = (page: Page, i: number) => timeline(page).locator(`[data-frame="${i}"]`);

async function click(page: Page, x: number, y: number) {
  const p = await cellCenter(page, x, y);
  await page.mouse.click(p.x, p.y);
}

/** Three frames of 100 ms each. */
async function threeFrames(page: Page) {
  await click(page, 2, 2);
  await timeline(page).getByRole('button', { name: 'Add frame to animate' }).click();
  await timeline(page).getByRole('button', { name: 'Add blank frame' }).click();
  expect((await frames(page)).frames).toHaveLength(3);
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test.describe('top bar', () => {
  test('drawing tools sit in the top bar', async ({ page }) => {
    const toolbar = page.getByRole('banner').getByRole('toolbar', { name: 'Drawing tools' });
    await expect(toolbar).toBeVisible();
    await toolbar.getByRole('button', { name: 'Eraser' }).click();
    await expect(toolbar.getByRole('button', { name: 'Eraser' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('the overflow menu works from the keyboard', async ({ page }) => {
    const trigger = page.getByRole('button', { name: 'More actions' });
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    const menu = page.getByRole('menu', { name: 'More actions' });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: /Save project file/ })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();

    await menuAction(page, 'Keyboard shortcuts');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  });

  test('the view menu toggles canvas overlays', async ({ page }) => {
    await page.getByRole('button', { name: 'View options' }).click();
    const grid = page.getByRole('menuitemcheckbox', { name: 'Grid lines' });
    await expect(grid).toHaveAttribute('aria-checked', 'true');
    await grid.click();
    await page.getByRole('button', { name: 'View options' }).click();
    await expect(page.getByRole('menuitemcheckbox', { name: 'Grid lines' })).toHaveAttribute('aria-checked', 'false');
    await page.getByRole('menuitemradio', { name: 'Dark' }).click();
    await page.getByRole('button', { name: 'View options' }).click();
    await expect(page.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
  });

  test('dark is the default theme, and a choice persists', async ({ page }) => {
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitemradio', { name: 'Light' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

test.describe('timeline', () => {
  test('a single frame shows a collapsed timeline', async ({ page }) => {
    await expect(timeline(page).getByRole('button', { name: 'Add frame to animate' })).toBeVisible();
    await expect(timeline(page).getByTestId('playhead')).toHaveCount(0);
    await expect(timeline(page)).toContainText('1 frame');
  });

  test('blocks are as wide as their duration; zoom scales them', async ({ page }) => {
    await threeFrames(page);
    await timeline(page).getByLabel('Current frame duration in milliseconds').fill('300');
    const w = async (i: number) => (await block(page, i).boundingBox())!.width;
    expect((await w(2)) / (await w(0))).toBeCloseTo(3, 1);
    const before = await w(0);
    await timeline(page).getByLabel('Timeline zoom').fill('800');
    expect((await w(0)) / before).toBeCloseTo(2, 1);
    await expect(timeline(page)).toContainText('0:00.20 / 0:00.50');
  });

  test('scrubbing the ruler selects the frame under the playhead', async ({ page }) => {
    await threeFrames(page);
    await block(page, 0).click();
    const b = (await block(page, 1).boundingBox())!;
    const track = (await timeline(page).getByTestId('playhead').locator('xpath=..').boundingBox())!;
    // Drag along the ruler (top strip) to the middle of frame 2.
    await page.mouse.move(track.x + 10, track.y + 6);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, track.y + 6, { steps: 5 });
    await page.mouse.up();
    expect((await frames(page)).index).toBe(1);
    await expect(timeline(page)).toContainText('0:00.10 / 0:00.30');
  });

  test('dragging a block edge retimes it in one undo step', async ({ page }) => {
    await threeFrames(page);
    const handle = timeline(page).getByRole('separator', { name: 'Frame 1 duration' });
    const h = (await handle.boundingBox())!;
    const pxPerMs = (await block(page, 0).boundingBox())!.width / 100;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 + 100 * pxPerMs, h.y + h.height / 2, { steps: 8 });
    await page.mouse.up();
    expect((await frames(page)).frames[0].duration).toBe(200);
    await page.getByTestId('pixel-canvas').focus();
    await page.keyboard.press('Control+z');
    expect((await frames(page)).frames[0].duration).toBe(100);
  });

  test('dragging a block reorders frames in one undo step', async ({ page }) => {
    await threeFrames(page);
    const before = await frames(page);
    const a = (await block(page, 0).boundingBox())!;
    const c = (await block(page, 2).boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(c.x + c.width * 0.9, c.y + c.height / 2, { steps: 8 });
    await page.mouse.up();
    const after = await frames(page);
    // The drawn frame (dot at 2,2) moved from first to last.
    expect(after.frames[2].data).toEqual(before.frames[0].data);
    expect(after.index).toBe(2);
    await page.getByTestId('pixel-canvas').focus();
    await page.keyboard.press('Control+z');
    expect((await frames(page)).frames[0].data).toEqual(before.frames[0].data);
  });

  test('blocks and duration handles work from the keyboard', async ({ page }) => {
    await threeFrames(page);
    await block(page, 0).focus();
    await page.keyboard.press('Enter');
    expect((await frames(page)).index).toBe(0);
    await page.keyboard.press('ArrowRight');
    expect((await frames(page)).index).toBe(1);
    await expect(block(page, 1)).toBeFocused();
    const firstData = (await frames(page)).frames[1].data;
    await page.keyboard.press('Alt+ArrowLeft');
    expect((await frames(page)).frames[0].data).toEqual(firstData);

    const handle = timeline(page).getByRole('separator', { name: 'Frame 2 duration' });
    await handle.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    expect((await frames(page)).frames[1].duration).toBe(210);
  });
});

test.describe('side panels', () => {
  test('the left panel has Tool options above Color and Canvas tabs', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Tool options' })).toBeVisible();
    const tabs = page.getByRole('tablist', { name: 'Draw settings' });
    await expect(tabs.getByRole('tab', { name: 'Color' })).toHaveAttribute('aria-selected', 'true');
    await tabs.getByRole('tab', { name: 'Color' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.getByRole('tab', { name: 'Canvas' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('group', { name: 'Canvas size presets' })).toBeVisible();
  });

  test('Properties shows the selection, with flip and position editing', async ({ page }) => {
    await click(page, 1, 1);
    await click(page, 2, 1);
    await page.getByRole('banner').getByRole('button', { name: 'Select / Move' }).click();
    const a = await cellCenter(page, 1, 1);
    const b = await cellCenter(page, 3, 2);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 3 });
    await page.mouse.up();

    const section = page.getByRole('heading', { name: 'Selection' }).locator('xpath=ancestor::section');
    await expect(section.getByLabel('Selection size')).toHaveText('3 × 2');
    await section.getByRole('button', { name: 'Flip horizontal' }).click();
    let g = await grid(page);
    // Cells (1,1),(2,1) mirrored inside x 1..3 → (3,1),(2,1).
    expect([g.data[24 + 1], g.data[24 + 2], g.data[24 + 3]].map(Boolean)).toEqual([false, true, true]);

    await section.getByLabel('X').fill('5');
    g = await grid(page);
    expect([g.data[24 + 6], g.data[24 + 7]].map(Boolean)).toEqual([true, true]);
    await expect(section.getByLabel('X')).toHaveValue('5');
  });

  test('the code panel is a tab next to Properties', async ({ page }) => {
    await expect(page.getByTestId('code-editor')).toHaveCount(0);
    await showPanel(page, 'Code');
    await expect(page.getByTestId('code-editor')).toContainText('<svg');
    await showPanel(page, 'Properties');
    await expect(page.getByRole('img', { name: /Preview of/ })).toBeVisible();
  });
});

test('play animation on canvas from the view menu; Escape returns to editing', async ({ page }) => {
  await click(page, 4, 4);
  await page.getByRole('button', { name: 'View options' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Play animation on canvas' }).click();
  const preview = page.getByTestId('canvas-preview');
  await expect(preview).toBeVisible();
  await expect(preview.getByRole('img', { name: /Animated preview of/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(preview).toBeHidden();
});
