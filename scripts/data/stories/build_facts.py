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
import math, csv, json, math, os, re, statistics, sys

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

# --- Baumgardt et al. (2018–2023) globular cluster parameters (people.smp.uq.edu.au/HolgerBaumgardt/globular):
# distance (Baumgardt & Vasiliev 2021), mass, core density, central escape velocity, remaining lifetime.
def _baumgardt():
    import html as _h
    out = {}
    if not os.path.exists(C("baumgardt.txt")): return out
    t = open(C("baumgardt.txt"), encoding="utf-8", errors="ignore").read()
    num = lambda x: float(re.sub(r"[^\d.eE+-]", "", x.split("±")[0]) or "nan")
    for r in re.findall(r"<tr[^>]*>(.*?)</tr>", t, re.S):
        c = [_h.unescape(re.sub(r"<[^>]+>", "", x)).strip() for x in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", r, re.S)]
        if len(c) < 23 or not re.match(r"^[A-Z]", c[0]) or c[0].startswith("Cluster"): continue
        names = [n.strip() for n in re.split(r"\s{2,}|\xa0", c[0]) if n.strip()]
        m = re.match(r"([\d.]+)\s*±\s*[\d.]+\s*·\s*10(\d+)", c[7])
        try:
            rec = {"rsun_kpc": num(c[3]), "mass": float(m.group(1)) * 10 ** int(m.group(2)) if m else None, "log_rho_c": num(c[14]), "tdiss_gyr": num(c[18]), "vesc": num(c[22])}
        except Exception:
            continue
        for n in names: out[n.lower()] = rec
    return out
BAUMGARDT = _baumgardt()

def baumgardt_for(o):
    for d in o["designations"]:
        r = BAUMGARDT.get(d.lower()) or BAUMGARDT.get(d.lower().replace("palomar", "pal"))
        if r: return r
    return None

# --- Wikipedia infoboxes: mass, number of stars (galaxies), for objects that have them
RAW_BOX = json.load(open(C("infobox-raw.json"))) if os.path.exists(C("infobox-raw.json")) else {}
WORDS = {"thousand": 1e3, "million": 1e6, "billion": 1e9, "trillion": 1e12}

def box_number(v):
    """First quantity in an infobox value: {{val|1.5|0.2|e=12}}, {{Val|5e10}}, "~1 trillion", "6×10<sup>5</sup>", "800"."""
    if not v: return None
    v = re.sub(r"<ref[^>]*/>|<ref.*?</ref>|<ref[^>]*>.*|<!--.*?-->|&nbsp;", " ", v, flags=re.S)
    m = re.search(r"\{\{\s*val\s*\|\s*(\d[\d,]*(?:\.\d+)?(?:e\d+)?)([^}]*)\}\}", v, re.I)
    if m:
        n = float(m.group(1).replace(",", "")); e = re.search(r"e\s*=\s*(\d+)", m.group(2))
        return n * 10 ** int(e.group(1)) if e else n
    m = re.search(r"([\d][\d,]*(?:\.\d+)?)\s*(?:×|x|&times;)\s*10\s*(?:<sup>|\^)\s*(\d+)", v)
    if m: return float(m.group(1).replace(",", "")) * 10 ** int(m.group(2))
    m = re.search(r"([\d][\d,]*(?:\.\d+)?)\s*(thousand|million|billion|trillion)?", v)
    if not m: return None
    return float(m.group(1).replace(",", "")) * WORDS.get(m.group(2) or "", 1)

def box_field(o, *names):
    t = RAW_BOX.get(o["id"]) or ""
    for n in names:
        m = re.search(r"\n\s*\|\s*" + n + r"\s*=([^\n]*)", t)
        if m and m.group(1).strip(): return m.group(1)
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

def bc_v(teff):
    """Bolometric correction to the V magnitude for a star of this temperature (Torres 2010, from Flower 1996)."""
    lt = math.log10(teff)
    if lt < 3.70:
        c = (-0.190537291496456e+05, 0.155144866764412e+05, -0.421278819301717e+04, 0.381476328422343e+03)
    elif lt < 3.90:
        c = (-0.370510203809015e+05, 0.385672629965804e+05, -0.150651486316025e+05, 0.261724637119416e+04, -0.170623810323864e+03)
    else:
        c = (-0.118115450538963e+06, 0.137145973583929e+06, -0.636233812100225e+05, 0.147412923562646e+05, -0.170587278406872e+04, 0.788731721804990e+02)
    return sum(k * lt ** i for i, k in enumerate(c))

def consistent_star(f, o):
    """Radius, luminosity and temperature must agree (L = R² (T / 5772 K)⁴). Wikipedia's infoboxes sometimes put a
    number in the wrong field (a radius of exactly 1, a radius equal to the luminosity…). When the three disagree by
    more than a factor of 4 in luminosity, the star's own brightness and distance decide which figure is wrong: the
    luminosity they imply gives a radius to compare both candidates with. Without them, the radius is dropped."""
    r, lum, t = f.get("r"), f.get("lum"), f.get("teff")
    if not (r and lum and t): return
    r_lt = math.sqrt(lum) * (5772 / t) ** 2
    if max(r, r_lt) / min(r, r_lt) <= 2: return
    mag, d = o.get("mag"), f.get("d")
    # The bolometric correction holds from about 2,600 to 45,000 K; outside it, or without a magnitude and distance,
    # there is nothing to judge by, so the doubtful radius goes.
    if mag is None or not d or not 2600 <= t <= 45000:
        review.append(f"{o['id']:<14} star               r {r} vs {r_lt:.3g} from L,T — dropped r"); del f["r"]; return
    l_phot = 10 ** ((4.74 - (mag - 5 * math.log10(d / LY_PER_PC / 10) + bc_v(t))) / 2.5)
    r_phot = math.sqrt(l_phot) * (5772 / t) ** 2
    # Far fainter than both candidates: its light is dimmed by its own dust (Eta Carinae), so photometry can't judge.
    if l_phot * 3 < min(lum, r ** 2 * (t / 5772) ** 4):
        review.append(f"{o['id']:<14} star               r {r} vs {r_lt:.3g} from L,T, dust-dimmed — dropped r"); del f["r"]; return
    if abs(math.log(r_lt / r_phot)) < abs(math.log(r / r_phot)):
        review.append(f"{o['id']:<14} star               radius {r} → {r_lt:.3g} (from L and T; photometry says {r_phot:.3g})")
        f["r"] = float(f"{r_lt:.3g}")
    else:
        lum_rt = r ** 2 * (t / 5772) ** 4
        review.append(f"{o['id']:<14} star               luminosity {lum} → {lum_rt:.3g} (from R and T; photometry says {l_phot:.3g})")
        f["lum"] = float(f"{lum_rt:.3g}")

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
    consistent_star(f, o)
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
        b = baumgardt_for(o)
        r = harris_for(o)
        if b and b.get("rsun_kpc") == b.get("rsun_kpc"): d, src = b["rsun_kpc"] * 1e3 * LY_PER_PC, "Baumgardt"
        elif r: d, src = r * 1e3 * LY_PER_PC, "Harris 2010"
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
    # Mass and contents: Baumgardt for globular clusters, the Wikipedia infobox otherwise (within sanity limits).
    if o["type"] == "globular_cluster" and baumgardt_for(o):
        b = baumgardt_for(o)
        if b.get("mass"): f["mass"] = float(f"{b['mass']:.2g}")
        if b.get("log_rho_c") == b.get("log_rho_c"): f["rhoc"] = round(b["log_rho_c"], 2)
        if b.get("vesc") == b.get("vesc"): f["vesc"] = round(b["vesc"], 1)
        if b.get("tdiss_gyr") == b.get("tdiss_gyr") and b["tdiss_gyr"] > 0: f["tdiss"] = round(b["tdiss_gyr"], 1)
    else:
        lim = (1e6, 1e14) if o["type"] in ("galaxy", "galaxy_group") else (0.01, 1e6)
        mass = box_number(box_field(o, "mass_msol", "mass"))
        if mass and lim[0] <= mass <= lim[1]: f["mass"] = float(f"{mass:.2g}")
        if o["type"] in ("galaxy", "galaxy_group"):
            n = box_number(box_field(o, "stars"))
            if n and 1e6 <= n <= 1e14: f["stars"] = float(f"{n:.2g}")
        # A double's brighter star: the starbox lists it first.
        if o["type"] == "double_star":
            for keys, lo, hi, name in ((("radius",), 0.05, 3000, "r"), (("luminosity", "luminosity_bolometric"), 1e-5, 1e7, "lum"), (("temperature",), 2000, 60000, "teff")):
                v = box_number(box_field(o, *keys))
                if v is not None and lo <= v <= hi: f[name] = float(f"{v:.3g}")
            consistent_star(f, o)
    if by: f["_by"] = by; labels_needed.update(by)
    if yr: f["year"] = yr
    facts[o["id"]] = f

json.dump({"facts": facts, "labels": sorted(labels_needed)}, open(C("facts-raw.json"), "w"))
open(C("facts-review.txt"), "w").write("\n".join(review))
print(f"{sum(1 for f in facts.values() if 'd' in f)}/{len(facts)} with distance, {sum(1 for f in facts.values() if 'age' in f)} ages, {len(review)} to review", file=sys.stderr)
