export interface SvgStats {
  bytes: number;
  elements: number;
  paths: number;
  /** Approximate node count: path commands + rect corners. */
  nodes: number;
}

const ARG_COUNT: Record<string, number> = { m: 2, l: 2, t: 2, h: 1, v: 1, c: 6, s: 4, q: 4, a: 7, z: 0 };

/** Number of segments in path data, counting implicit command repeats ("c 1 2 3 4 5 6 7 8 9 10 11 12" = 2). */
export function pathSegments(d: string): number {
  let n = 0;
  for (const m of d.matchAll(/([a-zA-Z])([^a-zA-Z]*)/g)) {
    const per = ARG_COUNT[m[1].toLowerCase()];
    if (per === undefined) continue;
    if (per === 0) continue;
    const nums = (m[2].match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).length;
    n += Math.max(1, Math.floor(nums / per));
  }
  return n;
}

export function svgStats(svg: string): SvgStats {
  const bytes = new TextEncoder().encode(svg).length;
  const elements = (svg.match(/<[a-zA-Z][^>]*>/g) ?? []).length;
  const pathDs = [...svg.matchAll(/\sd="([^"]*)"/g)].map((m) => m[1]);
  const paths = pathDs.length;
  const rects = (svg.match(/<rect\b/g) ?? []).length;
  const nodes = pathDs.reduce((n, d) => n + pathSegments(d), 0) + rects * 4;
  return { bytes, elements, paths, nodes };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** Gzip size via CompressionStream when available. */
export async function gzipSize(text: string): Promise<number | null> {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return buf.byteLength;
}
