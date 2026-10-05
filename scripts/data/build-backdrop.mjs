#!/usr/bin/env node
// Builds shared/data/backdrop.json — the small star set behind the sign-in screen (the sky wheeling
// around the celestial pole) — from stars.json and constellation-lines.json, so the page doesn't
// need the full 126 KB star file. Run after `npm run data:sky`:
//
//   node scripts/data/build-backdrop.mjs
import fs from 'node:fs';
import path from 'node:path';
import { OUT_DIR, writeJsonCompact } from './lib/common.mjs';

const MAX_MAG = 4.6; // naked-eye stars under a decent suburban sky
// The best-known figures around each pole, drawn faintly so the wheeling sky is recognisable.
const FIGURES = ['UMa', 'UMi', 'Cas', 'Cep', 'Dra', 'Cyg', 'Lyr', 'Per', 'Aur', 'And', 'CrB', 'Cru', 'Cen', 'Car', 'Vel', 'TrA', 'Pav', 'Gru', 'Tuc', 'Hyi', 'Oct', 'Mus', 'Ara', 'Lup', 'Dor', 'Phe'];

const stars = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'stars.json'), 'utf8'));
const lines = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'constellation-lines.json'), 'utf8'));

const r = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
const starsOut = stars.filter((s) => s[2] <= MAX_MAG).map(([ra, dec, mag, bv]) => [r(ra, 3), r(dec, 2), r(mag, 1), r(bv ?? 0.6, 1)]);

const figures = {};
for (const abbr of FIGURES) {
  if (!lines[abbr]) throw new Error(`no figure for ${abbr}`);
  figures[abbr] = lines[abbr].map((pl) => pl.map(([ra, d]) => [r(ra, 3), r(d, 1)]));
}

const out = { stars: starsOut, lines: figures };
const bytes = writeJsonCompact(path.join(OUT_DIR, 'backdrop.json'), out);
console.log(`backdrop.json  ${starsOut.length} stars (mag ≤ ${MAX_MAG}), ${Object.keys(figures).length} figures, ${(bytes / 1024).toFixed(1)} KB`);
if (starsOut.length < 500 || !figures.UMa || !figures.Cas || !figures.Cru) {
  console.error('backdrop.json looks wrong (too few stars or missing UMa / Cas / Cru)');
  process.exit(1);
}
