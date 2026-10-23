'use client';

import { useState } from 'react';
import { clampSize, isEmpty, MAX_SIZE } from '@/core/grid/grid';
import { ANCHORS, type Anchor } from '@/core/grid/ops';
import { Dialog } from '@/components/ui/Dialog';
import { Button, cx, NumberField, Section, Segmented, Toggle } from '@/components/ui/primitives';
import { useDocument } from '@/store/document';
import { useTool } from '@/store/tool';
import { useUi } from '@/store/ui';

const PRESETS = [8, 16, 24, 32, 48, 64];

export function applySize(width: number, height: number): void {
  const w = clampSize(width);
  const h = clampSize(height);
  const doc = useDocument.getState();
  if (w === doc.grid.width && h === doc.grid.height) return;
  // Empty drawings resize directly; anything with pixels asks how to crop / pad.
  if (isEmpty(doc.grid)) doc.resizeCanvas(w, h, 'tl');
  else useUi.getState().requestResize(w, h);
}

export function CanvasSettings() {
  const width = useDocument((s) => s.grid.width);
  const height = useDocument((s) => s.grid.height);
  const showGrid = useTool((s) => s.showGrid);
  const showBoundary = useTool((s) => s.showBoundary);
  const background = useTool((s) => s.background);
  const set = useTool((s) => s.set);
  const [custom, setCustom] = useState({ w: width, h: height });
  const [lastSize, setLastSize] = useState(`${width}x${height}`);
  if (lastSize !== `${width}x${height}`) {
    setLastSize(`${width}x${height}`);
    setCustom({ w: width, h: height });
  }

  return (
    <Section title="Canvas">
      <div className="grid grid-cols-6 gap-1" role="group" aria-label="Canvas size presets">
        {PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={width === n && height === n}
            onClick={() => applySize(n, n)}
            className={cx(
              'h-7 rounded-md border text-[12px] tabular-nums transition-colors',
              width === n && height === n ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:bg-panel-2',
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <form
        className="mt-2 flex items-end gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          applySize(custom.w, custom.h);
        }}
      >
        <NumberField label="Width" min={1} max={MAX_SIZE} value={custom.w} onChange={(w) => setCustom((c) => ({ ...c, w }))} />
        <span className="pb-1.5 text-muted">×</span>
        <NumberField label="Height" min={1} max={MAX_SIZE} value={custom.h} onChange={(h) => setCustom((c) => ({ ...c, h }))} />
        <Button type="submit" size="sm" className="mb-px" disabled={clampSize(custom.w) === width && clampSize(custom.h) === height}>
          Apply
        </Button>
      </form>
      <p className="mt-1 text-[11px] text-muted">1 to {MAX_SIZE} cells per side.</p>

      <div className="mt-2">
        <Toggle label="Grid lines" checked={showGrid} onChange={(v) => set({ showGrid: v })} hint="G" />
        <Toggle label="Canvas boundary" checked={showBoundary} onChange={(v) => set({ showBoundary: v })} />
        <div className="flex items-center justify-between py-1">
          <span>Background preview</span>
          <Segmented
            label="Background preview"
            value={background}
            onChange={(v) => set({ background: v })}
            options={[
              { value: 'checker', label: 'Checker' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </div>
        <p className="text-[11px] text-muted">Preview only. Never exported unless “Include background” is on.</p>
      </div>
    </Section>
  );
}

const ANCHOR_LABELS: Record<Anchor, string> = {
  tl: 'Top left', t: 'Top', tr: 'Top right', l: 'Left', c: 'Center', r: 'Right', bl: 'Bottom left', b: 'Bottom', br: 'Bottom right',
};

export function ResizeDialog() {
  const open = useUi((s) => s.dialog === 'resize');
  const pending = useUi((s) => s.pendingResize);
  const close = () => useUi.setState({ dialog: null, pendingResize: null });
  const grid = useDocument((s) => s.grid);
  const resizeCanvas = useDocument((s) => s.resizeCanvas);
  const [anchor, setAnchor] = useState<Anchor>('c');

  if (!pending) return null;
  const crops = pending.width < grid.width || pending.height < grid.height;

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Resize canvas"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              resizeCanvas(pending.width, pending.height, anchor);
              close();
            }}
          >
            {crops ? 'Crop' : 'Pad'} to {pending.width} × {pending.height}
          </Button>
        </>
      }
    >
      <p className="mb-3 leading-relaxed">
        Changing from {grid.width} × {grid.height} to {pending.width} × {pending.height}.{' '}
        {crops ? 'Pixels outside the new bounds will be cropped.' : 'Empty cells will be added.'} Choose which part to keep fixed. You can undo this.
      </p>
      <div role="radiogroup" aria-label="Anchor" className="mx-auto grid w-max grid-cols-3 gap-1">
        {ANCHORS.map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={anchor === a}
            aria-label={ANCHOR_LABELS[a]}
            title={ANCHOR_LABELS[a]}
            onClick={() => setAnchor(a)}
            className={cx('size-9 rounded-md border', anchor === a ? 'border-accent bg-accent' : 'border-line bg-panel-2 hover:bg-line')}
          />
        ))}
      </div>
    </Dialog>
  );
}
