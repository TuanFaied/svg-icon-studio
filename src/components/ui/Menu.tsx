'use client';

import { Check } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { cx } from './primitives';

export type MenuEntry =
  | { kind: 'item'; label: string; icon?: ReactNode; shortcut?: string; disabled?: boolean; onSelect: () => void }
  | { kind: 'check'; label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }
  | { kind: 'radio'; label: string; checked: boolean; onSelect: () => void }
  | { kind: 'label'; label: string }
  | { kind: 'separator' };

/**
 * Dropdown menu with WAI-ARIA menu semantics: arrow keys / Home / End move
 * focus, Enter or Space activates, Escape closes and returns focus to the
 * trigger, clicking outside or tabbing away closes it.
 */
export function Menu({
  label, icon, entries, align = 'end', triggerClassName, children,
}: { label: string; icon?: ReactNode; entries: MenuEntry[]; align?: 'start' | 'end'; triggerClassName?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const items = () => [...(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? [])];
  const focusAt = (i: number) => {
    const list = items();
    if (list.length) list[(i + list.length) % list.length].focus();
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => focusAt(0));
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); focusAt(i + 1); break;
      case 'ArrowUp': e.preventDefault(); focusAt(i - 1); break;
      case 'Home': e.preventDefault(); focusAt(0); break;
      case 'End': e.preventDefault(); focusAt(list.length - 1); break;
      case 'Escape': e.preventDefault(); e.stopPropagation(); close(); break;
      case 'Tab': setOpen(false); break;
    }
  };

  const run = (fn: () => void) => {
    close();
    fn();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cx(
          'inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md border px-1.5 transition-colors',
          open ? 'border-line bg-panel-2' : 'border-transparent hover:bg-panel-2',
          triggerClassName,
        )}
      >
        {icon}
        {children}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          className={cx(
            'absolute top-full z-50 mt-1 min-w-52 rounded-lg border border-line bg-panel p-1 text-fg shadow-xl',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {entries.map((e, i) => {
            if (e.kind === 'separator') return <div key={i} role="separator" className="my-1 h-px bg-line" />;
            if (e.kind === 'label') return <div key={i} className="px-2 pt-1.5 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{e.label}</div>;
            const role = e.kind === 'item' ? 'menuitem' : e.kind === 'check' ? 'menuitemcheckbox' : 'menuitemradio';
            const checked = e.kind === 'item' ? undefined : e.checked;
            const disabled = 'disabled' in e && !!e.disabled;
            const activate = () => {
              if (disabled) return;
              if (e.kind === 'check') run(() => e.onChange(!e.checked));
              else run(e.onSelect);
            };
            return (
              <div
                key={i}
                role={role}
                tabIndex={-1}
                aria-checked={checked}
                aria-disabled={disabled || undefined}
                onClick={activate}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    activate();
                  }
                }}
                className={cx(
                  'flex h-8 cursor-default items-center gap-2 rounded-md px-2 outline-none select-none',
                  disabled ? 'opacity-45' : 'hover:bg-panel-2 focus:bg-accent-soft focus:text-accent',
                )}
              >
                <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden>
                  {e.kind === 'item' ? e.icon : checked ? <Check size={14} /> : null}
                </span>
                <span className="flex-1 whitespace-nowrap">{e.label}</span>
                {e.kind === 'item' && e.shortcut && <span className="text-[11px] text-muted">{e.shortcut}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
