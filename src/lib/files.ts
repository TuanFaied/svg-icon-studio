'use client';

import { zipSync } from 'fflate';
import type { PackedColor } from '@/core/grid/color';
import type { Grid } from '@/core/grid/grid';
import { gridToRgba } from '@/core/export/encode';
import { sanitizeSvg } from '@/core/sanitize/sanitize';

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text: string, filename: string, type: string): void {
  downloadBlob(new Blob([text], { type }), filename);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for insecure contexts.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
}

/** Exact pixel-art PNG straight from the grid (nearest neighbor, no smoothing). */
export async function gridToPng(g: Grid, scale: number, background: PackedColor = 0): Promise<Blob> {
  const s = Math.max(1, Math.floor(scale));
  const canvas = document.createElement('canvas');
  canvas.width = g.width * s;
  canvas.height = g.height * s;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(gridToRgba(g, s, background)), canvas.width, canvas.height), 0, 0);
  return canvasToBlob(canvas);
}

/** Rasterizes arbitrary (sanitized) SVG at a target size, used for manual edits and odd sizes. */
export async function svgToPng(svg: string, width: number, height: number, background: string | null, smoothing: boolean): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([sanitizeSvg(svg, { allowAnimationCss: true })], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.imageSmoothingEnabled = smoothing;
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(img, 0, 0, width, height);
    return await canvasToBlob(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function makeZip(files: Record<string, Uint8Array | string>): Promise<Blob> {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(files)) entries[name] = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const zipped = zipSync(entries, { level: 6 });
  return new Blob([zipped.slice().buffer], { type: 'application/zip' });
}

export async function blobBytes(b: Blob): Promise<Uint8Array> {
  return new Uint8Array(await b.arrayBuffer());
}

/** Opens a file picker and resolves with the chosen file (or null). */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
