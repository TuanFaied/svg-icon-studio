import { describe, expect, it } from 'vitest';
import { pack } from '../grid/color';
import { binarize, despeckleGrid, downsampleNearest, fitWithin, hasTransparency, medianCutPalette, otsuThreshold, quantize, rasterToGrid, type Raster, removeBackground, silhouette } from './image';
import { normalizeTracedSvg, roundNumbers } from './svgPost';
import { pathSegments } from '../svg/stats';

function raster(w: number, h: number, fn: (x: number, y: number) => [number, number, number, number]): Raster {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(fn(x, y), (y * w + x) * 4);
  return { width: w, height: h, data };
}

describe('threshold', () => {
  it('Otsu separates a bimodal histogram', () => {
    const gray = new Uint8Array(200);
    gray.fill(30, 0, 100);
    gray.fill(220, 100);
    const t = otsuThreshold(gray);
    expect(t).toBeGreaterThanOrEqual(30);
    expect(t).toBeLessThan(220);
  });

  it('binarize and silhouette', () => {
    const r = raster(2, 1, (x) => (x === 0 ? [10, 10, 10, 255] : [240, 240, 240, 255]));
    const b = binarize(r, 128);
    expect([b.data[0], b.data[4]]).toEqual([0, 255]);
    const withAlpha = raster(2, 1, (x) => (x === 0 ? [250, 250, 250, 255] : [0, 0, 0, 0]));
    expect(hasTransparency(withAlpha)).toBe(true);
    const s = silhouette(withAlpha, 128);
    expect([s.data[0], s.data[4]]).toEqual([0, 255]);
  });
});

describe('background removal', () => {
  it('clears the connected solid background but keeps the subject and enclosed areas of other colors', () => {
    const r = raster(7, 7, (x, y) => (x >= 2 && x <= 4 && y >= 2 && y <= 4 ? [200, 0, 0, 255] : [255, 255, 255, 255]));
    const out = removeBackground(r, 10);
    expect(out.data[3]).toBe(0);
    expect(out.data[(3 * 7 + 3) * 4 + 3]).toBe(255);
  });
});

describe('quantize and pixel import', () => {
  it('reduces to at most N colors', () => {
    const r = raster(16, 16, (x, y) => [x * 16, y * 16, (x + y) * 8, 255]);
    const q = quantize(r, 4);
    const colors = new Set<number>();
    for (let i = 0; i < q.data.length; i += 4) colors.add((q.data[i] << 16) | (q.data[i + 1] << 8) | q.data[i + 2]);
    expect(colors.size).toBeLessThanOrEqual(4);
    expect(medianCutPalette(r, 8).length).toBeLessThanOrEqual(8);
  });

  it('downsamples by nearest neighbor at cell centers', () => {
    const r = raster(4, 4, (x, y) => (x < 2 && y < 2 ? [255, 0, 0, 255] : [0, 0, 0, 0]));
    const g = rasterToGrid(downsampleNearest(r, 2, 2));
    expect([...g.data]).toEqual([pack(255, 0, 0), 0, 0, 0]);
  });

  it('despeckles tiny regions', () => {
    const r = raster(5, 5, (x, y) => (x === 2 && y === 2 ? [0, 0, 255, 255] : [255, 0, 0, 255]));
    const g = despeckleGrid(rasterToGrid(r), 2);
    expect(g.data[12]).toBe(pack(255, 0, 0));
  });

  it('fits images within a max size', () => {
    expect(fitWithin(4000, 1000, 2048)).toEqual({ width: 2048, height: 512, scaled: true });
    expect(fitWithin(100, 50, 2048).scaled).toBe(false);
  });
});

describe('svg stats', () => {
  it('counts implicit repeated segments', () => {
    expect(pathSegments('M0 0 c1 2 3 4 5 6 7 8 9 10 11 12 l1 1z')).toBe(4);
    expect(pathSegments('M0 0h1v1h-1z')).toBe(4);
  });
});

describe('svg post-processing', () => {
  it('rounds numbers and normalizes the root', () => {
    expect(roundNumbers('M1.23456 -0.0001 L 10 2.5e-3', 2)).toBe('M1.23 0 L 10 0');
    const out = normalizeTracedSvg('<?xml version="1.0"?><!-- c --><svg version="1.1" width="10" height="10"><path d="M0.123 0.456Z" fill="#000"/></svg>', {
      width: 10, height: 10, outWidth: 64, outHeight: 64, precision: 1,
    });
    expect(out).toContain('viewBox="0 0 10 10"');
    expect(out).toContain('width="64"');
    expect(out).toContain('d="M0.1 0.5Z"');
    expect(out).not.toContain('<?xml');
    expect(out).not.toContain('<!--');
  });
});
