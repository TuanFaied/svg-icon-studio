'use client';

import { Maximize, Minus, Plus, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button, IconButton } from '@/components/ui/primitives';
import { useActiveSvg, useSvgBlobUrl } from '@/lib/svgOutput';
import { useUi } from '@/store/ui';
import { useDocument } from '@/store/document';
import { useTool } from '@/store/tool';
import { CanvasEngine } from './engine';

/** The canvas area playing the animated SVG output, instead of the editable grid. */
function CanvasPreview() {
  const { svg, source } = useActiveSvg();
  const url = useSvgBlobUrl(svg, { trusted: source === 'grid' });
  const name = useDocument((s) => s.name);
  const setCanvasPreview = useUi((s) => s.setCanvasPreview);
  return (
    <div className="checker absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 p-6" data-testid="canvas-preview">
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        {url ? (
          <img src={url} alt={`Animated preview of ${name}`} className="pixelated max-h-full max-w-full object-contain" style={{ width: 'min(100%, 70vh)' }} />
        ) : (
          <p className="text-muted">Nothing to preview yet.</p>
        )}
      </div>
      <Button onClick={() => setCanvasPreview(false)}>
        <X size={14} /> Back to editing <span className="text-[11px] text-muted">Esc</span>
      </Button>
    </div>
  );
}

/**
 * The drawing surface. `showZoom` keeps the floating zoom controls for layouts
 * without them in the top bar (phones and tablets).
 */
export function PixelCanvas({ showZoom = false }: { showZoom?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const engine = new CanvasEngine(containerRef.current!, mainRef.current!, overlayRef.current!);
    return () => engine.destroy();
  }, []);

  const width = useDocument((s) => s.grid.width);
  const height = useDocument((s) => s.grid.height);
  const zoom = useTool((s) => s.zoom);
  const zoomBy = useTool((s) => s.zoomBy);
  const requestFit = useTool((s) => s.requestFit);
  const canvasPreview = useUi((s) => s.canvasPreview);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={containerRef} className="absolute inset-0">
        <canvas ref={mainRef} className="absolute inset-0" aria-hidden />
        <canvas
          ref={overlayRef}
          tabIndex={0}
          role="img"
          aria-label={`Pixel canvas, ${width} by ${height} cells. Use the drawing tools with a pointer; keyboard shortcuts select tools.`}
          data-testid="pixel-canvas"
          className="absolute inset-0 touch-none outline-none"
          style={{ touchAction: 'none' }}
        />
      </div>
      {canvasPreview && <CanvasPreview />}
      {showZoom && !canvasPreview && (
        <div className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-lg border border-line bg-panel p-0.5 shadow-sm">
          <IconButton label="Zoom out" shortcut="-" tooltipSide="top" onClick={() => zoomBy(0.8)}>
            <Minus size={15} />
          </IconButton>
          <span className="w-12 text-center text-[12px] tabular-nums text-muted" aria-live="polite">{Math.round(zoom * 100) / 100}×</span>
          <IconButton label="Zoom in" shortcut="+" tooltipSide="top" onClick={() => zoomBy(1.25)}>
            <Plus size={15} />
          </IconButton>
          <IconButton label="Fit to screen" shortcut="0" tooltipSide="top" onClick={requestFit}>
            <Maximize size={15} />
          </IconButton>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-panel/80 px-2 py-1 text-[11px] tabular-nums text-muted">
        {width} × {height}
      </div>
    </div>
  );
}
