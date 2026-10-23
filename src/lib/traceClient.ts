'use client';

import type { TraceRequest, TraceResponse } from '@/workers/protocol';

type Done = Extract<TraceResponse, { type: 'done' }>;

let worker: Worker | null = null;
let nextId = 1;
let pending: { id: number; reject: (e: Error) => void } | null = null;

function getWorker(): Worker {
  if (!worker) worker = new Worker(new URL('../workers/trace.worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

export class TraceCancelled extends Error {
  constructor() {
    super('Cancelled');
  }
}

/** Kills the worker mid-trace (WASM tracing can't be interrupted otherwise). */
export function cancelTrace(): void {
  if (pending) {
    pending.reject(new TraceCancelled());
    pending = null;
  }
  worker?.terminate();
  worker = null;
}

/** Runs one trace; starting a new one cancels any trace still running. */
export function trace(req: Omit<TraceRequest, 'id' | 'wasmBase'>, onProgress: (stage: string) => void): Promise<Done> {
  if (pending) cancelTrace();
  const id = nextId++;
  const w = getWorker();
  const wasmBase = new URL('wasm/', document.baseURI).toString();
  return new Promise<Done>((resolve, reject) => {
    pending = { id, reject };
    const onMessage = (e: MessageEvent<TraceResponse>) => {
      const m = e.data;
      if (m.id !== id) return;
      if (m.type === 'progress') {
        onProgress(m.stage);
        return;
      }
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      pending = null;
      if (m.type === 'done') resolve(m);
      else reject(new Error(m.message));
    };
    const onError = (e: ErrorEvent) => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      pending = null;
      worker?.terminate();
      worker = null;
      reject(new Error(e.message || 'Tracing worker crashed'));
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    // Copy the pixels so the transfer doesn't detach the stored raster.
    const data = new Uint8ClampedArray(req.raster.data);
    w.postMessage({ ...req, id, wasmBase, raster: { ...req.raster, data } } satisfies TraceRequest, [data.buffer]);
  });
}
