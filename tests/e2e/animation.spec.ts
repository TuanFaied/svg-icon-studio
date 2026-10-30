import { expect, type Page, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { cellCenter, openApp, showPanel } from './helpers';

// Left half filled; a stepped 180° spin moves it to the right half and back.
const ANIMATED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" width="64" height="64">
<style>.spin { transform-box: view-box; transform-origin: center; animation: k 0.6s steps(2) infinite }
@keyframes k { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }</style>
<g class="spin" fill="#000"><rect width="4" height="8"/></g>
</svg>`;

async function pasteIntoCodePanel(page: Page, svg: string) {
  await showPanel(page, 'Code');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const content = page.locator('[data-testid=code-editor] .cm-content');
  // Replace the document through CodeMirror's own view (what EditorView.findFromDOM
  // returns), so it goes through the same update path as typing. Keyboard input
  // isn't usable here: insertText doesn't reach CodeMirror in Firefox, synthetic
  // paste events arrive empty there, and typing triggers XML tag auto-closing.
  await content.evaluate((el, text) => {
    type View = { state: { doc: { length: number } }; dispatch: (tr: object) => void };
    const node = el as unknown as { cmTile?: { root?: { view?: View } }; cmView?: { rootView?: { view?: View } } };
    const view = node.cmTile?.root?.view ?? node.cmView?.rootView?.view;
    if (!view) throw new Error('CodeMirror view not found');
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  }, svg);
  await expect(page.getByText('Manual edits — not linked to drawing.')).toBeVisible();
  // Back to Properties, where the preview lives.
  await showPanel(page, 'Properties');
}

/** Text of the sanitized SVG behind the preview <img>. */
async function previewSource(page: Page): Promise<string> {
  const img = page.getByRole('img', { name: /Preview of/ }).locator('img');
  await expect(img).toHaveAttribute('src', /^blob:/);
  return img.evaluate(async (el: HTMLImageElement) => (await fetch(el.src)).text());
}

/**
 * Distinct screenshots of the preview <img> taken over ~1s: what the user sees.
 * (Drawing an animated SVG <img> onto a canvas returns a frozen snapshot in
 * WebKit, so pixels read that way can't show motion in every engine.)
 */
async function previewScreenshots(page: Page): Promise<number> {
  const img = page.getByRole('img', { name: /Preview of/ }).locator('img');
  // Wait for the image to finish decoding, and fail if it is swapped mid-sample
  // (a reload would also look like "changing" pixels).
  await img.evaluate((el: HTMLImageElement) => el.decode());
  const src = await img.getAttribute('src');
  const seen = new Set<string>();
  for (let i = 0; i < 10; i++) {
    seen.add(createHash('sha1').update(await img.screenshot({ animations: 'allow' })).digest('hex'));
    // Uneven gaps: a screenshot can take ~1 s (WebKit), and a fixed interval close
    // to a multiple of the animation period would sample the same phase every time.
    await page.waitForTimeout(40 + ((i * 137) % 290));
  }
  expect(await img.getAttribute('src'), 'preview image changed while sampling').toBe(src);
  return seen.size;
}

/** Paints a vertical bar in the left columns of the 24×24 canvas. */
async function drawLeftBar(page: Page) {
  const a = await cellCenter(page, 2, 3);
  const b = await cellCenter(page, 2, 20);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('validated animation CSS survives sanitizing and plays in the preview', async ({ page }) => {
  const img = page.getByRole('img', { name: /Preview of/ }).locator('img');
  const before = await img.getAttribute('src');
  await pasteIntoCodePanel(page, ANIMATED);
  await expect(img).not.toHaveAttribute('src', before ?? '');

  // Watch first, read the source after: in WebKit, fetching an animated SVG
  // <img>'s own blob URL stops that image's animation.
  expect(await previewScreenshots(page), 'distinct preview screenshots').toBeGreaterThan(1);
  expect(await previewSource(page)).toContain('@keyframes k');
});

test('unsafe or unknown CSS is stripped from the preview', async ({ page }) => {
  const bad = ANIMATED.replace('animation: k', 'background: url(https://example.com/x.png); animation: k');
  await pasteIntoCodePanel(page, bad);
  await expect.poll(() => previewSource(page)).not.toContain('<style');
  expect(await previewSource(page)).toContain('<rect');
});

/**
 * Mounts the sanitized preview SVG inline and reports the CSS animation on its
 * animated element: the keyframes name in effect and whether time advances.
 */
async function previewAnimationState(page: Page): Promise<{ name: string; advancing: boolean }> {
  const svg = await previewSource(page);
  return page.evaluate(async (markup) => {
    const host = document.createElement('div');
    host.innerHTML = markup;
    document.body.appendChild(host);
    try {
      const el = host.querySelector('[class^="sis-"]');
      if (!el) return { name: 'missing', advancing: false };
      const name = getComputedStyle(el).animationName;
      const anim = el.getAnimations()[0];
      if (!anim) return { name, advancing: false };
      const t0 = Number(anim.currentTime);
      await new Promise((r) => setTimeout(r, 200));
      return { name, advancing: Number(anim.currentTime) > t0 && anim.playState === 'running' };
    } finally {
      host.remove();
    }
  }, svg);
}

test.describe('animation presets', () => {
  test('spin preset animates the preview and is in the downloaded SVG', async ({ page }) => {
    await drawLeftBar(page);
    await page.getByLabel('Preset', { exact: true }).selectOption('spin');
    await expect(page.getByLabel('Easing')).toHaveValue('steps');
    await expect.poll(() => previewSource(page)).toMatch(/@keyframes sis-[0-9a-f]{6}-spin/);

    expect(await previewAnimationState(page)).toEqual({ name: expect.stringMatching(/^sis-[0-9a-f]{6}-spin$/), advancing: true });

    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Export' });
    for (const format of ['Readable', 'Minimal', 'Optimized (SVGO)']) {
      await dialog.getByLabel('Format').selectOption({ label: format });
      const [dl] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download SVG' }).click()]);
      const svg = await readFile(await dl.path(), 'utf8');
      expect(svg, format).toMatch(/@keyframes sis-[0-9a-f]{6}-spin/);
      expect(svg, format).toContain('prefers-reduced-motion');
      // SVGO may fold a single-child group and move the class onto the shape.
      expect(svg, format).toMatch(/class="sis-[0-9a-f]{6}"/);
    }
    await dialog.getByRole('button', { name: 'PNG' }).click();
    await expect(dialog.getByText('animation not included (first frame)')).toBeVisible();
  });

  test('each preset plays; turning it off removes the stylesheet', async ({ page }) => {
    await drawLeftBar(page);
    for (const kind of ['pulse', 'fade', 'bounce']) {
      await page.getByLabel('Preset', { exact: true }).selectOption(kind);
      await expect.poll(() => previewSource(page)).toContain(`-${kind}{`);
      expect(await previewAnimationState(page), kind).toEqual({ name: expect.stringMatching(new RegExp(`-${kind}$`)), advancing: true });
    }
    await page.getByLabel('Preset', { exact: true }).selectOption('none');
    await expect.poll(() => previewSource(page)).not.toContain('<style');
  });

  test('reduced motion keeps the preview still', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await drawLeftBar(page);
    await page.getByLabel('Preset', { exact: true }).selectOption('spin');
    await expect.poll(() => previewSource(page)).toContain('-spin{');
    expect(await previewAnimationState(page)).toEqual({ name: 'none', advancing: false });
  });
});

test.describe('sequence by color', () => {
  test('dots drawn in different colors animate in turn, clockwise', async ({ page }) => {
    // Four dots around the canvas center: top, right, bottom, left, each in its own palette color.
    const dots: Array<[string, number, number]> = [['#ef4444', 12, 3], ['#22c55e', 21, 12], ['#3b82f6', 12, 21], ['#a855f7', 3, 12]];
    for (const [hex, x, y] of dots) {
      await page.getByRole('button', { name: hex, exact: true }).click();
      const p = await cellCenter(page, x, y);
      await page.mouse.click(p.x, p.y);
    }
    await page.getByLabel('Preset', { exact: true }).selectOption('sequence');
    await expect(page.getByText('4 steps')).toBeVisible();
    await expect.poll(() => previewSource(page)).toMatch(/-s3\{animation-delay:/);

    const svg = await previewSource(page);
    const steps = await page.evaluate(async (markup) => {
      const host = document.createElement('div');
      host.innerHTML = markup;
      document.body.appendChild(host);
      try {
        const els = [...host.querySelectorAll('[class*="-s"]')];
        await new Promise((r) => setTimeout(r, 100));
        return els.map((el) => {
          const anim = el.getAnimations()[0];
          return {
            fill: el.getAttribute('fill'),
            step: Number(el.getAttribute('class')?.match(/-s(\d+)$/)?.[1]),
            running: anim?.playState === 'running',
            // Position in the current cycle in ms (1s default duration). currentTime ignores
            // animation-delay; the effect's computed progress includes it.
            phase: Math.round((anim?.effect?.getComputedTiming().progress ?? -1) * 1000),
          };
        });
      } finally {
        host.remove();
      }
    }, svg);

    expect(steps).toHaveLength(4);
    expect(steps.every((s) => s.running)).toBe(true);
    const byStep = [...steps].sort((a, b) => a.step - b.step);
    expect(byStep.map((s) => s.fill)).toEqual(['#ef4444', '#22c55e', '#3b82f6', '#a855f7']);
    // Step k is a quarter cycle behind step k-1.
    for (let k = 1; k < 4; k++) {
      const gap = (byStep[k - 1].phase - byStep[k].phase + 1000) % 1000;
      expect(Math.abs(gap - 250), `gap between steps ${k - 1} and ${k}: ${gap}ms`).toBeLessThan(40);
    }
  });

  test('a static color stays still', async ({ page }) => {
    for (const [hex, x] of [['#ef4444', 4], ['#3b82f6', 12], ['#22c55e', 20]] as const) {
      await page.getByRole('button', { name: hex, exact: true }).click();
      const p = await cellCenter(page, x, 12);
      await page.mouse.click(p.x, p.y);
    }
    await page.getByLabel('Preset', { exact: true }).selectOption('sequence');
    await page.getByLabel('Static color').selectOption({ label: '#3b82f6' });
    await expect(page.getByText('2 steps')).toBeVisible();
    await expect.poll(() => previewSource(page)).toContain('-s1{');
    const src = await previewSource(page);
    expect(src).not.toContain('-s2{');
    expect(src).toMatch(/fill="#3b82f6"(?![^>]*class=)/);
  });
});

test.describe('sequence color highlight (#14)', () => {
  /** Draws two dots in two palette colors and turns on a red highlight sequence. */
  async function setUp(page: Page) {
    for (const [hex, x] of [['#3b82f6', 6], ['#22c55e', 16]] as const) {
      await page.getByRole('button', { name: hex, exact: true }).click();
      const p = await cellCenter(page, x, 12);
      await page.mouse.click(p.x, p.y);
    }
    await page.getByLabel('Preset', { exact: true }).selectOption('sequence');
    await page.getByLabel('Effect').selectOption('highlight');
    await page.getByLabel('Highlight color').fill('#ff0000');
    await expect.poll(() => previewSource(page)).toContain('{fill:#ff0000}');
  }

  /** Each step's own fill attribute and its computed fill now, from an inline copy of the preview. */
  async function stepFills(page: Page) {
    const svg = await previewSource(page);
    return page.evaluate(async (markup) => {
      const host = document.createElement('div');
      host.innerHTML = markup;
      document.body.appendChild(host);
      try {
        await new Promise((r) => setTimeout(r, 150));
        const toRgb = (hex: string) => {
          const n = parseInt(hex.slice(1), 16);
          return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
        };
        return [...host.querySelectorAll('[class*="-s"]')].map((el) => ({
          own: toRgb(el.getAttribute('fill') as string),
          now: getComputedStyle(el).fill,
        }));
      } finally {
        host.remove();
      }
    }, svg);
  }

  test('steps flash the highlight color and settle back', async ({ page }) => {
    await setUp(page);
    const fills = await stepFills(page);
    expect(fills).toHaveLength(2);
    // Mid-animation, the steps are somewhere between red and their own colors, not both at rest.
    expect(fills.some((f) => f.now !== f.own), JSON.stringify(fills)).toBe(true);
  });

  test('reduced motion shows each step in its own color', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setUp(page);
    const fills = await stepFills(page);
    expect(fills).toHaveLength(2);
    for (const f of fills) expect(f.now).toBe(f.own);
  });
});
