/**
 * Colors are packed into a single unsigned 32-bit integer as 0xRRGGBBAA.
 * The value 0 is reserved for "transparent"; any color with alpha 0 normalizes to 0.
 */
export type PackedColor = number;

export const TRANSPARENT: PackedColor = 0;

export function pack(r: number, g: number, b: number, a = 255): PackedColor {
  if (a <= 0) return TRANSPARENT;
  return (((r & 255) << 24) | ((g & 255) << 16) | ((b & 255) << 8) | (a & 255)) >>> 0;
}

export const red = (c: PackedColor): number => c >>> 24;
export const green = (c: PackedColor): number => (c >>> 16) & 255;
export const blue = (c: PackedColor): number => (c >>> 8) & 255;
export const alpha = (c: PackedColor): number => c & 255;

/** Same color with alpha forced to 255. */
export const opaque = (c: PackedColor): PackedColor => (c === 0 ? 0 : ((c | 255) >>> 0));

const h2 = (n: number) => n.toString(16).padStart(2, '0');

/** `#rrggbb` (no alpha). With `short`, collapses to `#rgb` when possible. */
export function toHexRGB(c: PackedColor, short = false): string {
  const r = h2(red(c));
  const g = h2(green(c));
  const b = h2(blue(c));
  if (short && r[0] === r[1] && g[0] === g[1] && b[0] === b[1]) return `#${r[0]}${g[0]}${b[0]}`;
  return `#${r}${g}${b}`;
}

/** `#rrggbb` when opaque, `#rrggbbaa` otherwise. Transparent returns `transparent`. */
export function toHex(c: PackedColor): string {
  if (c === 0) return 'transparent';
  const a = alpha(c);
  return a === 255 ? toHexRGB(c) : toHexRGB(c) + h2(a);
}

export function toCss(c: PackedColor): string {
  if (c === 0) return 'transparent';
  const a = alpha(c);
  if (a === 255) return toHexRGB(c);
  return `rgba(${red(c)},${green(c)},${blue(c)},${(a / 255).toFixed(3)})`;
}

/** Parses `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` (with or without `#`). */
export function parseHex(input: string): PackedColor | null {
  let s = input.trim().replace(/^#/, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(s)) return null;
  if (s.length === 3 || s.length === 4) s = s.split('').map((ch) => ch + ch).join('');
  if (s.length === 6) s += 'ff';
  if (s.length !== 8) return null;
  const n = parseInt(s, 16) >>> 0;
  return alpha(n) === 0 ? TRANSPARENT : n;
}

/** Opacity for SVG `fill-opacity`, rounded to 3 decimals (round-trips through `Math.round(x*255)`). */
export function opacityString(c: PackedColor): string {
  return String(Math.round((alpha(c) / 255) * 1000) / 1000);
}

/** Relative luminance helper for choosing contrasting UI overlays. */
export function isLight(c: PackedColor): boolean {
  if (c === 0) return true;
  return 0.299 * red(c) + 0.587 * green(c) + 0.114 * blue(c) > 150;
}

export const DEFAULT_PALETTE: PackedColor[] = [
  '#000000', '#ffffff', '#6b7280', '#d1d5db',
  '#ef4444', '#f97316', '#facc15', '#22c55e',
  '#14b8a6', '#3b82f6', '#6366f1', '#a855f7',
  '#ec4899', '#7c2d12', '#166534', '#1e3a8a',
].map((h) => parseHex(h) as PackedColor);
