# AstroPilot static astronomy data

Generated, static data for the deep-sky catalog and the sky chart. **Do not edit the JSON by hand** — change
`scripts/data/curation.mjs` or the build scripts and regenerate.

| File | Import (via the `@shared/*` alias) | Contents |
|---|---|---|
| `types.ts` | `import type { CatalogObject, ObjectType, StarRecord } from '@shared/data/types'` | Types |
| `constellations-meta.ts` | `import { CONSTELLATION_NAMES, CONSTELLATION_GENITIVES } from '@shared/data/constellations-meta'` | 88 IAU abbreviations → name / genitive |
| `catalog.json` | `import catalogJson from '@shared/data/catalog.json'` → `const CATALOG = catalogJson as CatalogObject[]` | 836 deep-sky objects and double stars |
| `stars.json` | `import stars from '@shared/data/stars.json'` | 5,044 stars to V 6.0 |
| `starnames.json` | `import starnames from '@shared/data/starnames.json'` | 152 proper-named stars brighter than mag 3.0 |
| `constellation-lines.json` | `import lines from '@shared/data/constellation-lines.json'` | stick figures of all 88 constellations |
| `constellation-labels.json` | `import labels from '@shared/data/constellation-labels.json'` | 89 label anchors (Serpens Caput + Cauda) |
| `milkyway.json` | `import milkyway from '@shared/data/milkyway.json'` | Milky Way outline, 5 brightness levels |

The JSON needs a cast when imported in TypeScript (`as CatalogObject[]`): TS infers `type: string` and
`size: number[]` from JSON, not the literal union / tuple types.

## Conventions

* **Coordinates** are J2000 (equinox and epoch 2000.0): RA in decimal **hours** (0 ≤ ra < 24), Dec in decimal
  degrees. RA/Dec precision: catalog 4/3 decimals; stars, lines and labels 3/3; Milky Way 3/2.
  Stars with large proper motion have moved since 2000 (e.g. 61 Cyg and α Cen by ≈2′ by 2027).
* **`stars.json`**: `[raHours, decDeg, mag, bv]` tuples sorted brightest first (ties by HIP number). `bv` (B−V)
  is omitted — 3-element tuple — for the 2 stars without a value in the source (HIP 26220 and HIP 32609).
* **`starnames.json`**: `[{ name, ra, dec, mag }]` sorted by magnitude.
* **`constellation-lines.json`**: `{ [abbr]: number[][][] }` — each entry is a list of polylines of `[ra, dec]`
  vertices (Serpens' two halves are merged under `"Ser"`). **`constellation-labels.json`**: `[{ abbr, name, ra, dec }]`.
* **`milkyway.json`**: `{ levels: [{ level: 1..5, polys: [[ [ra, dec], … ], …] }] }`. Each level is one polygon in
  the source whose rings include holes, so **fill all rings of a level together with the even-odd rule**.
  Points closer than 0.3° to the previously kept point were dropped (30,676 → 9,609 points; 8 rings smaller
  than that were dropped).
* RA wraps at 0h/24h: lines and rings that cross it jump from ~24 to ~0. That is harmless for projections done
  on the sphere (alt/az, stereographic); an equirectangular renderer must split such segments.
* **`CatalogObject`** (see `types.ts`):
  * `name` is a common name when one exists, else the designation (`"M 2"`, `"NGC 7331"`). When several objects
    would share a display name the designation is appended, e.g. `"Antennae Galaxies (NGC 4038)"`.
  * `designations` lists Messier, NGC/IC, Caldwell (`"C 14"`), other catalogue IDs (Mel, Cr, Sh2, UGC, PGC, ESO,
    Harris names such as `"Pal 11"`) and every common name. Double stars list proper names, Bayer
    (`"β Cyg"`, `"Beta Cygni"`, `"β¹ Cyg"`), Flamsteed, WDS discoverer code and HIP number.
  * `mag` is V; when no usable V exists it is B and `magB: true` (see *Magnitudes*). Double stars: `mag` is
    the primary, `mag2` the companion (WDS).
  * `size` is `[major, minor]` or `[major]` in arcminutes. `sb` (galaxies only) is in **mag/arcmin²**: OpenNGC
    `SurfBr` is the mean B-band surface brightness inside the 25 mag/arcsec² isophote in mag/arcsec²; we store
    `SurfBr − 2.5·log10(3600)` (= −8.89).
  * `con` is the IAU abbreviation (OpenNGC's `Se1`/`Se2` → `Ser`). All 796 OpenNGC-derived entries agree with an
    independent boundary computation (Roman 1987); double stars and the Coalsack use that computation directly.
* **Double stars** (`sep` ″, `pa` °): if the Sixth Orbit Catalog (ORB6) has an orbit of grade 1–3 for the pair,
  `sep`/`pa` are its ephemeris for **2027.0** (Castor, Porrima, ξ UMa, α Cen, 70 Oph, ξ Boo, ζ Aqr, η Cas);
  otherwise they are the most recent WDS measurement (the year is given in `desc`). Positions are the WDS
  J2000 coordinates of the primary.

## Sources and licences

The JSON files combine the sources below. **`catalog.json` is an adaptation of OpenNGC and Wikipedia content and
is therefore distributed under CC BY-SA 4.0**; the app's credits/about screen should carry the attributions below.

* **OpenNGC** — © Mattia Verga, https://github.com/mattiaverga/OpenNGC, licensed under
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Files `database_files/NGC.csv` and
  `addendum.csv` at commit `75ca7ff090e1d0081a5b08be70eb3bc45ccd9e06` (2026-09-27). OpenNGC itself builds on NED,
  HyperLEDA, SIMBAD, HEASARC and Harold Corwin's NGC/IC notes. Changes: selection, merging, unit conversion and
  the documented corrections listed under *Curation*.
* **Wikipedia** (CC BY-SA 4.0), pinned revisions: *Caldwell catalogue* (rev 1375235933), *Messier object*
  (1372398875), *IAU designated constellations* (1375575250); infobox values for the Coalsack, Hyades and Cave
  Nebula; and the articles used to verify 19 common names (see `CURATED_ALIASES` in `scripts/data/curation.mjs`).
* **Harris, W. E. 1996, AJ 112, 1487 (2010 edition)** — Catalog of Parameters for Milky Way Globular Clusters,
  https://physics.mcmaster.ca/~harris/mwgc.dat: integrated V magnitudes (V_t) and distances of globular clusters.
* **Washington Double Star Catalog** (WDS) and **Sixth Catalog of Orbits of Visual Binary Stars** (ORB6),
  maintained at the U.S. Naval Observatory, https://www.astro.gsu.edu/wds/ — "This research has made use of the
  Washington Double Star Catalog maintained at the U.S. Naval Observatory."
* **d3-celestial** — stars, star names, constellation lines/labels and Milky Way, data files at commit
  `b56735c22935b7bde41a944a74e0f780ca0c6dfa`; licence below (BSD-3-Clause).
* **Roman, N. G. 1987, PASP 99, 695** (CDS catalogue VI/42) — constellation boundaries, used only to compute and
  check `con`.
* Hand-written descriptions of the Messier objects and a few NGC/IC objects come from the original AstroPilot
  seed data (`server/seed.ts`), lightly edited; factual slips were corrected (noted in `curation.mjs`).

```
d3-celestial — Copyright (c) 2015, Olaf Frohn. All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that
the following conditions are met:
1. Redistributions of source code must retain the above copyright notice, this list of conditions and the
   following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the
   following disclaimer in the documentation and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote
   products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED
WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING
IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## What is in `catalog.json`

1. All 110 Messier objects (M102 = NGC 5866; its identity is disputed, which `desc` explains — OpenNGC treats
   M102 as a duplicate of M101).
2. All 109 Caldwell objects. C14 (Double Cluster), C9 (Cave Nebula), C41 (Hyades) and C99 (Coalsack) have their
   own entries (`id` `C14`, `C9`, `C41`, `C99`); NGC 869 and NGC 884 also appear individually.
3. Every OpenNGC galaxy, cluster, nebula, planetary nebula or supernova remnant with V ≤ 10.5 (or B ≤ 11.0 when no
   usable V exists), plus every such object with a common name. Stars, asterisms (`*Ass`), novae, duplicates and
   non-existent objects are excluded (except M24, M40, M73 and C14, which are Messier/Caldwell objects).
   Duplicate rows (`Dup`) are folded into their master entry as extra designations.
4. 40 famous double/multiple stars (WDS/ORB6), plus M40. The Trapezium (θ¹ Ori) is described in M42's `desc`.
5. `showpiece: true` on 45 classic objects.

| Type | Count | | Type | Count |
|---|---|---|---|---|
| open_cluster | 302 | | cluster_nebula | 30 |
| galaxy | 232 | | reflection_nebula | 22 |
| globular_cluster | 117 | | supernova_remnant | 5 |
| planetary_nebula | 44 | | galaxy_group | 3 |
| double_star | 41 | | dark_nebula | 2 |
| emission_nebula | 36 | | star_cloud, asterism | 1 each |

### Magnitudes

* V from OpenNGC; B (`magB: true`) when V is missing.
* **Globular clusters** use Harris (2010) V_t (matched by NGC/IC number or within 2′). OpenNGC's SIMBAD-derived V is
  off by up to 2 mag for several (e.g. M14 5.73 → 7.59, M71 6.10 → 8.19), whereas V_t agrees with the classic
  SEDS values to ~0.05 mag.
* **Galaxies** with B−V < −0.3 or > 2.5 have physically impossible colours; their OpenNGC (HyperLEDA) V is the
  faulty value, so B is used instead (9 galaxies, e.g. NGC 253: V 11.11 vs B 7.94, while the Wikipedia Caldwell table gives 7.1). For the 3 open
  clusters with impossible B−V (NGC 436, NGC 1933, M26) it is unclear which band is wrong, so V is kept (NGC 1933, V 13.8, therefore stays out of the catalog); the build
  log lists all of these.
* Explicit overrides: M17 → 6.0 and M20 → 6.3 (OpenNGC 7.0 / 8.5 vs SEDS); NGC 6885 (C37) → 6 (OpenNGC 14.1).
  Caldwell objects without an OpenNGC magnitude take the Wikipedia Caldwell-table value (NGC 4755, NGC 6193,
  IC 2602, C9, C14, C41).
* 22 objects have no magnitude in any source used (mostly dark/reflection nebulae and galaxy groups, e.g. B33,
  C99, NGC 1909, NGC 2024, Mel 111); the field is omitted.
* Integrated magnitudes of large nebulae and clusters vary between references by ~1 mag; treat them as rough.

### Curation (all in `scripts/data/curation.mjs`, each with a reason)

* **IDs:** C37 → `NGC6885`, C49 (Rosette) → `NGC2237`, C50 → `NGC2244` (conventional numbers; OpenNGC's master
  rows are NGC 6882 / 2238 / 2239). Rosette parts NGC 2237/2238/2246, M16's IC 4703, and the Eastern Veil's
  NGC 6995 are merged into one entry each.
* **Types:** M24 → star_cloud, M40 → double_star, M73 → asterism, C14 → open_cluster; Maia, Merope, Iris (NGC 7023),
  R CrA (NGC 6729), IC 4604, NGC 1973/1975 → reflection_nebula; NGC 6334 (OpenNGC "SNR") → emission_nebula.
  Other mappings follow the spec (OpenNGC `Neb` → emission_nebula, `Cl+N` → cluster_nebula, so M42 is a
  cluster_nebula).
* **Names:** OpenNGC's "Flame Nebula"/"Orion B" are removed from IC 434 (the Flame Nebula is NGC 2024, which gets
  the name); "Pinwheel Galaxy" is not used for M33. 19 well-known names missing from OpenNGC (Heart, Soul, Flame,
  Jellyfish, Pacman, Wizard, Thor's Helmet, Pinwheel, Phantom, Hamburger, UFO, Hockey Stick, Cat's Paw…) were
  added; the build checks that each one appears together with the designation in the pinned Wikipedia revision.
  Abbreviations in OpenNGC names are expanded ("omi Per Cloud" → "Omicron Persei Cloud").
* **Coalsack (C99):** position (12h50m, −62°30′) and size (7° × 5°) from Wikipedia — OpenNGC/SIMBAD give a point
  near the cloud's western edge.
* Descriptions: seed text where available; otherwise generated only from catalogue data (magnitude, morphology,
  constellation, size, PN central-star magnitude, Harris distance), plus a few relations noted in `DESC_APPEND`.

## Regenerating

```sh
npm run data:catalog   # = node scripts/data/build-catalog.mjs  → shared/data/catalog.json
npm run data:sky       # = node scripts/data/build-sky.mjs      → stars, starnames, constellation-*, milkyway, constellations-meta.ts
# add --refresh to re-download every source (otherwise scripts/data/.cache/ is reused)
```

No npm dependencies (Node ≥ 20). Downloads go to `scripts/data/.cache/` (≈30 MB, git-ignored). All sources are
pinned (OpenNGC and d3-celestial commits, Wikipedia revision IDs), so a rebuild is deterministic. The
exceptions are the WDS/ORB6 and Harris files, which their maintainers update in place; delete them from the cache
to pick up new measurements. Both scripts validate their output and exit non-zero on failure. They print the
spot checks, counts, constellation and position cross-checks, every magnitude adjustment and the double-star
table.

Output sizes: catalog.json 221 KB · stars.json 126 KB · milkyway.json 142 KB · constellation-lines.json 15 KB ·
starnames.json 8 KB · constellation-labels.json 4.5 KB.
