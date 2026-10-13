"""Merge the facts pipeline and the writers' stories into the app's data files:
shared/data/objectFacts.json  {id: {d, src, age?, members?}}
shared/data/stories.json      {id: {tagline, story[], facts[], discovered}}"""
import glob, json, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(ROOT, "../../..")
raw = json.load(open(os.path.join(ROOT, "cache/facts-raw.json")))["facts"]
labels = json.load(open(os.path.join(ROOT, "cache/labels.json")))
CURATED = json.load(open(os.path.join(ROOT, "curated_facts.json")))

SRC = {
    "Gaia DR3 (Hunt & Reffert 2023)": "gaia", "Harris 2010": "harris", "LMC": "lmc", "SMC": "smc", "parallax": "plx",
    "Cepheids/TRGB": "cep", "SBF": "sbf", "redshift-independent": "lit", "Hubble flow": "z", "Wikipedia": "wiki",
    "SIMBAD": "lit", "Wikidata": "wiki", "Baumgardt": "baumgardt",
}
facts = {}
for k, f in raw.items():
    out = {}
    if f.get("d"):
        out["d"] = f["d"]
        out["src"] = SRC.get(f["src"], "gaia" if f["src"].startswith("Gaia") else "wiki")
    if CURATED.get(k, {}).get("age"): out["age"] = CURATED[k]["age"]
    elif f.get("age"): out["age"] = f["age"]
    if f.get("members"): out["members"] = f["members"]
    for key in ("r", "lum", "teff", "mass", "stars", "rhoc", "vesc", "tdiss"):
        if f.get(key) is not None: out[key] = f[key]
    if out: facts[k] = out
json.dump(facts, open(os.path.join(REPO, "shared/data/objectFacts.json"), "w"), separators=(",", ":"), ensure_ascii=False, sort_keys=True)

# Stars renamed after their stories were written (IAU names adopted 2024–2026): the drafts keep the old ids.
ID_RENAME = {"gamma-cassiopeiae": "tiansi", "alpha-lupi": "uridim", "zeta-centauri": "leepwal", "zeta-herculis": "tianji"}

stories = {}
for path in sorted(glob.glob(os.path.join(ROOT, "out/*.json"))):
    for k, v in json.load(open(path)).items():
        k = ID_RENAME.get(k, k)
        d = v.get("discovered") or None
        # Fall back to Wikidata's discoverer when the writer had none (one person only, and only with a year).
        if (not d or not (d.get("by") or d.get("note"))) and raw.get(k, {}).get("_by") and len(raw[k]["_by"]) == 1 and raw[k].get("year"):
            d = {"by": labels.get(raw[k]["_by"][0]), "year": raw[k]["year"], "note": None}
        if d: d = {kk: vv for kk, vv in d.items() if vv not in (None, "")} or None
        stories[k] = {"tagline": v["tagline"].strip(), "story": [p.strip() for p in v["story"]], "facts": v.get("facts", []), **({"discovered": d} if d else {})}
json.dump(stories, open(os.path.join(REPO, "shared/data/stories.json"), "w"), separators=(",", ":"), ensure_ascii=False, sort_keys=True)

# Stars: the writers' observing notes become the catalog description (shown on the sky chart and at the eyepiece).
notes = {}
for path in sorted(glob.glob(os.path.join(ROOT, "out/s*.json"))):
    for k, v in json.load(open(path)).items():
        if v.get("desc"): notes[ID_RENAME.get(k, k)] = v["desc"].strip()
if notes:
    cat_path = os.path.join(REPO, "shared/data/catalog.json")
    cat = json.load(open(cat_path))
    for o in cat:
        if o["type"] == "star" and o["id"] in notes:
            o["desc"] = notes[o["id"]]
    KEY_ORDER = ["id", "name", "designations", "m", "c", "type", "ra", "dec", "mag", "magB", "magOf", "size", "sb", "con", "hubble", "sep", "mag2", "pa", "sp", "bv", "vary", "desc", "showpiece"]
    cat = [{k: o[k] for k in KEY_ORDER if k in o} | {k: v for k, v in o.items() if k not in KEY_ORDER} for o in cat]
    json.dump(cat, open(cat_path, "w"), ensure_ascii=False, separators=(",", ":"))
print(f"facts: {len(facts)}  stories: {len(stories)}", file=sys.stderr)
