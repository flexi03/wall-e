// Gemeinsame Bausteine. Seiten setzen sich nur aus diesen Komponenten zusammen,
// damit Abstände, Farben und Verhalten überall gleich sind (docs/DESIGN.md).
import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ChevronRightIcon, XMarkIcon } from '@heroicons/react/20/solid';

const cx = (...classes) => classes.filter(Boolean).join(' ');

// ---------- Seite ----------

export function Page({ title, subtitle, action, back, children }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-4 md:px-6 lg:max-w-4xl lg:px-8 lg:pt-8">
      {back && (
        <Link to={back.to} className="-ml-1 mb-1 inline-flex min-h-11 items-center gap-0.5 text-body font-medium text-primary">
          <ChevronRightIcon className="h-5 w-5 rotate-180" aria-hidden="true" />
          {back.label}
        </Link>
      )}
      {(title || action) && (
        <header className="mb-5 flex items-end justify-between gap-3">
          <div className="min-w-0">
            {title && <h1 className="text-title text-ink">{title}</h1>}
            {subtitle && <p className="mt-0.5 text-caption text-muted">{subtitle}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className="space-y-6">{children}</div>
    </div>
  );
}

export function Section({ title, action, footer, children, className }) {
  return (
    <section className={className}>
      {(title || action) && (
        <div className="mb-2 flex min-h-6 items-end justify-between gap-3 px-1">
          {title && <h2 className="text-caption font-semibold text-muted">{title}</h2>}
          {action}
        </div>
      )}
      {children}
      {footer && <p className="mt-2 px-1 text-caption text-muted">{footer}</p>}
    </section>
  );
}

export function Card({ children, className, padded = true, as: Tag = 'div', ...props }) {
  return (
    <Tag className={cx('rounded-card border border-line bg-surface shadow-card dark:shadow-none', padded && 'p-4 sm:p-5', className)} {...props}>
      {children}
    </Tag>
  );
}

// ---------- Listen (gruppiert, wie in iOS-Einstellungen) ----------

export function List({ children, className }) {
  return (
    <Card padded={false} className={cx('divide-y divide-line overflow-hidden', className)}>
      {children}
    </Card>
  );
}

export function ListItem({ icon: Icon, iconTone = 'primary', title, subtitle, value, to, href, onClick, chevron, danger, children }) {
  const content = (
    <>
      {Icon && (
        <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.625rem]', TONES_SOFT[danger ? 'danger' : iconTone])}>
          <Icon className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cx('block truncate text-body', danger ? 'text-danger' : 'text-ink')}>{title}</span>
        {subtitle && <span className="block truncate text-caption text-muted">{subtitle}</span>}
      </span>
      {value !== undefined && value !== null && <span className="tabular shrink-0 text-body text-muted">{value}</span>}
      {children}
      {(chevron ?? !!(to || href || onClick)) && <ChevronRightIcon className="h-5 w-5 shrink-0 text-subtle" aria-hidden="true" />}
    </>
  );
  const base = 'flex min-h-[3.25rem] w-full items-center gap-3 px-4 py-2.5 text-left';
  const interactive = 'transition-colors hover:bg-surface-2 active:bg-surface-2';
  if (to)
    return (
      <Link to={to} className={cx(base, interactive)}>
        {content}
      </Link>
    );
  if (href)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cx(base, interactive)}>
        {content}
      </a>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cx(base, interactive)}>
        {content}
      </button>
    );
  return <div className={base}>{content}</div>;
}

// ---------- Buttons ----------

const BUTTON_VARIANTS = {
  primary: 'bg-primary text-primary-on hover:brightness-110 active:brightness-95',
  secondary: 'bg-primary-soft text-primary hover:brightness-[0.98] dark:hover:brightness-125',
  plain: 'bg-surface-2 text-ink hover:brightness-[0.98] dark:hover:brightness-125',
  ghost: 'text-primary hover:bg-primary-soft',
  danger: 'bg-danger-soft text-danger hover:brightness-[0.98] dark:hover:brightness-125'
};

const BUTTON_SIZES = {
  sm: 'min-h-9 px-3 text-caption gap-1.5 rounded-[0.625rem]',
  md: 'min-h-11 px-4 text-body gap-2 rounded-control',
  lg: 'min-h-[3.25rem] px-5 text-body gap-2 rounded-control'
};

export function Button({ variant = 'primary', size = 'md', block, icon: Icon, loading, to, className, children, disabled, ...props }) {
  const classes = cx(
    'inline-flex select-none items-center justify-center font-semibold transition-[filter,background-color] disabled:pointer-events-none disabled:opacity-40',
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    block && 'w-full',
    className
  );
  const inner = (
    <>
      {loading ? <Spinner className="h-4 w-4" /> : Icon && <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden="true" />}
      {children}
    </>
  );
  if (to)
    return (
      <Link to={to} className={classes}>
        {inner}
      </Link>
    );
  return (
    <button type="button" className={classes} disabled={disabled || loading} {...props}>
      {inner}
    </button>
  );
}

export function IconButton({ icon: Icon, label, onClick, className, spinning }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cx('inline-flex h-11 w-11 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary-soft', className)}
    >
      <Icon className={cx('h-[1.375rem] w-[1.375rem]', spinning && 'animate-spin')} aria-hidden="true" />
    </button>
  );
}

// ---------- Anzeige ----------

const TONES_SOFT = {
  primary: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-surface-2 text-muted'
};

const TONES_TEXT = {
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-muted'
};

export function Badge({ tone = 'neutral', children, dot }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-semibold', TONES_SOFT[tone])}>
      {dot && <span className={cx('h-1.5 w-1.5 rounded-full bg-current', dot === 'pulse' && 'animate-soft-pulse')} />}
      {children}
    </span>
  );
}

// Filter-Chip zum Ein-/Ausschalten (z. B. „Offen 27“)
export function Chip({ pressed, onClick, tone = 'primary', children }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-caption font-semibold transition-colors',
        pressed ? (tone === 'warning' ? 'bg-warning text-white dark:text-bg' : 'bg-primary text-primary-on') : TONES_SOFT[tone]
      )}
    >
      {children}
      {pressed && <XMarkIcon className="-mr-1 h-4 w-4" aria-hidden="true" />}
    </button>
  );
}

export function Banner({ tone = 'primary', icon: Icon, title, children, action }) {
  return (
    <div className={cx('flex items-start gap-3 rounded-card p-4', TONES_SOFT[tone])} role={tone === 'danger' ? 'alert' : undefined}>
      {Icon && <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />}
      <div className="min-w-0 flex-1 text-body">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(title && 'mt-0.5', 'text-ink/80')}>{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, hint, tone }) {
  return (
    <div className="min-w-0">
      <div className="text-caption text-muted">{label}</div>
      <div className={cx('tabular mt-0.5 break-words text-headline', tone ? TONES_TEXT[tone] : 'text-ink')}>{value}</div>
      {hint && <div className="mt-0.5 break-words text-caption text-muted">{hint}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <Card className="flex flex-col items-center px-6 py-10 text-center">
      {Icon && (
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Icon className="h-7 w-7" aria-hidden="true" />
        </span>
      )}
      <h2 className="text-headline text-ink">{title}</h2>
      {children && <div className="mt-1.5 max-w-sm text-body text-muted">{children}</div>}
      {action && <div className="mt-6 flex w-full max-w-xs flex-col gap-2">{action}</div>}
    </Card>
  );
}

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className }) {
  return <div className={cx('animate-soft-pulse rounded-control bg-surface-2', className)} />;
}

// Farbe einer Person: fest nach Reihenfolge (person-1 … person-6)
export const personColor = (index) => `rgb(var(--person-${(index % 6) + 1}))`;

export function PersonDot({ index, className = 'h-2.5 w-2.5' }) {
  return <span className={cx('inline-block shrink-0 rounded-full', className)} style={{ backgroundColor: personColor(index) }} aria-hidden="true" />;
}

// Kleines Etikett in der Farbe einer Person (z. B. Zuordnungs-Vorschlag)
export function PersonBadge({ index, children }) {
  const color = `var(--person-${(index % 6) + 1})`;
  return (
    <span
      className="inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-semibold"
      style={{ color: `rgb(${color})`, backgroundColor: `rgb(${color} / 0.16)` }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      <span className="truncate">{children}</span>
    </span>
  );
}

// Zwei Anteile als Balken mit Legende, z. B. Laden vs. Stehen
export function SplitLegend({ parts }) {
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        {total > 0 &&
          parts.map((p) =>
            p.value > 0 ? (
              <span key={p.label} className={cx('h-full first:rounded-l-full last:rounded-r-full', p.className)} style={{ width: `${(p.value / total) * 100}%` }} />
            ) : null
          )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4">
        {parts.map((p) => (
          <div key={p.label} className="min-w-0">
            <div className="flex items-center gap-1.5 text-caption text-muted">
              <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', p.className)} aria-hidden="true" />
              {p.label}
            </div>
            <div className="tabular mt-0.5 break-words text-headline text-ink">{p.text}</div>
            <div className="tabular text-caption text-muted">{total > 0 ? `${Math.round((p.value / total) * 100)} %` : '–'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Balken mit den Anteilen aller Personen. colors[i] = Farbindex der Person, null = grau (nicht zugeordnet).
// highlight = Index, der hervorgehoben wird (die anderen werden blasser).
export function SplitBar({ shares, colors, highlight = null }) {
  const total = shares.reduce((sum, s) => sum + s, 0);
  if (!(total > 0)) return <div className="h-2.5 rounded-full bg-surface-2" />;
  return (
    <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
      {shares.map((share, i) => {
        if (!(share > 0)) return null;
        const color = colors ? colors[i] : i;
        return (
          <span
            key={i}
            className={cx('h-full first:rounded-l-full last:rounded-r-full transition-opacity', highlight !== null && highlight !== i && 'opacity-30')}
            style={{ width: `${(share / total) * 100}%`, backgroundColor: color === null || color === undefined ? 'rgb(var(--subtle))' : personColor(color) }}
          />
        );
      })}
    </div>
  );
}

// ---------- Eingaben ----------

export function Field({ label, hint, error, children, id }) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="mb-1.5 block px-1 text-caption font-semibold text-muted">
          {label}
        </label>
      )}
      {children}
      {error ? <p className="mt-1.5 px-1 text-caption text-danger">{error}</p> : hint && <p className="mt-1.5 px-1 text-caption text-muted">{hint}</p>}
    </div>
  );
}

const inputClasses =
  'block w-full min-h-12 rounded-control border border-line bg-surface px-4 text-body text-ink placeholder:text-subtle transition-colors focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 disabled:opacity-50';

export function TextField({ label, hint, error, unit, className, multiline, ...props }) {
  const id = useId();
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <Field label={label} hint={hint} error={error} id={id}>
      <div className="relative">
        <Tag id={id} className={cx(inputClasses, multiline && 'py-3', unit && 'pr-16', error && 'border-danger', className)} rows={multiline ? 3 : undefined} {...props} />
        {unit && <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-body text-muted">{unit}</span>}
      </div>
    </Field>
  );
}

// Zahlenfeld mit Komma-Tastatur auf dem Handy
export function NumberField(props) {
  return <TextField inputMode="decimal" autoComplete="off" enterKeyHint="done" {...props} />;
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-control bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-[0.625rem] px-2 text-caption font-semibold transition-colors',
            value === o.value ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'
          )}
        >
          {o.icon && <o.icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
          <span className="truncate">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Checkbox({ checked, onChange, title, subtitle, disabled }) {
  return (
    <label className={cx('flex min-h-[3.25rem] cursor-pointer items-center gap-3 px-4 py-2.5', disabled && 'cursor-not-allowed opacity-40')}>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span
        className={cx(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20',
          checked ? 'border-primary bg-primary text-primary-on' : 'border-line bg-surface'
        )}
        aria-hidden="true"
      >
        {checked && (
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 8.5l3 3 6-7" />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body text-ink">{title}</span>
        {subtitle && <span className="block text-caption text-muted">{subtitle}</span>}
      </span>
    </label>
  );
}

// ---------- Sheet: auf dem Handy von unten, ab Tablet als Dialog ----------

export function Sheet({ open, onClose, title, children, footer }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    // Fokus in den Dialog, aber nicht auf ein Eingabefeld (sonst springt auf dem Handy sofort die Tastatur auf)
    requestAnimationFrame(() => panelRef.current && panelRef.current.focus());
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (previous && previous.focus) previous.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[92dvh] w-full animate-sheet-in flex-col rounded-t-[1.5rem] bg-surface shadow-sheet outline-none sm:max-w-lg sm:animate-pop-in sm:rounded-card"
      >
        <div className="flex justify-center pt-2 sm:hidden" aria-hidden="true">
          <span className="h-1.5 w-10 rounded-full bg-line" />
        </div>
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-2 sm:pt-4">
          <h2 className="text-headline text-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Schließen" className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface-2">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        {footer && <div className="border-t border-line px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmSheet({ open, onClose, onConfirm, title, children, confirmLabel = 'Bestätigen', danger }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="plain" onClick={onClose} block className="sm:w-auto">
            Abbrechen
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            block
            className="sm:w-auto"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="text-body text-muted">{children}</div>
    </Sheet>
  );
}

// ---------- Kurze Rückmeldungen ----------

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const show = useCallback((message, tone = 'success') => {
    clearTimeout(timer.current);
    setToast({ message, tone, key: Date.now() });
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 lg:bottom-8" aria-live="polite">
        {toast && (
          <div
            key={toast.key}
            className={cx('animate-pop-in rounded-full px-4 py-2.5 text-body font-semibold shadow-sheet', toast.tone === 'danger' ? 'bg-danger text-white' : 'bg-ink text-bg')}
          >
            {toast.message}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
