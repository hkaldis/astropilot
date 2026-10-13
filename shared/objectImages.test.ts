import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import catalog from "./data/catalog.json";
import { MOONS } from "./astro/moons";
import { SOLAR_SYSTEM } from "./astro/planets";
import { COMMONS_IMAGES, hasSurveyPhoto, moonCompare, objectImageUrl, photoOf, surveyFieldArcmin } from "./objectImages";

const file = (src: string) => path.resolve("client/public", src.replace(/^\//, "").replace(/\?.*$/, ""));

test("survey photos frame the object with sky around it", () => {
  assert.equal(surveyFieldArcmin({ type: "planetary_nebula", size: [1.4, 1] }), 10); // never tighter than 10′
  assert.ok(Math.abs(surveyFieldArcmin({ type: "galaxy", size: [177.8, 69.7] }) - 249) < 1); // M31: 4.1°
  assert.equal(surveyFieldArcmin({ type: "galaxy", size: [646] }), 720); // the LMC: capped at 12°
  assert.equal(surveyFieldArcmin({ type: "double_star", sep: 53.2 }), 8.866666666666667);
  assert.equal(surveyFieldArcmin({ type: "emission_nebula" }), 15);
});

test("bright double stars get no photo (the survey burns them into one blob)", () => {
  assert.equal(hasSurveyPhoto({ type: "double_star", mag: 3.19 }), false);
  assert.equal(hasSurveyPhoto({ type: "double_star", mag: 9.74 }), true);
  assert.equal(hasSurveyPhoto({ type: "galaxy", mag: 3.4 }), true);
});

test("field sizes are compared with the full Moon", () => {
  assert.equal(moonCompare(249), "8× the full Moon's width");
  assert.equal(moonCompare(31), "about the full Moon's width");
  assert.equal(moonCompare(15), "about half of the full Moon's width");
  assert.equal(moonCompare(10), "about a third of the full Moon's width");
});

test("every object that should have a picture has its file, and every planet, moon and chosen photo a credit", () => {
  const missing: string[] = [];
  for (const o of catalog as { id: string; type: string; mag?: number }[]) {
    const p = photoOf(o.id, o);
    if (hasSurveyPhoto(o) && (!p || !fs.existsSync(file(p.src)))) missing.push(o.id);
  }
  for (const id of [...SOLAR_SYSTEM.map((p) => p.id as string), ...MOONS.map((m) => m.id as string)]) {
    const c = COMMONS_IMAGES[id];
    if (!c || !c.license || !c.page.startsWith("https://commons.wikimedia.org/") || !fs.existsSync(file(objectImageUrl(id)))) missing.push(id);
  }
  for (const [id, c] of Object.entries(COMMONS_IMAGES))
    if (!/public domain|cc0|cc by/i.test(c.license) || !fs.existsSync(file(objectImageUrl(id)))) missing.push(id);
  assert.deepEqual(missing, []);
});

test("bright double stars use a chosen photograph where there is one", () => {
  const albireo = (catalog as { id: string; type: string; mag?: number }[]).find((o) => o.id === "albireo")!;
  assert.equal(photoOf("albireo", albireo)?.kind, "commons");
  const castor = (catalog as { id: string; type: string; mag?: number }[]).find((o) => o.id === "castor")!;
  assert.equal(photoOf("castor", castor), null);
});
