'use client';

import { AlertTriangle, ImageUp, Loader2, PencilRuler, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatBytes, svgStats } from '@/core/svg/stats';
import { Button, Toggle } from '@/components/ui/primitives';
import { useSvgBlobUrl } from '@/lib/svgOutput';
import { useConvert } from '@/store/convert';
import { useDocument } from '@/store/document';
import { useTool } from '@/store/tool';
import { useUi } from '@/store/ui';
import { cancelConversion, useConversion } from './useConversion';

/** Strips fills and adds hairline strokes so path structure is visible. */
function outlineSvg(svg: string): string {
  return svg
    .replace(/\s(fill|fill-opacity|fill-rule)="[^"]*"/g, '')
    .replace(/<(path|rect|polygon|circle|ellipse)\b/g, '<$1 fill="none" stroke="#e11d48" stroke-width="1" vector-effect="non-scaling-stroke"')
    .replace(/<g\b/g, '<g fill="none"');
}

function SplitView({ before, after, label }: { before: string; after: string | null; label: string }) {
  const split = useConvert((s) => s.split);
  const setSplit = (v: number) => useConvert.getState().set({ split: Math.max(0, Math.min(100, v)) });
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const source = useConvert((s) => s.source);
  const ratio = source ? source.raster.width / source.raster.height : 1;
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Fit the comparison box inside the available area at the image's aspect ratio.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const w = Math.min(width, height * ratio);
      setSize({ w: Math.floor(w), h: Math.floor(w / ratio) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio]);

  const fromPointer = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (r) setSplit(((clientX - r.left) / r.width) * 100);
  };

  return (
    <div ref={frame} className="flex h-full w-full items-center justify-center">
    <div
      ref={box}
      className="checker relative touch-none overflow-hidden rounded-lg border border-line shadow-sm select-none"
      style={{ width: size.w, height: size.h }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        fromPointer(e.clientX);
      }}
      onPointerMove={(e) => e.buttons && fromPointer(e.clientX)}
    >
      {/* Original */}
      <img src={before} alt="Original image" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
      {/* Vector result, clipped to the right of the split */}
      {after && (
        <img
          src={after}
          alt={label}
          className="absolute inset-0 h-full w-full object-contain"
          style={{ clipPath: `inset(0 0 0 ${split}%)` }}
          draggable={false}
        />
      )}
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent" style={{ left: `calc(${split}% - 1px)` }}>
        <div className="absolute top-1/2 left-1/2 flex h-8 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-panel text-[10px] shadow">⇔</div>
      </div>
      <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">Original</span>
      <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">Vector</span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(split)}
        onChange={(e) => setSplit(Number(e.target.value))}
        aria-label="Before / after split position"
        className="absolute inset-x-0 bottom-0 h-0 opacity-0 focus-visible:h-4 focus-visible:opacity-100"
      />
    </div>
    </div>
  );
}

export function TracePreview() {
  useConversion();
  const source = useConvert((s) => s.source);
  const result = useConvert((s) => s.result);
  const status = useConvert((s) => s.status);
  const stage = useConvert((s) => s.stage);
  const error = useConvert((s) => s.error);
  const showOutlines = useConvert((s) => s.showOutlines);
  const mode = useConvert((s) => s.mode);

  const shown = useMemo(() => (result ? (showOutlines ? outlineSvg(result.svg) : result.svg) : ''), [result, showOutlines]);
  const url = useSvgBlobUrl(shown);
  const stats = useMemo(() => (result ? svgStats(result.svg) : null), [result]);

  if (!source) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <ImageUp size={32} className="mx-auto mb-2 text-muted" aria-hidden />
          <h2 className="mb-1 text-base font-semibold">Convert an image to SVG</h2>
          <p className="text-muted">Add a PNG, JPG or WebP in the Image section (drop, browse, or paste with Ctrl+V). Everything runs in your browser.</p>
        </div>
      </div>
    );
  }

  const tooBig = stats && (stats.bytes > source.bytes || stats.bytes > 1024 * 1024);

  const openInEditor = () => {
    if (result?.kind !== 'pixel') return;
    const doc = useDocument.getState();
    doc.replaceGrid(result.grid, 'Import pixel art');
    doc.setManualSvg(null);
    if (!doc.name || doc.name === 'Untitled icon') doc.setName(source.name.replace(/\.[a-z0-9]+$/i, ''));
    useTool.getState().requestFit();
    useUi.getState().setMode('draw');
    useUi.getState().toast('Imported into the pixel editor. Undo restores the previous drawing.', 'success');
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center px-12 py-4">
        <SplitView before={source.url} after={url} label={showOutlines ? 'Vector path outlines' : 'Vector result'} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-panel px-3 py-2">
        <div className="flex min-w-0 items-center gap-2" aria-live="polite">
          {status === 'working' ? (
            <>
              <Loader2 size={15} className="animate-spin text-accent" aria-hidden />
              <span>{stage || 'Working…'}</span>
              <Button size="sm" onClick={cancelConversion}>
                <X size={13} /> Cancel
              </Button>
            </>
          ) : status === 'error' ? (
            <span className="text-danger">Conversion failed: {error}</span>
          ) : status === 'cancelled' ? (
            <span className="text-muted">Cancelled. Change a setting to run again.</span>
          ) : stats ? (
            <span className="flex flex-wrap gap-x-3 tabular-nums text-muted">
              <span>{result?.kind === 'pixel' ? `${stats.elements - 1} shapes` : `${stats.paths} paths`}</span>
              <span>{stats.nodes} nodes</span>
              <span>
                SVG {formatBytes(stats.bytes)} vs original {formatBytes(source.bytes)}
              </span>
              {result?.kind === 'vector' && <span>{result.engine} · {result.ms} ms</span>}
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="w-36"><Toggle label="Path outlines" checked={showOutlines} onChange={(v) => useConvert.getState().set({ showOutlines: v })} /></div>
          {mode === 'pixel' && (
            <Button variant="primary" disabled={result?.kind !== 'pixel'} onClick={openInEditor}>
              <PencilRuler size={14} /> Open in pixel editor
            </Button>
          )}
        </div>
        {tooBig && status !== 'working' && (
          <p role="alert" className="flex w-full items-start gap-1.5 rounded-md bg-warn-bg px-2 py-1.5 text-[12px] text-warn-fg">
            <AlertTriangle size={14} className="mt-px shrink-0" aria-hidden />
            {stats.bytes > 1024 * 1024 ? 'This SVG is over 1 MB.' : 'This SVG is larger than the original image.'} Photos don’t vectorize well. Try fewer colors, a lower detail setting, a bigger speckle filter, or Pixel Art mode.
          </p>
        )}
      </div>
    </div>
  );
}
