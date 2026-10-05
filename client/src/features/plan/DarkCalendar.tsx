/**
 * Six weeks of nights at a glance: hours of darkness with the Moon down, the Moon's phase, and the
 * sky events worth planning around. Pure astronomy (no weather), so it reaches well past the forecast.
 */
import { useMemo } from "react";
import { addDays, formatDuration, nightDateOf, nightOf, upcomingEvents, type SkyEvent } from "@shared/astro";
import { MoonGlyph } from "@/components/common/Glyphs";
import { cn } from "@/lib/utils";

interface CalNight {
  i: number;
  date: string;
  moonFree: number;
  dark: number;
  astro: boolean; // reaches astronomical darkness
  elongation: number;
  illumination: number;
  events: SkyEvent[];
}

const DOW = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
};

/** First day of the week for the viewer's locale (0 = Sunday, 1 = Monday), Monday if unknown. */
function firstDayOfWeek(): number {
  try {
    const loc = new Intl.Locale(navigator.language) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    const info = loc.getWeekInfo?.() ?? loc.weekInfo;
    if (info?.firstDay) return info.firstDay % 7;
  } catch {
    /* older browsers */
  }
  return 1;
}

const weekdayName = (dow: number) => new Intl.DateTimeFormat(undefined, { weekday: "narrow", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + dow)));
const monthShort = (date: string) => new Intl.DateTimeFormat(undefined, { month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

export function DarkCalendar({
  site,
  tonight,
  selected,
  onSelect,
  days = 42,
  southern = false,
}: {
  site: { lat: number; lon: number; elevation?: number | null; timezone?: string | null };
  tonight: string;
  selected: number;
  onSelect: (offset: number) => void;
  days?: number;
  southern?: boolean;
}) {
  const nights = useMemo<CalNight[]>(() => {
    const s = { lat: site.lat, lon: site.lon, elevation: site.elevation ?? 0, timezone: site.timezone };
    const start = nightOf(tonight, s).noon;
    const evs = upcomingEvents(start, days + 1, s).filter((e) => e.kind === "meteor" || e.kind === "eclipse" || e.kind === "opposition" || e.importance >= 3);
    const byNight = new Map<string, SkyEvent[]>();
    for (const e of evs) {
      const key = nightDateOf(e.time, s);
      byNight.set(key, [...(byNight.get(key) ?? []), e]);
    }
    return Array.from({ length: days }, (_, i) => {
      const date = addDays(tonight, i);
      const n = nightOf(date, s);
      return {
        i,
        date,
        moonFree: n.darkness === "astronomical" ? n.moonFreeHours : 0,
        dark: n.darkness === "astronomical" ? n.darkHours : 0,
        astro: n.darkness === "astronomical",
        elongation: n.moon.elongation,
        illumination: n.moon.illumination,
        events: byNight.get(date) ?? [],
      };
    });
  }, [site.lat, site.lon, site.elevation, site.timezone, tonight, days]);

  const maxDark = Math.max(1, ...nights.map((n) => n.dark));
  // "Prime" nights: most of the possible darkness is moon-free.
  const prime = (n: CalNight) => n.astro && n.moonFree >= Math.max(2, 0.75 * maxDark);
  const firstPrime = nights.findIndex(prime);
  let primeEnd = firstPrime;
  while (primeEnd >= 0 && primeEnd + 1 < nights.length && prime(nights[primeEnd + 1])) primeEnd++;

  const fdow = firstDayOfWeek();
  const lead = (DOW(tonight) - fdow + 7) % 7;
  const cells: (CalNight | null)[] = [...Array(lead).fill(null), ...nights];
  while (cells.length % 7) cells.push(null);
  const noAstro = nights.every((n) => !n.astro);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {noAstro ? (
          "The Sun doesn't get 18° below the horizon here in the coming weeks, so there's no full astronomical darkness — bright targets only."
        ) : firstPrime < 0 ? (
          "Bars show the hours of full darkness with the Moon down."
        ) : (
          <>
            {firstPrime === 0 ? "Dark, moonless nights now" : "Next run of dark, moonless nights"}:{" "}
            <span className="font-medium text-foreground">
              {nightLabel(nights[firstPrime].date)}
              {primeEnd > firstPrime ? ` – ${nightLabel(nights[primeEnd].date)}` : ""}
            </span>
            . Bars show the hours of full darkness with the Moon down.
          </>
        )}
      </p>
      <div className="grid grid-cols-7 gap-1 text-center" aria-hidden="true">
        {Array.from({ length: 7 }, (_, k) => (
          <span key={k} className="text-2xs uppercase tracking-[0.12em] text-muted-foreground">
            {weekdayName((fdow + k) % 7)}
          </span>
        ))}
      </div>
      {/* The weeks sweep in as a diagonal wave; each night's moon-free bar then fills. */}
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Dark-sky calendar">
        {cells.map((n, k) =>
          n ? (
            <button
              key={n.date}
              style={{ animationDelay: `${Math.floor(k / 7) * 45 + (k % 7) * 15}ms` }}
              onClick={() => onSelect(n.i)}
              aria-pressed={selected === n.i}
              aria-label={`${nightLabel(n.date)}: ${n.astro ? `${formatDuration(n.moonFree)} of moon-free darkness` : "no full darkness"}, Moon ${Math.round(n.illumination * 100)}% lit${n.events.length ? `, ${n.events.map((e) => e.title).join(", ")}` : ""}`}
              title={n.events.map((e) => e.title).join(" · ") || undefined}
              className={cn(
                "relative flex min-w-0 animate-rise flex-col items-center gap-1 rounded-lg border px-0.5 pb-1.5 pt-1.5 transition-colors",
                selected === n.i ? "border-primary/70 bg-primary/10" : prime(n) ? "border-q-excellent/35 bg-q-excellent/[0.06] hover:bg-q-excellent/10" : "border-border/70 hover:bg-accent",
              )}
            >
              <span className="flex items-center gap-1 text-[0.7rem] leading-none">
                {(n.i === 0 || n.date.endsWith("-01")) && <span className="text-muted-foreground">{monthShort(n.date)}</span>}
                <span className={cn("num", n.i === 0 ? "font-semibold text-primary" : "text-foreground")}>{Number(n.date.slice(8))}</span>
              </span>
              <MoonGlyph elongation={n.elongation} size={14} southern={southern} />
              <span className="num text-[0.62rem] leading-none text-muted-foreground">{n.astro ? `${n.moonFree.toFixed(n.moonFree >= 10 ? 0 : 1)}h` : "—"}</span>
              <span className="mt-0.5 h-1 w-[78%] overflow-hidden rounded-full bg-muted">
                <span
                  className={cn("block h-full origin-left animate-grow-x rounded-full", prime(n) ? "bg-q-excellent" : "bg-primary/70")}
                  style={{ width: `${(n.moonFree / maxDark) * 100}%`, animationDelay: `${200 + Math.floor(k / 7) * 45 + (k % 7) * 15}ms` }}
                />
              </span>
              {n.events.length > 0 && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-gold" />}
            </button>
          ) : (
            <span key={`pad-${k}`} />
          ),
        )}
      </div>
      <EventList nights={nights} onSelect={onSelect} />
    </div>
  );
}

function nightLabel(date: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function EventList({ nights, onSelect }: { nights: CalNight[]; onSelect: (i: number) => void }) {
  const items = nights.flatMap((n) => n.events.map((e) => ({ n, e })));
  if (!items.length) return null;
  return (
    <ul className="flex flex-col gap-1 text-xs">
      {items.slice(0, 6).map(({ n, e }) => (
        <li key={e.id}>
          <button onClick={() => onSelect(n.i)} className="flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left hover:bg-accent">
            <span className="h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full bg-gold" aria-hidden="true" />
            <span className="num w-24 shrink-0 text-muted-foreground">{nightLabel(n.date)}</span>
            <span className="min-w-0 flex-1">
              <span className="font-medium">{e.title}</span>
              <span className="text-muted-foreground"> — {e.detail}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
