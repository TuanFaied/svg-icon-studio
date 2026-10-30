import { describe, expect, it } from 'vitest';
import { pack, parseHex, toHex, toHexRGB } from './color';
import { ellipsePoints, floodRegion, linePoints, mirrorPoints, rectPoints, snapLine } from './draw';
import { createGrid, getPixel, type Grid } from './grid';
import { drawLine, flipRegion, floodFill, moveRegion, replaceColor, resize, setPixel } from './ops';
import { PatchRecorder } from '../history/patch';

const RED = pack(255, 0, 0);
const BLUE = pack(0, 0, 255);

function fromRows(rows: string[], palette: Record<string, number> = { '#': RED, b: BLUE }): Grid {
  const g = createGrid(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => (g.data[y * g.width + x] = palette[ch] ?? 0)));
  return g;
}

function toRows(g: Grid): string[] {
  const rows: string[] = [];
  for (let y = 0; y < g.height; y++) {
    let s = '';
    for (let x = 0; x < g.width; x++) {
      const c = g.data[y * g.width + x];
      s += c === 0 ? '.' : c === RED ? '#' : c === BLUE ? 'b' : '?';
    }
    rows.push(s);
  }
  return rows;
}

describe('color', () => {
  it('packs and formats', () => {
    expect(toHex(RED)).toBe('#ff0000');
    expect(toHexRGB(parseHex('#fff') as number, true)).toBe('#fff');
    expect(parseHex('#11223380')).toBe(0x11223380);
    expect(parseHex('#12345600')).toBe(0);
    expect(parseHex('nope')).toBeNull();
    expect(pack(1, 2, 3, 0)).toBe(0);
  });
});

describe('lines', () => {
  const octants: Array<[number, number]> = [
    [7, 2], [2, 7], [-2, 7], [-7, 2], [-7, -2], [-2, -7], [2, -7], [7, -2], [5, 0], [0, 5], [-5, 0], [0, -5], [4, 4],
  ];
  it.each(octants)('connects endpoints without gaps for (%i, %i)', (dx, dy) => {
    const pts = linePoints(10, 10, 10 + dx, 10 + dy);
    expect(pts[0]).toEqual({ x: 10, y: 10 });
    expect(pts[pts.length - 1]).toEqual({ x: 10 + dx, y: 10 + dy });
    expect(pts.length).toBe(Math.max(Math.abs(dx), Math.abs(dy)) + 1);
    for (let i = 1; i < pts.length; i++) {
      expect(Math.abs(pts[i].x - pts[i - 1].x)).toBeLessThanOrEqual(1);
      expect(Math.abs(pts[i].y - pts[i - 1].y)).toBeLessThanOrEqual(1);
    }
  });

  it('snaps to 0/45/90 degrees', () => {
    expect(snapLine({ x: 0, y: 0 }, { x: 10, y: 2 })).toEqual({ x: 10, y: 0 });
    expect(snapLine({ x: 0, y: 0 }, { x: 1, y: 9 })).toEqual({ x: 0, y: 9 });
    expect(snapLine({ x: 0, y: 0 }, { x: 6, y: -5 })).toEqual({ x: 6, y: -6 });
  });

  it('drawLine paints into the grid via recorder', () => {
    const g = createGrid(5, 5);
    const rec = new PatchRecorder(g);
    drawLine(rec, { x: 0, y: 0 }, { x: 4, y: 4 }, RED);
    expect(toRows(g)).toEqual(['#....', '.#...', '..#..', '...#.', '....#']);
    expect(rec.toPatches()).toHaveLength(5);
  });
});

describe('rect and ellipse', () => {
  it('outlines and fills rectangles in any drag direction', () => {
    expect(rectPoints(3, 2, 0, 0, false)).toHaveLength(10);
    expect(rectPoints(0, 0, 3, 2, true)).toHaveLength(12);
  });

  it('draws a symmetric pixel circle', () => {
    const g = createGrid(7, 7);
    for (const p of ellipsePoints(0, 0, 6, 6, false)) g.data[p.y * 7 + p.x] = RED;
    const rows = toRows(g);
    expect(rows).toEqual([...rows].reverse());
    expect(rows.map((r) => [...r].reverse().join(''))).toEqual(rows);
    expect(rows[3][0]).toBe('#');
    expect(rows[0][3]).toBe('#');
    expect(rows[3][3]).toBe('.');
  });

  it('filled ellipse stays inside its box and covers the center', () => {
    const pts = ellipsePoints(1, 2, 9, 6, true);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(1);
      expect(p.x).toBeLessThanOrEqual(9);
      expect(p.y).toBeGreaterThanOrEqual(2);
      expect(p.y).toBeLessThanOrEqual(6);
    }
    expect(pts.some((p) => p.x === 5 && p.y === 4)).toBe(true);
  });

  it('handles degenerate 1-wide ellipses', () => {
    expect(ellipsePoints(2, 2, 2, 2, false)).toEqual([{ x: 2, y: 2 }]);
    expect(ellipsePoints(0, 0, 0, 4, true).length).toBe(5);
  });
});

describe('flood fill', () => {
  it('fills a region bounded by walls and respects holes', () => {
    const g = fromRows(['#####', '#...#', '#.#.#', '#...#', '#####']);
    const rec = new PatchRecorder(g);
    floodFill(rec, 1, 1, BLUE);
    expect(toRows(g)).toEqual(['#####', '#bbb#', '#b#b#', '#bbb#', '#####']);
  });

  it('fills from an edge cell', () => {
    const g = fromRows(['..#', '..#', '###']);
    floodFill(new PatchRecorder(g), 0, 0, BLUE);
    expect(toRows(g)).toEqual(['bb#', 'bb#', '###']);
  });

  it('4-way does not leak through diagonals, 8-way does', () => {
    const g = fromRows(['.#', '#.']);
    expect(floodRegion(g, 0, 0, 4)).toHaveLength(1);
    expect(floodRegion(g, 0, 0, 8)).toHaveLength(2);
  });

  it('fill with same color is a no-op', () => {
    const g = fromRows(['##']);
    const rec = new PatchRecorder(g);
    floodFill(rec, 0, 0, RED);
    expect(rec.size).toBe(0);
  });
});

describe('mirror, move, replace, resize', () => {
  it('mirrors across both axes', () => {
    expect(mirrorPoints({ x: 0, y: 1 }, 4, 4, true, true)).toEqual([
      { x: 0, y: 1 }, { x: 3, y: 1 }, { x: 0, y: 2 }, { x: 3, y: 2 },
    ]);
  });

  it('moves a region, dropping pixels pushed off-canvas', () => {
    const g = fromRows(['##..', '##..', '....']);
    moveRegion(new PatchRecorder(g), { x: 0, y: 0, w: 2, h: 2 }, 1, 1);
    expect(toRows(g)).toEqual(['....', '.##.', '.##.']);
    moveRegion(new PatchRecorder(g), { x: 1, y: 1, w: 2, h: 2 }, 2, 0);
    expect(toRows(g)).toEqual(['....', '...#', '...#']);
  });

  it('replaces a color everywhere', () => {
    const g = fromRows(['#.#', 'b#b']);
    replaceColor(new PatchRecorder(g), RED, BLUE);
    expect(toRows(g)).toEqual(['b.b', 'bbb']);
  });

  const src = () => fromRows(['#b', 'b#']);
  it.each([
    ['tl', ['#b..', 'b#..', '....', '....']],
    ['t', ['.#b.', '.b#.', '....', '....']],
    ['tr', ['..#b', '..b#', '....', '....']],
    ['l', ['....', '#b..', 'b#..', '....']],
    ['c', ['....', '.#b.', '.b#.', '....']],
    ['r', ['....', '..#b', '..b#', '....']],
    ['bl', ['....', '....', '#b..', 'b#..']],
    ['b', ['....', '....', '.#b.', '.b#.']],
    ['br', ['....', '....', '..#b', '..b#']],
  ] as const)('pads with anchor %s', (anchor, expected) => {
    expect(toRows(resize(src(), 4, 4, anchor))).toEqual(expected);
  });

  it('crops with anchors', () => {
    const g = fromRows(['#..', '.b.', '..#']);
    expect(toRows(resize(g, 1, 1, 'tl'))).toEqual(['#']);
    expect(toRows(resize(g, 1, 1, 'c'))).toEqual(['b']);
    expect(toRows(resize(g, 1, 1, 'br'))).toEqual(['#']);
  });

  it('setPixel ignores out-of-bounds writes', () => {
    const g = createGrid(2, 2);
    expect(setPixel(new PatchRecorder(g), 5, 5, RED)).toBe(false);
    expect(getPixel(g, 5, 5)).toBe(0);
  });
});

describe('flip region', () => {
  it('mirrors horizontally and vertically, including empty cells, inside the rect only', () => {
    const g = fromRows(['#b..', '.#..', '...b']);
    flipRegion(new PatchRecorder(g), { x: 0, y: 0, w: 2, h: 2 }, 'horizontal');
    expect(toRows(g)).toEqual(['b#..', '#...', '...b']);
    flipRegion(new PatchRecorder(g), { x: 0, y: 0, w: 2, h: 2 }, 'vertical');
    expect(toRows(g)).toEqual(['#...', 'b#..', '...b']);
  });

  it('clips to the grid and is one patch set', () => {
    const g = fromRows(['#.', '..']);
    const rec = new PatchRecorder(g);
    flipRegion(rec, { x: -1, y: 0, w: 3, h: 1 }, 'horizontal');
    expect(toRows(g)).toEqual(['.#', '..']);
    expect(rec.toPatches()).toHaveLength(2);
  });
});
