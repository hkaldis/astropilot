/** Run: npx tsx --test shared/astro/conditions.test.ts */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type HourScoreInput,
  bulkRichardson,
  cloudFactor,
  dewRisk,
  effectiveCloud,
  estimateSeeing,
  estimateTransparency,
  hourScores,
  nightScore,
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
  assert.equal(verdictOf(80), "excellent");
  assert.equal(verdictOf(65), "good");
  assert.equal(verdictOf(45), "fair");
  assert.equal(verdictOf(25), "poor");
  assert.equal(verdictOf(24), "bad");
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
