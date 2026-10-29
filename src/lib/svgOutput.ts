'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Grid } from '@/core/grid/grid';
import { framesToSvg, gridToSvg, type OutputFormat, type SvgFrame, type SvgOptions } from '@/core/svg/generate';
import { optimizeSvg } from '@/core/svg/optimize';
import { sanitizeSvg } from '@/core/sanitize/sanitize';
import { useConvert } from '@/store/convert';
import { useDocument } from '@/store/document';
import { useUi } from '@/store/ui';

/**
 * Generates SVG text for any format from one grid, or from frames (animated
 * when there are several). SVGO failures fall back to minimal output.
 */
export function renderSvg(source: Grid | readonly SvgFrame[], opts: SvgOptions, format: OutputFormat = opts.format): string {
  const o = { ...opts, format };
  const svg = Array.isArray(source) ? framesToSvg(source as readonly SvgFrame[], o) : gridToSvg(source as Grid, o);
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
  const frames = useDocument((s) => s.frames);
  const opts = useDocument((s) => s.svg);
  return useMemo(() => renderSvg(frames, opts, format), [frames, version, opts, format]);
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

/** SVGs above this size are re-rendered only after edits pause. */
const LARGE_SVG = 150_000;
const SETTLE_MS = 400;

/**
 * The SVG to render: small ones pass straight through; large ones (big
 * multi-frame animations) update only after changes stop for a moment, so
 * previews and the code panel don't re-render megabytes on every edit.
 */
export function useSettledSvg(svg: string): string {
  const [settled, setSettled] = useState(svg);
  const small = svg.length < LARGE_SVG;
  useEffect(() => {
    if (small) return;
    const t = setTimeout(() => setSettled(svg), SETTLE_MS);
    return () => clearTimeout(t);
  }, [svg, small]);
  return small ? svg : settled;
}

/**
 * Blob URL for <img> previews, revoked when the SVG changes. Hand-edited and
 * converted SVG is sanitized first. `trusted` is only for this app's own
 * generator output (built from numbers, escaped text and validator-checked
 * CSS): it skips DOMPurify, which takes seconds on multi-megabyte animations.
 * Either way the SVG is shown through <img>, which never runs scripts.
 */
export function useSvgBlobUrl(input: string, { trusted = false }: { trusted?: boolean } = {}): string | null {
  const svg = useSettledSvg(input);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let clean: string;
    try {
      // Validated animation CSS stays, so animated icons play in every preview.
      clean = trusted ? svg : sanitizeSvg(svg, { allowAnimationCss: true });
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
  }, [svg, trusted]);
  return url;
}
