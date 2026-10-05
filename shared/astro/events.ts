/** Upcoming sky events: Moon phases, meteor showers, oppositions, elongations, eclipses, conjunctions, seasons. */
import { A, DAY_MS, DEG, HOUR_MS, Site, altAzRaDec, bodyAltAz, observerOf } from "./core";
import { moonQuarters, nightDateOf, nightOf } from "./night";
import { planetaryEvents, SOLAR_SYSTEM } from "./planets";

export interface SkyEvent {
  id: string;
  time: number;
  kind: "moon" | "meteor" | "opposition" | "elongation" | "eclipse" | "conjunction" | "season";
  title: string;
  detail: string;
  importance: 1 | 2 | 3; // 3 = major
}

/**
 * IMO working list of major showers. `lambda` is the peak's solar longitude (J2000, IMO 2027 calendar);
 * `peak` is only the approximate calendar date used to start the search.
 */
export const METEOR_SHOWERS = [
  { id: "qua", name: "Quadrantids", lambda: 283.15, peak: [1, 4], zhr: 80, radiant: [15.33, 49.5], parent: "2003 EH1", note: "Sharp peak lasting only a few hours" },
  { id: "lyr", name: "Lyrids", lambda: 32.32, peak: [4, 22], zhr: 18, radiant: [18.07, 34], parent: "C/1861 G1 Thatcher", note: "Occasional bright fireballs" },
  { id: "eta", name: "Eta Aquariids", lambda: 45.5, peak: [5, 6], zhr: 50, radiant: [22.53, -1], parent: "1P/Halley", note: "Best from the southern hemisphere, before dawn" },
  { id: "sda", name: "Southern Delta Aquariids", lambda: 128, peak: [7, 31], zhr: 25, radiant: [22.67, -16], parent: "96P/Machholz", note: "Broad peak; best from southern latitudes" },
  { id: "per", name: "Perseids", lambda: 140.0, peak: [8, 13], zhr: 110, radiant: [3.2, 58], parent: "109P/Swift–Tuttle", note: "The year's most popular shower; fast and bright" },
  { id: "dra", name: "Draconids", lambda: 195.4, peak: [10, 8], zhr: 5, radiant: [17.47, 54], parent: "21P/Giacobini–Zinner", note: "Best in the evening; occasional outbursts" },
  { id: "ori", name: "Orionids", lambda: 208, peak: [10, 21], zhr: 20, radiant: [6.33, 16], parent: "1P/Halley", note: "Fast meteors, best after midnight" },
  { id: "sta", name: "Southern Taurids", lambda: 223, peak: [11, 5], zhr: 5, radiant: [3.47, 15], parent: "2P/Encke", note: "Slow, with frequent fireballs" },
  { id: "nta", name: "Northern Taurids", lambda: 230, peak: [11, 12], zhr: 5, radiant: [3.87, 22], parent: "2P/Encke", note: "Slow, with frequent fireballs" },
  { id: "leo", name: "Leonids", lambda: 235.27, peak: [11, 17], zhr: 15, radiant: [10.27, 22], parent: "55P/Tempel–Tuttle", note: "Very fast meteors, after midnight" },
  { id: "gem", name: "Geminids", lambda: 262.2, peak: [12, 14], zhr: 150, radiant: [7.47, 33], parent: "3200 Phaethon", note: "The richest shower of the year; good from evening on" },
  { id: "urs", name: "Ursids", lambda: 270.7, peak: [12, 22], zhr: 10, radiant: [14.47, 75], parent: "8P/Tuttle", note: "Modest rates near the winter solstice" },
] as const;

/** Peak instant of a shower in `year`: when the Sun reaches the shower's solar longitude (precessed to the date's equinox). */
export function meteorPeak(s: (typeof METEOR_SHOWERS)[number], year: number): number | null {
  const lonOfDate = (s.lambda + 0.01397 * (year - 2000)) % 360;
  const from = new Date(Date.UTC(year, s.peak[0] - 1, s.peak[1]) - 8 * DAY_MS);
  const hit = A.SearchSunLongitude(lonOfDate, from, 16);
  return hit ? hit.date.getTime() : null;
}

/** Highest altitude (deg) a shower's radiant reaches during the dark hours of the night around `t`. */
function radiantMaxAlt(s: (typeof METEOR_SHOWERS)[number], t: number, site: Site): number {
  const night = nightOf(nightDateOf(t, site), site);
  const from = night.darkStart ?? night.sunset ?? night.noon + 6 * HOUR_MS;
  const to = night.darkEnd ?? night.sunrise ?? night.nextNoon - 6 * HOUR_MS;
  let best = -90;
  for (let x = from; x <= to; x += HOUR_MS / 2) best = Math.max(best, altAzRaDec(s.radiant[0], s.radiant[1], x, site).alt);
  return best;
}

function meteorEvents(fromMs: number, days: number, site?: Site): SkyEvent[] {
  const out: SkyEvent[] = [];
  const end = fromMs + days * DAY_MS;
  const y0 = new Date(fromMs).getUTCFullYear();
  for (const year of [y0, y0 + 1]) {
    for (const s of METEOR_SHOWERS) {
      const t = meteorPeak(s, year);
      if (t === null || t + DAY_MS < fromMs || t >= end) continue;
      const moonFrac = A.Illumination(A.Body.Moon, new Date(t)).phase_fraction;
      const moonNote = moonFrac > 0.6 ? `a bright ${Math.round(moonFrac * 100)}% Moon will wash out faint meteors` : moonFrac < 0.25 ? "dark, moonless skies" : `Moon ${Math.round(moonFrac * 100)}% lit`;
      let importance: 1 | 2 | 3 = s.zhr >= 50 ? 3 : 2;
      let where = "";
      if (site) {
        // Rates scale with the radiant's altitude (∝ sin h): a radiant that stays low gives few meteors.
        const h = radiantMaxAlt(s, t, site);
        if (h < 5) {
          importance = 1;
          where = " From your latitude the radiant barely clears the horizon, so you'll see very few.";
        } else if (h < 25) {
          importance = Math.min(importance, 2) as 1 | 2;
          where = ` From your latitude the radiant only climbs to ${Math.round(h)}°, so expect roughly ${Math.max(1, Math.round(s.zhr * Math.sin(h * DEG)))} an hour at best.`;
        }
      }
      out.push({
        id: `meteor-${s.id}-${year}`,
        time: t,
        kind: "meteor",
        title: `${s.name} peak`,
        detail: `Up to ~${s.zhr} meteors an hour under ideal skies. ${s.note}. ${moonNote.charAt(0).toUpperCase()}${moonNote.slice(1)}.${where}`,
        importance,
      });
    }
  }
  return out;
}

const MIN = 60_000;
const altOf = (body: A.Body, ms: number, obs: A.Observer) => bodyAltAz(body, ms, obs).alt;

function eclipseEvents(fromMs: number, days: number, site?: Site): SkyEvent[] {
  const out: SkyEvent[] = [];
  const end = fromMs + days * DAY_MS;
  const obs = site ? observerOf(site) : null;
  let le = A.SearchLunarEclipse(new Date(fromMs));
  while (le.peak.date.getTime() < end) {
    const t = le.peak.date.getTime();
    let importance: 1 | 2 | 3 = le.kind === "total" ? 3 : le.kind === "partial" ? 2 : 1;
    let detail = le.kind === "penumbral" ? "A subtle darkening of part of the Moon; easy to miss." : "Maximum eclipse at the time shown.";
    if (obs) {
      // Judge visibility across the whole umbral phase (penumbral phase for penumbral eclipses), not just at maximum.
      const half = (le.kind === "penumbral" ? le.sd_penum : le.sd_partial) * MIN;
      const step = 5 * MIN;
      let up = 0;
      let n = 0;
      let firstUp: number | null = null;
      let lastUp: number | null = null;
      for (let x = t - half; x <= t + half; x += step, n++) {
        if (altOf(A.Body.Moon, x, obs) > 0 && altOf(A.Body.Sun, x, obs) < -0.833) {
          up++;
          firstUp ??= x;
          lastUp = x;
        }
      }
      let totalVisible = false;
      if (le.kind === "total")
        for (let x = t - le.sd_total * MIN; x <= t + le.sd_total * MIN && !totalVisible; x += step)
          totalVisible = altOf(A.Body.Moon, x, obs) > 0 && altOf(A.Body.Sun, x, obs) < -0.833;
      if (up === 0) {
        detail = "Not visible from your location: the Moon is below your horizon throughout.";
        importance = 1;
      } else if (up >= n - 1) detail = `Visible from your location from start to finish${le.kind === "total" ? ", totality included" : ""}.`;
      else {
        const rises = firstUp !== null && firstUp > t - half + step;
        detail = `Partly visible from your location: the Moon ${rises ? "rises" : "sets"} during the eclipse${le.kind === "total" ? (totalVisible ? ", with at least part of totality in view" : ", outside totality") : ""}.`;
        if (lastUp !== null && importance === 3 && !totalVisible) importance = 2;
      }
    }
    out.push({ id: `le-${t}`, time: t, kind: "eclipse", title: `${cap(le.kind)} lunar eclipse`, detail, importance });
    le = A.NextLunarEclipse(le.peak);
  }
  let se = A.SearchGlobalSolarEclipse(new Date(fromMs));
  while (se.peak.date.getTime() < end) {
    const t = se.peak.date.getTime();
    let detail = "Visible only from part of the Earth.";
    let importance: 1 | 2 | 3 = 2;
    if (obs) {
      const local = A.SearchLocalSolarEclipse(new Date(t - 2 * DAY_MS), obs);
      if (Math.abs(local.peak.time.date.getTime() - t) < 2 * DAY_MS && local.peak.altitude > 0) {
        detail = `Visible from your location as a ${local.kind} eclipse (${Math.round(local.obscuration * 100)}% of the Sun covered). Never look without certified solar filters.`;
        importance = 3;
      } else {
        detail = "Not visible from your location.";
        importance = 1;
      }
    }
    out.push({ id: `se-${t}`, time: t, kind: "eclipse", title: `${cap(se.kind)} solar eclipse`, detail, importance });
    se = A.NextGlobalSolarEclipse(se.peak);
  }
  return out;
}

const RADIUS_KM: Partial<Record<string, number>> = { moon: 1737.4, mercury: 2439.7, venus: 6051.8, mars: 3389.5, jupiter: 69911, saturn: 58232 };
const AU_KM = 149_597_870.7;

/**
 * Moon–planet (< 3°) and planet–planet (< 1.5°) close approaches. With a site, separations are
 * topocentric (the Moon's parallax shifts it by up to 1°), occultations are recognised, and only
 * pairings you can actually see — both above 5° with the Sun below −6° — are kept, at the best moment.
 */
function conjunctionEvents(fromMs: number, days: number, site?: Site): SkyEvent[] {
  const out: SkyEvent[] = [];
  const bodies = SOLAR_SYSTEM.filter((b) => ["moon", "mercury", "venus", "mars", "jupiter", "saturn"].includes(b.id));
  const obs = site ? observerOf(site) : null;
  const vec = (b: A.Body, ms: number) => {
    const time = A.MakeTime(new Date(ms));
    const g = A.GeoVector(b, time, true);
    if (!obs) return g;
    const o = A.ObserverVector(time, obs, false);
    return new A.Vector(g.x - o.x, g.y - o.y, g.z - o.z, time);
  };
  const sepAt = (a: A.Body, b: A.Body, ms: number) => A.AngleBetween(vec(a, ms), vec(b, ms));
  const semi = (id: string, body: A.Body, ms: number) => {
    const r = RADIUS_KM[id];
    return r ? Math.asin(Math.min(1, r / (vec(body, ms).Length() * AU_KM))) / DEG : 0;
  };
  const visible = (a: A.Body, b: A.Body, ms: number) => !obs || (altOf(a, ms, obs) > 5 && altOf(b, ms, obs) > 5 && altOf(A.Body.Sun, ms, obs) < -6);

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];
      const withMoon = a.id === "moon" || b.id === "moon";
      const limit = withMoon ? 3 : 1.5;
      const step = withMoon ? 2 * HOUR_MS : DAY_MS / 2;
      let prev = Infinity;
      let prev2 = Infinity;
      for (let t = fromMs - step; t < fromMs + days * DAY_MS + step; t += step) {
        const s = sepAt(a.body, b.body, t);
        if (prev < prev2 && prev < s && prev < limit + 1) {
          // Refine the minimum to about a minute (golden-section search on [t − 2·step, t]).
          let lo = t - 2 * step;
          let hi = t;
          const g = (Math.sqrt(5) - 1) / 2;
          let x1 = hi - g * (hi - lo);
          let x2 = lo + g * (hi - lo);
          let f1 = sepAt(a.body, b.body, x1);
          let f2 = sepAt(a.body, b.body, x2);
          while (hi - lo > MIN) {
            if (f1 < f2) {
              hi = x2;
              x2 = x1;
              f2 = f1;
              x1 = hi - g * (hi - lo);
              f1 = sepAt(a.body, b.body, x1);
            } else {
              lo = x1;
              x1 = x2;
              f1 = f2;
              x2 = lo + g * (hi - lo);
              f2 = sepAt(a.body, b.body, x2);
            }
          }
          let when = (lo + hi) / 2;
          let sep = sepAt(a.body, b.body, when);
          const planet = a.id === "moon" ? b : a;
          const occultation = withMoon && obs !== null && sep < semi("moon", A.Body.Moon, when) + semi(planet.id, planet.body, when) && visible(a.body, b.body, when);
          let ok = sep < limit;
          if (ok && obs && !occultation && !visible(a.body, b.body, when)) {
            // Not visible at closest approach: take the closest moment within ±8 h that is.
            let best: { t: number; s: number } | null = null;
            for (let x = when - 8 * HOUR_MS; x <= when + 8 * HOUR_MS; x += 15 * MIN) {
              if (!visible(a.body, b.body, x)) continue;
              const sx = sepAt(a.body, b.body, x);
              if (!best || sx < best.s) best = { t: x, s: sx };
            }
            ok = best !== null && best.s < limit;
            if (best) {
              when = best.t;
              sep = best.s;
            }
          }
          if (ok && !obs && A.AngleFromSun(planet.body, new Date(when)) < 15) ok = false;
          if (ok && when >= fromMs - DAY_MS) {
            const names = `${a.name} and ${b.name}`;
            out.push({
              id: `conj-${a.id}-${b.id}-${Math.round(when / DAY_MS)}`,
              time: when,
              kind: "conjunction",
              title: occultation ? `The Moon occults ${planet.name}` : `${names} ${sep < 1 ? "very close" : "close together"}`,
              detail: occultation
                ? `${planet.name} passes behind the Moon as seen from your location — watch it vanish at the Moon's edge in binoculars or a telescope.`
                : `${sep.toFixed(1)}° apart${obs ? " as seen from your location" : ""} — a lovely naked-eye pairing${sep < 1 ? " that fits in a low-power field" : ""}.${
                    !obs && withMoon && sep < 1.2 ? " From some places the Moon hides the planet (an occultation)." : ""
                  }`,
              importance: occultation || sep < 1 ? 3 : 2,
            });
          }
        }
        prev2 = prev;
        prev = s;
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
  return [...moon, ...meteorEvents(fromMs, days, site), ...planets, ...eclipseEvents(fromMs, days, site), ...conjunctionEvents(fromMs, days, site), ...seasonEvents(fromMs, days)]
    .filter((e) => e.time >= fromMs - DAY_MS)
    .sort((a, b) => a.time - b.time);
}
