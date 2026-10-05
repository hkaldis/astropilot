import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateAchievements, type AchievementEvent } from "./achievements";

const DAY = 86_400_000;
const base = Date.UTC(2026, 0, 10, 21);
const ev = (i: number, over: Partial<AchievementEvent> = {}): AchievementEvent => {
  const t = over.t ?? base + i * 60_000;
  return { t, sessionId: 1, night: new Date(t).toISOString().slice(0, 10), key: `OBJ${i}`, ref: `OBJ${i}`, type: "galaxy", ...over };
};
const get = (list: ReturnType<typeof evaluateAchievements>, id: string) => list.find((a) => a.id === id)!;

test("achievements: empty journal earns nothing", () => {
  const list = evaluateAchievements([]);
  assert.ok(list.length > 30);
  assert.ok(list.every((a) => !a.earned && a.progress === 0 && a.earnedAt === null));
});

test("achievements: first light and distinct objects (repeats don't count twice)", () => {
  const events = [ev(0), ev(1), ev(1, { t: base + 10 * 60_000 }), ...Array.from({ length: 8 }, (_, i) => ev(i + 2))];
  const list = evaluateAchievements(events);
  assert.equal(get(list, "first-light:1").earned, true);
  assert.equal(get(list, "first-light:1").earnedAt, new Date(base).toISOString());
  assert.equal(get(list, "objects:10").earned, true);
  assert.equal(get(list, "objects:50").progress, 10);
  assert.equal(get(list, "galaxies:5").earned, true);
});

test("achievements: earnedAt is when the goal was crossed, even if events arrive unsorted", () => {
  const events = Array.from({ length: 10 }, (_, i) => ev(i)).reverse();
  const a = get(evaluateAchievements(events), "objects:10");
  assert.equal(a.earnedAt, new Date(base + 9 * 60_000).toISOString());
});

test("achievements: Messier counts numbers, planets need distinct planets, Moon isn't a planet", () => {
  const events = [
    ...Array.from({ length: 10 }, (_, i) => ev(i, { key: `M${i + 1}`, ref: `M${i + 1}`, m: i + 1 })),
    ev(20, { key: "JUPITER", ref: "jupiter", type: "planet" }),
    ev(21, { key: "SATURN", ref: "saturn", type: "planet" }),
    ev(22, { key: "MOON", ref: "moon", type: "moon" }),
    ev(23, { key: "MARS", ref: "mars", type: "planet" }),
  ];
  const list = evaluateAchievements(events);
  assert.equal(get(list, "messier:10").earned, true);
  assert.equal(get(list, "planets:3").earned, true);
  assert.equal(get(list, "planets:5").progress, 3);
});

test("achievements: streaks, marathons and seasons", () => {
  const nights = [0, 1, 2, 5, 6, 7, 8, 9, 10, 11].map((d) => ev(d, { t: base + d * DAY, key: "M42", ref: "M42" }));
  const list = evaluateAchievements(nights);
  assert.equal(get(list, "streak:3").earned, true);
  assert.equal(get(list, "streak:7").earned, true);
  assert.equal(get(list, "nights:5").earned, true);
  assert.equal(get(list, "marathon:10").progress, 1);

  const marathon = Array.from({ length: 12 }, (_, i) => ev(i, { night: "2026-03-20" }));
  assert.equal(get(evaluateAchievements(marathon), "marathon:10").earned, true);

  const seasons = ["2026-01-05", "2026-04-05", "2026-07-05", "2026-10-05"].map((night, i) => ev(i, { night, t: Date.parse(`${night}T21:00:00Z`) }));
  assert.equal(get(evaluateAchievements(seasons), "seasons:4").earned, true);
});

test("achievements: southern sky uses declination", () => {
  const list = evaluateAchievements([ev(0, { dec: -47.5 }), ev(1, { dec: -20 })]);
  assert.equal(get(list, "southern:1").earned, true);
  assert.equal(get(list, "southern:10").progress, 1);
});
