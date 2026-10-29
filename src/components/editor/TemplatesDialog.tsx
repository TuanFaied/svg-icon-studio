'use client';

import { useMemo, useState } from 'react';
import { NO_ANIMATION } from '@/core/svg/animation';
import { DEFAULT_SVG_OPTIONS, gridToSvg } from '@/core/svg/generate';
import { buildTemplate, type TemplateId, type TemplateInfo, TEMPLATE_SIZES, TEMPLATES, type TemplateSize } from '@/core/templates/templates';
import { Dialog } from '@/components/ui/Dialog';
import { cx, Segmented } from '@/components/ui/primitives';
import { saveToRecent } from '@/lib/persistence';
import { useSvgBlobUrl } from '@/lib/svgOutput';
import { currentProject, useDocument } from '@/store/document';
import { useTool } from '@/store/tool';
import { useUi } from '@/store/ui';

/**
 * Replaces the document with a template as one undoable step. The swap is
 * synchronous; the previous project is snapshotted first and written to
 * Recent projects afterwards. The template gets its own project id, so it
 * never overwrites that entry.
 */
export function applyTemplate(id: TemplateId, size: TemplateSize): void {
  const t = buildTemplate(id, size);
  const doc = useDocument.getState();
  const previous = { id: doc.id, project: currentProject() };
  doc.replaceDocument(
    {
      name: t.name,
      grid: t.grid,
      palette: t.palette,
      // Keep the user's output preferences; size and animation come from the template.
      svg: { ...doc.svg, width: size, height: size, currentColor: false, animation: t.animation },
    },
    `Load ${t.name} template`,
  );
  useTool.getState().set({ selection: null });
  useTool.getState().requestFit();
  useUi.getState().setMode('draw');
  useUi.getState().toast(`Loaded “${t.name}”. Undo to go back.`, 'success');
  void saveToRecent(previous.id, previous.project).catch(() => undefined);
}

function TemplateCard({ info, size, onPick }: { info: TemplateInfo; size: TemplateSize; onPick: () => void }) {
  const [live, setLive] = useState(false);
  const { still, moving } = useMemo(() => {
    const t = buildTemplate(info.id, size);
    const base = { ...DEFAULT_SVG_OPTIONS, format: 'minimal' as const, width: 96, height: 96 };
    return { still: gridToSvg(t.grid, { ...base, animation: NO_ANIMATION }), moving: gridToSvg(t.grid, { ...base, animation: t.animation }) };
  }, [info.id, size]);
  const stillUrl = useSvgBlobUrl(still);
  const movingUrl = useSvgBlobUrl(moving);
  const url = live ? movingUrl : stillUrl;

  return (
    <button
      type="button"
      onClick={onPick}
      onMouseEnter={() => setLive(true)}
      onMouseLeave={() => setLive(false)}
      onFocus={() => setLive(true)}
      onBlur={() => setLive(false)}
      aria-label={`${info.name}: ${info.description}`}
      data-template={info.id}
      className="group flex flex-col items-stretch gap-2 rounded-lg border border-line p-2 text-left transition-colors hover:border-accent hover:bg-panel-2"
    >
      <span className="checker flex aspect-square items-center justify-center rounded-md border border-line">
        {url ? <img src={url} alt="" className="pixelated size-16" draggable={false} /> : null}
      </span>
      <span>
        <span className="block font-medium group-hover:text-accent">{info.name}</span>
        <span className="block text-[11px] leading-snug text-muted">{info.description}</span>
      </span>
    </button>
  );
}

export function TemplatesDialog() {
  const open = useUi((s) => s.dialog === 'templates');
  const close = () => useUi.getState().openDialog(null);
  const [size, setSize] = useState<TemplateSize>(24);

  return (
    <Dialog open={open} onClose={close} title="Loader templates" wide>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted">Start from an animated loader, then change pixels and colors. Hover or focus a card to preview it.</p>
        <Segmented<string>
          label="Template size"
          value={String(size)}
          onChange={(v) => setSize(Number(v) as TemplateSize)}
          options={TEMPLATE_SIZES.map((n) => ({ value: String(n), label: `${n}×${n}` }))}
        />
      </div>
      <div className={cx('grid grid-cols-2 gap-2 sm:grid-cols-4')}>
        {TEMPLATES.map((info) => (
          <TemplateCard
            key={info.id}
            info={info}
            size={size}
            onPick={() => {
              close();
              applyTemplate(info.id, size);
            }}
          />
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted">Loading a template replaces the canvas in one undoable step. Your current project is kept in Recent projects.</p>
    </Dialog>
  );
}
