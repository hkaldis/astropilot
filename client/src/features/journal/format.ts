/** Journal display helpers: time zones, nights, labels for ratings and conditions. */
import type { ApiLocation, ApiSession } from "@shared/api";
import { formatDuration, formatNightDate, formatTime } from "@shared/astro/format";
import { nightDateOf } from "@shared/astro/night";
import { TYPE_LABEL, TYPE_PLURAL } from "@/lib/objects";

const HOUR = 3_600_000;

function validTz(tz?: string | null): string | undefined {
  if (!tz) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

/** Wall-clock parts of an instant in a zone (browser zone when tz is missing). */
function wallParts(ms: number, tz?: string | null) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: validTz(tz),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(ms).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}

/** "YYYY-MM-DDTHH:mm" for a datetime-local input, in the site's zone. */
export function toWallInput(ms: number, tz?: string | null): string {
  const p = wallParts(ms, tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

/** Inverse of toWallInput: a wall-clock time in `tz` → epoch ms (null when unparseable). */
export function fromWallInput(wall: string, tz?: string | null): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wall);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offset = (ms: number) => {
    const p = wallParts(ms, tz);
    return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
  };
  let utc = guess - offset(guess);
  const o2 = offset(utc);
  if (guess - o2 !== utc) utc = guess - o2;
  return utc;
}

/**
 * The night an instant belongs to (date of the evening, YYYY-MM-DD) — mirrors the server:
 * local solar time at the site's longitude when known, else the site's zone.
 */
export function nightKeyOf(ms: number, lon?: number | null, tz?: string | null): string {
  const t = ms - 12 * HOUR;
  if (lon !== null && lon !== undefined && Number.isFinite(lon)) return nightDateOf(ms, { lat: 0, lon, timezone: tz });
  const p = wallParts(t, tz);
  return `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export interface SessionPlace {
  tz?: string;
  lon: number | null;
  location: ApiLocation | null;
}

/** Where a session happened, for time zones and night dates (no location: the zone it was logged in, as the server does). */
export function placeOf(s: Pick<ApiSession, "locationId"> & { timezone?: string | null }, locations: ApiLocation[]): SessionPlace {
  const location = s.locationId ? (locations.find((l) => l.id === s.locationId) ?? null) : null;
  return { tz: validTz(location?.timezone) ?? validTz(s.timezone) ?? undefined, lon: location?.longitude ?? null, location };
}

export const sessionNight = (s: Pick<ApiSession, "date" | "locationId"> & { timezone?: string | null }, locations: ApiLocation[]) => {
  const p = placeOf(s, locations);
  return nightKeyOf(Date.parse(s.date), p.lon, p.tz);
};

/** "Sat 4 Oct" / "Saturday 4 October" for a night key. */
export const nightLabel = (key: string, style: "short" | "long" = "short") => formatNightDate(key, style);

/** "Sat" for a night key. */
export function nightWeekday(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" }).format(Date.UTC(y, m - 1, d, 12));
}

export function monthLabel(ym: string, style: "long" | "short" = "long") {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, style === "long" ? { month: "long", year: "numeric", timeZone: "UTC" } : { month: "short", timeZone: "UTC" }).format(Date.UTC(y, m - 1, 15));
}

export function timeRange(s: Pick<ApiSession, "date" | "endDate">, o: { tz?: string; hour12?: boolean }) {
  const start = Date.parse(s.date);
  const end = s.endDate ? Date.parse(s.endDate) : null;
  const a = formatTime(start, o);
  if (!end) return { text: `From ${a}`, hours: null as number | null };
  return { text: `${a} – ${formatTime(end, o)}`, hours: (end - start) / HOUR };
}

export { formatDuration, formatTime };

export function sessionTitle(s: Pick<ApiSession, "title" | "locationName">) {
  return s.title || (s.locationName ? `Night at ${s.locationName}` : "Observing session");
}

/* ---------------------------------------- Labels ---------------------------------------- */

export const RATING_LABEL = ["", "Barely there", "Faint", "Clear view", "Great view", "Stunning"] as const;

export const SEEING_LABEL = ["", "Very poor", "Poor", "Average", "Good", "Excellent"] as const;
export const SEEING_HINT = [
  "",
  "Boiling — stars are fuzzy blobs",
  "Unsteady, rare sharp moments",
  "Some steady moments at medium power",
  "Mostly steady, fine planetary detail",
  "Rock steady, crisp diffraction rings",
] as const;

export const TRANSPARENCY_LABEL = SEEING_LABEL;
export const TRANSPARENCY_HINT = [
  "",
  "Hazy — only the brightest stars",
  "Thin cloud or haze around",
  "Typical for this site",
  "Clear, faint stars easy",
  "Crystal clear, Milky Way full of structure",
] as const;

const EXTRA_TYPE_LABEL: Record<string, string> = {
  comet: "Comet",
  meteor_shower: "Meteor shower",
  nebula: "Nebula",
  other: "Other",
};
const EXTRA_TYPE_PLURAL: Record<string, string> = {
  comet: "Comets",
  meteor_shower: "Meteor showers",
  nebula: "Nebulae",
  other: "Other",
};

export const typeLabel = (t: string | null | undefined) => (t ? (TYPE_LABEL[t] ?? EXTRA_TYPE_LABEL[t] ?? t.replace(/_/g, " ")) : "Object");
export const typePlural = (t: string) => TYPE_PLURAL[t] ?? EXTRA_TYPE_PLURAL[t] ?? t.replace(/_/g, " ");

/** "M 31" style label for refs that are bare catalog numbers, else the name. */
export function shortName(ref: string | null | undefined, name: string) {
  if (ref && /^(M|C)\d{1,3}$/i.test(ref)) return ref.toUpperCase();
  return name;
}

export const cToF = (c: number) => (c * 9) / 5 + 32;
export const fToC = (f: number) => ((f - 32) * 5) / 9;
