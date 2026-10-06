import { useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Eye,
  Grid3x3,
  Mountain,
  Orbit,
  Plus,
  Star,
  Telescope,
  Type,
  Waves,
  Waypoints,
  X,
} from "lucide-react";
import {
  A,
  HOUR_MS,
  MOON_BY_ID,
  PLANET_BY_ID,
  compassPoint,
  formatAngleSize,
  formatDate,
  formatMag,
  formatNightDate,
  formatTime,
  maxElongation,
  moonPhaseName,
  moonsOf,
  objectTrack,
  observerOf,
  separationOf,
  type MoonPos,
  type NightFrames,
  type NightInfo,
  type ObjectTrack,
  type Site,
} from "@shared/astro";
import { TypeGlyph } from "@/components/common/Glyphs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { bodyTrack } from "@/features/explore/sky";
import { horizonClass } from "@/features/object/model";
import { useMoonSystem } from "@/features/moons/useMoonSystem";
import { angleText, direction } from "@/features/moons/where";
import type { Scene } from "./engine";
import { conName, positionOf, type SkyObject } from "./objects";
import type { Layers } from "./render";
import { nightSpan } from "./TimeBar";

// ---------------------------------------------------------------------------------------------
// Glyphs for kinds TypeGlyph doesn't cover
// ---------------------------------------------------------------------------------------------

export function SkyGlyph({ glyph, className, id }: { glyph: string; className?: string; id?: string }) {
  const c = cn("h-5 w-5 shrink-0", className);
  if (glyph === "star")
    return (
      <svg viewBox="0 0 24 24" className={c} aria-hidden="true">
        <circle cx="12" cy="12" r="3.2" fill="currentColor" />
        <circle cx="12" cy="12" r="7" fill="currentColor" opacity="0.15" />
      </svg>
    );
  if (glyph === "sun")
    return (
      <svg viewBox="0 0 24 24" className={c} aria-hidden="true">
        <circle cx="12" cy="12" r="4.5" fill="currentColor" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <line key={a} x1={12 + 7 * Math.cos((a * Math.PI) / 180)} y1={12 + 7 * Math.sin((a * Math.PI) / 180)} x2={12 + 9.5 * Math.cos((a * Math.PI) / 180)} y2={12 + 9.5 * Math.sin((a * Math.PI) / 180)} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        ))}
      </svg>
    );
  if (glyph === "constellation")
    return (
      <svg viewBox="0 0 24 24" className={c} aria-hidden="true">
        <path d="M4 17 9 9l6 4 5-8" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.6" />
        {[[4, 17], [9, 9], [15, 13], [20, 5]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i === 1 ? 2 : 1.5} fill="currentColor" />
        ))}
      </svg>
    );
  return <TypeGlyph type={glyph} id={id} className={className} />;
}

// ---------------------------------------------------------------------------------------------
// Info panel
// ---------------------------------------------------------------------------------------------

interface InfoProps {
  obj: SkyObject;
  scene: Scene;
  night: NightInfo;
  frames: () => NightFrames;
  site: Site;
  tz?: string;
  hour12: boolean;
  isTarget: boolean;
  canSaveTarget: boolean;
  signedIn: boolean;
  savingTarget: boolean;
  onSaveTarget: () => void;
  onCentre: () => void;
  onClose: () => void;
  className?: string;
}

function Fact({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="eyebrow">{label}</div>
      <div className="num mt-0.5 truncate text-sm">{value}</div>
      {sub && <div className="num truncate text-2xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

const ms = (x: A.AstroTime | null | undefined) => (x ? x.date.getTime() : null);

/**
 * The rise and set that frame the night being viewed (`start`–`end`, sunset to sunrise): the rise before or
 * during it and the set after that — not simply the first of each after noon, which can be that afternoon's set.
 * Null when the body neither rises nor sets around then (circumpolar, or never up).
 */
function riseSetAround(body: A.Body, obs: A.Observer, start: number, end: number) {
  const from = new Date(start);
  const prevRise = ms(A.SearchRiseSet(body, obs, +1, from, -1.1));
  const prevSet = ms(A.SearchRiseSet(body, obs, -1, from, -1.1));
  const nextRise = ms(A.SearchRiseSet(body, obs, +1, from, 1.1));
  if (prevRise === null && prevSet === null && nextRise === null) return null;
  const upAtStart = prevRise !== null && (prevSet === null || prevRise > prevSet);
  const rise = upAtStart ? prevRise : nextRise;
  const set = rise === null ? null : ms(A.SearchRiseSet(body, obs, -1, new Date(Math.max(start, rise)), 1.1));
  return { rise, set, upTonight: upAtStart || (rise !== null && rise < end) };
}

interface SkyEvents {
  note: string | null;
  /** False: the note says it all (never rises, not up tonight). */
  grid: boolean;
  rise: number | null;
  set: number | null;
  high: number | null;
  highAlt: number | null;
  /** Lower culmination, for circumpolar objects. */
  low: { t: number; alt: number } | null;
}

/** A catalog object's or star's position as a user-defined astronomy-engine body, for rise/set searches. */
const FIXED_STAR = A.Body.Star1;

/** Rise, highest point and set of a chart object around the night being viewed. */
function chartEvents(obj: SkyObject, night: NightInfo, nf: NightFrames, site: Site): SkyEvents | null {
  if (obj.bodyId === "sun" || obj.kind === "con") return null;
  const [start, end] = nightSpan(night);
  const none = { rise: null, set: null, high: null, highAlt: null, low: null };
  let body: A.Body;
  let track: ObjectTrack;
  let cls: ReturnType<typeof horizonClass> = "normal";
  if (obj.bodyId) {
    body = PLANET_BY_ID[obj.bodyId].body;
    track = bodyTrack(obj.bodyId, nf, site, 0);
  } else {
    if (obj.ra === undefined || obj.dec === undefined) return null;
    cls = horizonClass(site.lat, obj.dec);
    if (cls === "never-rises") return { note: "Never rises from here", grid: false, ...none };
    A.DefineStar(FIXED_STAR, ((obj.ra % 24) + 24) % 24, obj.dec, 1000);
    body = FIXED_STAR;
    track = objectTrack(obj.ra, obj.dec, nf, 0);
  }
  const obs = observerOf(site);
  const rs = cls === "circumpolar" ? null : riseSetAround(body, obs, start, end);
  const upAtStart = (track.points.find((x) => x.t >= start) ?? track.points[0])?.alt > 0;
  if (!rs && !upAtStart && cls !== "circumpolar") return { note: "Doesn't rise tonight", grid: false, ...none };
  if (rs && !rs.upTonight) return { note: "Not up tonight — it's only above the horizon in daylight", grid: false, ...none };

  // Highest: the transit as every page samples it when that falls in the night (so times agree), else the exact one.
  const from = new Date(rs?.rise ?? night.solarMidnight - 12 * HOUR_MS);
  const exact = A.SearchHourAngle(body, obs, 0, from, +1);
  const exactT = exact.time.date.getTime();
  const sampled = track.transitTime;
  const high = sampled !== null && sampled >= start && sampled <= end && Math.abs(sampled - exactT) < 30 * 60_000 ? sampled : exactT;

  if (!rs) {
    // Circumpolar (or, near the poles, a body that doesn't set today): highest and lowest instead of rise and set.
    const lower = A.SearchHourAngle(body, obs, 12, new Date(night.solarMidnight - 12 * HOUR_MS), +1);
    return {
      note: obj.bodyId ? "Above the horizon all day" : "Circumpolar from here — it never sets",
      grid: true,
      rise: null,
      set: null,
      high,
      highAlt: exact.hor.altitude,
      low: { t: lower.time.date.getTime(), alt: lower.hor.altitude },
    };
  }
  const allNight = rs.rise !== null && rs.rise <= start && (rs.set === null || rs.set >= end);
  return { note: allNight ? "Up all night" : null, grid: true, rise: rs.rise, set: rs.set, high, highAlt: exact.hor.altitude, low: null };
}

export function InfoPanel(p: InfoProps) {
  const { obj, scene, night, site, tz, hour12 } = p;
  // On phones the card floats over the chart, so the extra detail is one tap away.
  const [more, setMore] = useState(false);
  const fmt = (t: number | null | undefined) => formatTime(t ?? null, { tz, hour12 });
  const pos = positionOf(obj, scene);
  const body = obj.bodyId && obj.bodyId !== "sun" ? scene.bodies.find((b) => b.id === obj.bodyId) : undefined;
  // A planet's moon is shown at its planet; where it sits next to it at the chart's time (Jupiter's computed
  // here, the others' from JPL Horizons), over the whole day so any time on the bar is covered.
  const moon = obj.moonId ? MOON_BY_ID[obj.moonId] : null;
  const system = useMoonSystem(moon ? moon.parent : null, night.noon, night.nextNoon);
  const moonPos = moon ? (system?.at(scene.t)?.find((x) => x.id === moon.id) ?? null) : null;

  // Rise / highest / set around tonight.
  const events = useMemo(
    () => chartEvents(obj, night, p.frames(), site),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obj.ref, night, site.lat, site.lon],
  );
  // Times outside the night (sunset → sunrise) on another day get their weekday underneath ("10:04", "Tue").
  const [nightStart, nightEnd] = nightSpan(night);
  const evening = formatNightDate(night.date, "weekday");
  const inNight = (t: number | null) => t !== null && t >= nightStart && t <= nightEnd;
  const dayHint = (t: number | null) => {
    if (t === null || inNight(t)) return null;
    const wd = formatDate(t, { tz, style: "weekday" });
    return wd === evening ? null : wd;
  };
  const daylight = (t: number | null) => [dayHint(t), "in daylight"].filter(Boolean).join(" · ");

  const up = pos ? pos.alt > 0 : false;
  const desc = obj.dso?.desc ?? moon?.blurb ?? (obj.bodyId && obj.bodyId !== "sun" ? PLANET_BY_ID[obj.bodyId].blurb : null);
  const page = obj.dso?.id ?? obj.moonId ?? (obj.bodyId !== "sun" ? obj.bodyId : undefined);

  const facts: { label: string; value: ReactNode }[] = [];
  if (moon && body) {
    facts.push({ label: "Magnitude", value: formatMag(moonPos?.mag ?? moon.mag) });
    facts.push({ label: "Orbits in", value: moon.periodDays < 2 ? `${Math.round(moon.periodDays * 24)} hours` : `${moon.periodDays.toFixed(1)} days` });
    facts.push({ label: "Found", value: String(moon.discovered.year) });
    facts.push({ label: "In", value: conName(body.constellation) });
  } else if (body) {
    facts.push({ label: "Magnitude", value: formatMag(body.mag) });
    facts.push({ label: body.id === "moon" ? "Size" : "Disk", value: body.id === "moon" ? `${(body.diameter / 60).toFixed(1)}′` : `${body.diameter.toFixed(1)}″` });
    if (["moon", "mercury", "venus", "mars"].includes(body.id)) facts.push({ label: "Lit", value: `${Math.round(body.illumination * 100)}%` });
    facts.push({ label: "In", value: conName(body.constellation) });
  } else if (obj.kind !== "con" && obj.bodyId !== "sun") {
    if (obj.mag !== undefined && obj.mag !== null) facts.push({ label: "Magnitude", value: formatMag(obj.mag) });
    if (obj.dso?.size) facts.push({ label: "Size", value: formatAngleSize(obj.dso.size) });
    if (obj.dso?.sep) facts.push({ label: "Separation", value: `${obj.dso.sep.toFixed(1)}″` });
    if (obj.con) facts.push({ label: "Constellation", value: conName(obj.con) });
  }

  return (
    <section className={cn("panel flex flex-col gap-4 p-4 shadow-lg lg:shadow-none", p.className)} aria-label={`${obj.name} details`}>
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold/10 text-gold">
          <SkyGlyph glyph={obj.glyph} id={obj.bodyId} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold leading-tight">{obj.name}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {obj.bodyId === "moon" ? `${moonPhaseName(scene.moonElongation)} Moon` : obj.sub}
            {obj.dso && obj.dso.m && !/^M ?\d/.test(obj.name) ? ` · M${obj.dso.m}` : ""}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={p.onClose} aria-label="Close details" className="-mr-1 -mt-1">
          <X />
        </Button>
      </div>

      {pos && (
        <div className="flex items-center gap-3 rounded-lg bg-surface-2/70 px-3 py-2.5">
          <AltGauge alt={pos.alt} />
          <div className="min-w-0 text-sm">
            {up ? (
              <>
                <span className="num font-semibold">{Math.round(pos.alt)}°</span> up, towards the{" "}
                <span className="font-semibold">{compassPoint(pos.az)}</span>{" "}
                <span className="num text-muted-foreground">({Math.round(pos.az)}°)</span>
                {pos.alt < 15 && <div className="text-xs text-muted-foreground">Low — trees, buildings and haze may hide it.</div>}
              </>
            ) : (
              <>
                <span className="font-semibold">Below the horizon</span>
                <span className="text-muted-foreground"> · under the {compassPoint(pos.az)}</span>
                {events?.rise && events.rise > scene.t && (
                  <div className="text-xs text-muted-foreground">
                    Rises at {fmt(events.rise)}
                    {dayHint(events.rise) ? ` (${dayHint(events.rise)})` : ""}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {moon && body && (
        <p className="text-sm">
          <MoonWhere pos={moonPos} planet={body.name} loading={system?.status === "loading"} maxArcsec={maxElongation(moon, body.distanceAu)} />
        </p>
      )}

      {obj.bodyId === "sun" ? (
        <div className="grid grid-cols-3 gap-3">
          <Fact label="Sunset" value={fmt(night.sunset)} />
          <Fact label="Dark from" value={night.darkStart ? fmt(night.darkStart) : "—"} />
          <Fact label="Sunrise" value={fmt(night.sunrise)} />
        </div>
      ) : (
        events && (
          <div className="flex flex-col gap-2">
            {events.note && <p className="text-sm text-muted-foreground">{events.note}</p>}
            {events.grid && (
              <div className="grid grid-cols-3 gap-3">
                {events.low ? null : <Fact label="Rises" value={fmt(events.rise)} sub={dayHint(events.rise)} />}
                <Fact
                  label="Highest"
                  value={fmt(events.high)}
                  sub={events.high === null ? null : inNight(events.high) ? `${Math.round(events.highAlt ?? 0)}°` : daylight(events.high)}
                />
                {events.low ? (
                  <Fact label="Lowest" value={fmt(events.low.t)} sub={[`${Math.round(events.low.alt)}°`, dayHint(events.low.t)].filter(Boolean).join(" · ")} />
                ) : (
                  <Fact label="Sets" value={fmt(events.set)} sub={dayHint(events.set)} />
                )}
              </div>
            )}
          </div>
        )
      )}

      {obj.bodyId === "sun" && (
        <p className="flex gap-2 rounded-lg border border-q-bad/40 bg-q-bad/10 p-2.5 text-xs text-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0 text-q-bad" />
          Never point binoculars or a telescope at the Sun without a certified solar filter over the front.
        </p>
      )}

      {(facts.length > 0 || desc) && (
        <div className={cn("flex-col gap-4", more ? "flex" : "hidden lg:flex")}>
          {facts.length > 0 && (
            <div className="grid grid-cols-3 gap-3 border-t pt-3 lg:grid-cols-2">
              {facts.map((f) => (
                <Fact key={f.label} label={f.label} value={f.value} />
              ))}
            </div>
          )}
          {desc && <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(facts.length > 0 || desc) && (
          <Button variant="ghost" size="sm" className="h-9 lg:hidden" onClick={() => setMore((m) => !m)} aria-expanded={more}>
            {more ? <ChevronUp /> : <ChevronDown />} {more ? "Less" : "More"}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={p.onCentre} className="h-9">
          <Crosshair /> Centre
        </Button>
        {page && (
          <Button asChild variant="outline" size="sm" className="h-9">
            <Link href={`/object/${encodeURIComponent(page)}`}>
              Object page <ArrowRight />
            </Link>
          </Button>
        )}
        {p.canSaveTarget &&
          (p.signedIn ? (
            p.isTarget ? (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-gold">
                <Check className="h-4 w-4" /> In your targets
              </span>
            ) : (
              <Button variant="subtle" size="sm" className="h-9" onClick={p.onSaveTarget} disabled={p.savingTarget}>
                <Plus /> Add to targets
              </Button>
            )
          ) : (
            <Link href="/register" className="link inline-flex h-9 items-center text-xs">
              Sign up to save targets
            </Link>
          ))}
      </div>
    </section>
  );
}

/** Where a planet's moon is next to its planet at the chart's time, or how far it strays when that isn't known. */
function MoonWhere({ pos, planet, loading, maxArcsec }: { pos: MoonPos | null; planet: string; loading: boolean; maxArcsec: number }) {
  if (!pos) return <span className="text-muted-foreground">{loading ? `Finding it next to ${planet}…` : `Within ${angleText(maxArcsec)} of ${planet}.`}</span>;
  if (pos.occulted) return <>Hidden behind {planet} at this time.</>;
  if (pos.eclipse === "total") return <>In {planet}'s shadow at this time — it can't be seen.</>;
  if (pos.transit) return <>Crossing in front of {planet}'s disk.</>;
  return (
    <>
      <span className="num font-semibold">{angleText(separationOf(pos))}</span> {direction(pos.dx, pos.dy)} of {planet}
      {pos.eclipse === "partial" ? ", partly eclipsed" : ""}
      <span className="text-muted-foreground"> — look next to the planet.</span>
    </>
  );
}

/** Tiny quarter-circle altitude gauge: horizon → zenith. */
function AltGauge({ alt }: { alt: number }) {
  const a = Math.max(-10, Math.min(90, alt));
  const rad = (a * Math.PI) / 180;
  const x = 4 + 30 * Math.cos(rad);
  const y = 34 - 30 * Math.sin(rad);
  return (
    <svg viewBox="0 0 40 38" className="h-9 w-10 shrink-0" aria-hidden="true">
      <path d="M4 34 H36" stroke="hsl(var(--muted-foreground))" strokeWidth="1.2" opacity="0.6" />
      <path d="M34 34 A30 30 0 0 0 4 4" fill="none" stroke="hsl(var(--border))" strokeWidth="1.2" />
      <line x1="4" y1="34" x2={x} y2={y} stroke={alt > 0 ? "hsl(var(--gold))" : "hsl(var(--muted-foreground))"} strokeWidth="1.6" strokeLinecap="round" strokeDasharray={alt > 0 ? undefined : "2 2"} />
      <circle cx={x} cy={y} r="2.6" fill={alt > 0 ? "hsl(var(--gold))" : "hsl(var(--muted-foreground))"} />
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------
// The Moon, the planets and their moons now
// ---------------------------------------------------------------------------------------------

export function UpNow({
  scene,
  night,
  site,
  tz,
  hour12,
  selected,
  onPick,
}: {
  scene: Scene;
  night: NightInfo;
  site: Site;
  tz?: string;
  hour12: boolean;
  selected: string | null;
  onPick: (ref: string) => void;
}) {
  const [nightStart, nightEnd] = nightSpan(night);
  // The rise and set that frame this night (a set that afternoon, before dark, doesn't count).
  const events = useMemo(() => {
    const obs = observerOf(site);
    const m = new Map<string, { rise: number | null; set: number | null } | null>();
    for (const b of scene.bodies) m.set(b.id, riseSetAround(PLANET_BY_ID[b.id].body, obs, nightStart, nightEnd));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [night.noon, site.lat, site.lon]);
  const belowText = (id: string) => {
    const ev = events.get(id);
    if (ev?.rise && ev.rise > scene.t && ev.rise < nightEnd) return `rises ${formatTime(ev.rise, { tz, hour12 })}`;
    if (ev?.set && ev.set < scene.t && ev.set > nightStart) return `set ${formatTime(ev.set, { tz, hour12 })}`;
    return "not up tonight";
  };
  const list = [...scene.bodies].sort((a, b) => (a.alt > 0) === (b.alt > 0) ? b.alt - a.alt : a.alt > 0 ? -1 : 1);
  return (
    <section className="flex flex-col gap-2" aria-labelledby="sky-upnow">
      <h2 id="sky-upnow" className="eyebrow">
        Planets & moons at {formatTime(scene.t, { tz, hour12 })}
      </h2>
      <ul className="flex flex-col">
        {list.map((b) => {
          const up = b.alt > 0;
          const ref = `body:${b.id}`;
          // A planet that's up lists its moons, brightest first (each is selected at its planet).
          const moons = up ? moonsOf(b.id).sort((x, y) => x.mag - y.mag) : [];
          return (
            <li key={b.id}>
              <button
                onClick={() => onPick(ref)}
                className={cn(
                  "flex min-h-10 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                  selected === ref && "bg-accent",
                  !up && "text-muted-foreground",
                )}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-foreground/20" style={{ background: up ? b.color : "transparent" }} aria-hidden="true" />
                <span className="flex-1 truncate">
                  {b.name}
                  {b.id === "moon" && <span className="text-muted-foreground"> · {Math.round(b.illumination * 100)}%</span>}
                </span>
                <span className="num text-xs">
                  {up ? (
                    <>
                      {Math.round(b.alt)}° <span className="text-muted-foreground">{compassPoint(b.az)}</span>
                    </>
                  ) : (
                    belowText(b.id)
                  )}
                </span>
              </button>
              {moons.length > 0 && (
                <div className="flex flex-wrap gap-x-0.5 pb-1 pl-6 text-xs" role="group" aria-label={`Moons of ${b.name}`}>
                  {moons.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => onPick(`moon:${m.id}`)}
                      className={cn(
                        "min-h-7 rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                        selected === `moon:${m.id}` && "bg-accent text-foreground",
                      )}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------------------------

const LEGEND: { label: string; svg: ReactNode }[] = [
  { label: "Galaxy", svg: <ellipse cx="12" cy="12" rx="8" ry="4" transform="rotate(-26 12 12)" fill="currentColor" fillOpacity="0.1" stroke="currentColor" /> },
  {
    label: "Globular cluster",
    svg: (
      <>
        <circle cx="12" cy="12" r="6.5" fill="currentColor" fillOpacity="0.1" stroke="currentColor" />
        <path d="M5.5 12h13M12 5.5v13" stroke="currentColor" />
      </>
    ),
  },
  { label: "Open cluster", svg: <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeDasharray="1.2 2.2" strokeLinecap="round" /> },
  { label: "Nebula", svg: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" fillOpacity="0.1" stroke="currentColor" /> },
  {
    label: "Planetary nebula",
    svg: (
      <>
        <circle cx="12" cy="12" r="3.8" fill="currentColor" fillOpacity="0.1" stroke="currentColor" />
        <path d="M15.8 12h3.4M4.8 12h3.4M12 15.8v3.4M12 4.8v3.4" stroke="currentColor" />
      </>
    ),
  },
  {
    label: "Double star",
    svg: (
      <>
        <circle cx="12" cy="12" r="2.2" fill="currentColor" />
        <path d="M5 12h14" stroke="currentColor" />
      </>
    ),
  },
];

export function Legend() {
  return (
    <section aria-labelledby="sky-legend" className="flex flex-col gap-2">
      <h2 id="sky-legend" className="eyebrow">
        Deep-sky symbols
      </h2>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        {LEGEND.map((l) => (
          <li key={l.label} className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-primary" strokeWidth="1.2" aria-hidden="true">
              {l.svg}
            </svg>
            {l.label}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-gold" aria-hidden="true">
            <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2.5 2.5" />
          </svg>
          Your target
        </li>
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Layer chips
// ---------------------------------------------------------------------------------------------

const CHIPS: { key: keyof Layers; label: string; icon: typeof Star }[] = [
  { key: "stars", label: "Stars", icon: Star },
  { key: "constellations", label: "Constellations", icon: Waypoints },
  { key: "names", label: "Star names", icon: Type },
  { key: "planets", label: "Planets & moons", icon: Orbit },
  { key: "dso", label: "Deep sky", icon: Telescope },
  { key: "milkyWay", label: "Milky Way", icon: Waves },
  { key: "targets", label: "My targets", icon: Eye },
  { key: "grid", label: "Alt/az grid", icon: Grid3x3 },
  { key: "ground", label: "Ground", icon: Mountain },
];

export function LayerChips({ layers, onToggle, showTargets }: { layers: Layers; onToggle: (k: keyof Layers) => void; showTargets: boolean }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0" role="group" aria-label="Chart layers">
      <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
        {CHIPS.filter((c) => c.key !== "targets" || showTargets).map(({ key, label, icon: Icon }) => {
          const on = layers[key];
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(key)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-primary/40 bg-primary/10 text-foreground" : "bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", on ? "text-primary" : "text-muted-foreground")} />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
