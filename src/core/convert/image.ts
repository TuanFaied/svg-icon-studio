import { pack, type PackedColor } from '../grid/color';
import { createGrid, type Grid } from '../grid/grid';

/** Minimal ImageData-like shape so core code runs in workers and tests. */
export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function cloneRaster(r: Raster): Raster {
  return { width: r.width, height: r.height, data: new Uint8ClampedArray(r.data) };
}

export function hasTransparency(r: Raster): boolean {
  for (let i = 3; i < r.data.length; i += 4) if (r.data[i] < 250) return true;
  return false;
}

/** Luma (0–255) with transparent pixels treated as white. */
export function luminance(r: Raster): Uint8Array {
  const out = new Uint8Array(r.width * r.height);
  const d = r.data;
  for (let i = 0, p = 0; p < out.length; i += 4, p++) {
    const a = d[i + 3] / 255;
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    out[p] = Math.round(l * a + 255 * (1 - a));
  }
  return out;
}

/** Otsu's method: threshold that maximizes between-class variance. */
export function otsuThreshold(gray: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > bestVar) {
      bestVar = v;
      best = t;
    }
  }
  return best;
}

/** Black (ink) where luma < threshold, white elsewhere; fully opaque output. */
export function binarize(r: Raster, threshold: number): Raster {
  const gray = luminance(r);
  const out = new Uint8ClampedArray(r.width * r.height * 4);
  for (let p = 0; p < gray.length; p++) {
    const v = gray[p] < threshold ? 0 : 255;
    out[p * 4] = out[p * 4 + 1] = out[p * 4 + 2] = v;
    out[p * 4 + 3] = 255;
  }
  return { width: r.width, height: r.height, data: out };
}

/** Single-shape mask: opaque pixels when the image has alpha, otherwise dark pixels. */
export function silhouette(r: Raster, threshold: number): Raster {
  if (!hasTransparency(r)) return binarize(r, threshold);
  const out = new Uint8ClampedArray(r.data.length);
  for (let i = 0; i < r.data.length; i += 4) {
    const v = r.data[i + 3] >= 128 ? 0 : 255;
    out[i] = out[i + 1] = out[i + 2] = v;
    out[i + 3] = 255;
  }
  return { width: r.width, height: r.height, data: out };
}

const dist2 = (d: Uint8ClampedArray, i: number, r: number, g: number, b: number) => {
  const dr = d[i] - r, dg = d[i + 1] - g, db = d[i + 2] - b;
  return dr * dr + dg * dg + db * db;
};

/**
 * Simple background removal: estimate the background from the most common
 * edge color, then flood fill inward from the edges through pixels within
 * `tolerance` (0–100) of it, making them transparent. Works best on solid
 * backgrounds; it is not subject-aware.
 */
export function removeBackground(src: Raster, tolerance: number): Raster {
  const r = cloneRaster(src);
  const { width: w, height: h, data: d } = r;
  const counts = new Map<number, number>();
  const edge: number[] = [];
  for (let x = 0; x < w; x++) edge.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) edge.push(y * w, y * w + w - 1);
  for (const p of edge) {
    const i = p * 4;
    if (d[i + 3] < 16) continue;
    const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return r; // edges already transparent
  let bestKey = 0, bestN = -1;
  for (const [k, n] of counts) if (n > bestN) { bestN = n; bestKey = k; }
  const br = ((bestKey >> 10) << 3) + 4, bg = (((bestKey >> 5) & 31) << 3) + 4, bb = ((bestKey & 31) << 3) + 4;
  const limit = Math.pow((tolerance / 100) * 441.7, 2);

  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  for (const p of edge) {
    if (!visited[p] && (d[p * 4 + 3] < 16 || dist2(d, p * 4, br, bg, bb) <= limit)) {
      visited[p] = 1;
      stack.push(p);
    }
  }
  while (stack.length) {
    const p = stack.pop() as number;
    d[p * 4 + 3] = 0;
    const x = p % w, y = (p - x) / w;
    const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
    for (const q of nb) {
      if (q < 0 || visited[q]) continue;
      if (d[q * 4 + 3] < 16 || dist2(d, q * 4, br, bg, bb) <= limit) {
        visited[q] = 1;
        stack.push(q);
      }
    }
  }
  return r;
}

type RGB = [number, number, number];

/** Median-cut palette of up to `n` colors from opaque pixels. */
export function medianCutPalette(r: Raster, n: number): RGB[] {
  const d = r.data;
  const step = Math.max(1, Math.floor((r.width * r.height) / 60000)); // sample large images
  let pixels: RGB[] = [];
  for (let p = 0; p < r.width * r.height; p += step) {
    const i = p * 4;
    if (d[i + 3] >= 128) pixels.push([d[i], d[i + 1], d[i + 2]]);
  }
  if (pixels.length === 0) return [];
  let boxes: RGB[][] = [pixels];
  pixels = [];
  while (boxes.length < n) {
    // Split the box with the widest channel range.
    let bi = -1, bc = 0, bRange = 0;
    boxes.forEach((box, idx) => {
      if (box.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255, hi = 0;
        for (const px of box) {
          if (px[c] < lo) lo = px[c];
          if (px[c] > hi) hi = px[c];
        }
        if (hi - lo > bRange) {
          bRange = hi - lo;
          bi = idx;
          bc = c;
        }
      }
    });
    if (bi < 0 || bRange === 0) break;
    const box = boxes[bi].sort((a, b) => a[bc] - b[bc]);
    const mid = box.length >> 1;
    boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
  }
  boxes = boxes.filter((b) => b.length);
  return boxes.map((box) => {
    let r0 = 0, g0 = 0, b0 = 0;
    for (const px of box) { r0 += px[0]; g0 += px[1]; b0 += px[2]; }
    return [Math.round(r0 / box.length), Math.round(g0 / box.length), Math.round(b0 / box.length)] as RGB;
  });
}

function nearest(pal: RGB[], r: number, g: number, b: number): number {
  let best = 0, bd = Infinity;
  for (let k = 0; k < pal.length; k++) {
    const dr = pal[k][0] - r, dg = pal[k][1] - g, db = pal[k][2] - b;
    const dd = dr * dr + dg * dg + db * db;
    if (dd < bd) { bd = dd; best = k; }
  }
  return best;
}

/** Maps each pixel to the nearest palette color. Alpha is snapped to 0 or 255. */
export function quantize(r: Raster, n: number): Raster {
  const pal = medianCutPalette(r, Math.max(1, Math.min(256, n)));
  const out = new Uint8ClampedArray(r.data.length);
  const d = r.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128 || pal.length === 0) continue;
    const c = pal[nearest(pal, d[i], d[i + 1], d[i + 2])];
    out[i] = c[0];
    out[i + 1] = c[1];
    out[i + 2] = c[2];
    out[i + 3] = 255;
  }
  return { width: r.width, height: r.height, data: out };
}

/** Nearest-neighbor sample at cell centers into a target grid size. */
export function downsampleNearest(r: Raster, gw: number, gh: number): Raster {
  const out = new Uint8ClampedArray(gw * gh * 4);
  for (let y = 0; y < gh; y++) {
    const sy = Math.min(r.height - 1, Math.floor(((y + 0.5) * r.height) / gh));
    for (let x = 0; x < gw; x++) {
      const sx = Math.min(r.width - 1, Math.floor(((x + 0.5) * r.width) / gw));
      const si = (sy * r.width + sx) * 4;
      const di = (y * gw + x) * 4;
      out[di] = r.data[si];
      out[di + 1] = r.data[si + 1];
      out[di + 2] = r.data[si + 2];
      out[di + 3] = r.data[si + 3];
    }
  }
  return { width: gw, height: gh, data: out };
}

/** Converts a raster into a pixel grid; alpha < 128 becomes transparent. */
export function rasterToGrid(r: Raster): Grid {
  const g = createGrid(r.width, r.height);
  for (let p = 0; p < g.data.length; p++) {
    const i = p * 4;
    g.data[p] = r.data[i + 3] < 128 ? 0 : pack(r.data[i], r.data[i + 1], r.data[i + 2], 255);
  }
  return g;
}

/** Removes connected regions smaller than `minSize` cells by merging them into a neighbor color. */
export function despeckleGrid(g: Grid, minSize: number): Grid {
  if (minSize <= 1) return g;
  const { width: w, height: h } = g;
  const data = g.data.slice();
  const seen = new Uint8Array(w * h);
  for (let s = 0; s < data.length; s++) {
    if (seen[s]) continue;
    const color = data[s];
    const region: number[] = [s];
    seen[s] = 1;
    const neighborCounts = new Map<PackedColor, number>();
    for (let k = 0; k < region.length; k++) {
      const p = region[k];
      const x = p % w, y = (p - x) / w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q < 0) continue;
        if (data[q] === color) {
          if (!seen[q]) { seen[q] = 1; region.push(q); }
        } else neighborCounts.set(data[q], (neighborCounts.get(data[q]) ?? 0) + 1);
      }
    }
    if (region.length < minSize && neighborCounts.size) {
      let best = color, bn = -1;
      for (const [c, n] of neighborCounts) if (n > bn) { bn = n; best = c; }
      for (const p of region) data[p] = best;
    }
  }
  return { width: w, height: h, data };
}

/** Fits (w, h) inside a max side length, preserving aspect. */
export function fitWithin(w: number, h: number, max: number): { width: number; height: number; scaled: boolean } {
  const longest = Math.max(w, h);
  if (longest <= max) return { width: w, height: h, scaled: false };
  const k = max / longest;
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)), scaled: true };
}
