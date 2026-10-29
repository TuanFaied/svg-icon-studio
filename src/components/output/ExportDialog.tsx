'use client';

import { Braces, Copy, Download, FileCode2, FileJson, Image as ImageIcon, Link2, Package, Quote } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { parseHex } from '@/core/grid/color';
import { cssDataUri, fileStem } from '@/core/export/encode';
import { svgToTsx, toComponentName } from '@/core/export/jsx';
import { encodeShare, SHARE_MAX, serializeProject } from '@/core/project/project';
import { type OutputFormat } from '@/core/svg/generate';
import { formatBytes } from '@/core/svg/stats';
import { Dialog } from '@/components/ui/Dialog';
import { Button, cx, NumberField, Segmented, Select } from '@/components/ui/primitives';
import { blobBytes, copyText, downloadBlob, downloadText, gridToPng, makeZip, svgToPng } from '@/lib/files';
import { renderSvg, useActiveSvg, useSvgBlobUrl } from '@/lib/svgOutput';
import { currentProject, useDocument } from '@/store/document';
import { useUi } from '@/store/ui';

type Target = 'svg' | 'png' | 'react' | 'datauri' | 'favicon' | 'project';

const TARGETS: Array<{ id: Target; label: string; icon: ReactNode }> = [
  { id: 'svg', label: 'SVG file', icon: <FileCode2 size={15} /> },
  { id: 'png', label: 'PNG', icon: <ImageIcon size={15} /> },
  { id: 'react', label: 'React component', icon: <Braces size={15} /> },
  { id: 'datauri', label: 'Data URI', icon: <Quote size={15} /> },
  { id: 'favicon', label: 'Favicon pack', icon: <Package size={15} /> },
  { id: 'project', label: 'Project file', icon: <FileJson size={15} /> },
];

function CodeBlock({ text, label }: { text: string; label: string }) {
  return (
    <textarea
      readOnly
      aria-label={label}
      value={text}
      spellCheck={false}
      className="h-48 w-full resize-y rounded-md border border-line bg-panel-2 p-2 font-mono text-[11px] leading-relaxed"
      onFocus={(e) => e.currentTarget.select()}
    />
  );
}

export function ExportDialog() {
  const open = useUi((s) => s.dialog === 'export');
  const close = () => useUi.getState().openDialog(null);
  return (
    <Dialog open={open} onClose={close} title="Export" wide>
      {open && <ExportBody />}
    </Dialog>
  );
}

function ExportBody() {
  const [target, setTarget] = useState<Target>('svg');
  const { svg: active, manual } = useActiveSvg();
  const previewUrl = useSvgBlobUrl(active);
  const grid = useDocument((s) => s.grid);
  const name = useDocument((s) => s.name);
  const opts = useDocument((s) => s.svg);
  const animated = manual ? active.includes('@keyframes') : opts.animation.kind !== 'none';
  const toast = useUi((s) => s.toast);
  const stem = fileStem(name);

  const [format, setFormat] = useState<OutputFormat>(opts.format);
  const svgOut = useMemo(() => (manual ? active : renderSvg(grid, opts, format)), [manual, active, grid, opts, format]);

  const [scale, setScale] = useState<'1' | '2' | '4' | '8' | 'custom'>('4');
  const [customPx, setCustomPx] = useState(256);
  const [pngBg, setPngBg] = useState<'transparent' | 'solid'>('transparent');
  const [pngBgColor, setPngBgColor] = useState('#ffffff');
  const [busy, setBusy] = useState(false);

  const componentName = toComponentName(name);
  const tsx = useMemo(() => svgToTsx(renderSvg(grid, { ...opts, format: 'minimal' }), { componentName, defaultSize: opts.width }), [grid, opts, componentName]);
  const tsxSource = manual ? svgToTsx(active, { componentName, defaultSize: opts.width }) : tsx;
  const dataUri = useMemo(() => cssDataUri(manual ? active : renderSvg(grid, opts, 'optimized')), [manual, active, grid, opts]);

  const copy = async (text: string, what: string) => {
    const ok = await copyText(text);
    toast(ok ? `${what} copied to clipboard` : 'Copy failed', ok ? 'success' : 'error');
  };

  const pngSize = () => {
    if (scale === 'custom') {
      const longest = Math.max(grid.width, grid.height);
      const k = Math.max(1, customPx) / longest;
      return { w: Math.max(1, Math.round(grid.width * k)), h: Math.max(1, Math.round(grid.height * k)) };
    }
    return { w: grid.width * Number(scale), h: grid.height * Number(scale) };
  };

  const makePng = async (w: number, h: number, bg: string | null): Promise<Blob> => {
    const exact = !manual && w % grid.width === 0 && h % grid.height === 0 && w / grid.width === h / grid.height;
    if (exact) return gridToPng(grid, w / grid.width, bg ? (parseHex(bg) ?? 0) : 0);
    return svgToPng(manual ? active : renderSvg(grid, { ...opts, includeSize: true, width: w, height: h }, 'minimal'), w, h, bg, false);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Export failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const shareLink = () => {
    const url = new URL(location.href);
    url.hash = encodeShare(grid);
    return url.toString();
  };

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <nav aria-label="Export targets" className="flex shrink-0 flex-row gap-1 overflow-x-auto md:w-44 md:flex-col">
        {TARGETS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={target === t.id ? 'page' : undefined}
            onClick={() => setTarget(t.id)}
            className={cx(
              'flex h-8 shrink-0 items-center gap-2 rounded-md px-2.5 text-left whitespace-nowrap',
              target === t.id ? 'bg-accent-soft font-medium text-accent' : 'hover:bg-panel-2',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>

      <div className="min-w-0 flex-1 space-y-3">
        <div className="checker flex h-28 items-center justify-center rounded-lg border border-line">
          {previewUrl ? (
            <img src={previewUrl} alt={`${name} preview`} className="pixelated h-20 w-auto max-w-[80%] object-contain" />
          ) : (
            <span className="text-muted">The SVG has errors; fix them in the code panel.</span>
          )}
        </div>
        {manual && <p className="rounded-md bg-warn-bg px-2 py-1.5 text-[12px] text-warn-fg">Exporting your manually edited SVG.</p>}

        {target === 'svg' && (
          <>
            {!manual && (
              <Select<OutputFormat>
                label="Format"
                value={format}
                onChange={setFormat}
                options={[
                  { value: 'readable', label: 'Readable' },
                  { value: 'minimal', label: 'Minimal' },
                  { value: 'optimized', label: 'Optimized (SVGO)' },
                ]}
              />
            )}
            <p className="text-muted">{stem}.svg · {formatBytes(new TextEncoder().encode(svgOut).length)}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => downloadText(svgOut, `${stem}.svg`, 'image/svg+xml')}>
                <Download size={14} /> Download SVG
              </Button>
              <Button onClick={() => copy(svgOut, 'SVG')}>
                <Copy size={14} /> Copy SVG
              </Button>
            </div>
          </>
        )}

        {target === 'png' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Scale</span>
              <Segmented
                label="PNG scale"
                value={scale}
                onChange={setScale}
                options={[
                  { value: '1', label: '1×' },
                  { value: '2', label: '2×' },
                  { value: '4', label: '4×' },
                  { value: '8', label: '8×' },
                  { value: 'custom', label: 'Custom' },
                ]}
              />
            </div>
            {scale === 'custom' && <NumberField label="Longest side (px)" min={1} max={4096} value={customPx} onChange={(v) => setCustomPx(Math.min(4096, v))} className="max-w-40" />}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Background</span>
              <div className="flex items-center gap-2">
                <Segmented
                  label="PNG background"
                  value={pngBg}
                  onChange={setPngBg}
                  options={[
                    { value: 'transparent', label: 'Transparent' },
                    { value: 'solid', label: 'Solid' },
                  ]}
                />
                {pngBg === 'solid' && <input type="color" aria-label="PNG background color" value={pngBgColor} onChange={(e) => setPngBgColor(e.target.value)} className="h-7 w-9 rounded border border-line" />}
              </div>
            </div>
            <p className="text-muted">
              {pngSize().w} × {pngSize().h} px · nearest-neighbor, no smoothing
              {animated && ' · animation not included (first frame)'}
            </p>
            <Button
              variant="primary"
              loading={busy}
              onClick={() =>
                run(async () => {
                  const { w, h } = pngSize();
                  downloadBlob(await makePng(w, h, pngBg === 'solid' ? pngBgColor : null), `${stem}${scale === '1' ? '' : `@${scale === 'custom' ? `${w}px` : `${scale}x`}`}.png`);
                })
              }
            >
              <Download size={14} /> Download PNG
            </Button>
          </>
        )}

        {target === 'react' && (
          <>
            <p className="text-muted">
              Typed TSX component <code className="font-mono">{componentName}</code> with <code className="font-mono">size</code>, <code className="font-mono">color</code> and SVG props.
              {!manual && !opts.currentColor && ' Turn on “Use currentColor” (single-color icons) to make color drive the fill.'}
            </p>
            <CodeBlock text={tsxSource} label="React component source" />
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => downloadText(tsxSource, `${componentName}.tsx`, 'text/plain')}>
                <Download size={14} /> Download .tsx
              </Button>
              <Button onClick={() => copy(tsxSource, 'Component')}>
                <Copy size={14} /> Copy
              </Button>
            </div>
          </>
        )}

        {target === 'datauri' && (
          <>
            <p className="text-muted">URL-encoded (not base64) for CSS backgrounds. {formatBytes(dataUri.length)}</p>
            <CodeBlock text={`background-image: ${dataUri};`} label="CSS data URI" />
            <Button variant="primary" onClick={() => copy(dataUri, 'Data URI')}>
              <Copy size={14} /> Copy data URI
            </Button>
          </>
        )}

        {target === 'favicon' && (
          <>
            <p className="text-muted">
              favicon.svg plus 16, 32, 180 (apple-touch), 192 and 512 px PNGs, zipped.
              {animated && ' The SVG keeps the animation; the PNGs show the first frame.'}
            </p>
            <Button
              variant="primary"
              loading={busy}
              onClick={() =>
                run(async () => {
                  const files: Record<string, Uint8Array | string> = { 'favicon.svg': manual ? active : renderSvg(grid, { ...opts, includeSize: false }, 'optimized') };
                  const sizes: Array<[string, number]> = [['favicon-16.png', 16], ['favicon-32.png', 32], ['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]];
                  for (const [file, px] of sizes) {
                    const longest = Math.max(grid.width, grid.height);
                    const w = Math.max(1, Math.round((grid.width / longest) * px));
                    const h = Math.max(1, Math.round((grid.height / longest) * px));
                    files[file] = await blobBytes(await makePng(w, h, null));
                  }
                  downloadBlob(await makeZip(files), `${stem}-favicons.zip`);
                })
              }
            >
              <Download size={14} /> Download favicon pack
            </Button>
          </>
        )}

        {target === 'project' && (
          <>
            <p className="text-muted">Grid size, pixel data, palette and settings as <code className="font-mono">{stem}.icon.json</code>.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => downloadText(serializeProject(currentProject()), `${stem}.icon.json`, 'application/json')}>
                <Download size={14} /> Download project
              </Button>
              <Button
                disabled={grid.width > SHARE_MAX || grid.height > SHARE_MAX}
                onClick={() => copy(shareLink(), 'Share link')}
                title={grid.width > SHARE_MAX || grid.height > SHARE_MAX ? `Share links support up to ${SHARE_MAX}×${SHARE_MAX}` : undefined}
              >
                <Link2 size={14} /> Copy share link
              </Button>
            </div>
            <p className="text-[11px] text-muted">
              Share links encode the drawing in the URL (up to {SHARE_MAX}×{SHARE_MAX}); nothing is uploaded.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
