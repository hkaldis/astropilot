import { useId, useRef } from "react";
import { BORTLE, nelmFromSqm } from "@shared/astro/visibility";
import { cn } from "@/lib/utils";

/** Sky colour for each Bortle class, darkest to brightest (theme tokens, so light/night modes stay right). */
export const SKY_SWATCH: Record<number, string> = {
  1: "bg-sky-night ring-1 ring-inset ring-border",
  2: "bg-sky-astro/70",
  3: "bg-sky-astro",
  4: "bg-sky-nautical/80",
  5: "bg-sky-nautical",
  6: "bg-sky-civil/80",
  7: "bg-sky-civil",
  8: "bg-sky-day/80",
  9: "bg-sky-day",
};

export const bortleTone = (b: number) => (b <= 2 ? "text-q-excellent" : b <= 4 ? "text-q-good" : b === 5 ? "text-q-fair" : b <= 7 ? "text-q-poor" : "text-q-bad");

/** Bortle 1–9 picker: a radio group laid out as a dark → bright sky scale (arrow keys move). */
export function BortleScale({ value, onChange, disabled, labelledBy }: { value: number; onChange: (b: number) => void; disabled?: boolean; labelledBy?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (b: number) => {
    const n = Math.min(9, Math.max(1, b));
    onChange(n);
    refs.current[n - 1]?.focus();
  };
  return (
    <div>
      <div role="radiogroup" aria-labelledby={labelledBy} aria-disabled={disabled || undefined} className="grid grid-cols-9 gap-1">
        {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => {
          const on = n === value;
          return (
            <button
              key={n}
              ref={(el) => (refs.current[n - 1] = el)}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`Bortle ${n}: ${BORTLE[n].label}`}
              tabIndex={on ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(n)}
              onKeyDown={(e) => {
                const k = e.key;
                if (k === "ArrowRight" || k === "ArrowUp") move(value + 1);
                else if (k === "ArrowLeft" || k === "ArrowDown") move(value - 1);
                else if (k === "Home") move(1);
                else if (k === "End") move(9);
                else return;
                e.preventDefault();
              }}
              className={cn(
                "flex h-11 min-w-0 flex-col items-center justify-between rounded-md px-0.5 pb-1.5 pt-1 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
                on ? "bg-accent font-semibold text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <span className="num">{n}</span>
              <span className={cn("h-1.5 w-full rounded-full", SKY_SWATCH[n], on && "outline outline-2 outline-offset-1 outline-primary")} />
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between px-0.5 text-2xs text-muted-foreground" aria-hidden="true">
        <span>Darkest</span>
        <span>Inner city</span>
      </div>
    </div>
  );
}

/** The selected class explained: label, description, typical SQM and naked-eye limit. */
export function BortleExplainer({
  bortle,
  sqm,
  sqmKind = "measured",
  className,
}: {
  bortle: number;
  sqm?: number | null;
  /** Where `sqm` came from: a meter reading, or the light-pollution atlas (an estimate). */
  sqmKind?: "measured" | "atlas";
  className?: string;
}) {
  const b = BORTLE[bortle];
  return (
    <div className={cn("rounded-lg bg-surface-2 px-3 py-2.5", className)}>
      <div className="text-sm font-medium">
        Bortle {bortle} · {b.label}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{b.description}</p>
      <p className="num mt-1 text-2xs text-muted-foreground">
        {sqm ? `${sqmKind === "atlas" ? "Atlas estimate" : "Measured"} SQM ${sqm.toFixed(2)}` : `Typical SQM ${b.sqm.toFixed(1)}`} mag/arcsec² · naked-eye limit ≈{" "}
        {/* The same limit every rating in the app uses (overhead, for this sky brightness). */}
        {nelmFromSqm(sqm ?? b.sqm).toFixed(1)}
      </p>
    </div>
  );
}

export function useBortleLabelId() {
  return `bortle-${useId().replace(/:/g, "")}`;
}

export function lightPollutionUrl(lat: number, lon: number) {
  return `https://www.lightpollutionmap.info/#zoom=9&lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
}

// ------------------------------------------------------------------------------------
// Formatting
// ------------------------------------------------------------------------------------

export const fmtLat = (lat: number) => `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? "N" : "S"}`;
export const fmtLon = (lon: number) => `${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? "E" : "W"}`;

export function fmtElevation(m: number, units: "metric" | "imperial" = "metric") {
  return units === "imperial" ? `${Math.round(m * 3.28084).toLocaleString("en")} ft` : `${Math.round(m).toLocaleString("en")} m`;
}

/** "UTC+3", "UTC−5:30" for a time zone right now. */
export function tzOffset(tz: string): string | null {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value;
    if (!part) return null;
    return part.replace("GMT", "UTC").replace("-", "−");
  } catch {
    return null;
  }
}
