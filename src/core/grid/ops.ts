import { type PackedColor, TRANSPARENT } from './color';
import { brushPoints, type Connectivity, ellipsePoints, floodRegion, linePoints, mirrorPoints, rectPoints } from './draw';
import { createGrid, type Grid, type Point } from './grid';
import type { PatchRecorder } from '../history/patch';

export interface PaintOptions {
  brush: number;
  mirrorX: boolean;
  mirrorY: boolean;
}

export const DEFAULT_PAINT: PaintOptions = { brush: 1, mirrorX: false, mirrorY: false };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function setPixel(rec: PatchRecorder, x: number, y: number, color: PackedColor): boolean {
  const g = rec.grid;
  if (x < 0 || y < 0 || x >= g.width || y >= g.height) return false;
  return rec.write(y * g.width + x, color);
}

/** In-bounds cell indices covered by the points once brush size and mirroring apply. */
export function paintFootprint(points: readonly Point[], opts: PaintOptions, w: number, h: number): Set<number> {
  const out = new Set<number>();
  for (const p of points) {
    for (const b of brushPoints(p.x, p.y, opts.brush)) {
      for (const m of mirrorPoints(b, w, h, opts.mirrorX, opts.mirrorY)) {
        if (m.x >= 0 && m.y >= 0 && m.x < w && m.y < h) out.add(m.y * w + m.x);
      }
    }
  }
  return out;
}

/** Paints each point with brush size and mirroring applied. */
export function paintPoints(rec: PatchRecorder, points: readonly Point[], color: PackedColor, opts: PaintOptions = DEFAULT_PAINT): void {
  for (const i of paintFootprint(points, opts, rec.grid.width, rec.grid.height)) rec.write(i, color);
}

export function drawLine(rec: PatchRecorder, a: Point, b: Point, color: PackedColor, opts?: PaintOptions): void {
  paintPoints(rec, linePoints(a.x, a.y, b.x, b.y), color, opts);
}

export function drawRect(rec: PatchRecorder, a: Point, b: Point, color: PackedColor, filled: boolean, opts?: PaintOptions): void {
  paintPoints(rec, rectPoints(a.x, a.y, b.x, b.y, filled), color, opts);
}

export function drawEllipse(rec: PatchRecorder, a: Point, b: Point, color: PackedColor, filled: boolean, opts?: PaintOptions): void {
  paintPoints(rec, ellipsePoints(a.x, a.y, b.x, b.y, filled), color, opts);
}

/** Flood fills from (x, y) and from each mirrored start point. */
export function floodFill(
  rec: PatchRecorder,
  x: number,
  y: number,
  color: PackedColor,
  connectivity: Connectivity = 4,
  mirror: Pick<PaintOptions, 'mirrorX' | 'mirrorY'> = { mirrorX: false, mirrorY: false },
): void {
  const g = rec.grid;
  for (const s of mirrorPoints({ x, y }, g.width, g.height, mirror.mirrorX, mirror.mirrorY)) {
    for (const i of floodRegion(g, s.x, s.y, connectivity)) rec.write(i, color);
  }
}

export function replaceColor(rec: PatchRecorder, from: PackedColor, to: PackedColor): void {
  const d = rec.grid.data;
  for (let i = 0; i < d.length; i++) if (d[i] === from) rec.write(i, to);
}

export function clearAll(rec: PatchRecorder): void {
  const d = rec.grid.data;
  for (let i = 0; i < d.length; i++) rec.write(i, TRANSPARENT);
}

export function normalizeRect(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 };
}

export function clipRect(r: Rect, g: Pick<Grid, 'width' | 'height'>): Rect | null {
  const x0 = Math.max(0, r.x);
  const y0 = Math.max(0, r.y);
  const x1 = Math.min(g.width, r.x + r.w);
  const y1 = Math.min(g.height, r.y + r.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Copies a region into a new standalone grid. Out-of-bounds cells are transparent. */
export function extractRegion(g: Grid, r: Rect): Grid {
  const out = createGrid(r.w, r.h);
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const gx = r.x + x;
      const gy = r.y + y;
      if (gx >= 0 && gy >= 0 && gx < g.width && gy < g.height) out.data[y * r.w + x] = g.data[gy * g.width + gx];
    }
  }
  return out;
}

export function clearRegion(rec: PatchRecorder, r: Rect): void {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) setPixel(rec, x, y, TRANSPARENT);
}

/** Stamps a buffer at (x, y). Transparent buffer cells leave the target untouched. */
export function pasteRegion(rec: PatchRecorder, buf: Grid, x: number, y: number): void {
  for (let by = 0; by < buf.height; by++) {
    for (let bx = 0; bx < buf.width; bx++) {
      const c = buf.data[by * buf.width + bx];
      if (c !== TRANSPARENT) setPixel(rec, x + bx, y + by, c);
    }
  }
}

/** Moves the pixels inside `r` by (dx, dy). Pixels moved off-canvas are dropped. */
export function moveRegion(rec: PatchRecorder, r: Rect, dx: number, dy: number): void {
  const buf = extractRegion(rec.grid, r);
  clearRegion(rec, r);
  pasteRegion(rec, buf, r.x + dx, r.y + dy);
}

export type Anchor = 'tl' | 't' | 'tr' | 'l' | 'c' | 'r' | 'bl' | 'b' | 'br';
export const ANCHORS: Anchor[] = ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br'];

/** Crop / pad to a new size. The anchor decides which edge(s) stay fixed. */
export function resize(g: Grid, width: number, height: number, anchor: Anchor = 'tl'): Grid {
  const out = createGrid(width, height);
  const col = ANCHORS.indexOf(anchor) % 3;
  const row = Math.floor(ANCHORS.indexOf(anchor) / 3);
  const offset = (n: number, o: number, idx: number) => (idx === 0 ? 0 : idx === 1 ? Math.floor((n - o) / 2) : n - o);
  const ox = offset(out.width, g.width, col);
  const oy = offset(out.height, g.height, row);
  for (let y = 0; y < g.height; y++) {
    const ty = y + oy;
    if (ty < 0 || ty >= out.height) continue;
    for (let x = 0; x < g.width; x++) {
      const tx = x + ox;
      if (tx < 0 || tx >= out.width) continue;
      out.data[ty * out.width + tx] = g.data[y * g.width + x];
    }
  }
  return out;
}

export type FlipAxis = 'horizontal' | 'vertical';

/** Mirrors the pixels inside `r` in place (clipped to the grid), transparent cells included. */
export function flipRegion(rec: PatchRecorder, r: Rect, axis: FlipAxis): void {
  const c = clipRect(r, rec.grid);
  if (!c) return;
  const buf = extractRegion(rec.grid, c);
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const sx = axis === 'horizontal' ? c.w - 1 - x : x;
      const sy = axis === 'vertical' ? c.h - 1 - y : y;
      setPixel(rec, c.x + x, c.y + y, buf.data[sy * c.w + sx]);
    }
  }
}
