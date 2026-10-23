/**
 * Post-processing for traced SVG: normalize the root (viewBox, output size,
 * no XML prolog/comments) and round coordinates to a fixed precision.
 */
export interface PostOptions {
  /** Source raster size; becomes the viewBox. */
  width: number;
  height: number;
  /** Output width/height attributes. */
  outWidth: number;
  outHeight: number;
  /** Decimal places for path coordinates. */
  precision: number;
}

export function roundNumbers(d: string, precision: number): string {
  const k = Math.pow(10, precision);
  return d.replace(/-?\d*\.\d+(?:e[-+]?\d+)?|-?\d+e[-+]?\d+/gi, (m) => {
    const n = Math.round(parseFloat(m) * k) / k;
    return String(Object.is(n, -0) ? 0 : n);
  });
}

export function normalizeTracedSvg(svg: string, o: PostOptions): string {
  let s = svg
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .trim();
  const open = s.match(/<svg\b[^>]*>/);
  if (!open) throw new Error('Tracer returned no <svg> element');
  const root = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${o.width} ${o.height}" width="${Math.round(o.outWidth)}" height="${Math.round(o.outHeight)}">`;
  s = s.replace(open[0], root);
  // Round coordinates inside d="" and transform="" only.
  s = s.replace(/\s(d|transform|points)="([^"]*)"/g, (_, attr: string, val: string) => ` ${attr}="${roundNumbers(val, o.precision)}"`);
  // Collapse whitespace between tags.
  s = s.replace(/>\s+</g, '>\n<');
  return s.endsWith('\n') ? s : s + '\n';
}
