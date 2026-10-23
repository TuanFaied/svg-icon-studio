'use client';

import { ChevronDown, ChevronUp, Copy, Download, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { ToolButtons } from '@/components/editor/DrawingToolbar';
import { DocumentSettings } from '@/components/output/DocumentSettings';
import { SvgCodeEditor } from '@/components/output/SvgCodeEditor';
import { ContextPreview, SizeStrip, SvgPreview } from '@/components/output/SvgPreview';
import { Button, cx, IconButton } from '@/components/ui/primitives';
import { fileStem } from '@/core/export/encode';
import { copyText, downloadText } from '@/lib/files';
import { useActiveSvg } from '@/lib/svgOutput';
import { useDocument } from '@/store/document';
import { useUi } from '@/store/ui';
import { CenterContent, LeftPanelContent } from './WorkspaceLayout';
import { toCss } from '@/core/grid/color';
import { useTool } from '@/store/tool';

type Tab = 'settings' | 'preview' | 'code' | 'export';

function ExportTab() {
  const { svg } = useActiveSvg();
  const name = useDocument((s) => s.name);
  const toast = useUi((s) => s.toast);
  return (
    <div className="space-y-2 p-3">
      <Button variant="primary" className="w-full" onClick={() => downloadText(svg, `${fileStem(name)}.svg`, 'image/svg+xml')}>
        <Download size={14} /> Download SVG
      </Button>
      <Button className="w-full" onClick={async () => toast((await copyText(svg)) ? 'SVG copied to clipboard' : 'Copy failed', 'success')}>
        <Copy size={14} /> Copy SVG
      </Button>
      <Button variant="ghost" className="w-full" onClick={() => useUi.getState().openDialog('export')}>
        PNG, React, favicon and more…
      </Button>
    </div>
  );
}

export function MobileWorkspace() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('settings');
  const mode = useUi((s) => s.mode);
  const primary = useTool((s) => s.primary);
  const secondary = useTool((s) => s.secondary);

  const openTab = (t: Tab) => {
    setTab(t);
    setOpen(true);
  };

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'settings', label: mode === 'draw' ? 'Tools' : 'Settings' },
    { id: 'preview', label: 'Preview' },
    { id: 'code', label: 'Code' },
    { id: 'export', label: 'Export' },
  ];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <main className="relative min-h-0 flex-1 bg-[var(--canvas-bg)]">
        <CenterContent />
      </main>

      {mode === 'draw' && (
        <div className="flex items-center gap-1 border-t border-line bg-panel px-2 py-1.5">
          <div className="min-w-0 flex-1 overflow-x-auto">
            <ToolButtons compact />
          </div>
          <button
            type="button"
            aria-label="Colors and settings"
            onClick={() => openTab('settings')}
            className="checker relative size-8 shrink-0 overflow-hidden rounded-md border border-line-strong"
          >
            <span className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${toCss(primary)} 50%, ${toCss(secondary)} 50%)` }} />
          </button>
        </div>
      )}

      <section
        aria-label="Panels"
        className={cx(
          'flex flex-col border-t border-line bg-panel shadow-[0_-4px_16px_rgba(0,0,0,0.08)] transition-[height]',
          open ? 'h-[58vh]' : 'h-11',
        )}
      >
        <div className="flex items-center gap-1 px-2">
          <div role="tablist" aria-label="Panel tabs" className="flex flex-1 gap-1 overflow-x-auto py-1.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={open && tab === t.id}
                onClick={() => (open && tab === t.id ? setOpen(false) : openTab(t.id))}
                className={cx('h-8 shrink-0 rounded-md px-3 font-medium', open && tab === t.id ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-panel-2')}
              >
                {t.id === 'settings' && <SlidersHorizontal size={13} className="mr-1 inline" aria-hidden />}
                {t.label}
              </button>
            ))}
          </div>
          <IconButton label={open ? 'Collapse panels' : 'Expand panels'} tooltipSide="top" onClick={() => setOpen(!open)}>
            {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </IconButton>
        </div>
        {open && (
          <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto border-t border-line">
            {tab === 'settings' && <LeftPanelContent />}
            {tab === 'preview' && (
              <>
                <SvgPreview />
                <SizeStrip />
                {mode === 'draw' && <DocumentSettings />}
                <ContextPreview />
              </>
            )}
            {tab === 'code' && (
              <div className="h-full">
                <SvgCodeEditor />
              </div>
            )}
            {tab === 'export' && <ExportTab />}
          </div>
        )}
      </section>
    </div>
  );
}
