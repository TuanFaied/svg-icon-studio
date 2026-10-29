import { pack, type PackedColor, toHexRGB } from '../grid/color';
import type { Grid } from '../grid/grid';

/**
 * Whole-icon animation presets, exported as CSS @keyframes inside the SVG.
 * Every value written into CSS is a clamped number or a fixed enum string, so
 * generated stylesheets always pass the sanitizer's animation validator.
 *
 * `sequence` is the exception to "whole icon": each color group becomes one
 * step and they light up in turn (chasing-dot and segmented-ring loaders).
 */

export type Easing = 'linear' | 'ease-in-out' | 'steps';
export type Direction = 'normal' | 'reverse' | 'alternate';
/** How each step of a color sequence animates. */
export type SequenceEffect = 'fade' | 'pop' | 'highlight';
/** Which color goes first: drawing order, or by angle around the center starting at 12 o'clock. */
export type SequenceOrder = 'appearance' | 'clockwise' | 'counterclockwise';

export interface AnimationTiming {
  /** Seconds per cycle. */
  duration: number;
  easing: Easing;
  /** Step count when easing is 'steps'. */
  steps: number;
  direction: Direction;
  /** 0 means infinite. */
  iterations: number;
  /** Seconds before the first cycle. */
  delay: number;
}

export type AnimationOptions =
  | { kind: 'none' }
  | ({ kind: 'spin'; clockwise: boolean } & AnimationTiming)
  | ({ kind: 'pulse'; /** Peak scale, e.g. 1.15. */ scale: number } & AnimationTiming)
  | ({ kind: 'fade'; /** Lowest opacity, 0–1. */ minOpacity: number } & AnimationTiming)
  | ({ kind: 'bounce'; /** Lift in grid cells. */ height: number } & AnimationTiming)
  | ({
      kind: 'sequence';
      effect: SequenceEffect;
      order: SequenceOrder;
      /** A color that stays still (e.g. a track ring); null animates every color. */
      baseColor: PackedColor | null;
      /** Fade effect: opacity a step falls back to, 0–1. */
      minOpacity: number;
      /** Pop effect: peak scale of a step. */
      scale: number;
      /** Highlight effect: color a step flashes before settling back to its own. Alpha is ignored. */
      highlightColor: PackedColor;
    } & AnimationTiming);

export type AnimationKind = AnimationOptions['kind'];
export type ActiveAnimation = Exclude<AnimationOptions, { kind: 'none' }>;

export const ANIMATION_KINDS: AnimationKind[] = ['none', 'spin', 'pulse', 'fade', 'bounce', 'sequence'];

export const NO_ANIMATION: AnimationOptions = { kind: 'none' };

export const LIMITS = {
  duration: [0.2, 5],
  steps: [2, 24],
  iterations: [0, 99],
  delay: [0, 5],
  scale: [1.02, 1.6],
  minOpacity: [0, 0.95],
  height: [0.5, 8],
} as const;

const DEFAULT_TIMING: AnimationTiming = { duration: 1, easing: 'ease-in-out', steps: 8, direction: 'normal', iterations: 0, delay: 0 };

/** Sensible starting values for each preset; spin defaults to stepped timing for crisp pixels. */
export function defaultAnimation(kind: AnimationKind, keep?: Partial<AnimationTiming>): AnimationOptions {
  const timing = { ...DEFAULT_TIMING, ...keep };
  switch (kind) {
    case 'none':
      return NO_ANIMATION;
    case 'spin':
      return { kind, clockwise: true, ...timing, ...(keep ? {} : { easing: 'steps', steps: 8, duration: 1.2 }) };
    case 'pulse':
      return { kind, scale: 1.15, ...timing };
    case 'fade':
      return { kind, minOpacity: 0.3, ...timing, ...(keep ? {} : { duration: 1.4 }) };
    case 'bounce':
      return { kind, height: 2, ...timing, ...(keep ? {} : { duration: 0.8 }) };
    case 'sequence':
      return {
        kind, effect: 'fade', order: 'clockwise', baseColor: null, minOpacity: 0.2, scale: 1.3, highlightColor: pack(255, 255, 255),
        ...timing, ...(keep ? {} : { easing: 'linear', duration: 1 }),
      };
  }
}

/** The timing fields of an animation, if it has any. */
export function timingOf(a: AnimationOptions): AnimationTiming | undefined {
  if (a.kind === 'none') return undefined;
  const { duration, easing, steps, direction, iterations, delay } = a;
  return { duration, easing, steps, direction, iterations, delay };
}

const clamp = (v: unknown, [lo, hi]: readonly [number, number], fallback: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  (options as readonly unknown[]).includes(v) ? (v as T) : fallback;

/** A packed color from untrusted input, or null. */
function validColor(v: unknown): PackedColor | null {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 0xffffffff ? v : null;
}

/** Coerces untrusted input (project files, old settings) into valid options. */
export function normalizeAnimation(input: unknown): AnimationOptions {
  if (!input || typeof input !== 'object') return NO_ANIMATION;
  const r = input as Record<string, unknown>;
  const kind = oneOf(r.kind, ANIMATION_KINDS, 'none');
  if (kind === 'none') return NO_ANIMATION;
  const base = defaultAnimation(kind) as ActiveAnimation;
  const timing: AnimationTiming = {
    duration: clamp(r.duration, LIMITS.duration, base.duration),
    easing: oneOf(r.easing, ['linear', 'ease-in-out', 'steps'] as const, base.easing),
    steps: Math.round(clamp(r.steps, LIMITS.steps, base.steps)),
    direction: oneOf(r.direction, ['normal', 'reverse', 'alternate'] as const, base.direction),
    iterations: Math.round(clamp(r.iterations, LIMITS.iterations, base.iterations)),
    delay: clamp(r.delay, LIMITS.delay, base.delay),
  };
  switch (kind) {
    case 'spin':
      return { kind, clockwise: typeof r.clockwise === 'boolean' ? r.clockwise : true, ...timing };
    case 'pulse':
      return { kind, scale: clamp(r.scale, LIMITS.scale, 1.15), ...timing };
    case 'fade':
      return { kind, minOpacity: clamp(r.minOpacity, LIMITS.minOpacity, 0.3), ...timing };
    case 'bounce':
      return { kind, height: clamp(r.height, LIMITS.height, 2), ...timing };
    case 'sequence': {
      const bc = r.baseColor;
      return {
        kind,
        effect: oneOf(r.effect, ['fade', 'pop', 'highlight'] as const, 'fade'),
        order: oneOf(r.order, ['appearance', 'clockwise', 'counterclockwise'] as const, 'clockwise'),
        baseColor: validColor(bc),
        minOpacity: clamp(r.minOpacity, LIMITS.minOpacity, 0.2),
        scale: clamp(r.scale, LIMITS.scale, 1.3),
        highlightColor: validColor(r.highlightColor) ?? pack(255, 255, 255),
        ...timing,
      };
    }
  }
}

/** Short number formatting for CSS: no trailing zeros, at most 3 decimals. */
const num = (n: number) => String(Math.round(n * 1000) / 1000);

/**
 * FNV-1a over the pixels and animation settings: same icon, same prefix;
 * different icons differ. With several frames, every frame's pixels and
 * duration count (a single frame hashes exactly as a still icon).
 */
export function animationPrefix(grids: Grid | readonly Grid[], a: AnimationOptions, durations: readonly number[] = []): string {
  let h = 0x811c9dc5;
  const mix = (n: number) => {
    h ^= n & 0xffff;
    h = Math.imul(h, 0x01000193);
    h ^= n >>> 16;
    h = Math.imul(h, 0x01000193);
  };
  const list = Array.isArray(grids) ? (grids as readonly Grid[]) : [grids as Grid];
  for (const g of list) {
    mix(g.width);
    mix(g.height);
    for (let i = 0; i < g.data.length; i++) mix(g.data[i]);
  }
  if (list.length > 1) for (const d of durations) mix(Math.round(d));
  for (const ch of JSON.stringify(a)) mix(ch.charCodeAt(0));
  return `sis-${(h >>> 0).toString(16).padStart(8, '0').slice(0, 6)}`;
}

function keyframes(a: ActiveAnimation): string {
  switch (a.kind) {
    case 'spin':
      return `from{transform:rotate(0deg)}to{transform:rotate(${a.clockwise ? 360 : -360}deg)}`;
    case 'pulse':
      return `0%,100%{transform:scale(1)}50%{transform:scale(${num(a.scale)})}`;
    case 'fade':
      return `0%,100%{opacity:1}50%{opacity:${num(a.minOpacity)}}`;
    case 'bounce':
      // In SVG, CSS px in a transform are user units, i.e. grid cells.
      return `0%,100%{transform:translateY(0px)}50%{transform:translateY(${num(-a.height)}px)}`;
    case 'sequence':
      // A step flares at the start of its turn, then settles for the rest of the cycle.
      if (a.effect === 'fade') return `0%{opacity:1}100%{opacity:${num(a.minOpacity)}}`;
      if (a.effect === 'pop') return `0%{transform:scale(${num(a.scale)})}50%,100%{transform:scale(1)}`;
      // No end keyframe: CSS falls back to each step's own fill, so one shared
      // animation returns every step to its own color.
      return `0%{fill:${toHexRGB(a.highlightColor)}}`;
  }
}

function timingFunction(a: ActiveAnimation): string {
  if (a.easing === 'steps') return `steps(${Math.round(a.steps)})`;
  return a.easing;
}

/**
 * CSS for one animated icon. For whole-icon presets, `cls` goes on the group
 * that wraps all shapes and transforms pivot on the viewBox center.
 *
 * For `sequence`, `cls` plus `${cls}-s<rank>` go on each animated color group
 * (`stepCount` of them). Steps share one animation, offset by negative delays
 * spaced evenly over a cycle so every step is already mid-cycle at load.
 * Pop scales each group around its own box.
 */
export function animationCss(cls: string, a: ActiveAnimation, stepCount = 0): string {
  const name = `${cls}-${a.kind}`;
  const iterations = a.iterations <= 0 ? 'infinite' : String(Math.round(a.iterations));
  const anim = `${name} ${num(a.duration)}s ${timingFunction(a)} ${num(a.delay)}s ${iterations} ${a.direction}`;
  const box = a.kind === 'sequence' ? 'fill-box' : 'view-box';
  const rules = [`.${cls}{transform-box:${box};transform-origin:center;animation:${anim}}`];
  if (a.kind === 'sequence') {
    for (let i = 0; i < stepCount; i++) {
      rules.push(`.${cls}-s${i}{animation-delay:${num(a.delay + (i / stepCount - 1) * a.duration)}s}`);
    }
  }
  rules.push(`@keyframes ${name}{${keyframes(a)}}`, `@media (prefers-reduced-motion:reduce){.${cls}{animation:none}}`);
  return rules.join('');
}

/**
 * Step rank for each animated color in a `sequence`, keyed by color.
 * 'appearance' follows first appearance in row-major order (the order shapes
 * are written); 'clockwise' / 'counterclockwise' sort by the angle of each
 * color's centroid around the grid center, starting at 12 o'clock.
 * The base color, if any, is left out and stays still.
 */
export function sequenceRanks(g: Grid, order: SequenceOrder, baseColor: PackedColor | null): Map<PackedColor, number> {
  const stats = new Map<PackedColor, { first: number; sx: number; sy: number; n: number }>();
  for (let i = 0; i < g.data.length; i++) {
    const c = g.data[i];
    if (c === 0 || c === baseColor) continue;
    const x = (i % g.width) + 0.5;
    const y = Math.floor(i / g.width) + 0.5;
    const st = stats.get(c);
    if (st) {
      st.sx += x;
      st.sy += y;
      st.n++;
    } else stats.set(c, { first: i, sx: x, sy: y, n: 1 });
  }
  const cx = g.width / 2;
  const cy = g.height / 2;
  // Screen y points down, so increasing atan2 angle runs clockwise; +90° puts 12 o'clock at 0.
  const clockAngle = (st: { sx: number; sy: number; n: number }) => {
    const deg = (Math.atan2(st.sy / st.n - cy, st.sx / st.n - cx) * 180) / Math.PI;
    return (deg + 90 + 360) % 360;
  };
  const entries = [...stats.entries()];
  const key = (e: (typeof entries)[number]) =>
    order === 'appearance' ? e[1].first : order === 'clockwise' ? clockAngle(e[1]) : (360 - clockAngle(e[1])) % 360;
  entries.sort((p, q) => key(p) - key(q) || p[1].first - q[1].first);
  return new Map(entries.map(([c], rank) => [c, rank]));
}

/**
 * CSS that shows one frame group at a time. Every frame group carries
 * `${cls}-fr` plus `${cls}-f<i>`; each gets its own keyframes that hold opacity
 * 1 during its time window and 0 otherwise, with `steps(1)` so values switch
 * instead of fading. Frames after the first start hidden, so reduced motion
 * (and any context that ignores CSS animation) shows frame 0.
 */
export function frameCss(cls: string, durationsMs: readonly number[]): string {
  const total = durationsMs.reduce((t, d) => t + d, 0);
  const pct = (ms: number) => `${num((ms / total) * 100)}%`;
  const rules = [`.${cls}-fr{animation-duration:${num(total / 1000)}s;animation-timing-function:steps(1);animation-iteration-count:infinite}`];
  let start = 0;
  durationsMs.forEach((d, i) => {
    const end = start + d;
    const name = `${cls}-k${i}`;
    rules.push(`.${cls}-f${i}{${i > 0 ? 'opacity:0;' : ''}animation-name:${name}}`);
    const frames: string[] = [];
    if (start > 0) frames.push('0%{opacity:0}');
    frames.push(`${pct(start)}{opacity:1}`);
    if (end < total) frames.push(`${pct(end)}{opacity:0}`, '100%{opacity:0}');
    else frames.push('100%{opacity:1}');
    rules.push(`@keyframes ${name}{${frames.join('')}}`);
    start = end;
  });
  rules.push(`@media (prefers-reduced-motion:reduce){.${cls}-fr{animation:none}}`);
  return rules.join('');
}
