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
  ringTilt?: number; // Saturn, degrees
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
    mag: illum.mag,
    diameter,
    illumination: illum.phase_fraction,
    elongation: elong,
    distanceAu: pos.dist,
    constellation: constellationOf(j2000.ra, j2000.dec),
    ringTilt: id === "saturn" ? illum.ring_tilt : undefined,
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

/** Upcoming oppositions and greatest elongations within `days` of `fromMs`. */
export function planetaryEvents(fromMs: number, days: number) {
  const out: { time: number; kind: "opposition" | "elongation" | "conjunction"; body: PlanetId; detail: string }[] = [];
  const limit = fromMs + days * 86_400_000;
  const from = new Date(fromMs);
  for (const id of ["mars", "jupiter", "saturn", "uranus", "neptune"] as PlanetId[]) {
    const ev = A.SearchRelativeLongitude(PLANET_BY_ID[id].body, 0, from);
    if (ev.date.getTime() < limit) out.push({ time: ev.date.getTime(), kind: "opposition", body: id, detail: "Biggest and brightest of the year, opposite the Sun and up all night." });
  }
  for (const id of ["mercury", "venus"] as PlanetId[]) {
    let start = from;
    for (let i = 0; i < 4; i++) {
      const ev = A.SearchMaxElongation(PLANET_BY_ID[id].body, start);
      const ms = ev.time.date.getTime();
      if (ms > limit) break;
      out.push({
        time: ms,
        kind: "elongation",
        body: id,
        detail: `${ev.elongation.toFixed(1)}° from the Sun — look ${ev.visibility === "evening" ? "low in the west after sunset" : "low in the east before sunrise"}.`,
      });
      start = new Date(ms + 86_400_000);
    }
  }
  return out.sort((a, b) => a.time - b.time);
}
