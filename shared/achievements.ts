/**
 * Achievements: observing programs, deep-sky collections, feats and habits — all derived from the
 * observing log every time (nothing stored), so they always agree with the journal and apply
 * retroactively. Programs follow the spirit of the Astronomical League's observing programs (Messier
 * certificate at 70, Caldwell silver at 70 …); feats are tied to real sky events (oppositions, lunar
 * phases, eclipses) and observing skill (faint objects, tight doubles, objects on the horizon).
 *
 * The definitions are shared: the server evaluates them over the user's observations, and the client
 * uses the same membership rules for checklists and "up next tonight" suggestions.
 */
import { A } from "./astro/core";
import { moonPhaseName } from "./astro/night";
import { MOON_IDS, galileanShadowAt } from "./astro/moons";

export type Tier = "bronze" | "silver" | "gold" | "platinum";
export type AchievementGroup = "programs" | "deepsky" | "feats" | "habits";

/** The catalog fields membership rules look at (a catalog entry, or what an observation was of). */
export interface MemberLike {
  id: string;
  type: string;
  m?: number;
  c?: number;
  showpiece?: boolean;
  con?: string;
  mag?: number;
  sep?: number;
  dec?: number;
}

/** What we know about one logged observation (built on the server from the journal). */
export interface ObservationEvent {
  t: number; // when (ms)
  night: string; // the observing night, YYYY-MM-DD (evening date at the site)
  sessionId: number;
  key: string; // unique object key (catalog ref, upper case)
  ref: string | null;
  type: string | null;
  m?: number;
  c?: number;
  showpiece?: boolean;
  con?: string;
  mag?: number;
  sep?: number;
  dec?: number;
  bortle?: number | null; // the session's sky
  siteLat?: number | null; // where it was observed from
  instrument?: "eye" | "binoculars" | "telescope" | null;
  notes?: boolean;
  photos?: boolean;
  sessionHours?: number | null; // the session's logged length, when it has an end time
}

export interface Goal {
  /** How many; "all" = every member of the program in the catalog. */
  n: number | "all";
  tier: Tier;
  /** Optional name of the level, e.g. "AL certificate". */
  label?: string;
}

export interface FamilyDef {
  id: string;
  group: AchievementGroup;
  title: string;
  blurb: string;
  goals: Goal[];
  /** Catalog membership (programs and collections): drives checklists and suggestions. */
  member?: (o: MemberLike) => boolean;
  /** Solar-system members, by id. */
  solar?: string[];
  /** For feats/habits: how to make progress. */
  hint?: string;
  /** Running progress over events in time order (default: distinct members seen). */
  make?: () => (e: ObservationEvent) => number;
  /** What the progress counts, for display ("objects", "nights", "phases"…). */
  unit?: string;
}

export interface TierResult {
  id: string; // `${family}:${goal}`
  goal: number;
  tier: Tier;
  label: string | null;
  earned: boolean;
  earnedAt: string | null;
  earnedNight: string | null;
  /** The observation that completed it. */
  via: { ref: string | null; sessionId: number } | null;
}

export interface FamilyResult {
  id: string;
  group: AchievementGroup;
  title: string;
  blurb: string;
  hint: string | null;
  unit: string;
  progress: number;
  /** Members in the catalog, for programs and collections. */
  total: number | null;
  tiers: TierResult[];
}

export interface Rank {
  level: number;
  title: string;
  objects: number;
  /** Objects at which this rank starts, and the next one (null at the top). */
  from: number;
  next: { title: string; at: number } | null;
}

const SOLAR = ["moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune"];
const NEBULA = new Set(["emission_nebula", "reflection_nebula", "cluster_nebula", "supernova_remnant", "dark_nebula"]);
const DEEP_SKY = (t: string | null | undefined) => !!t && t !== "planet" && t !== "moon" && t !== "satellite" && t !== "double_star";
const list = (...ids: string[]) => {
  const set = new Set(ids.map((s) => s.toUpperCase()));
  return (o: MemberLike) => set.has(o.id.toUpperCase());
};
const caldwell = (...nums: number[]) => (o: MemberLike) => o.c !== undefined && nums.includes(o.c);

/** Distinct objects among events matching `pred`. */
const distinct = (pred: (e: ObservationEvent) => boolean) => () => {
  const seen = new Set<string>();
  return (e: ObservationEvent) => {
    if (pred(e)) seen.add(e.key);
    return seen.size;
  };
};

/** Largest number of distinct objects matching `pred` in a single night. */
const perNight = (pred: (e: ObservationEvent) => boolean) => () => {
  const nights = new Map<string, Set<string>>();
  let best = 0;
  return (e: ObservationEvent) => {
    if (!pred(e)) return best;
    let s = nights.get(e.night);
    if (!s) nights.set(e.night, (s = new Set()));
    s.add(e.key);
    best = Math.max(best, s.size);
    return best;
  };
};

const dayNumber = (night: string) => Math.round(Date.parse(`${night}T00:00:00Z`) / 86_400_000);
const monthNumber = (night: string) => Number(night.slice(0, 4)) * 12 + Number(night.slice(5, 7)) - 1;

/** Longest run of consecutive integers among those seen so far. */
const longestRun = (key: (e: ObservationEvent) => number) => () => {
  const seen = new Set<number>();
  let best = 0;
  return (e: ObservationEvent) => {
    const d = key(e);
    if (seen.has(d)) return best;
    seen.add(d);
    let lo = d;
    while (seen.has(lo - 1)) lo--;
    let hi = d;
    while (seen.has(hi + 1)) hi++;
    best = Math.max(best, hi - lo + 1);
    return best;
  };
};

// --- Sky events behind some feats (memoised: a journal can hold thousands of observations) -------

const DAY = 86_400_000;
const oppositionCache = new Map<string, number | null>();
/** Days between `t` and the nearest opposition of an outer planet. */
function daysFromOpposition(body: A.Body, t: number): number {
  const key = `${body}:${Math.floor(t / (20 * DAY))}`;
  let opp = oppositionCache.get(key);
  if (opp === undefined) {
    try {
      opp = A.SearchRelativeLongitude(body, 0, new Date(t - 40 * DAY)).date.getTime();
    } catch {
      opp = null;
    }
    if (oppositionCache.size > 5000) oppositionCache.clear();
    oppositionCache.set(key, opp);
  }
  return opp === null ? Infinity : Math.abs(opp - t) / DAY;
}

const eclipseCache = new Map<number, { start: number; end: number } | null>();
/** Whether `t` falls inside the partial (or total) phase of a lunar eclipse. */
function duringLunarEclipse(t: number): boolean {
  const key = Math.floor(t / DAY);
  let span = eclipseCache.get(key);
  if (span === undefined) {
    try {
      const le = A.SearchLunarEclipse(new Date(t - DAY));
      const peak = le.peak.date.getTime();
      span = le.kind === "penumbral" ? null : { start: peak - le.sd_partial * 60_000, end: peak + le.sd_partial * 60_000 };
    } catch {
      span = null;
    }
    if (eclipseCache.size > 5000) eclipseCache.clear();
    eclipseCache.set(key, span);
  }
  return !!span && t >= span.start && t <= span.end;
}

const planetBody: Record<string, A.Body> = { mars: A.Body.Mars, jupiter: A.Body.Jupiter, saturn: A.Body.Saturn };

const shadowCache = new Map<number, boolean>();
/** Whether one of Jupiter's moons cast its shadow on the planet at `t` (to the minute). */
function jovianShadowAt(t: number): boolean {
  const key = Math.round(t / 60_000);
  let hit = shadowCache.get(key);
  if (hit === undefined) {
    // A logged time is rarely exact: a shadow within ten minutes of it counts.
    hit = [-10, -5, 0, 5, 10].some((m) => galileanShadowAt(t + m * 60_000));
    if (shadowCache.size > 5000) shadowCache.clear();
    shadowCache.set(key, hit);
  }
  return hit;
}
const JOVIAN = new Set(["jupiter", "io", "europa", "ganymede", "callisto"]);

// --- Definitions ---------------------------------------------------------------------------------

export const FAMILIES: FamilyDef[] = [
  // Programs: lists you work through.
  {
    id: "messier",
    unit: "Messier objects",
    group: "programs",
    title: "Messier Catalog",
    blurb: "Charles Messier's 110 classic deep-sky objects — the observer's first great list.",
    member: (o) => o.m !== undefined,
    goals: [
      { n: 10, tier: "bronze" },
      { n: 35, tier: "silver" },
      { n: 70, tier: "gold", label: "Certificate (Astronomical League)" },
      { n: "all", tier: "platinum", label: "Honorary certificate" },
    ],
  },
  {
    id: "caldwell",
    unit: "Caldwell objects",
    group: "programs",
    title: "Caldwell Catalog",
    blurb: "Patrick Moore's 109 showpieces Messier missed, from the far north to the deep south.",
    member: (o) => o.c !== undefined,
    goals: [
      { n: 10, tier: "bronze" },
      { n: 35, tier: "silver" },
      { n: 70, tier: "gold", label: "Silver (Astronomical League)" },
      { n: "all", tier: "platinum", label: "Gold (Astronomical League)" },
    ],
  },
  {
    id: "showpieces",
    unit: "showpieces",
    group: "programs",
    title: "Showpieces",
    blurb: "The sky's most spectacular sights, chosen for how they look in the eyepiece.",
    member: (o) => !!o.showpiece,
    goals: [
      { n: 10, tier: "bronze" },
      { n: 30, tier: "silver" },
      { n: "all", tier: "gold" },
    ],
  },
  {
    id: "solar",
    unit: "Solar System bodies",
    group: "programs",
    title: "Solar System",
    blurb: "The Moon and all seven planets, out to faint blue Neptune.",
    solar: SOLAR,
    goals: [
      { n: 4, tier: "bronze" },
      { n: 6, tier: "silver" },
      { n: "all", tier: "gold", label: "Grand tour" },
    ],
  },
  {
    id: "moons",
    unit: "moons",
    group: "programs",
    title: "Moons of the Planets",
    blurb: "From Jupiter's four to Titan, Triton and the moons of Uranus — every moon within a backyard telescope's reach.",
    solar: MOON_IDS,
    goals: [
      { n: 4, tier: "bronze" },
      { n: 8, tier: "silver" },
      { n: 12, tier: "gold" },
      { n: "all", tier: "platinum", label: "Every moon within reach" },
    ],
  },
  {
    id: "doubles",
    unit: "double stars",
    group: "programs",
    title: "Double Stars",
    blurb: "Coloured pairs, close splits and multiple systems.",
    member: (o) => o.type === "double_star",
    goals: [
      { n: 10, tier: "bronze" },
      { n: 25, tier: "silver" },
      { n: "all", tier: "gold" },
    ],
  },
  {
    id: "constellations",
    group: "programs",
    title: "Constellations",
    blurb: "Observe something in each constellation — a tour of the whole celestial sphere.",
    member: (o) => !!o.con && o.type !== "planet" && o.type !== "moon",
    unit: "constellations",
    make: () => {
      const seen = new Set<string>();
      return (e) => {
        if (e.con && e.type !== "planet" && e.type !== "moon") seen.add(e.con);
        return seen.size;
      };
    },
    goals: [
      { n: 10, tier: "bronze" },
      { n: 30, tier: "silver" },
      { n: 50, tier: "gold" },
      { n: "all", tier: "platinum", label: "Every constellation in the catalog" },
    ],
  },
  {
    id: "winter",
    group: "programs",
    title: "The Winter Sky",
    blurb: "Orion, Taurus, Auriga and the winter Milky Way (northern winter, southern summer).",
    member: list("M42", "M45", "M1", "M35", "M36", "M37", "M38", "M41", "M46", "M78"),
    goals: [{ n: "all", tier: "gold" }],
  },
  {
    id: "spring",
    group: "programs",
    title: "The Spring Galaxies",
    blurb: "Galaxy season: Ursa Major, Leo and Virgo, away from the Milky Way.",
    member: list("M44", "M81", "M82", "M51", "M104", "M64", "M65", "M66", "M3", "M97"),
    goals: [{ n: "all", tier: "gold" }],
  },
  {
    id: "summer",
    group: "programs",
    title: "The Summer Milky Way",
    blurb: "Sagittarius to Cygnus: nebulae, globulars and the richest star fields.",
    member: list("M13", "M57", "M27", "M8", "M20", "M17", "M16", "M11", "M22", "albireo"),
    goals: [{ n: "all", tier: "gold" }],
  },
  {
    id: "autumn",
    group: "programs",
    title: "The Autumn Sky",
    blurb: "Andromeda, Pegasus and Perseus: big galaxies and bright clusters.",
    member: list("M31", "M110", "M33", "M15", "M2", "C14", "M52", "NGC7662", "M76", "almach"),
    goals: [{ n: "all", tier: "gold" }],
  },
  {
    id: "southern",
    group: "programs",
    title: "Southern Jewels",
    blurb: "The deep-south showpieces: Magellanic Clouds, 47 Tucanae, Omega Centauri, the Jewel Box.",
    member: (o) => caldwell(106, 80, 94, 92, 103, 91, 102, 96)(o) || list("ESO56-115", "NGC292")(o),
    goals: [{ n: "all", tier: "platinum" }],
  },

  // Deep-sky collections: open-ended counts by kind of object.
  {
    id: "galaxies",
    unit: "galaxies",
    group: "deepsky",
    title: "Galaxy Hunter",
    blurb: "Island universes beyond the Milky Way.",
    member: (o) => o.type === "galaxy" || o.type === "galaxy_group",
    goals: [
      { n: 10, tier: "bronze" },
      { n: 50, tier: "silver" },
      { n: 150, tier: "gold" },
    ],
  },
  {
    id: "nebulae",
    unit: "nebulae",
    group: "deepsky",
    title: "Nebula Chaser",
    blurb: "Glowing gas, reflection nebulae and supernova remnants.",
    member: (o) => NEBULA.has(o.type),
    goals: [
      { n: 10, tier: "bronze" },
      { n: 30, tier: "silver" },
      { n: 60, tier: "gold" },
    ],
  },
  {
    id: "planetaries",
    unit: "planetary nebulae",
    group: "deepsky",
    title: "Planetary Nebulae",
    blurb: "The shells of dying Sun-like stars: rings, disks and blinking eyes.",
    member: (o) => o.type === "planetary_nebula",
    goals: [
      { n: 5, tier: "bronze" },
      { n: 15, tier: "silver" },
      { n: 30, tier: "gold" },
    ],
  },
  {
    id: "globulars",
    unit: "globular clusters",
    group: "deepsky",
    title: "Globular Clusters",
    blurb: "Ancient balls of hundreds of thousands of stars.",
    member: (o) => o.type === "globular_cluster",
    goals: [
      { n: 10, tier: "bronze" },
      { n: 30, tier: "silver" },
      { n: 60, tier: "gold" },
    ],
  },
  {
    id: "openclusters",
    unit: "open clusters",
    group: "deepsky",
    title: "Open Clusters",
    blurb: "Young star families scattered along the Milky Way.",
    member: (o) => o.type === "open_cluster" || o.type === "asterism" || o.type === "star_cloud",
    goals: [
      { n: 10, tier: "bronze" },
      { n: 50, tier: "silver" },
      { n: 150, tier: "gold" },
    ],
  },

  // Feats: moments and skills.
  {
    id: "first-light",
    group: "feats",
    title: "First Light",
    blurb: "Your first logged observation.",
    hint: "Log anything you see tonight — the Moon counts.",
    make: distinct(() => true),
    goals: [{ n: 1, tier: "bronze" }],
  },
  {
    id: "marathon",
    group: "feats",
    title: "Marathon Night",
    blurb: "Many objects in a single night.",
    hint: "Pick a long, moonless night and work through a plan.",
    unit: "objects in one night",
    make: perNight(() => true),
    goals: [
      { n: 20, tier: "silver" },
      { n: 50, tier: "gold" },
    ],
  },
  {
    id: "messier-marathon",
    group: "feats",
    title: "Messier Marathon",
    blurb: "Messier objects in a single night — the classic all-nighter around the March new Moon.",
    hint: "In March or early April, around new Moon, from dusk to dawn (best from 20–30° N).",
    unit: "Messier objects in one night",
    make: perNight((e) => e.m !== undefined),
    goals: [
      { n: 50, tier: "gold" },
      { n: 100, tier: "platinum" },
    ],
  },
  {
    id: "night-owl",
    group: "feats",
    title: "Night Owl",
    blurb: "A long night at the eyepiece.",
    hint: "Stay out for four hours (log with times, or give the session an end time).",
    unit: "hours in one night",
    make: () => {
      const nights = new Map<string, { min: number; max: number; logged: number }>();
      let best = 0;
      return (e) => {
        let n = nights.get(e.night);
        if (!n) nights.set(e.night, (n = { min: e.t, max: e.t, logged: 0 }));
        n.min = Math.min(n.min, e.t);
        n.max = Math.max(n.max, e.t);
        n.logged = Math.max(n.logged, e.sessionHours ?? 0);
        best = Math.max(best, Math.floor(Math.max((n.max - n.min) / 3_600_000, n.logged)));
        return best;
      };
    },
    goals: [{ n: 4, tier: "silver" }],
  },
  {
    id: "lunar-cycle",
    group: "feats",
    title: "Lunar Cycle",
    blurb: "The Moon in every phase, crescent to full and back.",
    hint: "Log the Moon at a phase you haven't yet — each one shows different features along the terminator.",
    unit: "phases",
    make: () => {
      const phases = new Set<string>();
      return (e) => {
        if (e.ref?.toLowerCase() === "moon") phases.add(moonPhaseName(A.MoonPhase(new Date(e.t))));
        return phases.size;
      };
    },
    goals: [
      { n: 4, tier: "silver" },
      { n: 8, tier: "gold" },
    ],
  },
  {
    id: "opposition",
    group: "feats",
    title: "Opposition Watch",
    blurb: "Mars, Jupiter or Saturn within ten days of opposition, when they are biggest and brightest.",
    hint: "Watch the events list for the next opposition.",
    unit: "planets",
    make: () => {
      const got = new Set<string>();
      return (e) => {
        const id = e.ref?.toLowerCase() ?? "";
        const body = planetBody[id];
        if (body && !got.has(id) && daysFromOpposition(body, e.t) <= 10) got.add(id);
        return got.size;
      };
    },
    goals: [
      { n: 1, tier: "silver" },
      { n: 3, tier: "gold", label: "Mars, Jupiter and Saturn" },
    ],
  },
  {
    id: "eclipse",
    group: "feats",
    title: "Eclipse Witness",
    blurb: "The Moon during a partial or total lunar eclipse.",
    hint: "Log the Moon while it's in Earth's shadow — the events list shows the next eclipse.",
    make: () => {
      let n = 0;
      return (e) => {
        if (n === 0 && e.ref?.toLowerCase() === "moon" && duringLunarEclipse(e.t)) n = 1;
        return n;
      };
    },
    goals: [{ n: 1, tier: "gold" }],
  },
  {
    id: "shadow-play",
    group: "feats",
    title: "Shadow Play",
    blurb: "Jupiter while one of its moons casts a black shadow on the cloud tops.",
    hint: "Jupiter's page lists tonight's shadow transits; log Jupiter (or the moon) while one is under way.",
    make: () => {
      let n = 0;
      return (e) => {
        if (n === 0 && JOVIAN.has(e.ref?.toLowerCase() ?? "") && jovianShadowAt(e.t)) n = 1;
        return n;
      };
    },
    goals: [{ n: 1, tier: "gold" }],
  },
  {
    id: "dark-sky",
    group: "feats",
    title: "Pristine Skies",
    blurb: "Observe under a truly dark sky (Bortle 1–2).",
    hint: "Log a session at a dark-sky site — the Milky Way should cast shadows.",
    make: distinct((e) => e.bortle !== null && e.bortle !== undefined && e.bortle <= 2),
    goals: [{ n: 1, tier: "silver" }],
  },
  {
    id: "city-lights",
    group: "feats",
    title: "City Astronomer",
    blurb: "Deep-sky objects seen through city light (Bortle 7–9).",
    hint: "Bright clusters, planetaries and doubles cut through light pollution.",
    unit: "deep-sky objects",
    make: distinct((e) => (e.bortle ?? 0) >= 7 && DEEP_SKY(e.type)),
    goals: [
      { n: 10, tier: "bronze" },
      { n: 25, tier: "silver" },
    ],
  },
  {
    id: "tight-double",
    group: "feats",
    title: "Splitting Hairs",
    blurb: "Split double stars closer than 3″ — a test of optics, seeing and patience.",
    hint: "Try the Double Double (ε Lyrae) at high power on a steady night.",
    unit: "close pairs",
    member: (o) => o.type === "double_star" && o.sep !== undefined && o.sep < 3,
    goals: [
      { n: 1, tier: "silver" },
      { n: 3, tier: "gold" },
    ],
  },
  {
    id: "faint",
    group: "feats",
    title: "Faint Fuzzies",
    blurb: "Deep-sky objects fainter than magnitude 11.",
    hint: "A dark, moonless night, averted vision and patience.",
    member: (o) => DEEP_SKY(o.type) && o.mag !== undefined && o.mag >= 11,
    goals: [
      { n: 1, tier: "silver" },
      { n: 10, tier: "gold" },
    ],
  },
  {
    id: "horizon",
    group: "feats",
    title: "Horizon Hunter",
    blurb: "An object that never climbs higher than 15° from where you observed it.",
    hint: "Look for deep-southern (or far-northern) objects that just skim your horizon.",
    make: distinct((e) => {
      if (e.siteLat === null || e.siteLat === undefined || e.dec === undefined) return false;
      const peak = 90 - Math.abs(e.siteLat - e.dec);
      return peak > 0 && peak < 15;
    }),
    goals: [{ n: 1, tier: "gold" }],
  },
  {
    id: "binoculars",
    group: "feats",
    title: "Binocular Astronomer",
    blurb: "Objects logged with binoculars.",
    hint: "Choose your binoculars when logging — many showpieces look their best in a wide field.",
    make: distinct((e) => e.instrument === "binoculars"),
    goals: [
      { n: 10, tier: "bronze" },
      { n: 50, tier: "silver" },
    ],
  },

  // Habits: the observing life.
  {
    id: "nights",
    group: "habits",
    title: "Regular Observer",
    blurb: "Nights under the sky.",
    unit: "nights",
    make: () => {
      const nights = new Set<string>();
      return (e) => {
        nights.add(e.night);
        return nights.size;
      };
    },
    goals: [
      { n: 5, tier: "bronze" },
      { n: 25, tier: "silver" },
      { n: 100, tier: "gold" },
    ],
  },
  {
    id: "months",
    group: "habits",
    title: "Year-round Observer",
    blurb: "Consecutive months with at least one night out — whatever the weather does.",
    hint: "One clear evening a month keeps the run going.",
    unit: "months in a row",
    make: longestRun((e) => monthNumber(e.night)),
    goals: [
      { n: 3, tier: "bronze" },
      { n: 6, tier: "silver" },
      { n: 12, tier: "gold", label: "A full year" },
    ],
  },
  {
    id: "clear-spell",
    group: "habits",
    title: "Clear Spell",
    blurb: "Observe on consecutive nights while the weather holds.",
    unit: "nights in a row",
    make: longestRun((e) => dayNumber(e.night)),
    goals: [
      { n: 3, tier: "silver" },
      { n: 5, tier: "gold" },
    ],
  },
  {
    id: "seasons",
    group: "habits",
    title: "All Seasons",
    blurb: "Observe in every season of the year.",
    unit: "seasons",
    make: () => {
      const s = new Set<number>();
      return (e) => {
        const m = Number(e.night.slice(5, 7));
        s.add(m === 12 || m <= 2 ? 0 : m <= 5 ? 1 : m <= 8 ? 2 : 3);
        return s.size;
      };
    },
    goals: [{ n: 4, tier: "gold" }],
  },
  {
    id: "field-notes",
    group: "habits",
    title: "Field Notes",
    blurb: "Observations with written notes — the habit that makes you see more.",
    hint: "Jot down what you saw: shape, brightness, colour, detail with averted vision.",
    unit: "observations",
    make: () => {
      let n = 0;
      return (e) => (e.notes ? ++n : n);
    },
    goals: [
      { n: 10, tier: "bronze" },
      { n: 50, tier: "silver" },
      { n: 200, tier: "gold" },
    ],
  },
  {
    id: "photographer",
    group: "habits",
    title: "Astrophotographer",
    blurb: "Observations with photos attached.",
    unit: "observations",
    make: () => {
      let n = 0;
      return (e) => (e.photos ? ++n : n);
    },
    goals: [
      { n: 1, tier: "bronze" },
      { n: 10, tier: "silver" },
      { n: 50, tier: "gold" },
    ],
  },
];

export const FAMILY_BY_ID = new Map(FAMILIES.map((f) => [f.id, f]));

const eventAsMember = (e: ObservationEvent): MemberLike => ({ id: e.ref ?? e.key, type: e.type ?? "", m: e.m, c: e.c, showpiece: e.showpiece, con: e.con, mag: e.mag, sep: e.sep, dec: e.dec });

/** Does an event (an observation) count towards a list-type family? */
export function eventCounts(f: FamilyDef, e: ObservationEvent): boolean {
  if (f.solar) return !!e.ref && f.solar.includes(e.ref.toLowerCase());
  return !!f.member && !!e.ref && f.member(eventAsMember(e));
}

/** Catalog members of a family (programs and collections). */
export function familyMembers<T extends MemberLike>(f: FamilyDef, catalog: T[]): T[] {
  return f.member ? catalog.filter((o) => f.member!(o)) : [];
}

/** Number of members a family's "all" goal means, given the catalog. */
export function familyTotal(f: FamilyDef, catalog: MemberLike[]): number | null {
  if (f.solar) return f.solar.length;
  if (!f.member) return null;
  if (f.id === "constellations") return new Set(catalog.filter((o) => f.member!(o)).map((o) => o.con)).size;
  return catalog.filter((o) => f.member!(o)).length;
}

/** Evaluate every family over the observing history. */
export function evaluateAchievements(events: ObservationEvent[], catalog: MemberLike[]): FamilyResult[] {
  const sorted = [...events].sort((a, b) => a.t - b.t);
  return FAMILIES.map((f) => {
    const total = familyTotal(f, catalog);
    const goals = f.goals.map((g) => ({ ...g, n: g.n === "all" ? (total ?? 0) : g.n })).filter((g) => g.n > 0);
    const step = f.make ? f.make() : distinct((e) => eventCounts(f, e))();
    const reached = new Map<number, ObservationEvent>();
    let progress = 0;
    for (const e of sorted) {
      progress = step(e);
      for (const g of goals) if (progress >= g.n && !reached.has(g.n)) reached.set(g.n, e);
    }
    return {
      id: f.id,
      group: f.group,
      title: f.title,
      blurb: f.blurb,
      hint: f.hint ?? null,
      unit: f.unit ?? "objects",
      progress,
      total,
      tiers: goals.map((g) => {
        const at = reached.get(g.n);
        return {
          id: `${f.id}:${g.n}`,
          goal: g.n,
          tier: g.tier,
          label: g.label ?? null,
          earned: !!at,
          earnedAt: at ? new Date(at.t).toISOString() : null,
          earnedNight: at?.night ?? null,
          via: at ? { ref: at.ref, sessionId: at.sessionId } : null,
        };
      }),
    };
  });
}

const RANKS: [number, string][] = [
  [0, "Stargazer"],
  [5, "Skywatcher"],
  [15, "Observer"],
  [35, "Explorer"],
  [70, "Deep-sky Hunter"],
  [110, "Seasoned Observer"],
  [200, "Master Observer"],
  [350, "Grand Master"],
];

/** Observer rank by the number of different objects seen. */
export function rankFor(objects: number): Rank {
  let i = 0;
  while (i + 1 < RANKS.length && objects >= RANKS[i + 1][0]) i++;
  const next = RANKS[i + 1];
  return { level: i + 1, title: RANKS[i][1], objects, from: RANKS[i][0], next: next ? { title: next[1], at: next[0] } : null };
}

export const TIER_POINTS: Record<Tier, number> = { bronze: 1, silver: 2, gold: 4, platinum: 8 };
