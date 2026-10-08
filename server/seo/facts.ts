/**
 * Location-independent facts about an object, for the server-rendered pages and their Markdown twins:
 * when it is best placed in the evening sky, how high it climbs from familiar latitudes, and, for the
 * planets, where they are now. (The app itself works all of this out for the visitor's own site.)
 */
import { A } from "@shared/astro/core";
import { CONSTELLATION_NAMES } from "@shared/data/constellations-meta";
import { TYPE_LABEL } from "@shared/data/objectTypes";
import { MOONS, MOON_BY_ID, isMoonId, type MoonMeta } from "@shared/astro/moons";
import { PLANET_BY_ID, SOLAR_SYSTEM, type PlanetMeta, type SolarSystemId } from "@shared/astro/planets";
import catalogData from "@shared/data/catalog.json";
import type { CatalogEntry } from "../catalog";

/** The deep-sky catalog, read directly (this module needs no database). */
let cat: { list: CatalogEntry[]; byId: Map<string, CatalogEntry> } | null = null;
export function catalog() {
  if (!cat) {
    const list = catalogData as unknown as CatalogEntry[];
    cat = { list, byId: new Map(list.map((o) => [o.id.toUpperCase(), o])) };
  }
  return cat;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_MS = 86_400_000;

/** The Sun's right ascension (hours) for each day of a year, at 00:00 UT. */
let sunRa: { year: number; ra: number[] } | null = null;
function sunRaTable(): number[] {
  const year = new Date().getUTCFullYear();
  if (sunRa?.year === year) return sunRa.ra;
  const observer = new A.Observer(0, 0, 0);
  const ra = Array.from({ length: 365 }, (_, d) => A.Equator(A.Body.Sun, new Date(Date.UTC(year, 0, 1) + d * DAY_MS), observer, true, true).ra);
  sunRa = { year, ra };
  return ra;
}

/** The month in which an object at this RA crosses the meridian at `hour` local mean solar time. */
function monthTransitingAt(raHours: number, hour: number): string {
  const ra = sunRaTable();
  const want = hour - 12; // the hour angle of the mean Sun at that local time
  let best = 0;
  let bestErr = Infinity;
  ra.forEach((sun, d) => {
    const diff = (((raHours - sun - want) % 24) + 36) % 24 - 12; // −12…12 h
    if (Math.abs(diff) < bestErr) {
      bestErr = Math.abs(diff);
      best = d;
    }
  });
  return MONTHS[new Date(Date.UTC(2001, 0, 1) + best * DAY_MS).getUTCMonth()];
}

const latLabel = (lat: number) => (lat === 0 ? "the equator" : `${Math.abs(lat)}°${lat > 0 ? "N" : "S"}`);

export interface SkyFacts {
  /** Month it crosses the meridian at about 10 pm (the best evening month) and at midnight. */
  eveningMonth: string;
  midnightMonth: string;
  /** "Visible from everywhere north of 49°S; never sets north of 49°N." */
  latitudes: string;
  /** Altitude at its highest from a few familiar latitudes (null: never rises there). */
  altitudes: { lat: number; label: string; alt: number | null }[];
}

export function skyFacts(o: { ra: number; dec: number }): SkyFacts {
  const dec = o.dec;
  const limit = Math.round(90 - Math.abs(dec));
  const latitudes =
    Math.abs(dec) < 1
      ? "It sits on the celestial equator, so it can be seen from almost everywhere on Earth."
      : dec > 0
        ? `It can be seen from everywhere north of ${limit}°S${limit < 89 ? ` and never sets north of ${limit}°N` : ""}.`
        : `It can be seen from everywhere south of ${limit}°N${limit < 89 ? ` and never sets south of ${limit}°S` : ""}.`;
  const altitudes = [50, 35, 0, -35].map((lat) => {
    const alt = 90 - Math.abs(lat - dec);
    return { lat, label: latLabel(lat), alt: alt > 0 ? Math.round(alt) : null };
  });
  return { eveningMonth: monthTransitingAt(o.ra, 22), midnightMonth: monthTransitingAt(o.ra, 24), latitudes, altitudes };
}

export const conName = (abbr?: string) => (abbr ? (CONSTELLATION_NAMES[abbr] ?? abbr) : "");
export const typeLabel = (t: string) => TYPE_LABEL[t] ?? t.replace(/_/g, " ");

/** "M 31", "NGC 224", … without the common name. */
export function designations(o: CatalogEntry): string[] {
  const list = Array.isArray(o.designations) ? (o.designations as string[]) : [];
  return list.filter((d) => d !== o.name && !/^(PGC|UGC|MCG|ESO|CGCG|IRAS|2MASX|LEDA)\b/.test(d));
}

/** "Andromeda Galaxy (M 31)" or just "M 13" style display name. */
export function displayName(o: CatalogEntry): string {
  const primary = designations(o)[0];
  return primary && primary.replace(/\s/g, "").toLowerCase() !== o.name.replace(/\s/g, "").toLowerCase() ? `${o.name} (${primary})` : o.name;
}

export function sizeText(size?: number[]): string | null {
  if (!size?.length) return null;
  const f = (arcmin: number) => (arcmin >= 60 ? `${(arcmin / 60).toFixed(1)}°` : arcmin >= 1 ? `${arcmin < 10 ? arcmin.toFixed(1) : Math.round(arcmin)}′` : `${Math.round(arcmin * 60)}″`);
  return size.length > 1 && size[1] ? `${f(size[0])} × ${f(size[1])}` : f(size[0]);
}

export function raDec(ra: number, dec: number): string {
  const h = Math.floor(ra);
  const m = (ra - h) * 60;
  const sign = dec < 0 ? "−" : "+";
  const d = Math.floor(Math.abs(dec));
  const dm = Math.round((Math.abs(dec) - d) * 60);
  return `RA ${h}h ${m.toFixed(1)}m, Dec ${sign}${d}° ${dm}′ (J2000)`;
}

/** Where a planet is now, geocentrically: morning or evening sky, distance from the Sun, brightness, constellation. */
export function planetNow(p: PlanetMeta, now = new Date()): string | null {
  if (p.id === "moon") return null;
  const elong = A.Elongation(p.body, now);
  const eq = A.Equator(p.body, now, new A.Observer(0, 0, 0), true, true);
  const con = A.Constellation(eq.ra, eq.dec).name;
  const mag = A.Illumination(p.body, now).mag;
  const month = `${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
  const where = elong.elongation < 12 ? "too close to the Sun to see" : `in the ${elong.visibility} sky, ${Math.round(elong.elongation)}° from the Sun`;
  return `In ${month} ${p.name} is ${where}, at magnitude ${mag.toFixed(1).replace("-", "−")} in ${con}.`;
}

export type Subject =
  | { kind: "dso"; o: CatalogEntry }
  | { kind: "planet"; p: PlanetMeta }
  | { kind: "moon"; m: MoonMeta };

/** Look up anything with an object page: catalog id, planet or the Moon, or a planet's moon. */
export function subjectFor(id: string): Subject | null {
  const key = id.trim();
  const lower = key.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(PLANET_BY_ID, lower)) return { kind: "planet", p: PLANET_BY_ID[lower as SolarSystemId] };
  if (isMoonId(lower)) return { kind: "moon", m: MOON_BY_ID[lower as keyof typeof MOON_BY_ID] };
  const o = catalog().byId.get(key.toUpperCase());
  return o ? { kind: "dso", o } : null;
}

/** Every object page, in a sensible order: the Moon and planets, their moons, then the catalog. */
export function allSubjects(): { path: string; name: string; group: string }[] {
  const out: { path: string; name: string; group: string }[] = [];
  for (const p of SOLAR_SYSTEM) out.push({ path: `/object/${p.id}`, name: p.name, group: "Solar System" });
  for (const m of MOONS) out.push({ path: `/object/${m.id}`, name: `${m.name} (moon of ${PLANET_BY_ID[m.parent].name})`, group: "Moons of the planets" });
  for (const o of catalog().list) out.push({ path: `/object/${encodeURIComponent(o.id)}`, name: displayName(o), group: typeLabel(o.type) });
  return out;
}
