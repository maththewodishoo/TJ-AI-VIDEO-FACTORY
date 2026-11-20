import { clsx } from "clsx";
import { AlertTriangle, Check, Info, Loader2, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

export const cn = clsx;

/* ── Buttons ──────────────────────────────────────────────────────────────── */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  children,
  className,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  loading?: boolean;
  icon?: ReactNode;
}) {
  const variantClass = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    ghost: "btn-ghost",
    danger: "btn-danger",
  }[variant];
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(variantClass, size === "sm" && "btn-sm", className)}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

/* ── Surfaces ─────────────────────────────────────────────────────────────── */

export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
  as: Tag = "section",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag className={cn("panel", className)}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="font-display text-base font-semibold tracking-tight text-white">{title}</h2>}
            {subtitle && <p className="mt-1 text-[13px] leading-relaxed text-slate-400">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </Tag>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-neon-blue/80">{eyebrow}</p>
        )}
        <h1 className="section-title text-[1.6rem] leading-tight sm:text-3xl">{title}</h1>
        {description && <p className="muted mt-2 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "blue" | "violet" | "green" | "amber" | "rose";
  className?: string;
}) {
  const tones = {
    neutral: "border-white/10 bg-white/5 text-slate-300",
    blue: "border-sky-400/25 bg-sky-400/10 text-sky-200",
    violet: "border-violet-400/25 bg-violet-400/10 text-violet-200",
    green: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
    amber: "border-amber-400/25 bg-amber-400/10 text-amber-200",
    rose: "border-rose-400/25 bg-rose-400/10 text-rose-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Progress({ value, className, label }: { value: number; className?: string; label?: string }) {
  return (
    <div className={className}>
      {label && <p className="mb-1.5 text-[11px] text-slate-400">{label}</p>}
      <div className="progress-track" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-bar" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-neon-blue">
        {icon}
      </div>
      <h3 className="font-display text-base font-semibold text-white">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-slate-400">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-start gap-2.5 rounded-xl border border-rose-400/25 bg-rose-500/[0.08] px-3.5 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
      <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-rose-100/90">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary btn-sm border-rose-300/30 text-rose-100">
          Retry
        </button>
      )}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
        {icon && <span className="text-slate-500">{icon}</span>}
      </div>
      <p className="mt-2 font-display text-xl font-semibold text-white">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

/* ── Form controls ────────────────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="label">{label}</span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-[11px] text-rose-300">{error}</span>
      ) : (
        hint && <span className="mt-1.5 block text-[11px] leading-relaxed text-slate-500">{hint}</span>
      )}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className="flex w-full items-start gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3 text-left transition hover:border-white/16"
    >
      <span
        className={cn(
          "mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full border p-0.5 transition",
          checked ? "border-neon-blue/40 bg-neon-blue/30" : "border-white/15 bg-white/10",
        )}
      >
        <span
          className={cn(
            "h-4 w-4 rounded-full bg-white shadow transition",
            checked ? "translate-x-4" : "translate-x-0",
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-slate-100">{label}</span>
        {description && <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">{description}</span>}
      </span>
    </button>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex flex-wrap gap-1 rounded-xl border border-white/10 bg-ink-950/60 p-1", className)}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-[12px] font-medium transition",
            option.value === value
              ? "bg-gradient-to-r from-neon-blue/30 to-neon-violet/30 text-white shadow-[inset_0_0_0_1px_rgba(120,160,255,.3)]"
              : "text-slate-400 hover:text-white",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ── Modal ────────────────────────────────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/80 p-0 backdrop-blur-md sm:items-center sm:p-6">
      <button className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-white/12 bg-ink-900/95 p-5 shadow-card scroll-thin sm:rounded-2xl",
          wide ? "sm:max-w-3xl" : "sm:max-w-lg",
        )}
      >
        <header className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close dialog">
            <X className="h-4 w-4" />
          </button>
        </header>
        {children}
        {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* ── Toasts ───────────────────────────────────────────────────────────────── */

type ToastTone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<{ toast: (message: string, tone?: ToastTone) => void }>({
  toast: () => undefined,
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current.slice(-2), { id, message, tone }]);
    setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 5200);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] shadow-card backdrop-blur-xl animate-fade-up",
              item.tone === "success" && "border-emerald-400/25 bg-emerald-950/80 text-emerald-100",
              item.tone === "error" && "border-rose-400/25 bg-rose-950/80 text-rose-100",
              item.tone === "info" && "border-white/12 bg-ink-850/90 text-slate-100",
            )}
            role="status"
          >
            {item.tone === "success" ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
            ) : item.tone === "error" ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span className="leading-relaxed">{item.message}</span>
            <button
              onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
              className="ml-auto shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
