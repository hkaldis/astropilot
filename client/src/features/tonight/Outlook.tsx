import type { NightForecast } from "@shared/forecast";
import { formatNightDate } from "@shared/astro";
import { MoonGlyph } from "@/components/common/Glyphs";
import { QUALITY_BG, QUALITY_TEXT, qualityOf } from "@/lib/objects";
import { cn } from "@/lib/utils";

/** "0 h", "36 m", "3 h", "3 h 36 m" — short enough for a seventh of the row. */
function shortDuration(hours: number) {
  const total = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : h === 0 ? `${m} m` : `${h} h ${m} m`;
}

/**
 * The week of nights, keyed by date: `tonight` is the current night (it lasts until sunrise), so the strip
 * agrees with the rest of the page even when the forecast was computed before sunrise.
 */
export function Outlook({
  nights,
  tonight,
  selected,
  onSelect,
  southern = false,
}: {
  nights: NightForecast[];
  tonight: string;
  selected: string;
  onSelect: (date: string) => void;
  southern?: boolean;
}) {
  const week = nights.filter((n) => n.date >= tonight).slice(0, 7);
  const best = week.reduce((b, n, i) => (n.hasData && n.score > (week[b]?.score ?? -1) ? i : b), 0);
  return (
    <div className="grid grid-cols-7 gap-1.5 sm:gap-2" role="tablist" aria-label="Choose a night">
      {week.map((n, i) => {
        const q = qualityOf(n.hasData ? n.score : null);
        const isTonight = n.date === tonight;
        const label = isTonight ? "Tonight" : formatNightDate(n.date, "weekday");
        const unsure = n.hasData && n.confidence === "low";
        return (
          <button
            key={n.date}
            role="tab"
            aria-selected={selected === n.date}
            onClick={() => onSelect(n.date)}
            className={cn(
              "group relative flex min-w-0 flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 text-center transition-colors sm:px-2",
              selected === n.date ? "border-primary/60 bg-primary/[0.07]" : "hover:bg-accent",
            )}
          >
            <span className={cn("text-[0.7rem] font-medium sm:text-xs", selected === n.date ? "text-foreground" : "text-muted-foreground")}>{label}</span>
            <MoonGlyph elongation={n.moon.elongation} size={18} southern={southern} />
            {n.hasData ? (
              <span className={cn("num relative text-base font-semibold leading-none sm:text-lg", QUALITY_TEXT[q.key])}>
                {Math.round(n.score)}
                {unsure && (
                  <>
                    <span
                      className="absolute -right-2 -top-1 font-sans text-[0.65rem] font-medium text-muted-foreground"
                      title={n.confidenceReason ?? "The weather models disagree about this night"}
                      aria-hidden="true"
                    >
                      ?
                    </span>
                    <span className="sr-only"> (uncertain: the weather models disagree)</span>
                  </>
                )}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
            <span className={cn("h-1 w-8 rounded-full", n.hasData ? QUALITY_BG[q.key] : "bg-muted")} />
            <span className="hidden text-2xs text-muted-foreground sm:block">{n.hasData ? `${shortDuration(n.clearDarkHours)} clear` : "no data"}</span>
            {i === best && n.hasData && n.score >= 42 && !isTonight && (
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-gold px-1.5 text-[0.6rem] font-semibold uppercase tracking-wide text-background">Best</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
