# AstroPilot static astronomy data

Generated, static data for the deep-sky catalog and the sky chart. **Do not edit the JSON by hand** — change
`scripts/data/curation.mjs` or the build scripts and regenerate.

| File | Import (via the `@shared/*` alias) | Contents |
|---|---|---|
| `types.ts` | `import type { CatalogObject, ObjectType, StarRecord } from '@shared/data/types'` | Types |
| `constellations-meta.ts` | `import { CONSTELLATION_NAMES, CONSTELLATION_GENITIVES } from '@shared/data/constellations-meta'` | 88 IAU abbreviations → name / genitive |
| `catalog.json` | `import catalogJson from '@shared/data/catalog.json'` → `const CATALOG = catalogJson as CatalogObject[]` | 841 deep-sky objects and double stars |
| `stars.json` | `import stars from '@shared/data/stars.json'` | 5,044 stars to V 6.0 |
| `starnames.json` | `import starnames from '@shared/data/starnames.json'` | 152 proper-named stars brighter than mag 3.0 |
| `constellation-lines.json` | `import lines from '@shared/data/constellation-lines.json'` | stick figures of all 88 constellations |
| `constellation-labels.json` | `import labels from '@shared/data/constellation-labels.json'` | 89 label anchors (Serpens Caput + Cauda) |
| `milkyway.json` | `import milkyway from '@shared/data/milkyway.json'` | Milky Way outline, 5 brightness levels |
| `backdrop.json` | `import backdrop from '@shared/data/backdrop.json'` | `{ stars, lines }`: the 1,018 stars to V 4.6 and 26 well-known figures around both poles, for the sign-in sky |

The JSON needs a cast when imported in TypeScript (`as CatalogObject[]`): TS infers `type: string` and
`size: number[]` from JSON, not the literal union / tuple types.

## Conventions

* **Coordinates** are J2000 (equinox and epoch 2000.0): RA in decimal **hours** (0 ≤ ra < 24), Dec in decimal
  degrees. RA/Dec precision: catalog 4/3 decimals; stars, lines and labels 3/3; Milky Way 3/2.
  Stars with large proper motion have moved since 2000 (e.g. 61 Cyg and α Cen by ≈2′ by 2027).
* **`stars.json`**: `[raHours, decDeg, mag, bv]` tuples sorted brightest first (ties by HIP number). `bv` (B−V)
  is omitted — 3-element tuple — for the 2 stars without a value in the source (HIP 26220 and HIP 32609).
* **`starnames.json`**: `[{ name, ra, dec, mag }]` sorted by magnitude. Magnitudes are d3-celestial's Hipparcos V;
  the ~75 brightest named stars were checked against SIMBAD V and the one non-variable star off by ≥ 0.1 mag,
  Canopus (−0.62 → −0.74), is corrected in both star files (`STAR_MAG_OVERRIDES`).
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
    Harris names such as `"Pal 11"`) and every common name. Melotte / Collinder numbers missing from OpenNGC come
    from the SEDS NGC database cross-identifications (`scripts/data/melotte-collinder.mjs`, 67 clusters), and every
    `"Mel N"` / `"Cr N"` also appears spelled out (`"Melotte 22"`, `"Collinder 399"`). Double stars list proper names, Bayer
    (`"β Cyg"`, `"Beta Cygni"`, `"β¹ Cyg"`), Flamsteed, WDS discoverer code and HIP number.
  * `mag` is V; when no usable V exists it is B and `magB: true` (see *Magnitudes*). Double stars: `mag` is
    the primary, `mag2` the companion (WDS, or SIMBAD V where WDS is off — see *Double stars*).
  * `magOf` marks nebulae whose `mag` is not the nebulosity's: `"star"` = the illuminating star (6 reflection /
    emission nebulae, e.g. IC 4604, NGC 7023), `"cluster"` = the embedded cluster (all 26 `cluster_nebula` entries
    with a magnitude except M42, e.g. M16, IC 1805). The nebula itself is much fainter.
  * `size` is `[major, minor]` or `[major]` in arcminutes — the commonly quoted visual dimensions (see *Sizes*).
    `sb` (galaxies only) is in **mag/arcmin²**: OpenNGC `SurfBr` is the mean B-band surface brightness inside the
    25 mag/arcsec² isophote in mag/arcsec²; we store `SurfBr − 2.5·log10(3600)` (= −8.89).
  * `pa` on an extended object is the position angle of its major axis (whole degrees 0–179, north through east,
    OpenNGC `PosAng`), given for 254 elongated objects with both axes in `size` (mostly galaxies). On a double star
    it is the companion's position angle (0–359).
  * `con` is the IAU abbreviation (OpenNGC's `Se1`/`Se2` → `Ser`). All 796 OpenNGC-derived entries agree with an
    independent boundary computation (Roman 1987); double stars and the Coalsack use that computation directly.
* **Double stars** (`sep` ″, `pa` °): if the Sixth Orbit Catalog (ORB6) has an orbit of grade 1–3 for the pair,
  `sep`/`pa` are its ephemeris for **2027.0** (Castor, Porrima, ξ UMa, α Cen, 70 Oph, ξ Boo, ζ Aqr, η Cas);
  otherwise they are the most recent WDS measurement (the year is given in `desc`). Positions are the WDS
  J2000 coordinates of the primary. Component magnitudes are the WDS summary values, except where they differ by
  ≥ 0.3 mag from the star's SIMBAD V (`starMags` in `curation.mjs`): Albireo B 4.68 → 5.11, ι Cnc B 5.99 → 6.57,
  β² Sco 4.52 → 4.89 and the four Trapezium stars (WDS 0.1–0.5 mag too bright). Colours in `desc` come from the
  WDS spectral types.

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
  Nebula and the infobox sizes in `SIZE_OVERRIDES` (each with its revision id); and the articles used to verify
  24 common names (see `CURATED_ALIASES` in `scripts/data/curation.mjs`).
* **SEDS** (Students for the Exploration and Development of Space; Hartmut Frommert), accessed 2026-10-05: the
  Messier pages (messier.seds.org — visual magnitudes) and the Messier data table (messier.seds.org/data.html —
  dimensions), tabulated in `SEDS_MESSIER`; and the SEDS NGC/IC database (spider.seds.org/ngc, reproducing
  NGC 2000.0, Sinnott 1988) for a few sizes. Only these factual values are used.
* **SIMBAD** (CDS, Strasbourg), accessed 2026-10-05: V magnitudes used to check double-star components, the
  illuminating stars of reflection nebulae (`MAG_OF_STAR`) and the brightest named stars.
* **Harris, W. E. 1996, AJ 112, 1487 (2010 edition)** — Catalog of Parameters for Milky Way Globular Clusters,
  https://physics.mcmaster.ca/~harris/mwgc.dat: integrated V magnitudes (V_t) and distances of globular clusters.
* **Washington Double Star Catalog** (WDS) and **Sixth Catalog of Orbits of Visual Binary Stars** (ORB6),
  maintained at the U.S. Naval Observatory, https://www.astro.gsu.edu/wds/ — "This research has made use of the
  Washington Double Star Catalog maintained at the U.S. Naval Observatory."
* **d3-celestial** — stars, star names, constellation lines/labels and Milky Way, data files at commit
  `b56735c22935b7bde41a944a74e0f780ca0c6dfa`; licence below (BSD-3-Clause).
* **Roman, N. G. 1987, PASP 99, 695** (CDS catalogue VI/42) — constellation boundaries, used only to compute and
  check `con`.
* Descriptions of the Messier and Caldwell objects were written for this catalogue (2026-10) from the sources
  above (`scripts/data/descriptions.mjs`); a few NGC/IC descriptions still come from the original AstroPilot seed
  data (`server/seed.ts`), lightly edited, with factual slips corrected (noted in `curation.mjs`).

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
   non-existent objects are excluded (except M24, M40, M73 and C14, which are Messier/Caldwell objects, and
   Brocchi's Cluster / the Coathanger, `Cr399`, listed in `INCLUDE_ROWS`).
   Duplicate rows (`Dup`) are folded into their master entry as extra designations.
4. 44 famous double/multiple stars (WDS/ORB6) — including the Trapezium (θ¹ Ori, id `trapezium`), Struve 747,
   ι Ori and ζ Lyr — plus M40.
5. `showpiece: true` on 57 classic objects (bright, striking in binoculars or a small telescope; southern
   highlights such as the Magellanic Clouds, the Tarantula and NGC 3532 included).

| Type | Count | | Type | Count |
|---|---|---|---|---|
| open_cluster | 303 | | cluster_nebula | 30 |
| galaxy | 232 | | reflection_nebula | 22 |
| globular_cluster | 117 | | supernova_remnant | 5 |
| double_star | 45 | | galaxy_group | 3 |
| planetary_nebula | 44 | | asterism, dark_nebula | 2 each |
| emission_nebula | 35 | | star_cloud | 1 |

### Magnitudes

* **Messier objects** use the SEDS visual magnitude (`SEDS_MESSIER`), the value quoted by observing guides and
  the Wikipedia Messier articles (45 changed, e.g. M8 5.8 → 4.6, M44 3.1 → 3.7, M45 1.2 → 1.6, M88 10.33 → 9.6),
  except globular clusters (Harris V_t, identical to SEDS within 0.05) and M40 (WDS components).
* Otherwise V from OpenNGC; B (`magB: true`) when V is missing.
* **Globular clusters** use Harris (2010) V_t (matched by NGC/IC number or within 2′). OpenNGC's SIMBAD-derived V is
  off by up to 2 mag for several (e.g. M14 5.73 → 7.59, M71 6.10 → 8.19), whereas V_t agrees with the classic
  SEDS values to ~0.05 mag.
* **Galaxies** with B−V < −0.3 or > 2.5 have physically impossible colours; their OpenNGC (HyperLEDA) V is the
  faulty value, so B is used instead (9 galaxies, e.g. NGC 253: V 11.11 vs B 7.94, while the Wikipedia Caldwell table gives 7.1). For the 3 open
  clusters with impossible B−V (NGC 436, NGC 1933, M26) it is unclear which band is wrong, so V is kept (NGC 1933, V 13.8, therefore stays out of the catalog); the build
  log lists all of these.
* Explicit override: NGC 6885 (C37) → 6 (OpenNGC 14.1).
  Caldwell objects without an OpenNGC magnitude take the Wikipedia Caldwell-table value (NGC 4755, NGC 6193,
  IC 2602, C9, C14, C41).
* 22 objects have no magnitude in any source used (mostly dark/reflection nebulae and galaxy groups, e.g. B33,
  C99, NGC 1909, NGC 2024, Mel 111); the field is omitted.
* Integrated magnitudes of large nebulae and clusters vary between references by ~1 mag; treat them as rough.

### Sizes

* **Messier objects** (except galaxies): the SEDS data-table dimensions (`SEDS_MESSIER`; e.g. M7 22′ → 80′,
  M41 12′ → 38′, M8 45′ × 30′ → 90′ × 40′). SEDS's per-object pages give globular-cluster extents "seen on deep
  photographs", so the table's (NGC 2000.0) values are used for those.
* **Star clusters elsewhere**: OpenNGC's diameters are often cluster-catalogue core sizes, well below the visual
  extent; for Caldwell clusters and the halves of the Double Cluster they are replaced by the Wikipedia infobox
  or NGC 2000.0 value where that is > 20% larger (`SIZE_OVERRIDES`, e.g. NGC 3532 12′ → 50′, ω Cen 27′ → 36.3′).
  Other non-Caldwell clusters still carry OpenNGC's (often small) values.
* **Galaxies**: OpenNGC/LEDA isophotal (D25) diameters with minor axis and `pa`; M108 (LEDA 3.98′ × 1.66′ →
  8.7′ × 2.2′) and the Sculptor Dwarf are corrected, and M108's `sb` is recomputed for the new size.
* **Nebulae**: bogus OpenNGC values fixed from Wikipedia / NGC 2000.0 — M16 120′ × 25′ → 33′ × 27′ (SEDS),
  NGC 7000 120′ × 30′ → 120′ × 100′, NGC 6960 210′ × 160′ (the whole Cygnus Loop) → 70′, NGC 6729 25′ → 2.5′,
  NGC 2070 16′ → 40′ × 25′, NGC 6334 8.4′ → 35′ × 20′ and others; every change is printed by the build.

### Curation (all in `scripts/data/curation.mjs`, each with a reason)

* **IDs:** C37 → `NGC6885`, C49 (Rosette) → `NGC2237`, C50 → `NGC2244` (conventional numbers; OpenNGC's master
  rows are NGC 6882 / 2238 / 2239). Rosette parts NGC 2237/2238/2246, M16's IC 4703, and the Eastern Veil's
  NGC 6995 are merged into one entry each.
* **Types:** M16 → cluster_nebula (the cluster NGC 6611 in the Eagle Nebula), NGC 2244 (C50) → open_cluster (the
  Rosette Nebula around it is C49), M24 → star_cloud, M40 → double_star, M73 → asterism, C14 → open_cluster; Maia, Merope, Iris (NGC 7023),
  R CrA (NGC 6729), IC 4604, NGC 1973/1975 → reflection_nebula; NGC 6334 (OpenNGC "SNR") → emission_nebula.
  Other mappings follow the spec (OpenNGC `Neb` → emission_nebula, `Cl+N` → cluster_nebula, so M42 is a
  cluster_nebula).
* **Names:** OpenNGC's "Flame Nebula"/"Orion B" are removed from IC 434 (the Flame Nebula is NGC 2024, which gets
  the name); "Pinwheel Galaxy" is not used for M33. 24 well-known names missing from OpenNGC (Heart, Soul, Flame,
  Jellyfish, Pacman, Wizard, Thor's Helmet, Pinwheel, Phantom, Hamburger, UFO, Hockey Stick, Cat's Paw, Southern
  Ring, Running Chicken, 30 Doradus, Witch's Broom, Leo Triplet on NGC 3628…) were added; the build checks that
  each one appears together with the designation in the pinned Wikipedia revision. Display names: NGC 3372 is
  the "Carina Nebula" and NGC 3132 the "Southern Ring Nebula" (the Caldwell-table names stay as aliases).
  Abbreviations in OpenNGC names are expanded ("omi Per Cloud" → "Omicron Persei Cloud").
* **Coalsack (C99):** position (12h50m, −62°30′) and size (7° × 5°) from Wikipedia — OpenNGC/SIMBAD give a point
  near the cloud's western edge.
* **Descriptions:** every Messier and Caldwell object (plus NGC 869/884 and the Coathanger) has a hand-written
  1–2 sentence description in `scripts/data/descriptions.mjs` — what an observer sees, plus well-established facts
  from SEDS, Wikipedia and Harris (2010); the build fails if one is missing. Other objects use seed text where
  available, otherwise text generated only from catalogue data (magnitude, morphology, constellation, size, PN
  central-star magnitude, Harris distance, `magOf`), plus a few relations noted in `DESC_APPEND`. Double-star
  texts combine a curated note with the WDS/ORB6 numbers.

## Regenerating

```sh
npm run data:catalog   # = node scripts/data/build-catalog.mjs  → shared/data/catalog.json
npm run data:sky       # = node scripts/data/build-sky.mjs      → stars, starnames, constellation-*, milkyway, constellations-meta.ts
npm run data:backdrop  # = node scripts/data/build-backdrop.mjs → backdrop.json (from stars.json + constellation-lines.json)
# add --refresh to re-download every source (otherwise scripts/data/.cache/ is reused)
```

No npm dependencies (Node ≥ 20). Downloads go to `scripts/data/.cache/` (≈30 MB, git-ignored). All sources are
pinned (OpenNGC and d3-celestial commits, Wikipedia revision IDs), so a rebuild is deterministic. The
exceptions are the WDS/ORB6 and Harris files, which their maintainers update in place; delete them from the cache
to pick up new measurements. SEDS and SIMBAD values are not downloaded at build time: they are tabulated in
`curation.mjs` with their access date. Both scripts validate their output and exit non-zero on failure. They print the
spot checks, counts, constellation and position cross-checks, every magnitude adjustment and the double-star
table.

Output sizes: catalog.json 244 KB · stars.json 126 KB · milkyway.json 142 KB · constellation-lines.json 15 KB ·
starnames.json 8 KB · constellation-labels.json 4.5 KB.
