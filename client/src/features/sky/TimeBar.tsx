import { useMemo } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { ChevronLeft, ChevronRight, Radio } from "lucide-react";
import { HOUR_MS, formatDate, formatTime, moonPosition, type NightInfo, type Site } from "@shared/astro";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  time: number;
  live: boolean;
  night: NightInfo;
  site: Site;
  tz?: string;
  hour12: boolean;
  onChange: (t: number) => void;
  onLive: () => void;
}

const STEP_MIN = 5;

/** The usable span of the night on the slider: sunset → sunrise (with fallbacks for polar day/night). */
export function nightSpan(night: NightInfo): [number, number] {
  const start = night.sunset ?? night.civilDusk ?? night.noon + 6 * HOUR_MS;
  const end = night.sunrise ?? night.civilDawn ?? night.nextNoon - 6 * HOUR_MS;
  return end > start ? [start, end] : [night.noon + 6 * HOUR_MS, night.nextNoon - 6 * HOUR_MS];
}

export function TimeBar({ time, live, night, site, tz, hour12, onChange, onLive }: Props) {
  const [start, end] = nightSpan(night);
  const total = Math.max(STEP_MIN, Math.round((end - start) / 60_000));
  const value = Math.min(total, Math.max(0, Math.round((time - start) / 60_000)));
  const fmt = (ms: number | null) => formatTime(ms, { tz, hour12 });
  const pct = (ms: number | null) => (ms === null ? null : Math.min(100, Math.max(0, ((ms - start) / (end - start)) * 100)));

  // Twilight gradient behind the track: civil → nautical → astronomical → night → … → civil.
  const gradient = useMemo(() => {
    const stops: [string, number | null][] = [
      ["--sky-civil", 0],
      ["--sky-nautical", pct(night.civilDusk)],
      ["--sky-astro", pct(night.nauticalDusk)],
      ["--sky-night", pct(night.astroDusk)],
      ["--sky-night", pct(night.astroDawn)],
      ["--sky-astro", pct(night.nauticalDawn)],
      ["--sky-nautical", pct(night.civilDawn)],
      ["--sky-civil", 100],
    ];
    const parts = stops.filter(([, p]) => p !== null).map(([v, p]) => `hsl(var(${v})) ${p!.toFixed(2)}%`);
    return `linear-gradient(to right, ${parts.join(", ")})`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [night, start, end]);

  // When the Moon is up during the night (sampled every 10 minutes).
  const moonUp = useMemo(() => {
    const segs: [number, number][] = [];
    let open: number | null = null;
    const step = 10 * 60_000;
    for (let t = start; t <= end + 1; t += step) {
      const tt = Math.min(t, end);
      const up = moonPosition(tt, site).alt > 0;
      if (up && open === null) open = tt;
      if (!up && open !== null) {
        segs.push([open, tt]);
        open = null;
      }
      if (tt === end) break;
    }
    if (open !== null) segs.push([open, end]);
    return segs;
  }, [start, end, site]);

  const outside = time < start - 60_000 || time > end + 60_000;
  const dark = night.darkStart && night.darkEnd;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {live ? (
          <span className="inline-flex h-10 items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 text-xs font-medium text-primary">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Live
          </span>
        ) : (
          <Button variant="subtle" onClick={onLive} className="h-10 px-3 text-xs">
            <Radio /> Now
          </Button>
        )}
        <Button variant="outline" size="icon" onClick={() => onChange(time - HOUR_MS)} aria-label="One hour earlier">
          <ChevronLeft />
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <div className="num text-2xl font-medium leading-none">{fmt(time)}</div>
          <div className="mt-1 text-2xs text-muted-foreground">
            {formatDate(time, { tz, style: "weekday" })} {formatDate(time, { tz })}
            {outside && " · outside tonight"}
          </div>
        </div>
        <Button variant="outline" size="icon" onClick={() => onChange(time + HOUR_MS)} aria-label="One hour later">
          <ChevronRight />
        </Button>
      </div>

      <div className="px-1">
        <SliderPrimitive.Root
          className="relative flex h-10 w-full touch-none select-none items-center"
          min={0}
          max={total}
          step={STEP_MIN}
          value={[value]}
          onValueChange={([v]) => onChange(start + v * 60_000)}
          aria-label="Time tonight"
        >
          <SliderPrimitive.Track className="relative h-3 w-full grow overflow-hidden rounded-full border" style={{ background: gradient }}>
            {moonUp.map(([a, b], i) => (
              <span
                key={i}
                className="absolute bottom-0 h-[3px] bg-gold/90"
                style={{ left: `${pct(a)}%`, width: `${Math.max(0.5, pct(b)! - pct(a)!)}%` }}
                aria-hidden="true"
              />
            ))}
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            className={cn(
              "block h-6 w-6 rounded-full border-2 border-primary bg-background shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              outside && "opacity-50",
            )}
            aria-label="Chart time"
            aria-valuetext={fmt(time)}
          />
        </SliderPrimitive.Root>
        <div className="mt-1.5 grid grid-cols-3 gap-2 text-2xs text-muted-foreground">
          <span>
            Sunset <span className="num text-foreground/80">{fmt(night.sunset)}</span>
          </span>
          <span className="text-center">
            {dark ? (
              <>
                {night.darkness === "astronomical" ? "Dark" : night.darkness === "nautical" ? "Darkest" : "Twilight"}{" "}
                <span className="num text-foreground/80">
                  {fmt(night.darkStart)}–{fmt(night.darkEnd)}
                </span>
              </>
            ) : (
              "No true darkness"
            )}
          </span>
          <span className="text-right">
            Sunrise <span className="num text-foreground/80">{fmt(night.sunrise)}</span>
          </span>
        </div>
        {moonUp.length > 0 && (
          <div className="mt-1 flex items-center gap-1.5 text-2xs text-muted-foreground">
            <span className="inline-block h-[3px] w-4 rounded-full bg-gold/90" aria-hidden="true" /> Moon above the horizon
          </div>
        )}
      </div>
    </div>
  );
}
