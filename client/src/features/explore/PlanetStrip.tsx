import { Link } from "wouter";
import { formatMag, formatTime } from "@shared/astro";
import { MoonGlyph, TypeGlyph } from "@/components/common/Glyphs";
import { cn } from "@/lib/utils";
import type { BodyTonight, NightContext } from "./sky";

function bodyLine(b: BodyTonight) {
  const parts =
    b.id === "moon"
      ? [`${Math.round(b.state.illumination * 100)}% lit`]
      : [`mag ${formatMag(b.state.mag)}`, `${b.state.diameter.toFixed(b.state.diameter < 10 ? 1 : 0)}″`];
  if (b.id === "mercury" || b.id === "venus") parts.push(`${Math.round(b.state.illumination * 100)}% lit`);
  if (b.track.window) parts.push(`peaks ${Math.round(b.track.maxAlt)}°`);
  return parts.join(" · ");
}

function WhenLine({ b, ctx }: { b: BodyTonight; ctx: NightContext }) {
  const tf = { tz: ctx.tz, hour12: ctx.hour12 };
  const t = b.track;
  if (!t.window) {
    return <span className="text-muted-foreground">{t.maxAlt > 0 ? <>Low: peaks at <span className="num">{Math.round(t.maxAlt)}°</span></> : "Not up after dark"}</span>;
  }
  // Rising late or setting early is the most useful single fact.
  const startsLate = t.window[0] > (ctx.night.civilDusk ?? 0) + 45 * 60_000;
  const endsEarly = ctx.night.civilDawn !== null && t.window[1] < ctx.night.civilDawn - 45 * 60_000;
  return (
    <span>
      {startsLate && !endsEarly ? (
        <>
          from <span className="num">{formatTime(t.window[0], tf)}</span> ·{" "}
        </>
      ) : endsEarly && !startsLate ? (
        <>
          until <span className="num">{formatTime(t.window[1], tf)}</span> ·{" "}
        </>
      ) : null}
      best <span className="num">{formatTime(b.peakTime, tf)}</span>
    </span>
  );
}

export function PlanetStrip({ bodies, ctx, className }: { bodies: BodyTonight[]; ctx: NightContext; className?: string }) {
  if (!bodies.length) return null;
  return (
    <ul
      className={cn(
        "scrollbar-none -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] sm:overflow-visible sm:px-0",
        className,
      )}
      aria-label="Planets and Moon tonight"
    >
      {bodies.map((b) => {
        return (
          <li key={b.id} className="snap-start">
            <Link
              href={`/object/${b.id}`}
              className="flex w-[16rem] items-center gap-3 rounded-xl border bg-card/60 px-3 py-2.5 transition-colors hover:bg-accent/60 sm:w-auto"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center">
                {b.id === "moon" ? (
                  <MoonGlyph elongation={ctx.night.moon.elongation} size={34} southern={ctx.site.lat < 0} />
                ) : (
                  <TypeGlyph type="planet" id={b.id} className="h-7 w-7" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{b.meta.name}</span>
                <span className="num block truncate text-2xs text-muted-foreground">{bodyLine(b)}</span>
                <span className="block truncate text-xs text-foreground/90">
                  <WhenLine b={b} ctx={ctx} />
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
