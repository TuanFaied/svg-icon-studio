'use client';

import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Group, Panel, type PanelImperativeHandle, Separator, useDefaultLayout, usePanelRef } from 'react-resizable-panels';
import { CanvasSettings } from '@/components/editor/CanvasSettings';
import { ColorPalette } from '@/components/editor/ColorPalette';
import { DrawingToolbar } from '@/components/editor/DrawingToolbar';
import { PixelCanvas } from '@/components/editor/PixelCanvas';
import { ConversionSettings } from '@/components/convert/ConversionSettings';
import { ImageUploader } from '@/components/convert/ImageUploader';
import { TracePreview } from '@/components/convert/TracePreview';
import { DocumentSettings } from '@/components/output/DocumentSettings';
import { SvgCodeEditor } from '@/components/output/SvgCodeEditor';
import { ContextPreview, SizeStrip, SvgPreview } from '@/components/output/SvgPreview';
import { IconButton } from '@/components/ui/primitives';
import { useUi } from '@/store/ui';

export function LeftPanelContent() {
  const mode = useUi((s) => s.mode);
  return mode === 'draw' ? (
    <>
      <DrawingToolbar />
      <ColorPalette />
      <CanvasSettings />
    </>
  ) : (
    <>
      <ImageUploader />
      <ConversionSettings />
    </>
  );
}

export function CenterContent() {
  const mode = useUi((s) => s.mode);
  return mode === 'draw' ? <PixelCanvas /> : <TracePreview />;
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
    <div className="absolute top-2 z-10" style={side === 'left' ? { left: 8 } : { right: 8 }}>
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
  const mode = useUi((s) => s.mode);
  return (
    <Group orientation="vertical" id="right-split" className="h-full">
      <Panel id="right-top" defaultSize="58%" minSize="20%">
        <Scroll label="Preview and document settings">
          <SvgPreview />
          <SizeStrip />
          {mode === 'draw' && <DocumentSettings />}
          <ContextPreview />
        </Scroll>
      </Panel>
      <Separator className="h-px bg-line hover:bg-accent data-[separator-state=drag]:bg-accent" />
      <Panel id="right-code" minSize="15%">
        <div className="h-full bg-panel">
          <SvgCodeEditor />
        </div>
      </Panel>
    </Group>
  );
}

export function DesktopWorkspace() {
  const leftRef = usePanelRef();
  const rightRef = usePanelRef();
  const layout = useDefaultLayout({ id: 'sis-workspace', storage: typeof window !== 'undefined' ? localStorage : undefined });

  return (
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
  );
}
