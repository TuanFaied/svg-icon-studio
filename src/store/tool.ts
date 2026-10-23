'use client';

import { create } from 'zustand';
import { pack, type PackedColor, parseHex } from '@/core/grid/color';
import type { Grid } from '@/core/grid/grid';
import type { Rect } from '@/core/grid/ops';

export type ToolId = 'pencil' | 'eraser' | 'fill' | 'line' | 'rect' | 'ellipse' | 'eyedropper' | 'select';

export interface ToolDef {
  id: ToolId;
  label: string;
  key: string;
}

export const TOOLS: ToolDef[] = [
  { id: 'pencil', label: 'Pencil', key: 'B' },
  { id: 'eraser', label: 'Eraser', key: 'E' },
  { id: 'fill', label: 'Fill', key: 'F' },
  { id: 'line', label: 'Line', key: 'L' },
  { id: 'rect', label: 'Rectangle', key: 'R' },
  { id: 'ellipse', label: 'Ellipse', key: 'O' },
  { id: 'eyedropper', label: 'Eyedropper', key: 'I' },
  { id: 'select', label: 'Select / Move', key: 'M' },
];

export const MIN_ZOOM = 2;
export const MAX_ZOOM = 96;

export interface ToolState {
  tool: ToolId;
  primary: PackedColor;
  secondary: PackedColor;
  brush: number;
  mirrorX: boolean;
  mirrorY: boolean;
  fillShapes: boolean;
  fill8: boolean;
  /** CSS px per cell. */
  zoom: number;
  panX: number;
  panY: number;
  showGrid: boolean;
  showBoundary: boolean;
  background: 'checker' | 'light' | 'dark';
  selection: Rect | null;
  clipboard: Grid | null;
  /** Incremented to ask the canvas to fit itself to the viewport. */
  fitRequest: number;

  setTool: (t: ToolId) => void;
  setPrimary: (c: PackedColor) => void;
  setSecondary: (c: PackedColor) => void;
  swapColors: () => void;
  setBrush: (n: number) => void;
  set: (patch: Partial<Omit<ToolState, 'set'>>) => void;
  zoomBy: (factor: number, cx?: number, cy?: number) => void;
  requestFit: () => void;
}

export const useTool = create<ToolState>()((set, get) => ({
  tool: 'pencil',
  primary: parseHex('#000000') as PackedColor,
  secondary: pack(255, 255, 255),
  brush: 1,
  mirrorX: false,
  mirrorY: false,
  fillShapes: false,
  fill8: false,
  zoom: 20,
  panX: 0,
  panY: 0,
  showGrid: true,
  showBoundary: true,
  background: 'checker',
  selection: null,
  clipboard: null,
  fitRequest: 0,

  setTool: (tool) => set({ tool, ...(tool !== 'select' ? { selection: null } : {}) }),
  setPrimary: (primary) => set({ primary }),
  setSecondary: (secondary) => set({ secondary }),
  swapColors: () => set((s) => ({ primary: s.secondary, secondary: s.primary })),
  setBrush: (n) => set({ brush: Math.max(1, Math.min(4, Math.round(n))) }),
  set: (patch) => set(patch),
  zoomBy: (factor, cx, cy) => {
    const { zoom, panX, panY } = get();
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoom * factor * 100) / 100));
    if (next === zoom) return;
    if (cx === undefined || cy === undefined) {
      set({ zoom: next });
      return;
    }
    // Keep the point under the cursor fixed.
    const k = next / zoom;
    set({ zoom: next, panX: cx - (cx - panX) * k, panY: cy - (cy - panY) * k });
  },
  requestFit: () => set((s) => ({ fitRequest: s.fitRequest + 1 })),
}));
