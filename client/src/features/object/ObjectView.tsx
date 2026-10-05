import { useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Search, Star } from "lucide-react";
import {
  formatAngleSize,
  formatDec,
  formatMag,
  formatNightDate,
  formatRA,
  rankEyepieces,
  surfaceBrightnessArcsec,
  type BodyState,
} from "@shared/astro";
import type { CatalogObject } from "@shared/data/types";
import { useCatalog } from "@/hooks/useCatalog";
import { usePrefs } from "@/hooks/usePrefs";
import { useActiveScope } from "@/hooks/useScope";
import { EmptyState, Section, Skel, usePageTitle } from "@/components/common/Page";
import { MoonGlyph, TypeGlyph } from "@/components/common/Glyphs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TYPE_LABEL } from "@/lib/objects";
import { InstrumentBar, instrumentPhrase, skySourcePhrase } from "@/features/explore/InstrumentBar";
import { NoSite } from "@/features/explore/NoSite";
import { constellationName } from "@/features/explore/constellations";
import { isSolarSystemId, useNightContext } from "@/features/explore/sky";
import { ObjectActions } from "./ObjectActions";
import { ObserveSection, OpticsFootnote } from "./ObserveSection";
import { TonightSection } from "./TonightSection";
import { YearStrip, yearAltitudes } from "./YearStrip";
import { horizonClass, resolveSubject, tonightFor, type Subject } from "./model";
import { opticsTarget } from "./observing";
import { CountsToward } from "@/features/achievements/CountsToward";
import { nearestBrightStar, sepWords, useNamedStars } from "./finder";

function backHref() {
  try {
    const s = sessionStorage.getItem("ap.exploreSearch");
    return s ? `/explore?${s}` : "/explore";
  } catch {
    return "/explore";
  }
}

function BackLink() {
  return (
    <Link href={backHref()} className="inline-flex min-h-[2.5rem] items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Explore
    </Link>
  );
}

function ObjectSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skel className="h-5 w-24" />
      <div className="space-y-3">
        <Skel className="h-3 w-40" />
        <Skel className="h-11 w-72" />
        <Skel className="h-4 w-56" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skel key={i} className="h-12" />
        ))}
      </div>
      <Skel className="h-64 w-full" />
    </div>
  );
}

function NotFound({ id, suggestions }: { id: string; suggestions: { id: string; name: string; type: string }[] }) {
  usePageTitle("Object not found");
  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <EmptyState
        icon={<Search className="h-5 w-5" />}
        title={`We couldn't find “${id}”`}
        description={
          suggestions.length
            ? "Did you mean one of these?"
            : "It isn't in our catalog of Messier, Caldwell, bright NGC/IC objects, double stars and the planets. Try searching by another name or designation."
        }
        action={
          <div className="flex flex-col items-center gap-4">
            {suggestions.length > 0 && (
              <ul className="flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <li key={s.id}>
                    <Link href={`/object/${encodeURIComponent(s.id)}`} className="inline-flex min-h-[2.5rem] items-center gap-2 rounded-full border px-3 py-1.5 text-sm hover:bg-accent">
                      <TypeGlyph type={s.type} id={s.id} className="h-4 w-4 text-muted-foreground" />
                      {s.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Button asChild variant="outline">
              <Link href={`/explore?q=${encodeURIComponent(id)}&vis=all`}>
                <Search /> Search the catalog
              </Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}

function StatItem({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd className="num mt-1 truncate text-[1.05rem] font-medium leading-tight">{value}</dd>
      {sub && <dd className="mt-0.5 truncate text-2xs text-muted-foreground">{sub}</dd>}
    </div>
  );
}

function DeepStats({ o }: { o: CatalogObject }) {
  const sbArcmin = o.sb ?? (surfaceBrightnessArcsec(o) !== null ? surfaceBrightnessArcsec(o)! - 8.89 : null);
  const items: { label: string; value: React.ReactNode; sub?: React.ReactNode }[] = [];
  if (o.type === "double_star") {
    items.push({ label: "Magnitudes", value: `${formatMag(o.mag)} / ${formatMag(o.mag2)}`, sub: "primary / companion" });
    if (o.sep !== undefined) items.push({ label: "Separation", value: `${o.sep}″` });
    if (o.pa !== undefined) items.push({ label: "Position angle", value: `${o.pa}°`, sub: "north through east" });
  } else {
    items.push({ label: "Magnitude", value: formatMag(o.mag), sub: o.magB ? "blue (B) magnitude" : "visual" });
    items.push({ label: "Size", value: formatAngleSize(o.size), sub: o.hubble ? `Hubble type ${o.hubble}` : undefined });
    if (sbArcmin !== null && sbArcmin !== undefined && o.type !== "open_cluster" && o.type !== "asterism" && o.type !== "star_cloud")
      items.push({ label: "Surface brightness", value: `${sbArcmin.toFixed(1)}`, sub: o.sb !== undefined ? "mag/arcmin²" : "mag/arcmin², estimated" });
  }
  items.push({ label: "Right ascension", value: formatRA(o.ra), sub: "J2000" });
  items.push({ label: "Declination", value: formatDec(o.dec), sub: "J2000" });
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((i) => (
        <StatItem key={i.label} {...i} />
      ))}
    </dl>
  );
}

const AU_KM = 149_597_870.7;

/** The Moon's distance in the user's units: "369,415 km" / "229,543 mi". */
function moonDistance(distanceAu: number, imperial: boolean) {
  const km = distanceAu * AU_KM;
  return imperial ? `${Math.round(km / 1.609344).toLocaleString()} mi` : `${Math.round(km).toLocaleString()} km`;
}

function BodyStats({ id, st }: { id: string; st: BodyState }) {
  const { prefs } = usePrefs();
  const isMoon = id === "moon";
  const items: { label: string; value: React.ReactNode; sub?: React.ReactNode }[] = [
    { label: "Magnitude", value: formatMag(st.mag) },
    { label: "Apparent size", value: isMoon ? `${(st.diameter / 60).toFixed(1)}′` : `${st.diameter.toFixed(st.diameter < 10 ? 1 : 0)}″` },
    { label: "Illuminated", value: `${Math.round(st.illumination * 100)}%` },
    {
      label: "Distance",
      value: isMoon ? moonDistance(st.distanceAu, prefs.units === "imperial") : `${st.distanceAu.toFixed(2)} AU`,
      sub: isMoon ? undefined : `light takes ${Math.round((st.distanceAu * 499.005) / 60)} min`,
    },
    { label: "Position", value: `${formatRA(st.raJ2000).slice(0, 7)} ${formatDec(st.decJ2000).slice(0, 8)}`, sub: `J2000 · in ${constellationName(st.constellation)}` },
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((i) => (
        <StatItem key={i.label} {...i} />
      ))}
    </dl>
  );
}

function FinderText({ o }: { o: CatalogObject }) {
  const stars = useNamedStars();
  const hint = nearestBrightStar(stars.data, o.ra, o.dec);
  return (
    <div className="text-muted-foreground">
      <div className="eyebrow mb-1">Finding it</div>
      In <span className="text-foreground">{constellationName(o.con)}</span>
      {hint ? (
        <>
          , {sepWords(hint.sep)} {hint.direction} of <span className="text-foreground">{hint.star.name}</span> (mag{" "}
          <span className="num">{formatMag(hint.star.mag)}</span>)
        </>
      ) : null}
      . The{" "}
      <Link href={`/sky?focus=${encodeURIComponent(o.id)}`} className="link">
        sky chart
      </Link>{" "}
      shows the star-hop.
    </div>
  );
}

function SubjectPage({ subject }: { subject: Subject }) {
  usePageTitle(subject.name);
  const scope = useActiveScope();
  const { prefs } = usePrefs();
  const { ctx, now } = useNightContext(10);
  const aperture = scope.scope.aperture;

  const tonight = useMemo(
    () => (ctx ? tonightFor(subject, ctx, aperture) : null),
    // Recompute when the night, sky or instrument changes — not every minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [subject, ctx?.frames, ctx?.sqm, ctx?.minAlt, ctx?.site.key, aperture],
  );

  const year = useMemo(() => {
    if (!ctx) return null;
    if (subject.kind === "deep") return yearAltitudes(ctx.site, now, { ra: subject.obj.ra, dec: subject.obj.dec });
    if (subject.id === "moon") return null;
    return yearAltitudes(ctx.site, now, { body: subject.meta.body });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, ctx?.site.key, Math.floor(now / 86_400_000)]);

  // Pre-fill for the journal: the eyepiece AstroPilot recommends — only from the user's own kit on their own telescope.
  const suggestion = useMemo(() => {
    if (!tonight || scope.source !== "gear") return { telescopeId: scope.telescopeId };
    const { target, sizeArcmin } = opticsTarget(subject, tonight);
    const best = rankEyepieces(scope.scope, scope.eyepieces, scope.barlows, target, { sizeArcmin })[0];
    return {
      telescopeId: scope.telescopeId,
      eyepieceId: best?.eyepiece.id ?? null,
      barlowId: best?.barlow?.id ?? null,
      magnification: best ? Math.round(best.setup.magnification) : null,
    };
  }, [subject, tonight, scope.source, scope.scope, scope.eyepieces, scope.barlows, scope.telescopeId]);

  const typeLabel = TYPE_LABEL[subject.type] ?? subject.type;
  const conAbbr = subject.kind === "deep" ? subject.obj.con : tonight?.body?.state.constellation;
  const designations = subject.kind === "deep" ? subject.obj.designations.filter((d) => d.replace(/\s/g, "") !== subject.name.replace(/\s/g, "")) : [];
  const circumpolar = ctx && subject.kind === "deep" && horizonClass(ctx.site.lat, subject.obj.dec) === "circumpolar";

  return (
    <div className="flex flex-col">
      <BackLink />

      {/* ------------------------------------------------------------ header */}
      <header className="mt-3 flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <div className="hidden h-14 w-14 shrink-0 animate-zoom-fade place-items-center rounded-2xl border bg-surface-2/60 text-foreground/85 sm:grid">
            {subject.kind === "body" && subject.id === "moon" && ctx ? (
              <MoonGlyph elongation={ctx.night.moon.elongation} size={40} southern={ctx.site.lat < 0} />
            ) : (
              <TypeGlyph type={subject.type} id={subject.id} className={subject.kind === "body" ? "h-8 w-8 text-gold" : "h-8 w-8"} />
            )}
          </div>
          <div className="min-w-0 animate-rise">
            <div className="eyebrow">
              {typeLabel}
              {conAbbr ? ` · in ${constellationName(conAbbr)}` : ""}
            </div>
            <h1 className="mt-1.5 font-display text-[2.4rem] leading-[1.02] tracking-tight sm:text-[3rem]">{subject.name}</h1>
            {(designations.length > 0 || (subject.kind === "deep" && subject.obj.showpiece)) && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {designations.length > 0 && <span className="num text-sm text-muted-foreground">{designations.join(" · ")}</span>}
                {subject.kind === "deep" && subject.obj.showpiece && (
                  <Badge variant="gold">
                    <Star className="fill-current" /> Showpiece
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
        <CountsToward obj={subject.kind === "deep" ? subject.obj : { id: subject.id, type: subject.type }} />
        <ObjectActions refId={subject.id} name={subject.name} suggestion={suggestion} />
        <div className="border-t pt-5">
          {subject.kind === "deep" ? <DeepStats o={subject.obj} /> : tonight?.body ? <BodyStats id={subject.id} st={tonight.body.state} /> : <Skel className="h-12 w-full" />}
        </div>
      </header>

      {!ctx ? (
        <NoSite className="mt-8" title={`See when ${subject.name} is up from where you are`} />
      ) : (
        <>
          <InstrumentBar scope={scope} ctx={ctx} className="mt-8" />
          <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
            <div className="flex min-w-0 flex-col gap-10">
              <Section title={`Tonight from ${ctx.site.name}`} description={formatNightDate(ctx.night.date, "long")}>
                {tonight ? <TonightSection subject={subject} tonight={tonight} ctx={ctx} scope={scope} /> : <Skel className="h-64" />}
              </Section>
              <Section title="How to observe it" description={`With ${instrumentPhrase(scope)}`}>
                {tonight && <ObserveSection key={`${subject.id}|${scope.telescopeId ?? scope.presetId}`} subject={subject} tonight={tonight} ctx={ctx} scope={scope} />}
                <OpticsFootnote scope={scope} />
              </Section>
            </div>

            <aside className="flex min-w-0 flex-col gap-10">
              {year && year.some((m) => m.alt > 0) && (
                <Section title="Through the year" description="Highest altitude 22:00–02:00 local solar time, mid-month">
                  <YearStrip months={year} minAlt={ctx.minAlt} />
                  {circumpolar && <p className="text-xs text-muted-foreground">Circumpolar from {ctx.site.name}: it never sets.</p>}
                </Section>
              )}
              <Section title="About">
                {subject.kind === "deep" ? (
                  <div className="flex flex-col gap-3 text-sm">
                    {subject.obj.desc ? <p className="leading-relaxed">{subject.obj.desc}</p> : <p className="text-muted-foreground">No description yet.</p>}
                    <FinderText o={subject.obj} />
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 text-sm">
                    {tonight?.body &&
                      (subject.id === "moon" ? (
                        <p className="leading-relaxed">
                          Tonight the Moon is <span className="num">{moonDistance(tonight.body.state.distanceAu, prefs.units === "imperial")}</span> away — its
                          light takes <span className="num">{((tonight.body.state.distanceAu * 499.005) || 0).toFixed(2)}</span> seconds to reach you. It moves
                          about its own width eastward every hour against the stars.
                        </p>
                      ) : (
                        <p className="leading-relaxed">
                          {subject.name} is <span className="num">{tonight.body.state.distanceAu.toFixed(2)}</span> AU away: the light you'll see left it{" "}
                          <span className="num">{Math.round((tonight.body.state.distanceAu * 499.005) / 60)}</span> minutes earlier. It's currently in{" "}
                          {constellationName(tonight.body.state.constellation)} and drifts slowly against the stars from night to night.
                        </p>
                      ))}
                  </div>
                )}
              </Section>
              <p className="text-2xs leading-relaxed text-muted-foreground">
                Positions from astronomy-engine (VSOP87/ELP, refraction included). Catalog data from OpenNGC and the WDS. Sky brightness from{" "}
                {skySourcePhrase(ctx)} with Krisciunas–Schaefer moonlight. Times in {ctx.tz ?? "your time zone"}.
              </p>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

export function ObjectView({ id }: { id: string }) {
  const { objects, byId, isLoading } = useCatalog();
  const [, navigate] = useLocation();
  const body = isSolarSystemId(id);
  const resolution = useMemo(() => (isLoading && !body ? null : resolveSubject(id, objects, byId)), [id, objects, byId, isLoading, body]);

  useEffect(() => {
    if (resolution?.status === "redirect") navigate(`/object/${encodeURIComponent(resolution.id)}`, { replace: true });
  }, [resolution, navigate]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [id]);

  if (!resolution || resolution.status === "redirect") return <ObjectSkeleton />;
  if (resolution.status === "missing") return <NotFound id={id} suggestions={resolution.suggestions} />;
  return <SubjectPage key={resolution.subject.id} subject={resolution.subject} />;
}
