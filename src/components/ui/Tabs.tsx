'use client';

import { type ReactNode, useId, useRef } from 'react';
import { cx } from './primitives';

export interface TabDef<T extends string> {
  id: T;
  label: ReactNode;
}

/**
 * Tab list + panel with WAI-ARIA tab semantics: only the selected tab is in
 * the tab order; arrow keys, Home and End move between tabs.
 */
export function Tabs<T extends string>({
  label, tabs, value, onChange, children, className, panelClassName,
}: {
  label: string;
  tabs: Array<TabDef<T>>;
  value: T;
  onChange: (id: T) => void;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
}) {
  const base = useId();
  const listRef = useRef<HTMLDivElement>(null);

  const move = (delta: number | 'first' | 'last') => {
    const i = tabs.findIndex((t) => t.id === value);
    const next = delta === 'first' ? 0 : delta === 'last' ? tabs.length - 1 : (i + delta + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-tab="${tabs[next].id}"]`)?.focus());
  };

  return (
    <div className={cx('flex min-h-0 flex-col', className)}>
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        className="flex shrink-0 gap-1 border-b border-line px-2 pt-1.5"
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); move(1); }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
          else if (e.key === 'Home') { e.preventDefault(); move('first'); }
          else if (e.key === 'End') { e.preventDefault(); move('last'); }
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${base}-${t.id}`}
            data-tab={t.id}
            aria-selected={value === t.id}
            aria-controls={`${base}-panel`}
            tabIndex={value === t.id ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cx(
              '-mb-px h-8 rounded-t-md border-b-2 px-3 text-[12px] font-medium transition-colors',
              value === t.id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-${value}`} className={cx('min-h-0 flex-1', panelClassName)}>
        {children}
      </div>
    </div>
  );
}
