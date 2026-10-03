/** Upcoming sky events: Moon phases, meteor showers, oppositions, elongations, eclipses, conjunctions, seasons. */
import { A, DAY_MS, Site, separation } from "./core";
import { moonQuarters } from "./night";
import { planetaryEvents, SOLAR_SYSTEM } from "./planets";

export interface SkyEvent {
  id: string;
  time: number;
  kind: "moon" | "meteor" | "opposition" | "elongation" | "eclipse" | "conjunction" | "season";
  title: string;
  detail: string;
  importance: 1 | 2 | 3; // 3 = major
}

/** IMO working list of major showers: peak (solar longitude converted to typical date), ZHR, radiant. */
export const METEOR_SHOWERS = [
  { id: "qua", name: "Quadrantids", peak: [1, 3], zhr: 110, radiant: [15.33, 49.5], parent: "2003 EH1", note: "Sharp peak lasting only a few hours" },
  { id: "lyr", name: "Lyrids", peak: [4, 22], zhr: 18, radiant: [18.07, 34], parent: "C/1861 G1 Thatcher", note: "Occasional bright fireballs" },
  { id: "eta", name: "Eta Aquariids", peak: [5, 6], zhr: 50, radiant: [22.33, -1], parent: "1P/Halley", note: "Best from the southern hemisphere, before dawn" },
  { id: "sda", name: "Southern Delta Aquariids", peak: [7, 30], zhr: 25, radiant: [22.67, -16], parent: "96P/Machholz", note: "Broad peak; best from southern latitudes" },
  { id: "per", name: "Perseids", peak: [8, 12], zhr: 100, radiant: [3.2, 58], parent: "109P/Swift–Tuttle", note: "The year's most popular shower; fast and bright" },
  { id: "dra", name: "Draconids", peak: [10, 8], zhr: 10, radiant: [17.47, 54], parent: "21P/Giacobini–Zinner", note: "Best in the evening; occasional outbursts" },
  { id: "ori", name: "Orionids", peak: [10, 21], zhr: 20, radiant: [6.33, 16], parent: "1P/Halley", note: "Fast meteors, best after midnight" },
  { id: "sta", name: "Southern Taurids", peak: [10, 10], zhr: 5, radiant: [2.13, 9], parent: "2P/Encke", note: "Slow, with frequent fireballs" },
  { id: "nta", name: "Northern Taurids", peak: [11, 12], zhr: 5, radiant: [3.87, 22], parent: "2P/Encke", note: "Slow, with frequent fireballs" },
  { id: "leo", name: "Leonids", peak: [11, 17], zhr: 15, radiant: [10.27, 22], parent: "55P/Tempel–Tuttle", note: "Very fast meteors, after midnight" },
  { id: "gem", name: "Geminids", peak: [12, 14], zhr: 150, radiant: [7.47, 33], parent: "3200 Phaethon", note: "The richest shower of the year; good from evening on" },
  { id: "urs", name: "Ursids", peak: [12, 22], zhr: 10, radiant: [14.47, 75], parent: "8P/Tuttle", note: "Modest rates near the winter solstice" },
] as const;

function meteorEvents(fromMs: number, days: number): SkyEvent[] {
  const out: SkyEvent[] = [];
  const end = fromMs + days * DAY_MS;
  const y0 = new Date(fromMs).getUTCFullYear();
  for (const year of [y0, y0 + 1]) {
    for (const s of METEOR_SHOWERS) {
      const t = Date.UTC(year, s.peak[0] - 1, s.peak[1], 0, 0);
      if (t + DAY_MS >= fromMs && t < end) {
        const moonFrac = A.Illumination(A.Body.Moon, new Date(t)).phase_fraction;
        const moonNote = moonFrac > 0.6 ? `a bright ${Math.round(moonFrac * 100)}% Moon will wash out faint meteors` : moonFrac < 0.25 ? "dark, moonless skies" : `Moon ${Math.round(moonFrac * 100)}% lit`;
        out.push({
          id: `meteor-${s.id}-${year}`,
          time: t,
          kind: "meteor",
          title: `${s.name} peak`,
          detail: `Up to ~${s.zhr} meteors/hour under ideal skies; ${s.note}; ${moonNote}.`,
          importance: s.zhr >= 50 ? 3 : 2,
        });
      }
    }
  }
  return out;
}

function eclipseEvents(fromMs: number, days: number, site?: Site): SkyEvent[] {
  const out: SkyEvent[] = [];
  const end = fromMs + days * DAY_MS;
  let le = A.SearchLunarEclipse(new Date(fromMs));
  while (le.peak.date.getTime() < end) {
    const t = le.peak.date.getTime();
    let vis = "";
    if (site) {
      const mo = A.Horizon(le.peak.date, new A.Observer(site.lat, site.lon, 0), A.Equator(A.Body.Moon, le.peak.date, new A.Observer(site.lat, site.lon, 0), true, true).ra, A.Equator(A.Body.Moon, le.peak.date, new A.Observer(site.lat, site.lon, 0), true, true).dec, "normal");
      vis = mo.altitude > 0 ? " — visible from your location" : " — Moon below your horizon at maximum";
    }
    out.push({ id: `le-${t}`, time: t, kind: "eclipse", title: `${cap(le.kind)} lunar eclipse`, detail: `Maximum eclipse${vis}.`, importance: le.kind === "total" ? 3 : 2 });
    le = A.NextLunarEclipse(le.peak);
  }
  let se = A.SearchGlobalSolarEclipse(new Date(fromMs));
  while (se.peak.date.getTime() < end) {
    const t = se.peak.date.getTime();
    let detail = "Somewhere on Earth.";
    if (site) {
      const local = A.SearchLocalSolarEclipse(new Date(t - 2 * DAY_MS), new A.Observer(site.lat, site.lon, 0));
      if (Math.abs(local.peak.time.date.getTime() - t) < 2 * DAY_MS && local.peak.altitude > 0)
        detail = `Visible from your location as a ${local.kind} eclipse (${Math.round(local.obscuration * 100)}% of the Sun covered). Never look without certified solar filters.`;
      else detail = "Not visible from your location.";
    }
    out.push({ id: `se-${t}`, time: t, kind: "eclipse", title: `${cap(se.kind)} solar eclipse`, detail, importance: 2 });
    se = A.NextGlobalSolarEclipse(se.peak);
  }
  return out;
}

function conjunctionEvents(fromMs: number, days: number): SkyEvent[] {
  // Moon–planet and planet–planet close approaches (< 3° and < 1.5°), sampled hourly around daily minima.
  const out: SkyEvent[] = [];
  const bodies = SOLAR_SYSTEM.filter((b) => ["moon", "venus", "mars", "jupiter", "saturn", "mercury"].includes(b.id));
  const geo = new A.Observer(0, 0, 0);
  const pos = (b: A.Body, t: number) => {
    const eq = A.Equator(b, new Date(t), geo, false, true);
    return [eq.ra, eq.dec] as const;
  };
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      const limit = a.id === "moon" || b.id === "moon" ? 3 : 1.5;
      const step = a.id === "moon" || b.id === "moon" ? 3 * 3_600_000 : DAY_MS / 2;
      let prev = Infinity, prev2 = Infinity;
      for (let t = fromMs; t < fromMs + days * DAY_MS; t += step) {
        const [r1, d1] = pos(a.body, t);
        const [r2, d2] = pos(b.body, t);
        const sep = separation(r1, d1, r2, d2);
        if (prev < prev2 && prev < sep && prev < limit) {
          const tt = t - step;
          const elong = A.AngleFromSun(a.id === "moon" ? b.body : a.body, new Date(tt));
          if (elong > 15) {
            out.push({
              id: `conj-${a.id}-${b.id}-${Math.round(tt / DAY_MS)}`,
              time: tt,
              kind: "conjunction",
              title: `${a.name} and ${b.name} ${prev < 1 ? "very close" : "close together"}`,
              detail: `${prev.toFixed(1)}° apart — a lovely naked-eye pairing${prev < 1 ? " that fits in a low-power field" : ""}.`,
              importance: prev < 1 ? 3 : 2,
            });
          }
        }
        prev2 = prev;
        prev = sep;
      }
    }
  }
  return out;
}

function seasonEvents(fromMs: number, days: number): SkyEvent[] {
  const out: SkyEvent[] = [];
  const end = fromMs + days * DAY_MS;
  const y = new Date(fromMs).getUTCFullYear();
  for (const year of [y, y + 1]) {
    const s = A.Seasons(year);
    const list: [A.AstroTime, string][] = [
      [s.mar_equinox, "March equinox"],
      [s.jun_solstice, "June solstice"],
      [s.sep_equinox, "September equinox"],
      [s.dec_solstice, "December solstice"],
    ];
    for (const [t, name] of list) {
      const ms = t.date.getTime();
      if (ms >= fromMs && ms < end) out.push({ id: `season-${ms}`, time: ms, kind: "season", title: name, detail: "Start of an astronomical season.", importance: 1 });
    }
  }
  return out;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function upcomingEvents(fromMs: number, days = 45, site?: Site): SkyEvent[] {
  const moon: SkyEvent[] = moonQuarters(fromMs, days).map((q) => ({
    id: `moon-${q.time}`,
    time: q.time,
    kind: "moon",
    title: q.name,
    detail:
      q.quarter === 0
        ? "Darkest skies of the month — prime time for galaxies and nebulae."
        : q.quarter === 2
          ? "Moonlight washes out faint objects all night; enjoy the Moon, planets and double stars."
          : q.quarter === 1
            ? "Evening Moon; the terminator shows dramatic crater shadows. Deep-sky after moonset."
            : "Morning Moon; evenings stay dark for deep-sky observing.",
    importance: q.quarter === 0 || q.quarter === 2 ? 2 : 1,
  }));
  const planets: SkyEvent[] = planetaryEvents(fromMs, days).map((e) => ({
    id: `${e.kind}-${e.body}-${e.time}`,
    time: e.time,
    kind: e.kind === "opposition" ? "opposition" : "elongation",
    title: e.kind === "opposition" ? `${cap(e.body)} at opposition` : `${cap(e.body)} at greatest elongation`,
    detail: e.detail,
    importance: e.kind === "opposition" && ["mars", "jupiter", "saturn"].includes(e.body) ? 3 : 2,
  }));
  return [...moon, ...meteorEvents(fromMs, days), ...planets, ...eclipseEvents(fromMs, days, site), ...conjunctionEvents(fromMs, days), ...seasonEvents(fromMs, days)]
    .filter((e) => e.time >= fromMs - DAY_MS)
    .sort((a, b) => a.time - b.time);
}
