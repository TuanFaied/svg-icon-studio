import { alpha, blue, green, type PackedColor, red } from '../grid/color';
import type { Grid } from '../grid/grid';

/** URL-encoded (not base64) data URI, wrapped for CSS: url("data:image/svg+xml,…"). */
export function svgDataUri(svg: string): string {
  const body = svg
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/"/g, "'")
    .replace(/[%#<>{}\r\n]/g, (c) => encodeURIComponent(c));
  return `data:image/svg+xml,${body}`;
}

export function cssDataUri(svg: string): string {
  return `url("${svgDataUri(svg)}")`;
}

/**
 * Rasterizes the grid at an integer scale into RGBA bytes, nearest-neighbor.
 * `background` 0 keeps transparency; otherwise cells are composited over it.
 */
export function gridToRgba(g: Grid, scale: number, background: PackedColor = 0): Uint8ClampedArray {
  const s = Math.max(1, Math.floor(scale));
  const W = g.width * s;
  const out = new Uint8ClampedArray(W * g.height * s * 4);
  const bgA = alpha(background) / 255;
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      const c = g.data[y * g.width + x];
      let r = red(c), gg = green(c), b = blue(c), a = alpha(c) / 255;
      if (background !== 0) {
        const oa = a + bgA * (1 - a);
        if (oa > 0) {
          r = (r * a + red(background) * bgA * (1 - a)) / oa;
          gg = (gg * a + green(background) * bgA * (1 - a)) / oa;
          b = (b * a + blue(background) * bgA * (1 - a)) / oa;
        }
        a = oa;
      }
      const A = Math.round(a * 255);
      for (let sy = 0; sy < s; sy++) {
        let o = ((y * s + sy) * W + x * s) * 4;
        for (let sx = 0; sx < s; sx++, o += 4) {
          out[o] = r;
          out[o + 1] = gg;
          out[o + 2] = b;
          out[o + 3] = A;
        }
      }
    }
  }
  return out;
}

/** Safe filename stem from a project name. */
export function fileStem(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'icon';
}

/** Frames side by side, left to right, as one RGBA sheet (for sprite-sheet PNG export). */
export function gridsToSheet(grids: readonly Grid[], scale: number, background: PackedColor = 0): { width: number; height: number; data: Uint8ClampedArray } {
  const s = Math.max(1, Math.floor(scale));
  const fw = grids[0].width * s;
  const fh = grids[0].height * s;
  const width = fw * grids.length;
  const data = new Uint8ClampedArray(width * fh * 4);
  grids.forEach((g, n) => {
    const px = gridToRgba(g, s, background);
    for (let y = 0; y < fh; y++) data.set(px.subarray(y * fw * 4, (y + 1) * fw * 4), (y * width + n * fw) * 4);
  });
  return { width, height: fh, data };
}
