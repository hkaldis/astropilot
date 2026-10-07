import { Link } from "wouter";
import { PLANET_BY_ID, formatMag, formatTime, type MoonMeta } from "@shared/astro";
import { MoonGlyph, TypeGlyph } from "@/components/common/Glyphs";
import { Badge } from "@/components/ui/badge";
import { DIFFICULTY_TONE } from "@/lib/objects";
import { cn } from "@/lib/utils";
import type { BodyTonight, MoonTonight, NightContext } from "./sky";

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
              className="flex w-[17.5rem] items-center gap-3 rounded-xl border bg-card/60 px-3 py-2.5 transition-colors hover:bg-accent/60 sm:w-auto"
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

/** Why a moon can't be seen tonight when its planet can't be, else how hard it is (as the deep-sky rows say it). */
function MoonBadge({ t }: { t: MoonTonight }) {
  const tr = t.planet.track;
  const off = tr.noDarkness ? "Sky too bright" : tr.maxAlt < 0 ? "Not up" : !tr.window ? "Too low" : null;
  if (off) return <Badge variant="outline">{off}</Badge>;
  const d = t.detect.difficulty;
  return (
    <Badge variant={DIFFICULTY_TONE[d] ?? "outline"} title={t.detect.note}>
      {d.charAt(0).toUpperCase() + d.slice(1)}
    </Badge>
  );
}

/** The planets' moons as chips: name, planet and tonight's difficulty (without a site, the catalog brightness). */
export function MoonChips({ moons, className }: { moons: { meta: MoonMeta; tonight: MoonTonight | null }[]; className?: string }) {
  if (!moons.length) return null;
  return (
    <ul
      className={cn("scrollbar-none -mx-4 flex snap-x gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0", className)}
      aria-label="The planets' moons"
    >
      {moons.map(({ meta, tonight }, i) => (
        <li key={meta.id} className="shrink-0 snap-start animate-fade" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
          <Link href={`/object/${meta.id}`} className="flex items-center gap-1.5 whitespace-nowrap rounded-xl border py-1.5 pl-2.5 pr-2 text-sm transition-colors hover:bg-accent/60">
            <TypeGlyph type="satellite" className="h-4 w-4 text-gold" />
            <span className="font-medium">{meta.name}</span>
            <span className="mr-0.5 text-xs text-muted-foreground">
              {PLANET_BY_ID[meta.parent].name}
              {!tonight && (
                <>
                  {" "}
                  · mag <span className="num">{formatMag(meta.mag)}</span>
                </>
              )}
            </span>
            {tonight && <MoonBadge t={tonight} />}
          </Link>
        </li>
      ))}
    </ul>
  );
}
