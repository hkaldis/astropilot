import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ChevronRight, Sun, Telescope } from "lucide-react";
import { rankTargets, sqmForBortle, sunAltitude, formatDate, formatTime, formatMag, HOUR_MS, type NightFrames, type NightInfo, type RankedTarget, type Site } from "@shared/astro";
import type { ObservingSite } from "@shared/api";
import type { CatalogObject } from "@shared/data/types";
import { useCatalog } from "@/hooks/useCatalog";
import { useActiveScope, SCOPE_PRESETS } from "@/hooks/useScope";
import { usePrefs } from "@/hooks/usePrefs";
import { TypeGlyph } from "@/components/common/Glyphs";
import { Skel } from "@/components/common/Page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DIFFICULTY_TONE, TYPE_LABEL, objectDesignation } from "@/lib/objects";
import { cn } from "@/lib/utils";
import { stagger } from "@/lib/motion";
import { moonEvents } from "./useTonight";
import { altAt } from "@/features/explore/sky";

const CHIPS: { id: string; label: string; types?: string[] }[] = [
  { id: "all", label: "All" },
  { id: "galaxies", label: "Galaxies", types: ["galaxy", "galaxy_group"] },
  { id: "nebulae", label: "Nebulae", types: ["emission_nebula", "reflection_nebula", "cluster_nebula", "supernova_remnant", "planetary_nebula", "dark_nebula"] },
  { id: "clusters", label: "Clusters", types: ["open_cluster", "globular_cluster", "asterism", "star_cloud"] },
  { id: "doubles", label: "Double stars", types: ["double_star"] },
];

export function InstrumentPicker() {
  const s = useActiveScope();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
          <Telescope className="h-3.5 w-3.5" />
          {s.scope.name}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1.5">
        {s.telescopes.length > 0 && (
          <>
            <div className="eyebrow px-2 py-1.5">Your telescopes</div>
            {s.telescopes.map((t) => (
              <button key={t.id} onClick={() => s.setTelescope(t.id)} className={cn("w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent", s.telescopeId === t.id && "bg-accent")}>
                {t.name} <span className="num text-xs text-muted-foreground">{t.aperture} mm</span>
              </button>
            ))}
            <div className="my-1 h-px bg-border" />
          </>
        )}
        <div className="eyebrow px-2 py-1.5">{s.telescopes.length ? "Or a typical instrument" : "What do you observe with?"}</div>
        {SCOPE_PRESETS.map((p) => (
          <button key={p.id} onClick={() => s.setPreset(p.id)} className={cn("w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent", s.presetId === p.id && "bg-accent")}>
            {p.name}
          </button>
        ))}
        <div className="px-2 pb-1 pt-2 text-2xs text-muted-foreground">
          <Link href="/gear" className="link">Add your own gear</Link> for exact eyepiece advice.
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Sparkline({ r, frames, minAlt }: { r: RankedTarget; frames: NightFrames; minAlt: number }) {
  const w = 84;
  const h = 26;
  const pts = r.track.points;
  if (!pts.length) return null;
  const t0 = pts[0].t;
  const t1 = pts[pts.length - 1].t;
  const X = (t: number) => ((t - t0) / (t1 - t0)) * w;
  const Y = (a: number) => h - (Math.max(0, a) / 90) * h;
  const d = pts.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)},${Y(p.alt).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden="true">
      {frames.darkStart && frames.darkEnd && <rect x={X(frames.darkStart)} y={0} width={Math.max(0, X(frames.darkEnd) - X(frames.darkStart))} height={h} fill="hsl(var(--primary))" opacity={0.08} rx={3} />}
      <line x1={0} x2={w} y1={Y(minAlt)} y2={Y(minAlt)} stroke="hsl(var(--border))" strokeDasharray="2 3" />
      <path d={d} fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} pathLength={1} strokeDasharray={1} className="animate-draw" style={{ animationDelay: "0.25s" }} />
    </svg>
  );
}

/** "the naked eye", "10×50 binoculars", "an 8″ Dobsonian", "your Skymax 127". */
function instrumentPhrase(s: ReturnType<typeof useActiveScope>) {
  if (s.kind === "eye") return "the naked eye";
  if (s.source === "gear") return `your ${s.scope.name}`;
  if (s.kind === "binoculars") return s.scope.name;
  return `${/^(8|11|18)(\D|$)|^8\d/.test(s.scope.name) ? "an" : "a"} ${s.scope.name}`;
}

/** The first evening after `date` whose Sun gets well below −18° (≈ the engine's full darkness), up to a year ahead. */
function fullDarknessReturns(date: string, site: Site): number | null {
  const [y, m, d] = date.split("-").map(Number);
  for (let i = 1; i <= 366; i++) {
    const midnight = Date.UTC(y, m - 1, d + i + 1) - (site.lon / 15) * HOUR_MS; // local mean solar midnight
    if (sunAltitude(midnight, site) < -18.5) return Date.UTC(y, m - 1, d + i, 12);
  }
  return null;
}

/** Midnight sun and white nights: there is nothing deep-sky to rank. */
function NoDarkness({ night, frames, site, isTonight }: { night: NightInfo; frames: NightFrames; site: ObservingSite; isTonight: boolean }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const back = useMemo(() => fullDarknessReturns(night.date, site), [night.date, site.lat, site.lon]);
  const moonUp = !moonEvents(night, frames).downAllNight;
  return (
    <div className="panel flex items-start gap-3 p-5">
      <Sun className="mt-0.5 h-5 w-5 shrink-0 text-q-fair" aria-hidden="true" />
      <div className="text-sm">
        <p className="font-medium">The Sun stays too high {isTonight ? "tonight" : "that night"} for deep-sky observing.</p>
        <p className="mt-1 text-muted-foreground">
          {night.sunNeverSets
            ? `It doesn't set at all${moonUp ? ", so the Moon is the one sight" : ""}.`
            : `The sky never gets darker than twilight, so ${moonUp ? "enjoy the Moon and the bright planets instead" : "only the bright planets are worth a look"}.`}
          {back !== null && ` Full darkness returns around ${formatDate(back, { tz: "UTC" })}.`}
        </p>
      </div>
    </div>
  );
}

export function BestTargets({
  site,
  night,
  frames,
  tz,
  hour12,
  isTonight,
}: {
  site: ObservingSite;
  night: NightInfo;
  frames: NightFrames;
  tz?: string;
  hour12?: boolean;
  isTonight: boolean;
}) {
  const { objects, isLoading, error } = useCatalog();
  const scope = useActiveScope();
  const { prefs } = usePrefs();
  const [chip, setChip] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const sqm = site.sqm ?? sqmForBortle(site.bortle);
  const noDark = night.darkness === "none";
  const failed = !!error && !objects.length;

  const ranked = useMemo(() => {
    if (!objects.length || noDark) return [] as RankedTarget<CatalogObject>[];
    const types = CHIPS.find((c) => c.id === chip)?.types;
    return rankTargets(objects, frames, { sqm, apertureMm: scope.scope.aperture, minAlt: prefs.minAltitude }, { limit: 24, perTypeCap: chip === "all" ? 3 : undefined, types }).filter(
      (r) => r.score >= 25 && r.detect.difficulty !== "out of reach",
    );
  }, [objects, frames, sqm, scope.scope.aperture, prefs.minAltitude, chip, noDark]);

  if (noDark) return <NoDarkness night={night} frames={frames} site={site} isTonight={isTonight} />;

  const shown = expanded ? ranked : ranked.slice(0, 8);
  const fmt = (t: number | null) => formatTime(t, { tz, hour12 });
  // The best moment can differ from the highest one on twilight-limited nights.
  // (Best and peak times can fall between samples, so take the nearest one.)
  const altAtBest = (r: RankedTarget) => altAt(r.track, r.bestTime);
  const which = isTonight ? "tonight" : "that night";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {CHIPS.map((c) => (
            <button
              key={c.id}
              onClick={() => setChip(c.id)}
              aria-pressed={chip === c.id}
              className={cn("rounded-full border px-3 py-1 text-xs transition-colors", chip === c.id ? "border-primary/50 bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-accent")}
            >
              {c.label}
            </button>
          ))}
        </div>
        <InstrumentPicker />
      </div>
      {/* Re-keyed per category and night, so the list deals itself in again. */}
      <div key={`${chip}-${night.date}`} className="panel divide-y overflow-hidden">
        {isLoading &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <Skel className="h-9 w-9 rounded-full" />
              <div className="flex-1">
                <Skel className="h-4 w-40" />
                <Skel className="mt-1.5 h-3 w-56" />
              </div>
            </div>
          ))}
        {failed && <p className="p-5 text-sm text-muted-foreground">Couldn't load the catalog. Reload the page to try again.</p>}
        {!isLoading && !failed && shown.length === 0 && <p className="p-5 text-sm text-muted-foreground">Nothing in this category is well placed {which} from here. Try another category or night.</p>}
        {shown.map((r, i) => (
          <Link
            key={r.object.id}
            href={`/object/${r.object.id}`}
            className="group flex animate-rise items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/50 sm:px-4"
            style={stagger(i, 35, 8)}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-primary">
              <TypeGlyph type={r.object.type} className="h-[1.15rem] w-[1.15rem]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate font-medium">{r.object.name}</span>
                {r.object.name !== objectDesignation(r.object) && <span className="num shrink-0 text-xs text-muted-foreground">{objectDesignation(r.object)}</span>}
              </div>
              {/* The best time and altitude never truncate; phones drop the type label (the icon shows it). */}
              <div className="flex min-w-0 items-baseline gap-1 text-xs text-muted-foreground">
                <span className="hidden min-w-0 truncate sm:block">
                  {TYPE_LABEL[r.object.type]} · mag {formatMag(r.object.mag)} ·
                </span>
                <span className="shrink-0">
                  best {fmt(r.bestTime)} at {Math.round(altAtBest(r))}°
                </span>
                <span className="min-w-0 truncate sm:hidden">· mag {formatMag(r.object.mag)}</span>
              </div>
            </div>
            <div className="hidden sm:block">
              <Sparkline r={r} frames={frames} minAlt={prefs.minAltitude} />
            </div>
            <Badge variant={DIFFICULTY_TONE[r.detect.difficulty]} className="shrink-0 capitalize">
              {r.detect.difficulty}
            </Badge>
            <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground sm:block" />
          </Link>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          Ranked for {instrumentPhrase(scope)} under {site.bortleSource === "atlas" ? `an estimated Bortle ${site.bortle} sky (≈${sqm.toFixed(1)} mag/arcsec² from the light-pollution atlas)` : `a Bortle ${site.bortle} sky (${sqm.toFixed(1)} mag/arcsec²)`}, with{" "}
          {isTonight ? "tonight's" : "that night's"} moonlight.
        </span>
        {ranked.length > 8 && (
          <Button variant="ghost" size="sm" onClick={() => setExpanded((e) => !e)}>
            {expanded ? "Show fewer" : `Show ${ranked.length - 8} more`}
          </Button>
        )}
      </div>
    </div>
  );
}
