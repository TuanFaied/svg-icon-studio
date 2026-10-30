'use client';

import { Copy, FlipHorizontal2, FlipVertical2, SquareDashed, Trash2 } from 'lucide-react';
import { Button, NumberField, Section } from '@/components/ui/primitives';
import { copySelection, deleteSelection, flipSelection, moveSelectionTo } from '@/lib/selection';
import { useTool } from '@/store/tool';
import { useUi } from '@/store/ui';

/** Properties of the current selection (Select tool): position, size and actions. */
export function SelectionProperties() {
  const selection = useTool((s) => s.selection);
  const tool = useTool((s) => s.tool);
  const set = useTool((s) => s.set);
  const toast = useUi((s) => s.toast);
  if (tool !== 'select' || !selection) return null;

  return (
    <Section title="Selection">
      <div className="flex items-end gap-2">
        <NumberField label="X" min={-128} max={256} value={selection.x} onChange={(x) => moveSelectionTo(x, selection.y)} />
        <NumberField label="Y" min={-128} max={256} value={selection.y} onChange={(y) => moveSelectionTo(selection.x, y)} />
        <p className="shrink-0 pb-1.5 text-[12px] tabular-nums text-muted" aria-label="Selection size">
          {selection.w} × {selection.h}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <Button size="sm" onClick={() => flipSelection('horizontal')}>
          <FlipHorizontal2 size={13} /> Flip horizontal
        </Button>
        <Button size="sm" onClick={() => flipSelection('vertical')}>
          <FlipVertical2 size={13} /> Flip vertical
        </Button>
        <Button size="sm" onClick={() => copySelection() && toast('Selection copied. Paste with Ctrl+V.')}>
          <Copy size={13} /> Copy
        </Button>
        <Button size="sm" variant="danger" onClick={() => deleteSelection()}>
          <Trash2 size={13} /> Delete
        </Button>
        <Button size="sm" variant="ghost" onClick={() => set({ selection: null })}>
          <SquareDashed size={13} /> Deselect
        </Button>
      </div>
    </Section>
  );
}
