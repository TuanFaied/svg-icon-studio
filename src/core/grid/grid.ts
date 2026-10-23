import { type PackedColor, TRANSPARENT } from './color';

export interface Grid {
  width: number;
  height: number;
  /** Packed RGBA per cell, row-major. 0 = transparent. */
  data: Uint32Array;
}

export interface Point {
  x: number;
  y: number;
}

export const MIN_SIZE = 1;
export const MAX_SIZE = 128;

export function clampSize(n: number): number {
  if (!Number.isFinite(n)) return MIN_SIZE;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(n)));
}

export function createGrid(width: number, height: number): Grid {
  const w = clampSize(width);
  const h = clampSize(height);
  return { width: w, height: h, data: new Uint32Array(w * h) };
}

export function cloneGrid(g: Grid): Grid {
  return { width: g.width, height: g.height, data: g.data.slice() };
}

export function inBounds(g: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < g.width && y < g.height;
}

export function getPixel(g: Grid, x: number, y: number): PackedColor {
  return inBounds(g, x, y) ? g.data[y * g.width + x] : TRANSPARENT;
}

export function gridsEqual(a: Grid, b: Grid): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
  return true;
}

export function isEmpty(g: Grid): boolean {
  for (let i = 0; i < g.data.length; i++) if (g.data[i] !== 0) return false;
  return true;
}

/** Distinct non-transparent colors in order of first appearance (row-major). */
export function usedColors(g: Grid): PackedColor[] {
  const seen = new Set<PackedColor>();
  const out: PackedColor[] = [];
  for (let i = 0; i < g.data.length; i++) {
    const c = g.data[i];
    if (c !== 0 && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

/** Bounding box of non-transparent cells, or null when empty. */
export function contentBounds(g: Grid): { x: number; y: number; w: number; h: number } | null {
  let x0 = g.width, y0 = g.height, x1 = -1, y1 = -1;
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      if (g.data[y * g.width + x] !== 0) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
