'use client';

import { useEffect } from 'react';
import { despeckleGrid, downsampleNearest, luminance, otsuThreshold, quantize, rasterToGrid, removeBackground } from '@/core/convert/image';
import { DEFAULT_SVG_OPTIONS, gridToSvg } from '@/core/svg/generate';
import { cancelTrace, trace, TraceCancelled } from '@/lib/traceClient';
import { useConvert } from '@/store/convert';

const DEBOUNCE_MS = 300;

/** Re-runs the conversion 300ms after the source, mode or settings change. */
export function useConversion(): void {
  const source = useConvert((s) => s.source);
  const mode = useConvert((s) => s.mode);
  const settings = useConvert((s) => s.settings);

  // Auto threshold: compute Otsu once per source.
  useEffect(() => {
    if (!source || !settings.autoThreshold) return;
    const t = otsuThreshold(luminance(source.raster));
    if (t !== useConvert.getState().settings.threshold) useConvert.getState().setSettings({ threshold: Math.max(1, t) });
  }, [source, settings.autoThreshold]);

  useEffect(() => {
    if (!source) return;
    const store = useConvert.getState();
    store.set({ status: 'working', stage: 'Waiting…', error: null });
    let stale = false;

    const timer = setTimeout(async () => {
      const t0 = performance.now();
      try {
        if (mode === 'pixel') {
          // Small output: runs on the main thread in a few milliseconds.
          let r = downsampleNearest(source.raster, settings.gridWidth, settings.gridHeight);
          if (settings.removeBackground) r = removeBackground(r, settings.bgTolerance);
          const grid = despeckleGrid(rasterToGrid(quantize(r, settings.paletteSize)), Math.max(1, Math.round(settings.speckle / 4)));
          const svg = gridToSvg(grid, {
            ...DEFAULT_SVG_OPTIONS,
            width: settings.outWidth,
            height: settings.outHeight,
          });
          if (!stale) useConvert.getState().set({ result: { kind: 'pixel', svg, grid, ms: Math.round(performance.now() - t0) }, status: 'done', stage: '' });
          return;
        }
        const res = await trace(
          {
            mode,
            raster: source.raster,
            settings: {
              threshold: settings.threshold,
              paletteSize: settings.paletteSize,
              detail: settings.detail,
              speckle: settings.speckle,
              precision: settings.precision,
              outWidth: settings.outWidth,
              outHeight: settings.outHeight,
              removeBackground: settings.removeBackground,
              bgTolerance: settings.bgTolerance,
            },
          },
          (stage) => !stale && useConvert.getState().set({ stage }),
        );
        if (!stale) useConvert.getState().set({ result: { kind: 'vector', svg: res.svg, engine: res.engine, ms: res.ms }, status: 'done', stage: '' });
      } catch (e) {
        if (stale || e instanceof TraceCancelled) return;
        useConvert.getState().set({ status: 'error', stage: '', error: e instanceof Error ? e.message : String(e) });
      }
    }, DEBOUNCE_MS);

    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [source, mode, settings]);

  // Stop any running trace when leaving Convert mode.
  useEffect(() => () => cancelTrace(), []);
}

export function cancelConversion(): void {
  cancelTrace();
  useConvert.getState().set({ status: 'cancelled', stage: '' });
}
