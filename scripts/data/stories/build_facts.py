"""Distances, ages, member counts and discoverers for every catalog object → shared/data/objectFacts.json.

Sources, best first for each kind of object:
  open clusters (and clusters inside nebulae): Hunt & Reffert 2023 (Gaia DR3; distance, age, members)
  Milky Way globular clusters: Harris 2010 (R_Sun)
  clusters and nebulae in the Magellanic Clouds: the LMC (49.6 kpc, Pietrzyński+ 2019) / SMC (62.4 kpc, Graczyk+ 2020)
  double stars: Gaia/Hipparcos parallax of the primary (SIMBAD)
  galaxies: SIMBAD distance measurements — Cepheids/TRGB, else SBF, else the median of other redshift-independent
    methods, else Hubble flow (H0 = 70)
  nebulae: SIMBAD measurements (Gaia parallaxes of the central/exciting stars first), then curated values
Discoverers and years: Wikidata (P61, P575).
Writes a review list of disagreements with Wikidata's "distance from Earth" to cache/facts-review.txt."""
import csv, json, math, os, re, statistics, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(ROOT, "../../..")
C = lambda f: os.path.join(ROOT, "cache", f)
CAT = json.load(open(os.path.join(REPO, "shared/data/catalog.json")))
SIM = json.load(open(C("simbad.json")))
WIKI = json.load(open(C("wiki.json")))
WD = json.load(open(C("wikidata.json"))) if os.path.exists(C("wikidata.json")) else {}
LY_PER_PC = 3.26156
CURATED = json.load(open(os.path.join(ROOT, "curated_facts.json"))) if os.path.exists(os.path.join(ROOT, "curated_facts.json")) else {}

# --- Hunt & Reffert 2023
hunt = {}
for r in csv.DictReader(open(C("hunt2023.csv"))):
    names = [r["Name"]] + [n for n in r["AllNames"].split(",") if n.strip()]
    for k, n in enumerate(names):
        key = re.sub(r"[_\s]+", " ", n.strip()).lower()
        # The cluster's own name wins over a cross-identification; between cross-identifications, the richer cluster.
        rank = (0 if k == 0 else 1, -int(r["N"] or 0))
        if key not in hunt or rank < hunt[key][1]:
            hunt[key] = (r, rank)

def hunt_for(o):
    keys = []
    for d in o["designations"]:
        d2 = d.replace("Mel ", "Melotte ").replace("Cr ", "Collinder ")
        if o.get("m") and d == f"M {o['m']}": keys.append(f"m {o['m']}")
        keys.append(d2.lower())
    for k in keys:
        if k in hunt:
            r, rank = hunt[k]
            if r["Type"] in ("o", "m") or o["type"] != "globular_cluster": return r
    return None

# --- Cantat-Gaudin et al. 2020 (Gaia DR2): cluster ages, better tested than Hunt & Reffert's for old clusters
cg = {}
for r in csv.DictReader(open(C("cg2020.csv"))):
    cg[re.sub(r"[_\s]+", " ", r["Cluster"]).lower()] = r

def cg_age(o):
    for d in o["designations"]:
        r = cg.get(d.replace("Mel ", "Melotte ").replace("Cr ", "Collinder ").lower())
        if r and r["AgeNN"]: return 10 ** float(r["AgeNN"])
    return None

# --- Harris 2010
harris = {}
part1 = open(C("harris-mwgc.dat")).read().split("Part II")[0]
for line in part1.splitlines():
    m = re.match(r"^\s*(\S+(?: \S+)?)\s{2,}", line)
    cols = line.split()
    if len(cols) < 10 or not re.match(r"^(NGC|Pal|IC|Terzan|Ton|Arp|Pyxis|Eridanus|AM|Rup|Djorg|Liller|E|BH|HP|ESO|Lynga|UKS|Whiting|Ko|FSR|Koposov|Segue|BH|Mercer)", line.strip()):
        continue
    nums = re.findall(r"-?\d+\.\d+", line)
    ident = re.split(r"\s{2,}", line.strip())[0]
    try:
        # R_Sun is the first float after the galactic latitude: L, B, R_Sun, R_gc, X, Y, Z
        floats = [float(x) for x in nums]
        rsun = floats[-5]
    except Exception:
        continue
    harris[ident.lower()] = rsun

def harris_for(o):
    for d in o["designations"]:
        k = d.lower().replace("palomar", "pal")
        if k in harris: return harris[k]
    return None

def sep(ra1, de1, ra2, de2):
    a1, d1, a2, d2 = map(math.radians, (ra1 * 15, de1, ra2 * 15, de2))
    return math.degrees(math.acos(min(1, math.sin(d1) * math.sin(d2) + math.cos(d1) * math.cos(d2) * math.cos(a1 - a2))))

LMC_LY, SMC_LY = 49.59e3 * LY_PER_PC, 62.44e3 * LY_PER_PC
STELLAR = {"open_cluster", "globular_cluster", "cluster_nebula", "emission_nebula", "supernova_remnant", "planetary_nebula", "reflection_nebula"}

def simbad_distance(o):
    s = SIM.get(o["id"])
    if not s: return None, None
    ds = s["dists"]
    def med(sel):
        v = [d for d, m, b in ds if sel(m)]
        return statistics.median(v) if v else None
    if o["type"] in ("galaxy", "galaxy_group"):
        for label, sel in (("Cepheids/TRGB", lambda m: m.lower() in ("cep", "ceph", "t-rgb", "trgb")), ("SBF", lambda m: m == "SBF"), ("redshift-independent", lambda m: m.lower() not in ("redshift", "?", "kin"))):
            v = med(sel)
            if v: return v * LY_PER_PC, label
        if s.get("z") and s["z"] > 0.003: return s["z"] * 299792.458 / 70 * 1e6 * LY_PER_PC, "Hubble flow"
        v = med(lambda m: True)
        return (v * LY_PER_PC, "SIMBAD") if v else (None, None)
    if o["type"] == "double_star":
        if s.get("plx") and s["plx"] > 0.3: return 1000 / s["plx"] * LY_PER_PC, "parallax"
        v = med(lambda m: m.lower().startswith("paral") or m == "plx")
        return (v * LY_PER_PC, "parallax") if v else (None, None)
    v = med(lambda m: m.lower().startswith("paral") or m == "plx")
    if v: return v * LY_PER_PC, "parallax"
    v2 = med(lambda m: True)
    return (v2 * LY_PER_PC, "SIMBAD") if v2 else (None, None)

UNIT_LY = {"Q531": 1, "Q12129": LY_PER_PC, "Q11929860": LY_PER_PC * 1e3, "Q3773454": LY_PER_PC * 1e6, "Q3675495": 1e6, "Q20768063": 1e9, "Q1811": 1 / 63241.077}

def wikidata(o):
    w = WIKI.get(o["id"]) or {}
    claims = WD.get(w.get("qid") or "", {})
    d = None
    for c in claims.get("P2583", []):
        try:
            dv = c["mainsnak"]["datavalue"]["value"]
            unit = dv["unit"].rsplit("/", 1)[-1]
            if unit in UNIT_LY: d = float(dv["amount"]) * UNIT_LY[unit]; break
        except Exception: pass
    by = [c["mainsnak"]["datavalue"]["value"]["id"] for c in claims.get("P61", []) if c["mainsnak"].get("datavalue")]
    yr = None
    for c in claims.get("P575", []):
        try:
            t = c["mainsnak"]["datavalue"]["value"]["time"]; yr = int(t[1:5]) if t[0] == "+" else None; break
        except Exception: pass
    return d, by, yr

def rnd(x):
    """Round to the precision the measurement deserves: 2–3 significant figures."""
    if x is None: return None
    if x < 100: return round(x, 1) if x < 20 else round(x)
    p = 10 ** (int(math.log10(x)) - 1)
    if x < 1000: p = 10
    return int(round(x / p) * p)

INFOBOX = json.load(open(C("infobox.json"))) if os.path.exists(C("infobox.json")) else {}
# Single stars: SIMBAD (fetch_stars.py, keyed by chart name) and their Wikipedia infoboxes (fetch_stars_wiki.py, by id).
STAR_SIM = {}
for _k, _v in (json.load(open(C("stars-simbad.json"))) if os.path.exists(C("stars-simbad.json")) else {}).items():
    STAR_SIM[_v["oid"]] = _v
STAR_WIKI = json.load(open(C("wiki-stars.json"))) if os.path.exists(C("wiki-stars.json")) else {}

def star_record(o):
    hip = next((d for d in o["designations"] if d.startswith("HIP ")), None)
    for v in STAR_SIM.values():
        if hip and any(re.sub(r"\s+", " ", i) == hip for i in v["ids"]):
            return v
    return None

def star_facts(o):
    """Distance from the Hipparcos parallax for naked-eye stars (Gaia saturates on them), else SIMBAD's best; and the
    star's size, power, temperature and mass from its Wikipedia infobox, within sanity limits."""
    f, d, src = {}, None, None
    s = star_record(o)
    if s:
        plx = s["hip_plx"] if s.get("hip_plx") and (s.get("V") or o.get("mag", 9)) < 6 else s.get("plx") or s.get("hip_plx")
        if plx and plx > 0.2: d, src = 1000 / plx * LY_PER_PC, "parallax"
    box = (STAR_WIKI.get(o["id"]) or {}).get("infobox", {})
    # The parsec figure is unambiguous (dist_ly is often a {{convert}} of it, which reads as parsecs).
    ib = box["dist_pc"] * LY_PER_PC if box.get("dist_pc") else box.get("dist_ly")
    # Wikipedia's figure wins when they differ by more than a quarter: the infoboxes use interferometry, cluster or
    # spectroscopic distances where a parallax is poor (the supergiants).
    if ib and (not d or max(d, ib) / min(d, ib) > 1.25):
        if d: review.append(f"{o['id']:<14} star               ours {rnd(d):>12,} ({src}) → Wikipedia {rnd(ib):>12,}")
        d, src = ib, "Wikipedia"
    if d: f["d"], f["src"] = rnd(d), src
    for key, lo, hi, name in (("radius", 0.05, 3000, "r"), ("luminosity", 1e-5, 1e7, "lum"), ("temperature", 2000, 60000, "teff"), ("mass", 0.05, 200, "mass")):
        v = box.get(key)
        if v is not None and lo <= v <= hi: f[name] = float(f"{v:.3g}")
    if box.get("age_gyr") and 0 < box["age_gyr"] < 14: f["age"] = rnd(box["age_gyr"] * 1e9)
    elif box.get("age_myr") and 0 < box["age_myr"] < 14000: f["age"] = rnd(box["age_myr"] * 1e6)
    return f
TRUST_OURS = {"open_cluster"}  # Gaia DR3 beats the older values often quoted on Wikipedia

facts, review = {}, []
labels_needed = set()
for o in CAT:
    if o["type"] == "star":
        facts[o["id"]] = star_facts(o)
        if "d" not in facts[o["id"]]: review.append(f"{o['id']:<14} star               NO DISTANCE")
        continue
    f = {}
    d, src = None, None
    h = hunt_for(o) if o["type"] in ("open_cluster", "cluster_nebula", "asterism") else None
    if o["type"] == "globular_cluster":
        r = harris_for(o)
        if r: d, src = r * 1e3 * LY_PER_PC, "Harris 2010"
    if d is None and o["type"] in STELLAR and o["type"] != "planetary_nebula":
        if sep(o["ra"], o["dec"], 5.39, -69.76) < 9 and not harris_for(o): d, src = LMC_LY, "LMC"
        elif sep(o["ra"], o["dec"], 0.88, -72.8) < 4.5 and not harris_for(o): d, src = SMC_LY, "SMC"
    if d is None and h and h["dist50"]:
        d, src = float(h["dist50"]) * LY_PER_PC, "Gaia DR3 (Hunt & Reffert 2023)"
    if d is None:
        d, src = simbad_distance(o)
    if o["id"] in CURATED and "d" in CURATED[o["id"]]:
        d, src = CURATED[o["id"]]["d"], CURATED[o["id"]].get("src", "curated")
    if o["type"] in ("open_cluster", "cluster_nebula"):
        age = cg_age(o)
        if age: f["age"] = rnd(age)
        # Gaia DR3 member count, when the Hunt & Reffert match agrees with the distance we use.
        if h and h.get("N") and h.get("dist50") and d and 0.75 < float(h["dist50"]) * LY_PER_PC / d < 1.33: f["members"] = int(h["N"])
    wd_d, by, yr = wikidata(o)
    ib = (INFOBOX.get(o["id"]) or {}).get("ly")
    famous = bool(o.get("m") or o.get("c") or o.get("showpiece") or o["type"] == "double_star")
    if ib and "d" not in CURATED.get(o["id"], {}) and o["type"] not in TRUST_OURS and (not d or (famous and max(d, ib) / min(d, ib) > 1.25)):
        if d: review.append(f"{o['id']:<14} {o['type']:<18} ours {rnd(d):>12,} ({src}) → Wikipedia {rnd(ib):>12,}")
        d, src = ib, "Wikipedia"
    if d:
        f["d"] = rnd(d)
        f["src"] = src
        if src != "Wikipedia" and ib and (max(d, ib) / min(d, ib) > 1.4) and famous:
            review.append(f"{o['id']:<14} {o['type']:<18} ours {rnd(d):>12,} ({src})  KEPT; Wikipedia says {rnd(ib):>12,}")
        elif wd_d and not ib and (max(d, wd_d) / min(d, wd_d) > 1.4):
            review.append(f"{o['id']:<14} {o['type']:<18} ours {rnd(d):>12,} ({src})  wikidata {rnd(wd_d):>12,}")
    elif wd_d:
        f["d"], f["src"] = rnd(wd_d), "Wikidata"
    else:
        review.append(f"{o['id']:<14} {o['type']:<18} NO DISTANCE")
    if by: f["_by"] = by; labels_needed.update(by)
    if yr: f["year"] = yr
    facts[o["id"]] = f

json.dump({"facts": facts, "labels": sorted(labels_needed)}, open(C("facts-raw.json"), "w"))
open(C("facts-review.txt"), "w").write("\n".join(review))
print(f"{sum(1 for f in facts.values() if 'd' in f)}/{len(facts)} with distance, {sum(1 for f in facts.values() if 'age' in f)} ages, {len(review)} to review", file=sys.stderr)
