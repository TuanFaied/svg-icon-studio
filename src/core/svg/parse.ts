import { pack, type PackedColor, parseHex } from '../grid/color';
import { createGrid, type Grid } from '../grid/grid';

/**
 * Rasterizes an SVG produced by this app (or SVGO'd from it) back into a grid.
 * Supports <svg viewBox>, nested <g>, <rect>, and rectilinear <path> data
 * (M/m, H/h, V/v, L/l, Z/z) with even-odd fill. Used for the round-trip
 * guarantee and to re-import pixel SVGs; it is not a general SVG renderer.
 */

interface Style {
  fill: string | null;
  fillOpacity: number;
}

const TAG_RE = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
const ATTR_RE = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(ATTR_RE)) out[m[1]] = m[2] ?? m[3] ?? '';
  return out;
}

function resolveColor(style: Style, currentColor: PackedColor): PackedColor {
  if (!style.fill || style.fill === 'none') return 0;
  const base = style.fill === 'currentColor' ? currentColor : parseHex(style.fill);
  if (base === null || base === 0) return 0;
  const a = Math.round(((base & 255) / 255) * style.fillOpacity * 255);
  return pack(base >>> 24, (base >>> 16) & 255, (base >>> 8) & 255, a);
}

/** Parses path data into closed polygons of [x, y] vertices. */
export function parsePathData(d: string): Array<Array<[number, number]>> {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const polys: Array<Array<[number, number]>> = [];
  let cur: Array<[number, number]> = [];
  let x = 0, y = 0, sx = 0, sy = 0;
  let cmd = '';
  let i = 0;
  const num = () => parseFloat(tokens[i++]);
  const close = () => {
    if (cur.length > 1) polys.push(cur);
    cur = [];
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    switch (cmd) {
      case 'M': case 'm': {
        close();
        const nx = num(), ny = num();
        x = cmd === 'm' ? x + nx : nx;
        y = cmd === 'm' ? y + ny : ny;
        sx = x; sy = y;
        cur.push([x, y]);
        cmd = cmd === 'm' ? 'l' : 'L'; // implicit lineto after moveto
        break;
      }
      case 'L': x = num(); y = num(); cur.push([x, y]); break;
      case 'l': x += num(); y += num(); cur.push([x, y]); break;
      case 'H': x = num(); cur.push([x, y]); break;
      case 'h': x += num(); cur.push([x, y]); break;
      case 'V': y = num(); cur.push([x, y]); break;
      case 'v': y += num(); cur.push([x, y]); break;
      case 'Z': case 'z':
        close();
        x = sx; y = sy;
        // After z, a following number-less command must be explicit; consume nothing.
        if (i < tokens.length && !/[a-zA-Z]/.test(tokens[i])) throw new Error('Unexpected number after z');
        break;
      default:
        throw new Error(`Unsupported path command "${cmd}"`);
    }
  }
  close();
  return polys;
}

/** Even-odd point-in-polygon test summed across all subpaths. */
function insideEvenOdd(polys: Array<Array<[number, number]>>, px: number, py: number): boolean {
  let inside = false;
  for (const poly of polys) {
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const [xa, ya] = poly[a];
      const [xb, yb] = poly[b];
      if (ya > py !== yb > py && px < ((xb - xa) * (py - ya)) / (yb - ya) + xa) inside = !inside;
    }
  }
  return inside;
}

export interface ParseOptions {
  /** Color substituted for fill="currentColor". */
  currentColor?: PackedColor;
  /** Skip a full-size rect that is the first painted element (the optional background). */
  skipBackground?: boolean;
}

export function svgToGrid(svg: string, options: ParseOptions = {}): Grid {
  const currentColor = options.currentColor ?? 0x000000ff;
  const stack: Style[] = [{ fill: '#000', fillOpacity: 1 }];
  let grid: Grid | null = null;
  let painted = 0;

  for (const m of svg.matchAll(TAG_RE)) {
    const [, closing, name, rawAttrs, selfClosing] = m;
    if (closing) {
      if (name === 'g' || name === 'svg') stack.pop();
      continue;
    }
    const a = attrs(rawAttrs);
    const parent = stack[stack.length - 1];
    const style: Style = {
      fill: a.fill ?? parent.fill,
      fillOpacity: a['fill-opacity'] !== undefined ? parseFloat(a['fill-opacity']) : parent.fillOpacity,
    };

    if (name === 'svg') {
      const vb = (a.viewBox ?? '').trim().split(/[\s,]+/).map(Number);
      if (vb.length !== 4 || vb.some((n) => !Number.isFinite(n))) throw new Error('svg has no valid viewBox');
      grid = createGrid(vb[2], vb[3]);
      if (!selfClosing) stack.push(style);
      continue;
    }
    if (!grid) continue;
    if (name === 'g') {
      if (!selfClosing) stack.push(style);
      continue;
    }

    const color = resolveColor(style, currentColor);
    if (name === 'rect') {
      const x = parseFloat(a.x ?? '0');
      const y = parseFloat(a.y ?? '0');
      const w = parseFloat(a.width ?? '0');
      const h = parseFloat(a.height ?? '0');
      const isBg = painted === 0 && options.skipBackground && x === 0 && y === 0 && w === grid.width && h === grid.height;
      painted++;
      if (isBg) continue;
      for (let yy = Math.max(0, y); yy < Math.min(grid.height, y + h); yy++) {
        for (let xx = Math.max(0, x); xx < Math.min(grid.width, x + w); xx++) grid.data[yy * grid.width + xx] = color;
      }
    } else if (name === 'path' && a.d) {
      painted++;
      const polys = parsePathData(a.d);
      for (let yy = 0; yy < grid.height; yy++) {
        for (let xx = 0; xx < grid.width; xx++) {
          if (insideEvenOdd(polys, xx + 0.5, yy + 0.5)) grid.data[yy * grid.width + xx] = color;
        }
      }
    }
  }
  if (!grid) throw new Error('No <svg> root element found');
  return grid;
}
