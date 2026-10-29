import { GifWriter } from 'omggif';
import { medianCutPalette } from '../convert/image';
import type { PackedColor } from '../grid/color';
import type { FrameData } from '../frames/frames';
import { gridToRgba } from './encode';

/**
 * Animated GIF from frames, nearest-neighbor scaled. Pixel art usually has few
 * colors, so the palette is exact; only past 255 colors is it quantized.
 * Alpha is binary in GIF: cells under 50% alpha become transparent, the rest
 * opaque (unless a solid background is given, which is composited first).
 */
export function framesToGif(frames: readonly FrameData[], scale: number, background: PackedColor = 0): Uint8Array {
  if (frames.length === 0) throw new Error('No frames to encode');
  const s = Math.max(1, Math.floor(scale));
  const w = frames[0].grid.width * s;
  const h = frames[0].grid.height * s;
  const rgba = frames.map((f) => gridToRgba(f.grid, s, background));

  // Distinct opaque colors, and whether any pixel is transparent.
  const colors = new Map<number, number>();
  let transparent = false;
  for (const px of rgba) {
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) transparent = true;
      else colors.set((px[i] << 16) | (px[i + 1] << 8) | px[i + 2], -1);
    }
  }

  const reserved = transparent ? 1 : 0;
  const palette: number[] = transparent ? [0x000000] : [];
  let indexOf: (rgb: number) => number;
  if (colors.size + reserved <= 256) {
    for (const rgb of colors.keys()) {
      colors.set(rgb, palette.length);
      palette.push(rgb);
    }
    indexOf = (rgb) => colors.get(rgb) as number;
  } else {
    // Too many colors: median-cut over every opaque pixel, then nearest match.
    const all = new Uint8ClampedArray(colors.size * 4);
    let o = 0;
    for (const rgb of colors.keys()) {
      all[o] = rgb >>> 16;
      all[o + 1] = (rgb >>> 8) & 255;
      all[o + 2] = rgb & 255;
      all[o + 3] = 255;
      o += 4;
    }
    const pal = medianCutPalette({ width: colors.size, height: 1, data: all }, 256 - reserved);
    const base = palette.length;
    for (const [r, g, b] of pal) palette.push((r << 16) | (g << 8) | b);
    const nearest = new Map<number, number>();
    indexOf = (rgb) => {
      let hit = nearest.get(rgb);
      if (hit !== undefined) return hit;
      const r = rgb >>> 16, g = (rgb >>> 8) & 255, b = rgb & 255;
      let best = 0, bd = Infinity;
      pal.forEach(([pr, pg, pb], k) => {
        const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
        if (d < bd) { bd = d; best = k; }
      });
      hit = base + best;
      nearest.set(rgb, hit);
      return hit;
    };
  }
  // GIF palettes have a power-of-two size of at least 2.
  let size = 2;
  while (size < palette.length) size *= 2;
  while (palette.length < size) palette.push(0);

  const buf = new Uint8Array(w * h * frames.length * 2 + palette.length * 3 + 2048);
  const writer = new GifWriter(buf, w, h, { palette, loop: 0 });
  const indexed = new Uint8Array(w * h);
  frames.forEach((f, n) => {
    const px = rgba[n];
    for (let p = 0, i = 0; p < indexed.length; p++, i += 4) {
      indexed[p] = px[i + 3] < 128 ? 0 : indexOf((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
    }
    writer.addFrame(0, 0, w, h, indexed as unknown as number[], {
      // GIF delays are in hundredths of a second; browsers treat < 2 as "fast as possible".
      delay: Math.max(2, Math.round(f.duration / 10)),
      // Clear to transparent before the next frame so frames don't pile up.
      disposal: 2,
      ...(transparent ? { transparent: 0 } : {}),
    });
  });
  return buf.slice(0, writer.end());
}
