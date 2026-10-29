import { expect, type Page } from '@playwright/test';

export interface GridSnapshot {
  width: number;
  height: number;
  data: number[];
}

declare global {
  interface Window {
    __SIS__: {
      grid: () => GridSnapshot;
      view: () => { zoom: number; panX: number; panY: number };
      frames: () => { index: number; frames: Array<{ duration: number; data: number[] }> };
    };
  }
}

export async function openApp(page: Page): Promise<void> {
  await page.goto('/?e2e');
  await expect(page.locator('[data-ready]')).toBeVisible();
  await page.waitForFunction(() => !!window.__SIS__);
}

export const grid = (page: Page) => page.evaluate(() => window.__SIS__.grid());

/** Page coordinates of the center of cell (x, y). */
export async function cellCenter(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId('pixel-canvas').boundingBox();
  if (!box) throw new Error('canvas not visible');
  const v = await page.evaluate(() => window.__SIS__.view());
  return { x: box.x + v.panX + (x + 0.5) * v.zoom, y: box.y + v.panY + (y + 0.5) * v.zoom };
}

/** Bresenham reference used to compute cells a straight drag must cover. */
export function linePoints(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pts.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return pts;
}

/** Makes an image file in the browser via canvas and returns its bytes. */
export async function makeImage(page: Page, kind: 'transparent' | 'photo'): Promise<Buffer> {
  const b64 = await page.evaluate(async (k) => {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    if (k === 'transparent') {
      c.width = 96;
      c.height = 96;
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.moveTo(48, 6);
      ctx.lineTo(90, 90);
      ctx.lineTo(6, 90);
      ctx.closePath();
      ctx.fill();
    } else {
      c.width = 1600;
      c.height = 1200;
      const img = ctx.createImageData(c.width, c.height);
      let seed = 7;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          img.data[i] = (x / c.width) * 255 + rnd() * 60;
          img.data[i + 1] = (y / c.height) * 255 + rnd() * 60;
          img.data[i + 2] = 128 + Math.sin(x / 23) * 60 + rnd() * 60;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b as Blob), k === 'photo' ? 'image/jpeg' : 'image/png', 0.92));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, kind);
  return Buffer.from(b64, 'base64');
}
