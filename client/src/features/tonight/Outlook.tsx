import type { NightForecast } from "@shared/forecast";
import { formatNightDate, formatDuration } from "@shared/astro";
import { MoonGlyph } from "@/components/common/Glyphs";
import { QUALITY_BG, QUALITY_TEXT, qualityOf } from "@/lib/objects";
import { cn } from "@/lib/utils";

export function Outlook({ nights, selected, onSelect }: { nights: NightForecast[]; selected: number; onSelect: (i: number) => void }) {
  const best = nights.reduce((b, n, i) => (n.hasData && n.score > (nights[b]?.score ?? -1) ? i : b), 0);
  return (
    <div className="grid grid-cols-7 gap-1.5 sm:gap-2" role="tablist" aria-label="Choose a night">
      {nights.slice(0, 7).map((n, i) => {
        const q = qualityOf(n.hasData ? n.score : null);
        const label = i === 0 ? "Tonight" : formatNightDate(n.date, "weekday");
        return (
          <button
            key={n.date}
            role="tab"
            aria-selected={selected === i}
            onClick={() => onSelect(i)}
            className={cn(
              "group relative flex min-w-0 flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 text-center transition-colors sm:px-2",
              selected === i ? "border-primary/60 bg-primary/[0.07]" : "hover:bg-accent",
            )}
          >
            <span className={cn("text-[0.7rem] font-medium sm:text-xs", selected === i ? "text-foreground" : "text-muted-foreground")}>{label}</span>
            <MoonGlyph elongation={n.moon.elongation} size={18} />
            {n.hasData ? (
              <span className={cn("num text-base font-semibold leading-none sm:text-lg", QUALITY_TEXT[q.key])}>{Math.round(n.score)}</span>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
            <span className={cn("h-1 w-8 rounded-full", n.hasData ? QUALITY_BG[q.key] : "bg-muted")} />
            <span className="hidden text-2xs text-muted-foreground sm:block">{n.hasData ? `${formatDuration(n.clearDarkHours).replace(" m", "m")} clear` : "no data"}</span>
            {i === best && n.hasData && n.score >= 42 && i !== 0 && (
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-gold px-1.5 text-[0.6rem] font-semibold uppercase tracking-wide text-background">Best</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
