import { test } from "node:test";
import assert from "node:assert/strict";
import catalogData from "./data/catalog.json";
import { evaluateAchievements, familyTotal, FAMILY_BY_ID, rankFor, type MemberLike, type ObservationEvent } from "./achievements";

const catalog = catalogData as unknown as (MemberLike & { name: string; ra: number })[];
const byId = new Map(catalog.map((o) => [o.id.toUpperCase(), o]));
const H = 3_600_000;
const D = 24 * H;
const base = Date.UTC(2026, 0, 10, 21);

/** An observation of a catalog object (or a solar-system body) at `t`. */
function ev(ref: string, t: number, over: Partial<ObservationEvent> = {}): ObservationEvent {
  const o = byId.get(ref.toUpperCase());
  return {
    t,
    night: new Date(t - 12 * H).toISOString().slice(0, 10),
    sessionId: 1,
    key: ref.toUpperCase(),
    ref,
    type: o?.type ?? (ref === "moon" ? "moon" : "planet"),
    m: o?.m,
    c: o?.c,
    showpiece: o?.showpiece,
    con: o?.con,
    mag: o?.mag,
    sep: o?.sep,
    dec: o?.dec,
    ...over,
  };
}
const fam = (r: ReturnType<typeof evaluateAchievements>, id: string) => r.find((f) => f.id === id)!;
const earned = (r: ReturnType<typeof evaluateAchievements>, id: string, goal: number) => fam(r, id).tiers.find((t) => t.goal === goal)!.earned;

test("achievements: an empty journal earns nothing and totals come from the catalog", () => {
  const r = evaluateAchievements([], catalog);
  assert.ok(r.length >= 30);
  assert.ok(r.every((f) => f.progress === 0 && f.tiers.every((t) => !t.earned)));
  assert.equal(familyTotal(FAMILY_BY_ID.get("messier")!, catalog), 110);
  assert.equal(familyTotal(FAMILY_BY_ID.get("caldwell")!, catalog), 109);
  assert.equal(fam(r, "messier").tiers.at(-1)!.goal, 110);
  assert.equal(fam(r, "solar").total, 8);
  for (const id of ["winter", "spring", "summer", "autumn", "southern"]) assert.equal(fam(r, id).total, 10, id);
});

test("achievements: Messier certificate at 70, earned on the observation that crossed it", () => {
  const ms = Array.from({ length: 70 }, (_, i) => ev(`M${i + 1}`, base + i * 60_000, { sessionId: 7 }));
  const r = evaluateAchievements([...ms, ev("M1", base + 999 * 60_000)], catalog);
  const t70 = fam(r, "messier").tiers.find((t) => t.goal === 70)!;
  assert.equal(t70.earned, true);
  assert.equal(t70.label, "Certificate (Astronomical League)");
  assert.equal(t70.via?.ref, "M70");
  assert.equal(t70.earnedAt, new Date(base + 69 * 60_000).toISOString());
  assert.equal(fam(r, "messier").progress, 70); // repeats don't count twice
  assert.equal(earned(r, "messier", 110), false);
  // 70 Messier objects in one night is also a Messier Marathon (gold at 50).
  assert.equal(earned(r, "messier-marathon", 50), true);
  assert.equal(earned(r, "marathon", 50), true);
});

test("achievements: seasonal list completes only when every member is logged", () => {
  const winter = ["M42", "M45", "M1", "M35", "M36", "M37", "M38", "M41", "M46"];
  let r = evaluateAchievements(winter.map((id, i) => ev(id, base + i * 60_000)), catalog);
  assert.equal(fam(r, "winter").progress, 9);
  assert.equal(earned(r, "winter", 10), false);
  r = evaluateAchievements([...winter, "M78"].map((id, i) => ev(id, base + i * 60_000)), catalog);
  assert.equal(earned(r, "winter", 10), true);
});

test("achievements: solar system, lunar phases, opposition and eclipse feats use the real sky", () => {
  // Moon on four nights a week apart: crescent, quarter, gibbous, full (phases differ).
  const moon = [0, 7, 11, 15].map((d) => ev("moon", Date.UTC(2026, 9, 12 + d, 19)));
  // Jupiter at its 2027 opposition (Feb 11) and Saturn's of 4 Oct 2026; Mars far from opposition.
  const planets = [ev("jupiter", Date.UTC(2027, 1, 12, 22)), ev("saturn", Date.UTC(2026, 9, 6, 22)), ev("mars", Date.UTC(2026, 9, 6, 22))];
  // The total lunar eclipse of 2026-03-03 (maximum ~11:34 UT).
  const eclipse = ev("moon", Date.UTC(2026, 2, 3, 11, 30));
  const r = evaluateAchievements([...moon, ...planets, eclipse], catalog);
  assert.ok(fam(r, "lunar-cycle").progress >= 4, `phases ${fam(r, "lunar-cycle").progress}`);
  assert.equal(earned(r, "lunar-cycle", 4), true);
  assert.equal(fam(r, "opposition").progress, 2);
  assert.equal(earned(r, "eclipse", 1), true);
  assert.equal(fam(r, "solar").progress, 4);
  assert.equal(earned(r, "solar", 4), true);
});

test("achievements: skills and habits", () => {
  const r = evaluateAchievements(
    [
      ev("epsilon-lyrae", base, { bortle: 2 }),
      ev("gamma-ceti", base + D),
      ev("M13", base + 2 * D, { siteLat: 52 }),
      // NGC 104 (47 Tuc, dec −72) from 22° S peaks at 40°: not a horizon object; from 10° N it would be below.
      ev("NGC104", base + 3 * D, { siteLat: -22 }),
      // Omega Centauri (dec −47.5) from 38° N peaks at 4.5°.
      ev("NGC5139", base + 4 * D, { siteLat: 38, notes: true, photos: true, instrument: "binoculars" }),
    ],
    catalog,
  );
  assert.equal(earned(r, "dark-sky", 1), true);
  assert.equal(fam(r, "tight-double").progress, 2);
  assert.equal(earned(r, "tight-double", 1), true);
  assert.equal(earned(r, "horizon", 1), true);
  assert.equal(fam(r, "horizon").progress, 1);
  assert.equal(earned(r, "clear-spell", 5), true);
  assert.equal(fam(r, "field-notes").progress, 1);
  assert.equal(earned(r, "photographer", 1), true);
  assert.equal(fam(r, "binoculars").progress, 1);
  assert.equal(earned(r, "southern", 10), false);
  assert.equal(fam(r, "southern").progress, 2);
});

test("achievements: months in a row and night owl", () => {
  const months = [0, 1, 2, 4].map((m) => ev("M42", Date.UTC(2026, m, 15, 21), { key: `M42-${m}` }));
  const r = evaluateAchievements([...months, ev("M45", Date.UTC(2026, 5, 1, 21)), ev("M1", Date.UTC(2026, 5, 2, 1, 30))], catalog);
  assert.equal(fam(r, "months").progress, 3);
  assert.equal(earned(r, "months", 3), true);
  assert.equal(earned(r, "night-owl", 4), true); // 21:00 → 01:30 in one night
  const owl = evaluateAchievements([ev("M45", base, { sessionHours: 5 })], catalog);
  assert.equal(earned(owl, "night-owl", 4), true);
});

test("achievements: observer rank", () => {
  assert.deepEqual(rankFor(0), { level: 1, title: "Stargazer", objects: 0, from: 0, next: { title: "Skywatcher", at: 5 } });
  assert.equal(rankFor(70).title, "Deep-sky Hunter");
  assert.equal(rankFor(1000).next, null);
});
