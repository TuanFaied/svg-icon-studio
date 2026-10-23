'use client';

import { create } from 'zustand';
import type { Raster } from '@/core/convert/image';
import type { Grid } from '@/core/grid/grid';
import type { TraceEngine } from '@/workers/protocol';

export type ConvertMode = 'pixel' | 'bw' | 'silhouette' | 'color';

export interface SourceImage {
  name: string;
  /** Object URL for the original file (revoked when replaced). */
  url: string;
  bytes: number;
  type: string;
  origWidth: number;
  origHeight: number;
  /** Processing raster (downscaled to at most 2048px). */
  raster: Raster;
  downscaled: boolean;
  hasAlpha: boolean;
}

export interface ConvertSettings {
  paletteSize: number;
  threshold: number;
  autoThreshold: boolean;
  detail: number;
  speckle: number;
  precision: number;
  removeBackground: boolean;
  bgTolerance: number;
  outWidth: number;
  outHeight: number;
  lockAspect: boolean;
  gridWidth: number;
  gridHeight: number;
}

export type ConvertResult =
  | { kind: 'vector'; svg: string; engine: TraceEngine; ms: number }
  | { kind: 'pixel'; svg: string; grid: Grid; ms: number };

export interface ConvertState {
  source: SourceImage | null;
  mode: ConvertMode;
  settings: ConvertSettings;
  result: ConvertResult | null;
  status: 'idle' | 'working' | 'done' | 'error' | 'cancelled';
  stage: string;
  error: string | null;
  split: number;
  showOutlines: boolean;
  setSource: (s: SourceImage | null) => void;
  setMode: (m: ConvertMode) => void;
  setSettings: (patch: Partial<ConvertSettings>) => void;
  set: (patch: Partial<Omit<ConvertState, 'set' | 'setSource' | 'setMode' | 'setSettings'>>) => void;
}

export const DEFAULT_CONVERT: ConvertSettings = {
  paletteSize: 8,
  threshold: 128,
  autoThreshold: true,
  detail: 50,
  speckle: 4,
  precision: 1,
  removeBackground: false,
  bgTolerance: 12,
  outWidth: 256,
  outHeight: 256,
  lockAspect: true,
  gridWidth: 32,
  gridHeight: 32,
};

export const useConvert = create<ConvertState>()((set, get) => ({
  source: null,
  mode: 'color',
  settings: { ...DEFAULT_CONVERT },
  result: null,
  status: 'idle',
  stage: '',
  error: null,
  split: 50,
  showOutlines: false,
  setSource: (source) => {
    const prev = get().source;
    if (prev && prev.url !== source?.url) URL.revokeObjectURL(prev.url);
    if (!source) {
      set({ source: null, result: null, status: 'idle', error: null });
      return;
    }
    const { raster } = source;
    const longest = Math.max(raster.width, raster.height);
    const out = 256;
    const gridLongest = 32;
    set({
      source,
      result: null,
      error: null,
      settings: {
        ...get().settings,
        outWidth: Math.max(1, Math.round((raster.width / longest) * out)),
        outHeight: Math.max(1, Math.round((raster.height / longest) * out)),
        gridWidth: Math.max(1, Math.round((raster.width / longest) * gridLongest)),
        gridHeight: Math.max(1, Math.round((raster.height / longest) * gridLongest)),
      },
    });
  },
  setMode: (mode) => set({ mode, result: null }),
  setSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
  set: (patch) => set(patch),
}));
