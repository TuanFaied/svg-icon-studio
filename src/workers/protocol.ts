import type { Raster } from '@/core/convert/image';

export type TraceMode = 'bw' | 'silhouette' | 'color';
export type TraceEngine = 'potrace' | 'vtracer' | 'imagetracer';

export interface TraceSettings {
  threshold: number;
  paletteSize: number;
  /** 0 = smooth curves, 100 = sharp corners / more detail. */
  detail: number;
  /** Drop regions smaller than this many px. */
  speckle: number;
  precision: number;
  outWidth: number;
  outHeight: number;
  removeBackground: boolean;
  /** 0–100 color distance for background flood fill. */
  bgTolerance: number;
}

export interface TraceRequest {
  id: number;
  mode: TraceMode;
  raster: Raster;
  settings: TraceSettings;
  /** Absolute URL of public/wasm/, resolved by the page. */
  wasmBase: string;
}

export type TraceResponse =
  | { id: number; type: 'progress'; stage: string }
  | { id: number; type: 'done'; svg: string; engine: TraceEngine; ms: number }
  | { id: number; type: 'error'; message: string };
