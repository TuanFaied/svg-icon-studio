'use client';

import { Download, FolderOpen, History as HistoryIcon, Keyboard, LayoutTemplate, Monitor, Moon, Redo2, RotateCcw, Sun, Undo2 } from 'lucide-react';
import { Button, IconButton, Segmented } from '@/components/ui/primitives';
import { openProjectFile } from '@/lib/actions';
import { useDocument } from '@/store/document';
import { type Mode, type ThemePref, useUi } from '@/store/ui';

export function Logo() {
  return (
    <svg viewBox="0 0 8 8" width="22" height="22" shapeRendering="crispEdges" aria-hidden>
      <rect width="8" height="8" rx="1.5" fill="var(--accent)" />
      <path fill="var(--accent-fg)" d="M2 2h2v1H2zM5 2h1v1H5zM2 4h1v2H2zM4 4h2v1H4zM5 5h1v1H5zM3 5h1v1H3z" />
    </svg>
  );
}

const THEME_NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };

export function AppHeader({ compact }: { compact?: boolean }) {
  const name = useDocument((s) => s.name);
  const setName = useDocument((s) => s.setName);
  const canUndo = useDocument((s) => s.canUndo);
  const canRedo = useDocument((s) => s.canRedo);
  const undo = useDocument((s) => s.undo);
  const redo = useDocument((s) => s.redo);
  const mode = useUi((s) => s.mode);
  const setMode = useUi((s) => s.setMode);
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const openDialog = useUi((s) => s.openDialog);
  const ThemeIcon = theme === 'system' ? Monitor : theme === 'light' ? Sun : Moon;

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-2 sm:px-3">
      <div className="flex items-center gap-2">
        <Logo />
        {!compact && <span className="hidden font-semibold xl:inline">SVG Icon Studio</span>}
      </div>
      <label className="sr-only" htmlFor="project-name">Project name</label>
      <input
        id="project-name"
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        onBlur={(e) => !e.target.value.trim() && setName('Untitled icon')}
        className="h-8 w-28 min-w-0 rounded-md border border-transparent bg-transparent px-2 font-medium hover:border-line focus:border-line sm:w-44"
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
      <div className="ml-auto flex items-center gap-0.5">
        <IconButton label="Undo" shortcut="Ctrl+Z" disabled={!canUndo} onClick={undo}>
          <Undo2 size={16} />
        </IconButton>
        <IconButton label="Redo" shortcut="Ctrl+Shift+Z" disabled={!canRedo} onClick={redo}>
          <Redo2 size={16} />
        </IconButton>
        <IconButton label="Reset" onClick={() => openDialog('reset')}>
          <RotateCcw size={16} />
        </IconButton>
        <IconButton label="Loader templates" onClick={() => openDialog('templates')}>
          <LayoutTemplate size={16} />
        </IconButton>
        {!compact && (
          <>
            <span className="mx-1 h-5 w-px bg-line" aria-hidden />
            <IconButton label="Open project file" onClick={() => void openProjectFile()}>
              <FolderOpen size={16} />
            </IconButton>
            <IconButton label="Recent projects" onClick={() => openDialog('recent')}>
              <HistoryIcon size={16} />
            </IconButton>
            <IconButton label="Keyboard shortcuts" shortcut="?" onClick={() => openDialog('shortcuts')}>
              <Keyboard size={16} />
            </IconButton>
          </>
        )}
        <IconButton label={`Theme: ${theme}`} onClick={() => setTheme(THEME_NEXT[theme])}>
          <ThemeIcon size={16} />
        </IconButton>
        <Button variant="primary" className="ml-1" onClick={() => openDialog('export')}>
          <Download size={14} />
          <span className="max-sm:sr-only">Export</span>
        </Button>
      </div>
    </header>
  );
}
