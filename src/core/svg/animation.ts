import type { Grid } from '../grid/grid';

/**
 * Whole-icon animation presets, exported as CSS @keyframes inside the SVG.
 * Every value written into CSS is a clamped number or a fixed enum string, so
 * generated stylesheets always pass the sanitizer's animation validator.
 */

export type Easing = 'linear' | 'ease-in-out' | 'steps';
export type Direction = 'normal' | 'reverse' | 'alternate';

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
  | ({ kind: 'bounce'; /** Lift in grid cells. */ height: number } & AnimationTiming);

export type AnimationKind = AnimationOptions['kind'];
export type ActiveAnimation = Exclude<AnimationOptions, { kind: 'none' }>;

export const ANIMATION_KINDS: AnimationKind[] = ['none', 'spin', 'pulse', 'fade', 'bounce'];

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
  }
}

/** Short number formatting for CSS: no trailing zeros, at most 3 decimals. */
const num = (n: number) => String(Math.round(n * 1000) / 1000);

/** FNV-1a over the pixels and animation settings: same icon, same prefix; different icons differ. */
export function animationPrefix(g: Grid, a: AnimationOptions): string {
  let h = 0x811c9dc5;
  const mix = (n: number) => {
    h ^= n & 0xffff;
    h = Math.imul(h, 0x01000193);
    h ^= n >>> 16;
    h = Math.imul(h, 0x01000193);
  };
  mix(g.width);
  mix(g.height);
  for (let i = 0; i < g.data.length; i++) mix(g.data[i]);
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
  }
}

function timingFunction(a: ActiveAnimation): string {
  if (a.easing === 'steps') return `steps(${Math.round(a.steps)})`;
  return a.easing;
}

/**
 * CSS for one animated icon. `cls` is applied to the group that wraps all shapes.
 * Transforms pivot on the center of the viewBox.
 */
export function animationCss(cls: string, a: ActiveAnimation): string {
  const name = `${cls}-${a.kind}`;
  const iterations = a.iterations <= 0 ? 'infinite' : String(Math.round(a.iterations));
  const anim = `${name} ${num(a.duration)}s ${timingFunction(a)} ${num(a.delay)}s ${iterations} ${a.direction}`;
  return [
    `.${cls}{transform-box:view-box;transform-origin:center;animation:${anim}}`,
    `@keyframes ${name}{${keyframes(a)}}`,
    `@media (prefers-reduced-motion:reduce){.${cls}{animation:none}}`,
  ].join('');
}
