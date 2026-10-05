/**
 * Achievements, derived from the observing log every time (nothing stored), so they are always
 * consistent with the journal and apply retroactively to observations logged before they existed.
 */

export type Tier = "bronze" | "silver" | "gold" | "platinum";

export interface AchievementEvent {
  t: number; // when it was observed (ms)
  sessionId: number;
  night: string; // YYYY-MM-DD observing night
  key: string; // unique object key
  ref: string | null;
  type: string | null;
  m?: number; // Messier number
  c?: number; // Caldwell number
  showpiece?: boolean;
  dec?: number; // J2000 declination (deg)
}

export interface Achievement {
  id: string; // `${family}:${goal}`
  family: string;
  title: string;
  description: string;
  tier: Tier;
  goal: number;
  progress: number; // capped at goal
  earned: boolean;
  earnedAt: string | null;
  /** The observing night (YYYY-MM-DD, the evening's date at the site) the goal was reached. */
  earnedNight: string | null;
}

interface Family {
  id: string;
  title: string;
  /** Description for a goal, e.g. (10) => "Log 10 different Messier objects". */
  describe: (goal: number) => string;
  goals: [number, Tier][];
  /** Running counter: called for each event in time order, returns the new progress value. */
  make: () => (e: AchievementEvent) => number;
}

const NEBULA = new Set(["emission_nebula", "reflection_nebula", "planetary_nebula", "supernova_remnant", "cluster_nebula", "dark_nebula"]);
const PLANETS = new Set(["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune"]);

/** Count distinct object keys among events that match `pred`. */
const distinct = (pred: (e: AchievementEvent) => boolean) => () => {
  const seen = new Set<string>();
  return (e: AchievementEvent) => {
    if (pred(e)) seen.add(e.key);
    return seen.size;
  };
};

/** Meteorological season bucket of a night (Dec–Feb, Mar–May, …); the hemisphere doesn't change the count. */
const seasonOf = (night: string) => {
  const m = Number(night.slice(5, 7));
  return m === 12 || m <= 2 ? 0 : m <= 5 ? 1 : m <= 8 ? 2 : 3;
};

export const ACHIEVEMENT_FAMILIES: Family[] = [
  {
    id: "first-light",
    title: "First light",
    describe: () => "Log your first observation",
    goals: [[1, "bronze"]],
    make: distinct(() => true),
  },
  {
    id: "objects",
    title: "Explorer",
    describe: (g) => `See ${g} different objects`,
    goals: [
      [10, "bronze"],
      [50, "silver"],
      [150, "gold"],
      [300, "platinum"],
    ],
    make: distinct(() => true),
  },
  {
    id: "messier",
    title: "Messier hunter",
    describe: (g) => (g === 110 ? "See all 110 Messier objects" : `See ${g} Messier objects`),
    goals: [
      [10, "bronze"],
      [25, "silver"],
      [50, "gold"],
      [110, "platinum"],
    ],
    make: () => {
      const s = new Set<number>();
      return (e) => {
        if (e.m) s.add(e.m);
        return s.size;
      };
    },
  },
  {
    id: "caldwell",
    title: "Caldwell hunter",
    describe: (g) => (g === 109 ? "See all 109 Caldwell objects" : `See ${g} Caldwell objects`),
    goals: [
      [10, "bronze"],
      [25, "silver"],
      [50, "gold"],
      [109, "platinum"],
    ],
    make: () => {
      const s = new Set<number>();
      return (e) => {
        if (e.c) s.add(e.c);
        return s.size;
      };
    },
  },
  {
    id: "planets",
    title: "Grand tour",
    describe: (g) => (g === 7 ? "See all seven planets" : `See ${g} planets`),
    goals: [
      [3, "bronze"],
      [5, "silver"],
      [7, "gold"],
    ],
    make: distinct((e) => !!e.ref && PLANETS.has(e.ref.toLowerCase())),
  },
  {
    id: "galaxies",
    title: "Galaxy hunter",
    describe: (g) => `See ${g} galaxies`,
    goals: [
      [5, "bronze"],
      [25, "silver"],
      [75, "gold"],
    ],
    make: distinct((e) => e.type === "galaxy" || e.type === "galaxy_group"),
  },
  {
    id: "nebulae",
    title: "Nebula chaser",
    describe: (g) => `See ${g} nebulae`,
    goals: [
      [5, "bronze"],
      [20, "silver"],
      [50, "gold"],
    ],
    make: distinct((e) => !!e.type && NEBULA.has(e.type)),
  },
  {
    id: "globulars",
    title: "Globular collector",
    describe: (g) => `See ${g} globular clusters`,
    goals: [
      [5, "bronze"],
      [20, "silver"],
      [50, "gold"],
    ],
    make: distinct((e) => e.type === "globular_cluster"),
  },
  {
    id: "doubles",
    title: "Double-star splitter",
    describe: (g) => `Split ${g} double stars`,
    goals: [
      [5, "bronze"],
      [15, "silver"],
      [30, "gold"],
    ],
    make: distinct((e) => e.type === "double_star"),
  },
  {
    id: "showpieces",
    title: "Showpiece tour",
    describe: (g) => `See ${g} of the sky's showpieces`,
    goals: [
      [10, "bronze"],
      [25, "silver"],
      [40, "gold"],
    ],
    make: distinct((e) => !!e.showpiece),
  },
  {
    id: "marathon",
    title: "Marathon night",
    describe: (g) => `Log ${g} objects in a single night`,
    goals: [
      [10, "bronze"],
      [25, "silver"],
      [50, "gold"],
    ],
    make: () => {
      const per = new Map<string, Set<string>>();
      let best = 0;
      return (e) => {
        let s = per.get(e.night);
        if (!s) per.set(e.night, (s = new Set()));
        s.add(e.key);
        best = Math.max(best, s.size);
        return best;
      };
    },
  },
  {
    id: "nights",
    title: "Regular",
    describe: (g) => `Observe on ${g} different nights`,
    goals: [
      [5, "bronze"],
      [25, "silver"],
      [100, "gold"],
    ],
    make: () => {
      const nights = new Set<string>();
      return (e) => {
        nights.add(e.night);
        return nights.size;
      };
    },
  },
  {
    id: "streak",
    title: "On a roll",
    describe: (g) => `Observe ${g} nights in a row`,
    goals: [
      [3, "silver"],
      [7, "gold"],
    ],
    make: () => {
      const days = new Set<number>();
      let best = 0;
      return (e) => {
        const d = Math.round(Date.parse(`${e.night}T00:00:00Z`) / 86_400_000);
        days.add(d);
        let run = 1;
        while (days.has(d - run)) run++;
        let fwd = 1;
        while (days.has(d + fwd)) fwd++;
        best = Math.max(best, run + fwd - 1);
        return best;
      };
    },
  },
  {
    id: "southern",
    title: "Southern skies",
    describe: (g) => (g === 1 ? "See an object south of declination −35°" : `See ${g} objects south of −35°`),
    goals: [
      [1, "silver"],
      [10, "gold"],
    ],
    make: distinct((e) => typeof e.dec === "number" && e.dec < -35),
  },
  {
    id: "seasons",
    title: "All year round",
    describe: () => "Observe in all four seasons",
    goals: [[4, "gold"]],
    make: () => {
      const s = new Set<number>();
      return (e) => {
        s.add(seasonOf(e.night));
        return s.size;
      };
    },
  },
];

const TIER_RANK: Record<Tier, number> = { bronze: 1, silver: 2, gold: 3, platinum: 4 };

/** Evaluate every achievement over the observing history. */
export function evaluateAchievements(events: AchievementEvent[]): Achievement[] {
  const sorted = [...events].sort((a, b) => a.t - b.t);
  const out: Achievement[] = [];
  for (const f of ACHIEVEMENT_FAMILIES) {
    const step = f.make();
    const earnedAt = new Map<number, AchievementEvent>();
    let progress = 0;
    for (const e of sorted) {
      progress = step(e);
      for (const [goal] of f.goals) if (progress >= goal && !earnedAt.has(goal)) earnedAt.set(goal, e);
    }
    for (const [goal, tier] of f.goals) {
      const at = earnedAt.get(goal);
      out.push({
        id: `${f.id}:${goal}`,
        family: f.id,
        title: f.title,
        description: f.describe(goal),
        tier,
        goal,
        progress: Math.min(progress, goal),
        earned: at !== undefined,
        earnedAt: at !== undefined ? new Date(at.t).toISOString() : null,
        earnedNight: at?.night ?? null,
      });
    }
  }
  return out;
}

export function tierRank(t: Tier) {
  return TIER_RANK[t];
}
