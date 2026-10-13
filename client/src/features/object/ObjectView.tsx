import { useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Search, Star } from "lucide-react";
import {
  MOON_BY_ID,
  formatAngleSize,
  formatDec,
  formatMag,
  formatNightDate,
  formatRA,
  maxElongation,
  rankEyepieces,
  satelliteDetectability,
  separation,
  separationOf,
  surfaceBrightnessArcsec,
  type BodyState,
  type MoonPos,
} from "@shared/astro";
import type { CatalogObject } from "@shared/data/types";
import { photoOf } from "@shared/objectImages";
import { useCatalog } from "@/hooks/useCatalog";
import { usePrefs } from "@/hooks/usePrefs";
import { useActiveScope } from "@/hooks/useScope";
import { EmptyState, Section, Skel, usePageTitle } from "@/components/common/Page";
import { MoonGlyph, TypeGlyph } from "@/components/common/Glyphs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TYPE_LABEL } from "@/lib/objects";
import { cn } from "@/lib/utils";
import { InstrumentBar, instrumentPhrase, skySourcePhrase } from "@/features/explore/InstrumentBar";
import { NoSite } from "@/features/explore/NoSite";
import { constellationName } from "@/features/explore/constellations";
import { frameIndex, isSolarSystemId, sampleAt, siteKey, useNightContext } from "@/features/explore/sky";
import { useMoonSystem } from "@/features/moons/useMoonSystem";
import { MoonSystemPanel } from "@/features/moons/MoonSystemPanel";
import { ObjectActions } from "./ObjectActions";
import { ObjectPhoto } from "./ObjectPhoto";
import { StarPortrait } from "./StarPortrait";
import { ShareObject } from "./ShareObject";
import { bvTemperature, colourWord } from "@shared/starColor";
import { BODY_PHYSICS, EARTH } from "@shared/bodies";
import { physicalSizeLy } from "@shared/stories";
import { useStory } from "./about/useStory";
import { Term } from "@/features/glossary/Term";
import { TYPE_TERM } from "@shared/glossaryTerms";
import { ObserveSection, OpticsFootnote } from "./ObserveSection";
import { TonightSection } from "./TonightSection";
import { YearStrip, yearAltitudes } from "./YearStrip";
import { horizonClass, resolveSubject, systemPlanetOf, tonightFor, type Subject, type Tonight } from "./model";
import { opticsTarget } from "./observing";
import { CountsToward } from "@/features/achievements/CountsToward";
import { nearestBrightStar, sepWords, useNamedStars } from "./finder";
import { AboutSection, StoryHook } from "./about/AboutSection";

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
            : "It isn't in our catalog of Messier, Caldwell, bright NGC/IC objects, double stars, bright named stars, the planets and their moons. Try searching by another name or designation."
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

function StatItem({ label, value, sub, term }: { label: string; value: React.ReactNode; sub?: React.ReactNode; term?: string }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{term ? <Term slug={term}>{label}</Term> : label}</dt>
      <dd className="num mt-1 truncate text-[1.05rem] font-medium leading-tight">{value}</dd>
      {sub && <dd className="mt-0.5 truncate text-2xs text-muted-foreground">{sub}</dd>}
    </div>
  );
}

/** Where a bright star ranks among all the stars of the night sky (doubles by their combined light), from the top 50. */
function brightnessRank(o: CatalogObject, objects: CatalogObject[]): number | null {
  const light = (x: CatalogObject) => (x.type === "double_star" && x.mag !== undefined && x.mag2 !== undefined ? -2.5 * Math.log10(10 ** (-0.4 * x.mag) + 10 ** (-0.4 * x.mag2)) : (x.mag ?? 99));
  if (o.mag === undefined || o.mag > 2.4) return null;
  const mine = light(o);
  const rank = 1 + objects.filter((x) => (x.type === "star" || x.type === "double_star") && x.id !== o.id && light(x) < mine).length;
  return rank <= 50 ? rank : null;
}

/** 2.7, 640, 1,400, 480,000, 1.5 trillion — a multiple of the Sun's value. */
const solarMultiple = (x: number) =>
  x >= 1e12 ? `${+(x / 1e12).toPrecision(2)} trillion` : x >= 1e9 ? `${+(x / 1e9).toPrecision(2)} billion` : x >= 1e6 ? `${+(x / 1e6).toPrecision(2)} million` : x >= 100 ? Number(x.toPrecision(2)).toLocaleString() : `${+x.toFixed(x < 10 ? 1 : 0)}`;

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

function DeepStats({ o }: { o: CatalogObject }) {
  const sbArcmin = o.sb ?? (surfaceBrightnessArcsec(o) !== null ? surfaceBrightnessArcsec(o)! - 8.89 : null);
  const items: { label: string; value: React.ReactNode; sub?: React.ReactNode; term?: string }[] = [];
  const { objects } = useCatalog();
  const facts = useStory(o.id).data?.facts ?? null;
  if (o.type === "star") {
    const rank = brightnessRank(o, objects);
    items.push(
      o.vary
        ? { label: "Magnitude", value: `${formatMag(o.vary[0])}–${formatMag(o.vary[1])}`, sub: o.vary[2] ? `varies over ${Math.round(o.vary[2]).toLocaleString()} days` : "varies", term: "variable-star" }
        : { label: "Magnitude", value: formatMag(o.mag), sub: rank ? `the ${ordinal(rank)}-brightest star` : "visual", term: "magnitude" },
    );
    if (o.sp) items.push({ label: "Spectral type", value: o.sp.length > 12 ? o.sp.split(/[+/]/)[0] : o.sp, sub: "its class", term: "spectral-type" });
    const word = colourWord(o.bv);
    if (word) items.push({ label: "Colour", value: word, sub: `B−V ${o.bv!.toFixed(2)} · ~${(Math.round(bvTemperature(o.bv!) / 100) * 100).toLocaleString()} K`, term: "star-colour" });
    if (facts?.r) items.push({ label: "Width", value: facts.r >= 1.05 ? `${solarMultiple(facts.r)}× Sun` : `${Math.round(facts.r * 100)}% of Sun`, sub: `${Math.round(2 * facts.r * 695_700).toLocaleString()} km` });
    if (facts?.mass) items.push({ label: "Mass", value: facts.mass >= 1.05 ? `${solarMultiple(facts.mass)}× Sun` : `${Math.round(facts.mass * 100)}% of Sun` });
  } else if (o.type === "double_star") {
    items.push({ label: "Magnitudes", value: `${formatMag(o.mag)} / ${formatMag(o.mag2)}`, sub: "primary / companion", term: "magnitude" });
    if (o.sep !== undefined) items.push({ label: "Separation", value: `${o.sep}″`, term: "separation" });
    if (o.pa !== undefined) items.push({ label: "Position angle", value: `${o.pa}°`, sub: "north through east", term: "position-angle" });
  } else {
    items.push({ label: "Magnitude", value: formatMag(o.mag), sub: o.magB ? "blue (B) magnitude" : "visual", term: "magnitude" });
    items.push({ label: "Size", value: formatAngleSize(o.size), sub: o.hubble ? `Hubble type ${o.hubble}` : undefined, term: "angular-size" });
    if (sbArcmin !== null && sbArcmin !== undefined && o.type !== "open_cluster" && o.type !== "asterism" && o.type !== "star_cloud")
      items.push({ label: "Surface brightness", value: `${sbArcmin.toFixed(1)}`, sub: o.sb !== undefined ? "mag/arcmin²" : "mag/arcmin², estimated", term: "surface-brightness" });
  }
  // How big it really is, from its angular size and distance.
  if (o.type !== "star" && o.type !== "double_star" && o.type !== "asterism" && facts?.d && o.size?.[0]) {
    const w = physicalSizeLy(o.size[0], facts.d);
    items.push({ label: "True size", value: `${w < 10 ? w.toFixed(1) : Math.round(w).toLocaleString()} ly`, sub: "light-years across" });
  }
  if (o.type === "double_star" && facts?.d && o.sep) {
    const au = o.sep * (facts.d / 3.26156);
    items.push({ label: "Real gap", value: `${au >= 1000 ? Number(au.toPrecision(2)).toLocaleString() : Math.round(au)} AU`, sub: "at least, between the stars" });
  }
  if (o.type !== "star" && facts?.mass) items.push({ label: "Mass", value: `${solarMultiple(facts.mass)} Suns` });
  items.push({ label: "Right ascension", value: formatRA(o.ra), sub: "J2000", term: "right-ascension" });
  items.push({ label: "Declination", value: formatDec(o.dec), sub: "J2000", term: "declination" });
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
  const phys = BODY_PHYSICS[id];
  const rr = phys ? phys.radiusKm / EARTH.radiusKm : null;
  const mr = phys ? phys.massKg / EARTH.massKg : null;
  const items: { label: string; value: React.ReactNode; sub?: React.ReactNode; term?: string }[] = [
    { label: "Magnitude", value: formatMag(st.mag), term: "magnitude" },
    { label: "Apparent size", value: isMoon ? `${(st.diameter / 60).toFixed(1)}′` : `${st.diameter.toFixed(st.diameter < 10 ? 1 : 0)}″`, term: "angular-size" },
    ...(phys && rr && mr
      ? [
          { label: "Diameter", value: `${Math.round(2 * phys.radiusKm).toLocaleString()} km`, sub: rr >= 1.05 ? `${+rr.toFixed(1)}× Earth` : `${Math.round(rr * 100)}% of Earth` },
          { label: "Mass", value: mr >= 1.05 ? `${Math.round(mr).toLocaleString()}× Earth` : `${+(mr * 100).toFixed(mr < 0.1 ? 1 : 0)}% of Earth` },
        ]
      : []),
    { label: "Illuminated", value: `${Math.round(st.illumination * 100)}%`, term: "phase" },
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

const arcText = (arcsec: number) => (arcsec < 60 ? `${Math.round(arcsec)}″` : `${(arcsec / 60).toFixed(arcsec < 600 ? 1 : 0)}′`);

/** A planet's moon: brightness and distance from the planet tonight, size, orbit and discovery. */
function MoonStats({ subject, tonight }: { subject: Extract<Subject, { kind: "satellite" }>; tonight: Tonight }) {
  const m = subject.meta;
  const st = tonight.body?.state;
  const sat = tonight.satellite;
  const apparent = st ? (2 * m.radiusKm) / (st.distanceAu * 149_597_870.7) * 206_264.8 : null;
  const period = m.periodDays < 2 ? `${(m.periodDays * 24).toFixed(1)} h` : `${m.periodDays.toFixed(m.periodDays < 10 ? 2 : 1)} days`;
  const items: { label: string; value: React.ReactNode; sub?: React.ReactNode }[] = [
    { label: "Magnitude", value: formatMag(sat?.mag ?? m.mag), sub: sat && !sat.typical ? "tonight" : "typical" },
    {
      label: `From ${subject.parent.name}`,
      value: sat && !sat.typical ? arcText(sat.sep) : "—",
      sub: st ? `at most ${arcText(maxElongation(m, st.distanceAu))}` : undefined,
    },
    { label: "Diameter", value: `${Math.round(m.radiusKm * 2).toLocaleString()} km`, sub: apparent !== null ? `${apparent.toFixed(apparent < 0.1 ? 3 : 2)}″ across` : undefined },
    { label: "Orbit", value: period, sub: `${Math.round(m.aKm).toLocaleString()} km out${m.retrograde ? ", backwards" : ""}` },
    ...(BODY_PHYSICS[subject.id]
      ? [
          {
            label: "Mass",
            value: (() => {
              const x = BODY_PHYSICS[subject.id].massKg / BODY_PHYSICS.moon.massKg;
              return x >= 1.05 ? `${+x.toFixed(1)}× our Moon` : x >= 0.01 ? `${Math.round(x * 100)}% of our Moon` : `1/${Number((1 / x).toPrecision(2)).toLocaleString()} of our Moon`;
            })(),
          },
        ]
      : []),
    { label: "Discovered", value: String(m.discovered.year), sub: m.discovered.by },
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
  const hint = nearestBrightStar(stars.data, o.ra, o.dec, 14, o.type === "star" ? o.mag : undefined);
  return (
    <p className="text-sm leading-relaxed text-muted-foreground">
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
    </p>
  );
}

/** Planets' moons: who found it, and that you find it by finding its planet. */
function SatelliteNote({ subject }: { subject: Extract<Subject, { kind: "satellite" }> }) {
  return (
    <p>
      It travels with{" "}
      <Link href={`/object/${subject.parent.id}`} className="link">
        {subject.parent.name}
      </Link>
      , so find the planet first — the sky chart and its page show where.
    </p>
  );
}

function SubjectPage({ subject }: { subject: Subject }) {
  usePageTitle(subject.name);
  const scope = useActiveScope();
  const { prefs } = usePrefs();
  const { ctx, now } = useNightContext(10);
  const aperture = scope.scope.aperture;

  // A planet with moons, or a moon: the moons through tonight (sunset to sunrise).
  const sysPlanet = systemPlanetOf(subject);
  const range = ctx ? ([ctx.night.sunset ?? ctx.night.noon, ctx.night.sunrise ?? ctx.night.nextNoon] as [number, number]) : null;
  const system = useMoonSystem(sysPlanet, range?.[0] ?? null, range?.[1] ?? null);

  const tonight = useMemo(
    () => (ctx ? tonightFor(subject, ctx, aperture, system, { instrument: scope.kind, power: scope.power }) : null),
    // Recompute when the night, sky, instrument or moon positions change — not every minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [subject, ctx?.frames, ctx?.sqm, ctx?.minAlt, (ctx ? siteKey(ctx.site) : null), aperture, scope.kind, scope.power, system],
  );

  const year = useMemo(() => {
    if (!ctx) return null;
    if (subject.kind === "deep") return yearAltitudes(ctx.site, now, { ra: subject.obj.ra, dec: subject.obj.dec });
    if (subject.kind === "body" && subject.id === "moon") return null;
    return yearAltitudes(ctx.site, now, { body: subject.kind === "satellite" ? subject.parent.body : subject.meta.body });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, (ctx ? siteKey(ctx.site) : null), Math.floor(now / 86_400_000)]);

  // Moons: how easy each is in this instrument at a given moment, and where the slider starts.
  const planetTrack = tonight?.body ?? null;
  const rateMoon = useMemo(() => {
    if (!ctx || !planetTrack) return undefined;
    const nf = ctx.frames;
    return (p: MoonPos, t: number) => {
      const alt = sampleAt(planetTrack.track, t)?.alt;
      if (alt === undefined || alt <= 0) return null;
      const i = frameIndex(nf, t);
      const mo = nf.moon[i];
      const st = planetTrack.state;
      return satelliteDetectability(p.mag ?? MOON_BY_ID[p.id].mag, separationOf(p), st.mag, planetTrack.meta.name, {
        sqmZenith: ctx.sqm,
        apertureMm: aperture,
        alt: Math.max(alt, 1),
        moon: mo ? { alt: mo.alt, phaseAngle: nf.moonPhaseAngle, separation: separation(st.raJ2000, st.decJ2000, mo.ra, mo.dec) } : null,
        sunAlt: nf.sunAlt[i] ?? null,
      });
    };
  }, [ctx, planetTrack, aperture]);
  const altAt = useMemo(() => (planetTrack ? (t: number) => sampleAt(planetTrack.track, t)?.alt ?? null : undefined), [planetTrack]);
  const startAt = useMemo(() => {
    if (!range) return 0;
    return now >= range[0] && now <= range[1] ? now : (planetTrack?.peakTime ?? range[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.[0], planetTrack?.peakTime]);

  // Pre-fill for the journal: the eyepiece AstroPilot recommends — only from the user's own kit on their own telescope.
  const suggestion = useMemo(() => {
    if (!tonight || scope.source !== "gear") return { telescopeId: scope.telescopeId };
    const { target, sizeArcmin } = opticsTarget(subject, tonight);
    const best = rankEyepieces(scope.scope, scope.eyepieces, scope.barlows, target, { sizeArcmin, corrector: scope.corrector })[0];
    return {
      telescopeId: scope.telescopeId,
      eyepieceId: best?.eyepiece.id ?? null,
      // The log has one slot for a Barlow or corrector: the Barlow if one's used, else the corrector that's always in.
      barlowId: best?.barlow?.id ?? scope.corrector?.id ?? null,
      magnification: best ? Math.round(best.setup.magnification) : null,
    };
  }, [subject, tonight, scope.source, scope.scope, scope.eyepieces, scope.barlows, scope.corrector, scope.telescopeId]);

  const typeLabel = subject.kind === "satellite" ? `Moon of ${subject.parent.name}` : (TYPE_LABEL[subject.type] ?? subject.type);
  const conAbbr = subject.kind === "deep" ? subject.obj.con : tonight?.body?.state.constellation;
  const designations =
    subject.kind === "deep"
      ? subject.obj.designations
          .filter((d) => d.replace(/\s/g, "") !== subject.name.replace(/\s/g, ""))
          // A star's catalogue numbers (HR, HD, HIP) find it in search but crowd the header.
          .filter((d) => subject.obj.type !== "star" || !/^(HR|HD|HIP) \d/.test(d))
      : subject.kind === "satellite"
        ? [subject.meta.designation]
        : [];
  const circumpolar = ctx && subject.kind === "deep" && horizonClass(ctx.site.lat, subject.obj.dec) === "circumpolar";
  const isStar = subject.kind === "deep" && subject.obj.type === "star";
  const hasPhoto = isStar || photoOf(subject.id, subject.kind === "deep" ? subject.obj : null) !== null;

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <BackLink />
        <ShareObject id={subject.id} name={subject.name} className="-mr-2 text-muted-foreground" />
      </div>

      {/* ------------------------------------------------------------ header */}
      {/* Phones: title, photo, actions, figures. Wider: the photo sits beside the title and actions. */}
      <header className={cn("mt-3 grid grid-cols-1 gap-5", hasPhoto && "lg:grid-cols-[minmax(0,1fr)_16rem] lg:grid-rows-[auto_1fr] lg:gap-x-10")}>
        <div className="flex items-start gap-4 lg:col-start-1 lg:row-start-1">
          <div className="hidden h-14 w-14 shrink-0 animate-zoom-fade place-items-center rounded-2xl border bg-surface-2/60 text-foreground/85 sm:grid">
            {subject.kind === "body" && subject.id === "moon" && ctx ? (
              <MoonGlyph elongation={ctx.night.moon.elongation} size={40} southern={ctx.site.lat < 0} />
            ) : (
              <TypeGlyph type={subject.type} id={subject.kind === "satellite" ? subject.parent.id : subject.id} className={subject.kind !== "deep" ? "h-8 w-8 text-gold" : "h-8 w-8"} />
            )}
          </div>
          <div className="min-w-0 animate-rise">
            <div className="eyebrow">
              {TYPE_TERM[subject.type] ? <Term slug={TYPE_TERM[subject.type]}>{typeLabel}</Term> : typeLabel}
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
            <StoryHook id={subject.id} />
          </div>
        </div>
        {hasPhoto &&
          (isStar && subject.kind === "deep" ? (
            <StarPortrait name={subject.name} bv={subject.obj.bv} sp={subject.obj.sp} mag={subject.obj.mag} className="mx-auto w-full max-w-[24rem] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-w-none" />
          ) : (
            <ObjectPhoto subject={subject} className="mx-auto w-full max-w-[24rem] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-w-none" />
          ))}
        <div className="flex flex-col gap-5 lg:col-start-1 lg:row-start-2 lg:self-start">
          <CountsToward obj={subject.kind === "deep" ? subject.obj : { id: subject.id, type: subject.type }} />
          <ObjectActions refId={subject.id} name={subject.name} suggestion={suggestion} />
        </div>
        <div className="border-t pt-5 lg:col-span-full">
          {subject.kind === "deep" ? (
            <DeepStats o={subject.obj} />
          ) : subject.kind === "satellite" ? (
            tonight ? <MoonStats subject={subject} tonight={tonight} /> : <Skel className="h-12 w-full" />
          ) : tonight?.body ? (
            <BodyStats id={subject.id} st={tonight.body.state} />
          ) : (
            <Skel className="h-12 w-full" />
          )}
        </div>
      </header>

      {!ctx ? (
        <>
          <NoSite className="mt-8" title={`See when ${subject.name} is up from where you are`} />
          <Section title={`About ${subject.name}`} className="mt-10 scroll-mt-20" id="about">
            <AboutSection subject={subject} eyepieceNote={subject.kind === "satellite" ? <SatelliteNote subject={subject} /> : undefined} />
          </Section>
        </>
      ) : (
        <>
          <InstrumentBar scope={scope} ctx={ctx} className="mt-8" />
          <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
            <div className="flex min-w-0 flex-col gap-10">
              <Section title={`Tonight from ${ctx.site.name}`} description={formatNightDate(ctx.night.date, "long")}>
                {tonight ? <TonightSection subject={subject} tonight={tonight} ctx={ctx} scope={scope} /> : <Skel className="h-64" />}
              </Section>
              {system && tonight?.body && range && (
                <Section
                  title={subject.kind === "satellite" ? "Where to find it" : "Moons"}
                  description={
                    subject.kind === "satellite"
                      ? `${subject.name} beside ${subject.parent.name} tonight — slide through the night, or press play.`
                      : `Where ${subject.name}'s moons are tonight — slide through the night, or press play.`
                  }
                >
                  <MoonSystemPanel
                    system={system}
                    planet={{ ...tonight.body.state, id: tonight.body.id, name: tonight.body.meta.name }}
                    range={range}
                    initial={startAt}
                    now={now}
                    tz={ctx.tz}
                    hour12={ctx.hour12}
                    highlight={subject.kind === "satellite" ? subject.id : undefined}
                    rate={rateMoon}
                    altAt={altAt}
                  />
                </Section>
              )}
              <Section title="How to observe it" description={`With ${instrumentPhrase(scope)}`}>
                {tonight && <ObserveSection key={`${subject.id}|${scope.telescopeId ?? scope.presetId}`} subject={subject} tonight={tonight} ctx={ctx} scope={scope} moonsAt={system?.at ?? null} />}
                <OpticsFootnote scope={scope} />
              </Section>
              <Section title={`About ${subject.name}`} id="about" className="scroll-mt-20">
                <AboutSection
                  subject={subject}
                  bodyDistanceAu={subject.kind !== "deep" ? (tonight?.body?.state.distanceAu ?? null) : null}
                  tz={ctx.tz}
                  hour12={ctx.hour12}
                  eyepieceNote={subject.kind === "satellite" ? <SatelliteNote subject={subject} /> : undefined}
                />
              </Section>
            </div>

            <aside className="flex min-w-0 flex-col gap-10">
              {year && year.some((m) => m.alt > 0) && (
                <Section title="Through the year" description="Highest altitude 22:00–02:00 local solar time, mid-month">
                  <YearStrip months={year} minAlt={ctx.minAlt} />
                  {circumpolar && <p className="text-xs text-muted-foreground">Circumpolar from {ctx.site.name}: it never sets.</p>}
                </Section>
              )}
              {subject.kind === "deep" && (
                <Section title="Finding it">
                  <FinderText o={subject.obj} />
                </Section>
              )}
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
