/**
 * The planets' moons within reach of amateur telescopes: Jupiter's four Galilean moons, eight of
 * Saturn's, Mars's Phobos and Deimos, Uranus's five largest and Neptune's Triton.
 *
 * Positions are offsets from the planet's centre on the sky, in arcseconds east and north (light-time
 * included), with whether the moon is in front of the disk (a transit), hidden behind it (an
 * occultation) or in the planet's shadow (an eclipse).
 *  - Jupiter's moons are computed here from astronomy-engine (IMCCE L1 theory), shadows on the cloud
 *    tops included, so their nightly events need no network.
 *  - The others come from JPL Horizons through the server (server/services/moons.ts) as samples every
 *    10–15 minutes; `seriesPositions` interpolates them.
 */
import { A, DEG } from "./core";
import type { PlanetId } from "./planets";
import { detectability, type DetectInput, type DetectResult } from "./visibility";

export type MoonId =
  | "io"
  | "europa"
  | "ganymede"
  | "callisto"
  | "mimas"
  | "enceladus"
  | "tethys"
  | "dione"
  | "rhea"
  | "titan"
  | "hyperion"
  | "iapetus"
  | "phobos"
  | "deimos"
  | "miranda"
  | "ariel"
  | "umbriel"
  | "titania"
  | "oberon"
  | "triton";

export interface MoonMeta {
  id: MoonId;
  name: string;
  parent: PlanetId;
  /** Roman-numeral designation, e.g. "Saturn VI". */
  designation: string;
  /** NAIF id, as JPL Horizons knows it. */
  naif: number;
  radiusKm: number;
  /** Mean distance from the planet, km. */
  aKm: number;
  periodDays: number;
  retrograde?: boolean;
  /** V magnitude near a typical opposition (live values come from the ephemeris). */
  mag: number;
  discovered: { by: string; year: number };
  blurb: string;
}

export const MOONS: MoonMeta[] = [
  { id: "io", name: "Io", parent: "jupiter", designation: "Jupiter I", naif: 501, radiusKm: 1821.6, aKm: 421_700, periodDays: 1.769, mag: 5.0, discovered: { by: "Galileo Galilei", year: 1610 }, blurb: "The most volcanic world known. It circles Jupiter in 42 hours, so its place changes visibly in an evening." },
  { id: "europa", name: "Europa", parent: "jupiter", designation: "Jupiter II", naif: 502, radiusKm: 1560.8, aKm: 671_034, periodDays: 3.551, mag: 5.3, discovered: { by: "Galileo Galilei", year: 1610 }, blurb: "Smooth ice over a hidden ocean — the smallest and faintest of the four Galilean moons." },
  { id: "ganymede", name: "Ganymede", parent: "jupiter", designation: "Jupiter III", naif: 503, radiusKm: 2634.1, aKm: 1_070_412, periodDays: 7.155, mag: 4.6, discovered: { by: "Galileo Galilei", year: 1610 }, blurb: "The largest moon in the Solar System, bigger than Mercury; its shadow on Jupiter is the easiest to see." },
  { id: "callisto", name: "Callisto", parent: "jupiter", designation: "Jupiter IV", naif: 504, radiusKm: 2410.3, aKm: 1_882_709, periodDays: 16.689, mag: 5.6, discovered: { by: "Galileo Galilei", year: 1610 }, blurb: "Ancient, dark and cratered; it strays farthest from Jupiter, up to about 10′ away." },
  { id: "mimas", name: "Mimas", parent: "saturn", designation: "Saturn I", naif: 601, radiusKm: 198.2, aKm: 185_539, periodDays: 0.942, mag: 12.9, discovered: { by: "William Herschel", year: 1789 }, blurb: "A small moon with one giant crater. It hugs the edge of the rings — a real test of optics and seeing." },
  { id: "enceladus", name: "Enceladus", parent: "saturn", designation: "Saturn II", naif: 602, radiusKm: 252.1, aKm: 237_948, periodDays: 1.37, mag: 11.7, discovered: { by: "William Herschel", year: 1789 }, blurb: "Icy geysers feed Saturn's E ring. Look for it near its greatest distance from the rings." },
  { id: "tethys", name: "Tethys", parent: "saturn", designation: "Saturn III", naif: 603, radiusKm: 531.1, aKm: 294_619, periodDays: 1.888, mag: 10.2, discovered: { by: "Giovanni Cassini", year: 1684 }, blurb: "An icy moon split by a vast canyon; with Dione and Rhea, part of the trio a 4-inch scope shows." },
  { id: "dione", name: "Dione", parent: "saturn", designation: "Saturn IV", naif: 604, radiusKm: 561.4, aKm: 377_396, periodDays: 2.737, mag: 10.4, discovered: { by: "Giovanni Cassini", year: 1684 }, blurb: "Bright ice cliffs streak its trailing side; usually found between Tethys and Rhea." },
  { id: "rhea", name: "Rhea", parent: "saturn", designation: "Saturn V", naif: 605, radiusKm: 763.8, aKm: 527_108, periodDays: 4.518, mag: 9.7, discovered: { by: "Giovanni Cassini", year: 1672 }, blurb: "Saturn's second-largest moon and the easiest after Titan." },
  { id: "titan", name: "Titan", parent: "saturn", designation: "Saturn VI", naif: 606, radiusKm: 2574.7, aKm: 1_221_870, periodDays: 15.945, mag: 8.4, discovered: { by: "Christiaan Huygens", year: 1655 }, blurb: "Saturn's giant moon, wrapped in orange haze — visible in any telescope, up to about 3′ from the planet." },
  { id: "hyperion", name: "Hyperion", parent: "saturn", designation: "Saturn VII", naif: 607, radiusKm: 135, aKm: 1_481_010, periodDays: 21.277, mag: 14.2, discovered: { by: "William Bond and William Lassell", year: 1848 }, blurb: "A tumbling, sponge-like moon. At magnitude 14 it is a quarry for large telescopes." },
  { id: "iapetus", name: "Iapetus", parent: "saturn", designation: "Saturn VIII", naif: 608, radiusKm: 734.5, aKm: 3_560_820, periodDays: 79.33, mag: 11.0, discovered: { by: "Giovanni Cassini", year: 1671 }, blurb: "Two-faced: one hemisphere is coal-dark, the other bright, so it is two magnitudes brighter west of Saturn than east." },
  { id: "phobos", name: "Phobos", parent: "mars", designation: "Mars I", naif: 401, radiusKm: 11.3, aKm: 9_376, periodDays: 0.319, mag: 11.5, discovered: { by: "Asaph Hall", year: 1877 }, blurb: "A tiny moonlet that rounds Mars three times a day. Only near opposition, with a large scope and Mars just outside the field." },
  { id: "deimos", name: "Deimos", parent: "mars", designation: "Mars II", naif: 402, radiusKm: 6.2, aKm: 23_463, periodDays: 1.263, mag: 12.4, discovered: { by: "Asaph Hall", year: 1877 }, blurb: "Mars's smaller, outer moon — easier than Phobos because it strays farther from the planet's glare." },
  { id: "miranda", name: "Miranda", parent: "uranus", designation: "Uranus V", naif: 705, radiusKm: 235.8, aKm: 129_390, periodDays: 1.413, mag: 16.3, discovered: { by: "Gerard Kuiper", year: 1948 }, blurb: "The smallest and closest of Uranus's major moons — an extreme target for the largest amateur scopes." },
  { id: "ariel", name: "Ariel", parent: "uranus", designation: "Uranus I", naif: 701, radiusKm: 578.9, aKm: 191_020, periodDays: 2.52, mag: 14.3, discovered: { by: "William Lassell", year: 1851 }, blurb: "The brightest-surfaced of Uranus's moons, but close in: steady air and high power help." },
  { id: "umbriel", name: "Umbriel", parent: "uranus", designation: "Uranus II", naif: 702, radiusKm: 584.7, aKm: 266_000, periodDays: 4.144, mag: 14.9, discovered: { by: "William Lassell", year: 1851 }, blurb: "The darkest of the large Uranian moons, and the hardest of the four to catch." },
  { id: "titania", name: "Titania", parent: "uranus", designation: "Uranus III", naif: 703, radiusKm: 788.9, aKm: 435_910, periodDays: 8.706, mag: 13.8, discovered: { by: "William Herschel", year: 1787 }, blurb: "Uranus's largest moon; with Oberon, the pair a 10-inch scope can catch." },
  { id: "oberon", name: "Oberon", parent: "uranus", designation: "Uranus IV", naif: 704, radiusKm: 761.4, aKm: 583_520, periodDays: 13.463, mag: 14.0, discovered: { by: "William Herschel", year: 1787 }, blurb: "The outermost large moon of Uranus, usually the easiest to separate from the planet." },
  { id: "triton", name: "Triton", parent: "neptune", designation: "Neptune I", naif: 801, radiusKm: 1353.4, aKm: 354_759, periodDays: 5.877, retrograde: true, mag: 13.5, discovered: { by: "William Lassell", year: 1846 }, blurb: "A captured world that orbits Neptune backwards; up to 17″ from the planet, within reach of an 8-inch scope." },
];

export const MOON_BY_ID = Object.fromEntries(MOONS.map((m) => [m.id, m])) as Record<MoonId, MoonMeta>;
export const MOON_IDS = MOONS.map((m) => m.id);
export const isMoonId = (id: string): id is MoonId => Object.prototype.hasOwnProperty.call(MOON_BY_ID, id.toLowerCase());
export const moonsOf = (planet: string): MoonMeta[] => MOONS.filter((m) => m.parent === planet);
export const PLANETS_WITH_MOONS: PlanetId[] = ["mars", "jupiter", "saturn", "uranus", "neptune"];

/** Where a moon is relative to its planet at one moment. */
export interface MoonPos {
  id: MoonId;
  /** Offset from the planet's centre, arcseconds: east and north (as on a star chart). */
  dx: number;
  dy: number;
  mag: number | null;
  /** In front of the planet's disk. */
  transit: boolean;
  /** Hidden behind the planet's disk. */
  occulted: boolean;
  /** In the planet's shadow. */
  eclipse: "total" | "partial" | null;
  /** Where its shadow falls on the disk (Jupiter's moons), arcsec from the centre. */
  shadow?: { dx: number; dy: number } | null;
}

/** Can it be seen at that moment (not behind the planet or darkened in its shadow)? */
export const moonShowing = (p: MoonPos) => !p.occulted && p.eclipse !== "total";
export const separationOf = (p: MoonPos) => Math.hypot(p.dx, p.dy);

export type MoonEventKind = "transit" | "shadow" | "occultation" | "eclipse";
/** A phenomenon during a time window; start/end are null when it was already under way, or still is, at the window's edges. */
export interface MoonEvent {
  moon: MoonId;
  kind: MoonEventKind;
  start: number | null;
  end: number | null;
  /** Times good to the sampling step (Horizons-based moons), not to the minute. */
  approx?: boolean;
}

// -------------------------------------------------------------------------------------------------
// Geometry helpers
// -------------------------------------------------------------------------------------------------

type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const len = (a: V3) => Math.sqrt(dot(a, a));
const unit = (a: V3): V3 => scale(a, 1 / len(a));
const raDec = (raDeg: number, decDeg: number): V3 => [Math.cos(decDeg * DEG) * Math.cos(raDeg * DEG), Math.cos(decDeg * DEG) * Math.sin(raDeg * DEG), Math.sin(decDeg * DEG)];

const AU_KM = 149_597_870.7;
const ARCSEC = 206_264.806;
const LIGHT_DAYS_PER_AU = 0.0057755183;
const SUN_RADIUS_KM = 695_700;

/** North poles of the planets (IAU, J2000), for orienting disks, rings and the moons' orbits. */
const POLES: Record<string, V3> = {
  mars: raDec(317.681, 52.887),
  jupiter: raDec(268.057, 64.495),
  saturn: raDec(40.589, 83.537),
  uranus: raDec(257.311, -15.175),
  neptune: raDec(299.36, 43.46),
};

/**
 * Position angle (degrees, north through east) of a planet's north pole as seen at RA/Dec (J2000): the
 * direction of its spin axis on the sky. Rings and the equatorial plane lie perpendicular to it.
 */
export function poleAngle(planet: string, raHours: number, decDeg: number): number | null {
  const p = POLES[planet];
  if (!p) return null;
  const u = raDec(raHours * 15, decDeg);
  const e = unit([-u[1], u[0], 0]);
  const n: V3 = [u[1] * e[2] - u[2] * e[1], u[2] * e[0] - u[0] * e[2], u[0] * e[1] - u[1] * e[0]];
  return (Math.atan2(dot(p, e), dot(p, n)) / DEG + 360) % 360;
}

const EQ_RADIUS_KM: Record<string, number> = { mars: 3396.2, jupiter: 71_492, saturn: 60_268, uranus: 25_559, neptune: 24_764 };
const POLAR_RADIUS_KM: Record<string, number> = { mars: 3376.2, jupiter: 66_854, saturn: 54_364, uranus: 24_973, neptune: 24_341 };

/** A planet's disk as seen from Earth: equatorial and projected polar radius (arcsec) and the pole's position angle (deg). */
export interface PlanetDisk {
  radius: number;
  polar: number;
  pole: number;
}

/**
 * The planet's outline on the sky from its J2000 direction and distance: oblate planets look flatter the
 * more nearly we see them equator-on (Saturn's globe is 10% flatter than round when its rings are edge-on).
 */
export function planetDisk(planet: string, raHours: number, decDeg: number, distAu: number): PlanetDisk | null {
  const p = POLES[planet];
  const req = EQ_RADIUS_KM[planet];
  if (!p || !req) return null;
  const u = raDec(raHours * 15, decDeg);
  const sinB = -dot(p, u); // sub-Earth latitude on the planet
  const cosB = Math.sqrt(Math.max(0, 1 - sinB * sinB));
  const k = ARCSEC / (distAu * AU_KM);
  return { radius: req * k, polar: Math.hypot(POLAR_RADIUS_KM[planet] * cosB, req * sinB) * k, pole: poleAngle(planet, raHours, decDeg) ?? 0 };
}

/** Is an offset (arcsec east/north of the centre) inside the planet's disk? */
export function onDisk(disk: PlanetDisk, dx: number, dy: number): boolean {
  const pa = disk.pole * DEG;
  const along = dx * Math.sin(pa) + dy * Math.cos(pa); // towards the north pole
  const across = dx * Math.cos(pa) - dy * Math.sin(pa); // along the equator
  return (across / disk.radius) ** 2 + (along / disk.polar) ** 2 < 1;
}

/** Squared distance from the line through the origin along `d`, in coordinates where the planet is a unit sphere. */
function perp2(x: V3, d: V3) {
  const dd = dot(d, d);
  const xd = dot(x, d);
  return dot(x, x) - (xd * xd) / dd;
}

// -------------------------------------------------------------------------------------------------
// Jupiter's moons
// -------------------------------------------------------------------------------------------------

const J_REQ = 71_492;
const J_RPOL = 66_854;
const GALILEAN: { id: MoonId; key: "io" | "europa" | "ganymede" | "callisto"; h: number; beta: number }[] = [
  // V(1,0) and phase coefficient (mag/deg) — Mallama et al.
  { id: "io", key: "io", h: -1.68, beta: 0.046 },
  { id: "europa", key: "europa", h: -1.41, beta: 0.031 },
  { id: "ganymede", key: "ganymede", h: -2.09, beta: 0.032 },
  { id: "callisto", key: "callisto", h: -1.05, beta: 0.04 },
];

/** Stretch a jovicentric vector so Jupiter's oblate body becomes the unit sphere. */
function stretch(x: V3, pole: V3): V3 {
  const z = dot(x, pole);
  const eq = sub(x, scale(pole, z));
  return add(scale(eq, 1 / J_REQ), scale(pole, z / J_RPOL));
}

/**
 * Jupiter's four large moons at time `t` (ms), as seen from Earth: offsets, brightness, and transits,
 * occultations, eclipses and shadows on the disk. Moons are taken at the moment their light left them.
 */
export function galileanPositions(t: number): MoonPos[] {
  const date = new Date(t);
  const g = A.GeoVector(A.Body.Jupiter, date, true);
  const geo: V3 = [g.x, g.y, g.z];
  const distAu = len(geo);
  const distKm = distAu * AU_KM;
  const u = scale(geo, 1 / distAu); // line of sight, Earth → Jupiter
  const e = unit([-u[1], u[0], 0]); // east on the sky
  const n: V3 = [u[1] * e[2] - u[2] * e[1], u[2] * e[0] - u[0] * e[2], u[0] * e[1] - u[1] * e[0]]; // north
  const emitted = new Date(t - distAu * LIGHT_DAYS_PER_AU * 86_400_000);
  const moons = A.JupiterMoons(emitted);
  const h = A.HelioVector(A.Body.Jupiter, emitted);
  const helio: V3 = [h.x, h.y, h.z];
  const sunAu = len(helio);
  const toSun = scale(helio, -1 / sunAu); // from Jupiter towards the Sun
  const pole = POLES.jupiter;
  const umbraLength = (J_REQ * sunAu * AU_KM) / (SUN_RADIUS_KM - J_REQ);
  const uS = stretch(u, pole);
  const sunS = stretch(toSun, pole);
  const phaseDeg = Math.acos(Math.max(-1, Math.min(1, -dot(toSun, u)))) / DEG;

  return GALILEAN.map(({ id, key, h: H, beta }) => {
    const sv = moons[key];
    const m: V3 = [sv.x * AU_KM, sv.y * AU_KM, sv.z * AU_KM];
    const mS = stretch(m, pole);
    const dx = (dot(m, e) / distKm) * ARCSEC;
    const dy = (dot(m, n) / distKm) * ARCSEC;
    const onDisk = perp2(mS, uS) < 1;
    const inFront = dot(m, u) < 0;
    // In Jupiter's shadow: behind it as seen from the Sun, inside the (slowly narrowing) umbra.
    const behindSun = -dot(m, toSun);
    const shrink = Math.max(0, 1 - behindSun / umbraLength);
    const eclipsed = behindSun > 0 && perp2(mS, sunS) < shrink * shrink;
    // Its shadow on the cloud tops: the ray from the moon, away from the Sun, meeting Jupiter on the side we see.
    let shadow: { dx: number; dy: number } | null = null;
    if (dot(m, toSun) > 0 && perp2(mS, sunS) < 1) {
      const a = dot(sunS, sunS);
      const b = -2 * dot(mS, sunS);
      const c = dot(mS, mS) - 1;
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const lambda = (-b - Math.sqrt(disc)) / (2 * a);
        const pS = sub(mS, scale(sunS, lambda));
        const pz = dot(pS, pole);
        const p = add(scale(sub(pS, scale(pole, pz)), J_REQ), scale(pole, pz * J_RPOL));
        if (dot(p, u) < 0) shadow = { dx: (dot(p, e) / distKm) * ARCSEC, dy: (dot(p, n) / distKm) * ARCSEC };
      }
    }
    const mag = H + 5 * Math.log10(sunAu * distAu) + beta * phaseDeg;
    return { id, dx, dy, mag, transit: onDisk && inFront, occulted: onDisk && !inFront, eclipse: eclipsed ? "total" : null, shadow };
  });
}

/** Is a Galilean moon's shadow on Jupiter's disk at `t`? */
export function galileanShadowAt(t: number): boolean {
  return galileanPositions(t).some((p) => !!p.shadow);
}

const EVENT_TEST: Record<MoonEventKind, (p: MoonPos) => boolean> = {
  transit: (p) => p.transit,
  occultation: (p) => p.occulted,
  eclipse: (p) => p.eclipse !== null,
  shadow: (p) => !!p.shadow,
};
const KINDS = Object.keys(EVENT_TEST) as MoonEventKind[];

/**
 * Transits, shadow transits, eclipses and occultations of Jupiter's moons between `from` and `to`,
 * found on a 2-minute grid and refined to a few seconds.
 */
export function galileanEvents(from: number, to: number, stepMs = 120_000): MoonEvent[] {
  const out: MoonEvent[] = [];
  if (!(to > from)) return out;
  const times: number[] = [];
  for (let t = from; t < to; t += stepMs) times.push(t);
  times.push(to);
  const states = times.map((t) => galileanPositions(t));
  const refine = (i: number, k: number, kind: MoonEventKind) => {
    let lo = times[i - 1];
    let hi = times[i];
    const before = EVENT_TEST[kind](states[i - 1][k]);
    while (hi - lo > 4000) {
      const mid = (lo + hi) / 2;
      if (EVENT_TEST[kind](galileanPositions(mid)[k]) === before) lo = mid;
      else hi = mid;
    }
    return Math.round((lo + hi) / 2);
  };
  GALILEAN.forEach(({ id }, k) => {
    for (const kind of KINDS) {
      let open: number | null | undefined = EVENT_TEST[kind](states[0][k]) ? null : undefined;
      for (let i = 1; i < times.length; i++) {
        const was = EVENT_TEST[kind](states[i - 1][k]);
        const now = EVENT_TEST[kind](states[i][k]);
        if (now && !was) open = refine(i, k, kind);
        else if (!now && was) {
          out.push({ moon: id, kind, start: open ?? null, end: refine(i, k, kind) });
          open = undefined;
        }
      }
      if (open !== undefined) out.push({ moon: id, kind, start: open, end: null });
    }
  });
  return out.sort((a, b) => (a.start ?? from) - (b.start ?? from));
}

// -------------------------------------------------------------------------------------------------
// Moons from Horizons samples (Saturn, Mars, Uranus, Neptune)
// -------------------------------------------------------------------------------------------------

export interface MoonSeries {
  id: MoonId;
  /** Arcseconds east / north of the planet, one per sample. */
  x: number[];
  y: number[];
  mag: (number | null)[];
  /** Horizons visibility code per sample: * clear, t transit, O occulted, p/u partial/total eclipse, P/U occulted and eclipsed. */
  vis: string;
}

export interface MoonSeriesSet {
  planet: PlanetId;
  t0: number;
  step: number;
  moons: MoonSeries[];
  /** The planet's disk over these samples: sharpens transit and occultation times to the moment the moon crosses the limb. */
  disk?: PlanetDisk | null;
}

/** Catmull-Rom interpolation through samples i−1 … i+2. */
function cr(a: number[], i: number, f: number) {
  const n = a.length;
  const p = (k: number) => a[Math.max(0, Math.min(n - 1, k))];
  const p0 = p(i - 1);
  const p1 = p(i);
  const p2 = p(i + 1);
  const p3 = p(i + 2);
  return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
}

function codeState(code: string): Pick<MoonPos, "transit" | "occulted" | "eclipse"> {
  return {
    transit: code === "t",
    occulted: code === "O" || code === "P" || code === "U",
    eclipse: code === "u" || code === "U" ? "total" : code === "p" || code === "P" ? "partial" : null,
  };
}

/**
 * One moon's place between samples. In front of or behind the planet is decided geometrically — its
 * centre inside the limb — with the samples' codes saying which side, so states change at the true
 * moment, not at the nearest sample.
 */
function seriesMoonAt(set: MoonSeriesSet, s: MoonSeries, i: number, f: number): MoonPos {
  const m0 = s.mag[i];
  const m1 = s.mag[i + 1];
  const mag = m0 !== null && m1 !== null ? m0 + (m1 - m0) * f : (m0 ?? m1 ?? MOON_BY_ID[s.id].mag);
  const dx = cr(s.x, i, f);
  const dy = cr(s.y, i, f);
  const near = codeState(s.vis[f < 0.5 ? i : i + 1] ?? "*");
  if (!set.disk) return { id: s.id, dx, dy, mag, ...near };
  const a = codeState(s.vis[i] ?? "*");
  const b = codeState(s.vis[i + 1] ?? "*");
  const inside = onDisk(set.disk, dx, dy);
  return { id: s.id, dx, dy, mag, transit: inside && (a.transit || b.transit), occulted: inside && (a.occulted || b.occulted), eclipse: near.eclipse };
}

/** The moons at `t`, or null outside the samples. */
export function seriesPositions(set: MoonSeriesSet, t: number): MoonPos[] | null {
  const span = (set.moons[0]?.x.length ?? 0) - 1;
  const fi = (t - set.t0) / set.step;
  if (span < 1 || fi < 0 || fi > span) return null;
  const i = Math.min(span - 1, Math.floor(fi));
  return set.moons.map((s) => seriesMoonAt(set, s, i, fi - i));
}

/**
 * Transits, occultations and eclipses between `from` and `to`. With the planet's disk known, transits and
 * occultations follow the geometry minute by minute — the moon's centre inside the limb, the samples'
 * codes only saying in front or behind — so they start and end exactly when the slider shows them.
 * Eclipses, which the samples only flag, are timed to the sampling step (`approx`).
 */
export function seriesEvents(set: MoonSeriesSet, from: number, to: number): MoonEvent[] {
  const out: MoonEvent[] = [];
  const n = set.moons[0]?.x.length ?? 0;
  const i0 = Math.max(0, Math.ceil((from - set.t0) / set.step));
  const i1 = Math.min(n - 1, Math.floor((to - set.t0) / set.step));
  if (!(i1 > i0)) return out; // also when a time isn't a number

  const at = (i: number) => set.t0 + i * set.step;
  const mid = (i: number) => at(i) - set.step / 2;
  const t0 = Math.max(from, at(0));
  const t1 = Math.min(to, at(n - 1));
  for (const s of set.moons) {
    const kinds: ("transit" | "occultation" | "eclipse")[] = set.disk ? ["eclipse"] : ["transit", "occultation", "eclipse"];
    if (set.disk) {
      const disk = set.disk;
      const inside = (t: number) => {
        const fi = Math.min(n - 1 - 1e-9, Math.max(0, (t - set.t0) / set.step));
        const i = Math.floor(fi);
        return onDisk(disk, cr(s.x, i, fi - i), cr(s.y, i, fi - i));
      };
      const edge = (a: number, b: number) => {
        const was = inside(a);
        for (let k = 0; k < 6; k++) {
          const m = (a + b) / 2;
          if (inside(m) === was) a = m;
          else b = m;
        }
        return Math.round((a + b) / 2);
      };
      // Which side of the planet, from the samples' codes over an overlap.
      const side = (a: number, b: number) => {
        let front = 0;
        let back = 0;
        for (let i = Math.max(0, Math.floor((a - set.t0) / set.step)); i <= Math.min(n - 1, Math.ceil((b - set.t0) / set.step)); i++) {
          const c = codeState(s.vis[i] ?? "*");
          if (c.transit) front++;
          if (c.occulted) back++;
        }
        return back > front ? "occultation" : front > 0 ? "transit" : null;
      };
      let open: number | null | undefined = inside(t0) ? null : undefined;
      let prev = t0;
      for (let t = t0 + 60_000; ; t = Math.min(t + 60_000, t1)) {
        const now = inside(t);
        if (now && open === undefined) open = edge(prev, t);
        else if (!now && open !== undefined) {
          const end = edge(prev, t);
          const kind = side(open ?? t0, end);
          if (kind) out.push({ moon: s.id, kind, start: open, end });
          open = undefined;
        }
        prev = t;
        if (t >= t1) break;
      }
      if (open !== undefined) {
        const kind = side(open ?? t0, t1);
        if (kind) out.push({ moon: s.id, kind, start: open, end: null });
      }
    }
    for (const kind of kinds) {
      const test = (i: number) => {
        const st = codeState(s.vis[i] ?? "*");
        return kind === "transit" ? st.transit : kind === "occultation" ? st.occulted : st.eclipse !== null;
      };
      let open: number | null | undefined = test(i0) ? null : undefined;
      for (let i = i0 + 1; i <= i1; i++) {
        if (test(i) && !test(i - 1)) open = mid(i);
        else if (!test(i) && test(i - 1)) {
          out.push({ moon: s.id, kind, start: open ?? null, end: mid(i), approx: true });
          open = undefined;
        }
      }
      if (open !== undefined) out.push({ moon: s.id, kind, start: open, end: null, approx: true });
    }
  }
  return out.sort((a, b) => (a.start ?? from) - (b.start ?? from));
}

/** Iapetus's dark leading hemisphere faces us east of Saturn: about −0.85 mag at western elongation, +0.85 at eastern. */
export function iapetusBrightness(dxArcsec: number, saturnDistanceAu: number): number {
  const maxElong = (MOON_BY_ID.iapetus.aKm / (saturnDistanceAu * AU_KM)) * ARCSEC;
  return 0.85 * Math.max(-1, Math.min(1, dxArcsec / maxElong));
}

/** Greatest apparent distance from the planet (arcsec) at a given planet distance. */
export function maxElongation(m: MoonMeta, planetDistanceAu: number): number {
  return (m.aKm / (planetDistanceAu * AU_KM)) * ARCSEC;
}

/** A moon's typical distance from its planet (arcsec): two-thirds of the greatest, its average on the sky. */
export const typicalSeparation = (m: MoonMeta, planetDistanceAu: number) => maxElongation(m, planetDistanceAu) * (2 / Math.PI);

/**
 * How easy a planet's moon is at its typical distance from the planet: for lists and summaries (Explore,
 * Tonight, Plan, achievements). The moon's own page follows its real position through the night.
 */
export function typicalMoonDetect(m: MoonMeta, planet: { mag: number; distanceAu: number; name: string }, input: DetectInput): SatelliteDetect {
  return satelliteDetectability(m.mag, typicalSeparation(m, planet.distanceAu), planet.mag, planet.name, input);
}

// -------------------------------------------------------------------------------------------------
// Can it be seen? A faint point beside a bright planet.
// -------------------------------------------------------------------------------------------------

/**
 * Glare: the planet's scattered light (telescope and atmosphere) brightens the background near it
 * like a halo falling off as 1/r². K sets its strength; calibrated, with the index below, on observers'
 * experience: Titan easy in 60 mm, Rhea moderate in 100 mm, Enceladus and Triton a challenge in 200 mm,
 * Mimas very hard in 250 mm, Phobos at the limit of 300 mm, the Galilean moons easy in binoculars but
 * at the naked-eye limit.
 */
const GLARE_K = 3.9e-4; // arcsec²

export interface SatelliteDetect extends DetectResult {
  /** Magnitudes lost to the planet's glare. */
  glare: number;
  /** Aperture (mm) at which it becomes a fair challenge under this sky, if beyond this instrument. */
  needsMm: number | null;
}

/** How easy a moon is to see: a point source against the sky plus its planet's glare. */
export function satelliteDetectability(moonMag: number, sepArcsec: number, planetMag: number, planetName: string, input: DetectInput): SatelliteDetect {
  const base = detectability({ type: "planet", mag: moonMag }, input);
  const s = Math.max(sepArcsec, 1);
  const glareSB = planetMag + 2.5 * Math.log10((s * s) / GLARE_K);
  const glare = 1.25 * Math.log10(1 + Math.pow(10, -0.4 * (glareSB - base.skySB)));
  const lm = base.limitingMag - glare;
  // A moon sits beside a bright signpost, so you know exactly where to look: a point 1.2 mag above the
  // limit is easy, 0.2 above moderate, down to 0.8 below a challenge (the general star rule asks more).
  const index = lm - moonMag - 0.7;
  const difficulty = index >= 0.5 ? "easy" : index >= -0.5 ? "moderate" : index >= -1.5 ? "challenging" : index >= -2.5 ? "very hard" : "out of reach";
  // Where it would be a fair challenge (index −1): the limiting magnitude that needs, back to an aperture.
  const lmNeeded = moonMag - 0.3 + glare;
  const extra = lmNeeded - base.limitingMag;
  const needsMm = index < -1 && input.apertureMm > 10 ? Math.round(input.apertureMm * Math.pow(10, extra / 5)) : null;
  const note =
    difficulty === "out of reach"
      ? `Too faint for this instrument beside ${planetName}${needsMm && needsMm < 2000 ? ` — it takes about ${needsMm} mm` : ""}.`
      : glare >= 1.5
        ? `${planetName}'s glare is the main obstacle: use high power, and nudge ${planetName} just outside the field.`
        : difficulty === "easy"
          ? `An easy point of light beside ${planetName}.`
          : difficulty === "moderate"
            ? `A faint star-like point near ${planetName}; easiest when it's farthest from the planet.`
            : `A real test: steady air, high power and the moment it's farthest from ${planetName}.`;
  return { difficulty, index, skySB: base.skySB, limitingMag: lm, note, glare, needsMm };
}
