import type { ReactNode } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { QUALITY_BG, QUALITY_TEXT, qualityOf, type QualityKey } from "@/lib/objects";
import { useCountUp } from "@/lib/motion";
import { useEffect } from "react";

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · AstroPilot` : "AstroPilot";
  }, [title]);
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 animate-rise">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="font-display text-[2.1rem] leading-[1.05] tracking-tight sm:text-[2.6rem]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-[0.95rem]">{description}</p>}
      </div>
      {actions && (
        <div className="flex shrink-0 animate-fade flex-wrap items-center gap-2" style={{ animationDelay: "0.12s" }}>
          {actions}
        </div>
      )}
    </header>
  );
}

export function Section({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("flex flex-col gap-3", className)}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-[1.05rem] font-semibold tracking-tight">{title}</h2>}
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="eyebrow">{label}</div>
      <div className="num mt-1 text-xl font-medium leading-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function QualityPill({ score, label, className }: { score: number | null | undefined; label?: string; className?: string }) {
  const q = qualityOf(score);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", QUALITY_TEXT[q.key], className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", QUALITY_BG[q.key])} />
      {label ?? q.label}
    </span>
  );
}

export function ToneDot({ tone, className }: { tone: QualityKey; className?: string }) {
  return <span className={cn("inline-block h-2 w-2 rounded-full", QUALITY_BG[tone], className)} />;
}

/** Circular 0–100 score dial. The arc sweeps up to the score as the number counts to it. */
export function ScoreDial({ score, size = 112, stroke = 9, label }: { score: number; size?: number; stroke?: number; label?: ReactNode }) {
  const shown = useCountUp(score, { duration: 1100 });
  const q = qualityOf(score);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, shown)) / 100;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className={cn("transition-colors duration-700", QUALITY_TEXT[q.key])}
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="num text-[1.9rem] font-semibold leading-none" aria-hidden="true">
            {Math.round(shown)}
          </div>
          <span className="sr-only">{Math.round(score)}</span>
          {label && <div className="mt-1 text-2xs uppercase tracking-[0.12em] text-muted-foreground">{label}</div>}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center", className)}>
      {icon && <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">{icon}</div>}
      <div className="max-w-sm">
        <div className="font-medium">{title}</div>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <EmptyState
      title="Couldn't load this"
      description={message ?? "Something went wrong. Please try again."}
      action={
        onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )
      }
    />
  );
}

export function SignInPrompt({ title, description }: { title: string; description: string }) {
  return (
    <EmptyState
      title={title}
      description={description}
      action={
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/register">Create free account</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      }
    />
  );
}

/** A number that counts up when it first shows (screen readers get the final value straight away). */
export function CountUp({ value, format = (v: number) => String(Math.round(v)), duration = 900 }: { value: number; format?: (v: number) => string; duration?: number }) {
  const shown = useCountUp(value, { duration });
  return (
    <>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}

export function Skel({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-lg", className)} />;
}
