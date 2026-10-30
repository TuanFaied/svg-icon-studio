'use client';

import { clearRegion, clipRect, extractRegion, type FlipAxis, flipRegion, moveRegion, pasteRegion } from '@/core/grid/ops';
import { PatchRecorder } from '@/core/history/patch';
import { useDocument } from '@/store/document';
import { useTool } from '@/store/tool';

export function nudgeSelection(dx: number, dy: number): boolean {
  const { selection, set } = useTool.getState();
  if (!selection) return false;
  const doc = useDocument.getState();
  const rec = new PatchRecorder(doc.grid);
  moveRegion(rec, selection, dx, dy);
  doc.commitPatches(rec.toPatches(), 'Nudge selection');
  set({ selection: { ...selection, x: selection.x + dx, y: selection.y + dy } });
  return true;
}

export function deleteSelection(): boolean {
  const { selection } = useTool.getState();
  if (!selection) return false;
  const doc = useDocument.getState();
  const r = clipRect(selection, doc.grid);
  if (!r) return false;
  const rec = new PatchRecorder(doc.grid);
  clearRegion(rec, r);
  doc.commitPatches(rec.toPatches(), 'Delete selection');
  return true;
}

export function copySelection(): boolean {
  const { selection, set } = useTool.getState();
  if (!selection) return false;
  set({ clipboard: extractRegion(useDocument.getState().grid, selection) });
  return true;
}

export function pasteClipboard(): boolean {
  const t = useTool.getState();
  const buf = t.clipboard;
  if (!buf) return false;
  const doc = useDocument.getState();
  const x = t.selection ? t.selection.x : 0;
  const y = t.selection ? t.selection.y : 0;
  const rec = new PatchRecorder(doc.grid);
  pasteRegion(rec, buf, x, y);
  doc.commitPatches(rec.toPatches(), 'Paste');
  t.set({ tool: 'select', selection: { x, y, w: buf.width, h: buf.height } });
  return true;
}

export function flipSelection(axis: FlipAxis): boolean {
  const { selection } = useTool.getState();
  if (!selection) return false;
  const doc = useDocument.getState();
  const rec = new PatchRecorder(doc.grid);
  flipRegion(rec, selection, axis);
  doc.commitPatches(rec.toPatches(), axis === 'horizontal' ? 'Flip horizontally' : 'Flip vertically');
  return true;
}

/** Moves the selected pixels so the selection's top-left corner lands at (x, y). */
export function moveSelectionTo(x: number, y: number): boolean {
  const { selection } = useTool.getState();
  if (!selection || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const dx = Math.round(x) - selection.x;
  const dy = Math.round(y) - selection.y;
  return dx === 0 && dy === 0 ? false : nudgeSelection(dx, dy);
}
