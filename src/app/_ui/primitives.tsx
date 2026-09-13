import type { ComponentType, ReactNode, SVGProps } from "react";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300";

export type ButtonVariant = "primary" | "brand" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-white text-slate-950 hover:bg-cyan-50",
  brand:
    "bg-linear-to-r from-cyan-400 via-violet-400 to-pink-400 text-slate-950 shadow-[0_10px_40px_-12px_rgba(167,139,250,0.7)] hover:brightness-110",
  secondary: "border border-white/15 bg-white/[0.04] text-white hover:border-white/25 hover:bg-white/[0.08]",
  ghost: "text-slate-300 hover:bg-white/[0.06] hover:text-white",
  danger: "text-rose-300 hover:bg-rose-500/10 hover:text-rose-200",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-lg px-3 text-[13px]",
  md: "h-10 gap-2 rounded-xl px-4 text-sm",
  lg: "h-12 gap-2 rounded-full px-6 text-[15px]",
};

/** Class string for anything button-shaped: <button>, <Link>, <a>. */
export function buttonStyles(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return cx(
    "inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition disabled:pointer-events-none disabled:opacity-50",
    focusRing,
    VARIANTS[variant],
    SIZES[size],
  );
}

export const inputStyles = cx(
  "block w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[15px] text-white",
  "placeholder:text-slate-500 transition",
  "focus:border-cyan-300/60 focus:bg-white/[0.06] focus:outline-none focus:ring-4 focus:ring-cyan-300/10",
  "disabled:opacity-50",
);

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx("rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm", className)}>
      {children}
    </div>
  );
}

export function CardHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: IconType;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4 sm:px-6">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-cyan-300">
            <Icon className="size-4" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-semibold text-white">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-slate-400">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "violet";

const TONES: Record<Tone, { badge: string; dot: string }> = {
  neutral: { badge: "border-white/10 bg-white/[0.05] text-slate-300", dot: "bg-slate-400" },
  info: { badge: "border-cyan-400/25 bg-cyan-400/10 text-cyan-200", dot: "bg-cyan-300" },
  success: { badge: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200", dot: "bg-emerald-400" },
  warning: { badge: "border-amber-400/25 bg-amber-400/10 text-amber-200", dot: "bg-amber-300" },
  danger: { badge: "border-rose-400/25 bg-rose-400/10 text-rose-200", dot: "bg-rose-400" },
  violet: { badge: "border-violet-400/25 bg-violet-400/10 text-violet-200", dot: "bg-violet-300" },
};

export function Badge({
  tone = "neutral",
  dot = false,
  pulse = false,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        t.badge,
        className,
      )}
    >
      {dot && (
        <span className="relative flex size-1.5">
          {pulse && <span className={cx("night-ping absolute inline-flex size-full rounded-full", t.dot)} />}
          <span className={cx("relative inline-flex size-1.5 rounded-full", t.dot)} />
        </span>
      )}
      {children}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">{eyebrow}</p>
        )}
        <h1 className="mt-2 text-balance text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
          {title}
        </h1>
        {description && <p className="mt-2 max-w-2xl text-pretty text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Callout({
  tone = "info",
  icon: Icon,
  title,
  children,
  className,
}: {
  tone?: Exclude<Tone, "neutral" | "violet">;
  icon?: IconType;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const styles = {
    info: "border-cyan-400/20 bg-cyan-400/[0.06] text-cyan-100",
    success: "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-100",
    warning: "border-amber-400/20 bg-amber-400/[0.06] text-amber-100",
    danger: "border-rose-400/20 bg-rose-400/[0.06] text-rose-100",
  }[tone];
  const iconColor = {
    info: "text-cyan-300",
    success: "text-emerald-300",
    warning: "text-amber-300",
    danger: "text-rose-300",
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : undefined} className={cx("flex gap-3 rounded-xl border p-3.5 text-sm", styles, className)}>
      {Icon && <Icon className={cx("mt-0.5 size-4 shrink-0", iconColor)} />}
      <div className="min-w-0 leading-relaxed">
        {title && <p className="font-semibold text-white">{title}</p>}
        {children && <div className={cx(title ? "mt-0.5" : "", "text-slate-300")}>{children}</div>}
      </div>
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-200">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{hint}</p>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: IconType;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-400">
        <Icon className="size-5" />
      </span>
      <p className="mt-4 font-semibold text-white">{title}</p>
      {children && <p className="mt-1.5 max-w-sm text-sm text-slate-400">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
