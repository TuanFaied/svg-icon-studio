'use client';

import { X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { cx, IconButton } from './primitives';

/** Modal built on <dialog>: native focus trapping, Esc to close, inert background. */
export function Dialog({
  open, onClose, title, children, footer, wide,
}: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cx(
        'm-auto max-h-[90vh] w-[calc(100vw-24px)] rounded-xl border border-line bg-panel p-0 text-fg shadow-xl',
        wide ? 'max-w-3xl' : 'max-w-md',
      )}
    >
      {open ? (
        <div className="flex max-h-[90vh] flex-col">
          <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 id={titleId} className="text-sm font-semibold">{title}</h2>
            <IconButton label="Close" onClick={onClose}>
              <X size={16} />
            </IconButton>
          </header>
          <div className="min-h-0 flex-1 overflow-auto px-4 py-3">{children}</div>
          {footer ? <footer className="flex justify-end gap-2 border-t border-line px-4 py-2.5">{footer}</footer> : null}
        </div>
      ) : null}
    </dialog>
  );
}
