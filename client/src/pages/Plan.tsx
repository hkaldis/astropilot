import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, CalendarDays, Check, Sparkles, Trash2, Undo2 } from "lucide-react";
import {
  MOON_BY_ID,
  PLANET_BY_ID,
  addDays,
  currentNightDate,
  detectability,
  evaluateTarget,
  formatNightDate,
  formatTime,
  isMoonId,
  nightFrames,
  nightOf,
  planSequence,
  rankTargets,
  sqmForBortle,
  type MoonId,
  type NightFrames,
  type NightInfo,
  type RankedTarget,
  type SolarSystemId,
} from "@shared/astro";
import type { ApiTarget, ObservingSite } from "@shared/api";
import { useSite, siteTz } from "@/hooks/useSite";
import { useAuth } from "@/hooks/useAuth";
import { usePrefs } from "@/hooks/usePrefs";
import { useNow } from "@/hooks/useNow";
import { useCatalog } from "@/hooks/useCatalog";
import { ratingOptics, useActiveScope } from "@/hooks/useScope";
import { api, queryClient } from "@/lib/api";
import { EmptyState, PageHeader, Section, Skel, usePageTitle } from "@/components/common/Page";
import { TypeGlyph } from "@/components/common/Glyphs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InstrumentPicker } from "@/features/tonight/BestTargets";
import { DarkCalendar } from "@/features/plan/DarkCalendar";
import { BODY_SUN_LIMIT, bodyWindow, evaluateBody, evaluateMoon } from "@/features/explore/sky";
import { DIFFICULTY_TONE, TYPE_LABEL } from "@/lib/objects";
import { cn } from "@/lib/utils";
import { stagger } from "@/lib/motion";
import { toast } from "@/hooks/use-toast";

const RUN_MINUTES = 25;

interface PlanItem {
  target: ApiTarget | null;
  r: RankedTarget;
  /** Planets and the Moon: tracked along their real motion, observable whenever the Sun is below −6°. */
  body: boolean;
}

/** A planet or the Moon as a ranked target (the same evaluation as on its own page). */
function bodyTarget(id: SolarSystemId, ctx: { frames: NightFrames; night: NightInfo; site: ObservingSite; minAlt: number; sqm: number }, apertureMm: number): RankedTarget {
  const b = evaluateBody(id, ctx, apertureMm);
  const st = b.state;
  const detect = b.detect ?? detectability({ type: "planet", mag: st.mag }, { sqmZenith: ctx.sqm, apertureMm, alt: Math.max(b.track.maxAlt, 1) });
  return {
    object: { id, name: b.meta.name, type: id === "moon" ? "moon" : "planet", ra: st.raJ2000, dec: st.decJ2000, mag: st.mag, size: [st.diameter / 60] },
    score: b.visible ? 100 : 0,
    rawScore: b.visible ? 100 : 0,
    track: b.track,
    detect,
    bestTime: b.bestTime,
    reasons: [],
  };
}

/** A planet's moon as a ranked target: its planet's track, rated for the moon's typical brightness and distance from the planet. */
function moonTarget(id: MoonId, ctx: { frames: NightFrames; night: NightInfo; site: ObservingSite; minAlt: number; sqm: number }, optics: ReturnType<typeof ratingOptics>): RankedTarget {
  const meta = MOON_BY_ID[id];
  const b = evaluateBody(meta.parent as SolarSystemId, ctx, optics.apertureMm);
  const { detect, visible } = evaluateMoon(meta, b, ctx, optics);
  return {
    object: { id, name: meta.name, type: "satellite", ra: b.state.raJ2000, dec: b.state.decJ2000, mag: meta.mag },
    score: visible ? 100 : 0,
    rawScore: visible ? 100 : 0,
    track: b.track,
    detect,
    bestTime: b.bestTime,
    reasons: [],
  };
}

/** End of the time an item can be observed: darkness for deep-sky objects, civil dawn for planets and the Moon. */
function observingEnd(item: PlanItem, night: NightInfo, nf: NightFrames) {
  return item.body ? bodyWindow(night, nf)[1] : nf.darkEnd;
}

/**
 * Why an item has no observing window this night: only up in bright twilight (planets near the Sun),
 * below the horizon after dark, or too low.
 */
function whyNotUp(item: PlanItem, nf: NightFrames, minAlt: number): string {
  const tr = item.r.track;
  if (item.body && tr.points.some((p, i) => p.alt >= minAlt && nf.sunAlt[i] >= BODY_SUN_LIMIT && nf.sunAlt[i] < -0.833)) return "only up in bright twilight";
  if (tr.maxAlt < 0) return item.body ? "only up in daylight" : "below the horizon after dark";
  return `too low: at most ${Math.max(0, Math.round(tr.maxAlt))}° after dark`;
}

export default function PlanPage() {
  usePageTitle("Plan");
  const { site } = useSite();
  const { user } = useAuth();
  const { prefs, hour12 } = usePrefs();
  const now = useNow();
  const { byId, objects, isLoading: catLoading } = useCatalog();
  const scope = useActiveScope();
  const [offset, setOffset] = useState(0);
  const [autoPlan, setAutoPlan] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const tz = siteTz(site);
  const targetsQ = useQuery<ApiTarget[]>({ queryKey: ["/api/targets"], enabled: !!user });

  const tonight = site ? currentNightDate(now, site) : null;
  const date = tonight ? addDays(tonight, offset) : null;
  const astro = useMemo(() => {
    if (!site || !date) return null;
    const night = nightOf(date, site);
    return { night, frames: nightFrames(night, site, 10) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site?.lat, site?.lon, site?.elevation, site?.timezone, date]);

  const sqm = site ? (site.sqm ?? sqmForBortle(site.bortle)) : 21;
  const minAlt = prefs.minAltitude;
  const ctx = { sqm, minAlt, ...ratingOptics(scope) };

  const planned = (targetsQ.data ?? []).filter((t) => t.status === "planned");
  const done = (targetsQ.data ?? []).filter((t) => t.status !== "planned");

  const evaluated = useMemo(() => {
    if (!astro || !site) return [] as PlanItem[];
    const bodyCtx = { frames: astro.frames, night: astro.night, site, minAlt, sqm };
    const fromList = planned
      .map((t): PlanItem | null => {
        const id = t.ref.toLowerCase();
        if (Object.prototype.hasOwnProperty.call(PLANET_BY_ID, id)) return { target: t, r: bodyTarget(id as SolarSystemId, bodyCtx, ctx.apertureMm), body: true };
        if (isMoonId(id)) return { target: t, r: moonTarget(id as MoonId, bodyCtx, ratingOptics(scope)), body: true };
        const o = byId.get(t.ref.toUpperCase());
        return o ? { target: t, r: evaluateTarget(o, astro.frames, ctx), body: false } : null;
      })
      .filter((x): x is PlanItem => x !== null);
    if (!autoPlan || !objects.length) return fromList;
    const exclude = new Set(fromList.map((x) => x.r.object.id.toUpperCase()));
    const extra = rankTargets(objects, astro.frames, ctx, { limit: Math.max(0, 8 - fromList.length), perTypeCap: 2 })
      .filter((r) => !exclude.has(r.object.id.toUpperCase()) && r.score >= 40)
      .map((r): PlanItem => ({ target: null, r, body: false }));
    return [...fromList, ...extra];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [astro, site, planned.map((p) => p.ref).join(","), byId, autoPlan, objects, sqm, scope.scope.aperture, scope.kind, scope.power, minAlt]);

  // Deep-sky windows lie inside darkness; planets and the Moon can also be scheduled in twilight (Sun below −6°).
  const runNight = useMemo(() => {
    if (!astro) return null;
    const n = astro.night;
    if (!evaluated.some((e) => e.body)) return n;
    const [dusk, dawn] = bodyWindow(n, astro.frames);
    const starts = [n.darkStart, dusk].filter((x): x is number => x !== null);
    const ends = [n.darkEnd, dawn].filter((x): x is number => x !== null);
    return { ...n, darkStart: starts.length ? Math.min(...starts) : null, darkEnd: ends.length ? Math.max(...ends) : null };
  }, [astro, evaluated]);
  const schedule = useMemo(() => (runNight ? planSequence(evaluated.map((e) => e.r), runNight, RUN_MINUTES) : []), [evaluated, runNight]);
  const unscheduled = evaluated
    .filter((e) => !schedule.some((s) => s.target.object.id === e.r.object.id))
    .map((e) => {
      const w = e.r.track.window;
      if (!w || !astro || !runNight) return { name: e.r.object.name, why: astro ? whyNotUp(e, astro.frames, minAlt) : "" };
      const usable = Math.min(w[1], runNight.darkEnd ?? w[1]) - Math.max(w[0], runNight.darkStart ?? w[0]);
      return { name: e.r.object.name, why: usable < RUN_MINUTES * 60_000 ? "only up briefly" : "no time left" };
    });

  const patch = useMutation({
    mutationFn: ({ id, ...body }: { id: number; status?: string; priority?: string }) => api<ApiTarget[]>("PATCH", `/api/targets/${id}`, body),
    onSuccess: (d) => queryClient.setQueryData(["/api/targets"], d),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api<ApiTarget[]>("DELETE", `/api/targets/${id}`),
    onSuccess: (d) => queryClient.setQueryData(["/api/targets"], d),
  });
  const add = useMutation({
    mutationFn: (ref: string) => api<ApiTarget[]>("POST", "/api/targets", { ref }),
    onSuccess: (d) => {
      queryClient.setQueryData(["/api/targets"], d);
      toast({ title: "Added to your targets" });
    },
  });

  const fmt = (t: number | null) => formatTime(t, { tz, hour12 });

  /** "sets below 30° at 02:14" when it drops below the minimum during the night, else that it stays up until the end. */
  const untilText = (item: PlanItem) => {
    const tr = item.r.track;
    const w = tr.window;
    if (!w || !astro) return null;
    const i = tr.points.findIndex((pt) => pt.t === w[1]);
    const a = tr.points[i];
    const b = tr.points[i + 1];
    const end = observingEnd(item, astro.night, astro.frames);
    if (a && b && b.alt < minAlt) {
      const t = a.t + ((a.alt - minAlt) / (a.alt - b.alt)) * (b.t - a.t);
      if (end === null || t <= end) return `sets below ${minAlt}° at ${fmt(t)}`;
    }
    return item.body ? `above ${minAlt}° until dawn` : `above ${minAlt}° until darkness ends`;
  };
  /** "Up 21:10–03:40", "Briefly up around 05:20" for a single sample, and "in twilight" for a planet that's only up then. */
  const windowText = (item: PlanItem) => {
    const w = item.r.track.window;
    if (!w) return null;
    const n = astro?.night;
    const twilight = item.body && n && (n.darkStart === null || n.darkEnd === null || w[1] <= n.darkStart || w[0] >= n.darkEnd);
    const when = w[1] - w[0] < 15 * 60_000 ? `Briefly up around ${fmt(w[0])}` : `Up ${fmt(w[0])}–${fmt(w[1])}`;
    return twilight ? `${when}, in twilight` : when;
  };

  if (!site)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Plan" description="Build tonight's observing run." />
        <EmptyState title="Set your location first" description="Choose where you observe from at the top of the page, then come back to plan the night." />
      </div>
    );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={`${site.name} · ${date ? formatNightDate(date, "long") : ""}`}
        title="Observing plan"
        description="Your targets, put in the order that makes the most of the dark hours — objects that set first come first."
        actions={<InstrumentPicker />}
      />
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Night">
          {[...Array.from({ length: 7 }, (_, i) => i), ...(offset >= 7 ? [offset] : [])].map((i) => (
            <button
              key={i}
              role="tab"
              aria-selected={offset === i}
              onClick={() => setOffset(i)}
              className={cn("rounded-full border px-3 py-1 text-xs transition-colors duration-200", offset === i ? "border-primary/50 bg-primary/10" : "text-muted-foreground hover:bg-accent")}
            >
              {i === 0 ? "Tonight" : tonight ? formatNightDate(addDays(tonight, i)) : ""}
            </button>
          ))}
          <button
            onClick={() => setShowCalendar((v) => !v)}
            aria-expanded={showCalendar}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors duration-200",
              showCalendar ? "border-primary/50 bg-primary/10" : "text-muted-foreground hover:bg-accent",
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Dark-sky calendar
          </button>
        </div>
        {showCalendar && tonight && (
          <div className="panel animate-rise p-3 sm:p-4">
            <DarkCalendar site={site} tonight={tonight} selected={offset} onSelect={setOffset} southern={site.lat < 0} />
          </div>
        )}
      </div>

      {astro && (
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="panel-muted px-4 py-3">
            {/* Named for what the night offers, as on Explore: nautical or civil twilight is not darkness. */}
            <div className="eyebrow">{astro.night.darkness === "astronomical" ? "Dark from" : astro.night.darkness === "nautical" ? "Darkest (nautical twilight)" : astro.night.darkness === "civil" ? "Brightest twilight only" : "Darkness"}</div>
            <div className="num mt-1 font-medium">
              {astro.night.darkStart ? `${fmt(astro.night.darkStart)} – ${fmt(astro.night.darkEnd)}` : "No full darkness"}
            </div>
          </div>
          <div className="panel-muted px-4 py-3">
            <div className="eyebrow">Moon</div>
            <div className="num mt-1 font-medium">
              {Math.round(astro.night.moon.illumination * 100)}% · {astro.night.moon.phaseName}
            </div>
          </div>
          <div className="panel-muted px-4 py-3">
            <div className="eyebrow">Moon-free dark</div>
            <div className="num mt-1 font-medium">
              {astro.night.moonFreeWindows.length ? astro.night.moonFreeWindows.map(([a, b]) => `${fmt(a)}–${fmt(b)}`).join(", ") : "None"}
            </div>
          </div>
        </div>
      )}

      <Section
        title="Run order"
        description={schedule.length ? `${schedule.length} target${schedule.length === 1 ? "" : "s"}, about ${RUN_MINUTES} minutes each.` : undefined}
        action={
          <Button variant={autoPlan ? "subtle" : "outline"} size="sm" onClick={() => setAutoPlan((a) => !a)} aria-pressed={autoPlan}>
            <Sparkles /> {autoPlan ? "Showing suggestions" : "Fill with suggestions"}
          </Button>
        }
      >
        {(targetsQ.isLoading || catLoading) && user ? (
          <Skel className="h-40 w-full" />
        ) : schedule.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="h-5 w-5" />}
            title={user ? "Nothing scheduled for this night yet" : "Plan your night"}
            description={
              user
                ? "Add targets from Tonight or Explore, or let AstroPilot suggest a run for this night."
                : "Let AstroPilot suggest a run for this night, or sign in to build your own target list."
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setAutoPlan(true)}>
                  <Sparkles /> Suggest a plan
                </Button>
                <Button asChild variant="outline">
                  <Link href="/explore">Browse objects</Link>
                </Button>
              </div>
            }
          />
        ) : (
          // The night's running order deals itself in, in time order, for each night picked.
          <ol key={date ?? ""} className="panel divide-y">
            {schedule.map(({ target: r, at }, i) => {
              const item = evaluated.find((e) => e.r.object.id === r.object.id);
              const p = r.track.points.reduce((best, pt) => (Math.abs(pt.t - at) < Math.abs(best.t - at) ? pt : best), r.track.points[0]);
              const until = item ? untilText(item) : null;
              return (
                <li key={r.object.id} className="flex animate-rise items-center gap-3 px-3 py-3 sm:px-4" style={stagger(i, 50)}>
                  <div className="num w-14 shrink-0 text-sm font-medium">{fmt(at)}</div>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-primary">
                    <TypeGlyph type={r.object.type} id={r.object.id} className="h-[1.1rem] w-[1.1rem]" />
                  </span>
                  <Link href={`/object/${r.object.id}`} className="min-w-0 flex-1">
                    <div className="truncate font-medium hover:underline">{r.object.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {TYPE_LABEL[r.object.type] ?? r.object.type} · {Math.round(p.alt)}° high then{until ? ` · ${until}` : ""}
                    </div>
                  </Link>
                  <Badge variant={DIFFICULTY_TONE[r.detect.difficulty]} className="hidden capitalize sm:inline-flex">
                    {r.detect.difficulty}
                  </Badge>
                  {item?.target ? (
                    <Button variant="ghost" size="icon-sm" aria-label={`Mark ${r.object.name} observed`} onClick={() => patch.mutate({ id: item.target!.id, status: "observed" })}>
                      <Check />
                    </Button>
                  ) : user ? (
                    <Button variant="ghost" size="sm" onClick={() => add.mutate(r.object.id)}>
                      Keep
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
        {unscheduled.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Not placeable this night: {unscheduled.map((u) => (u.why ? `${u.name} (${u.why})` : u.name)).join(", ")}.
          </p>
        )}
      </Section>

      {user && (
        <Section title="My targets" description="Your wish list. AstroPilot schedules them on nights they're well placed.">
          {targetsQ.data && targetsQ.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No saved targets yet. Use “Add to my targets” on any object page.
            </p>
          ) : (
            <ul className="panel divide-y">
              {[...planned, ...done].map((t) => {
                const ev = evaluated.find((e) => e.target?.id === t.id);
                return (
                  <li key={t.id} className={cn("flex animate-fade items-center gap-3 px-3 py-2.5 transition-opacity [transition-duration:300ms] sm:px-4", t.status !== "planned" && "opacity-60")}>
                    <Link href={`/object/${t.ref}`} className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium hover:underline">{t.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.status === "observed"
                          ? "Observed"
                          : t.status === "dismissed"
                            ? "Dismissed"
                            : ev && astro
                              ? ev.r.track.window
                                ? `${windowText(ev)} · ${ev.r.detect.difficulty}`
                                : `Not well placed this night: ${whyNotUp(ev, astro.frames, minAlt)}`
                              : "Planned"}
                      </div>
                    </Link>
                    {t.status === "planned" ? (
                      <Button variant="ghost" size="icon-sm" aria-label={`Mark ${t.name} observed`} onClick={() => patch.mutate({ id: t.id, status: "observed" })}>
                        <Check />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon-sm" aria-label={`Move ${t.name} back to planned`} onClick={() => patch.mutate({ id: t.id, status: "planned" })}>
                        <Undo2 />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${t.name}`} onClick={() => remove.mutate(t.id)}>
                      <Trash2 />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}
