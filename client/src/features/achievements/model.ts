/** Achievement view-model: tiers, "up next" ranking and tonight's suggestions from the live sky. */
import { useMemo } from "react";
import { A, MOON_BY_ID, evaluateTarget, isMoonId, maxElongation, moonQuarters, planetaryEvents, satelliteDetectability, type RankedTarget, type SolarSystemId } from "@shared/astro";
import { FAMILY_BY_ID, familyMembers, type AchievementGroup } from "@shared/achievements";
import type { AchievementFamily, AchievementTierResult } from "@shared/api";
import type { CatalogObject } from "@shared/data/types";
import { useCatalog } from "@/hooks/useCatalog";
import { ratingOptics, useActiveScope } from "@/hooks/useScope";
import { evaluateBody, isSolarSystemId, siteKey, useNightContext, type BodyTonight, type NightContext } from "@/features/explore/sky";

export const GROUPS: { id: AchievementGroup; title: string; blurb: string }[] = [
  { id: "programs", title: "Observing programs", blurb: "Lists to work through — from your first Messier objects to the jewels of the far south." },
  { id: "deepsky", title: "Deep-sky collections", blurb: "How many of each kind of object you've seen." },
  { id: "feats", title: "Feats", blurb: "Moments and skills: eclipses, oppositions, faint fuzzies, tight doubles." },
  { id: "habits", title: "Habits", blurb: "The observing life — nights out, notes and photos." },
];

export const bestTier = (f: AchievementFamily): AchievementTierResult | null => [...f.tiers].reverse().find((t) => t.earned) ?? null;
export const nextTier = (f: AchievementFamily): AchievementTierResult | null => f.tiers.find((t) => !t.earned) ?? null;
/** 0..1 progress from the last tier to the next one. */
export const toNext = (f: AchievementFamily): number => {
  const next = nextTier(f);
  if (!next) return 1;
  return next.goal > 0 ? Math.min(1, f.progress / next.goal) : 0;
};
export const isComplete = (f: AchievementFamily) => f.tiers.every((t) => t.earned);
export const earnedCount = (fams: AchievementFamily[]) => fams.reduce((n, f) => n + f.tiers.filter((t) => t.earned).length, 0);
export const tierCount = (fams: AchievementFamily[]) => fams.reduce((n, f) => n + f.tiers.length, 0);

export interface EarnedItem {
  family: AchievementFamily;
  tier: AchievementTierResult;
}

/** Every earned tier, most recent first. */
export function earnedTimeline(fams: AchievementFamily[]): EarnedItem[] {
  const out: EarnedItem[] = [];
  for (const family of fams) for (const tier of family.tiers) if (tier.earned) out.push({ family, tier });
  return out.sort((a, b) => (b.tier.earnedAt ?? "").localeCompare(a.tier.earnedAt ?? ""));
}

const IRREGULAR: Record<string, string> = { galaxies: "galaxy", nebulae: "nebula", bodies: "body" };
/** "objects in one night" → "object in one night", "close pairs" → "close pair". */
const singular = (unit: string) => unit.replace(/\b(\w+?)(ies|ae|s)\b(?= in\b|$)/, (w, stem: string, end: string) => IRREGULAR[w] ?? (end === "ies" ? `${stem}y` : end === "ae" ? `${stem}a` : stem));

/** "70 Messier objects" / "4 hours in one night": what a tier asks for. */
export function goalText(f: AchievementFamily, t: AchievementTierResult): string {
  if (f.total !== null && t.goal === f.total && f.group === "programs" && !["constellations"].includes(f.id)) return `All ${t.goal}`;
  return `${t.goal} ${t.goal === 1 ? singular(f.unit) : f.unit}`;
}

/** A target worth trying tonight for an achievement. */
export interface Suggestion {
  id: string;
  name: string;
  difficulty: string;
  bestTime: number | null;
  score: number;
}

export interface UpNext {
  family: AchievementFamily;
  next: AchievementTierResult;
  remaining: number;
  suggestions: Suggestion[];
  hint: string | null;
}

const MAX_SUGGESTIONS = 3;

function catalogSuggestions(f: AchievementFamily, objects: CatalogObject[], seen: Set<string>, ctx: NightContext, optics: ReturnType<typeof ratingOptics>): Suggestion[] {
  const def = FAMILY_BY_ID.get(f.id);
  if (!def?.member) return [];
  const pool = familyMembers(def, objects).filter((o) => !seen.has(o.id.toUpperCase()));
  const ranked: RankedTarget<CatalogObject>[] = [];
  for (const o of pool) {
    const r = evaluateTarget(o, ctx.frames, { sqm: ctx.sqm, minAlt: ctx.minAlt, ...optics });
    if (!r.track.window || r.detect.difficulty === "out of reach" || r.detect.difficulty === "very hard") continue;
    ranked.push(r);
  }
  ranked.sort((a, b) => b.rawScore - a.rawScore);
  return ranked.slice(0, MAX_SUGGESTIONS).map((r) => ({ id: r.object.id, name: r.object.name, difficulty: r.detect.difficulty, bestTime: r.bestTime, score: r.score }));
}

/** The family's own planets or moons that are up tonight; a moon is rated beside its planet at a typical distance from it. */
function solarSuggestions(ids: string[], seen: Set<string>, ctx: NightContext, aperture: number): Suggestion[] {
  const out: Suggestion[] = [];
  const bodies = new Map<SolarSystemId, BodyTonight>();
  const body = (id: SolarSystemId) => {
    if (!bodies.has(id)) bodies.set(id, evaluateBody(id, ctx, aperture));
    return bodies.get(id)!;
  };
  for (const id of ids) {
    if (seen.has(id.toUpperCase())) continue;
    if (isMoonId(id)) {
      const m = MOON_BY_ID[id];
      const ev = body(m.parent);
      const i = ev.track.maxIdx;
      if (!ev.visible || i < 0) continue;
      const moon = ctx.frames.moon[i];
      const d = satelliteDetectability(m.mag, maxElongation(m, ev.state.distanceAu) * (2 / Math.PI), ev.state.mag, ev.meta.name, {
        sqmZenith: ctx.sqm,
        apertureMm: aperture,
        alt: Math.max(ev.track.maxAlt, 1),
        moon: moon && ev.track.moonSepAtBest !== null ? { alt: moon.alt, phaseAngle: ctx.frames.moonPhaseAngle, separation: ev.track.moonSepAtBest } : null,
        sunAlt: ctx.frames.sunAlt[i] ?? null,
      });
      if (d.difficulty === "out of reach" || d.difficulty === "very hard") continue;
      // Easiest first, then the higher planet.
      out.push({ id, name: m.name, difficulty: d.difficulty, bestTime: ev.bestTime, score: 10 * d.index + ev.track.maxAlt });
    } else if (isSolarSystemId(id)) {
      const ev = body(id);
      if (!ev.visible) continue;
      out.push({ id, name: ev.meta.name, difficulty: ev.detect?.difficulty ?? "easy", bestTime: ev.bestTime, score: ev.track.maxAlt });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, MAX_SUGGESTIONS);
}

/** "11 Oct" (with the year when asked) in the site's zone, so the date is the one at the site. */
function fmtDay(ms: number, tz: string | undefined, year = false) {
  try {
    return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: tz }).format(ms);
  } catch {
    return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) }).format(ms);
  }
}

/** A concrete next step for feats that depend on the calendar. */
function calendarHint(f: AchievementFamily, now: number, tz: string | undefined): string | null {
  switch (f.id) {
    case "lunar-cycle": {
      const q = moonQuarters(now, 35);
      return q.length ? `Next: ${q[0].name} on ${fmtDay(q[0].time, tz)}, then ${q[1]?.name ?? "the next phase"}${q[1] ? ` on ${fmtDay(q[1].time, tz)}` : ""}.` : f.hint;
    }
    case "opposition": {
      // An opposition up to ten days ago still counts, so search from then.
      const opp = planetaryEvents(now - 10 * 86_400_000, 430).filter((e) => e.kind === "opposition" && ["mars", "jupiter", "saturn"].includes(e.body));
      return opp.length ? `Next: ${opp[0].body.charAt(0).toUpperCase() + opp[0].body.slice(1)} at opposition on ${fmtDay(opp[0].time, tz)} — log it within ten days.` : f.hint;
    }
    case "eclipse": {
      try {
        let le = A.SearchLunarEclipse(new Date(now));
        for (let i = 0; i < 6 && le.kind === "penumbral"; i++) le = A.NextLunarEclipse(le.peak);
        const d = le.peak.date;
        return `Next partial or total lunar eclipse: ${fmtDay(d.getTime(), tz, true)} (check whether it's above your horizon).`;
      } catch {
        return f.hint;
      }
    }
    default:
      return f.hint;
  }
}

/**
 * What to work on next: families closest to their next tier, preferring ones you can advance tonight
 * (catalog members or planets that are well placed for your sky and instrument).
 */
export function useUpNext(fams: AchievementFamily[] | undefined, seenRefs: string[] | undefined, limit = 3): { items: UpNext[]; ready: boolean } {
  const { ctx } = useNightContext(10); // the same sampling as Explore and the object pages, so best times agree
  const { objects } = useCatalog();
  const scope = useActiveScope();
  const aperture = scope.kind === "eye" ? 7 : scope.scope.aperture;
  const items = useMemo(() => {
    if (!fams) return [];
    const seen = new Set((seenRefs ?? []).map((r) => r.toUpperCase()));
    const candidates = fams
      .map((family) => {
        const next = nextTier(family);
        if (!next) return null;
        return { family, next, remaining: Math.max(0, next.goal - family.progress), frac: next.goal ? family.progress / next.goal : 0 };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    const scored = candidates.map((c) => {
      const def = FAMILY_BY_ID.get(c.family.id);
      const suggestions = !ctx ? [] : def?.solar ? solarSuggestions(def.solar, seen, ctx, aperture) : def?.member && objects.length ? catalogSuggestions(c.family, objects, seen, ctx, ratingOptics(scope)) : [];
      const hint = suggestions.length ? null : calendarHint(c.family, ctx?.now ?? Date.now(), ctx?.tz);
      // Close to the next tier first; doable tonight is a big plus; huge remaining counts sink.
      const score = c.frac + (suggestions.length ? 0.6 : 0) - Math.min(0.4, c.remaining / 250) + (c.family.progress === 0 && c.family.group !== "feats" ? -0.2 : 0);
      return { ...c, suggestions, hint, score };
    });
    scored.sort((a, b) => b.score - a.score);
    // Keep a little variety: at most two from the same group.
    const out: UpNext[] = [];
    const perGroup: Record<string, number> = {};
    for (const s of scored) {
      if ((perGroup[s.family.group] ?? 0) >= 2) continue;
      perGroup[s.family.group] = (perGroup[s.family.group] ?? 0) + 1;
      out.push({ family: s.family, next: s.next, remaining: s.remaining, suggestions: s.suggestions, hint: s.hint });
      if (out.length >= limit) break;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fams, seenRefs, ctx?.night.date, ctx?.sqm, ctx?.minAlt, (ctx ? siteKey(ctx.site) : null), objects, aperture, scope.kind, scope.power, limit]);
  return { items, ready: !!fams && (!!ctx || !objects.length) };
}

/** Programs and collections an object counts towards (for object pages). */
export function familiesFor(o: { id: string; type: string; m?: number; c?: number; showpiece?: boolean; con?: string; mag?: number; sep?: number; dec?: number }) {
  const out: string[] = [];
  for (const def of FAMILY_BY_ID.values()) {
    if (def.solar ? def.solar.includes(o.id.toLowerCase()) : def.member?.(o)) out.push(def.id);
  }
  return out;
}
