"""Apply the cross-check corrections (scripts/crosscheck/*-corrections.json) to the app's data, re-runnably:

- facts (d, mass, age, members, r, lum, teff, stars, …) → scripts/data/stories/curated_facts.json, each with its
  source; build_facts.py + merge.py then rebuild shared/data/objectFacts.json from it;
- catalogue fields (size, mag, ra/dec) → generated blocks in scripts/data/curation.mjs (so a full catalogue rebuild
  keeps them) and patched straight into shared/data/catalog.json, descriptions included.

Planet/moon constants (bodies-corrections.json) are code, edited by hand.
Usage: python3 scripts/crosscheck/apply.py [--dry-run]"""
import glob, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(HERE, "../..")
CURATED_P = os.path.join(REPO, "scripts/data/stories/curated_facts.json")
CURATION_P = os.path.join(REPO, "scripts/data/curation.mjs")
CATALOG_P = os.path.join(REPO, "shared/data/catalog.json")
DRY = "--dry-run" in sys.argv

FACT_KEYS = ("d", "mass", "age", "members", "r", "lum", "teff", "stars", "rhoc", "vesc", "tdiss")

corr = {}
for p in sorted(glob.glob(os.path.join(HERE, "*-corrections.json"))):
    if p.endswith("bodies-corrections.json"): continue
    fam = os.path.basename(p).replace("-corrections.json", "")
    for oid, c in json.load(open(p)).items():
        if oid.startswith("_"): continue
        corr.setdefault(oid, {})[fam] = c

curated = json.load(open(CURATED_P))
catalog = json.load(open(CATALOG_P))
by_id = {o["id"]: o for o in catalog}
size_ov, mag_ov, pos_ov, log = {}, {}, {}, []

def dist_src(text):
    """The source label the app shows for a corrected distance (merge.py maps these to DISTANCE_SOURCE keys)."""
    t = text or ""
    keys = {"cep": "Cepheids/TRGB", "sbf": "SBF", "lit": "SIMBAD", "z": "Hubble flow", "plx": "parallax", "gaia": "Gaia DR3 (Hunt & Reffert 2023)", "baumgardt": "Baumgardt", "harris": "Harris 2010", "wiki": "Wikipedia"}
    if t in keys: return keys[t]
    if "HR23" in t or "Hunt" in t: return "Gaia DR3 (Hunt & Reffert 2023)"
    if "Gaia" in t and any(w in t for w in ("plx", "parallax", "BJ21", "rgeo")): return "parallax"
    if "Baumgardt" in t: return "Baumgardt"
    if "Wikipedia" in t: return "Wikipedia"
    return "SIMBAD"  # published measurements

for oid, fams in sorted(corr.items()):
    if oid not in by_id:
        log.append(f"!! {oid}: not in the catalogue"); continue
    for fam, c in fams.items():
        cur = curated.setdefault(oid, {})
        for k in FACT_KEYS:
            if k in c:
                cur[k] = c[k]
                if c.get(f"{k}_src"): cur[f"{k}_src"] = c[f"{k}_src"]
                if k == "d":
                    cur["src"] = dist_src(c.get("d_src"))
                    if c.get("d_ref"): cur["d_src"] = c["d_ref"]
                log.append(f"{oid:<12} {k:<8} → {c[k]}  ({fam}: {c.get(f'{k}_src', '')[:90]})")
        cat = c.get("catalog") or {}
        src = cat.get("src") or cat.get("pos_src") or cat.get("size_src") or cat.get("mag_src") or ""
        if "size" in cat: size_ov[oid] = (cat["size"], src)
        if "mag" in cat: mag_ov[oid] = (cat["mag"], src)
        if "ra" in cat or "dec" in cat: pos_ov[oid] = ({k: cat[k] for k in ("ra", "dec") if k in cat}, src)
        for k in cat:
            if k not in ("size", "mag", "ra", "dec", "src", "pos_src", "size_src", "mag_src"): log.append(f"!! {oid}: catalogue field {k} not handled")
        for k in c:
            if k not in FACT_KEYS and not k.endswith("_src") and k not in ("catalog", "note", "d_ref"): log.append(f"!! {oid}: field {k} not handled")

# --- descriptions: the generated "A 7.3-magnitude open cluster in Puppis, about 7″ across." keep in step.
def fmt_num(x): return str(round(x, 1)).rstrip("0").rstrip(".") if x < 10 else str(round(x))
def size_phrase(size):
    a, b = size[0], (size[1] if len(size) > 1 else None)
    if a >= 100: f = lambda x: f"{round(x / 60, 1):.1f}°"
    elif a < 1: f = lambda x: f"{round(x * 60)}″"
    else: f = lambda x: f"{fmt_num(x)}′"
    return f"about {f(a)} × {f(b)}" if b is not None and abs(a - b) > 0.05 * a else f"about {f(a)} across"
SIZE_RE = re.compile(r"about [\d.,]+[′″°](?: × [\d.,]+[′″°])?(?: across)?")
MAG_RE = re.compile(r"^(An?) -?[\d.]+-magnitude(?: \(B-band\))? ")

for oid, (size, src) in size_ov.items():
    o = by_id[oid]; old = o.get("size"); o["size"] = size
    if o.get("desc") and SIZE_RE.search(o["desc"]): o["desc"] = SIZE_RE.sub(size_phrase(size), o["desc"], count=1)
    log.append(f"{oid:<12} size     {old} → {size}")
for oid, (mag, src) in mag_ov.items():
    o = by_id[oid]; old = o.get("mag"); o["mag"] = mag; o.pop("magB", None)
    if o.get("desc"):
        art = "An" if re.match(r"^(8|11|18)(\.|\b)", f"{mag:.1f}") else "A"
        o["desc"] = MAG_RE.sub(f"{art} {mag:.1f}-magnitude ", o["desc"], count=1)
    log.append(f"{oid:<12} mag      {old} → {mag}")
for oid, (pos, src) in pos_ov.items():
    o = by_id[oid]
    for k, v in pos.items(): log.append(f"{oid:<12} {k:<8} {o.get(k)} → {v}"); o[k] = v

# --- curation.mjs: generated blocks inside SIZE_OVERRIDES / MAG_OVERRIDES / POSITION_OVERRIDES.
cur_js = open(CURATION_P).read()
def block(name, entries, fmt):
    global cur_js
    begin, end = f"  // crosscheck:{name}:begin (scripts/crosscheck/apply.py)", f"  // crosscheck:{name}:end"
    body = "\n".join(fmt(k, v) for k, v in sorted(entries.items()))
    text = f"{begin}\n{body}\n{end}" if body else f"{begin}\n{end}"
    if begin in cur_js:
        cur_js = re.sub(re.escape(begin) + r".*?" + re.escape(end), lambda _: text, cur_js, flags=re.S)
    else:
        m = re.search(rf"export const {name} = \{{\n", cur_js)
        if not m: raise SystemExit(f"no {name} in curation.mjs")
        cur_js = cur_js[: m.end()] + text + "\n" + cur_js[m.end():]
js = lambda s: json.dumps(s, ensure_ascii=False)
block("SIZE_OVERRIDES", size_ov, lambda k, v: f"  {k}: [{js(v[0])}, {js(v[1])}],")
block("MAG_OVERRIDES", mag_ov, lambda k, v: f"  {k}: [{v[0]}, {js(v[1])}],")
if "export const POSITION_OVERRIDES" not in cur_js:
    cur_js += "\n/** Positions (J2000; RA in hours, Dec in degrees) replacing catalogue values that are off — [{ ra?, dec? }, source]. */\nexport const POSITION_OVERRIDES = {\n};\n"
block("POSITION_OVERRIDES", pos_ov, lambda k, v: f"  {k}: [{js(v[0])}, {js(v[1])}],")

print("\n".join(log))
print(f"\n{sum(1 for l in log if not l.startswith('!!'))} changes, {sum(1 for l in log if l.startswith('!!'))} warnings")
if not DRY:
    json.dump(curated, open(CURATED_P, "w"), indent=1, ensure_ascii=False); open(CURATED_P, "a").write("\n")
    raw = open(CATALOG_P).read()
    open(CATALOG_P, "w").write(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + ("\n" if raw.endswith("\n") else ""))
    open(CURATION_P, "w").write(cur_js)
