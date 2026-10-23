import type { PackedColor } from '../grid/color';
import type { Grid } from '../grid/grid';

export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Colors in first-appearance order, each with its own list of shapes. */
export type ColorGroups<T> = Map<PackedColor, T[]>;

/**
 * Greedy meshing: scan rows, extend each run right as far as the color holds,
 * then extend down while the full row segment matches and is unclaimed.
 */
export function mergedRects(g: Grid): ColorGroups<CellRect> {
  const { width: w, height: h, data } = g;
  const used = new Uint8Array(w * h);
  const groups: ColorGroups<CellRect> = new Map();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const c = data[i];
      if (c === 0 || used[i]) continue;
      let rw = 1;
      while (x + rw < w && !used[i + rw] && data[i + rw] === c) rw++;
      let rh = 1;
      outer: while (y + rh < h) {
        const row = (y + rh) * w + x;
        for (let k = 0; k < rw; k++) if (used[row + k] || data[row + k] !== c) break outer;
        rh++;
      }
      for (let yy = 0; yy < rh; yy++) used.fill(1, (y + yy) * w + x, (y + yy) * w + x + rw);
      let list = groups.get(c);
      if (!list) groups.set(c, (list = []));
      list.push({ x, y, w: rw, h: rh });
    }
  }
  return groups;
}

export function individualCells(g: Grid): ColorGroups<CellRect> {
  const groups: ColorGroups<CellRect> = new Map();
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      const c = g.data[y * g.width + x];
      if (c === 0) continue;
      let list = groups.get(c);
      if (!list) groups.set(c, (list = []));
      list.push({ x, y, w: 1, h: 1 });
    }
  }
  return groups;
}

/** A closed loop of grid vertices (corners only, collinear points removed). */
export type Loop = Array<[number, number]>;

/**
 * Traces the boundary of every same-color region into closed loops.
 * Each cell contributes clockwise directed edges on sides that border a
 * different color; edges are then chained into loops. With fill-rule
 * evenodd, any decomposition of the edge set into loops renders the same
 * coverage, so holes come out correctly without orientation bookkeeping.
 */
export function outlineLoops(g: Grid): ColorGroups<Loop> {
  const { width: w, height: h, data } = g;
  const vw = w + 1; // vertex grid width
  const groups: ColorGroups<Loop> = new Map();

  // Collect edges per color: map from start vertex -> list of end vertices.
  const edgesByColor = new Map<PackedColor, Map<number, number[]>>();
  const order: PackedColor[] = [];
  const addEdge = (c: PackedColor, from: number, to: number) => {
    let m = edgesByColor.get(c);
    if (!m) {
      edgesByColor.set(c, (m = new Map()));
      order.push(c);
    }
    const list = m.get(from);
    if (list) list.push(to);
    else m.set(from, [to]);
  };
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : data[y * w + x]);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = data[y * w + x];
      if (c === 0) continue;
      const tl = y * vw + x;
      const tr = tl + 1;
      const bl = tl + vw;
      const br = bl + 1;
      if (at(x, y - 1) !== c) addEdge(c, tl, tr);
      if (at(x + 1, y) !== c) addEdge(c, tr, br);
      if (at(x, y + 1) !== c) addEdge(c, br, bl);
      if (at(x - 1, y) !== c) addEdge(c, bl, tl);
    }
  }

  for (const c of order) {
    const edges = edgesByColor.get(c) as Map<number, number[]>;
    const loops: Loop[] = [];
    // Deterministic start order: smallest vertex index first (top-left most).
    const starts = [...edges.keys()].sort((a, b) => a - b);
    for (const s of starts) {
      for (;;) {
        const outs = edges.get(s);
        if (!outs || outs.length === 0) break;
        const verts: number[] = [s];
        let cur = outs.pop() as number;
        while (cur !== s) {
          verts.push(cur);
          const next = edges.get(cur);
          if (!next || next.length === 0) throw new Error('outline tracing: open boundary');
          cur = next.pop() as number;
        }
        loops.push(simplifyLoop(verts, vw));
      }
    }
    groups.set(c, loops);
  }
  return groups;
}

/** Drops vertices that lie on a straight run so only corners remain, starting at a corner. */
function simplifyLoop(verts: number[], vw: number): Loop {
  const pts: Array<[number, number]> = verts.map((v) => [v % vw, Math.floor(v / vw)]);
  const n = pts.length;
  const corners: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n];
    const q = pts[i];
    const r = pts[(i + 1) % n];
    const d1x = Math.sign(q[0] - p[0]);
    const d1y = Math.sign(q[1] - p[1]);
    const d2x = Math.sign(r[0] - q[0]);
    const d2y = Math.sign(r[1] - q[1]);
    if (d1x !== d2x || d1y !== d2y) corners.push(q);
  }
  return corners;
}
