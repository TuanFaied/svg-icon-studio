'use client';

import { useEffect } from 'react';
import { useDocument } from '@/store/document';
import { TOOLS, useTool } from '@/store/tool';
import { useUi } from '@/store/ui';
import { saveProjectFile } from './actions';
import { copySelection, deleteSelection, nudgeSelection, pasteClipboard } from './selection';

/** True when keystrokes belong to a text field or the code editor. */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.closest) return false;
  return !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .cm-editor');
}

export const SHORTCUTS: Array<{ keys: string; action: string }> = [
  ...TOOLS.map((t) => ({ keys: t.key, action: t.label })),
  { keys: 'X / Y', action: 'Toggle horizontal / vertical mirror' },
  { keys: 'Alt + click', action: 'Pick color with any paint tool' },
  { keys: 'Right click', action: 'Paint with secondary color' },
  { keys: 'Space + drag', action: 'Pan (also middle mouse / two fingers)' },
  { keys: 'Ctrl + scroll', action: 'Zoom at cursor (also pinch)' },
  { keys: '+ / −', action: 'Zoom in / out' },
  { keys: '0', action: 'Fit to screen' },
  { keys: 'G', action: 'Toggle grid lines' },
  { keys: '[ / ]', action: 'Brush size down / up' },
  { keys: 'Shift (while dragging)', action: 'Snap line to 45° / constrain square' },
  { keys: 'Arrows', action: 'Nudge selection by 1 cell' },
  { keys: 'Delete', action: 'Clear selection' },
  { keys: 'Ctrl + C / V', action: 'Copy / paste selection' },
  { keys: 'Esc', action: 'Deselect' },
  { keys: ', / .', action: 'Previous / next animation frame' },
  { keys: 'Enter', action: 'Play / pause the frame animation' },
  { keys: 'Ctrl + Z', action: 'Undo' },
  { keys: 'Ctrl + Shift + Z / Ctrl + Y', action: 'Redo' },
  { keys: 'Ctrl + S', action: 'Save project file' },
  { keys: '?', action: 'Show this list' },
];

export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target)) return;
      const ui = useUi.getState();
      if (ui.dialog) return; // dialogs handle their own keys
      const doc = useDocument.getState();
      const tool = useTool.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key;
      const lower = key.toLowerCase();
      const handled = () => e.preventDefault();

      if (mod) {
        if (lower === 'z' && !e.shiftKey) { handled(); doc.undo(); return; }
        if ((lower === 'z' && e.shiftKey) || lower === 'y') { handled(); doc.redo(); return; }
        if (lower === 's') { handled(); saveProjectFile(); return; }
        if (ui.mode !== 'draw') return;
        if (lower === 'c' && copySelection()) { handled(); return; }
        if (lower === 'v' && tool.clipboard && pasteClipboard()) { handled(); return; }
        return;
      }
      if (e.altKey) return;

      if (key === '?') { handled(); ui.openDialog('shortcuts'); return; }
      if (ui.mode !== 'draw') return;

      const def = TOOLS.find((t) => t.key.toLowerCase() === lower);
      if (def && !e.shiftKey) { handled(); tool.setTool(def.id); return; }

      switch (key) {
        case 'x': case 'X': handled(); tool.set({ mirrorX: !tool.mirrorX }); return;
        case 'y': case 'Y': handled(); tool.set({ mirrorY: !tool.mirrorY }); return;
        case 'g': case 'G': handled(); tool.set({ showGrid: !tool.showGrid }); return;
        case '0': handled(); tool.requestFit(); return;
        case '+': case '=': handled(); tool.zoomBy(1.25); return;
        case '-': case '_': handled(); tool.zoomBy(0.8); return;
        case '[': handled(); tool.setBrush(tool.brush - 1); return;
        case ']': handled(); tool.setBrush(tool.brush + 1); return;
        case 'Escape': if (tool.selection) { handled(); tool.set({ selection: null }); } return;
        case ',': case '<': {
          handled();
          const { frames, frameIndex } = doc;
          doc.selectFrame((frameIndex - 1 + frames.length) % frames.length);
          return;
        }
        case '.': case '>': {
          handled();
          doc.selectFrame((doc.frameIndex + 1) % doc.frames.length);
          return;
        }
        case 'Enter': {
          // Enter on a focused button or link activates it instead.
          if ((e.target as HTMLElement | null)?.closest?.('button, a, [role="button"]')) return;
          if (doc.frames.length < 2) return;
          handled();
          ui.setPlaying(!ui.playing);
          return;
        }
        case 'Delete': case 'Backspace': if (deleteSelection()) handled(); return;
        case 'ArrowLeft': if (nudgeSelection(-1, 0)) handled(); return;
        case 'ArrowRight': if (nudgeSelection(1, 0)) handled(); return;
        case 'ArrowUp': if (nudgeSelection(0, -1)) handled(); return;
        case 'ArrowDown': if (nudgeSelection(0, 1)) handled(); return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
