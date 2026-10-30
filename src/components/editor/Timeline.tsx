'use client';

import { ArrowLeft, ArrowRight, Copy, Layers, Pause, Play, Plus, SkipBack, Trash2 } from 'lucide-react';
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { alpha, blue, green, red } from '@/core/grid/color';
import {
  clampDuration, type Frame, frameAt, formatTime, fpsToMs, MAX_FRAME_MS, MAX_FRAMES, MIN_FRAME_MS, msToFps,
} from '@/core/frames/frames';
import { Button, cx, IconButton } from '@/components/ui/primitives';
import { useDocument } from '@/store/document';
import { useTool } from '@/store/tool';
import { useUi } from '@/store/ui';

const doc = () => useDocument.getState();

/** Advances frames on the canvas while playing, using each frame's duration. */
function usePlayback() {
  const playing = useUi((s) => s.playing);
  const frameIndex = useDocument((s) => s.frameIndex);
  const frames = useDocument((s) => s.frames);
  useEffect(() => {
    if (!playing) return;
    if (frames.length < 2) {
      useUi.getState().setPlaying(false);
      return;
    }
    const t = setTimeout(() => doc().selectFrame((frameIndex + 1) % frames.length), frames[frameIndex].duration);
    return () => clearTimeout(t);
  }, [playing, frameIndex, frames]);
}

/** Milliseconds since the current frame started showing, ticking with rAF while playing. */
function useFrameElapsed(): number {
  const playing = useUi((s) => s.playing);
  const frameIndex = useDocument((s) => s.frameIndex);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    if (!playing) return;
    const t0 = performance.now();
    let raf = requestAnimationFrame(function tick() {
      setElapsed(performance.now() - t0);
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [playing, frameIndex]);
  return elapsed;
}

function Thumb({ frame, redrawKey }: { frame: Frame; redrawKey: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = frame.grid;
    c.width = g.width;
    c.height = g.height;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(g.width, g.height);
    for (let i = 0, o = 0; i < g.data.length; i++, o += 4) {
      const v = g.data[i];
      img.data[o] = red(v);
      img.data[o + 1] = green(v);
      img.data[o + 2] = blue(v);
      img.data[o + 3] = alpha(v);
    }
    ctx.putImageData(img, 0, 0);
  }, [frame.grid, redrawKey]);
  return <canvas ref={ref} className="checker pixelated size-8 shrink-0 rounded-sm" aria-hidden />;
}

type Drag =
  | { kind: 'scrub'; pointerId: number }
  | { kind: 'move'; pointerId: number; from: number; startX: number; to: number; moved: boolean }
  | { kind: 'resize'; pointerId: number; index: number; startX: number; startMs: number; ms: number };

/**
 * Full-width animation timeline: transport controls, a seconds ruler with a
 * draggable playhead, and one block per frame whose width is its duration.
 * Drag a block to reorder it, drag its right edge to retime it (one undo step
 * each); everything is also keyboard operable.
 */
export function Timeline({ compact }: { compact?: boolean }) {
  usePlayback();
  const elapsed = useFrameElapsed();
  const frames = useDocument((s) => s.frames);
  const frameIndex = useDocument((s) => s.frameIndex);
  const version = useDocument((s) => s.version);
  const playing = useUi((s) => s.playing);
  const setPlaying = useUi((s) => s.setPlaying);
  const onionSkin = useTool((s) => s.onionSkin);
  const setTool = useTool((s) => s.set);
  const [pxPerSec, setPxPerSec] = useState(400);
  const [drag, setDrag] = useState<Drag | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const multi = frames.length > 1;
  const current = frames[frameIndex];
  const durations = frames.map((f, i) => (drag?.kind === 'resize' && drag.index === i ? drag.ms : f.duration));
  const starts = durations.reduce<number[]>((acc, d, i) => [...acc, i === 0 ? 0 : acc[i - 1] + durations[i - 1]], []);
  const total = durations.reduce((t, d) => t + d, 0);
  const pxPerMs = pxPerSec / 1000;
  const now = starts[frameIndex] + Math.min(elapsed, durations[frameIndex]);
  const sameDuration = frames.every((f) => f.duration === frames[0].duration);

  // Keep the current block in view while playing or stepping.
  useEffect(() => {
    trackRef.current?.querySelector(`[data-frame="${frameIndex}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [frameIndex]);

  /** Time (ms) under a pointer, from the track's left edge plus scroll. */
  const timeAt = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(total - 1, (clientX - r.left + el.scrollLeft - 8) / pxPerMs));
  };

  const scrubTo = (clientX: number) => doc().selectFrame(frameAt(starts, timeAt(clientX)));

  const onTrackPointerDown = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-frame], [role="separator"]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setPlaying(false);
    setDrag({ kind: 'scrub', pointerId: e.pointerId });
    scrubTo(e.clientX);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (drag.kind === 'scrub') scrubTo(e.clientX);
    else if (drag.kind === 'resize') {
      const ms = clampDuration(Math.round((drag.startMs + (e.clientX - drag.startX) / pxPerMs) / 10) * 10);
      if (ms !== drag.ms) setDrag({ ...drag, ms });
    } else if (drag.kind === 'move') {
      const moved = drag.moved || Math.abs(e.clientX - drag.startX) > 4;
      // Target slot: how many other blocks have their middle left of the pointer.
      const t = timeAt(e.clientX);
      let to = 0;
      frames.forEach((_, i) => {
        if (i !== drag.from && starts[i] + durations[i] / 2 < t) to++;
      });
      if (moved !== drag.moved || to !== drag.to) setDrag({ ...drag, moved, to });
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (drag.kind === 'resize' && drag.ms !== frames[drag.index].duration) doc().setFrameDuration(drag.index, drag.ms);
    if (drag.kind === 'move') {
      // Selected on pointer-down; a real drag also moves it.
      if (drag.moved && drag.to !== drag.from) doc().moveFrame(drag.from, drag.to);
    }
    setDrag(null);
  };

  const focusBlock = (i: number) =>
    requestAnimationFrame(() => trackRef.current?.querySelector<HTMLElement>(`[data-frame="${i}"]`)?.focus());

  const controls = (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      {multi && (
        <div className="flex items-center gap-0.5" role="group" aria-label="Playback">
          <IconButton label="Jump to first frame" tooltipSide="top" onClick={() => { setPlaying(false); doc().selectFrame(0); }}>
            <SkipBack size={15} />
          </IconButton>
          <IconButton label={playing ? 'Pause animation' : 'Play animation'} shortcut="Enter" tooltipSide="top" active={playing} onClick={() => setPlaying(!playing)}>
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </IconButton>
          <span className="w-28 text-[12px] tabular-nums text-muted" aria-label="Playhead time">
            <span className="text-fg">{formatTime(now)}</span> / {formatTime(total)}
          </span>
        </div>
      )}

      <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="Frame actions">
        {multi ? (
          <IconButton label="Add blank frame" tooltipSide="top" disabled={frames.length >= MAX_FRAMES} onClick={() => doc().addFrame()}>
            <Plus size={15} />
          </IconButton>
        ) : (
          <Button size="sm" onClick={() => doc().addFrame()}>
            <Plus size={13} /> Add frame to animate
          </Button>
        )}
        <IconButton label="Duplicate frame" tooltipSide="top" disabled={frames.length >= MAX_FRAMES} onClick={() => doc().duplicateCurrentFrame()}>
          <Copy size={15} />
        </IconButton>
        {multi && (
          <>
            <IconButton label="Delete frame" tooltipSide="top" onClick={() => doc().deleteCurrentFrame()}>
              <Trash2 size={15} />
            </IconButton>
            <IconButton label="Move frame left" tooltipSide="top" disabled={frameIndex === 0} onClick={() => doc().moveFrame(frameIndex, frameIndex - 1)}>
              <ArrowLeft size={15} />
            </IconButton>
            <IconButton label="Move frame right" tooltipSide="top" disabled={frameIndex === frames.length - 1} onClick={() => doc().moveFrame(frameIndex, frameIndex + 1)}>
              <ArrowRight size={15} />
            </IconButton>
          </>
        )}
      </div>

      {multi && (
        <>
          <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted">
            Frame
            <input
              type="number"
              min={MIN_FRAME_MS}
              max={MAX_FRAME_MS}
              step={10}
              value={current.duration}
              onChange={(e) => doc().setFrameDuration(frameIndex, Number(e.target.value))}
              aria-label="Current frame duration in milliseconds"
              className="h-7 w-16 rounded-md border border-line bg-panel px-1.5 tabular-nums text-fg"
            />
            ms
          </label>
          <label className={cx('flex shrink-0 items-center gap-1 text-[11px] text-muted', compact && 'max-md:hidden')}>
            All
            <input
              type="number"
              min={0.2}
              max={50}
              step={1}
              value={sameDuration ? msToFps(frames[0].duration) : ''}
              placeholder="mixed"
              onChange={(e) => {
                const fps = Number(e.target.value);
                if (fps > 0) doc().setAllFrameDurations(fpsToMs(fps));
              }}
              aria-label="Frames per second for every frame"
              className="h-7 w-14 rounded-md border border-line bg-panel px-1.5 tabular-nums text-fg"
            />
            fps
          </label>
        </>
      )}

      <span className="shrink-0 text-[11px] tabular-nums text-muted" aria-live="polite">
        {frames.length} {frames.length === 1 ? 'frame' : 'frames'}
        {multi && ` · ${(total / 1000).toFixed(2)} s`}
      </span>

      {multi && (
        <div className="ml-auto flex items-center gap-1">
          <IconButton label="Onion skin" tooltipSide="top" active={onionSkin} onClick={() => setTool({ onionSkin: !onionSkin })}>
            <Layers size={15} />
          </IconButton>
          {!compact && (
            <label className="flex items-center gap-1 text-[11px] text-muted">
              Zoom
              <input
                type="range"
                min={60}
                max={1200}
                step={20}
                value={pxPerSec}
                onChange={(e) => setPxPerSec(Number(e.target.value))}
                aria-label="Timeline zoom"
                className="w-24"
              />
            </label>
          )}
        </div>
      )}
    </div>
  );

  // Ruler ticks every 100 ms; labels every second (or every 500 ms when zoomed in).
  const labelEvery = pxPerSec >= 600 ? 500 : 1000;
  const ticks: number[] = [];
  for (let t = 0; t <= total + 1000; t += 100) ticks.push(t);
  const width = (total + 1000) * pxPerMs + 16;

  return (
    <section aria-label="Animation timeline" className="flex min-w-0 shrink-0 flex-col gap-1 border-t border-line bg-panel px-2 py-1.5">
      {controls}
      {multi && (
        <div
          ref={trackRef}
          className="relative overflow-x-auto overflow-y-hidden rounded-md border border-line bg-panel-2 select-none"
          onPointerDown={onTrackPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDrag(null)}
        >
          <div className="relative" style={{ width, height: compact ? 64 : 72 }}>
            {/* Ruler */}
            <div className="absolute inset-x-0 top-0 h-5 cursor-ew-resize border-b border-line" aria-hidden>
              {ticks.map((t) => (
                <span
                  key={t}
                  className={cx('absolute bottom-0 w-px', t % labelEvery === 0 ? 'h-2.5 bg-line-strong' : 'h-1.5 bg-line')}
                  style={{ left: 8 + t * pxPerMs }}
                >
                  {t % labelEvery === 0 && <span className="absolute -top-3.5 left-1 text-[10px] tabular-nums text-muted">{t / 1000}s</span>}
                </span>
              ))}
            </div>

            {/* Frame blocks */}
            <ol aria-label="Frames" className="absolute inset-x-0 top-6 bottom-1">
              {frames.map((f, i) => {
                const left = 8 + starts[i] * pxPerMs;
                const w = Math.max(6, durations[i] * pxPerMs);
                const isCurrent = i === frameIndex;
                const dragging = drag?.kind === 'move' && drag.moved && drag.from === i;
                return (
                  <li key={f.id} className="absolute top-0 bottom-0" style={{ left, width: w }}>
                    <button
                      type="button"
                      data-frame={i}
                      aria-label={`Frame ${i + 1}, ${durations[i]} ms${isCurrent ? ' (current)' : ''}`}
                      aria-current={isCurrent ? 'true' : undefined}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        trackRef.current?.setPointerCapture(e.pointerId);
                        setPlaying(false);
                        // Pressing a block selects it, so a dragged frame stays the current one.
                        doc().selectFrame(i);
                        setDrag({ kind: 'move', pointerId: e.pointerId, from: i, startX: e.clientX, to: i, moved: false });
                      }}
                      onClick={(e) => {
                        // Pointer clicks are handled on pointer-up; this covers Enter / Space.
                        if (e.detail === 0) doc().selectFrame(i);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                        e.preventDefault();
                        const j = e.key === 'ArrowLeft' ? i - 1 : i + 1;
                        if (j < 0 || j >= frames.length) return;
                        if (e.altKey) doc().moveFrame(i, j);
                        else doc().selectFrame(j);
                        focusBlock(j);
                      }}
                      className={cx(
                        'flex h-full w-full items-center gap-1 overflow-hidden rounded-md border px-1 text-left transition-colors',
                        isCurrent ? 'border-accent bg-accent-soft' : 'border-line bg-panel hover:border-line-strong',
                        dragging && 'opacity-60',
                      )}
                    >
                      {w >= 40 && <Thumb frame={f} redrawKey={isCurrent ? version : -1} />}
                      {w >= 16 && <span className={cx('text-[10px] tabular-nums', isCurrent ? 'text-accent' : 'text-muted')}>{i + 1}</span>}
                    </button>
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Frame ${i + 1} duration`}
                      aria-valuemin={MIN_FRAME_MS}
                      aria-valuemax={MAX_FRAME_MS}
                      aria-valuenow={durations[i]}
                      aria-valuetext={`${durations[i]} ms`}
                      tabIndex={0}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        trackRef.current?.setPointerCapture(e.pointerId);
                        setDrag({ kind: 'resize', pointerId: e.pointerId, index: i, startX: e.clientX, startMs: f.duration, ms: f.duration });
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                        e.preventDefault();
                        const step = (e.shiftKey ? 100 : 10) * (e.key === 'ArrowLeft' ? -1 : 1);
                        doc().setFrameDuration(i, f.duration + step);
                      }}
                      className="absolute top-0 -right-1 bottom-0 z-10 w-2 cursor-ew-resize rounded-sm hover:bg-accent focus-visible:bg-accent"
                    />
                  </li>
                );
              })}
            </ol>

            {/* Drop position while reordering */}
            {drag?.kind === 'move' && drag.moved && (
              <span
                className="pointer-events-none absolute top-6 bottom-1 w-0.5 rounded bg-accent"
                style={{
                  left: 7 + (() => {
                    const order = frames.map((_, i) => i).filter((i) => i !== drag.from);
                    const before = order.slice(0, drag.to);
                    return before.reduce((t, i) => t + durations[i], 0) * pxPerMs;
                  })(),
                }}
                aria-hidden
              />
            )}

            {/* Loop end */}
            <span className="pointer-events-none absolute top-0 bottom-0 w-px bg-muted/60" style={{ left: 8 + total * pxPerMs }} aria-hidden />

            {/* Playhead */}
            <span className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-danger" style={{ left: 7 + now * pxPerMs }} data-testid="playhead" aria-hidden>
              <span className="absolute -top-0.5 -left-1 size-2.5 rotate-45 rounded-[1px] bg-danger" />
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
