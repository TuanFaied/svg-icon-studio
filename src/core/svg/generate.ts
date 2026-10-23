import { alpha, opacityString, type PackedColor, toHexRGB } from '../grid/color';
import type { Grid } from '../grid/grid';
import { type CellRect, type ColorGroups, individualCells, type Loop, mergedRects, outlineLoops } from './geometry';

export type Geometry = 'rects' | 'paths' | 'cells';
export type OutputFormat = 'readable' | 'minimal' | 'optimized';

export interface SvgOptions {
  geometry: Geometry;
  /** 'optimized' is produced by running the minimal output through SVGO (see optimize.ts). */
  format: OutputFormat;
  /** Emit width/height attributes; when false only viewBox is set (responsive). */
  includeSize: boolean;
  width: number;
  height: number;
  title: string;
  /** Adds aria-hidden="true" and omits title/role. */
  decorative: boolean;
  /** For single-color drawings, use fill="currentColor". Ignored otherwise. */
  currentColor: boolean;
  includeBackground: boolean;
  background: PackedColor;
  /** Corner radius in cell units; only honored in 'cells' geometry. */
  cornerRadius: number;
  crispEdges: boolean;
}

export const DEFAULT_SVG_OPTIONS: SvgOptions = {
  geometry: 'rects',
  format: 'readable',
  includeSize: true,
  width: 24,
  height: 24,
  title: '',
  decorative: false,
  currentColor: false,
  includeBackground: false,
  background: 0xffffffff,
  cornerRadius: 0,
  crispEdges: true,
};

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** True when the drawing uses exactly one color (any alpha), so currentColor applies. */
export function canUseCurrentColor(g: Grid): boolean {
  let first = 0;
  for (let i = 0; i < g.data.length; i++) {
    const c = g.data[i];
    if (c === 0) continue;
    if (first === 0) first = c;
    else if (c !== first) return false;
  }
  return first !== 0;
}

function rectEl(r: CellRect, minimal: boolean, radius: number): string {
  const parts: string[] = [];
  if (!minimal || r.x !== 0) parts.push(`x="${r.x}"`);
  if (!minimal || r.y !== 0) parts.push(`y="${r.y}"`);
  parts.push(`width="${r.w}"`, `height="${r.h}"`);
  if (radius > 0) parts.push(`rx="${radius}"`);
  return `<rect ${parts.join(' ')}/>`;
}

/** Path data from loops using only M, h, v, z. */
export function loopsToPathData(loops: readonly Loop[], minimal: boolean): string {
  const sp = minimal ? '' : ' ';
  const out: string[] = [];
  for (const loop of loops) {
    if (loop.length === 0) continue;
    const [sx, sy] = loop[0];
    const cmds: string[] = [`M${sx} ${sy}`];
    let px = sx;
    let py = sy;
    // The final edge back to the start is implied by z.
    for (let i = 1; i < loop.length; i++) {
      const [x, y] = loop[i];
      if (y === py) cmds.push(`h${x - px}`);
      else cmds.push(`v${y - py}`);
      px = x;
      py = y;
    }
    cmds.push('z');
    out.push(cmds.join(sp));
  }
  return out.join(sp);
}

interface Shape {
  color: PackedColor;
  elements: string[];
}

function shapesFor(g: Grid, opts: SvgOptions, minimal: boolean): Shape[] {
  if (opts.geometry === 'paths') {
    const groups = outlineLoops(g);
    return [...groups].map(([color, loops]) => ({
      color,
      elements: [`<path${minimal ? '' : ' fill-rule="evenodd"'} d="${loopsToPathData(loops, minimal)}"/>`],
    }));
  }
  const groups: ColorGroups<CellRect> = opts.geometry === 'cells' ? individualCells(g) : mergedRects(g);
  const radius = opts.geometry === 'cells' ? Math.max(0, Math.min(0.5, opts.cornerRadius)) : 0;
  return [...groups].map(([color, rects]) => ({ color, elements: rects.map((r) => rectEl(r, minimal, radius)) }));
}

function fillAttrs(color: PackedColor, useCurrent: boolean, minimal: boolean): string {
  const fill = useCurrent ? 'currentColor' : toHexRGB(color, minimal);
  const a = alpha(color);
  return a === 255 ? `fill="${fill}"` : `fill="${fill}" fill-opacity="${opacityString(color)}"`;
}

/**
 * Converts the grid to an SVG string. Coordinates are integers in grid units.
 * For 'optimized', this returns the minimal form; run it through `optimizeSvg`.
 */
export function gridToSvg(g: Grid, opts: SvgOptions): string {
  const minimal = opts.format !== 'readable';
  const useCurrent = opts.currentColor && canUseCurrentColor(g);
  const paths = opts.geometry === 'paths';

  const root: string[] = ['xmlns="http://www.w3.org/2000/svg"', `viewBox="0 0 ${g.width} ${g.height}"`];
  if (opts.includeSize) root.push(`width="${Math.max(1, Math.round(opts.width))}"`, `height="${Math.max(1, Math.round(opts.height))}"`);
  if (opts.crispEdges) root.push('shape-rendering="crispEdges"');
  // In minimal mode the evenodd rule moves to the root so it is written once.
  if (paths && minimal) root.push('fill-rule="evenodd"');
  const title = opts.title.trim();
  if (opts.decorative) root.push('aria-hidden="true"');
  else if (title) root.push('role="img"');

  const children: string[] = [];
  if (!opts.decorative && title) children.push(`<title>${escapeXml(title)}</title>`);
  if (opts.includeBackground && opts.background !== 0) {
    children.push(`<rect width="${g.width}" height="${g.height}" ${fillAttrs(opts.background, false, minimal)}/>`);
  }

  const shapes = shapesFor(g, opts, minimal);
  const indent = minimal ? '' : '  ';
  const nl = minimal ? '' : '\n';
  const body: string[] = [];
  for (const s of shapes) {
    const fa = fillAttrs(s.color, useCurrent, minimal);
    if (minimal && s.elements.length === 1) {
      // Put the fill straight on the single element instead of wrapping it.
      body.push(s.elements[0].replace(/^<(\w+)/, `<$1 ${fa}`));
    } else {
      body.push(`<g ${fa}>${nl}${s.elements.map((e) => `${indent}${indent}${e}`).join(nl)}${nl}${indent}</g>`);
    }
  }

  const inner = [...children, ...body].map((l) => indent + l).join(nl);
  return `<svg ${root.join(' ')}>${nl}${inner}${inner ? nl : ''}</svg>${minimal ? '' : '\n'}`;
}
