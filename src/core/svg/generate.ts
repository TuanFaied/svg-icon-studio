import { alpha, opacityString, type PackedColor, toHexRGB } from '../grid/color';
import type { Grid } from '../grid/grid';
import { type AnimationOptions, animationCss, animationPrefix, frameCss, NO_ANIMATION, sequenceRanks } from './animation';
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
  /** Whole-icon animation preset (CSS keyframes); the background rect stays still. */
  animation: AnimationOptions;
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
  animation: NO_ANIMATION,
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

export interface SvgFrame {
  grid: Grid;
  /** Milliseconds on screen; only used when there are several frames. */
  duration: number;
}

/** FNV-1a over a grid's pixels, used to tell whether cached shapes are stale. */
function gridHash(g: Grid): number {
  let h = 0x811c9dc5 ^ g.width ^ (g.height << 8);
  const d = g.data;
  for (let i = 0; i < d.length; i++) {
    h = Math.imul(h ^ (d[i] & 0xffff), 0x01000193);
    h = Math.imul(h ^ (d[i] >>> 16), 0x01000193);
  }
  return h >>> 0;
}

const shapeCache = new WeakMap<Grid, Map<string, { hash: number; shapes: Shape[] }>>();

/**
 * Shapes for a grid, cached per grid object and output settings. The pixel
 * hash catches in-place edits, so with many frames only changed ones rebuild.
 */
function cachedShapes(g: Grid, opts: SvgOptions, minimal: boolean): Shape[] {
  const key = `${opts.geometry}|${minimal ? 1 : 0}|${opts.cornerRadius}`;
  const hash = gridHash(g);
  let byKey = shapeCache.get(g);
  if (!byKey) shapeCache.set(g, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit && hit.hash === hash) return hit.shapes;
  const shapes = shapesFor(g, opts, minimal);
  byKey.set(key, { hash, shapes });
  return shapes;
}

/** Root <svg> attributes shared by still and animated output. */
function rootAttrs(g: Grid, opts: SvgOptions, minimal: boolean): string[] {
  const root: string[] = ['xmlns="http://www.w3.org/2000/svg"', `viewBox="0 0 ${g.width} ${g.height}"`];
  if (opts.includeSize) root.push(`width="${Math.max(1, Math.round(opts.width))}"`, `height="${Math.max(1, Math.round(opts.height))}"`);
  if (opts.crispEdges) root.push('shape-rendering="crispEdges"');
  // In minimal mode the evenodd rule moves to the root so it is written once.
  if (opts.geometry === 'paths' && minimal) root.push('fill-rule="evenodd"');
  if (opts.decorative) root.push('aria-hidden="true"');
  else if (opts.title.trim()) root.push('role="img"');
  return root;
}

/** One body item per color: a fill group, or the bare element in minimal output. */
function shapeItems(shapes: Shape[], useCurrent: boolean, minimal: boolean, classFor?: (c: PackedColor) => string): string[] {
  const indent = minimal ? '' : '  ';
  const nl = minimal ? '' : '\n';
  return shapes.map((s) => {
    const fa = fillAttrs(s.color, useCurrent, minimal) + (classFor?.(s.color) ?? '');
    // Put the fill straight on a single element instead of wrapping it.
    if (minimal && s.elements.length === 1) return s.elements[0].replace(/^<(\w+)/, `<$1 ${fa}`);
    return `<g ${fa}>${nl}${s.elements.map((e) => `${indent}${indent}${e}`).join(nl)}${nl}${indent}</g>`;
  });
}

/**
 * Wraps body items in a group one level deeper. Items carry their own inner
 * indentation for depth 1, so every line shifts by one indent.
 */
function wrapGroup(attrs: string, items: string[], minimal: boolean): string {
  const indent = minimal ? '' : '  ';
  const nl = minimal ? '' : '\n';
  if (items.length === 0) return `<g ${attrs}/>`;
  const nest = (item: string) => item.split('\n').map((line, i) => (i === 0 ? indent + indent : indent) + line).join('\n');
  return `<g ${attrs}>${nl}${items.map(nest).join(nl)}${nl}${indent}</g>`;
}

function finish(root: string[], items: string[], minimal: boolean): string {
  const indent = minimal ? '' : '  ';
  const nl = minimal ? '' : '\n';
  const inner = items.map((l) => indent + l).join(nl);
  return `<svg ${root.join(' ')}>${nl}${inner}${inner ? nl : ''}</svg>${minimal ? '' : '\n'}`;
}

/**
 * Converts the grid to an SVG string. Coordinates are integers in grid units.
 * For 'optimized', this returns the minimal form; run it through `optimizeSvg`.
 */
export function gridToSvg(g: Grid, opts: SvgOptions): string {
  const minimal = opts.format !== 'readable';
  const useCurrent = opts.currentColor && canUseCurrentColor(g);
  const title = opts.title.trim();

  const shapes = cachedShapes(g, opts, minimal);
  const anim = opts.animation ?? NO_ANIMATION;
  // A sequence animates each color group as one step; the base color stays still.
  const ranks = anim.kind === 'sequence' ? sequenceRanks(g, anim.order, anim.baseColor) : null;
  // Nothing to move (empty canvas, or only the base color): no stylesheet either.
  const hasMotion = anim.kind !== 'none' && shapes.length > 0 && (!ranks || ranks.size > 0);
  const animClass = hasMotion ? animationPrefix(g, anim) : null;

  const children: string[] = [];
  if (!opts.decorative && title) children.push(`<title>${escapeXml(title)}</title>`);
  if (animClass && anim.kind !== 'none') children.push(`<style>${animationCss(animClass, anim, ranks?.size ?? 0)}</style>`);
  if (opts.includeBackground && opts.background !== 0) {
    children.push(`<rect width="${g.width}" height="${g.height}" ${fillAttrs(opts.background, false, minimal)}/>`);
  }

  const stepClass = (c: PackedColor) => {
    const rank = ranks?.get(c);
    return animClass && rank !== undefined ? ` class="${animClass} ${animClass}-s${rank}"` : '';
  };
  const body = shapeItems(shapes, useCurrent, minimal, ranks ? stepClass : undefined);
  // Whole-icon presets move as one group (sequences animate per color instead).
  const shapesOut = animClass && !ranks ? [wrapGroup(`class="${animClass}"`, body, minimal)] : body;
  return finish(rootAttrs(g, opts, minimal), [...children, ...shapesOut], minimal);
}

/**
 * Frame-by-frame animated SVG: one group per frame, shown in turn by CSS
 * (see frameCss). A single frame produces exactly `gridToSvg` output.
 *
 * Whole-icon presets (spin, pulse, fade, bounce) still apply, wrapping all
 * frames. `sequence` animates the color groups of a still image, so it is
 * ignored when there are several frames.
 */
export function framesToSvg(frames: readonly SvgFrame[], opts: SvgOptions): string {
  if (frames.length === 0) throw new Error('framesToSvg needs at least one frame');
  if (frames.length === 1) return gridToSvg(frames[0].grid, opts);
  const minimal = opts.format !== 'readable';
  const first = frames[0].grid;
  const grids = frames.map((f) => f.grid);
  const durations = frames.map((f) => f.duration);
  const useCurrent = opts.currentColor && canUseCurrentColorAll(grids);
  const title = opts.title.trim();
  const anim = opts.animation ?? NO_ANIMATION;
  const preset = anim.kind !== 'none' && anim.kind !== 'sequence' ? anim : null;
  const cls = animationPrefix(grids, preset ?? NO_ANIMATION, durations);

  const children: string[] = [];
  if (!opts.decorative && title) children.push(`<title>${escapeXml(title)}</title>`);
  children.push(`<style>${frameCss(cls, durations)}${preset ? animationCss(cls, preset) : ''}</style>`);
  if (opts.includeBackground && opts.background !== 0) {
    children.push(`<rect width="${first.width}" height="${first.height}" ${fillAttrs(opts.background, false, minimal)}/>`);
  }

  const groups = frames.map((f, i) =>
    wrapGroup(`class="${cls}-fr ${cls}-f${i}"`, shapeItems(cachedShapes(f.grid, opts, minimal), useCurrent, minimal), minimal),
  );
  const shapesOut = preset ? [wrapGroup(`class="${cls}"`, groups, minimal)] : groups;
  return finish(rootAttrs(first, opts, minimal), [...children, ...shapesOut], minimal);
}

/** currentColor across frames: every drawn cell in every frame is the same color. */
export function canUseCurrentColorAll(grids: readonly Grid[]): boolean {
  let first = 0;
  for (const g of grids) {
    for (let i = 0; i < g.data.length; i++) {
      const c = g.data[i];
      if (c === 0) continue;
      if (first === 0) first = c;
      else if (c !== first) return false;
    }
  }
  return first !== 0;
}
