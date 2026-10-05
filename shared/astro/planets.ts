/** Planets and the Moon: positions, brightness, apparent size and nightly events. */
import { A, DEG, Site, observerOf, bodyAltAz, constellationOf } from "./core";

export type PlanetId = "mercury" | "venus" | "mars" | "jupiter" | "saturn" | "uranus" | "neptune";
export type SolarSystemId = PlanetId | "moon";

export interface PlanetMeta {
  id: SolarSystemId;
  name: string;
  body: A.Body;
  radiusKm: number; // equatorial radius
  color: string; // for charts
  blurb: string;
}

export const SOLAR_SYSTEM: PlanetMeta[] = [
  { id: "moon", name: "Moon", body: A.Body.Moon, radiusKm: 1737.4, color: "#e9e4d4", blurb: "Craters, maria and mountain ranges; best near the terminator, away from full Moon." },
  { id: "mercury", name: "Mercury", body: A.Body.Mercury, radiusKm: 2439.7, color: "#c9b8a6", blurb: "Elusive inner planet, only visible low in twilight near greatest elongation; shows phases." },
  { id: "venus", name: "Venus", body: A.Body.Venus, radiusKm: 6051.8, color: "#f3e7c1", blurb: "Brilliant cloud-covered planet showing Moon-like phases; observe in twilight to cut glare." },
  { id: "mars", name: "Mars", body: A.Body.Mars, radiusKm: 3396.2, color: "#e2794f", blurb: "Polar caps and dark albedo markings appear near opposition, when the disk is largest." },
  { id: "jupiter", name: "Jupiter", body: A.Body.Jupiter, radiusKm: 71492, color: "#e7c9a1", blurb: "Cloud belts, the Great Red Spot and four Galilean moons that change nightly." },
  { id: "saturn", name: "Saturn", body: A.Body.Saturn, radiusKm: 60268, color: "#ead7a0", blurb: "The rings, Cassini division and Titan; spectacular at any magnification above ~50×." },
  { id: "uranus", name: "Uranus", body: A.Body.Uranus, radiusKm: 25559, color: "#a7e3e6", blurb: "A tiny blue-green disk at higher power; naked-eye threshold under dark skies." },
  { id: "neptune", name: "Neptune", body: A.Body.Neptune, radiusKm: 24764, color: "#7aa2f7", blurb: "Faint bluish point that resolves into a small disk at 200×+; Triton is within reach of 8\"." },
];

export const PLANET_BY_ID: Record<SolarSystemId, PlanetMeta> = Object.fromEntries(SOLAR_SYSTEM.map((p) => [p.id, p])) as any;

const AU_KM = 149_597_870.7;

export interface BodyState {
  id: SolarSystemId;
  name: string;
  alt: number;
  az: number;
  ra: number; // apparent RA of date, hours
  dec: number; // apparent Dec of date, degrees
  raJ2000: number;
  decJ2000: number;
  mag: number;
  diameter: number; // arcseconds
  illumination: number; // 0..1
  elongation: number; // degrees from the Sun
  distanceAu: number;
  constellation: string;
  /**
   * Saturn: the ring opening B, degrees — Earth's latitude above the ring plane, positive when we see the
   * rings' north face (2009–2025), negative when we see the south face (2025–2038).
   */
  ringTilt?: number;
}

const poly = (x: number, c: number[]) => c.reduce((s, k, i) => s + k * Math.pow(x, i), 0);

/**
 * Apparent magnitude after Mallama & Hilton (2018), the formulas JPL Horizons and the Astronomical Almanac
 * use: within 0.01 mag of Horizons for Mercury, Venus, Jupiter and Neptune and 0.05 for Saturn (whose rings
 * astronomy-engine's older formula made 0.1–0.2 mag too bright). Uranus (it needs latitude terms) and the
 * Moon keep astronomy-engine's values, which already agree.
 */
export function planetMagnitude(id: SolarSystemId, illum: A.IlluminationInfo): number {
  const a = illum.phase_angle;
  const m5 = 5 * Math.log10(illum.helio_dist * illum.geo_dist);
  switch (id) {
    case "mercury":
      return m5 + poly(a, [-0.613, 6.328e-2, -1.6336e-3, 3.3644e-5, -3.4265e-7, 1.6893e-9, -3.0334e-12]);
    case "venus":
      return m5 + (a < 163.7 ? poly(a, [-4.384, -1.044e-3, 3.687e-4, -2.814e-6, 8.938e-9]) : poly(a, [236.05828, -2.81914, 8.39034e-3]));
    case "mars":
      return m5 + (a <= 50 ? poly(a, [-1.601, 2.267e-2, -1.302e-4]) : poly(a, [-0.367, -0.02573, 3.445e-4]));
    case "jupiter":
      return m5 + poly(a, [-9.395, -3.7e-4, 6.16e-4]);
    case "saturn": {
      // Globe and rings, for the phase angles and ring openings seen from Earth (α ≤ 6.5°, |B| ≤ 27°).
      const sinB = Math.sin(Math.abs(illum.ring_tilt ?? 0) * DEG);
      return m5 - 8.914 - 1.825 * sinB + 0.026 * a - 0.378 * sinB * Math.exp(-2.25 * a);
    }
    case "neptune":
      return m5 + poly(a, [-7.0, 7.944e-3, 9.617e-5]);
    default:
      return illum.mag;
  }
}

export function bodyState(id: SolarSystemId, ms: number, site: Site): BodyState {
  const meta = PLANET_BY_ID[id];
  const obs = observerOf(site);
  const d = new Date(ms);
  const pos = bodyAltAz(meta.body, ms, obs);
  const j2000 = A.Equator(meta.body, d, obs, false, true);
  const illum = A.Illumination(meta.body, d);
  const elong = A.AngleFromSun(meta.body, d);
  const diameter = (2 * Math.atan(meta.radiusKm / (pos.dist * AU_KM))) / DEG * 3600;
  return {
    id,
    name: meta.name,
    alt: pos.alt,
    az: pos.az,
    ra: pos.ra,
    dec: pos.dec,
    raJ2000: j2000.ra,
    decJ2000: j2000.dec,
    mag: planetMagnitude(id, illum),
    diameter,
    illumination: illum.phase_fraction,
    elongation: elong,
    distanceAu: pos.dist,
    constellation: constellationOf(j2000.ra, j2000.dec),
    // astronomy-engine reports the tilt with the opposite sign (−26.6° in June 2017, when the north face was open).
    ringTilt: id === "saturn" && illum.ring_tilt !== undefined ? -illum.ring_tilt : undefined,
  };
}

export interface BodyNightEvents {
  rise: number | null;
  set: number | null;
  transit: number | null;
  transitAlt: number | null;
}

/** Rise, set and upper transit of a body in the 24 h after `fromMs` (typically the night's noon). */
export function bodyEvents(id: SolarSystemId, fromMs: number, site: Site): BodyNightEvents {
  const meta = PLANET_BY_ID[id];
  const obs = observerOf(site);
  const from = new Date(fromMs);
  const rise = A.SearchRiseSet(meta.body, obs, +1, from, 1);
  const set = A.SearchRiseSet(meta.body, obs, -1, from, 1);
  const tr = A.SearchHourAngle(meta.body, obs, 0, from, +1);
  return {
    rise: rise ? rise.date.getTime() : null,
    set: set ? set.date.getTime() : null,
    transit: tr.time.date.getTime(),
    transitAlt: tr.hor.altitude,
  };
}

/**
 * Opposition to the half-minute: when the planet's apparent geocentric ecliptic longitude is 180° from the
 * Sun's. (The heliocentric alignment astronomy-engine searches for comes 5–20 minutes earlier.)
 */
function refineOpposition(body: A.Body, approx: number): number {
  const off = (t: number) => {
    const d = new Date(t);
    return ((A.Ecliptic(A.GeoVector(body, d, true)).elon - A.SunPosition(d).elon + 360) % 360) - 180;
  };
  let lo = approx - 2 * 86_400_000;
  let hi = approx + 2 * 86_400_000;
  const sLo = Math.sign(off(lo));
  if (sLo === Math.sign(off(hi))) return approx;
  while (hi - lo > 30_000) {
    const mid = (lo + hi) / 2;
    if (Math.sign(off(mid)) === sLo) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

export interface PlanetaryEvent {
  time: number;
  kind: "opposition" | "elongation" | "conjunction";
  body: PlanetId;
  detail: string;
  /** Greatest elongations: the angle from the Sun and whether it's an evening or morning showing. */
  elongation?: number;
  visibility?: "evening" | "morning";
}

/** Upcoming oppositions and greatest elongations within `days` of `fromMs`. */
export function planetaryEvents(fromMs: number, days: number): PlanetaryEvent[] {
  const out: PlanetaryEvent[] = [];
  const limit = fromMs + days * 86_400_000;
  const from = new Date(fromMs);
  for (const id of ["mars", "jupiter", "saturn", "uranus", "neptune"] as PlanetId[]) {
    // Every opposition in the window (a long window can hold more than one for the slow outer planets).
    for (let ev = A.SearchRelativeLongitude(PLANET_BY_ID[id].body, 0, from); ev.date.getTime() < limit; ev = A.SearchRelativeLongitude(PLANET_BY_ID[id].body, 0, new Date(ev.date.getTime() + 30 * 86_400_000)))
      out.push({ time: refineOpposition(PLANET_BY_ID[id].body, ev.date.getTime()), kind: "opposition", body: id, detail: "Biggest and brightest of the year, opposite the Sun and up all night." });
  }
  for (const id of ["mercury", "venus"] as PlanetId[]) {
    let start = from;
    for (let i = 0; i < 40; i++) {
      const ev = A.SearchMaxElongation(PLANET_BY_ID[id].body, start);
      const ms = ev.time.date.getTime();
      if (ms > limit) break;
      out.push({
        time: ms,
        kind: "elongation",
        body: id,
        elongation: ev.elongation,
        visibility: ev.visibility === "morning" ? "morning" : "evening",
        detail:
          id === "mercury"
            ? `${ev.elongation.toFixed(1)}° from the Sun — Mercury's best ${ev.visibility} showing: look low in the ${ev.visibility === "evening" ? "west after sunset" : "east before sunrise"}.`
            : `${ev.elongation.toFixed(1)}° from the Sun — Venus is a brilliant ${ev.visibility === "evening" ? "evening star in the west after sunset" : "morning star in the east before sunrise"}.`,
      });
      start = new Date(ms + 86_400_000);
    }
  }
  return out.sort((a, b) => a.time - b.time);
}
