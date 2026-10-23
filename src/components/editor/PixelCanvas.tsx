'use client';

import { Maximize, Minus, Plus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { IconButton } from '@/components/ui/primitives';
import { useDocument } from '@/store/document';
import { useTool } from '@/store/tool';
import { CanvasEngine } from './engine';

export function PixelCanvas() {
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
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-panel/80 px-2 py-1 text-[11px] tabular-nums text-muted">
        {width} × {height}
      </div>
    </div>
  );
}
