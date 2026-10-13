import type { ReactNode } from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

/** A labelled slider with its value shown alongside (and read out to screen readers). */
export function LabeledSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  display,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  display: string;
  hint?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span className="num text-sm text-primary">{display}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} aria-label={label} aria-valuetext={display} />
      {hint && <div className="text-2xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** A row of small choice chips. */
export function Chips<T extends string | number>({ options, value, onChange, label }: { options: { v: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          role="radio"
          aria-checked={o.v === value}
          onClick={() => onChange(o.v)}
          className={cn(
            "h-8 rounded-full border px-3 text-xs transition-colors",
            o.v === value ? "border-primary/50 bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A big number with a caption (`sm` for words rather than numbers). */
export function Readout({ value, label, tone, size = "lg" }: { value: ReactNode; label: string; tone?: "good" | "fair" | "poor"; size?: "lg" | "sm" }) {
  return (
    <div className="min-w-0">
      <div
        className={cn(
          size === "lg" ? "num text-xl font-medium leading-tight" : "text-sm font-medium leading-snug",
          tone === "good" ? "text-q-excellent" : tone === "fair" ? "text-q-fair" : tone === "poor" ? "text-q-poor" : "",
        )}
      >
        {value}
      </div>
      <div className="eyebrow mt-0.5">{label}</div>
    </div>
  );
}

/** Deterministic pseudo-random numbers, so star fields look the same on every render. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A night-sky backdrop that stays dark in every theme. */
export const SKY = "bg-[#05070c]";
