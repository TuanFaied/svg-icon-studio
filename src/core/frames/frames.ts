import { cloneGrid, createGrid, type Grid } from '../grid/grid';

/**
 * Frame-by-frame animation. A document is an ordered list of frames that all
 * share one grid size; a single-frame document behaves like a still icon.
 */

export interface FrameData {
  grid: Grid;
  /** Milliseconds this frame stays on screen. */
  duration: number;
}

export interface Frame extends FrameData {
  /** Stable id so history entries survive reordering. */
  id: string;
}

export const DEFAULT_FRAME_MS = 100;
export const MIN_FRAME_MS = 20;
export const MAX_FRAME_MS = 5000;
export const MAX_FRAMES = 64;

let counter = 0;
export const newFrameId = () => `f${Date.now().toString(36)}${(counter++).toString(36)}`;

export function clampDuration(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_FRAME_MS;
  return Math.min(MAX_FRAME_MS, Math.max(MIN_FRAME_MS, Math.round(ms)));
}

export function makeFrame(grid: Grid, duration = DEFAULT_FRAME_MS): Frame {
  return { id: newFrameId(), grid, duration: clampDuration(duration) };
}

export function blankFrameLike(f: FrameData): Frame {
  return makeFrame(createGrid(f.grid.width, f.grid.height), f.duration);
}

export function duplicateFrame(f: FrameData): Frame {
  return makeFrame(cloneGrid(f.grid), f.duration);
}

/** Total loop length in ms. */
export const totalDuration = (frames: readonly FrameData[]) => frames.reduce((t, f) => t + f.duration, 0);

/** Frames per second → per-frame duration in ms (and back), clamped to the limits. */
export const fpsToMs = (fps: number) => clampDuration(1000 / Math.max(0.2, fps));
export const msToFps = (ms: number) => Math.round((1000 / ms) * 10) / 10;

/** Moves the item at `from` to `to`, returning a new array. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const out = [...items];
  if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) return out;
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}
