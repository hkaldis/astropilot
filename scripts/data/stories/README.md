# Object stories and facts

The **About** section of every object page shows a story (what makes the object remarkable), "Did you know?" cards,
the distance, real size, age and Gaia member count, when its light set off, and where it is in or beyond the Milky Way.
This folder builds the two data files behind it:

| File | Contents |
|---|---|
| `shared/data/objectFacts.json` | `{id: {d, src, age?, members?}}` — distance in light-years and its source (see `DISTANCE_SOURCE` in `shared/stories.ts`), cluster age and Gaia member stars |
| `shared/data/stories.json` | `{id: {tagline, story[], facts[], discovered?}}` — the stories, with `[[glossary-slug\|words]]` links |

## Facts (scripted, reproducible)

```bash
python3 -I scripts/data/stories/fetch_wiki.py      # Wikipedia articles + Wikidata claims (cache/)
python3 -I scripts/data/stories/fetch_moons.py     # the planets' moons
python3 -I scripts/data/stories/fetch_simbad.py    # SIMBAD basic data and distance measurements
python3 -I scripts/data/stories/fetch_infobox.py   # Wikipedia infobox distances, to cross-check
python3 -I scripts/data/stories/build_facts.py     # → cache/facts-raw.json and cache/facts-review.txt
python3 -I scripts/data/stories/merge.py           # → shared/data/objectFacts.json and stories.json
```

`build_facts.py` also needs `cache/hunt2023.csv` (Hunt & Reffert 2023, VizieR `J/A+A/673/A114/clusters`: distances
and member counts), `cache/cg2020.csv` (Cantat-Gaudin et al. 2020, VizieR `J/A+A/640/A1/table1`: ages — Hunt &
Reffert's ages are too young for old clusters) and `cache/harris-mwgc.dat` (https://physics.mcmaster.ca/~harris/mwgc.dat). Distances, best first: Gaia DR3 for open
clusters; Harris 2010 for globulars; the LMC/SMC distance for objects inside them; parallax for double stars;
Cepheid/TRGB, then SBF, then other redshift-independent measurements for galaxies; parallaxes, then other measurements,
for nebulae. For Messier, Caldwell and showpiece objects (except open clusters, where Gaia is newer) a value more than
25% from the Wikipedia infobox is replaced by Wikipedia's. `curated_facts.json` fills the few gaps by hand.
`shared/stories.test.ts` checks well-known distances against reference values.

## Stories (written, then checked)

The stories were written in our own words from each object's Wikipedia article and well-established knowledge,
following `BRIEF.md`: `make_batches.py` splits the objects into research batches, each written to `out/NN.json` and
validated with `check.py NN` (shape, length, glossary links, no distance figures, no hype). `overlap.py` flags any
passage that copies 10 or more words in a row from the sources. `merge.py` adds Wikidata's discoverer where a story
has none. To change a story, edit `shared/data/stories.json` directly (keep it valid for `shared/stories.test.ts`).

## Bright named stars

```bash
python3 -I scripts/data/stories/fetch_stars.py        # SIMBAD: every named star (by IAU name, else by position) + extras
python3 -I scripts/data/stories/build_stars.py        # → type "star" entries in shared/data/catalog.json
python3 -I scripts/data/stories/fetch_stars_wiki.py   # their Wikipedia articles and infobox figures
python3 -I scripts/data/stories/build_facts.py && python3 -I scripts/data/stories/merge.py
```

Names follow the IAU Catalog of Star Names (`cache/IAU-CSN.txt`, from
https://www.pas.rochester.edu/~emamajek/WGSN/IAU-CSN.txt, parsed by `iau_names.py`) plus the names adopted since
(listed in `build_stars.py`). Star distances use the Hipparcos (2007) parallax for naked-eye stars, else SIMBAD's best,
replaced by Wikipedia's figure when they differ by more than 25% (the supergiants). Radius, luminosity, temperature,
mass and age come from the Wikipedia infoboxes. The stories (batches `s0`–`s3`) also carry each star's observing
note, which `merge.py` writes into the catalog as its `desc`.
