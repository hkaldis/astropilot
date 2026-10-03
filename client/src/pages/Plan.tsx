import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, Check, Sparkles, Trash2, Undo2 } from "lucide-react";
import {
  addDays,
  currentNightDate,
  evaluateTarget,
  formatNightDate,
  formatTime,
  nightFrames,
  nightOf,
  planSequence,
  rankTargets,
  sqmForBortle,
  SOLAR_SYSTEM,
  bodyState,
  type RankedTarget,
  type CatalogLike,
} from "@shared/astro";
import type { ApiTarget } from "@shared/api";
import { useSite, siteTz } from "@/hooks/useSite";
import { useAuth } from "@/hooks/useAuth";
import { usePrefs } from "@/hooks/usePrefs";
import { useNow } from "@/hooks/useNow";
import { useCatalog } from "@/hooks/useCatalog";
import { useActiveScope } from "@/hooks/useScope";
import { api, queryClient } from "@/lib/api";
import { EmptyState, PageHeader, Section, Skel, usePageTitle } from "@/components/common/Page";
import { TypeGlyph } from "@/components/common/Glyphs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InstrumentPicker } from "@/features/tonight/BestTargets";
import { DIFFICULTY_TONE, TYPE_LABEL } from "@/lib/objects";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

/** Planets as catalog-like targets, positioned for the middle of the night. */
function planetTargets(mid: number, site: { lat: number; lon: number }): CatalogLike[] {
  return SOLAR_SYSTEM.map((p) => {
    const s = bodyState(p.id, mid, site);
    return { id: p.id, name: p.name, type: p.id === "moon" ? "moon" : "planet", ra: s.raJ2000, dec: s.decJ2000, mag: s.mag, size: [s.diameter / 60] };
  });
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
  const tz = siteTz(site);
  const targetsQ = useQuery<ApiTarget[]>({ queryKey: ["/api/targets"], enabled: !!user });

  const tonight = site ? currentNightDate(now, site) : null;
  const date = tonight ? addDays(tonight, offset) : null;
  const astro = useMemo(() => {
    if (!site || !date) return null;
    const night = nightOf(date, site);
    return { night, frames: nightFrames(night, site, 10) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site?.lat, site?.lon, date]);

  const sqm = site ? (site.sqm ?? sqmForBortle(site.bortle)) : 21;
  const ctx = { sqm, apertureMm: scope.scope.aperture, minAlt: prefs.minAltitude };

  const planned = (targetsQ.data ?? []).filter((t) => t.status === "planned");
  const done = (targetsQ.data ?? []).filter((t) => t.status !== "planned");

  const evaluated = useMemo(() => {
    if (!astro || !site) return [] as { target: ApiTarget | null; r: RankedTarget }[];
    const planets = planetTargets(astro.night.solarMidnight, site);
    const resolve = (ref: string) => byId.get(ref.toUpperCase()) ?? planets.find((p) => p.id === ref);
    const fromList = planned
      .map((t) => {
        const o = resolve(t.ref);
        return o ? { target: t, r: evaluateTarget(o as CatalogLike, astro.frames, ctx) } : null;
      })
      .filter(Boolean) as { target: ApiTarget | null; r: RankedTarget }[];
    if (!autoPlan || !objects.length) return fromList;
    const exclude = new Set(fromList.map((x) => x.r.object.id.toUpperCase()));
    const extra = rankTargets(objects, astro.frames, ctx, { limit: Math.max(0, 8 - fromList.length), perTypeCap: 2 })
      .filter((r) => !exclude.has(r.object.id.toUpperCase()) && r.score >= 40)
      .map((r) => ({ target: null, r }));
    return [...fromList, ...extra];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [astro, site, planned.map((p) => p.ref).join(","), byId, autoPlan, objects, sqm, scope.scope.aperture, prefs.minAltitude]);

  const schedule = useMemo(() => (astro ? planSequence(evaluated.map((e) => e.r), astro.night, 25) : []), [evaluated, astro]);
  const unscheduled = evaluated.filter((e) => !schedule.some((s) => s.target.object.id === e.r.object.id));

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
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Night">
        {Array.from({ length: 7 }, (_, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={offset === i}
            onClick={() => setOffset(i)}
            className={cn("rounded-full border px-3 py-1 text-xs", offset === i ? "border-primary/50 bg-primary/10" : "text-muted-foreground hover:bg-accent")}
          >
            {i === 0 ? "Tonight" : tonight ? formatNightDate(addDays(tonight, i)) : ""}
          </button>
        ))}
      </div>

      {astro && (
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="panel-muted px-4 py-3">
            <div className="eyebrow">Dark from</div>
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
        description={schedule.length ? `${schedule.length} targets, about 25 minutes each.` : undefined}
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
          <ol className="panel divide-y">
            {schedule.map(({ target: r, at }) => {
              const item = evaluated.find((e) => e.r.object.id === r.object.id);
              const p = r.track.points.reduce((best, pt) => (Math.abs(pt.t - at) < Math.abs(best.t - at) ? pt : best), r.track.points[0]);
              return (
                <li key={r.object.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
                  <div className="num w-14 shrink-0 text-sm font-medium">{fmt(at)}</div>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-primary">
                    <TypeGlyph type={r.object.type} className="h-[1.1rem] w-[1.1rem]" />
                  </span>
                  <Link href={`/object/${r.object.id}`} className="min-w-0 flex-1">
                    <div className="truncate font-medium hover:underline">{r.object.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {TYPE_LABEL[r.object.type] ?? r.object.type} · {Math.round(p.alt)}° high then · sets below {prefs.minAltitude}° at {fmt(r.track.window?.[1] ?? null)}
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
            Not placeable this night (too low or no time left): {unscheduled.map((u) => u.r.object.name).join(", ")}.
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
                  <li key={t.id} className={cn("flex items-center gap-3 px-3 py-2.5 sm:px-4", t.status !== "planned" && "opacity-60")}>
                    <Link href={`/object/${t.ref}`} className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium hover:underline">{t.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.status === "observed"
                          ? "Observed"
                          : t.status === "dismissed"
                            ? "Dismissed"
                            : ev
                              ? ev.r.track.window
                                ? `Up ${fmt(ev.r.track.window[0])}–${fmt(ev.r.track.window[1])} · ${ev.r.detect.difficulty}`
                                : "Not well placed this night"
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
