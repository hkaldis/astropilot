import { useMemo } from "react";
import { Link } from "wouter";
import { SOLAR_SYSTEM, bodyAltAz, bodyState, bodyEvents, moonPosition, observerOf, formatTime, formatMag, compassPoint, type NightFrames, type NightInfo } from "@shared/astro";
import type { ObservingSite } from "@shared/api";
import { TypeGlyph, MoonGlyph } from "@/components/common/Glyphs";
import { cn } from "@/lib/utils";
import { stagger } from "@/lib/motion";
import { capitalize, joinNightEvents, moonEvents, moonEventsText, nightClock, nightSpan, type NightEvent } from "./useTonight";

interface Row {
  id: string;
  name: string;
  mag: number;
  diameter: number;
  rise: number | null;
  set: number | null;
  transit: number | null;
  transitAlt: number | null;
  bestAlt: number;
  bestTime: number | null;
  upInDark: boolean;
  constellation: string;
  illumination: number;
  color: string;
}

/** Planets visible during this night with when and how high. */
export function PlanetsTonight({ night, site, tz, hour12, isTonight, now }: { night: NightInfo; site: ObservingSite; tz?: string; hour12?: boolean; isTonight: boolean; now: number }) {
  const rows = useMemo(() => {
    // Planets show from the end of civil twilight (sunset on white nights); never under the midnight sun.
    const start = night.civilDusk ?? night.sunset ?? (night.sunNeverSets ? null : night.noon);
    const end = night.civilDawn ?? night.sunrise ?? (night.sunNeverSets ? null : night.nextNoon);
    const obs = observerOf(site);
    const step = 20 * 60_000;
    const out: Row[] = [];
    for (const p of SOLAR_SYSTEM) {
      if (p.id === "moon") continue;
      let bestAlt = -90;
      let bestTime: number | null = null;
      if (start !== null && end !== null && end > start) {
        for (let t = start; ; t = Math.min(t + step, end)) {
          const alt = bodyAltAz(p.body, t, obs).alt;
          if (alt > bestAlt) {
            bestAlt = alt;
            bestTime = t;
          }
          if (t >= end) break;
        }
      }
      const ev = bodyEvents(p.id, night.noon, site);
      // The exact transit when it happens in the window (the samples are 20 min apart).
      if (start !== null && end !== null && ev.transit !== null && ev.transitAlt !== null && ev.transit >= start && ev.transit <= end && ev.transitAlt >= bestAlt - 0.5) {
        bestAlt = ev.transitAlt;
        bestTime = ev.transit;
      }
      const mid = bestTime ?? night.solarMidnight;
      const st = bodyState(p.id, mid, site);
      out.push({
        id: p.id,
        name: p.name,
        mag: st.mag,
        diameter: st.diameter,
        rise: ev.rise,
        set: ev.set,
        transit: ev.transit,
        transitAlt: ev.transitAlt,
        bestAlt,
        bestTime,
        upInDark: bestAlt > 8,
        constellation: st.constellation,
        illumination: st.illumination,
        color: p.color,
      });
    }
    return out.sort((a, b) => Number(b.upInDark) - Number(a.upInDark) || a.mag - b.mag);
  }, [night, site]);
  const clock = nightClock(night, isTonight, now, tz, hour12);
  // Rise, highest and set during the night, in time order.
  const when = (r: Row) => {
    const ev: NightEvent[] = [];
    if (r.rise !== null) ev.push({ t: r.rise, verb: "rises" });
    if (r.bestTime !== null) ev.push({ t: r.bestTime, verb: `highest ${Math.round(r.bestAlt)}°`, at: true });
    if (r.set !== null) ev.push({ t: r.set, verb: "sets" });
    return capitalize(joinNightEvents(ev, night, clock));
  };
  const visible = rows.filter((r) => r.upInDark);
  const hidden = rows.filter((r) => !r.upInDark);

  if (night.sunNeverSets) return <p className="py-3 text-sm text-muted-foreground">The Sun doesn't set this night: the planets are lost in the daylit sky.</p>;
  return (
    <div className="flex flex-col">
      {visible.map((r, i) => (
        <Link key={r.id} href={`/object/${r.id}`} className="group flex animate-rise items-center gap-3 border-b py-2.5 last:border-b-0 hover:bg-accent/40" style={stagger(i, 50)}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: `${r.color}22`, color: r.color }}>
            <TypeGlyph type="planet" id={r.id} className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="font-medium">{r.name}</span>
              <span className="num text-xs text-muted-foreground">mag {formatMag(r.mag)} · {r.diameter.toFixed(r.diameter < 10 ? 1 : 0)}″</span>
            </div>
            <div className="text-xs text-muted-foreground">{when(r)}</div>
          </div>
        </Link>
      ))}
      {visible.length === 0 && <p className="py-3 text-sm text-muted-foreground">No bright planets are well placed this night.</p>}
      {hidden.length > 0 && (
        <p className="pt-2 text-xs text-muted-foreground">
          Not up in darkness: {hidden.map((h) => h.name).join(", ")}
        </p>
      )}
    </div>
  );
}

/** Advice for the Moon's light, from when it is actually up during this night's dark hours. */
function moonTip(night: NightInfo, moonUp: boolean): string {
  const lit = night.moon.illumination;
  if (!night.darkStart || !night.darkEnd || night.darkHours <= 0) {
    if (night.sunNeverSets) return moonUp ? "The Sun doesn't set: the Moon is the one sight in the daylit sky." : "The Sun doesn't set: the sky stays bright all night.";
    return moonUp ? "The sky never gets properly dark: enjoy the Moon and the brightest planets." : "The sky never gets properly dark: only the brightest planets and stars show through the twilight.";
  }
  const upHours = night.darkHours - night.moonFreeHours;
  if (upHours < 0.2) return "Dark skies: the Moon stays below the horizon while it's dark — ideal for galaxies, nebulae and the Milky Way.";
  if (lit < 0.2) return "Dark skies: the thin crescent adds little light — ideal for galaxies, nebulae and the Milky Way.";
  if (night.moonFreeHours < 1) {
    const span = night.moonFreeHours < 0.2 ? "all night" : "most of the night";
    return lit > 0.6
      ? `Bright Moon ${span}: enjoy the Moon itself, planets, double stars and bright clusters. Faint galaxies will struggle.`
      : `The Moon is up ${span}: favour bright clusters, double stars, planets and the Moon itself.`;
  }
  const w = night.moonFreeWindows;
  const near = (x: number, y: number) => Math.abs(x - y) < 10 * 60_000;
  const darkFirst = near(w[0][0], night.darkStart);
  const darkLast = near(w[w.length - 1][1], night.darkEnd);
  if (darkFirst && !darkLast) return "Rises late: the evening stays dark for deep-sky objects.";
  if (darkLast && !darkFirst) {
    return lit < 0.6
      ? "The terminator shows dramatic shadows on crater walls in the evening; deep-sky objects after moonset."
      : "Bright Moon in the evening; the sky is dark for deep-sky objects after it sets.";
  }
  return "The Moon is down for part of the night: save that window for faint objects.";
}

export function MoonPanel({
  night,
  frames,
  site,
  tz,
  hour12,
  now,
  isTonight,
}: {
  night: NightInfo;
  frames: NightFrames;
  site: ObservingSite;
  tz?: string;
  hour12?: boolean;
  now: number;
  isTonight: boolean;
}) {
  const m = night.moon;
  const fmt = (t: number | null) => formatTime(t, { tz, hour12 });
  const clock = nightClock(night, isTonight, now, tz, hour12);
  // Only the current night has a live position; otherwise describe the Moon at dusk.
  const [a, b] = nightSpan(night);
  const live = isTonight && now >= a && now <= b;
  const dusk = night.civilDusk ?? night.sunset;
  const ref = live ? now : (dusk ?? night.solarMidnight);
  const pos = moonPosition(ref, site);
  const moonUp = !moonEvents(night, frames).downAllNight;
  const where = pos.alt <= 0 ? "below the horizon" : pos.alt < 1 ? `on the ${compassPoint(pos.az)} horizon` : `${Math.round(pos.alt)}° ${compassPoint(pos.az)}`;
  const position = !moonUp ? null : live ? `now ${where}` : pos.alt > 0 ? `${where} ${dusk ? "at dusk" : `at ${fmt(ref)}`}` : null;
  const events = capitalize(moonEventsText(night, frames, clock));
  return (
    <Link href="/object/moon" className="flex gap-4 rounded-xl p-1 hover:bg-accent/40">
      {/* Moonlight: a soft halo that breathes, as bright as the Moon is full. */}
      <span className="relative grid shrink-0 place-items-center">
        <span
          className="absolute inset-[-14px] animate-breathe rounded-full"
          style={{ background: `radial-gradient(circle, rgba(239, 230, 207, ${(0.08 + 0.3 * m.illumination).toFixed(2)}) 35%, transparent 70%)` }}
          aria-hidden="true"
        />
        <MoonGlyph elongation={m.elongation} size={64} className="relative" southern={site.lat < 0} />
      </span>
      <div className="min-w-0">
        <div className="font-medium">
          {m.phaseName}{" "}
          <span className="text-muted-foreground" title={`At ${fmt(night.solarMidnight)}, the middle of the night`}>
            <span className="whitespace-nowrap">
              <span className="num text-sm">· {Math.round(m.illumination * 100)}% lit</span> <span className="text-2xs font-normal">at midnight</span>
            </span>{" "}
            <span className="num whitespace-nowrap text-sm">· {m.ageDays.toFixed(1)} days</span>
          </span>
        </div>
        <div className="num mt-0.5 text-xs text-muted-foreground">{position ? `${events} · ${position}` : events}</div>
        <p className="mt-1.5 text-sm text-muted-foreground">{moonTip(night, moonUp)}</p>
      </div>
    </Link>
  );
}

export function cnTone(score: number) {
  return cn(score >= 62 ? "text-q-good" : score >= 42 ? "text-q-fair" : "text-q-poor");
}
