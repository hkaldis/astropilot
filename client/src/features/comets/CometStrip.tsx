/** Comets within reach tonight: positions from JPL Horizons (via /api/comets), evaluated for the site and instrument. */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  cometAt,
  constellationOf,
  detectability,
  formatDate,
  formatMag,
  formatTime,
  objectTrack,
  type CometInfo,
  type Difficulty,
  type NightFrames,
  type NightInfo,
} from "@shared/astro";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/common/Page";
import { DIFFICULTY_TONE } from "@/lib/objects";
import { cn } from "@/lib/utils";
import { stagger } from "@/lib/motion";
import { useActiveScope } from "@/hooks/useScope";
import { constellationName } from "@/features/explore/constellations";

/** What the strip needs to know about the night (Explore's and Tonight's contexts both fit). */
export interface CometNight {
  night: NightInfo;
  frames: NightFrames;
  sqm: number;
  minAlt: number;
  tz?: string;
  hour12?: boolean;
}

interface CometsResponse {
  updated: string;
  comets: CometInfo[];
  attribution: string;
}

export function useComets() {
  return useQuery<CometsResponse>({
    queryKey: ["/api/comets"],
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1,
  });
}

export interface CometTonight {
  comet: CometInfo;
  mag: number;
  con: string;
  bestTime: number | null;
  maxAlt: number;
  window: [number, number] | null;
  difficulty: Difficulty;
  delta: number;
  r: number;
}

/** A comet's coma is roughly a few arcminutes when it's bright, an arcminute when faint (a rough guide for visibility). */
const comaArcmin = (mag: number) => Math.min(30, Math.max(1.5, 2 * Math.pow(10, (10 - mag) / 5)));

export function cometsTonight(list: CometInfo[], ctx: CometNight, apertureMm: number): CometTonight[] {
  const out: CometTonight[] = [];
  for (const comet of list) {
    const p = cometAt(comet.ephemeris, ctx.night.solarMidnight);
    if (!p || p.mag === null) continue;
    const track = objectTrack(p.ra, p.dec, ctx.frames, ctx.minAlt);
    if (!track.window) continue;
    const det = detectability(
      { type: "globular_cluster", mag: p.mag, size: [comaArcmin(p.mag)] },
      { sqmZenith: ctx.sqm, apertureMm, alt: Math.max(track.maxAlt, 1) },
    );
    if (det.difficulty === "out of reach") continue;
    out.push({
      comet,
      mag: p.mag,
      con: constellationOf(p.ra, p.dec),
      bestTime: track.maxAltTime,
      maxAlt: track.maxAlt,
      window: track.window,
      difficulty: det.difficulty,
      delta: p.delta,
      r: p.r,
    });
  }
  return out.sort((a, b) => a.mag - b.mag);
}

function CometGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-6 w-6", className)} aria-hidden="true">
      <defs>
        <linearGradient id="comet-tail" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "hsl(var(--primary))", stopOpacity: 0 }} />
          <stop offset="1" style={{ stopColor: "hsl(var(--primary))", stopOpacity: 0.85 }} />
        </linearGradient>
      </defs>
      <path d="M2.5 4.5 L16 13.2 L13.6 15.8 Z" fill="url(#comet-tail)" />
      <path d="M5 2.8 L17.2 12.4" stroke="hsl(var(--primary))" strokeOpacity="0.35" strokeWidth="0.8" strokeLinecap="round" />
      <g opacity="0.35">
        <circle cx="16.6" cy="15.2" r="3.1" fill="hsl(var(--primary))" className="animate-breathe" />
      </g>
      <circle cx="16.6" cy="15.2" r="1.6" fill="hsl(var(--primary))" />
    </svg>
  );
}

/** Comets in reach that night as a titled section; renders nothing when there are none (most of the time). */
export function CometStrip({
  ctx,
  apertureMm,
  title = "Comets",
  variant = "section",
  className,
}: {
  ctx: CometNight;
  apertureMm?: number;
  title?: string;
  /** "section": a titled page section (Tonight); "strip": a compact eyebrow-headed strip (Explore). */
  variant?: "section" | "strip";
  className?: string;
}) {
  const q = useComets();
  const scope = useActiveScope();
  const aperture = apertureMm ?? (scope.kind === "eye" ? 7 : scope.scope.aperture);
  const showAll = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("comets") === "all";
  const rows = useMemo(() => {
    if (!q.data) return [];
    if (!showAll) return cometsTonight(q.data.comets, ctx, aperture);
    // Debug view (?comets=all): every listed comet, even out of reach.
    return q.data.comets.flatMap((comet) => {
      const p = cometAt(comet.ephemeris, ctx.night.solarMidnight);
      if (!p || p.mag === null) return [];
      const track = objectTrack(p.ra, p.dec, ctx.frames, ctx.minAlt);
      return [
        {
          comet,
          mag: p.mag,
          con: constellationOf(p.ra, p.dec),
          bestTime: track.maxAltTime,
          maxAlt: track.maxAlt,
          window: track.window,
          difficulty: "out of reach" as Difficulty,
          delta: p.delta,
          r: p.r,
        },
      ];
    });
  }, [q.data, ctx, aperture, showAll]);
  if (!rows.length) return null;
  const tf = { tz: ctx.tz, hour12: ctx.hour12 };
  const note = "Predicted brightness from NASA/JPL — comets often surprise by a magnitude or two.";
  const list = (
    <ul className="grid gap-2 sm:grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]" aria-label="Comets in reach">
      {rows.map((c, i) => (
        <li key={c.comet.id} className="flex animate-rise items-center gap-3 rounded-xl border bg-card/60 px-3 py-2.5" style={stagger(i, 60)}>
          <span className="grid h-10 w-10 shrink-0 place-items-center">
            <CometGlyph />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium" title={c.comet.name}>
              {c.comet.name}
            </div>
            <div className="text-xs text-muted-foreground">
              mag <span className="num">{formatMag(c.mag)}</span> · {constellationName(c.con)}
              {c.bestTime !== null && (
                <>
                  {" "}
                  · best <span className="num">{formatTime(c.bestTime, tf)}</span>, <span className="num">{Math.round(c.maxAlt)}°</span>
                </>
              )}
            </div>
            <div className="text-2xs text-muted-foreground">
              <span className="num">{c.delta.toFixed(2)}</span> AU from Earth · perihelion {formatDate(c.comet.perihelion, { tz: ctx.tz })} at{" "}
              <span className="num">{c.comet.q.toFixed(2)}</span> AU
            </div>
          </div>
          <Badge variant={DIFFICULTY_TONE[c.difficulty]} className="shrink-0 capitalize">
            {c.difficulty}
          </Badge>
        </li>
      ))}
    </ul>
  );
  if (variant === "strip")
    return (
      <section className={className} aria-labelledby="comets-h">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 id="comets-h" className="eyebrow">
            {title}
          </h2>
          <span className="text-2xs text-muted-foreground">{note}</span>
        </div>
        {list}
      </section>
    );
  return (
    <Section title={title} description={note} className={className}>
      {list}
    </Section>
  );
}
