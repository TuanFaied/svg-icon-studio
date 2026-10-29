'use client';

import { create } from 'zustand';
import { DEFAULT_PALETTE, type PackedColor } from '@/core/grid/color';
import {
  blankFrameLike, clampDuration, DEFAULT_FRAME_MS, duplicateFrame, type Frame, makeFrame, MAX_FRAMES, moveItem,
} from '@/core/frames/frames';
import { cloneGrid, createGrid, type Grid } from '@/core/grid/grid';
import { type Anchor, replaceColor as replaceColorOp, clearAll, resize } from '@/core/grid/ops';
import { History } from '@/core/history/history';
import { applyPatches, PatchRecorder, type PixelPatch } from '@/core/history/patch';
import { DEFAULT_SVG_OPTIONS, type SvgOptions } from '@/core/svg/generate';
import type { Project } from '@/core/project/project';

/** Everything a template (or any whole-document swap) replaces, for one undo step. */
export interface DocumentSnapshot {
  id: string;
  name: string;
  frames: Frame[];
  frameIndex: number;
  palette: PackedColor[];
  svg: SvgOptions;
  manualSvg: string | null;
}

/** The frame list and selection, as stored in history. Frames are shared, not copied. */
interface FrameState {
  frames: Frame[];
  index: number;
}

export type HistoryEntry =
  /** Pixel edits, each tied to a frame by id so they survive reordering. */
  | { kind: 'pixels'; label: string; edits: Array<{ frameId: string; patches: PixelPatch[] }> }
  /** Add / duplicate / delete / reorder / retime / resize frames. */
  | { kind: 'frames'; label: string; before: FrameState; after: FrameState }
  | { kind: 'palette'; label: string; before: PackedColor[]; after: PackedColor[] }
  | { kind: 'document'; label: string; before: DocumentSnapshot; after: DocumentSnapshot };

const history = new History<HistoryEntry>();

export interface ReplaceDocumentInput {
  name: string;
  grid: Grid;
  palette: PackedColor[];
  svg: SvgOptions;
}

export interface DocumentState {
  id: string;
  name: string;
  /** All frames; every grid has the same size. */
  frames: Frame[];
  frameIndex: number;
  /** The current frame's mutable pixel buffer (frames[frameIndex].grid). Bump `version` after writing to it. */
  grid: Grid;
  /** Increments on every visible change to any frame; drives SVG memoization and redraws. */
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
  /** Push a finished pixel action on the current frame (one stroke, fill, move...). */
  commitPatches: (patches: PixelPatch[], label: string) => void;
  /** Replace the drawing with one image (e.g. a pixel-art import) as one undoable step. */
  replaceGrid: (next: Grid, label: string) => void;
  resizeCanvas: (width: number, height: number, anchor: Anchor) => void;
  /** Recolors in every frame, as one undo step. */
  replaceColor: (from: PackedColor, to: PackedColor) => void;
  /** Clears every frame, as one undo step. */
  clearCanvas: () => void;
  setPalette: (palette: PackedColor[], label?: string) => void;

  selectFrame: (index: number) => void;
  addFrame: () => void;
  duplicateCurrentFrame: () => void;
  deleteCurrentFrame: () => void;
  moveFrame: (from: number, to: number) => void;
  setFrameDuration: (index: number, ms: number) => void;
  setAllFrameDurations: (ms: number) => void;

  undo: () => void;
  redo: () => void;
  loadProject: (p: Project, id?: string) => void;
  newProject: (width?: number, height?: number) => void;
  /**
   * Swaps in a whole new document (e.g. a template) as one undoable step. It gets
   * a fresh project id, so the previous project keeps its own autosave / Recent
   * entry; undo restores the previous id too.
   */
  replaceDocument: (next: ReplaceDocumentInput, label: string) => void;
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()));

const cloneFrames = (frames: readonly Frame[]): Frame[] => frames.map((f) => ({ ...f, grid: cloneGrid(f.grid) }));

export const useDocument = create<DocumentState>()((set, get) => {
  const syncHistory = () => set({ canUndo: history.canUndo, canRedo: history.canRedo });

  /**
   * Installs a frame list and selection. When the grid size changes, the
   * explicit export size follows along if it matched the old grid.
   */
  const setFrameState = (frames: Frame[], index: number) => {
    const { grid, svg, version } = get();
    const i = Math.max(0, Math.min(frames.length - 1, index));
    const next = frames[i].grid;
    const resized = next.width !== grid.width || next.height !== grid.height;
    const follow = resized && svg.width === grid.width && svg.height === grid.height;
    set({ frames, frameIndex: i, grid: next, version: version + 1, ...(follow ? { svg: { ...svg, width: next.width, height: next.height } } : {}) });
  };

  const frameState = (): FrameState => ({ frames: get().frames, index: get().frameIndex });

  /** Pushes a frame-list change and applies it. */
  const commitFrames = (label: string, frames: Frame[], index: number) => {
    const before = frameState();
    history.push({ kind: 'frames', label, before, after: { frames, index } });
    setFrameState(frames, index);
    syncHistory();
  };

  const applyEntry = (e: HistoryEntry, dir: 'undo' | 'redo') => {
    switch (e.kind) {
      case 'pixels': {
        const { frames, frameIndex } = get();
        let show = frameIndex;
        let touchedCurrent = false;
        for (const edit of e.edits) {
          const i = frames.findIndex((f) => f.id === edit.frameId);
          if (i < 0) continue;
          applyPatches(frames[i].grid, edit.patches, dir);
          if (i === frameIndex) touchedCurrent = true;
          else if (!touchedCurrent) show = i;
        }
        // Jump to the edited frame so the change is visible.
        setFrameState(frames, touchedCurrent ? frameIndex : show);
        break;
      }
      case 'frames': {
        const s = dir === 'undo' ? e.before : e.after;
        setFrameState(s.frames, s.index);
        break;
      }
      case 'palette':
        set({ palette: [...(dir === 'undo' ? e.before : e.after)] });
        break;
      case 'document':
        restoreSnapshot(dir === 'undo' ? e.before : e.after);
        break;
    }
  };

  const snapshot = (): DocumentSnapshot => {
    const s = get();
    return { id: s.id, name: s.name, frames: cloneFrames(s.frames), frameIndex: s.frameIndex, palette: [...s.palette], svg: { ...s.svg }, manualSvg: s.manualSvg };
  };

  const restoreSnapshot = (d: DocumentSnapshot) => {
    const frames = cloneFrames(d.frames);
    set((s) => ({
      id: d.id,
      name: d.name,
      frames,
      frameIndex: d.frameIndex,
      grid: frames[d.frameIndex].grid,
      palette: [...d.palette],
      svg: { ...d.svg },
      manualSvg: d.manualSvg,
      version: s.version + 1,
    }));
  };

  /** Runs an edit on every frame and records it as one pixel step. */
  const editAllFrames = (label: string, edit: (rec: PatchRecorder) => void) => {
    const edits = get().frames.map((f) => {
      const rec = new PatchRecorder(f.grid);
      edit(rec);
      return { frameId: f.id, patches: rec.toPatches() };
    }).filter((x) => x.patches.length > 0);
    if (edits.length === 0) return;
    history.push({ kind: 'pixels', label, edits });
    set((s) => ({ version: s.version + 1 }));
    syncHistory();
  };

  const firstFrame = makeFrame(createGrid(24, 24));

  return {
    id: newId(),
    name: 'Untitled icon',
    frames: [firstFrame],
    frameIndex: 0,
    grid: firstFrame.grid,
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
      const { frames, frameIndex } = get();
      history.push({ kind: 'pixels', label, edits: [{ frameId: frames[frameIndex].id, patches }] });
      set((s) => ({ version: s.version + 1 }));
      syncHistory();
    },

    replaceGrid: (next, label) => {
      const { frames, frameIndex } = get();
      commitFrames(label, [makeFrame(next, frames[frameIndex].duration)], 0);
    },

    resizeCanvas: (width, height, anchor) => {
      const g = get().grid;
      if (g.width === width && g.height === height) return;
      // Same frame ids, new grids: earlier pixel steps still find their frame after undo.
      const frames = get().frames.map((f) => ({ ...f, grid: resize(f.grid, width, height, anchor) }));
      commitFrames('Resize canvas', frames, get().frameIndex);
    },

    replaceColor: (from, to) => editAllFrames('Replace color', (rec) => replaceColorOp(rec, from, to)),

    clearCanvas: () => editAllFrames('Clear canvas', (rec) => clearAll(rec)),

    setPalette: (palette, label = 'Edit palette') => {
      const before = get().palette;
      history.push({ kind: 'palette', label, before: [...before], after: [...palette] });
      set({ palette: [...palette] });
      syncHistory();
    },

    selectFrame: (index) => {
      const { frames, frameIndex } = get();
      if (index === frameIndex || index < 0 || index >= frames.length) return;
      setFrameState(frames, index);
    },

    addFrame: () => {
      const { frames, frameIndex } = get();
      if (frames.length >= MAX_FRAMES) return;
      const next = [...frames];
      next.splice(frameIndex + 1, 0, blankFrameLike(frames[frameIndex]));
      commitFrames('Add frame', next, frameIndex + 1);
    },

    duplicateCurrentFrame: () => {
      const { frames, frameIndex } = get();
      if (frames.length >= MAX_FRAMES) return;
      const next = [...frames];
      next.splice(frameIndex + 1, 0, duplicateFrame(frames[frameIndex]));
      commitFrames('Duplicate frame', next, frameIndex + 1);
    },

    deleteCurrentFrame: () => {
      const { frames, frameIndex } = get();
      if (frames.length <= 1) return;
      commitFrames('Delete frame', frames.filter((_, i) => i !== frameIndex), Math.min(frameIndex, frames.length - 2));
    },

    moveFrame: (from, to) => {
      const { frames, frameIndex } = get();
      if (from === to || to < 0 || to >= frames.length) return;
      const moved = moveItem(frames, from, to);
      const current = frames[frameIndex].id;
      commitFrames('Reorder frames', moved, moved.findIndex((f) => f.id === current));
    },

    setFrameDuration: (index, ms) => {
      const { frames, frameIndex } = get();
      const d = clampDuration(ms);
      if (!frames[index] || frames[index].duration === d) return;
      commitFrames('Frame duration', frames.map((f, i) => (i === index ? { ...f, duration: d } : f)), frameIndex);
    },

    setAllFrameDurations: (ms) => {
      const { frames, frameIndex } = get();
      const d = clampDuration(ms);
      if (frames.every((f) => f.duration === d)) return;
      commitFrames('Frame rate', frames.map((f) => ({ ...f, duration: d })), frameIndex);
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
      const frames = (p.frames?.length ? p.frames : [{ grid: p.grid, duration: DEFAULT_FRAME_MS }]).map((f) => makeFrame(cloneGrid(f.grid), f.duration));
      set((s) => ({
        id: id ?? newId(),
        name: p.name,
        frames,
        frameIndex: 0,
        grid: frames[0].grid,
        palette: p.palette.length ? [...p.palette] : [...DEFAULT_PALETTE],
        svg: { ...DEFAULT_SVG_OPTIONS, ...p.svg },
        manualSvg: null,
        version: s.version + 1,
      }));
      syncHistory();
    },

    replaceDocument: (next, label) => {
      const before = snapshot();
      const after: DocumentSnapshot = {
        id: newId(),
        name: next.name,
        frames: [makeFrame(cloneGrid(next.grid))],
        frameIndex: 0,
        palette: [...next.palette],
        svg: { ...next.svg },
        manualSvg: null,
      };
      history.push({ kind: 'document', label, before, after });
      restoreSnapshot(after);
      syncHistory();
    },

    newProject: (width = 24, height = 24) => {
      history.clear();
      const frame = makeFrame(createGrid(width, height));
      set((s) => ({
        id: newId(),
        name: 'Untitled icon',
        frames: [frame],
        frameIndex: 0,
        grid: frame.grid,
        palette: [...DEFAULT_PALETTE],
        svg: { ...DEFAULT_SVG_OPTIONS, width, height },
        manualSvg: null,
        version: s.version + 1,
      }));
      syncHistory();
    },
  };
});

/** A detached copy of the open document. `grid` is the first frame; `frames` has them all. */
export function currentProject(): Project {
  const s = useDocument.getState();
  const frames = s.frames.map((f) => ({ grid: cloneGrid(f.grid), duration: f.duration }));
  return { name: s.name, grid: frames[0].grid, palette: [...s.palette], svg: { ...s.svg }, frames };
}
