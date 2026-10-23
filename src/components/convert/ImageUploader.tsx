'use client';

import { ImageUp, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatBytes } from '@/core/svg/stats';
import { cx, IconButton, Section } from '@/components/ui/primitives';
import { isTypingTarget } from '@/lib/shortcuts';
import { ACCEPT, loadImageFile, MAX_SIDE } from '@/lib/imageLoad';
import { useConvert } from '@/store/convert';
import { useUi } from '@/store/ui';

export function ImageUploader() {
  const source = useConvert((s) => s.source);
  const setSource = useConvert((s) => s.setSource);
  const toast = useUi((s) => s.toast);
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async (file: File | null | undefined) => {
    if (!file) return;
    setLoading(true);
    try {
      const img = await loadImageFile(file);
      setSource(img);
      if (img.downscaled) toast(`Large image downscaled to ${img.raster.width} × ${img.raster.height} for processing.`, 'info');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load image', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Paste from clipboard (Ctrl/Cmd+V) while in Convert mode.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'));
      if (!item) return;
      e.preventDefault();
      void load(item.getAsFile());
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  return (
    <Section title="Image">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void load(e.dataTransfer.files[0]);
        }}
        className={cx('rounded-lg border-2 border-dashed p-3 text-center transition-colors', drag ? 'border-accent bg-accent-soft' : 'border-line')}
      >
        <ImageUp size={22} className="mx-auto mb-1 text-muted" aria-hidden />
        <p className="mb-2 leading-snug">
          Drop an image, <button type="button" className="font-medium text-accent underline-offset-2 hover:underline" onClick={() => inputRef.current?.click()}>browse</button>, or paste with Ctrl+V.
        </p>
        <p className="text-[11px] text-muted">PNG, JPG, WebP, GIF (first frame), BMP · up to 20 MB · resized to {MAX_SIDE}px max</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-label="Choose image file"
          data-testid="image-input"
          onChange={(e) => {
            void load(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {loading && <p className="mt-2 text-[12px] text-muted" role="status">Decoding image…</p>}
      </div>

      {source && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-line p-2">
          <img src={source.url} alt="" className="checker size-12 shrink-0 rounded object-contain" />
          <dl className="min-w-0 flex-1 text-[11px] leading-relaxed">
            <dt className="sr-only">Name</dt>
            <dd className="truncate text-[12px] font-medium">{source.name}</dd>
            <dt className="sr-only">Details</dt>
            <dd className="text-muted">
              {source.origWidth} × {source.origHeight} · {formatBytes(source.bytes)}
              {source.downscaled && ` · processed at ${source.raster.width} × ${source.raster.height}`}
            </dd>
            <dd className="text-muted">{source.hasAlpha ? 'Has transparency' : 'No transparency'}</dd>
          </dl>
          <IconButton label="Remove image" onClick={() => setSource(null)}>
            <X size={14} />
          </IconButton>
        </div>
      )}
    </Section>
  );
}
