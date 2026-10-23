'use client';

import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { useUi } from '@/store/ui';
import { cx } from './primitives';

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 max-lg:bottom-20">
      {toasts.map((t) => {
        const Icon = t.tone === 'success' ? CheckCircle2 : t.tone === 'error' ? TriangleAlert : Info;
        return (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex max-w-md items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 shadow-lg"
          >
            <Icon size={16} className={cx(t.tone === 'success' && 'text-green-600', t.tone === 'error' && 'text-danger', t.tone === 'info' && 'text-accent')} aria-hidden />
            <span>{t.message}</span>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="ml-1 rounded p-0.5 text-muted hover:text-fg">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
