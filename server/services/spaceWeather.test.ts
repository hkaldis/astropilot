import { test } from "node:test";
import assert from "node:assert/strict";
import { geomagneticLatitude, kpNeededFor } from "./spaceWeather";

test("geomagnetic latitude from the IGRF-14 field-line grid (corrected geomagnetic latitude)", () => {
  // Traced through the full IGRF-14 field (2026.76); the old eccentric dipole was up to ~4° off.
  const cases: [string, number, number, number][] = [
    ["Minneapolis", 44.98, -93.27, 53.9],
    ["Boston", 42.36, -71.06, 49.5],
    ["London", 51.5, -0.13, 47.2],
    ["Edinburgh", 55.95, -3.19, 52.7],
    ["Tromsø", 69.65, 18.96, 67.1],
    ["Reykjavik", 64.15, -21.94, 63.9],
    ["Sydney", -33.87, 151.21, -43.2],
  ];
  for (const [name, lat, lon, ref] of cases) assert.ok(Math.abs(geomagneticLatitude(lat, lon) - ref) < 0.4, `${name}: ${geomagneticLatitude(lat, lon).toFixed(1)} vs ${ref}`);
  // Minneapolis needs Kp 5 for aurora low in the north (the dipole said Kp 7).
  assert.equal(Math.ceil(kpNeededFor(53.9)), 5);
});
