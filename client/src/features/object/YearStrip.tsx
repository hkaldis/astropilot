/**
 * Through the year: how high the object gets around the darkest part of the night
 * (22:00–02:00 local solar time) on the 15th of each of the next 12 months, and the
 * months that suit it best.
 */
import { useMemo } from "react";
import { A, altAzRaDec, bodyAltAz, solarDateOf, sunAltitude, type Site } from "@shared/astro";
import { cn } from "@/lib/utils";

export interface YearMonth {
  month: number; // 0..11
  year: number;
  t: number;
  alt: number;
  sunAlt: number;
}

const HOUR = 3_600_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function yearAltitudes(site: Site, now: number, pos: { ra: number; dec: number } | { body: A.Body }): YearMonth[] {
  const [y0, m0] = solarDateOf(now, site.lon).split("-").map(Number);
  const out: YearMonth[] = [];
  for (let i = 0; i < 12; i++) {
    const m = (m0 - 1 + i) % 12;
    const y = y0 + Math.floor((m0 - 1 + i) / 12);
    // Local mean solar midnight between the 15th and the 16th; best altitude within ±2 h of it.
    const t = Date.UTC(y, m, 16, 0, 0) - (site.lon / 15) * HOUR;
    let alt = -90;
    for (let k = -4; k <= 4; k++) {
      const tk = t + k * 0.5 * HOUR;
      alt = Math.max(alt, "body" in pos ? bodyAltAz(pos.body, tk, site).alt : altAzRaDec(pos.ra, pos.dec, tk, site).alt);
    }
    out.push({ month: m, year: y, t, alt, sunAlt: sunAltitude(t, site) });
  }
  return out;
}

/** Twilight brighter than this at midnight (Sun above −12°) means no real night for deep-sky objects. */
const BRIGHT_SUN_ALT = -12;

/**
 * Months (calendar order, may wrap the year end) where the object is near its best at midnight — among the
 * months that have a dark night at all (far north or south, summer's are bright all night).
 */
export function bestMonths(months: YearMonth[], minAlt: number): string | null {
  const dark = months.filter((m) => m.sunAlt <= BRIGHT_SUN_ALT);
  if (!dark.length) return null;
  const peak = Math.max(...dark.map((m) => m.alt));
  if (peak < minAlt) return null;
  const thr = Math.max(minAlt, peak * 0.85);
  const good = Array.from({ length: 12 }, () => false);
  for (const m of dark) if (m.alt >= thr) good[m.month] = true;
  if (good.every(Boolean)) return "all year";
  // Walk the calendar circle starting just after a "bad" month, so runs never get split.
  const s = (good.findIndex((g, i) => !g && good[(i + 1) % 12]) + 1) % 12;
  const runs: [number, number][] = [];
  let open: number | null = null;
  for (let k = 0; k < 12; k++) {
    const m = (s + k) % 12;
    if (good[m] && open === null) open = m;
    if (!good[m] && open !== null) {
      runs.push([open, (m + 11) % 12]);
      open = null;
    }
  }
  if (open !== null) runs.push([open, (s + 11) % 12]);
  return runs
    .slice(0, 2)
    .map(([a, b]) => (a === b ? MONTHS[a] : `${MONTHS[a]}–${MONTHS[b]}`))
    .join(", ");
}

/** Colour bands above the user's minimum altitude, always three distinct ones: min+, min + 10°+ and 50°+ (min + 20°+ for high minimums). */
export function altitudeBands(minAlt: number): { good: number; excellent: number } {
  return { good: minAlt + 10, excellent: Math.max(50, minAlt + 20) };
}

function tone(alt: number, minAlt: number) {
  const b = altitudeBands(minAlt);
  if (alt >= b.excellent) return "bg-q-excellent";
  if (alt >= b.good) return "bg-q-good";
  if (alt >= minAlt) return "bg-q-fair";
  if (alt > 0) return "bg-muted-foreground/40";
  return "bg-transparent";
}

export function YearStrip({ months, minAlt, className }: { months: YearMonth[]; minAlt: number; className?: string }) {
  const best = useMemo(() => bestMonths(months, minAlt), [months, minAlt]);
  const bands = altitudeBands(minAlt);
  const H = 64;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="grid grid-cols-12 items-end gap-1" role="list" aria-label="Highest altitude around midnight, month by month">
        {months.map((m, i) => {
          const h = Math.max(0, Math.min(90, m.alt)) / 90;
          const bright = m.sunAlt > BRIGHT_SUN_ALT;
          return (
            <div
              key={`${m.year}-${m.month}`}
              role="listitem"
              className="flex flex-col items-center gap-1"
              aria-label={`${MONTHS[m.month]} ${m.year}: ${m.alt > 0 ? `up to ${Math.round(m.alt)}° around midnight` : "below the horizon around midnight"}${bright ? ", twilight all night" : ""}`}
              title={`${MONTHS[m.month]} ${m.year}: ${m.alt > 0 ? `up to ${Math.round(m.alt)}°` : "below the horizon"} around midnight${bright ? " (bright twilight nights)" : ""}`}
            >
              <div className={cn("relative flex w-full items-end justify-center rounded-md", bright ? "bg-sky-civil/25" : "bg-muted/50")} style={{ height: H }}>
                {m.alt > 0 ? (
                  <div className={cn("w-full rounded-md", tone(m.alt, minAlt), i === 0 && "ring-2 ring-foreground/60 ring-offset-1 ring-offset-background")} style={{ height: Math.max(3, h * H) }} />
                ) : (
                  <div className={cn("mb-1 h-0.5 w-2/3 rounded bg-muted-foreground/30", i === 0 && "bg-foreground/60")} />
                )}
              </div>
              <span className={cn("text-[11px] leading-none sm:text-[10px]", i === 0 ? "font-semibold text-foreground" : "text-muted-foreground")}>{MONTHS[m.month].slice(0, 3)}</span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm">
          {best ? (
            <>
              Best months: <span className="font-medium">{best}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Never gets above {minAlt}° around midnight from here.</span>
          )}
        </p>
        <span className="flex items-center gap-2 text-2xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-q-excellent" /> {bands.excellent}°+
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-q-good" /> {bands.good}°+
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-q-fair" /> {minAlt}°+
          </span>
        </span>
      </div>
    </div>
  );
}
