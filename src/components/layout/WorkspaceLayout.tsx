'use client';

import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Group, Panel, type PanelImperativeHandle, Separator, useDefaultLayout, usePanelRef } from 'react-resizable-panels';
import { CanvasSettings } from '@/components/editor/CanvasSettings';
import { ColorPalette } from '@/components/editor/ColorPalette';
import { ToolOptions } from '@/components/editor/DrawingToolbar';
import { PixelCanvas } from '@/components/editor/PixelCanvas';
import { Timeline } from '@/components/editor/Timeline';
import { ConversionSettings } from '@/components/convert/ConversionSettings';
import { ImageUploader } from '@/components/convert/ImageUploader';
import { TracePreview } from '@/components/convert/TracePreview';
import { AnimationSettings } from '@/components/output/AnimationSettings';
import { DocumentSettings } from '@/components/output/DocumentSettings';
import { SelectionProperties } from '@/components/output/SelectionProperties';
import { SvgCodeEditor } from '@/components/output/SvgCodeEditor';
import { ContextPreview, SizeStrip, SvgPreview } from '@/components/output/SvgPreview';
import { IconButton } from '@/components/ui/primitives';
import { Tabs } from '@/components/ui/Tabs';
import { useUi } from '@/store/ui';

type LeftTab = 'color' | 'canvas';
type RightTab = 'properties' | 'code';

/** Draw mode: options for the current tool, then Color / Canvas tabs. Convert mode: image and settings. */
export function LeftPanelContent() {
  const mode = useUi((s) => s.mode);
  const [tab, setTab] = useState<LeftTab>('color');
  if (mode !== 'draw') {
    return (
      <>
        <ImageUploader />
        <ConversionSettings />
      </>
    );
  }
  return (
    <>
      <ToolOptions />
      <Tabs<LeftTab>
        label="Draw settings"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'color', label: 'Color' },
          { id: 'canvas', label: 'Canvas' },
        ]}
      >
        {tab === 'color' ? <ColorPalette /> : <CanvasSettings />}
      </Tabs>
    </>
  );
}

export function CenterContent({ showZoom = false }: { showZoom?: boolean }) {
  const mode = useUi((s) => s.mode);
  return mode === 'draw' ? <PixelCanvas showZoom={showZoom} /> : <TracePreview />;
}

/** A section that folds away; open by default. */
function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-line">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-9 w-full items-center gap-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-fg"
      >
        {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
        {title}
      </button>
      {open && <div className="[&>section:first-child]:pt-0">{children}</div>}
    </div>
  );
}

/** Contextual properties: the selection when there is one, then preview, animation and document settings. */
export function PropertiesContent() {
  const mode = useUi((s) => s.mode);
  return (
    <>
      {mode === 'draw' && <SelectionProperties />}
      <Collapsible title="Preview">
        <SvgPreview />
        <SizeStrip />
        <ContextPreview />
      </Collapsible>
      {mode === 'draw' && <AnimationSettings />}
      {mode === 'draw' && <DocumentSettings />}
    </>
  );
}

function PanelToggle({ panel, side }: { panel: React.RefObject<PanelImperativeHandle | null>; side: 'left' | 'right' }) {
  const [collapsed, setCollapsed] = useState(false);
  const toggle = () => {
    const p = panel.current;
    if (!p) return;
    if (p.isCollapsed()) p.expand();
    else p.collapse();
    setCollapsed(p.isCollapsed());
  };
  const Icon = side === 'left' ? (collapsed ? PanelLeftOpen : PanelLeftClose) : collapsed ? PanelRightOpen : PanelRightClose;
  return (
    <div className="absolute top-2 z-20" style={side === 'left' ? { left: 8 } : { right: 8 }}>
      <IconButton
        label={`${collapsed ? 'Show' : 'Hide'} ${side} panel`}
        tooltipSide={side === 'left' ? 'right' : 'left'}
        onClick={toggle}
        className="border-line bg-panel shadow-sm"
      >
        <Icon size={15} />
      </IconButton>
    </div>
  );
}

function Handle() {
  return (
    <Separator className="relative w-px bg-line transition-colors hover:bg-accent data-[separator-state=drag]:bg-accent">
      <span className="absolute inset-y-0 -left-1 -right-1" />
    </Separator>
  );
}

function Scroll({ children, label }: { children: ReactNode; label: string }) {
  return (
    <aside aria-label={label} className="h-full overflow-y-auto bg-panel">
      {children}
    </aside>
  );
}

export function RightPanelContent() {
  const [tab, setTab] = useState<RightTab>('properties');
  return (
    <aside aria-label="Properties and code" className="h-full bg-panel">
      <Tabs<RightTab>
        label="Right panel"
        value={tab}
        onChange={setTab}
        className="h-full"
        tabs={[
          { id: 'properties', label: 'Properties' },
          { id: 'code', label: 'Code' },
        ]}
        panelClassName={tab === 'properties' ? 'overflow-y-auto' : 'overflow-hidden'}
      >
        {tab === 'properties' ? <PropertiesContent /> : <SvgCodeEditor />}
      </Tabs>
    </aside>
  );
}

export function DesktopWorkspace() {
  const leftRef = usePanelRef();
  const rightRef = usePanelRef();
  const mode = useUi((s) => s.mode);
  const layout = useDefaultLayout({ id: 'sis-workspace', storage: typeof window !== 'undefined' ? localStorage : undefined });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Group orientation="horizontal" id="sis-workspace" className="min-h-0 flex-1" defaultLayout={layout.defaultLayout} onLayoutChanged={layout.onLayoutChanged}>
        <Panel id="left" panelRef={leftRef} defaultSize={280} minSize={220} maxSize={420} collapsible collapsedSize={0}>
          <Scroll label="Tools and settings">
            <LeftPanelContent />
          </Scroll>
        </Panel>
        <Handle />
        <Panel id="center" minSize={320}>
          <main className="relative h-full bg-[var(--canvas-bg)]">
            <PanelToggle panel={leftRef} side="left" />
            <PanelToggle panel={rightRef} side="right" />
            <CenterContent />
          </main>
        </Panel>
        <Handle />
        <Panel id="right" panelRef={rightRef} defaultSize={340} minSize={260} maxSize={560} collapsible collapsedSize={0}>
          <RightPanelContent />
        </Panel>
      </Group>
      {/* Docked under all three panels, like an animation editor's timeline. */}
      {mode === 'draw' && <Timeline />}
    </div>
  );
}
