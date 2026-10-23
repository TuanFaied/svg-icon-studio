'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Grid } from '@/core/grid/grid';
import { gridToSvg, type OutputFormat, type SvgOptions } from '@/core/svg/generate';
import { optimizeSvg } from '@/core/svg/optimize';
import { sanitizeSvg } from '@/core/sanitize/sanitize';
import { useConvert } from '@/store/convert';
import { useDocument } from '@/store/document';
import { useUi } from '@/store/ui';

/** Generates SVG text for any format. SVGO failures fall back to minimal output. */
export function renderSvg(grid: Grid, opts: SvgOptions, format: OutputFormat = opts.format): string {
  const svg = gridToSvg(grid, { ...opts, format });
  if (format !== 'optimized') return svg;
  try {
    return optimizeSvg(svg);
  } catch {
    return svg;
  }
}

/**
 * The generated SVG, memoized on the grid version and options. Pointer
 * strokes bump the version on a throttle, so this stays live but cheap.
 */
export function useGeneratedSvg(format?: OutputFormat): string {
  const version = useDocument((s) => s.version);
  const grid = useDocument((s) => s.grid);
  const opts = useDocument((s) => s.svg);
  return useMemo(() => renderSvg(grid, opts, format), [grid, version, opts, format]);
}

export type SvgSource = 'grid' | 'manual' | 'convert';

/**
 * Whichever SVG is active for preview, code panel and export. In Convert mode
 * that is the traced result; otherwise manual edits win over the drawing.
 * `manual` is true whenever the SVG is not generated from the grid.
 */
export function useActiveSvg(): { svg: string; manual: boolean; source: SvgSource } {
  const generated = useGeneratedSvg();
  const manualSvg = useDocument((s) => s.manualSvg);
  const mode = useUi((s) => s.mode);
  const converted = useConvert((s) => s.result);
  if (mode === 'convert' && converted) return { svg: converted.svg, manual: true, source: 'convert' };
  if (manualSvg !== null) return { svg: manualSvg, manual: true, source: 'manual' };
  return { svg: generated, manual: false, source: 'grid' };
}

/** Sanitized blob URL for <img> previews. Revoked when the SVG changes. */
export function useSvgBlobUrl(svg: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let clean: string;
    try {
      // Validated animation CSS stays, so animated icons play in every preview.
      clean = sanitizeSvg(svg, { allowAnimationCss: true });
    } catch {
      clean = '';
    }
    if (!clean) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(new Blob([clean], { type: 'image/svg+xml' }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [svg]);
  return url;
}
