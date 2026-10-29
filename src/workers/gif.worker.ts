/// <reference lib="webworker" />
import { framesToGif } from '@/core/export/gif';

declare const self: DedicatedWorkerGlobalScope;

export interface GifRequest {
  id: number;
  frames: Array<{ width: number; height: number; data: Uint32Array; duration: number }>;
  scale: number;
  /** Packed RGBA; 0 keeps transparency. */
  background: number;
}

export type GifResponse = { id: number; ok: true; bytes: Uint8Array } | { id: number; ok: false; message: string };

self.onmessage = (e: MessageEvent<GifRequest>) => {
  const { id, frames, scale, background } = e.data;
  try {
    const bytes = framesToGif(
      frames.map((f) => ({ grid: { width: f.width, height: f.height, data: f.data }, duration: f.duration })),
      scale,
      background,
    );
    self.postMessage({ id, ok: true, bytes } satisfies GifResponse, [bytes.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, message: err instanceof Error ? err.message : String(err) } satisfies GifResponse);
  }
};
