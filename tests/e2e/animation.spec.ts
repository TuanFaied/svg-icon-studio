import { expect, type Page, test } from '@playwright/test';
import { openApp } from './helpers';

// Left half filled; a stepped 180° spin moves it to the right half and back.
const ANIMATED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" width="64" height="64">
<style>.spin { transform-box: view-box; transform-origin: center; animation: k 0.6s steps(2) infinite }
@keyframes k { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }</style>
<g class="spin" fill="#000"><rect width="4" height="8"/></g>
</svg>`;

async function pasteIntoCodePanel(page: Page, svg: string) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const content = page.locator('[data-testid=code-editor] .cm-content');
  await content.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText(svg);
  await expect(page.getByText('Manual edits — not linked to drawing.')).toBeVisible();
}

/** Text of the sanitized SVG behind the preview <img>. */
async function previewSource(page: Page): Promise<string> {
  const img = page.getByRole('img', { name: /Preview of/ }).locator('img');
  await expect(img).toHaveAttribute('src', /^blob:/);
  return img.evaluate(async (el: HTMLImageElement) => (await fetch(el.src)).text());
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('validated animation CSS survives sanitizing and plays in the preview', async ({ page }) => {
  await pasteIntoCodePanel(page, ANIMATED);
  await expect.poll(() => previewSource(page)).toContain('@keyframes k');

  // Sample the left half of the rendered preview over time; it must change.
  const samples = await page.getByRole('img', { name: /Preview of/ }).locator('img').evaluate(async (el: HTMLImageElement) => {
    const out: number[] = [];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    for (let i = 0; i < 10; i++) {
      ctx.clearRect(0, 0, 64, 64);
      ctx.drawImage(el, 0, 0, 64, 64);
      out.push(ctx.getImageData(8, 32, 1, 1).data[3]);
      await new Promise((r) => setTimeout(r, 110));
    }
    return out;
  });
  expect(new Set(samples).size, `alpha samples ${samples.join(',')}`).toBeGreaterThan(1);
});

test('unsafe or unknown CSS is stripped from the preview', async ({ page }) => {
  const bad = ANIMATED.replace('animation: k', 'background: url(https://example.com/x.png); animation: k');
  await pasteIntoCodePanel(page, bad);
  await expect.poll(() => previewSource(page)).not.toContain('<style');
  expect(await previewSource(page)).toContain('<rect');
});
