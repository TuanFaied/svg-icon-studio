'use client';

import { ImageOff } from 'lucide-react';
import { useState } from 'react';
import { cx, Section, Segmented } from '@/components/ui/primitives';
import { useActiveSvg, useSvgBlobUrl } from '@/lib/svgOutput';
import { useDocument } from '@/store/document';

type Bg = 'checker' | 'light' | 'dark' | 'custom';

const bgStyle = (bg: Bg, custom: string) =>
  bg === 'light' ? { background: '#ffffff' } : bg === 'dark' ? { background: '#15181d' } : bg === 'custom' ? { background: custom } : undefined;

/**
 * Renders an icon from a blob URL. Icons using currentColor are drawn as a CSS
 * mask so they take the surrounding text color, like they would inline.
 */
export function IconImage({ url, size, usesCurrentColor, className, color }: { url: string; size: number | string; usesCurrentColor: boolean; className?: string; color?: string }) {
  const w = typeof size === 'number' ? `${size}px` : size;
  const aspect = useAspect();
  if (usesCurrentColor) {
    return (
      <span
        aria-hidden
        className={cx('inline-block shrink-0', className)}
        style={{
          width: w,
          aspectRatio: aspect,
          backgroundColor: color ?? 'currentColor',
          WebkitMaskImage: `url("${url}")`,
          maskImage: `url("${url}")`,
          WebkitMaskSize: '100% 100%',
          maskSize: '100% 100%',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
        }}
      />
    );
  }
  return <img src={url} alt="" draggable={false} className={cx('pixelated shrink-0', className)} style={{ width: w, aspectRatio: aspect }} />;
}

function useAspect(): string {
  const w = useDocument((s) => s.grid.width);
  const h = useDocument((s) => s.grid.height);
  return `${w} / ${h}`;
}

export function SvgPreview() {
  const { svg, source } = useActiveSvg();
  const url = useSvgBlobUrl(svg, { trusted: source === 'grid' });
  const usesCurrent = svg.includes('currentColor');
  const [bg, setBg] = useState<Bg>('checker');
  const [custom, setCustom] = useState('#f0e6d2');
  const name = useDocument((s) => s.name);

  return (
    <Section title="Preview">
      <div
        className={cx('flex aspect-[4/3] items-center justify-center rounded-lg border border-line p-4', bg === 'checker' && 'checker')}
        style={bgStyle(bg, custom)}
      >
        {url ? (
          <span className={cx('flex h-full w-full items-center justify-center', bg === 'dark' ? 'text-white' : 'text-black')}>
            <span className="flex h-full max-h-full w-full max-w-full items-center justify-center" role="img" aria-label={`Preview of ${name}`}>
              <IconImage url={url} size="min(100%, 220px)" usesCurrentColor={usesCurrent} className="max-h-full object-contain" />
            </span>
          </span>
        ) : (
          <span className="flex flex-col items-center gap-1 text-muted">
            <ImageOff size={20} aria-hidden />
            Fix the SVG errors to see a preview
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Segmented
          label="Preview background"
          value={bg}
          onChange={setBg}
          className="flex-1"
          options={[
            { value: 'checker', label: 'Checker' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'custom', label: 'Custom' },
          ]}
        />
        {bg === 'custom' && (
          <input type="color" aria-label="Custom preview background" value={custom} onChange={(e) => setCustom(e.target.value)} className="h-7 w-8 rounded border border-line" />
        )}
      </div>
    </Section>
  );
}

const STRIP = [16, 24, 32, 48, 64, 128];

/** Above this size, the multi-image previews are paused: each <img> would re-rasterize megabytes. */
const HEAVY_PREVIEW = 1_500_000;

function PausedNote({ title, svg }: { title: string; svg: string }) {
  return (
    <Section title={title}>
      <p className="text-[11px] leading-snug text-muted">
        Paused for very large drawings ({(svg.length / 1e6).toFixed(1)} MB of SVG) to keep editing smooth. The main preview above is still live.
      </p>
    </Section>
  );
}

export function SizeStrip() {
  const { svg, source } = useActiveSvg();
  const heavy = svg.length > HEAVY_PREVIEW;
  const url = useSvgBlobUrl(heavy ? '' : svg, { trusted: source === 'grid' });
  const usesCurrent = svg.includes('currentColor');
  if (heavy) return <PausedNote title="Sizes" svg={svg} />;
  if (!url) return null;
  return (
    <Section title="Sizes">
      {(['light', 'dark'] as const).map((tone) => (
        <div
          key={tone}
          className={cx('mb-1.5 flex items-end gap-3 overflow-x-auto rounded-lg border border-line px-3 py-2', tone === 'light' ? 'bg-white text-black' : 'bg-[#15181d] text-white')}
        >
          {STRIP.map((s) => (
            <figure key={s} className="flex shrink-0 flex-col items-center gap-1">
              <IconImage url={url} size={s} usesCurrentColor={usesCurrent} />
              <figcaption className={cx('text-[10px] tabular-nums', tone === 'light' ? 'text-gray-500' : 'text-gray-400')}>{s}</figcaption>
            </figure>
          ))}
        </div>
      ))}
    </Section>
  );
}

export function ContextPreview() {
  const { svg, source } = useActiveSvg();
  const heavy = svg.length > HEAVY_PREVIEW;
  const url = useSvgBlobUrl(heavy ? '' : svg, { trusted: source === 'grid' });
  const usesCurrent = svg.includes('currentColor');
  const name = useDocument((s) => s.name);
  if (heavy) return <PausedNote title="In context" svg={svg} />;
  if (!url) return null;
  return (
    <Section title="In context">
      <div className="space-y-2">
        {/* Browser tab favicon mock */}
        <div className="overflow-hidden rounded-lg border border-line">
          <div className="flex items-end gap-1 bg-panel-2 px-2 pt-1.5">
            <div className="flex h-7 max-w-[180px] items-center gap-1.5 rounded-t-md bg-panel px-2.5 text-[12px]">
              <IconImage url={url} size={16} usesCurrentColor={usesCurrent} className="text-fg" />
              <span className="truncate">{name}</span>
            </div>
            <div className="flex h-7 items-center px-2 text-[12px] text-muted">New tab</div>
          </div>
          <div className="h-2 bg-panel" />
        </div>
        {/* Nav bar */}
        <nav aria-label="Sample navigation" className="flex items-center gap-1 rounded-lg border border-line bg-panel px-2 py-1.5">
          {['Home', 'Library', 'Settings'].map((label, i) => (
            <span key={label} className={cx('flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px]', i === 0 ? 'bg-accent-soft text-accent' : 'text-muted')}>
              {i === 0 ? <IconImage url={url} size={16} usesCurrentColor={usesCurrent} /> : <span className="size-4 rounded-sm bg-line" aria-hidden />}
              {label}
            </span>
          ))}
        </nav>
        {/* Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-medium text-accent-fg">
            <IconImage url={url} size={16} usesCurrentColor={usesCurrent} /> Primary action
          </span>
          <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-panel px-3 text-[13px] font-medium">
            <IconImage url={url} size={16} usesCurrentColor={usesCurrent} /> Secondary
          </span>
        </div>
      </div>
    </Section>
  );
}
