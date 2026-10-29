import { pack, type PackedColor } from '../grid/color';
import { createGrid, type Grid } from '../grid/grid';
import { type AnimationOptions, defaultAnimation } from '../svg/animation';

/**
 * Starter loader templates: each builds a grid, palette and animation at a
 * given size, so the user can load one and then tweak pixels and colors.
 */

export type TemplateId = 'ring-spinner' | 'chasing-dots' | 'three-dot-pulse' | 'bar-loader';
export type TemplateSize = 16 | 24 | 32;

export const TEMPLATE_SIZES: TemplateSize[] = [16, 24, 32];

export interface Template {
  id: TemplateId;
  name: string;
  grid: Grid;
  palette: PackedColor[];
  animation: AnimationOptions;
}

export interface TemplateInfo {
  id: TemplateId;
  name: string;
  description: string;
}

export const TEMPLATES: TemplateInfo[] = [
  { id: 'ring-spinner', name: 'Ring spinner', description: 'A ring with a highlighted arc, stepped spin' },
  { id: 'chasing-dots', name: 'Chasing dots', description: '8 dots that light up clockwise' },
  { id: 'three-dot-pulse', name: 'Three-dot pulse', description: 'Three dots that pop left to right' },
  { id: 'bar-loader', name: 'Bar loader', description: 'Segments that light up left to right' },
];

const ACCENT: [number, number, number] = [37, 99, 235];
const TRACK = pack(219, 234, 254);

/**
 * Distinct, nearly identical shades of the accent color. A sequence needs one
 * color per step; the differences are too small to see.
 */
export function stepShades(n: number): PackedColor[] {
  return Array.from({ length: n }, (_, i) => pack(ACCENT[0] + i, ACCENT[1] + i, ACCENT[2] - i));
}

function fillRect(g: Grid, x: number, y: number, w: number, h: number, c: PackedColor): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (xx >= 0 && yy >= 0 && xx < g.width && yy < g.height) g.data[yy * g.width + xx] = c;
    }
  }
}

/** Angle of a point around the center, clockwise from 12 o'clock, in degrees [0, 360). */
function clockAngle(dx: number, dy: number): number {
  return ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
}

function ringSpinner(size: TemplateSize): Template {
  const g = createGrid(size, size);
  const c = size / 2;
  const outer = c - 1;
  const thickness = Math.max(2, Math.round(size / 8));
  const arc = pack(...ACCENT);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const d = Math.hypot(dx, dy);
      if (d <= outer && d >= outer - thickness) g.data[y * size + x] = clockAngle(dx, dy) < 90 ? arc : TRACK;
    }
  }
  return {
    id: 'ring-spinner',
    name: 'Ring spinner',
    grid: g,
    palette: [arc, TRACK],
    animation: { ...(defaultAnimation('spin') as Extract<AnimationOptions, { kind: 'spin' }>), duration: 1, easing: 'steps', steps: 8 },
  };
}

function chasingDots(size: TemplateSize): Template {
  const g = createGrid(size, size);
  const dot = size >= 32 ? 3 : size >= 24 ? 2 : 1;
  const c = size / 2;
  const radius = c - dot / 2 - 1;
  const shades = stepShades(8);
  shades.forEach((shade, k) => {
    const theta = (k * Math.PI) / 4;
    const cx = c + radius * Math.sin(theta);
    const cy = c - radius * Math.cos(theta);
    fillRect(g, Math.round(cx - dot / 2), Math.round(cy - dot / 2), dot, dot, shade);
  });
  return {
    id: 'chasing-dots',
    name: 'Chasing dots',
    grid: g,
    palette: shades,
    animation: {
      ...(defaultAnimation('sequence') as Extract<AnimationOptions, { kind: 'sequence' }>),
      effect: 'fade', order: 'clockwise', minOpacity: 0.15, duration: 1, easing: 'linear',
    },
  };
}

function threeDotPulse(size: TemplateSize): Template {
  const g = createGrid(size, size);
  const dot = size >= 32 ? 6 : size >= 24 ? 4 : 3;
  const gap = size >= 32 ? 4 : size >= 24 ? 3 : 2;
  const total = dot * 3 + gap * 2;
  const x0 = Math.floor((size - total) / 2);
  const y0 = Math.floor((size - dot) / 2);
  const shades = stepShades(3);
  shades.forEach((shade, k) => fillRect(g, x0 + k * (dot + gap), y0, dot, dot, shade));
  return {
    id: 'three-dot-pulse',
    name: 'Three-dot pulse',
    grid: g,
    palette: shades,
    animation: {
      ...(defaultAnimation('sequence') as Extract<AnimationOptions, { kind: 'sequence' }>),
      effect: 'pop', order: 'appearance', scale: 1.35, duration: 1.2, easing: 'ease-in-out',
    },
  };
}

function barLoader(size: TemplateSize): Template {
  const g = createGrid(size, size);
  const segments = 5;
  const w = size >= 32 ? 4 : size >= 24 ? 3 : 2;
  const gap = size >= 32 ? 2 : 1;
  const h = Math.max(2, Math.round(size / 4));
  const total = segments * w + (segments - 1) * gap;
  const x0 = Math.floor((size - total) / 2);
  const y0 = Math.floor((size - h) / 2);
  const shades = stepShades(segments);
  shades.forEach((shade, k) => fillRect(g, x0 + k * (w + gap), y0, w, h, shade));
  return {
    id: 'bar-loader',
    name: 'Bar loader',
    grid: g,
    palette: shades,
    animation: {
      ...(defaultAnimation('sequence') as Extract<AnimationOptions, { kind: 'sequence' }>),
      effect: 'fade', order: 'appearance', minOpacity: 0.25, duration: 1.2, easing: 'linear',
    },
  };
}

export function buildTemplate(id: TemplateId, size: TemplateSize): Template {
  switch (id) {
    case 'ring-spinner':
      return ringSpinner(size);
    case 'chasing-dots':
      return chasingDots(size);
    case 'three-dot-pulse':
      return threeDotPulse(size);
    case 'bar-loader':
      return barLoader(size);
  }
}
