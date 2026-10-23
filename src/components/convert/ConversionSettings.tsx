'use client';

import { Grid3x3, Lock, Palette, Shapes, SunMoon, Unlock } from 'lucide-react';
import type { ReactNode } from 'react';
import { MAX_SIZE } from '@/core/grid/grid';
import { cx, IconButton, NumberField, Section, Slider, Toggle } from '@/components/ui/primitives';
import { type ConvertMode, useConvert } from '@/store/convert';

const MODES: Array<{ id: ConvertMode; label: string; hint: string; icon: ReactNode }> = [
  { id: 'pixel', label: 'Pixel Art', hint: 'Sprites & small icons; opens in the editor', icon: <Grid3x3 size={16} /> },
  { id: 'bw', label: 'Black & White', hint: 'Line art, scans', icon: <SunMoon size={16} /> },
  { id: 'silhouette', label: 'Silhouette', hint: 'Solid logo marks', icon: <Shapes size={16} /> },
  { id: 'color', label: 'Color Vector', hint: 'Flat illustrations, logos', icon: <Palette size={16} /> },
];

export function ConversionSettings() {
  const mode = useConvert((s) => s.mode);
  const setMode = useConvert((s) => s.setMode);
  const s = useConvert((st) => st.settings);
  const set = useConvert((st) => st.setSettings);
  const source = useConvert((st) => st.source);
  const aspect = source ? source.raster.width / source.raster.height : 1;

  const setOut = (dim: 'w' | 'h', v: number) => {
    const n = Math.max(1, Math.min(4096, Math.round(v) || 1));
    if (!s.lockAspect) return set(dim === 'w' ? { outWidth: n } : { outHeight: n });
    return set(dim === 'w' ? { outWidth: n, outHeight: Math.max(1, Math.round(n / aspect)) } : { outHeight: n, outWidth: Math.max(1, Math.round(n * aspect)) });
  };
  const setGrid = (dim: 'w' | 'h', v: number) => {
    const n = Math.max(1, Math.min(MAX_SIZE, Math.round(v) || 1));
    if (!s.lockAspect) return set(dim === 'w' ? { gridWidth: n } : { gridHeight: n });
    return set(
      dim === 'w'
        ? { gridWidth: n, gridHeight: Math.max(1, Math.min(MAX_SIZE, Math.round(n / aspect))) }
        : { gridHeight: n, gridWidth: Math.max(1, Math.min(MAX_SIZE, Math.round(n * aspect))) },
    );
  };

  return (
    <>
      <Section title="Mode">
        <div role="radiogroup" aria-label="Conversion mode" className="grid grid-cols-2 gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => setMode(m.id)}
              className={cx(
                'flex flex-col items-start gap-0.5 rounded-lg border p-2 text-left transition-colors',
                mode === m.id ? 'border-accent bg-accent-soft' : 'border-line hover:bg-panel-2',
              )}
            >
              <span className={cx('flex items-center gap-1.5 font-medium', mode === m.id && 'text-accent')}>
                {m.icon} {m.label}
              </span>
              <span className="text-[11px] leading-snug text-muted">{m.hint}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Settings">
        {mode === 'pixel' && (
          <div className="mb-1 flex items-end gap-1.5">
            <NumberField label="Grid width" min={1} max={MAX_SIZE} value={s.gridWidth} onChange={(v) => setGrid('w', v)} />
            <span className="pb-1.5 text-muted">×</span>
            <NumberField label="Grid height" min={1} max={MAX_SIZE} value={s.gridHeight} onChange={(v) => setGrid('h', v)} />
          </div>
        )}
        {(mode === 'pixel' || mode === 'color') && (
          <Slider label="Palette size" value={s.paletteSize} min={2} max={32} onChange={(paletteSize) => set({ paletteSize })} format={(v) => `${v} colors`} />
        )}
        {(mode === 'bw' || (mode === 'silhouette' && !source?.hasAlpha)) && (
          <>
            <Slider label="Threshold" value={s.threshold} min={1} max={255} onChange={(threshold) => set({ threshold, autoThreshold: false })} />
            <Toggle label="Auto threshold" hint="Otsu's method" checked={s.autoThreshold} onChange={(autoThreshold) => set({ autoThreshold })} />
          </>
        )}
        {mode === 'silhouette' && source?.hasAlpha && <p className="py-1 text-[11px] text-muted">Using the image’s alpha channel as the shape.</p>}
        {mode !== 'pixel' && (
          <>
            <Slider label="Detail / corners" value={s.detail} min={0} max={100} onChange={(detail) => set({ detail })} format={(v) => (v < 34 ? 'Smooth' : v < 67 ? 'Balanced' : 'Sharp')} />
            <Slider label="Path precision" value={s.precision} min={0} max={3} onChange={(precision) => set({ precision })} format={(v) => `${v} decimals`} />
          </>
        )}
        <Slider
          label="Speckle filter"
          value={s.speckle}
          min={0}
          max={mode === 'pixel' ? 16 : 64}
          onChange={(speckle) => set({ speckle })}
          format={(v) => (v === 0 ? 'Off' : `< ${v} px`)}
        />
        <Toggle
          label="Remove background"
          hint="Simple edge flood fill; works best on solid backgrounds"
          checked={s.removeBackground}
          onChange={(removeBackground) => set({ removeBackground })}
        />
        {s.removeBackground && <Slider label="Tolerance" value={s.bgTolerance} min={0} max={60} onChange={(bgTolerance) => set({ bgTolerance })} />}
      </Section>

      <Section title="Output size">
        <div className="flex items-end gap-1.5">
          <NumberField label="Width (px)" min={1} max={4096} value={s.outWidth} onChange={(v) => setOut('w', v)} />
          <IconButton label={s.lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'} active={s.lockAspect} onClick={() => set({ lockAspect: !s.lockAspect })}>
            {s.lockAspect ? <Lock size={14} /> : <Unlock size={14} />}
          </IconButton>
          <NumberField label="Height (px)" min={1} max={4096} value={s.outHeight} onChange={(v) => setOut('h', v)} />
        </div>
      </Section>
    </>
  );
}
