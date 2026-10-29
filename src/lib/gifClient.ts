'use client';

import type { PackedColor } from '@/core/grid/color';
import type { FrameData } from '@/core/frames/frames';
import type { GifRequest, GifResponse } from '@/workers/gif.worker';

let nextId = 1;

/** Encodes frames to an animated GIF in a Web Worker so large exports don't block the UI. */
export function encodeGif(frames: readonly FrameData[], scale: number, background: PackedColor = 0): Promise<Blob> {
  const worker = new Worker(new URL('../workers/gif.worker.ts', import.meta.url), { type: 'module' });
  const id = nextId++;
  // Copies, so transferring them doesn't detach the document's pixel buffers.
  const payload = frames.map((f) => ({ width: f.grid.width, height: f.grid.height, data: f.grid.data.slice(), duration: f.duration }));
  return new Promise<Blob>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<GifResponse>) => {
      if (e.data.id !== id) return;
      worker.terminate();
      if (e.data.ok) resolve(new Blob([e.data.bytes.slice().buffer], { type: 'image/gif' }));
      else reject(new Error(e.data.message));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'GIF encoder crashed'));
    };
    worker.postMessage({ id, frames: payload, scale, background } satisfies GifRequest, payload.map((f) => f.data.buffer));
  });
}
