'use client';

import {
  Circle, Eraser, FlipHorizontal2, FlipVertical2, PaintBucket, Pencil, Pipette, Slash, Square, SquareDashedMousePointer,
  type LucideIcon,
} from 'lucide-react';
import { cx, IconButton, Section, Segmented, Toggle } from '@/components/ui/primitives';
import { type ToolId, TOOLS, useTool } from '@/store/tool';

export const TOOL_ICONS: Record<ToolId, LucideIcon> = {
  pencil: Pencil,
  eraser: Eraser,
  fill: PaintBucket,
  line: Slash,
  rect: Square,
  ellipse: Circle,
  eyedropper: Pipette,
  select: SquareDashedMousePointer,
};

/** Tool buttons; `compact` renders a single horizontal row for the mobile bottom bar. */
export function ToolButtons({ compact }: { compact?: boolean }) {
  const tool = useTool((s) => s.tool);
  const setTool = useTool((s) => s.setTool);
  const mirrorX = useTool((s) => s.mirrorX);
  const mirrorY = useTool((s) => s.mirrorY);
  const set = useTool((s) => s.set);
  const side = compact ? 'top' : 'bottom';
  return (
    <div role="toolbar" aria-label="Drawing tools" className={cx('flex gap-1', compact ? 'flex-nowrap' : 'flex-wrap')}>
      {TOOLS.map((t) => {
        const Icon = TOOL_ICONS[t.id];
        return (
          <IconButton key={t.id} label={t.label} shortcut={t.key} active={tool === t.id} tooltipSide={side} onClick={() => setTool(t.id)}>
            <Icon size={16} />
          </IconButton>
        );
      })}
      <span className="mx-0.5 w-px self-stretch bg-line" aria-hidden />
      <IconButton label="Mirror horizontally" shortcut="X" active={mirrorX} tooltipSide={side} onClick={() => set({ mirrorX: !mirrorX })}>
        <FlipHorizontal2 size={16} />
      </IconButton>
      <IconButton label="Mirror vertically" shortcut="Y" active={mirrorY} tooltipSide={side} onClick={() => set({ mirrorY: !mirrorY })}>
        <FlipVertical2 size={16} />
      </IconButton>
    </div>
  );
}

/** Options for the current tool; the tool buttons themselves live in the top bar. */
export function ToolOptions() {
  const tool = useTool((s) => s.tool);
  const brush = useTool((s) => s.brush);
  const setBrush = useTool((s) => s.setBrush);
  const fillShapes = useTool((s) => s.fillShapes);
  const fill8 = useTool((s) => s.fill8);
  const set = useTool((s) => s.set);
  const usesBrush = ['pencil', 'eraser', 'line', 'rect', 'ellipse'].includes(tool);

  return (
    <Section title="Tool options">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 py-1">
          <span id="brush-label" className={cx(!usesBrush && 'opacity-50')}>Brush size</span>
          <Segmented
            label="Brush size"
            value={String(brush)}
            onChange={(v) => setBrush(Number(v))}
            options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n), title: `${n}×${n} cells` }))}
          />
        </div>
        {(tool === 'rect' || tool === 'ellipse') && (
          <Toggle label="Filled shape" checked={fillShapes} onChange={(v) => set({ fillShapes: v })} />
        )}
        {tool === 'fill' && (
          <Toggle label="8-way fill" hint="Also spread through diagonal neighbors" checked={fill8} onChange={(v) => set({ fill8: v })} />
        )}
        {tool === 'select' && (
          <p className="text-[11px] leading-snug text-muted">Drag to select. Drag inside to move. Arrows nudge, Delete clears, Ctrl+C / Ctrl+V copy and paste.</p>
        )}
        {tool === 'eyedropper' && <p className="text-[11px] leading-snug text-muted">Left click picks primary, right click picks secondary. Hold Alt with any paint tool to pick quickly.</p>}
      </div>
    </Section>
  );
}
