import type { Grid, Point } from './grid';

/** Bresenham line, inclusive of both endpoints, works in all octants. */
export function linePoints(x0: number, y0: number, x1: number, y1: number): Point[] {
  const pts: Point[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    pts.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return pts;
}

/** Snaps the end point so the line from `a` is at 0, 45 or 90 degrees. */
export function snapLine(a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  // Within ~22.5 degrees of an axis: snap to axis; otherwise diagonal.
  if (adx > ady * 2.414) return { x: b.x, y: a.y };
  if (ady > adx * 2.414) return { x: a.x, y: b.y };
  const d = Math.max(adx, ady);
  return { x: a.x + Math.sign(dx) * d, y: a.y + Math.sign(dy) * d };
}

/** Constrains `b` so the box from `a` to `b` is square (for rect / circle). */
export function constrainSquare(a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: a.x + (dx < 0 ? -d : d), y: a.y + (dy < 0 ? -d : d) };
}

export function rectPoints(x0: number, y0: number, x1: number, y1: number, filled: boolean): Point[] {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  const pts: Point[] = [];
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (filled || y === top || y === bottom || x === left || x === right) pts.push({ x, y });
    }
  }
  return pts;
}

/**
 * Pixel-perfect ellipse inscribed in the box (x0,y0)-(x1,y1), inclusive.
 * Based on Alois Zingl's rasterizing algorithm; filled variant spans rows.
 */
export function ellipsePoints(x0: number, y0: number, x1: number, y1: number, filled: boolean): Point[] {
  const outline: Point[] = [];
  const put = (x: number, y: number) => outline.push({ x, y });
  let a = Math.abs(x1 - x0);
  let b = Math.abs(y1 - y0);
  let b1 = b & 1;
  let dx = 4 * (1 - a) * b * b;
  let dy = 4 * (b1 + 1) * a * a;
  let err = dx + dy + b1 * a * a;
  if (x0 > x1) {
    x0 = x1;
    x1 += a;
  }
  if (y0 > y1) y0 = y1;
  y0 += (b + 1) >> 1;
  y1 = y0 - b1;
  const a8 = 8 * a * a;
  b1 = 8 * b * b;
  do {
    put(x1, y0);
    put(x0, y0);
    put(x0, y1);
    put(x1, y1);
    const e2 = 2 * err;
    if (e2 <= dy) {
      y0++;
      y1--;
      dy += a8;
      err += dy;
    }
    if (e2 >= dx || 2 * err > dy) {
      x0++;
      x1--;
      dx += b1;
      err += dx;
    }
  } while (x0 <= x1);
  while (y0 - y1 <= b) {
    put(x0 - 1, y0);
    put(x1 + 1, y0++);
    put(x0 - 1, y1);
    put(x1 + 1, y1--);
  }

  // Deduplicate and optionally fill each row between its extremes.
  const rows = new Map<number, [number, number]>();
  const seen = new Set<string>();
  const out: Point[] = [];
  for (const p of outline) {
    const r = rows.get(p.y);
    if (!r) rows.set(p.y, [p.x, p.x]);
    else {
      if (p.x < r[0]) r[0] = p.x;
      if (p.x > r[1]) r[1] = p.x;
    }
    if (!filled) {
      const k = `${p.x},${p.y}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push(p);
      }
    }
  }
  if (filled) {
    for (const [y, [l, r]] of rows) for (let x = l; x <= r; x++) out.push({ x, y });
  }
  return out;
}

export type Connectivity = 4 | 8;

/** Indices of the connected region sharing the start cell's color. */
export function floodRegion(g: Grid, sx: number, sy: number, connectivity: Connectivity = 4): number[] {
  const { width: w, height: h, data } = g;
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return [];
  const target = data[sy * w + sx];
  const visited = new Uint8Array(w * h);
  const out: number[] = [];
  const stack: number[] = [sy * w + sx];
  visited[sy * w + sx] = 1;
  while (stack.length) {
    const i = stack.pop() as number;
    out.push(i);
    const x = i % w;
    const y = (i - x) / w;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (ox === 0 && oy === 0) continue;
        if (connectivity === 4 && ox !== 0 && oy !== 0) continue;
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (visited[ni] || data[ni] !== target) continue;
        visited[ni] = 1;
        stack.push(ni);
      }
    }
  }
  return out;
}

/** Cells covered by a square brush of `size` centered on (x, y). */
export function brushPoints(x: number, y: number, size: number): Point[] {
  if (size <= 1) return [{ x, y }];
  const off = Math.floor((size - 1) / 2);
  const pts: Point[] = [];
  for (let oy = 0; oy < size; oy++) for (let ox = 0; ox < size; ox++) pts.push({ x: x - off + ox, y: y - off + oy });
  return pts;
}

/** The point plus its reflections across the vertical and/or horizontal center lines. */
export function mirrorPoints(p: Point, w: number, h: number, mirrorX: boolean, mirrorY: boolean): Point[] {
  const pts: Point[] = [p];
  const mx = w - 1 - p.x;
  const my = h - 1 - p.y;
  if (mirrorX) pts.push({ x: mx, y: p.y });
  if (mirrorY) pts.push({ x: p.x, y: my });
  if (mirrorX && mirrorY) pts.push({ x: mx, y: my });
  return pts;
}
