import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "wouter";
import { Check, Search, SlidersHorizontal, X, Sparkles } from "lucide-react";
import { MOONS, PLANET_BY_ID, SOLAR_SYSTEM, altAzOf, eqjVector, evaluateTarget, formatMag, formatNightDate, horizonFrame, sunAltitude } from "@shared/astro";
import type { CatalogObject } from "@shared/data/types";
import { useCatalog } from "@/hooks/useCatalog";
import { useActiveScope } from "@/hooks/useScope";
import { useSite } from "@/hooks/useSite";
import { EmptyState, PageHeader, Skel, usePageTitle } from "@/components/common/Page";
import { TypeGlyph } from "@/components/common/Glyphs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TYPE_GROUPS } from "@/lib/objects";
import { cn } from "@/lib/utils";
import { InstrumentBar, instrumentPhrase } from "./InstrumentBar";
import { NoSite } from "./NoSite";
import { PlanetStrip } from "./PlanetStrip";
import { CometStrip } from "@/features/comets/CometStrip";
import { ResultRow, type ExploreItem, type RowContext } from "./ResultRow";
import { constellationName } from "./constellations";
import {
  DEFAULT_FILTERS,
  DIFFICULTY_FILTERS,
  DIFFICULTY_LEVELS,
  SORTS,
  activeFilterCount,
  catalogOrder,
  filtersFromParams,
  matchRank,
  norm,
  paramsFromFilters,
  type ExploreFilters,
  type SortKey,
} from "./search";
import { evaluateBody, useNightContext } from "./sky";

const PAGE = 60;

function Chip({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[0.8rem] transition-colors",
        active ? "border-primary/40 bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      {active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
      {children}
    </button>
  );
}

function RowSkeleton() {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Skel className="h-9 w-9 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skel className="h-3.5 w-1/3" />
        <Skel className="h-3 w-1/2" />
      </div>
      <Skel className="hidden h-7 w-28 md:block" />
      <Skel className="h-5 w-16 rounded-full" />
    </li>
  );
}

export function ExploreView() {
  usePageTitle("Explore");
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const scope = useActiveScope();
  const { ctx } = useNightContext(10);
  useEffect(() => {
    try {
      sessionStorage.setItem("ap.exploreSearch", params.toString());
    } catch {
      /* storage unavailable */
    }
  }, [params]);
  const { site } = useSite();
  const { objects, isLoading, error } = useCatalog();

  // ---------------------------------------------------------------- filters ⇄ URL
  const update = useCallback(
    (patch: Partial<ExploreFilters>) => setParams((prev) => paramsFromFilters({ ...filtersFromParams(prev), ...patch }), { replace: true }),
    [setParams],
  );
  const [qInput, setQInput] = useState(filters.q);
  const lastQ = useRef(filters.q);
  useEffect(() => {
    if (filters.q !== lastQ.current) {
      lastQ.current = filters.q;
      setQInput(filters.q);
    }
  }, [filters.q]);
  useEffect(() => {
    if (qInput === lastQ.current) return;
    const t = setTimeout(() => {
      lastQ.current = qInput;
      update({ q: qInput });
    }, 250);
    return () => clearTimeout(t);
  }, [qInput, update]);
  const q = norm(useDeferredValue(qInput));

  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)))) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---------------------------------------------------------------- evaluation (once per night/scope/sky)
  const aperture = scope.scope.aperture;
  const frames = ctx?.frames;
  const sqm = ctx?.sqm;
  const minAlt = ctx?.minAlt ?? 20;
  const evaluated: ExploreItem[] = useMemo(() => {
    if (!frames || sqm === undefined) return objects.map((o) => ({ o, r: null, visible: true }));
    const sky = { sqm, apertureMm: aperture, minAlt };
    const hasDark = frames.darkStart !== null && frames.darkEnd !== null;
    return objects.map((o) => {
      const r = evaluateTarget(o, frames, sky);
      const up = hasDark ? r.track.window !== null : r.track.maxAlt >= minAlt;
      return { o, r, visible: up && r.detect.difficulty !== "out of reach" };
    });
  }, [objects, frames, sqm, aperture, minAlt]);

  const bodies = useMemo(() => (ctx ? SOLAR_SYSTEM.map((p) => evaluateBody(p.id, ctx, aperture)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frames, sqm, minAlt, aperture, ctx?.site.key]);

  // Current altitudes, only when sorting by them.
  const minute = ctx ? Math.floor(ctx.now / 60_000) : 0;
  const altNow = useMemo(() => {
    if (filters.sort !== "high" || !ctx) return null;
    const f = horizonFrame(minute * 60_000, ctx.site);
    const m = new Map<string, number>();
    for (const o of objects) m.set(o.id, altAzOf(f, eqjVector(o.ra, o.dec)).alt);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.sort, objects, minute, ctx?.site.key]);

  const sunUp = useMemo(() => (ctx ? sunAltitude(minute * 60_000, ctx.site) > -6 : false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [minute, ctx?.site.key]);

  // ---------------------------------------------------------------- filtering & sorting
  const { shown, hiddenByVisibility, totalVisible } = useMemo(() => {
    const types = new Set(filters.groups.flatMap((g) => TYPE_GROUPS.find((x) => x.id === g)?.types ?? []));
    const maxD = DIFFICULTY_FILTERS.find((d) => d.id === filters.diff)?.max ?? null;
    const maxIdx = maxD ? DIFFICULTY_LEVELS.indexOf(maxD) : null;
    const base = evaluated.filter(({ o, r }) => {
      if (filters.showpiece && !o.showpiece) return false;
      if ((filters.messier || filters.caldwell) && !((filters.messier && o.m) || (filters.caldwell && o.c))) return false;
      if (types.size && !types.has(o.type)) return false;
      if (filters.con && o.con !== filters.con) return false;
      if (maxIdx !== null && r && DIFFICULTY_LEVELS.indexOf(r.detect.difficulty) > maxIdx) return false;
      return true;
    });
    const ranked: { it: ExploreItem; rank: number }[] = [];
    for (const it of base) {
      const rank = matchRank(it.o, q);
      if (rank !== null) ranked.push({ it, rank });
    }
    const applyVis = filters.visible && !!ctx;
    const shown = applyVis ? ranked.filter((x) => x.it.visible) : ranked;
    const hiddenByVisibility = applyVis ? ranked.length - shown.length : 0;
    const totalVisible = evaluated.reduce((n, x) => n + (x.visible && x.r ? 1 : 0), 0);

    const cmp = comparator(filters.sort, altNow);
    shown.sort((a, b) => (q ? a.rank - b.rank : 0) || cmp(a.it, b.it));
    return { shown: shown.map((x) => x.it), hiddenByVisibility, totalVisible };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluated, filters, q, altNow, !!ctx]);

  const [limit, setLimit] = useState(PAGE);
  const filterKey = `${q}|${paramsFromFilters({ ...filters, q: "" }).toString()}`;
  useEffect(() => setLimit(PAGE), [filterKey]);

  const rc: RowContext = useMemo(
    () => ({
      tz: ctx?.tz,
      hour12: ctx?.hour12 ?? false,
      darkStart: ctx?.frames.darkStart ?? null,
      darkEnd: ctx?.frames.darkEnd ?? null,
      minAlt,
      now: minute * 60_000,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx?.tz, ctx?.hour12, ctx?.frames, minAlt, minute],
  );

  // Planets: shown when relevant — visible tonight with no narrowing filters, or matching the search.
  const shownBodies = useMemo(() => {
    if (!ctx) return [];
    if (q) return bodies.filter((b) => norm(b.meta.name).startsWith(q) || (q.length >= 4 && "planets".startsWith(q) && b.id !== "moon"));
    const narrowed = filters.showpiece || filters.messier || filters.caldwell || filters.groups.length > 0 || !!filters.con || filters.diff !== "any";
    if (narrowed) return [];
    return bodies.filter((b) => (filters.visible ? b.visible : b.track.maxAlt > 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodies, q, filters, !!ctx]);

  // Planets' moons: found by name, by "moons", or by their planet's name.
  const shownMoons = useMemo(() => {
    if (!q) return [];
    return MOONS.filter((m) => norm(m.name).startsWith(q) || (q.length >= 4 && "moons".startsWith(q)) || norm(PLANET_BY_ID[m.parent].name) === q);
  }, [q]);

  // Constellations present in the catalog, for the select.
  const constellations = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of objects) if (o.con) counts.set(o.con, (counts.get(o.con) ?? 0) + 1);
    return [...counts.entries()].map(([abbr, n]) => ({ abbr, name: constellationName(abbr), n })).sort((a, b) => a.name.localeCompare(b.name));
  }, [objects]);

  const nFilters = activeFilterCount(filters);
  const clearAll = () => {
    setQInput("");
    lastQ.current = "";
    setParams(paramsFromFilters({ ...DEFAULT_FILTERS, sort: filters.sort }), { replace: true });
  };

  const loading = isLoading;
  const count = shown.length;

  return (
    <div className="flex flex-col">
      <PageHeader
        eyebrow={ctx ? `Tonight · ${formatNightDate(ctx.night.date, "long")}` : "The catalog"}
        title="Explore"
        description={
          objects.length
            ? `${objects.length.toLocaleString()} deep-sky objects and the planets, ranked for your sky and telescope.`
            : "Deep-sky objects and the planets, ranked for your sky and telescope."
        }
      />

      {!site && <NoSite className="mt-6" />}

      <InstrumentBar scope={scope} ctx={ctx} className="mt-6" />

      {/* ------------------------------------------------------------ controls */}
      <div className="mt-4 flex flex-col gap-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              ref={searchRef}
              type="text"
              role="searchbox"
              enterKeyHint="search"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search M31, NGC 7000, Ring Nebula…"
              aria-label="Search the catalog"
              className="h-11 pl-9 pr-9 text-[0.95rem]"
              autoComplete="off"
              spellCheck={false}
            />
            {qInput ? (
              <button
                type="button"
                onClick={() => setQInput("")}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border px-1.5 text-2xs text-muted-foreground md:block">/</kbd>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 md:flex">
            <Select value={filters.diff} onValueChange={(v) => update({ diff: v })}>
              <SelectTrigger className="h-11 md:w-[11rem]" aria-label="Difficulty">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIFFICULTY_FILTERS.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.con ?? "all"} onValueChange={(v) => update({ con: v === "all" ? null : v })}>
              <SelectTrigger className="h-11 md:w-[12rem]" aria-label="Constellation">
                <SelectValue placeholder="All constellations" />
              </SelectTrigger>
              <SelectContent className="max-h-[20rem]">
                <SelectItem value="all">All constellations</SelectItem>
                {constellations.map((c) => (
                  <SelectItem key={c.abbr} value={c.abbr}>
                    {c.name} <span className="num text-muted-foreground">· {c.n}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Quick filters">
          <Chip active={filters.visible} onClick={() => update({ visible: !filters.visible })}>
            Visible tonight
          </Chip>
          <Chip active={filters.showpiece} onClick={() => update({ showpiece: !filters.showpiece })}>
            Showpieces
          </Chip>
          <Chip active={filters.messier} onClick={() => update({ messier: !filters.messier })}>
            Messier
          </Chip>
          <Chip active={filters.caldwell} onClick={() => update({ caldwell: !filters.caldwell })}>
            Caldwell
          </Chip>
          <span className="mx-1 hidden w-px self-stretch bg-border sm:block" aria-hidden="true" />
          {TYPE_GROUPS.map((g) => (
            <Chip
              key={g.id}
              active={filters.groups.includes(g.id)}
              onClick={() => update({ groups: filters.groups.includes(g.id) ? filters.groups.filter((x) => x !== g.id) : [...filters.groups, g.id] })}
            >
              {g.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------ planets */}
      {ctx && shownBodies.length > 0 && (
        <section className="mt-6" aria-labelledby="planets-h">
          <h2 id="planets-h" className="eyebrow mb-2">
            {q ? "Solar system" : "Planets & Moon tonight"}
          </h2>
          <PlanetStrip bodies={shownBodies} ctx={ctx} />
        </section>
      )}
      {shownMoons.length > 0 && (
        <section className="mt-6" aria-labelledby="moons-h">
          <h2 id="moons-h" className="eyebrow mb-2">
            Moons
          </h2>
          <ul className="flex flex-wrap gap-2">
            {shownMoons.map((m, i) => (
              <li key={m.id} className="animate-fade" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                <Link href={`/object/${m.id}`} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors hover:bg-accent/60">
                  <TypeGlyph type="satellite" className="h-4 w-4 text-gold" />
                  <span className="font-medium">{m.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {PLANET_BY_ID[m.parent].name} · mag <span className="num">{formatMag(m.mag)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {ctx && !q && <CometStrip ctx={ctx} variant="strip" title="Comets tonight" className="mt-6" />}

      {/* ------------------------------------------------------------ results */}
      <section className="mt-6" aria-labelledby="results-h">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id="results-h" className="text-sm text-muted-foreground" aria-live="polite">
            {loading ? (
              "Loading the catalog…"
            ) : (
              <>
                <span className="num font-medium text-foreground">{count.toLocaleString()}</span>{" "}
                {q || nFilters ? (count === 1 ? "match" : "matches") : filters.visible && ctx ? "observable tonight" : "objects"}
                {filters.visible && ctx && (q || nFilters) ? " observable tonight" : ""}
              </>
            )}
          </h2>
          <div className="flex items-center gap-2">
            {(nFilters > 0 || q) && (
              <Button variant="ghost" size="sm" onClick={clearAll} className="text-muted-foreground">
                <X /> Clear
              </Button>
            )}
            <Select value={filters.sort} onValueChange={(v) => update({ sort: v as SortKey })}>
              <SelectTrigger className="h-9 w-auto gap-2 border-none bg-transparent px-2 text-sm font-medium hover:bg-accent" aria-label="Sort by">
                <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {SORTS.map((s) => (
                  <SelectItem key={s.id} value={s.id} disabled={!ctx && s.id !== "bright" && s.id !== "catalog"}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {filters.sort === "high" && sunUp && (
          <p className="mb-2 text-xs text-muted-foreground">The Sun is up — this is where objects stand right now, not after dark. Pick “Best tonight” to plan the night.</p>
        )}

        {/* Column headings (desktop) */}
        <div className="hidden grid-cols-[2.25rem_minmax(0,1fr)_6.5rem_7.5rem_8.5rem_6.75rem] gap-x-3 border-b px-4 pb-2 text-2xs uppercase tracking-[0.12em] text-muted-foreground md:grid">
          <span />
          <span>Object</span>
          <span>Brightness</span>
          <span>Tonight</span>
          <span>Best time</span>
          <span className="text-right">Difficulty</span>
        </div>

        {error ? (
          <EmptyState className="mt-3" title="Couldn't load the catalog" description="Reload the page to try again." />
        ) : loading ? (
          <ul className="divide-y">
            {Array.from({ length: 8 }, (_, i) => (
              <RowSkeleton key={i} />
            ))}
          </ul>
        ) : objects.length === 0 ? (
          <EmptyState className="mt-3" title="The catalog isn't available yet" description="Deep-sky data is still being prepared. Try again in a moment." />
        ) : count === 0 && shownBodies.length > 0 ? (
          <p className="border-t py-4 text-sm text-muted-foreground">
            No deep-sky objects match{hiddenByVisibility ? " that are observable tonight" : ""}.
            {hiddenByVisibility > 0 && (
              <>
                {" "}
                <button type="button" className="link" onClick={() => update({ visible: false })}>
                  Show {hiddenByVisibility} that {hiddenByVisibility === 1 ? "isn't" : "aren't"}
                </button>
              </>
            )}
          </p>
        ) : count === 0 ? (
          <EmptyState
            className="mt-3"
            icon={<Sparkles className="h-5 w-5" />}
            title={hiddenByVisibility ? `${hiddenByVisibility} ${hiddenByVisibility === 1 ? "match isn't" : "matches aren't"} observable tonight` : "Nothing matches"}
            description={
              hiddenByVisibility
                ? "They're below your minimum altitude during darkness, or too faint for this sky and instrument tonight."
                : "Try a different name or designation, or loosen the filters."
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {hiddenByVisibility > 0 && <Button onClick={() => update({ visible: false })}>Show them anyway</Button>}
                <Button variant="outline" onClick={clearAll}>
                  Clear filters
                </Button>
              </div>
            }
          />
        ) : (
          <>
            <ul className="divide-y border-b">
              {shown.slice(0, limit).map((it) => (
                <ResultRow key={it.o.id} item={it} rc={rc} />
              ))}
            </ul>
            <div className="mt-4 flex flex-col items-center gap-2 text-sm">
              {count > limit && (
                // The last page takes a small remainder with it, so there's never a lone "Show 1 more".
                <Button variant="outline" onClick={() => setLimit((l) => (count - l <= PAGE + PAGE / 4 ? count : l + PAGE))}>
                  {count - limit <= PAGE + PAGE / 4 ? (
                    <>Show {(count - limit).toLocaleString()} more</>
                  ) : (
                    <>
                      Show {PAGE} more <span className="num text-muted-foreground">of {(count - limit).toLocaleString()}</span>
                    </>
                  )}
                </Button>
              )}
              {hiddenByVisibility > 0 && (
                <button type="button" className="link text-xs" onClick={() => update({ visible: false })}>
                  + {hiddenByVisibility.toLocaleString()} more {q ? (hiddenByVisibility === 1 ? "match" : "matches") : "objects"} not observable tonight
                </button>
              )}
            </div>
          </>
        )}
        {ctx && !loading && objects.length > 0 && (
          <p className="mt-6 text-2xs leading-relaxed text-muted-foreground">
            Observable = above your {minAlt}° minimum altitude during astronomical darkness and within reach of {instrumentPhrase(scope)} under a{" "}
            {ctx.sqmSource === "atlas" ? `≈${ctx.sqm.toFixed(1)} mag/arcsec² sky (estimated from the light-pollution atlas)` : `${ctx.sqm.toFixed(1)} mag/arcsec² sky`}.
            Difficulty compares each object's surface brightness with the sky at its best altitude, including moonlight (Krisciunas–Schaefer).{" "}
            {totalVisible.toLocaleString()} of {objects.length.toLocaleString()} catalog objects qualify tonight.
          </p>
        )}
      </section>
    </div>
  );
}

function comparator(sort: SortKey, altNow: Map<string, number> | null) {
  const mag = (o: CatalogObject) => o.mag ?? 99;
  const byMag = (a: ExploreItem, b: ExploreItem) => mag(a.o) - mag(b.o);
  switch (sort) {
    case "bright":
      return byMag;
    case "high":
      return (a: ExploreItem, b: ExploreItem) => (altNow?.get(b.o.id) ?? -90) - (altNow?.get(a.o.id) ?? -90) || byMag(a, b);
    case "transit": {
      const key = (x: ExploreItem) => x.r?.track.transitTime ?? x.r?.bestTime ?? Infinity;
      return (a: ExploreItem, b: ExploreItem) => key(a) - key(b) || byMag(a, b);
    }
    case "catalog":
      return (a: ExploreItem, b: ExploreItem) => {
        const ka = catalogOrder(a.o);
        const kb = catalogOrder(b.o);
        return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2]);
      };
    default:
      return (a: ExploreItem, b: ExploreItem) => (b.r?.score ?? 0) - (a.r?.score ?? 0) || byMag(a, b);
  }
}
