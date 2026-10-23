'use client';

import { type ButtonHTMLAttributes, forwardRef, type ReactNode, useId } from 'react';

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

type Variant = 'default' | 'primary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  default: 'bg-panel border border-line text-fg hover:bg-panel-2 active:bg-line',
  primary: 'bg-accent text-accent-fg border border-transparent hover:brightness-110 active:brightness-95',
  ghost: 'bg-transparent border border-transparent text-fg hover:bg-panel-2 active:bg-line',
  danger: 'bg-panel border border-line text-danger hover:bg-panel-2 active:bg-line',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'md', loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors select-none',
        'disabled:opacity-45 disabled:pointer-events-none',
        size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-[13px]',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <span className="size-3 rounded-full border-2 border-current border-r-transparent animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  shortcut?: string;
  active?: boolean;
  tooltipSide?: 'top' | 'bottom' | 'right' | 'left';
}

/** Icon-only button with an accessible name and a tooltip that includes the shortcut. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, active, className, children, tooltipSide = 'bottom', ...rest },
  ref,
) {
  const tip = shortcut ? `${label} (${shortcut})` : label;
  const side = {
    top: 'bottom-full mb-1.5 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-1.5 left-1/2 -translate-x-1/2',
    right: 'left-full ml-1.5 top-1/2 -translate-y-1/2',
    left: 'right-full mr-1.5 top-1/2 -translate-y-1/2',
  }[tooltipSide];
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-keyshortcuts={shortcut}
      aria-pressed={active === undefined ? undefined : active}
      className={cx(
        'group relative inline-flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors',
        'disabled:opacity-40 disabled:pointer-events-none',
        active ? 'bg-accent-soft border-accent text-accent' : 'border-transparent text-fg hover:bg-panel-2 active:bg-line',
        className,
      )}
      {...rest}
    >
      {children}
      <span
        role="tooltip"
        className={cx(
          'pointer-events-none absolute z-50 hidden whitespace-nowrap rounded bg-fg px-1.5 py-0.5 text-[11px] font-medium text-bg shadow-sm',
          'group-hover:block group-focus-visible:block',
          side,
        )}
      >
        {tip}
      </span>
    </button>
  );
});

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="border-b border-line px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Toggle({ label, checked, onChange, disabled, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; hint?: string }) {
  const id = useId();
  return (
    <div className={cx('flex items-start justify-between gap-3 py-1', disabled && 'opacity-50')}>
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block">{label}</span>
        {hint ? <span className="block text-[11px] leading-snug text-muted">{hint}</span> : null}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-[18px] w-8 shrink-0 rounded-full border transition-colors disabled:pointer-events-none',
          checked ? 'border-accent bg-accent' : 'border-line-strong bg-panel-2',
        )}
      >
        <span className={cx('absolute top-[2px] size-3 rounded-full bg-white shadow transition-[left]', checked ? 'left-[15px]' : 'left-[2px]')} />
      </button>
    </div>
  );
}

export function Slider({
  label, value, min, max, step = 1, onChange, format, disabled,
}: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className={cx('py-1', disabled && 'opacity-50')}>
      <div className="mb-1 flex justify-between">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="tabular-nums text-muted">{format ? format(value) : value}</output>
      </div>
      <input
        id={id}
        type="range"
        className="w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function Select<T extends string>({
  label, value, options, onChange, disabled,
}: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-7 min-w-0 rounded-md border border-line bg-panel px-1.5 text-[12px] text-fg disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function Segmented<T extends string>({
  value, options, onChange, label, className,
}: { value: T; options: Array<{ value: T; label: ReactNode; title?: string }>; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('inline-flex rounded-md border border-line bg-panel-2 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-6 flex-1 rounded px-2 text-[12px] font-medium whitespace-nowrap transition-colors',
            value === o.value ? 'bg-panel text-fg shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function NumberField({
  label, value, min, max, onChange, className,
}: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; className?: string }) {
  const id = useId();
  return (
    <div className={cx('flex flex-col gap-0.5', className)}>
      <label htmlFor={id} className="text-[11px] text-muted">{label}</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-7 w-full rounded-md border border-line bg-panel px-2 tabular-nums text-fg"
      />
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-[11px]">{children}</kbd>;
}
