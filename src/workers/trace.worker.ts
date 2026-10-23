/// <reference lib="webworker" />
import { init as initPotrace, potrace } from 'esm-potrace-wasm';
import ImageTracer from 'imagetracerjs';
import { binarize, quantize, type Raster, removeBackground, silhouette } from '@/core/convert/image';
import { normalizeTracedSvg } from '@/core/convert/svgPost';
import type { TraceEngine, TraceRequest, TraceResponse, TraceSettings } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

interface VTracerModule {
  default: (opts: { module_or_path: string }) => Promise<unknown>;
  to_svg: (pixels: Uint8Array, width: number, height: number, config: Record<string, unknown>) => string;
}

let potraceReady: Promise<void> | null = null;
let vtracer: Promise<VTracerModule> | null = null;

function post(msg: TraceResponse) {
  self.postMessage(msg);
}

function loadVTracer(base: string): Promise<VTracerModule> {
  if (!vtracer) {
    vtracer = (async () => {
      // Loaded at runtime from /public so the bundler never touches its wasm URL logic.
      const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${base}vtracer.js`)) as VTracerModule;
      await mod.default({ module_or_path: `${base}vtracer.wasm` });
      return mod;
    })();
    vtracer.catch(() => (vtracer = null));
  }
  return vtracer;
}

const toImageData = (r: Raster) => new ImageData(new Uint8ClampedArray(r.data), r.width, r.height);

async function tracePotrace(r: Raster, s: TraceSettings): Promise<string> {
  if (!potraceReady) potraceReady = initPotrace();
  await potraceReady;
  const svg = await potrace(toImageData(r), {
    turdsize: Math.max(0, Math.round(s.speckle)),
    turnpolicy: 4,
    // alphamax: 0 = polygon corners, ~1.33 = very smooth.
    alphamax: 1.334 * (1 - s.detail / 100),
    opticurve: 1,
    opttolerance: 0.2,
    pathonly: false,
    extractcolors: false,
    posterizelevel: 2,
    posterizationalgorithm: 0,
  });
  return svg;
}

async function traceVTracer(r: Raster, s: TraceSettings, base: string): Promise<string> {
  const vt = await loadVTracer(base);
  const deg = Math.PI / 180;
  return vt.to_svg(new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength), r.width, r.height, {
    binary: false,
    mode: 'spline',
    hierarchical: 'stacked',
    // Higher detail keeps more corners.
    cornerThreshold: (120 - s.detail) * deg,
    lengthThreshold: 4,
    maxIterations: 10,
    spliceThreshold: 45 * deg,
    filterSpeckle: Math.max(1, Math.round(s.speckle)),
    // This build passes colorPrecision straight to visioncortex as "low bits ignored"
    // (must be < 8). Input is already quantized, so compare colors exactly.
    colorPrecision: 0,
    layerDifference: 1,
    pathPrecision: Math.max(0, Math.min(8, s.precision)),
  });
}

function traceImageTracer(r: Raster, s: TraceSettings): string {
  return ImageTracer.imagedataToSVG(
    { width: r.width, height: r.height, data: r.data },
    {
      numberofcolors: s.paletteSize,
      colorsampling: 0, // palette comes from our quantized pixels
      pathomit: Math.max(0, Math.round(s.speckle)),
      ltres: 1 - s.detail / 120,
      qtres: 1 - s.detail / 120,
      roundcoords: Math.max(0, Math.min(3, s.precision)),
      strokewidth: 0,
      linefilter: true,
    },
  );
}

self.onmessage = async (e: MessageEvent<TraceRequest>) => {
  const { id, mode, settings, wasmBase } = e.data;
  const t0 = performance.now();
  try {
    post({ id, type: 'progress', stage: 'Preparing image' });
    const raster = settings.removeBackground ? removeBackground(e.data.raster, settings.bgTolerance) : e.data.raster;
    let svg: string;
    let engine: TraceEngine;
    if (mode === 'color') {
      const q = quantize(raster, settings.paletteSize);
      post({ id, type: 'progress', stage: 'Tracing colors' });
      try {
        svg = await traceVTracer(q, settings, wasmBase);
        engine = 'vtracer';
      } catch (err) {
        console.warn('VTracer failed, falling back to ImageTracerJS', err);
        vtracer = null; // a panicked wasm instance is not reusable
        svg = traceImageTracer(q, settings);
        engine = 'imagetracer';
      }
    } else {
      const mask = mode === 'bw' ? binarize(raster, settings.threshold) : silhouette(raster, settings.threshold);
      post({ id, type: 'progress', stage: 'Tracing shapes' });
      svg = await tracePotrace(mask, settings);
      engine = 'potrace';
    }
    post({ id, type: 'progress', stage: 'Finishing' });
    const out = normalizeTracedSvg(svg, {
      width: raster.width,
      height: raster.height,
      outWidth: settings.outWidth,
      outHeight: settings.outHeight,
      precision: settings.precision,
    });
    post({ id, type: 'done', svg: out, engine, ms: Math.round(performance.now() - t0) });
  } catch (err) {
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
