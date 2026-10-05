/** Run: npx tsx --test shared/astro/conditions.test.ts */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type HourScoreInput,
  CONFIDENCE_MODEL,
  bulkRichardson,
  cloudAgreement,
  cloudFactor,
  dewRisk,
  effectiveCloud,
  estimateSeeing,
  estimateTransparency,
  fogRisk,
  hourScores,
  nightScore,
  slotInstant,
  slotPreceding,
  slotWind,
  verdictOf,
} from "./conditions";
import { sqmForBortle } from "./visibility";

interface Weather {
  cloud?: number;
  cloudLow?: number;
  cloudMid?: number;
  cloudHigh?: number;
  precipProb?: number;
  wind?: number;
  gust?: number;
  jet?: number;
  humidity?: number;
  aod?: number | null;
  visibility?: number;
}

/** Build a scored hour from plain weather plus Sun/Moon geometry, the way the server does. */
function hour(w: Weather, sky: { sunAlt?: number; moonAlt?: number; moonIllum?: number; bortle?: number } = {}) {
  const x = { cloud: 2, cloudLow: 0, cloudMid: 0, cloudHigh: 2, precipProb: 0, wind: 6, gust: 12, jet: 50, humidity: 55, aod: 0.07, visibility: 40_000, ...w };
  const seeing = estimateSeeing({ jet: x.jet, wind: x.wind, gust: x.gust });
  const tr = estimateTransparency({ humidity: x.humidity, cloudHigh: x.cloudHigh, aod: x.aod, visibility: x.visibility });
  const input: HourScoreInput = {
    cloud: x.cloud,
    cloudLow: x.cloudLow,
    cloudMid: x.cloudMid,
    cloudHigh: x.cloudHigh,
    precipProb: x.precipProb,
    wind: x.wind,
    gust: x.gust,
    seeing: seeing.value,
    transparency: tr.value,
    extinction: tr.extinction,
    sunAlt: sky.sunAlt ?? -30,
    moonAlt: sky.moonAlt ?? -20,
    moonIllum: sky.moonIllum ?? 0.02,
    sqm: sqmForBortle(sky.bortle ?? 4),
  };
  return { ...hourScores(input), seeing, transparency: tr };
}

/** A full night: 8 dark hours with the given weather; the Moon (if any) arcs from 15° to 50° and back. */
function night(w: Weather, opts: { moonIllum?: number; moonUp?: boolean; bortle?: number } = {}) {
  const hours = Array.from({ length: 8 }, (_, i) => {
    const moonAlt = opts.moonUp ? 15 + 35 * Math.sin((Math.PI * (i + 0.5)) / 8) : -20;
    return hour(w, { sunAlt: -30, moonAlt, moonIllum: opts.moonIllum ?? 0.02, bortle: opts.bortle });
  });
  const agg = (k: "score" | "dsoScore" | "planetScore") => nightScore(hours.map((h) => ({ score: h[k], weight: 1 })));
  return { hours, score: agg("score"), dsoScore: agg("dsoScore"), planetScore: agg("planetScore") };
}

test("clear, dark, moonless night → excellent for everything", () => {
  const n = night({}, { bortle: 3 });
  assert.equal(verdictOf(n.score), "excellent", `score ${n.score}`);
  assert.equal(verdictOf(n.dsoScore), "excellent", `dso ${n.dsoScore}`);
  assert.equal(verdictOf(n.planetScore), "excellent", `planets ${n.planetScore}`);
  assert.ok(n.hours[0].seeing.scale >= 4, "calm air and a weak jet should give good seeing");
  assert.ok(n.hours[0].transparency.scale >= 4, "clean dry air should be transparent");
});

test("overcast night → bad, whatever the other conditions", () => {
  const n = night({ cloud: 100, cloudLow: 95, cloudMid: 90, cloudHigh: 80 });
  assert.equal(verdictOf(n.score), "bad", `score ${n.score}`);
  assert.equal(verdictOf(n.dsoScore), "bad");
  assert.equal(verdictOf(n.planetScore), "bad");
  assert.ok(n.score <= 5, "overcast must score near zero");
  // Even perfect seeing and transparency cannot rescue it.
  const h = hourScores({ ...baseInput(), cloud: 100, cloudLow: 100, cloudMid: 100, cloudHigh: 100, seeing: 5, transparency: 5 });
  assert.ok(h.score <= 2 && h.planetScore <= 2 && h.dsoScore <= 2);
});

test("full Moon, clear → good planets, poor-to-fair deep-sky, general score unaffected", () => {
  const moonless = night({}, { bortle: 4 });
  const full = night({}, { bortle: 4, moonIllum: 0.99, moonUp: true });
  assert.ok(["good", "excellent"].includes(verdictOf(full.planetScore)), `planets ${full.planetScore}`);
  assert.ok(["poor", "fair"].includes(verdictOf(full.dsoScore)), `dso ${full.dsoScore}`);
  assert.equal(full.score, moonless.score, "the Moon is not part of the general score");
  assert.equal(full.planetScore, moonless.planetScore, "the Moon does not affect the planet score");
  // A crescent costs deep-sky far less than a full Moon.
  const crescent = night({}, { bortle: 4, moonIllum: 0.12, moonUp: true });
  assert.ok(crescent.dsoScore > full.dsoScore + 25, `crescent ${crescent.dsoScore} vs full ${full.dsoScore}`);
});

test("high wind → planet score drops (seeing and shake)", () => {
  const calm = night({ wind: 6, gust: 12 });
  const windy = night({ wind: 40, gust: 70 });
  assert.ok(windy.hours[0].seeing.arcsec > calm.hours[0].seeing.arcsec + 1, "gusty surface wind degrades seeing");
  assert.ok(windy.planetScore < calm.planetScore - 40, `planets calm ${calm.planetScore} vs windy ${windy.planetScore}`);
  assert.ok(windy.planetScore < windy.score, "planets suffer more than general observing");
});

test("seeing follows the jet stream", () => {
  const weak = estimateSeeing({ jet: 40, wind: 6, gust: 12 });
  const strong = estimateSeeing({ jet: 180, wind: 6, gust: 12 });
  assert.ok(weak.scale >= 4 && weak.arcsec < 1.5, `weak jet ${weak.arcsec}`);
  assert.ok(strong.scale <= 2 && strong.arcsec > 2.2, `strong jet ${strong.arcsec}`);
  // 7Timer's opinion pulls the free-atmosphere term but does not replace it.
  const blended = estimateSeeing({ jet: 180, wind: 6, gust: 12, sevenTimer: 2 });
  assert.ok(blended.arcsec < strong.arcsec && blended.arcsec > weak.arcsec);
});

test("strong shear with weak stability adds turbulence", () => {
  const lower = { hPa: 500, height: 5600, temp: -20, speed: 60, dir: 270 };
  const calm = bulkRichardson(lower, { hPa: 250, height: 10400, temp: -52, speed: 70, dir: 270 });
  const sheared = bulkRichardson(lower, { hPa: 250, height: 10400, temp: -52, speed: 260, dir: 250 });
  assert.ok(calm !== null && sheared !== null && sheared < calm);
  const a = estimateSeeing({ jet: 150, wind: 8, gust: 15, riUpper: calm });
  const b = estimateSeeing({ jet: 150, wind: 8, gust: 15, riUpper: sheared });
  assert.ok(b.arcsec > a.arcsec);
});

test("transparency: aerosols, humidity, cirrus and fog", () => {
  const clean = estimateTransparency({ humidity: 45, cloudHigh: 0, aod: 0.05, visibility: 50_000 });
  const hazy = estimateTransparency({ humidity: 75, cloudHigh: 0, aod: 0.35, visibility: 15_000 });
  const cirrus = estimateTransparency({ humidity: 45, cloudHigh: 70, aod: 0.05, visibility: 50_000 });
  const fog = estimateTransparency({ humidity: 100, cloudHigh: 0, aod: 0.1, visibility: 300 });
  assert.equal(clean.scale, 5);
  assert.ok(hazy.scale <= 2, `hazy ${hazy.extinction}`);
  assert.ok(cirrus.scale <= 2, `cirrus ${cirrus.extinction}`);
  assert.equal(fog.scale, 1);
  // Phantom model "fog" in dry air at a mountain grid point is ignored when CAMS AOD is available.
  const summit = estimateTransparency({ humidity: 66, cloudHigh: 0, aod: 0.08, visibility: 400, elevation: 3675 });
  assert.equal(summit.scale, 5, `summit ${summit.extinction}`);
  // Without CAMS AOD, humid air is assumed hazier than dry air.
  const dry = estimateTransparency({ humidity: 30, cloudHigh: 0, aod: null, visibility: null });
  const humid = estimateTransparency({ humidity: 92, cloudHigh: 0, aod: null, visibility: null });
  assert.ok(humid.extinction > dry.extinction + 0.1);
});

test("effective cloud: thin cirrus counts half and never exceeds total cover", () => {
  assert.equal(Math.round(effectiveCloud(0, 0, 100, 100)), 50);
  assert.equal(Math.round(effectiveCloud(50, 50, 0, 50)), 50);
  assert.ok(effectiveCloud(80, 0, 0) > 79);
  assert.ok(cloudFactor(10) > 0.9 && cloudFactor(50) < 0.5 && cloudFactor(95) < 0.02);
  // More cloud never scores better.
  let prev = Infinity;
  for (const c of [0, 10, 20, 30, 50, 70, 90, 100]) {
    const s = hour({ cloud: c, cloudLow: c, cloudHigh: 0 }).score;
    assert.ok(s <= prev, `cloud ${c}% scored ${s} > ${prev}`);
    prev = s;
  }
});

test("twilight: nautical darkness hurts deep-sky, not planets", () => {
  const astro = hour({}, { sunAlt: -25 });
  const nautical = hour({}, { sunAlt: -13 });
  const civil = hour({}, { sunAlt: -3 });
  assert.ok(nautical.dsoScore < astro.dsoScore - 15, `dso ${astro.dsoScore} → ${nautical.dsoScore}`);
  assert.equal(nautical.planetScore, astro.planetScore);
  assert.equal(civil.dsoScore, 0);
  assert.ok(civil.planetScore > 0 && civil.planetScore < astro.planetScore);
  assert.equal(hour({}, { sunAlt: 10 }).score, 0, "daytime scores zero");
});

test("light pollution reduces deep-sky only, and softens the Moon's impact", () => {
  const dark = night({}, { bortle: 2 });
  const city = night({}, { bortle: 8 });
  assert.equal(dark.score, city.score);
  assert.ok(city.dsoScore < dark.dsoScore);
  const darkMoon = night({}, { bortle: 2, moonIllum: 0.99, moonUp: true });
  const cityMoon = night({}, { bortle: 8, moonIllum: 0.99, moonUp: true });
  assert.ok(dark.dsoScore - darkMoon.dsoScore > city.dsoScore - cityMoon.dsoScore);
});

test("dew risk from dew-point spread, wind and sky", () => {
  assert.equal(dewRisk(10, 9, 3), "high");
  assert.equal(dewRisk(10, 7, 10), "moderate");
  assert.equal(dewRisk(10, 2, 10), "low");
  assert.equal(dewRisk(10, 7.5, 10), "moderate");
  assert.equal(dewRisk(10, 7.5, 3), "high", "calm air lets optics cool below ambient");
  assert.equal(dewRisk(10, 8.5, 25, 90), "moderate", "wind and overcast reduce the risk");
});

test("night score rewards a good stretch but not as much as a good night", () => {
  const good = Array.from({ length: 8 }, () => ({ score: 85, weight: 1 }));
  const split = [...Array.from({ length: 3 }, () => ({ score: 85, weight: 1 })), ...Array.from({ length: 5 }, () => ({ score: 0, weight: 1 }))];
  const bad = Array.from({ length: 8 }, () => ({ score: 0, weight: 1 }));
  assert.equal(nightScore(good), 85);
  const s = nightScore(split);
  assert.ok(s > 35 && s < 65, `split night ${s}`);
  assert.equal(nightScore(bad), 0);
  assert.equal(nightScore([]), 0);
});

test("verdict bands match the UI's qualityOf() colours (80 / 62 / 42 / 22)", () => {
  const cases: [number, string][] = [
    [100, "excellent"],
    [80, "excellent"],
    [79, "good"],
    [62, "good"],
    [61, "fair"],
    [42, "fair"],
    [41, "poor"],
    [22, "poor"],
    [21, "bad"],
    [0, "bad"],
  ];
  for (const [s, v] of cases) assert.equal(verdictOf(s), v, `score ${s}`);
});

test("7Timer transparency follows its documented mag/airmass scale and never overrides CAMS", () => {
  // With CAMS AOD the physical estimate stands alone (7Timer sits at class 2 on most clear nights).
  const cams = estimateTransparency({ humidity: 50, cloudHigh: 0, aod: 0.06, visibility: 40_000 });
  const camsAnd7t = estimateTransparency({ humidity: 50, cloudHigh: 0, aod: 0.06, visibility: 40_000, sevenTimer: 2 });
  assert.equal(camsAnd7t.extinction, cams.extinction);
  // Without CAMS, class 2 (0.3–0.4 mag/airmass) pulls k up, class 8 (>1) much more; class 1 (<0.3) barely.
  const bg = estimateTransparency({ humidity: 50, cloudHigh: 0, aod: null, visibility: null });
  const c1 = estimateTransparency({ humidity: 50, cloudHigh: 0, aod: null, visibility: null, sevenTimer: 1 });
  const c2 = estimateTransparency({ humidity: 50, cloudHigh: 0, aod: null, visibility: null, sevenTimer: 2 });
  const c8 = estimateTransparency({ humidity: 50, cloudHigh: 0, aod: null, visibility: null, sevenTimer: 8 });
  assert.ok(Math.abs(c1.extinction - bg.extinction) < 0.01, `class 1 ${c1.extinction} vs ${bg.extinction}`);
  assert.ok(c2.extinction > bg.extinction + 0.015 && c2.extinction < 0.35);
  assert.ok(c8.extinction > c2.extinction + 0.15 && c8.value < c2.value);
});

test("fog risk: near-saturated calm air or model fog → high; a breeze keeps it to mist", () => {
  assert.equal(fogRisk(8, 7.5, 3), "high", "spread 0.5 °C, calm");
  assert.equal(fogRisk(8, 7.5, 25), "low", "spread 0.5 °C but 25 km/h of wind mixes the air");
  assert.equal(fogRisk(8, 7.5, 25, 3000), "moderate", "…unless the model already shows mist");
  assert.equal(fogRisk(8, 6.5, 6, 800), "high", "model visibility < 1 km");
  assert.equal(fogRisk(8, 6, 8), "moderate", "spread 2 °C, light wind");
  assert.equal(fogRisk(12, 4, 2, 30_000), "low", "dry air");
  // Dry phantom "fog" in the model (spread 10 °C) is ignored.
  assert.equal(fogRisk(15, 5, 2, 500), "low");
});

test("hour slots: instants average across the slot, 'preceding hour' values come from its end", () => {
  assert.equal(slotInstant(20, 60), 40);
  assert.equal(slotInstant(null, 60), 60);
  assert.equal(slotInstant(20, undefined), 20);
  assert.equal(slotInstant(null, null), null);
  assert.equal(slotPreceding(10, 35), 35, "gust stamped t + 1 h covers [t, t + 1 h]");
  assert.equal(slotPreceding(10, null), 10);
  // Wind directions average as vectors: 350° and 10° → 0°, not 180°.
  const w = slotWind({ speed: 100, dir: 350 }, { speed: 100, dir: 10 });
  assert.ok(w.dir !== null && (w.dir < 0.5 || w.dir > 359.5), `dir ${w.dir}`);
  assert.ok(w.speed !== null && Math.abs(w.speed - 98.5) < 0.2);
  assert.deepEqual(slotWind({ speed: 50, dir: 270 }, { speed: null, dir: null }), { speed: 50, dir: 270 });
});

test("forecast confidence from model agreement", () => {
  const night = (main: number[], ...others: (number | null)[][]) =>
    main.map((m, i) => ({ weight: 1, effCloud: [m, ...others.map((o) => o[i])] }));
  const clear = [0, 5, 0, 10, 5, 0, 0, 5];
  // Everyone agrees on a clear night, or on an overcast one → high.
  assert.equal(cloudAgreement(night(clear, [5, 0, 10, 0, 0, 5, 0, 0], [0, 0, 0, 15, 10, 0, 5, 0]))?.confidence, "high");
  assert.equal(cloudAgreement(night([100, 95, 100, 100], [90, 100, 100, 98], [100, 100, 85, 100]))?.confidence, "high");
  // The main forecast is clear, two independent models are overcast → low, and they are the cloudier ones.
  const split = cloudAgreement(night(clear, clear.map(() => 95), clear.map(() => 85)))!;
  assert.equal(split.confidence, "low");
  assert.ok(split.bias[1]! < -CONFIDENCE_MODEL.bias && split.bias[2]! < -CONFIDENCE_MODEL.bias);
  // Same amount of cloud, different timing → still uncertain, but no model is simply cloudier.
  const timing = cloudAgreement(night([0, 0, 0, 0, 100, 100, 100, 100], [100, 100, 100, 100, 0, 0, 0, 0]))!;
  assert.equal(timing.confidence, "low");
  assert.ok(Math.abs(timing.bias[1]!) < CONFIDENCE_MODEL.bias);
  // Partial disagreement → medium.
  assert.equal(cloudAgreement(night(clear, [0, 0, 40, 50, 40, 10, 0, 0]))?.confidence, "medium");
  // One outlier among three models is "medium"; two dissenters make it "low".
  const overcast = clear.map(() => 100);
  assert.equal(cloudAgreement(night(clear, clear, [5, 5, 5, 5, 0, 0, 0, 0], overcast))?.confidence, "medium");
  assert.equal(cloudAgreement(night(clear, clear, overcast, overcast))?.confidence, "low");
  // 70 % vs 95 % cloud: neither is worth setting up for, so the models agree.
  assert.equal(cloudAgreement(night(clear.map(() => 95), clear.map(() => 70)))?.confidence, "high");
  // More than 4 days ahead a perfect agreement is only "medium".
  const far = cloudAgreement(night(clear, clear), 120)!;
  assert.equal(far.confidence, "medium");
  assert.ok(far.cappedByLead);
  // No second model, or too little overlap → no verdict.
  assert.equal(cloudAgreement(night(clear)), null);
  assert.equal(cloudAgreement(night(clear, [0, 0, null, null, null, null, null, null])), null);
});

function baseInput(): HourScoreInput {
  return {
    cloud: 0,
    cloudLow: 0,
    cloudMid: 0,
    cloudHigh: 0,
    precipProb: 0,
    wind: 5,
    gust: 10,
    seeing: 4,
    transparency: 4,
    sunAlt: -30,
    moonAlt: -20,
    moonIllum: 0,
    sqm: sqmForBortle(4),
  };
}
