'use client';

import { ArrowLeft, ArrowRight, Copy, Layers, Pause, Play, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { alpha, blue, green, red } from '@/core/grid/color';
import { type Frame, fpsToMs, MAX_FRAME_MS, MAX_FRAMES, MIN_FRAME_MS, msToFps, totalDuration } from '@/core/frames/frames';
import { cx, IconButton } from '@/components/ui/primitives';
import { useDocument } from '@/store/document';
import { useTool } from '@/store/tool';
import { useUi } from '@/store/ui';

function FrameThumb({ frame, index, current, version, onSelect }: { frame: Frame; index: number; current: boolean; version: number; onSelect: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // The current frame changes with every edit; others only change while current.
  const redrawKey = current ? version : -1;
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

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-label={`Frame ${index + 1}, ${frame.duration} ms${current ? ' (current)' : ''}`}
        aria-current={current ? 'true' : undefined}
        data-frame={index}
        className={cx(
          'flex flex-col items-center gap-0.5 rounded-md border p-0.5 transition-colors',
          current ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong',
        )}
      >
        <canvas ref={ref} className="checker pixelated size-9 rounded-sm" aria-hidden />
        <span className={cx('text-[10px] tabular-nums', current ? 'text-accent' : 'text-muted')}>{index + 1}</span>
      </button>
    </li>
  );
}

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
    const t = setTimeout(() => useDocument.getState().selectFrame((frameIndex + 1) % frames.length), frames[frameIndex].duration);
    return () => clearTimeout(t);
  }, [playing, frameIndex, frames]);
}

export function FrameTimeline() {
  usePlayback();
  const frames = useDocument((s) => s.frames);
  const frameIndex = useDocument((s) => s.frameIndex);
  const version = useDocument((s) => s.version);
  const doc = useDocument.getState;
  const playing = useUi((s) => s.playing);
  const setPlaying = useUi((s) => s.setPlaying);
  const onionSkin = useTool((s) => s.onionSkin);
  const setTool = useTool((s) => s.set);
  const listRef = useRef<HTMLOListElement>(null);

  const current = frames[frameIndex];
  const multi = frames.length > 1;
  const sameDuration = frames.every((f) => f.duration === frames[0].duration);

  // Keep the current thumbnail in view while playing or stepping.
  useEffect(() => {
    listRef.current?.querySelector(`[data-frame="${frameIndex}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [frameIndex]);

  return (
    <section aria-label="Animation frames" className="flex min-w-0 flex-col gap-1 border-t border-line bg-panel px-2 py-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <IconButton
        label={playing ? 'Pause animation' : 'Play animation'}
        shortcut="Enter"
        tooltipSide="top"
        disabled={!multi}
        active={playing}
        onClick={() => setPlaying(!playing)}
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </IconButton>

      <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="Frame actions">
        <IconButton label="Add blank frame" tooltipSide="top" disabled={frames.length >= MAX_FRAMES} onClick={() => doc().addFrame()}>
          <Plus size={15} />
        </IconButton>
        <IconButton label="Duplicate frame" tooltipSide="top" disabled={frames.length >= MAX_FRAMES} onClick={() => doc().duplicateCurrentFrame()}>
          <Copy size={15} />
        </IconButton>
        <IconButton label="Delete frame" tooltipSide="top" disabled={!multi} onClick={() => doc().deleteCurrentFrame()}>
          <Trash2 size={15} />
        </IconButton>
        <IconButton label="Move frame left" tooltipSide="top" disabled={frameIndex === 0} onClick={() => doc().moveFrame(frameIndex, frameIndex - 1)}>
          <ArrowLeft size={15} />
        </IconButton>
        <IconButton label="Move frame right" tooltipSide="top" disabled={frameIndex === frames.length - 1} onClick={() => doc().moveFrame(frameIndex, frameIndex + 1)}>
          <ArrowRight size={15} />
        </IconButton>
      </div>

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
      <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted max-md:hidden">
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
      <span className="shrink-0 text-[11px] tabular-nums text-muted max-lg:hidden" aria-live="polite">
        {frames.length} {frames.length === 1 ? 'frame' : 'frames'}
        {multi && ` · ${(totalDuration(frames) / 1000).toFixed(2)} s`}
      </span>
      <IconButton
        label="Onion skin"
        tooltipSide="top"
        active={onionSkin}
        disabled={!multi}
        onClick={() => setTool({ onionSkin: !onionSkin })}
      >
        <Layers size={15} />
      </IconButton>
      </div>
      <ol ref={listRef} aria-label="Frames" className="flex min-w-0 gap-1 overflow-x-auto pb-0.5">
        {frames.map((f, i) => (
          <FrameThumb key={f.id} frame={f} index={i} current={i === frameIndex} version={version} onSelect={() => doc().selectFrame(i)} />
        ))}
      </ol>
    </section>
  );
}
