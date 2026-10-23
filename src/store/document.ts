'use client';

import { create } from 'zustand';
import { DEFAULT_PALETTE, type PackedColor } from '@/core/grid/color';
import { cloneGrid, createGrid, type Grid } from '@/core/grid/grid';
import { type Anchor, replaceColor as replaceColorOp, clearAll, resize } from '@/core/grid/ops';
import { History } from '@/core/history/history';
import { applyPatches, PatchRecorder, type PixelPatch } from '@/core/history/patch';
import { DEFAULT_SVG_OPTIONS, type SvgOptions } from '@/core/svg/generate';
import type { Project } from '@/core/project/project';

export type HistoryEntry =
  | { kind: 'pixels'; label: string; patches: PixelPatch[] }
  | { kind: 'grid'; label: string; before: Grid; after: Grid }
  | { kind: 'palette'; label: string; before: PackedColor[]; after: PackedColor[] };

const history = new History<HistoryEntry>();

export interface DocumentState {
  id: string;
  name: string;
  /** Mutable pixel buffer. Bump `version` after writing to it. */
  grid: Grid;
  /** Increments on every visible grid change; drives SVG memoization and redraws. */
  version: number;
  palette: PackedColor[];
  svg: SvgOptions;
  /** Hand-edited SVG from the code panel; when set it is "forked" from the drawing. */
  manualSvg: string | null;
  canUndo: boolean;
  canRedo: boolean;

  bump: () => void;
  setName: (name: string) => void;
  setSvgOptions: (patch: Partial<SvgOptions>) => void;
  setManualSvg: (svg: string | null) => void;
  /** Push a finished pixel action (one stroke, fill, move...). */
  commitPatches: (patches: PixelPatch[], label: string) => void;
  /** Replace the whole grid (resize, import) as one undoable step. */
  replaceGrid: (next: Grid, label: string) => void;
  resizeCanvas: (width: number, height: number, anchor: Anchor) => void;
  replaceColor: (from: PackedColor, to: PackedColor) => void;
  clearCanvas: () => void;
  setPalette: (palette: PackedColor[], label?: string) => void;
  undo: () => void;
  redo: () => void;
  loadProject: (p: Project, id?: string) => void;
  newProject: (width?: number, height?: number) => void;
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()));

export const useDocument = create<DocumentState>()((set, get) => {
  const syncHistory = () => set({ canUndo: history.canUndo, canRedo: history.canRedo });

  /** Swaps in a grid; the explicit export size follows along when it matched the old grid. */
  const swapGrid = (next: Grid) => {
    const { grid, svg, version } = get();
    const follow = svg.width === grid.width && svg.height === grid.height;
    set({ grid: next, version: version + 1, ...(follow ? { svg: { ...svg, width: next.width, height: next.height } } : {}) });
  };

  const applyEntry = (e: HistoryEntry, dir: 'undo' | 'redo') => {
    const s = get();
    switch (e.kind) {
      case 'pixels':
        applyPatches(s.grid, e.patches, dir);
        set({ version: s.version + 1 });
        break;
      case 'grid':
        swapGrid(cloneGrid(dir === 'undo' ? e.before : e.after));
        break;
      case 'palette':
        set({ palette: [...(dir === 'undo' ? e.before : e.after)] });
        break;
    }
  };

  return {
    id: newId(),
    name: 'Untitled icon',
    grid: createGrid(24, 24),
    version: 0,
    palette: [...DEFAULT_PALETTE],
    svg: { ...DEFAULT_SVG_OPTIONS },
    manualSvg: null,
    canUndo: false,
    canRedo: false,

    bump: () => set((s) => ({ version: s.version + 1 })),
    setName: (name) => set({ name }),
    setSvgOptions: (patch) => set((s) => ({ svg: { ...s.svg, ...patch } })),
    setManualSvg: (manualSvg) => set({ manualSvg }),

    commitPatches: (patches, label) => {
      if (patches.length === 0) return;
      history.push({ kind: 'pixels', label, patches });
      set((s) => ({ version: s.version + 1 }));
      syncHistory();
    },

    replaceGrid: (next, label) => {
      const before = cloneGrid(get().grid);
      history.push({ kind: 'grid', label, before, after: cloneGrid(next) });
      swapGrid(next);
      syncHistory();
    },

    resizeCanvas: (width, height, anchor) => {
      const g = get().grid;
      if (g.width === width && g.height === height) return;
      get().replaceGrid(resize(g, width, height, anchor), 'Resize canvas');
    },

    replaceColor: (from, to) => {
      const rec = new PatchRecorder(get().grid);
      replaceColorOp(rec, from, to);
      get().commitPatches(rec.toPatches(), 'Replace color');
    },

    clearCanvas: () => {
      const rec = new PatchRecorder(get().grid);
      clearAll(rec);
      get().commitPatches(rec.toPatches(), 'Clear canvas');
    },

    setPalette: (palette, label = 'Edit palette') => {
      const before = get().palette;
      history.push({ kind: 'palette', label, before: [...before], after: [...palette] });
      set({ palette: [...palette] });
      syncHistory();
    },

    undo: () => {
      const e = history.undo();
      if (e) applyEntry(e, 'undo');
      syncHistory();
    },

    redo: () => {
      const e = history.redo();
      if (e) applyEntry(e, 'redo');
      syncHistory();
    },

    loadProject: (p, id) => {
      history.clear();
      set((s) => ({
        id: id ?? newId(),
        name: p.name,
        grid: cloneGrid(p.grid),
        palette: p.palette.length ? [...p.palette] : [...DEFAULT_PALETTE],
        svg: { ...DEFAULT_SVG_OPTIONS, ...p.svg },
        manualSvg: null,
        version: s.version + 1,
      }));
      syncHistory();
    },

    newProject: (width = 24, height = 24) => {
      history.clear();
      set((s) => ({
        id: newId(),
        name: 'Untitled icon',
        grid: createGrid(width, height),
        palette: [...DEFAULT_PALETTE],
        svg: { ...DEFAULT_SVG_OPTIONS, width, height },
        manualSvg: null,
        version: s.version + 1,
      }));
      syncHistory();
    },
  };
});

export function currentProject(): Project {
  const s = useDocument.getState();
  return { name: s.name, grid: cloneGrid(s.grid), palette: [...s.palette], svg: { ...s.svg } };
}
