import { useMemo } from "react";
import { Link } from "wouter";
import { SOLAR_SYSTEM, bodyState, bodyEvents, formatTime, formatMag, compassPoint, type NightInfo } from "@shared/astro";
import type { ObservingSite } from "@shared/api";
import { TypeGlyph, MoonGlyph } from "@/components/common/Glyphs";
import { cn } from "@/lib/utils";

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
export function PlanetsTonight({ night, site, tz, hour12 }: { night: NightInfo; site: ObservingSite; tz?: string; hour12?: boolean }) {
  const rows = useMemo(() => {
    const start = night.civilDusk ?? night.sunset ?? night.noon + 6 * 3.6e6;
    const end = night.civilDawn ?? night.sunrise ?? night.nextNoon - 6 * 3.6e6;
    const out: Row[] = [];
    for (const p of SOLAR_SYSTEM) {
      if (p.id === "moon") continue;
      let bestAlt = -90;
      let bestTime: number | null = null;
      for (let t = start; t <= end; t += 20 * 60_000) {
        const s = bodyState(p.id, t, site);
        if (s.alt > bestAlt) {
          bestAlt = s.alt;
          bestTime = t;
        }
      }
      const mid = bestTime ?? night.solarMidnight;
      const st = bodyState(p.id, mid, site);
      const ev = bodyEvents(p.id, night.noon, site);
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
  const fmt = (t: number | null) => formatTime(t, { tz, hour12 });
  const visible = rows.filter((r) => r.upInDark);
  const hidden = rows.filter((r) => !r.upInDark);

  return (
    <div className="flex flex-col">
      {visible.map((r) => (
        <Link key={r.id} href={`/object/${r.id}`} className="group flex items-center gap-3 border-b py-2.5 last:border-b-0 hover:bg-accent/40">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: `${r.color}22`, color: r.color }}>
            <TypeGlyph type="planet" className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="font-medium">{r.name}</span>
              <span className="num text-xs text-muted-foreground">mag {formatMag(r.mag)} · {r.diameter.toFixed(r.diameter < 10 ? 1 : 0)}″</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Highest {Math.round(r.bestAlt)}° at {fmt(r.bestTime)}
              {r.rise && r.rise > (night.sunset ?? 0) && r.rise < night.nextNoon ? ` · rises ${fmt(r.rise)}` : ""}
              {r.set && r.set > (night.sunset ?? 0) && r.set < night.nextNoon ? ` · sets ${fmt(r.set)}` : ""}
            </div>
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

export function MoonPanel({ night, site, tz, hour12, now }: { night: NightInfo; site: ObservingSite; tz?: string; hour12?: boolean; now: number }) {
  const m = night.moon;
  const st = bodyState("moon", Math.max(now, night.sunset ?? now), site);
  const fmt = (t: number | null) => formatTime(t, { tz, hour12 });
  const tip =
    m.illumination > 0.85
      ? "Bright Moon: enjoy the Moon itself, planets, double stars and bright clusters. Faint galaxies will struggle."
      : m.illumination < 0.2
        ? "Dark skies: ideal for galaxies, nebulae and the Milky Way."
        : m.waxing
          ? "The terminator shows dramatic shadows on crater walls — great Moon viewing in the evening."
          : "Rises late: the evening stays dark for deep-sky objects.";
  return (
    <Link href="/object/moon" className="flex gap-4 rounded-xl p-1 hover:bg-accent/40">
      <MoonGlyph elongation={m.elongation} size={64} className="shrink-0" />
      <div className="min-w-0">
        <div className="font-medium">
          {m.phaseName} <span className="num text-sm text-muted-foreground">· {Math.round(m.illumination * 100)}% lit · {m.ageDays.toFixed(1)} days</span>
        </div>
        <div className="num mt-0.5 text-xs text-muted-foreground">
          {m.rise ? `Rises ${fmt(m.rise)}` : "No rise"} · {m.set ? `sets ${fmt(m.set)}` : "no set"} · now {st.alt > 0 ? `${Math.round(st.alt)}° ${compassPoint(st.az)}` : "below horizon"}
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">{tip}</p>
      </div>
    </Link>
  );
}

export function cnTone(score: number) {
  return cn(score >= 62 ? "text-q-good" : score >= 42 ? "text-q-fair" : "text-q-poor");
}
