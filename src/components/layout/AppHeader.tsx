'use client';

import {
  Download, Eye, FolderOpen, History as HistoryIcon, Keyboard, LayoutTemplate, Maximize, Minus, MoreHorizontal, Plus, Redo2,
  RotateCcw, Save, Undo2,
} from 'lucide-react';
import { ToolButtons } from '@/components/editor/DrawingToolbar';
import { Menu, type MenuEntry } from '@/components/ui/Menu';
import { Button, IconButton, Segmented } from '@/components/ui/primitives';
import { openProjectFile, saveProjectFile } from '@/lib/actions';
import { useDocument } from '@/store/document';
import { useTool } from '@/store/tool';
import { type Mode, type ThemePref, useUi } from '@/store/ui';

export function Logo() {
  return (
    <svg viewBox="0 0 8 8" width="22" height="22" shapeRendering="crispEdges" aria-hidden>
      <rect width="8" height="8" rx="1.5" fill="var(--accent)" />
      <path fill="var(--accent-fg)" d="M2 2h2v1H2zM5 2h1v1H5zM2 4h1v2H2zM4 4h2v1H4zM5 5h1v1H5zM3 5h1v1H3z" />
    </svg>
  );
}

/** View options for the canvas: overlays, background preview, onion skin, play-on-canvas. */
function ViewMenu() {
  // Individual selectors: subscribing to the whole tool store would re-render on every pan / zoom.
  const t = {
    showGrid: useTool((s) => s.showGrid),
    showBoundary: useTool((s) => s.showBoundary),
    onionSkin: useTool((s) => s.onionSkin),
    background: useTool((s) => s.background),
    set: useTool((s) => s.set),
  };
  const frames = useDocument((s) => s.frames.length);
  const canvasPreview = useUi((s) => s.canvasPreview);
  const setCanvasPreview = useUi((s) => s.setCanvasPreview);
  const entries: MenuEntry[] = [
    { kind: 'check', label: 'Grid lines', checked: t.showGrid, onChange: (showGrid) => t.set({ showGrid }) },
    { kind: 'check', label: 'Canvas boundary', checked: t.showBoundary, onChange: (showBoundary) => t.set({ showBoundary }) },
    { kind: 'check', label: 'Onion skin', checked: t.onionSkin, disabled: frames < 2, onChange: (onionSkin) => t.set({ onionSkin }) },
    { kind: 'separator' },
    { kind: 'label', label: 'Background preview' },
    { kind: 'radio', label: 'Checkerboard', checked: t.background === 'checker', onSelect: () => t.set({ background: 'checker' }) },
    { kind: 'radio', label: 'Light', checked: t.background === 'light', onSelect: () => t.set({ background: 'light' }) },
    { kind: 'radio', label: 'Dark', checked: t.background === 'dark', onSelect: () => t.set({ background: 'dark' }) },
    { kind: 'separator' },
    { kind: 'check', label: 'Play animation on canvas', checked: canvasPreview, onChange: setCanvasPreview },
  ];
  return <Menu label="View options" icon={<Eye size={16} />} entries={entries} />;
}

function ZoomControls() {
  const zoom = useTool((s) => s.zoom);
  const zoomBy = useTool((s) => s.zoomBy);
  const requestFit = useTool((s) => s.requestFit);
  return (
    <div className="flex items-center" role="group" aria-label="Zoom">
      <IconButton label="Fit to screen" shortcut="0" onClick={requestFit}>
        <Maximize size={15} />
      </IconButton>
      <IconButton label="Zoom out" shortcut="-" onClick={() => zoomBy(0.8)}>
        <Minus size={15} />
      </IconButton>
      <span className="w-11 text-center text-[12px] tabular-nums text-muted" aria-live="polite" aria-label="Zoom level">
        {Math.round(zoom * 100) / 100}×
      </span>
      <IconButton label="Zoom in" shortcut="+" onClick={() => zoomBy(1.25)}>
        <Plus size={15} />
      </IconButton>
    </div>
  );
}

/** Less frequent document actions. */
function MoreMenu() {
  const openDialog = useUi((s) => s.openDialog);
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const themes: Array<[ThemePref, string]> = [['dark', 'Dark'], ['light', 'Light'], ['system', 'Match system']];
  const entries: MenuEntry[] = [
    { kind: 'item', label: 'Open project file…', icon: <FolderOpen size={14} />, onSelect: () => void openProjectFile() },
    { kind: 'item', label: 'Save project file', icon: <Save size={14} />, shortcut: 'Ctrl+S', onSelect: saveProjectFile },
    { kind: 'item', label: 'Recent projects', icon: <HistoryIcon size={14} />, onSelect: () => openDialog('recent') },
    { kind: 'item', label: 'Loader templates', icon: <LayoutTemplate size={14} />, onSelect: () => openDialog('templates') },
    { kind: 'item', label: 'Reset…', icon: <RotateCcw size={14} />, onSelect: () => openDialog('reset') },
    { kind: 'separator' },
    { kind: 'item', label: 'Keyboard shortcuts', icon: <Keyboard size={14} />, shortcut: '?', onSelect: () => openDialog('shortcuts') },
    { kind: 'label', label: 'Theme' },
    ...themes.map(([value, label]): MenuEntry => ({ kind: 'radio', label, checked: theme === value, onSelect: () => setTheme(value) })),
  ];
  return <Menu label="More actions" icon={<MoreHorizontal size={16} />} entries={entries} />;
}

export function AppHeader({ compact }: { compact?: boolean }) {
  const name = useDocument((s) => s.name);
  const setName = useDocument((s) => s.setName);
  const canUndo = useDocument((s) => s.canUndo);
  const canRedo = useDocument((s) => s.canRedo);
  const undo = useDocument((s) => s.undo);
  const redo = useDocument((s) => s.redo);
  const mode = useUi((s) => s.mode);
  const setMode = useUi((s) => s.setMode);
  const openDialog = useUi((s) => s.openDialog);
  const draw = mode === 'draw';

  return (
    <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-line bg-panel px-2 sm:px-3">
      <div className="flex min-w-0 items-center gap-2">
        <Logo />
        <label className="sr-only" htmlFor="project-name">Project name</label>
        <input
          id="project-name"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onBlur={(e) => !e.target.value.trim() && setName('Untitled icon')}
          className="h-8 w-28 min-w-0 rounded-md border border-transparent bg-transparent px-2 font-medium hover:border-line focus:border-line sm:w-40"
        />
        <Segmented<Mode>
          label="Mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'draw', label: 'Draw' },
            { value: 'convert', label: 'Convert' },
          ]}
        />
      </div>

      <div className="flex justify-center">{draw && !compact && <ToolButtons />}</div>

      <div className="flex items-center justify-end gap-0.5">
        <IconButton label="Undo" shortcut="Ctrl+Z" disabled={!canUndo} onClick={undo}>
          <Undo2 size={16} />
        </IconButton>
        <IconButton label="Redo" shortcut="Ctrl+Shift+Z" disabled={!canRedo} onClick={redo}>
          <Redo2 size={16} />
        </IconButton>
        {draw && !compact && (
          <>
            <span className="mx-1 h-5 w-px bg-line" aria-hidden />
            <ViewMenu />
            <ZoomControls />
          </>
        )}
        <Button variant="primary" className="ml-1" onClick={() => openDialog('export')}>
          <Download size={14} />
          <span className="max-sm:sr-only">Export</span>
        </Button>
        <MoreMenu />
      </div>
    </header>
  );
}
