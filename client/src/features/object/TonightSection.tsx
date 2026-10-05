import { useMemo } from "react";
import { Compass, Moon as MoonIcon, Gauge, Orbit } from "lucide-react";
import { formatDate, formatNightDate, formatTime, moonQuarters, surfaceBrightnessArcsec } from "@shared/astro";
import { AltitudeChart, twilightBands, type AltitudeSeries } from "@/components/charts/AltitudeChart";
import { MoonGlyph } from "@/components/common/Glyphs";
import { ToneDot } from "@/components/common/Page";
import { Badge } from "@/components/ui/badge";
import { DIFFICULTY_TONE } from "@/lib/objects";
import { instrumentPhrase, type ActiveScopeState } from "@/features/explore/InstrumentBar";
import { moonPoints, sampleAt, type NightContext } from "@/features/explore/sky";
import { verdictFor, whereToLook, type Subject, type Tonight } from "./model";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const arcText = (arcsec: number) => (arcsec < 60 ? `${Math.round(arcsec)}″` : `${(arcsec / 60).toFixed(arcsec < 600 ? 1 : 0)}′`);
const DIRS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
const dirWord = (dx: number, dy: number) => DIRS[Math.round((((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360) / 45) % 8];

function Fact({ icon, title, children }: { icon: React.ReactNode; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 gap-3">
      <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-muted-foreground">{icon}</div>
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-0.5 text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export function TonightSection({ subject, tonight, ctx, scope }: { subject: Subject; tonight: Tonight; ctx: NightContext; scope: ActiveScopeState }) {
  const tf = { tz: ctx.tz, hour12: ctx.hour12 };
  const night = ctx.night;
  const nf = ctx.frames;
  const isMoon = subject.kind === "body" && subject.id === "moon";
  // Planets and their moons are observed from twilight, along the planet's real motion.
  const bodyLike = subject.kind !== "deep";
  const verdict = verdictFor(tonight, ctx, {
    dec: subject.kind === "deep" ? subject.obj.dec : undefined,
    isBody: bodyLike,
    elongation: bodyLike && !isMoon ? tonight.body?.state.elongation : undefined,
  });
  const tr = tonight.track;

  const start = night.sunset ?? nf.times[0];
  const end = night.sunrise ?? nf.times[nf.times.length - 1];
  const bands = useMemo(() => twilightBands(night, start, end), [night, start, end]);
  const series = useMemo(() => {
    const s: AltitudeSeries[] = [{ id: subject.id, label: subject.name, points: tonight.points, variant: "primary" }];
    if (!isMoon) s.push({ id: "moon", label: `Moon ${Math.round(nf.moonIllumination * 100)}%`, points: moonPoints(nf), variant: "moon" });
    return s;
  }, [subject, tonight.points, isMoon, nf]);

  // Moon impact at the best time (deep-sky objects and faint planets).
  const moonAlt = tr.moonAltAtBest;
  const moonSep = tr.moonSepAtBest;
  const bestStr = formatTime(tonight.bestTime, tf);
  const delta = tonight.skyNoMoon !== null && tonight.skyWithMoon !== null ? tonight.skyNoMoon - tonight.skyWithMoon : null;
  const moonFree = useMemo(() => {
    const w = tr.window;
    if (!w) return null;
    for (const [a, b] of night.moonFreeWindows) {
      const s = Math.max(a, w[0]);
      const e = Math.min(b, w[1]);
      if (e - s > 30 * 60_000) return [s, e] as [number, number];
    }
    return null;
  }, [tr.window, night.moonFreeWindows]);

  const scopeWord = scope.kind === "eye" ? "to the naked eye" : `with ${instrumentPhrase(scope)}`;
  const skyWord =
    ctx.sqmSource === "measured"
      ? `an SQM ${ctx.sqm.toFixed(1)} sky`
      : ctx.sqmSource === "atlas"
        ? `an SQM ≈${ctx.sqm.toFixed(1)} sky (estimated from the light-pollution atlas)`
        : `a Bortle ${ctx.bortle} sky`;
  const sbArcsec = subject.kind === "deep" ? surfaceBrightnessArcsec(subject.obj) : null;
  // Catalog notes may already end with a full stop.
  const note = tonight.detect?.note ? (/[.!?]$/.test(tonight.detect.note) ? tonight.detect.note : `${tonight.detect.note}.`) : "";

  // Where to look at the best time.
  const bestAlt = tonight.bestAlt ?? tr.maxAlt;
  const look = tonight.bestTime !== null && tonight.bestAz !== null && tr.maxAlt > 0 ? whereToLook(bestAlt, tonight.bestAz) : null;
  const nextPhase = useMemo(() => (isMoon ? (moonQuarters(ctx.now, 30)[0] ?? null) : null), [isMoon, Math.floor(ctx.now / 3_600_000)]);
  // Moonlight and sky brightness only matter for faint things (deep sky, Uranus, Neptune, planets' moons).
  const faint = subject.kind === "deep" || (subject.kind === "satellite" ? (tonight.satellite?.mag ?? 99) : (tonight.body?.state.mag ?? -5)) > 5;

  // Rise / highest / set, restricted to tonight (sunset → sunrise) and in time order.
  const bodyEvents = (() => {
    const ev = tonight.body?.events;
    if (!ev) return "";
    const a = night.sunset ?? start;
    const b = night.sunrise ?? end;
    const inNight = (x: number | null) => x !== null && x >= a && x <= b;
    // The highest moment as sampled for the whole page (the chart's peak, "At …" above), not a separate search.
    const high = tr.transitTime !== null && inNight(tr.transitTime) ? tr.transitTime : ev.transit;
    const list: [number, string][] = [];
    if (inNight(ev.rise)) list.push([ev.rise!, `rises ${formatTime(ev.rise, tf)}`]);
    if (inNight(high) && (ev.transitAlt ?? 0) > 0) list.push([high!, `highest ${formatTime(high, tf)} (${Math.round(ev.transitAlt!)}°)`]);
    if (inNight(ev.set)) list.push([ev.set!, `sets ${formatTime(ev.set, tf)}`]);
    list.sort((x, y) => x[0] - y[0]);
    const upAt = (t: number) => (sampleAt(tr, t)?.alt ?? -1) > 0;
    const upAtDusk = !inNight(ev.rise) && upAt(a);
    const upAtDawn = !inNight(ev.set) && upAt(b);
    let text = list.map((x) => x[1]).join(" · ");
    if (upAtDusk && upAtDawn) text = list.length ? `up all night · ${text}` : "up all night";
    else if (!list.length) text = "not up tonight";
    else if (upAtDawn) text += " · up until sunrise";
    else if (upAtDusk) text = "up at sunset · " + text;
    return text.charAt(0).toUpperCase() + text.slice(1) + ".";
  })();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <ToneDot tone={verdict.tone} className="mt-2.5 h-2.5 w-2.5 shrink-0" />
        <div>
          <p className="text-lg font-medium leading-snug">{verdict.headline}</p>
          <p className="mt-0.5 text-[0.95rem] text-muted-foreground">{verdict.detail}</p>
        </div>
      </div>

      {tr.maxAlt > -2 && (
        <AltitudeChart
          start={start}
          end={end}
          series={series}
          bands={bands}
          minAlt={ctx.minAlt}
          now={ctx.now}
          highlight={tr.window}
          highlightLabel={bodyLike ? "observable" : "best window"}
          peak={tonight.peakTime !== null && tr.maxAlt >= 3 ? { t: tonight.peakTime, alt: tr.maxAlt } : null}
          tz={ctx.tz}
          hour12={ctx.hour12}
          ariaLabel={`Altitude of ${subject.name} through the night of ${formatNightDate(night.date, "long")}. ${verdict.detail}`}
          height={230}
        />
      )}

      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        {/* Difficulty */}
        {!isMoon && tonight.detect && !tr.neverUp && tr.maxAlt > 0 && (
          <Fact
            icon={<Gauge className="h-3.5 w-3.5" />}
            title={
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant={DIFFICULTY_TONE[tonight.detect.difficulty] ?? "outline"}>{cap(tonight.detect.difficulty)}</Badge>
                <span className="font-normal text-muted-foreground">{scopeWord}</span>
              </span>
            }
          >
            {note || (subject.kind === "body" ? "Bright enough that only altitude and steady air matter." : "")}{" "}
            {faint && (
              <span className="mt-1 block text-2xs">
                Based on {skyWord}: the sky at the object is <span className="num">{tonight.detect.skySB.toFixed(1)}</span> mag/arcsec² at its best
                altitude
                {tr.moonAltAtBest !== null && tr.moonAltAtBest > 0 ? " (moonlight included)" : ""}
                {sbArcsec !== null && (
                  <>
                    ; its mean surface brightness is <span className="num">{sbArcsec.toFixed(1)}</span> mag/arcsec²
                  </>
                )}
                ; stars to mag <span className="num">{tonight.detect.limitingMag.toFixed(1)}</span> show{" "}
                {scope.kind === "eye" ? "to the naked eye" : scope.kind === "binoculars" ? "in these binoculars" : "in this scope"}.
              </span>
            )}
          </Fact>
        )}

        {/* Moon */}
        {isMoon ? (
          <Fact icon={<MoonGlyph elongation={night.moon.elongation} size={18} southern={ctx.site.lat < 0} />} title={`${night.moon.phaseName} · ${Math.round(night.moon.illumination * 100)}% lit`}>
            Age <span className="num">{night.moon.ageDays.toFixed(1)}</span> days ({night.moon.waxing ? "waxing" : "waning"}).
            {nextPhase && (
              <>
                {" "}
                {nextPhase.name} on <span className="text-foreground">{formatDate(nextPhase.time, { tz: ctx.tz, style: "long" })}</span>
                {nextPhase.quarter === 0 ? " — the darkest nights of the month for deep-sky objects." : "."}
              </>
            )}
          </Fact>
        ) : (
          tr.maxAlt > 0 &&
          faint && (
            <Fact icon={<MoonIcon className="h-3.5 w-3.5" />} title={moonAlt !== null && moonAlt > 0 ? `Moon up at ${bestStr}` : `Moon down at ${bestStr}`}>
              {moonAlt !== null && moonAlt > 0 && moonSep !== null ? (
                <>
                  <span className="num">{Math.round(nf.moonIllumination * 100)}%</span> lit, <span className="num">{Math.round(moonAlt)}°</span> high and{" "}
                  <span className="num">{Math.round(moonSep)}°</span> away
                  {delta !== null && delta >= 0.05 ? (
                    <>
                      {" "}— brightens the sky here by <span className="num">{delta.toFixed(1)}</span> mag/arcsec²
                      {delta >= 1 ? ", washing out faint detail" : delta >= 0.4 ? ", a noticeable loss of contrast" : ", a small effect"}.
                    </>
                  ) : (
                    <> — little effect on the sky here.</>
                  )}
                  {moonFree && (
                    <span className="mt-1 block text-2xs">
                      Moon-free while it's up:{" "}
                      <span className="num">
                        {formatTime(moonFree[0], tf)}–{formatTime(moonFree[1], tf)}
                      </span>
                    </span>
                  )}
                </>
              ) : (
                <>No moonlight at its best time{night.moon.illumination > 0.3 ? ` (the ${Math.round(night.moon.illumination * 100)}% Moon is below the horizon)` : ""}.</>
              )}
            </Fact>
          )
        )}

        {/* A moon: where it is relative to its planet */}
        {subject.kind === "satellite" &&
          tonight.satellite &&
          (() => {
            const sat = tonight.satellite;
            const atStr = formatTime(sat.at, tf);
            return (
              <Fact icon={<Orbit className="h-3.5 w-3.5" />} title={`Beside ${subject.parent.name}`}>
                {sat.typical || !sat.pos
                  ? `Usually within ${arcText(sat.sep * (Math.PI / 2))} of the planet${sat.loading ? " — working out tonight's position…" : "."}`
                  : sat.pos.occulted
                    ? `Hidden behind ${subject.parent.name} at ${atStr} — the slider below shows when it reappears.`
                    : sat.pos.transit
                      ? `In front of ${subject.parent.name}'s disk at ${atStr} — hard to pick out until it moves clear.`
                      : `${arcText(sat.sep)} ${dirWord(sat.pos.dx, sat.pos.dy)} of the planet at ${atStr}.`}
              </Fact>
            );
          })()}

        {/* Where to look / planet events */}
        {bodyLike && tonight.body ? (
          <Fact icon={<Compass className="h-3.5 w-3.5" />} title={look ? `At ${bestStr}: ${look}` : "Rise and set"}>
            {bodyEvents}
            {tonight.bestAz !== null && look && (
              <span className="mt-1 block text-2xs">
                Azimuth <span className="num">{Math.round(tonight.bestAz)}°</span>, altitude <span className="num">{Math.round(bestAlt)}°</span> at its best.
              </span>
            )}
          </Fact>
        ) : (
          look && (
            <Fact icon={<Compass className="h-3.5 w-3.5" />} title={`At ${bestStr}: ${look}`}>
              Azimuth <span className="num">{Math.round(tonight.bestAz!)}°</span>, altitude <span className="num">{Math.round(bestAlt)}°</span>
              {tr.hoursAboveMin > 0 && (
                <>
                  {" "}
                  · <span className="num">{tr.hoursAboveMin.toFixed(1)} h</span> above {ctx.minAlt}° in darkness
                </>
              )}
              .
            </Fact>
          )
        )}
      </div>
    </div>
  );
}
