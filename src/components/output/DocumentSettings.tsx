'use client';

import { useMemo } from 'react';
import { toHex } from '@/core/grid/color';
import { canUseCurrentColorAll, type Geometry, type OutputFormat } from '@/core/svg/generate';
import { NumberField, Section, Segmented, Select, Slider, Toggle } from '@/components/ui/primitives';
import { parseHex } from '@/core/grid/color';
import { useDocument } from '@/store/document';

export function DocumentSettings() {
  const svg = useDocument((s) => s.svg);
  const set = useDocument((s) => s.setSvgOptions);
  const frames = useDocument((s) => s.frames);
  const version = useDocument((s) => s.version);
  const singleColor = useMemo(() => canUseCurrentColorAll(frames.map((f) => f.grid)), [frames, version]);

  return (
    <Section title="Document">
      <div className="space-y-1">
        <div className="py-1">
          <div className="mb-1">Geometry</div>
          <Segmented<Geometry>
            label="Geometry"
            value={svg.geometry}
            onChange={(geometry) => set({ geometry })}
            className="w-full"
            options={[
              { value: 'rects', label: 'Merged rects', title: 'Greedy-meshed rectangles grouped by color (default)' },
              { value: 'paths', label: 'Outline paths', title: 'One path per color using M/h/v/z — usually smallest' },
              { value: 'cells', label: 'Cells', title: 'One rect per pixel — for debugging or animation' },
            ]}
          />
        </div>
        <Select<OutputFormat>
          label="Format"
          value={svg.format}
          onChange={(format) => set({ format })}
          options={[
            { value: 'readable', label: 'Readable' },
            { value: 'minimal', label: 'Minimal' },
            { value: 'optimized', label: 'Optimized (SVGO)' },
          ]}
        />
        <Toggle label="Width & height attributes" hint="Off = viewBox only, scales to its container" checked={svg.includeSize} onChange={(includeSize) => set({ includeSize })} />
        {svg.includeSize && (
          <div className="flex gap-2 pb-1">
            <NumberField label="Width (px)" min={1} max={4096} value={svg.width} onChange={(width) => set({ width: Math.max(1, Math.min(4096, width || 1)) })} />
            <NumberField label="Height (px)" min={1} max={4096} value={svg.height} onChange={(height) => set({ height: Math.max(1, Math.min(4096, height || 1)) })} />
          </div>
        )}
        <Toggle label="Decorative" hint='aria-hidden="true"; no title' checked={svg.decorative} onChange={(decorative) => set({ decorative })} />
        {!svg.decorative && (
          <label className="block py-1">
            <span className="mb-1 block">Accessible title</span>
            <input
              value={svg.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="e.g. Home"
              className="h-7 w-full rounded-md border border-line bg-panel px-2"
            />
          </label>
        )}
        <Toggle
          label="Use currentColor"
          hint={singleColor ? 'Icon inherits CSS text color' : 'Only for single-color drawings'}
          checked={svg.currentColor && singleColor}
          disabled={!singleColor}
          onChange={(currentColor) => set({ currentColor })}
        />
        <Toggle label="Include background" checked={svg.includeBackground} onChange={(includeBackground) => set({ includeBackground })} />
        {svg.includeBackground && (
          <label className="flex items-center justify-between py-1">
            <span>Background color</span>
            <input
              type="color"
              value={toHex(svg.background).slice(0, 7)}
              onChange={(e) => set({ background: parseHex(e.target.value) ?? svg.background })}
              className="h-7 w-10 rounded border border-line"
            />
          </label>
        )}
        <Toggle label="Crisp edges" hint="shape-rendering=crispEdges prevents hairline seams" checked={svg.crispEdges} onChange={(crispEdges) => set({ crispEdges })} />
        <Slider
          label="Rounded cells"
          value={svg.cornerRadius}
          min={0}
          max={0.5}
          step={0.05}
          disabled={svg.geometry !== 'cells'}
          format={(v) => (v === 0 ? 'Off' : `${Math.round(v * 100)}%`)}
          onChange={(cornerRadius) => set({ cornerRadius })}
        />
        <p className="text-[11px] leading-snug text-muted">
          Rounded corners need “Cells” geometry: rounding merged rectangles would distort the art.
        </p>
      </div>
    </Section>
  );
}
