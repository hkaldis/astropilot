import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cloudFrames,
  cloudView,
  coverAt,
  frameNear,
  gridSpec,
  gridUrl,
  latOfY,
  latestImageTime,
  mercY,
  nowFrame,
  paintForecast,
  parseGrid,
  satSource,
  satToClouds,
  viewPosition,
} from "./cloudMap";

test("the view is centred on the place, in Web Mercator", () => {
  const v = cloudView(37.85, 22.5, "wide");
  const p = viewPosition(v, 37.85, 22.5);
  assert.ok(Math.abs(p.x - 0.5) < 0.01 && Math.abs(p.y - 0.5) < 0.02, JSON.stringify(p));
  // The box spans ±4° of latitude and keeps the image's shape (1100 × 500).
  assert.ok(Math.abs(latOfY(v.bbox[3]) - 41.9) < 0.01 && Math.abs(latOfY(v.bbox[1]) - 33.9) < 0.01);
  assert.ok(Math.abs((v.bbox[2] - v.bbox[0]) / (v.bbox[3] - v.bbox[1]) - 2.2) < 1e-9);
  assert.ok(Math.abs(mercY(latOfY(1234567)) - 1234567) < 1e-3);
});

test("each place gets the satellite that sees it", () => {
  assert.equal(satSource(37.9, 22.4).layer, "msg_fes:clm"); // Greece
  assert.equal(satSource(64.1, -21.9).layer, "msg_fes:clm"); // Iceland
  assert.equal(satSource(19.1, 72.9).layer, "msg_iodc:clm"); // Mumbai
  assert.equal(satSource(55.8, 37.6).layer, "msg_iodc:clm"); // Moscow
  assert.equal(satSource(40.7, -74).layer, "mumi:worldcloudmap_ir108"); // New York
  assert.equal(satSource(-33.9, 151.2).layer, "mumi:worldcloudmap_ir108"); // Sydney
});

test("the newest image time comes from the layer's capabilities", () => {
  const xml = `<Layer><Dimension name="time" default="2026-10-08T17:45:00Z" units="ISO8601" nearestValue="1">2020-09-01T00:00:00.000Z/2026-10-08T17:45:00.000Z/PT15M</Dimension></Layer>`;
  assert.equal(latestImageTime(xml), Date.UTC(2026, 9, 8, 17, 45));
  assert.equal(latestImageTime("<Layer/>"), null);
});

test("the cloud mask keeps cloud and drops clear land and water", () => {
  const px = new Uint8ClampedArray([255, 255, 255, 255, 0, 200, 0, 255, 0, 0, 255, 255, 255, 255, 255, 0]);
  satToClouds(px, "mask");
  assert.deepEqual([px[3], px[7], px[11], px[15]], [220, 0, 0, 0]);
});

test("forecast grid: parsed per hour and interpolated between points", () => {
  const v = cloudView(38, 23, "narrow");
  const g = gridSpec(v, "narrow");
  assert.equal(g.lats.length * g.lons.length, 99);
  assert.ok(gridUrl(g).startsWith("https://api.open-meteo.com/v1/forecast?latitude="));
  // West half clear, east half overcast; one hour.
  const json = g.lats.flatMap(() => g.lons.map((lon) => ({ hourly: { time: [1791417600], cloud_cover: [lon < 23 ? 0 : 100] } })));
  const grid = parseGrid(g, json)!;
  assert.equal(grid.times[0], 1791417600_000);
  assert.equal(coverAt(grid, 0, 38, 21), 0);
  assert.equal(coverAt(grid, 0, 38, 25), 100);
  const mid = coverAt(grid, 0, 38, 22.8)!;
  assert.ok(mid > 0 && mid < 100);
  const out = new Uint8ClampedArray(20 * 10 * 4);
  paintForecast(grid, 0, v, 20, 10, out);
  assert.equal(out[(5 * 20 + 1) * 4 + 3], 0, "clear west");
  assert.ok(out[(5 * 20 + 18) * 4 + 3] > 200, "cloudy east");
  assert.equal(parseGrid(g, json.slice(1)), null, "a missing point means the grid is unusable");
});

test("timeline: satellite images up to now, then forecast hours", () => {
  const now = Date.UTC(2026, 9, 8, 18, 10);
  const src = satSource(38, 23);
  const latest = Date.UTC(2026, 9, 8, 17, 45);
  const hours = Array.from({ length: 48 }, (_, i) => Date.UTC(2026, 9, 8) + i * 3_600_000);
  const grid = { lats: [0, 1], lons: [0, 1], times: hours, cover: hours.map(() => [0, 0, 0, 0]) };
  const frames = cloudFrames({ latest, src }, grid, now);
  assert.equal(frames[0].t, latest - 3 * 3_600_000);
  assert.equal(frames[12].t, latest);
  assert.equal(frames[13].kind, "forecast");
  assert.equal(frames[13].t, Date.UTC(2026, 9, 8, 19));
  assert.equal(nowFrame(frames), 12);
  assert.equal(frames[frameNear(frames, Date.UTC(2026, 9, 9, 23, 20))].t, Date.UTC(2026, 9, 9, 23));
  // Without satellite images the forecast starts with the current hour.
  const fc = cloudFrames(null, grid, now);
  assert.equal(fc[0].t, Date.UTC(2026, 9, 8, 18));
  assert.equal(nowFrame(fc), 0);
});
