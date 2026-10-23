'use client';

import { fitWithin, hasTransparency } from '@/core/convert/image';
import type { SourceImage } from '@/store/convert';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_SIDE = 2048;
export const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/bmp';

/**
 * Validates by decoding (not by extension), downsizes to MAX_SIDE, and
 * returns a raster ready for tracing. Throws an Error with a user-facing message.
 */
export async function loadImageFile(file: File): Promise<SourceImage> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 20 MB.`);
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`“${file.name || 'This file'}” could not be decoded as an image. Use PNG, JPG, WebP, GIF or BMP.`);
  }
  try {
    if (!bitmap.width || !bitmap.height) throw new Error('The image has no pixels.');
    const fit = fitWithin(bitmap.width, bitmap.height, MAX_SIDE);
    const canvas = document.createElement('canvas');
    canvas.width = fit.width;
    canvas.height = fit.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas is not available in this browser.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, fit.width, fit.height);
    const img = ctx.getImageData(0, 0, fit.width, fit.height);
    const raster = { width: img.width, height: img.height, data: img.data };
    return {
      name: file.name || 'pasted-image',
      url: URL.createObjectURL(file),
      bytes: file.size,
      type: file.type || 'image',
      origWidth: bitmap.width,
      origHeight: bitmap.height,
      raster,
      downscaled: fit.scaled,
      hasAlpha: hasTransparency(raster),
    };
  } finally {
    bitmap.close();
  }
}
