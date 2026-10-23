import type { PackedColor } from '../grid/color';
import type { Grid } from '../grid/grid';

export interface PixelPatch {
  index: number;
  before: PackedColor;
  after: PackedColor;
}

/**
 * Records every cell write made during one user action so the action can be
 * undone as a single patch list. Repeated writes to the same cell keep the
 * original `before` value.
 */
export class PatchRecorder {
  private readonly changes = new Map<number, [PackedColor, PackedColor]>();

  constructor(readonly grid: Grid) {}

  write(index: number, color: PackedColor): boolean {
    const data = this.grid.data;
    const prev = data[index];
    if (prev === color) return false;
    const existing = this.changes.get(index);
    if (existing) existing[1] = color;
    else this.changes.set(index, [prev, color]);
    data[index] = color;
    return true;
  }

  get size(): number {
    return this.changes.size;
  }

  /** Revert everything recorded so far (used to redraw shape previews). */
  revert(): void {
    for (const [i, [before]] of this.changes) this.grid.data[i] = before;
    this.changes.clear();
  }

  toPatches(): PixelPatch[] {
    const out: PixelPatch[] = [];
    for (const [index, [before, after]] of this.changes) {
      if (before !== after) out.push({ index, before, after });
    }
    return out;
  }
}

export function applyPatches(grid: Grid, patches: readonly PixelPatch[], direction: 'undo' | 'redo'): void {
  const d = grid.data;
  if (direction === 'undo') for (const p of patches) d[p.index] = p.before;
  else for (const p of patches) d[p.index] = p.after;
}
