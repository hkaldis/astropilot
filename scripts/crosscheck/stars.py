#!/usr/bin/env python3
"""Cross-check AstroPilot's stars and double stars against independent open catalogues (no Wikipedia).

Reads (never writes) shared/data/catalog.json and shared/data/objectFacts.json, then writes
  shared/data/xcheck/stars.json            compact independent reference values per id
  scripts/crosscheck/stars-report.md       per-field counts and every discrepancy beyond tolerance, with a verdict
  scripts/crosscheck/stars-corrections.json proposed corrections for clear errors only (curated_facts.json style)

Sources (all open):
  SIMBAD TAP  basic, ids, allfluxes, mesDiameter, mesFe_h, mesDistance, mesVar
  VizieR TAP  I/311/hip2 (Hipparcos new reduction, van Leeuwen 2007), V/137D/XHIP (Anderson & Francis 2012),
              I/355/gaiadr3 + I/355/paramp (Gaia DR3), II/345/jmdc (JMMC measured diameters, direct methods only),
              B/pastel/pastel (Soubiran et al. 2016), B/wds/wds (Washington Double Star catalogue)
  USNO/GSU    ORB6 ephemerides (orb6ephem.txt) for pairs with a computed orbit

Every response is cached under .local/crosscheck-cache/ (gitignored), so a rerun is offline:
  python3 scripts/crosscheck/stars.py            # fetches what is missing (≤ 1 request/s), then compares
  python3 scripts/crosscheck/stars.py --offline  # cache only; fails if something is missing
Only object identifiers and coordinates are sent.
"""
import csv, hashlib, io, json, math, re, statistics, sys, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / ".local/crosscheck-cache"
OUT_REF = ROOT / "shared/data/xcheck/stars.json"
OUT_REPORT = ROOT / "scripts/crosscheck/stars-report.md"
OUT_CORR = ROOT / "scripts/crosscheck/stars-corrections.json"
OFFLINE = "--offline" in sys.argv
SIMBAD_TAP = "https://simbad.cds.unistra.fr/simbad/sim-tap/sync"
VIZIER_TAP = "https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync"
ORB6_EPHEM = "https://www.astro.gsu.edu/wds/orb6/orb6ephem.txt"
LY_PER_PC = 3.26156
RSUN_PER_MAS_PC = 0.107516  # radius in R☉ of a star with a 1 mas angular *diameter* at 1 pc (215.032 / 2 / 1000)

# ---------------------------------------------------------------------------------------------------------------
# fetching with a polite, on-disk cache
_last = [0.0]

def fetch(url, data=None, tag="q"):
    key = hashlib.sha1((url + "\n" + json.dumps(data, sort_keys=True)).encode()).hexdigest()[:16]
    path = CACHE / f"{tag}-{key}.txt"
    if path.exists():
        return path.read_text()
    if OFFLINE:
        raise SystemExit(f"--offline: {tag} is not cached ({path.name})")
    wait = 1.1 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    body = urllib.parse.urlencode(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers={"User-Agent": "AstroPilot-crosscheck/1.0 (catalogue validation)"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                text = r.read().decode("utf-8", "replace")
            break
        except urllib.error.HTTPError as e:
            if 400 <= e.code < 500:
                raise SystemExit(f"{tag}: HTTP {e.code}\n{e.read().decode('utf-8', 'replace')[:800]}")
            if attempt == 2:
                raise
            print(f"  retry {tag}: {e}", file=sys.stderr)
            time.sleep(5)
        except Exception as e:  # noqa: BLE001 — retry transient network errors
            if attempt == 2:
                raise
            print(f"  retry {tag}: {e}", file=sys.stderr)
            time.sleep(5)
    _last[0] = time.time()
    if text.lstrip().startswith("<"):  # a VOTable error document, not CSV
        raise SystemExit(f"{tag}: service error\n{text[:800]}")
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return text

def tap(service, query, tag):
    text = fetch(service, {"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "csv", "QUERY": query}, tag)
    return list(csv.DictReader(io.StringIO(text)))

def num(s):
    if s is None:
        return None
    s = str(s).strip()
    if s in ("", "null", "NaN", "nan", "."):
        return None
    try:
        return float(s)
    except ValueError:
        return None

def adql_list(items):
    return ",".join("'" + str(i).replace("'", "''") + "'" for i in items)

def norm_id(s):
    return re.sub(r"\s+", " ", s.strip())

def angsep(ra1, de1, ra2, de2):
    """Angular separation in arcsec; all inputs in degrees."""
    r1, d1, r2, d2 = map(math.radians, (ra1, de1, ra2, de2))
    c = math.sin(d1) * math.sin(d2) + math.cos(d1) * math.cos(d2) * math.cos(r1 - r2)
    return math.degrees(math.acos(max(-1.0, min(1.0, c)))) * 3600

def sep_pa(ra1, de1, ra2, de2):
    """Separation (″) and position angle (°, N through E) of point 2 relative to point 1."""
    r1, d1, r2, d2 = map(math.radians, (ra1, de1, ra2, de2))
    pa = math.degrees(math.atan2(math.sin(r2 - r1), math.cos(d1) * math.tan(d2) - math.sin(d1) * math.cos(r2 - r1))) % 360
    return angsep(ra1, de1, ra2, de2), pa

def med(vals):
    vals = [v for v in vals if v is not None]
    return statistics.median(vals) if vals else None

def sig(v, n=3):
    if v is None or v == 0:
        return v
    return float(f"{v:.{n}g}")

def ratio(a, b):
    return max(a, b) / min(a, b)

def year_of(bib):
    m = re.match(r"(\d{4})", bib or "")
    return int(m.group(1)) if m else 0

# ---------------------------------------------------------------------------------------------------------------
# astrophysics helpers
def bc_v(teff):
    """Bolometric correction BC_V(Teff), Flower (1996) as corrected by Torres (2010); M_bol☉ = 4.74."""
    lt = math.log10(teff)
    if lt < 3.70:
        c = (-0.190537291496456e05, 0.155144866764412e05, -0.421278819301717e04, 0.381476328422343e03)
    elif lt < 3.90:
        c = (-0.370510203809015e05, 0.385672629965804e05, -0.150651486316025e05, 0.261724637119416e04, -0.170623810323864e03)
    else:
        c = (-0.118115450538963e06, 0.137145973583929e06, -0.636233812100225e05, 0.147412923562646e05,
             -0.170587278406872e04, 0.788731721804990e02)
    return sum(k * lt ** i for i, k in enumerate(c))

# Intrinsic (B−V)₀ against Teff for dwarfs (Pecaut & Mamajek 2013, "modern mean dwarf colors" table, abridged).
BV0 = [(42000, -0.33), (31400, -0.301), (26000, -0.278), (20600, -0.215), (17000, -0.178), (15700, -0.165),
       (14500, -0.156), (14000, -0.140), (12300, -0.109), (10700, -0.070), (9700, 0.0), (9300, 0.043), (8800, 0.074),
       (8100, 0.140), (7650, 0.208), (7220, 0.294), (6810, 0.374), (6510, 0.438), (6170, 0.512), (5920, 0.587),
       (5770, 0.650), (5490, 0.737), (5280, 0.816), (5040, 0.919), (4830, 0.988), (4450, 1.130), (4050, 1.36),
       (3850, 1.431), (3560, 1.50), (3210, 1.654), (3060, 1.828)]

def bv0(teff):
    if teff >= BV0[0][0]:
        return BV0[0][1]
    for (t1, c1), (t2, c2) in zip(BV0, BV0[1:]):
        if t2 <= teff <= t1:
            return c1 + (c2 - c1) * (t1 - teff) / (t1 - t2)
    return BV0[-1][1]

def g_to_v(g, bp_rp):
    """Gaia G → Johnson V with the Riello et al. (2021) G−V polynomial in BP−RP."""
    x = bp_rp
    if x is None or not -0.5 < x < 2.75:
        return None
    return g - (-0.02704 + 0.01424 * x - 0.2156 * x ** 2 + 0.01426 * x ** 3)

# ---------------------------------------------------------------------------------------------------------------
# the app's data
CAT = json.load(open(ROOT / "shared/data/catalog.json"))
_facts = json.load(open(ROOT / "shared/data/objectFacts.json"))
FACTS = _facts.get("facts", _facts)
OBJS = [o for o in CAT if o["type"] in ("star", "double_star")]
BYID = {o["id"]: o for o in OBJS}

def query_id(o):
    for d in o["designations"]:
        if re.fullmatch(r"HIP \d+", d):
            return d
    for d in o["designations"]:
        if re.fullmatch(r"HD \d+", d):
            return d
    return {"M40": "M 40"}.get(o["id"], o["name"])

QID = {o["id"]: query_id(o) for o in OBJS}

# ---------------------------------------------------------------------------------------------------------------
# 1. SIMBAD
print("SIMBAD …", file=sys.stderr)
rows = tap(SIMBAD_TAP, "SELECT i.id AS qid, b.oid, b.main_id, b.ra, b.dec, b.pmra, b.pmdec, b.plx_value, b.plx_err, "
           "b.plx_bibcode, b.sp_type, b.otype FROM ident AS i JOIN basic AS b ON i.oidref = b.oid "
           f"WHERE i.id IN ({adql_list(QID.values())})", "simbad-basic")
SB = {}  # app id → SIMBAD basic row
by_q = {norm_id(r["qid"]): r for r in rows}
for oid_, q in QID.items():
    r = by_q.get(norm_id(q))
    if r:
        SB[oid_] = r
OIDS = sorted({r["oid"] for r in SB.values()}, key=int)
oid_in = ",".join(OIDS)

def by_oid(rows):
    out = {}
    for r in rows:
        out.setdefault(r["oidref"], []).append(r)
    return out

IDS = {r["oidref"]: r["ids"].split("|") for r in tap(SIMBAD_TAP, f"SELECT oidref, ids FROM ids WHERE oidref IN ({oid_in})", "simbad-ids")}
FLUX = {r["oidref"]: r for r in tap(SIMBAD_TAP, f"SELECT oidref, U, B, V, K FROM allfluxes WHERE oidref IN ({oid_in})", "simbad-flux")}
DIAM = by_oid(tap(SIMBAD_TAP, "SELECT oidref, diameter, error, unit, method, filter, qual, bibcode FROM mesDiameter "
                  f"WHERE oidref IN ({oid_in})", "simbad-diam"))
FEH = by_oid(tap(SIMBAD_TAP, f"SELECT oidref, teff, log_g, fe_h, bibcode FROM mesFe_h WHERE oidref IN ({oid_in})", "simbad-feh"))
MDIST = by_oid(tap(SIMBAD_TAP, "SELECT oidref, dist, unit, method, minus_err, plus_err, qual, bibcode FROM mesDistance "
                   f"WHERE oidref IN ({oid_in})", "simbad-dist"))
MVAR = by_oid(tap(SIMBAD_TAP, f"SELECT oidref, vartyp, vmax, vmin, magtyp, period FROM mesVar WHERE oidref IN ({oid_in})", "simbad-var"))

def ids_of(app_id):
    r = SB.get(app_id)
    return [norm_id(i) for i in IDS.get(r["oid"], [])] if r else []

def ident_prefix(app_id, prefix):
    for i in ids_of(app_id):
        if i.startswith(prefix):
            return i[len(prefix):].strip()
    return None

HIPN = {k: ident_prefix(k, "HIP ") for k in BYID}
GAIA = {k: ident_prefix(k, "Gaia DR3 ") for k in BYID}
WDSID = {k: (ident_prefix(k, "WDS J") or "")[:10] or None for k in BYID}  # "WDS J21069+3845A" → "21069+3845"

# ---------------------------------------------------------------------------------------------------------------
# 2. VizieR
print("VizieR …", file=sys.stderr)
hips = sorted({int(h) for h in HIPN.values() if h and h.isdigit()})
hip_in = ",".join(map(str, hips))
HIP2 = {r["HIP"]: r for r in tap(VIZIER_TAP, 'SELECT HIP, Plx, e_Plx, pmRA, pmDE, Hpmag, "B-V" FROM "I/311/hip2" '
                                  f"WHERE HIP IN ({hip_in})", "viz-hip2")}
XHIP = {r["HIP"]: r for r in tap(VIZIER_TAP, 'SELECT HIP, Plx, e_Plx, Dist, e_Dist, Lum, "Vmag", "B-V", SpType, GrpName '
                                  f'FROM "V/137D/XHIP" WHERE HIP IN ({hip_in})', "viz-xhip")}
# Hipparcos 1997 (I/239) for the few stars the 2007 reduction has no row for (component solutions, e.g. ξ UMa).
missing_hip = sorted(int(h) for h in HIPN.values() if h and h.isdigit() and h not in HIP2)
HIP1 = {r["HIP"]: r for r in tap(VIZIER_TAP, 'SELECT HIP, Plx, e_Plx FROM "I/239/hip_main" '
                                  f"WHERE HIP IN ({','.join(map(str, missing_hip)) or '0'})", "viz-hip1")} if missing_hip else {}

# Masses (and ages) of young Hipparcos stars from evolutionary tracks (Tetzlaff, Neuhäuser & Hohle 2011).
TETZ = {r["HIP"]: r for r in tap(VIZIER_TAP, 'SELECT HIP, Mass, e_Mass, Age, e_Age, SpType FROM "J/MNRAS/410/190/table1" '
                                  f"WHERE HIP IN ({hip_in})", "viz-tetzlaff")}
srcs = sorted({g for g in GAIA.values() if g and g.isdigit()}, key=int)
GDR3 = {r["Source"]: r for r in tap(VIZIER_TAP, 'SELECT Source, RA_ICRS, DE_ICRS, Gmag, "BP-RP", Plx, e_Plx, RUWE, HIP '
                                     f'FROM "I/355/gaiadr3" WHERE Source IN ({",".join(srcs)})', "viz-gaia")}
GPAR = {r["Source"]: r for r in tap(VIZIER_TAP, 'SELECT Source, Teff, logg, Rad, "Rad-Flame", "Lum-Flame", "Mass-Flame", '
                                     '"Teff-S", "logg-S", "Flags-Flame", Evol '
                                     f'FROM "I/355/paramp" WHERE Source IN ({",".join(srcs)})', "viz-gaiaparam")}
JMDC = tap(VIZIER_TAP, 'SELECT ID1, ID2, UDdiam, LDdiam, e_LDdiam, Band, Method, BibCode, SimbadName, _RA, _DE FROM "II/345/jmdc"',
           "viz-jmdc")
PASTEL = tap(VIZIER_TAP, 'SELECT ID, RAdeg, DEdeg, Vmag, Teff, e_Teff, logg, e_logg, bibcode FROM "B/pastel/pastel" '
             "WHERE Teff IS NOT NULL", "viz-pastel")
wds_ids = sorted({w for w in WDSID.values() if w})
WDS = {}
for r in tap(VIZIER_TAP, "SELECT WDS, Disc, Comp, Obs1, Obs2, Nobs, pa1, pa2, sep1, sep2, mag1, mag2, SpType, RAJ2000, DEJ2000 "
             f'FROM "B/wds/wds" WHERE WDS IN ({adql_list(wds_ids)})', "viz-wds"):
    WDS.setdefault(r["WDS"], []).append(r)

# Doubles SIMBAD gives no WDS identifier for: look the pair up around the primary's position.
for o in OBJS:
    k = o["id"]
    if o["type"] == "double_star" and not WDSID.get(k) and SB.get(k):
        near_rows = tap(VIZIER_TAP, "SELECT WDS, Disc, Comp, Obs1, Obs2, Nobs, pa1, pa2, sep1, sep2, mag1, mag2, SpType, RAJ2000, "
                        f"DEJ2000 FROM \"B/wds/wds\" WHERE 1=CONTAINS(POINT('ICRS', RAJ2000, DEJ2000), "
                        f"CIRCLE('ICRS', {num(SB[k]['ra']):.5f}, {num(SB[k]['dec']):.5f}, 0.012))", f"viz-wdscone-{k}")
        if near_rows:
            WDSID[k] = near_rows[0]["WDS"]
            for r in near_rows:
                if r not in WDS.setdefault(r["WDS"], []):
                    WDS[r["WDS"]].append(r)

# Tycho Double Star Catalogue (Fabricius et al. 2002, I/276): resolved Tycho photometry of each component.
TDSC = {}
for r in tap(VIZIER_TAP, 'SELECT TDSC, WDS, m_TDSC, RAJ2000, DEJ2000, BTmag, VTmag, Sep, PA FROM "I/276/catalog" '
             f"WHERE WDS IN ({adql_list(sorted({w for w in WDSID.values() if w}))})", "viz-tdsc"):
    TDSC.setdefault(r["WDS"], []).append(r)

def tycho_v(r):
    bt, vt = num(r["BTmag"]), num(r["VTmag"])
    return None if vt is None else vt - 0.090 * (bt - vt) if bt is not None else vt  # ESA 1997, Johnson V

# Host clusters (Hunt & Reffert 2023, Gaia DR3; J/A+A/673/A114) and OB associations (Melnik & Dambis 2020, Gaia DR2
# members; J/MNRAS/493/2339) for supergiants whose own parallax is poor. Membership is from the literature named here.
HOST_CLUSTER = {"iota-orionis": "NGC_1980", "eta-carinae": "Trumpler_16", "vy-canis-majoris": "NGC_2362",
                "alcyone": "Melotte_22", "mirfak": "Melotte_20"}
HOST_ASSOC = {"garnet-star": "CEP OB2", "zeta-persei": "PER OB2", "deneb": "CYG OB7"}
CLUSTERS = {r["Name"]: r for r in tap(VIZIER_TAP, "SELECT Name, dist16, dist50, dist84, N FROM \"J/A+A/673/A114/clusters\" "
                                       f"WHERE Name IN ({adql_list(sorted(set(HOST_CLUSTER.values())))})", "viz-hr23")}
ASSOC = {}
for r in tap(VIZIER_TAP, 'SELECT Ass, Plx, e_Plx, RUWE FROM "J/MNRAS/493/2339/table1" WHERE '
             + " OR ".join(f"Ass LIKE '{a}%'" for a in sorted(set(HOST_ASSOC.values()))), "viz-md20"):
    p, e, ru = num(r["Plx"]), num(r["e_Plx"]), num(r["RUWE"])
    if p and e and p / e > 5 and (ru or 9) < 1.4:
        ASSOC.setdefault(r["Ass"].strip(), []).append(p + 0.03)  # Gaia DR2 zero point (Lindegren et al. 2018)

# Gaia DR3 neighbourhood of each double (both components, epoch 2016.0) — one small cone per pair.
GCONE = {}
for o in OBJS:
    if o["type"] != "double_star":
        continue
    sb = SB.get(o["id"])
    ra, de = (num(sb["ra"]), num(sb["dec"])) if sb else (o["ra"] * 15, o["dec"])
    h = HIP2.get(HIPN.get(o["id"]) or "")
    pmra, pmde = (num(h["pmRA"]) or 0, num(h["pmDE"]) or 0) if h else \
        ((num(sb["pmra"]) or 0, num(sb["pmdec"]) or 0) if sb else (0, 0))
    ra16 = ra + pmra * 16 / 3.6e6 / math.cos(math.radians(de))
    de16 = de + pmde * 16 / 3.6e6
    rad = (o["sep"] * 1.3 + 6) / 3600
    GCONE[o["id"]] = (ra16, de16, tap(VIZIER_TAP, 'SELECT Source, RA_ICRS, DE_ICRS, Gmag, "BP-RP", Plx, e_Plx, RUWE '
                                       f"FROM \"I/355/gaiadr3\" WHERE 1=CONTAINS(POINT('ICRS', RA_ICRS, DE_ICRS), "
                                       f"CIRCLE('ICRS', {ra16:.6f}, {de16:.6f}, {rad:.6f}))", f"viz-gcone-{o['id']}"))

ORB6 = {}
for line in fetch(ORB6_EPHEM, None, "orb6ephem").splitlines():
    if not re.match(r"\d{5}[+-]\d{4} ", line):
        continue
    toks = line[31:].split()
    vals = [num(t) for t in toks[1:11]]
    if len(vals) < 10 or not line[29:31].strip().isdigit():
        continue
    ORB6.setdefault(line[:10], []).append({"name": line[11:29].strip(), "grade": int(line[29:31].strip()),
                                           "ref": toks[0], "pa2027": vals[4], "sep2027": vals[5],
                                           "pa2016": vals[0] - 9 * (vals[2] - vals[0]) / 2 if None not in (vals[0], vals[2]) else None,
                                           "sep2016": vals[1] - 9 * (vals[3] - vals[1]) / 2 if None not in (vals[1], vals[3]) else None})

for k_, (ra16_, de16_, rows_) in GCONE.items():
    if not GAIA.get(k_):
        close = [r for r in rows_ if angsep(ra16_, de16_, num(r["RA_ICRS"]), num(r["DE_ICRS"])) < 10]
        if close:
            prim_ = min(close, key=lambda r: num(r["Gmag"]) or 99)
            GAIA[k_] = prim_["Source"]
            GDR3.setdefault(prim_["Source"], prim_)

# SIMBAD V of every Gaia source found next to a double's primary (to judge companion magnitudes independently of WDS).
cone_srcs = sorted({r["Source"] for _, _, rows in GCONE.values() for r in rows if (num(r["Gmag"]) or 99) < 12})
COMP_V = {}
for r in tap(SIMBAD_TAP, "SELECT i.id AS gid, b.main_id, f.V FROM ident AS i JOIN basic AS b ON i.oidref = b.oid "
             "LEFT JOIN allfluxes AS f ON f.oidref = b.oid "
             f"WHERE i.id IN ({adql_list('Gaia DR3 ' + x for x in cone_srcs)})", "simbad-compv"):
    COMP_V[norm_id(r["gid"]).replace("Gaia DR3 ", "")] = (num(r["V"]), norm_id(r["main_id"]))

# ---------------------------------------------------------------------------------------------------------------
# 3. independent reference values per object
def near(rows, ra, de, ra_key, de_key, tol):
    return [r for r in rows if num(r[ra_key]) is not None and abs(num(r[de_key]) - de) < tol / 3600
            and angsep(ra, de, num(r[ra_key]), num(r[de_key])) < tol]

def is_variable(o, sb):
    if o.get("vary"):
        return True
    for r in MVAR.get(sb["oid"], []) if sb else []:
        a, b = num(r["vmax"]), num(r["vmin"])
        if a is not None and b is not None and b - a >= 0.2:
            return True
    return False

def distance_ref(o):
    """Returns (d_ly, source text, tolerance factor, notes). Priority: a clean Gaia DR3 parallax (G ≥ 4.5, RUWE < 1.4,
    S/N > 10); Hipparcos 2007 at S/N > 10; the host cluster (Hunt & Reffert 2023); Hipparcos 2007 at S/N > 5; a looser
    Gaia DR3 parallax; the OB association's median member parallax; SIMBAD's parallax; SIMBAD literature distances."""
    k = o["id"]
    hp = HIP2.get(HIPN.get(k) or "")
    g = GDR3.get(GAIA.get(k) or "")
    sb = SB.get(k)
    notes = []
    gp = (num(g["Plx"]), num(g["e_Plx"]), num(g["RUWE"]), num(g["Gmag"])) if g else None
    hpp = (num(hp["Plx"]), num(hp["e_Plx"])) if hp else None
    g_snr = gp[0] / gp[1] if gp and gp[0] and gp[1] else None
    g_ok = g_snr and g_snr > 10 and gp[2] is not None and gp[2] < 1.4 and gp[3] >= 4.5
    h_snr = hpp[0] / hpp[1] if hpp and hpp[0] and hpp[1] and hpp[1] > 0 else None
    if g_snr and h_snr and g_snr > 5 and h_snr > 5 and ratio(gp[0], hpp[0]) > 1.15:
        notes.append(f"Gaia DR3 {gp[0]:.2f}±{gp[1]:.2f} (RUWE {gp[2]:.1f}) vs HIP2 {hpp[0]:.2f}±{hpp[1]:.2f} mas")
    cl = CLUSTERS.get(HOST_CLUSTER.get(k, ""))
    if cl:
        notes.append(f"host {cl['Name']} {num(cl['dist50']):.0f} pc")
    asc = ASSOC.get(HOST_ASSOC.get(k, ""))
    if asc:
        notes.append(f"{HOST_ASSOC[k]} median of {len(asc)} members {1000 / med(asc):.0f} pc")
    if g_ok:
        return 1000 / gp[0] * LY_PER_PC, f"Gaia DR3 (I/355) plx {gp[0]:.3f}±{gp[1]:.3f} mas, RUWE {gp[2]:.2f}", 1.25, notes
    if h_snr and h_snr > 10:
        return 1000 / hpp[0] * LY_PER_PC, f"Hipparcos 2007 (I/311) plx {hpp[0]:.2f}±{hpp[1]:.2f} mas", 1.25, notes
    if cl:
        return num(cl["dist50"]) * LY_PER_PC, f"host cluster {cl['Name']} (Hunt & Reffert 2023, Gaia DR3)", 1.25, notes
    if h_snr and h_snr > 5:
        return 1000 / hpp[0] * LY_PER_PC, f"Hipparcos 2007 (I/311) plx {hpp[0]:.2f}±{hpp[1]:.2f} mas", 1.25, notes
    h1 = HIP1.get(HIPN.get(k) or "")
    if h1 and num(h1["Plx"]) and num(h1["e_Plx"]) and num(h1["Plx"]) / num(h1["e_Plx"]) > 5:
        return 1000 / num(h1["Plx"]) * LY_PER_PC, f"Hipparcos 1997 (I/239) plx {num(h1['Plx']):.2f}±{num(h1['e_Plx']):.2f} mas", 1.25, notes
    if g_snr and g_snr > 5 and (gp[2] or 99) < 3:
        return 1000 / gp[0] * LY_PER_PC, f"Gaia DR3 (I/355) plx {gp[0]:.3f}±{gp[1]:.3f} mas, RUWE {gp[2]:.2f}", 1.25, notes
    if asc:
        return 1000 / med(asc) * LY_PER_PC, f"{HOST_ASSOC[k]} median member parallax (Melnik & Dambis 2020, Gaia DR2)", 1.5, notes
    sp, se = (num(sb["plx_value"]), num(sb["plx_err"])) if sb and not g else (None, None)
    if sp and se and sp / se > 5:
        return 1000 / sp * LY_PER_PC, f"SIMBAD plx {sp:.2f}±{se:.2f} mas ({sb['plx_bibcode']})", 1.25, notes
    lit = []
    for r in MDIST.get(sb["oid"], []) if sb else []:
        d, u = num(r["dist"]), (r["unit"] or "").strip()
        if d is None or d <= 0:
            continue
        lit.append((d * 1000 if u == "kpc" else d * 1e6 if u == "Mpc" else d, (r["method"] or "").strip()))
    nonplx = [x for x in lit if not x[1].lower().startswith("par")]
    use = nonplx or lit
    if use:
        return med([x[0] for x in use]) * LY_PER_PC, f"SIMBAD mesDistance median of {len(use)} literature values", 1.5, notes
    if hpp and hpp[0] and hpp[0] > 0:
        return 1000 / hpp[0] * LY_PER_PC, f"Hipparcos 2007 (I/311) plx {hpp[0]:.2f}±{hpp[1]:.2f} mas (low S/N)", 1.5, notes
    return None, None, None, notes

def teff_logg_ref(o, sb):
    ra, de = num(sb["ra"]), num(sb["dec"])
    p = near(PASTEL, ra, de, "RAdeg", "DEdeg", 3)  # tight: a double's companion may sit a few arcsec away
    t_out = g_out = None
    if p:
        recent = [r for r in p if year_of(r["bibcode"]) >= 2000 and num(r["Teff"])]
        use = recent if len(recent) >= 2 else [r for r in p if num(r["Teff"])]
        if use:
            ts = [num(r["Teff"]) for r in use]
            # Values far apart usually mean a companion's temperature is mixed in (e.g. 24 Com: 4480 K and 7875 K).
            mixed = len(ts) >= 2 and max(ts) / min(ts) > 1.4
            t_out = (med(ts), f"PASTEL (B/pastel) median of {len(use)}" + (" — MIXED components?" if mixed else ""), mixed)
        lg = [num(r["logg"]) for r in (recent if len(recent) >= 2 else p) if num(r["logg"]) is not None]
        if len(lg) >= 2:  # a single gravity is too uncertain to weigh a star with
            g_out = (med(lg), f"PASTEL median of {len(lg)}")
    fe = FEH.get(sb["oid"], [])
    if not t_out:
        ts = [num(r["teff"]) for r in fe if num(r["teff"])]
        if ts:
            t_out = (med(ts), f"SIMBAD mesFe_h median of {len(ts)}", len(ts) >= 2 and max(ts) / min(ts) > 1.4)
    if not g_out:
        gs = [num(r["log_g"]) for r in fe if num(r["log_g"]) is not None]
        if len(gs) >= 2:
            g_out = (med(gs), f"SIMBAD mesFe_h median of {len(gs)}")
    gp = GPAR.get(GAIA.get(o["id"]) or "")
    if not t_out and gp:
        if num(gp["Teff-S"]):
            t_out = (num(gp["Teff-S"]), "Gaia DR3 GSP-Spec", False)
        elif num(gp["Teff"]) and num(gp["Teff"]) < 9000:
            t_out = (num(gp["Teff"]), "Gaia DR3 GSP-Phot", False)
    return t_out, g_out

BAND_UM = {"U": 0.36, "B": 0.44, "V": 0.55, "R": 0.65, "I": 0.8, "J": 1.25, "H": 1.65, "H'": 1.6, "K": 2.2, "K'": 2.12,
           "H,K": 1.9, "L": 3.5, "M": 4.8, "N": 10.0}

def band_um(band):
    """Effective wavelength (µm) of a JMDC band string: "K", "800nm", "4430A", "2.2mu", "550..850nm", "8-13"."""
    b = (band or "").strip().rstrip("?")
    if b in BAND_UM:
        return BAND_UM[b]
    xs = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", b)]
    if not xs:
        return None
    v = sum(xs[:2]) / len(xs[:2])
    if b.endswith("A") and v > 1000:
        return v / 1e4
    return v / 1000 if v > 100 else v

def diameter_ref(sb, teff=None):
    """Median limb-darkened (else uniform-disk ×1.02) angular diameter from JMDC. Mid-infrared sizes (dust shells) are
    dropped; for M stars, whose visible-light disks are swollen by molecular bands, near-infrared values are preferred.
    Returns (θ mas, source, direct?, photospheric?)."""
    ra, de = num(sb["ra"]), num(sb["dec"])
    j = [r for r in near(JMDC, ra, de, "_RA", "_DE", 3)
         if not (r["Method"].strip() == "2" and (num(r["LDdiam"]) or num(r["UDdiam"]) or 0) < 2)  # below LO resolution
         and (band_um(r["Band"]) or 1) < 3]
    phot = True
    if teff and teff < 4000:
        nir = [r for r in j if 1.0 <= (band_um(r["Band"]) or 0) <= 2.5]
        if nir:
            j = nir
        elif j:
            phot = False
    ld = [num(r["LDdiam"]) for r in j if num(r["LDdiam"])]
    tag = "" if phot else ", visible light only"
    if ld:
        return med(ld), f"JMDC (II/345) median LD of {len(ld)}{tag}", True, phot
    ud = [num(r["UDdiam"]) for r in j if num(r["UDdiam"])]
    if ud:
        return med(ud) * 1.02, f"JMDC (II/345) median UD×1.02 of {len(ud)}{tag}", True, phot
    md = [num(r["diameter"]) for r in DIAM.get(sb["oid"], []) if (r["unit"] or "").strip() == "mas" and num(r["diameter"])]
    if md:
        return med(md), f"SIMBAD mesDiameter median of {len(md)} (mostly SED estimates)", False, True
    return None, None, False, True

REF, ROWS, UNVERIFIED = {}, [], {}

def add(app_id, field, ours, ref, src, flagged, extra=""):
    ROWS.append({"id": app_id, "field": field, "ours": ours, "ref": ref, "src": src, "flagged": flagged, "extra": extra})

for o in OBJS:
    k = o["id"]
    f = FACTS.get(k, {})
    sb = SB.get(k)
    ref = {}
    REF[k] = ref
    if not sb:
        UNVERIFIED.setdefault("identity", []).append(k)
    variable = is_variable(o, sb)
    # -- identity: our position against SIMBAD (J2000/ICRS, epoch 2000)
    if sb:
        s = angsep(o["ra"] * 15, o["dec"], num(sb["ra"]), num(sb["dec"]))
        add(k, "pos", None, round(s, 1), f"SIMBAD {norm_id(sb['main_id'])}", s > 60)
    # -- distance
    d, dsrc, tol, dnotes = distance_ref(o)
    if d:
        ref["d"] = {"v": sig(d), "src": dsrc}
        if f.get("d"):
            add(k, "d", f["d"], sig(d), dsrc, ratio(f["d"], d) > tol, "; ".join(dnotes + [f"our src {f.get('src')}"]))
    elif f.get("d"):
        UNVERIFIED.setdefault("d", []).append(k)
    if not sb:
        continue
    # -- magnitudes and colour
    V, B, K = (num(FLUX.get(sb["oid"], {}).get(b)) for b in ("V", "B", "K"))
    if V is not None:
        ref["mag"] = {"v": V, "src": "SIMBAD V"}
        # A double's SIMBAD V is often the combined light of the pair; its primary is checked against WDS below.
        if o["type"] == "star":
            add(k, "mag", o["mag"], V, "SIMBAD V", abs(o["mag"] - V) > 0.3 and not variable, "variable" if variable else "")
    if B is not None and V is not None and o.get("bv") is not None:
        ref["bv"] = {"v": round(B - V, 2), "src": "SIMBAD B−V"}
        add(k, "bv", o["bv"], round(B - V, 2), "SIMBAD B−V", abs(o["bv"] - (B - V)) > 0.2 and not variable)
    # -- temperature, gravity
    t_ref, g_ref = teff_logg_ref(o, sb)
    mixed_t = bool(t_ref and t_ref[2])
    if mixed_t:  # mixed components: not a usable reference
        UNVERIFIED.setdefault("teff (catalogue values mix both stars)", []).append(k)
        t_ref = None
    if t_ref:
        ref["teff"] = {"v": round(t_ref[0], -1), "src": t_ref[1]}
        if f.get("teff"):
            add(k, "teff", f["teff"], round(t_ref[0], -1), t_ref[1], abs(f["teff"] - t_ref[0]) / t_ref[0] > 0.15)
    elif f.get("teff") and not mixed_t:
        UNVERIFIED.setdefault("teff", []).append(k)
    T = t_ref[0] if t_ref else f.get("teff")
    # -- radius
    th, thsrc, direct, photospheric = diameter_ref(sb, T)
    gp = GPAR.get(GAIA.get(k) or "")
    r_ref = None
    if th and d:
        r_ref = (th * d / LY_PER_PC * RSUN_PER_MAS_PC, f"{thsrc}: θ {th:.3g} mas × d {sig(d):g} ly", direct)
    elif gp and num(gp["Rad-Flame"]):
        r_ref = (num(gp["Rad-Flame"]), "Gaia DR3 FLAME radius", True)
    # -- luminosity: from interferometric R and T if we have both, else from V, distance, BC(T) and reddening
    l_ref = None
    if o["type"] == "double_star":  # SIMBAD's V/K may be the pair's combined light: use the primary's own V
        B = B - V + o["mag"] if B is not None and V is not None else None
        V, K = o["mag"], None
    if V is not None and d and T and not variable:
        ebv = max(0.0, (B - V) - bv0(T) - 0.05) if B is not None else 0.0
        av = 3.1 * ebv
        dm = 5 * math.log10(d / LY_PER_PC / 10)
        if T < 3700 and K is not None:  # BC_V runs away for M stars; use K with BC_K (Levesque et al. 2005)
            bck = 5.574 - 0.7589 * T / 1000
            lphot = 10 ** ((4.74 - (K - 0.114 * av - dm + bck)) / 2.5)
            l_ref = (lphot, f"photometric: K {K:.2f}, BC_K {bck:.2f} (Levesque 2005), d {sig(d):g} ly")
        else:
            lphot = 10 ** ((4.74 - (V - av - dm + bc_v(T))) / 2.5)
            l_ref = (lphot, f"photometric: V {V:.2f}, A_V {av:.2f}, BC {bc_v(T):.2f} (Torres 2010), d {sig(d):g} ly")
    l_phot_ref = l_ref
    if r_ref and r_ref[2] and T and photospheric:
        lrt = r_ref[0] ** 2 * (T / 5772) ** 4
        l_ref = (lrt, f"R²T⁴ from {r_ref[1].split(':')[0]} radius and T {T:.0f} K")
    if not r_ref and l_ref and T:
        r_ref = (math.sqrt(l_ref[0]) * (5772 / T) ** 2, "from photometric L and T", False)
    if r_ref:
        ref["r"] = {"v": sig(r_ref[0]), "src": r_ref[1]}
        if f.get("r"):
            add(k, "r", f["r"], sig(r_ref[0]), r_ref[1], ratio(f["r"], r_ref[0]) > 2)
    elif f.get("r"):
        UNVERIFIED.setdefault("r", []).append(k)
    if l_ref:
        ref["lum"] = {"v": sig(l_ref[0]), "src": l_ref[1]}
        xh = XHIP.get(HIPN.get(k) or "")
        xl = num(xh["Lum"]) if xh else None
        if f.get("lum"):
            alt = [f"photometric {sig(l_phot_ref[0]):g}"] if l_phot_ref and l_phot_ref is not l_ref else []
            add(k, "lum", f["lum"], sig(l_ref[0]), l_ref[1], ratio(f["lum"], l_ref[0]) > 2,
                "; ".join(alt + ([f"XHIP Lum {xl:g} (no extinction)"] if xl else [])))
    elif f.get("lum"):
        UNVERIFIED.setdefault("lum", []).append(k)
    # -- mass: Gaia FLAME, else spectroscopic log g with the radius (M = g R² / G)
    m_ref = None
    tz = TETZ.get(HIPN.get(k) or "")
    # Tetzlaff sometimes attaches a companion's spectral type (γ And: "B8V" for the K giant): require the same class.
    if tz and (tz["SpType"] or " ").strip()[:1] != (sb["sp_type"] or " ").strip()[:1]:
        tz = None
    if tz and num(tz["Mass"]):
        m_ref = (num(tz["Mass"]), f"Tetzlaff et al. 2011 (J/MNRAS/410/190) {num(tz['Mass']):g}±{num(tz['e_Mass']) or 0:g}")
    elif gp and num(gp["Mass-Flame"]):
        m_ref = (num(gp["Mass-Flame"]), "Gaia DR3 FLAME mass")
    elif g_ref and r_ref and r_ref[2]:
        m_ref = (10 ** (g_ref[0] - 4.438) * r_ref[0] ** 2, f"log g {g_ref[0]:.2f} ({g_ref[1]}) with R {sig(r_ref[0]):g}")
    if m_ref:
        ref["mass"] = {"v": sig(m_ref[0], 2), "src": m_ref[1]}
        if f.get("mass"):
            add(k, "mass", f["mass"], sig(m_ref[0], 2), m_ref[1], ratio(f["mass"], m_ref[0]) > 2.5)
    elif f.get("mass"):
        UNVERIFIED.setdefault("mass", []).append(k)

    # -- double stars: pair geometry and component magnitudes
    if o["type"] != "double_star":
        continue
    w = WDSID.get(k)
    rows = WDS.get(w, []) if w else []
    best = None
    for r in rows:
        s2 = num(r["sep2"])
        if s2 and s2 > 0:
            score = abs(math.log(s2 / o["sep"]))
            if best is None or score < best[0]:
                best = (score, r)
    # Gaia DR3 (epoch 2016.0): the primary is SIMBAD's Gaia counterpart, else the brightest source; the companion is
    # the source that best matches our separation and companion magnitude.
    gaia_pair = None
    ra16, de16, cone = GCONE.get(k, (None, None, []))
    if cone:
        stars = sorted(cone, key=lambda r: num(r["Gmag"]) or 99)
        prim = next((r for r in stars if r["Source"] == GAIA.get(k)), None) or stars[0]
        best_c = None
        for r in stars:
            if r is prim or num(r["Gmag"]) is None:
                continue
            s_, pa_ = sep_pa(num(prim["RA_ICRS"]), num(prim["DE_ICRS"]), num(r["RA_ICRS"]), num(r["DE_ICRS"]))
            score = abs(math.log(max(s_, 0.01) / o["sep"])) + 0.15 * abs((num(r["Gmag"]) or 0) - o.get("mag2", 0))
            if best_c is None or score < best_c[0]:
                best_c = (score, r, s_, pa_)
        if best_c and abs(math.log(max(best_c[2], 0.01) / o["sep"])) < 0.25:
            c = best_c[1]
            sv = COMP_V.get(c["Source"])
            prim_main = norm_id(sb["main_id"])
            gaia_pair = {"sep": round(best_c[2], 2), "pa": round(best_c[3]),
                         "v2": g_to_v(num(c["Gmag"]), num(c["BP-RP"])) if best_c[2] > 4 else None,
                         "sv2": sv if sv and sv[0] is not None and sv[1] != prim_main and not re.search(r"\bA$", sv[1]) else None,
                         "plx1": num(prim["Plx"]), "plx2": num(c["Plx"]), "e1": num(prim["e_Plx"]), "e2": num(c["e_Plx"]),
                         "g1": num(prim["Gmag"]), "g2": num(c["Gmag"])}
    orb = None
    if best:
        r = best[1]
        for e in ORB6.get(w, []):
            nm = re.sub(r"\s+", "", e["name"])
            if nm.startswith(re.sub(r"\s+", "", r["Disc"]) + re.sub(r"\s+", "", r["Comp"]).replace(",", "")) or \
                    nm == re.sub(r"\s+", "", r["Disc"]) + re.sub(r"\s+", "", r["Comp"]):
                if e["sep2027"] and (orb is None or e["grade"] < orb["grade"]):
                    orb = e
    if gaia_pair and gaia_pair["sep"] > 2:
        gp_ = gaia_pair
        # For a pair with an orbit, compare Gaia with the orbit's motion traced back to 2016 (linear from 2025–2027).
        moving = orb and orb["grade"] <= 3 and orb["sep2016"] is not None
        cmp_sep, cmp_pa = (orb["sep2016"], orb["pa2016"]) if moving else (o["sep"], o["pa"])
        dpa = abs((cmp_pa - gp_["pa"] + 180) % 360 - 180)
        swapped = dpa > 165 and abs(o["mag"] - o.get("mag2", 99)) < 0.7
        add(k, "sep_gaia", o["sep"], gp_["sep"], "Gaia DR3 positions of both stars (2016.0)",
            abs(cmp_sep - gp_["sep"]) / gp_["sep"] > 0.2 or (dpa > 10 and not swapped),
            f"Gaia PA {gp_['pa']}° vs ours {o['pa']}°" + (" (components swapped in Gaia)" if swapped else "")
            + (f"; orbit traced back to 2016: {cmp_sep:.2f}″ PA {cmp_pa:.0f}°" if moving else ""))
        if gp_["plx1"] and gp_["plx2"]:
            ref["gaia_pair"] = {"v": [gp_["sep"], gp_["pa"], gp_["plx1"], gp_["plx2"]], "src": "Gaia DR3: sep″, PA°, plx A, plx B (mas)"}
    # companion magnitude: SIMBAD V of the companion's own entry, else Gaia G→V for pairs wider than 4″, else WDS
    m2_ref = None
    if gaia_pair and gaia_pair["sv2"]:
        m2_ref = (gaia_pair["sv2"][0], f"SIMBAD V of {gaia_pair['sv2'][1]}")
    elif gaia_pair and gaia_pair["v2"] is not None:
        m2_ref = (round(gaia_pair["v2"], 2), "Gaia DR3 G→V (Riello et al. 2021) of the companion")
    if not best:
        UNVERIFIED.setdefault("sep (WDS)", []).append(k)
        if gaia_pair:
            ref["sep"] = {"v": gaia_pair["sep"], "src": "Gaia DR3 positions (2016.0)"}
            ref["pa"] = {"v": gaia_pair["pa"], "src": "Gaia DR3 positions (2016.0)"}
        if m2_ref and o.get("mag2") is not None:
            ref["mag2"] = {"v": m2_ref[0], "src": m2_ref[1]}
            add(k, "mag2", o["mag2"], m2_ref[0], m2_ref[1], abs(o["mag2"] - m2_ref[0]) > 0.3)
        continue
    r = best[1]
    pair = f"{r['Disc'].strip()} {r['Comp'].strip()}".replace("  ", " ")
    if orb and orb["grade"] <= 3:
        rs, rp, rsrc = orb["sep2027"], orb["pa2027"], f"ORB6 ephemeris 2027.0 ({pair}, grade {orb['grade']}, {orb['ref']})"
    else:
        rs, rp, rsrc = num(r["sep2"]), num(r["pa2"]), f"WDS (B/wds) {pair}, last obs {r['Obs2']}"
    ab = next((x for x in rows if x["Comp"].strip() in ("AB", "")), None)
    extra = []
    if ab is not None and ab is not r:
        extra.append(f"main WDS pair {ab['Comp'].strip() or 'AB'} is {num(ab['sep2'])}″")
    ref["sep"] = {"v": rs, "src": rsrc}
    ref["pa"] = {"v": rp, "src": rsrc}
    add(k, "sep", o["sep"], rs, rsrc, abs(o["sep"] - rs) / rs > 0.2, "; ".join(extra))
    if o.get("pa") is not None and rp is not None:
        dpa = abs((o["pa"] - rp + 180) % 360 - 180)
        add(k, "pa", o["pa"], rp, rsrc, dpa > 10 and o["sep"] > 1)
    m1, m2 = num(r["mag1"]), num(r["mag2"])
    # Tycho photometry of the resolved components: A is the row nearest the primary, the companion the row nearest
    # the primary + (sep, PA).
    tA = tB = None
    trows = [t for t in TDSC.get(w, []) if num(t["RAJ2000"]) is not None]
    if trows and sb:
        tA = min(trows, key=lambda t: angsep(num(sb["ra"]), num(sb["dec"]), num(t["RAJ2000"]), num(t["DEJ2000"])))
        if angsep(num(sb["ra"]), num(sb["dec"]), num(tA["RAJ2000"]), num(tA["DEJ2000"])) > 3:
            tA = None
    if tA:
        best_t = None
        for t in trows:
            if t is tA:
                continue
            s_, pa_ = sep_pa(num(tA["RAJ2000"]), num(tA["DEJ2000"]), num(t["RAJ2000"]), num(t["DEJ2000"]))
            score = abs(s_ - o["sep"]) / o["sep"] + abs((pa_ - o["pa"] + 180) % 360 - 180) / 90
            if score < 0.4 and (best_t is None or score < best_t[0]):
                best_t = (score, t)
        tB = best_t[1] if best_t else None
    vA, vB = (tycho_v(tA) if tA else None), (tycho_v(tB) if tB else None)
    if vA is not None:
        ref["mag"] = {"v": round(vA, 2), "src": "Tycho (TDSC, I/276) V of the primary"}
        add(k, "mag1", o["mag"], round(vA, 2), "Tycho (TDSC, I/276) V of the primary", abs(o["mag"] - vA) > 0.3 and not variable,
            f"WDS mag1 {m1}")
    elif m1 is not None:
        add(k, "mag1", o["mag"], m1, f"WDS {pair} mag1 (not independent)", abs(o["mag"] - m1) > 0.3 and not variable)
    if vB is not None:
        m2_ref = (round(vB, 2), "Tycho (TDSC, I/276) V of the companion")
    if o.get("mag2") is not None and (m2_ref or m2 is not None):
        ref_m2, src_m2 = m2_ref or (m2, f"WDS {pair} mag2")
        ref["mag2"] = {"v": ref_m2, "src": src_m2}
        # Independent estimates: Tycho (TDSC), the companion's SIMBAD V, Gaia G→V (clean BP/RP only beyond 4″).
        # Flag only when none of them supports our value within 0.3 mag.
        cands = []
        if vB is not None:
            cands.append(("Tycho", round(vB, 2)))
        if gaia_pair and gaia_pair["sv2"]:
            cands.append(("SIMBAD", gaia_pair["sv2"][0]))
        if gaia_pair and gaia_pair["v2"] is not None:
            cands.append(("Gaia G→V", round(gaia_pair["v2"], 2)))
        indep = bool(cands)
        vals = [v for _, v in cands if v is not None]
        if len(vals) >= 3 or (vals and max(vals) - min(vals) <= 0.3):
            ref["mag2"] = {"v": round(med(vals), 2), "src": "median of " + ", ".join(n for n, _ in cands)}
        else:
            ref.pop("mag2", None)  # independent sources disagree: nothing trustworthy to store
        if not cands:
            cands.append(("WDS", m2))
        add(k, "mag2", o["mag2"], ref_m2, src_m2 + ("" if indep else " (not independent)"),
            all(abs(o["mag2"] - v) > 0.3 for _, v in cands if v is not None),
            "; ".join(f"{n} {v}" for n, v in cands) + f"; WDS {m2}")

# ---------------------------------------------------------------------------------------------------------------
# 4. judgements (made after reviewing each flag; keyed by (id, field)) — see the report for the reasoning
W, S = "ours is wrong", "within literature spread"
VERDICTS = {
    # -- distance
    "alnitak|d": {"verdict": S, "drop": True, "cause": "Hipparcos parallax of a bright O-star multiple is unreliable; Gaia DR3 clusters of the Orion Belt (Ori OB1b) lie at 340–395 pc (Hunt & Reffert 2023: ASCC 21 341, NGC 1980 378, Collinder 69 394 pc); ours = 400 pc"},
    "mintaka|d": {"verdict": S, "drop": True, "cause": "as Alnitak: Hipparcos 4.71±0.58 mas for a bright multiple vs Orion Belt clusters at 340–395 pc; ours = 368 pc"},
    "iota-orionis|d": {"verdict": W, "cause": "ours comes from ι Ori's own saturated Gaia parallax (2.00±0.73 mas, RUWE 8.2). ι Ori is the brightest star of NGC 1980 (378 pc, Gaia DR3), and its companion ι Ori B has a clean Gaia parallax of 2.787±0.048 mas (1,170 ly)",
                       "fix": {"d": 1230, "d_src": "NGC 1980, the cluster ι Ori belongs to: 378 pc (Hunt & Reffert 2023, Gaia DR3); ι Ori B Gaia DR3 parallax 2.787±0.048 mas agrees (1,170 ly)"}},
    "zeta-persei|d": {"verdict": S, "cause": "the star's own parallaxes say 750–850 ly (Hipparcos 2007 4.34±0.19 mas; Gaia DR3 3.86±0.42 mas), but Per OB2 members give ≈1,180 ly (363 pc) and interstellar Ca II gives 400 pc; ours (1,300 ly) is at the far end. If the star's own parallax is preferred, use 750 ly and r ≈ 13 R☉ (JMDC 0.54 mas)"},
    "sadalmelik|d": {"verdict": S, "cause": "the parallaxes disagree: Hipparcos 2007 6.23±0.19 mas (524 ly) vs Gaia DR3 4.95±0.43 mas (660 ly, RUWE 3.0); ours 690 ly sits with Gaia"},
    "garnet-star|d": {"verdict": W, "cause": "ours (1,400 ly ≈ 430 pc) is nearer than every independent estimate: Cep OB2 member parallaxes give 939 pc (44 members, Melnik & Dambis 2020), Hipparcos 2007 0.55±0.20 mas points to ≈1.8 kpc, Gaia DR3 is unusable (0.12±0.26 mas). Radius and luminosity were scaled to the short distance",
                      "fix": {"d": 3060, "d_src": "Cep OB2 median member parallax, 939 pc (Melnik & Dambis 2020, Gaia DR2; 44 members)",
                              "lum": 400000, "lum_src": "V 4.08, A_V 2.0 from E(B−V) 0.65 (intrinsic B−V ≈ 1.70 for M2 I), BC_V −1.48 at 3,800 K (Torres 2010), d 939 pc",
                              "r": 1470, "r_src": "from that luminosity and 3,800 K; equals an angular diameter of 14.6 mas (JMDC's visible-light 17.7–20.6 mas are swollen by TiO)"}},
    "M40|d": {"verdict": W, "cause": "ours (460 ly) is the distance of the fainter star B (HD 238108, Gaia DR3 6.93 mas ⇒ 470 ly); the primary HD 238107 is at 1,010 ly (3.219±0.012 mas) — and our r, lum, teff (4.48 R☉, 13 L☉, 4,960 K) describe that primary (V 9.64 at 1,010 ly ⇒ ≈14 L☉). The pair is optical",
              "fix": {"d": 1010, "d_src": "Gaia DR3 parallax of the primary HD 238107, 3.219±0.012 mas (RUWE 0.95); companion HD 238108 is at 470 ly (6.93 mas): an optical pair"}},
    # -- radius
    "alpheratz|r": {"verdict": W, "cause": "1.0 R☉ is a placeholder: a B8 IV star of ≈270 L☉ (V 2.06, Hipparcos 2007 97 ly, PASTEL 13,810 K) has R ≈ 2.9 R☉, ≈2.7 R☉ for the primary alone (≈85 % of the light). We have no lum for it, so the L–R–T test never saw it",
                    "fix": {"r": 2.7, "r_src": "R from L ≈ 230 L☉ (primary's share of V 2.06 at the Hipparcos 2007 distance, BC at PASTEL 13,810 K) — combined light gives 2.9 R☉"}},
    "sheratan|r": {"verdict": W, "cause": "1.08 R☉ contradicts our own lum 20.9 L☉ and teff 8,760 K (⇒ 2.0 R☉); photometry gives 21.9 L☉ and 2.25 R☉",
                   "fix": {"r": 2.0, "r_src": "R = √L·(5772/T)² from our lum 20.9 L☉ and teff 8,760 K; independent photometric estimate 2.25 R☉ (V 2.65, Hipparcos 2007 58.7 ly, PASTEL 8,320 K)"}},
    "gamma-delphini|r": {"verdict": W, "cause": "our r, lum, teff (2.6 R☉, 10.2 L☉, 6,300 K) belong to γ¹ Del, the fainter F7 V star (V 5.0); the primary of the pair (mag 4.36) is γ² Del, K1 IV",
                         "fix": {"r": 8.0, "r_src": "γ² Del: Gaia DR3 FLAME 7.96 R☉; photometric L 31 L☉ with 4,800 K gives 8.0 R☉",
                                 "teff": 4800, "teff_src": "γ² Del: PASTEL median of 5 (2000+)",
                                 "lum": 30, "lum_src": "γ² Del: R²T⁴ 30.3 L☉; photometric 30.9 L☉ (V 4.36, Hipparcos 2007 126 ly)",
                                 "mass": 1.3, "mass_src": "γ² Del: Gaia DR3 FLAME"}},
    "gamma-delphini|teff": {"verdict": W, "cause": "wrong component (see radius)"},
    "gamma-delphini|lum": {"verdict": W, "cause": "wrong component (see radius)"},
    "garnet-star|r": {"verdict": W, "drop": True, "cause": "scaled to our too-short distance (see distance); the reference here uses a visible-light diameter, too large for an M supergiant"},
    "chi-cygni|r": {"verdict": S, "drop": True, "cause": "Mira variable: JMDC diameters are 700–900 nm (TiO-inflated) and change with phase"},
    "gamma-velorum|r": {"verdict": S, "drop": True, "cause": "different component: ours describe the WC8 Wolf–Rayet star; JMDC's 0.44 mas intensity-interferometry disk is dominated by the O7.5 companion"},
    # -- luminosity
    "alnitak|lum": {"verdict": S, "drop": True, "cause": "follows the distance: at our 1,300 ly the same disk gives ≈3.4×10⁵ L☉; Alnitak is a triple"},
    "mintaka|lum": {"verdict": S, "drop": True, "cause": "follows the distance: at our 1,200 ly the photometric value is ≈1.7×10⁵ L☉"},
    "sadalmelik|lum": {"verdict": S, "cause": "follows the distance: scaled to our 690 ly the reference is ≈3,300 L☉"},
    "iota-orionis|lum": {"verdict": S, "drop": True, "cause": "SB2 (O9 III + B1 III), combined light: total ≈1.6×10⁵ L☉ at 378 pc, primary ≈1.2×10⁵; ours 68,000 is 1.8× below the primary"},
    "mizar|lum": {"verdict": S, "drop": True, "cause": "Mizar A is itself a pair of near-equal A stars; 78 L☉ combined ⇒ ≈39 L☉ each"},
    "hadar|lum": {"verdict": S, "drop": True, "cause": "β Cen Aa+Ab are near-equal twins; combined 71,000 L☉ ⇒ ≈35,000 each"},
    "ascella|lum": {"verdict": S, "drop": True, "cause": "0.5″ pair of near-equal A stars: combined 54 L☉ ⇒ ≈27–30 L☉ each vs ours 14.9 (1.9×)"},
    "alniyat|lum": {"verdict": S, "drop": True, "cause": "multiple (Aa1+Aa2+B) and reddened (A_V ≈ 1.1): combined, dereddened light"},
    "lesath|lum": {"verdict": S, "drop": True, "cause": "ours equals XHIP (7,380 L☉); the spread is the bolometric correction of a 22,000 K star"},
    "zeta-ophiuchi|lum": {"verdict": S, "cause": "very fast rotator (oblate, gravity-darkened); photometric 26,500 and R²T⁴ 24,100 vs ours 49,000 (2.0×)"},
    "omicron1-cygni|lum": {"verdict": S, "drop": True, "cause": "photometric 3,770 and XHIP 3,530 L☉ are within 1.5× of ours; only the R²T⁴ value is 2.3×"},
    "rasalgethi|lum": {"verdict": S, "drop": True, "cause": "photometric (K band) 7,940 L☉ agrees with ours; one near-IR JMDC diameter gives 15,800"},
    "aludra|lum": {"verdict": S, "drop": True, "cause": "depends on T (one PASTEL value, 12,670 K, vs ours 15,800 K) and a low-S/N parallax (1.64±0.40 mas)"},
    "eta-carinae|lum": {"verdict": S, "drop": True, "cause": "dust-enshrouded (Homunculus): optical photometry sees a small fraction of the light"},
    "gamma-velorum|lum": {"verdict": S, "drop": True, "cause": "different component (WR star vs combined/O-star light)"},
    "gamma-delphini|mass": {"verdict": W, "cause": "wrong component (see radius)"},
    "phact|lum": {"verdict": W, "cause": "3,310 L☉ contradicts our own r 7.0 R☉ and teff 12,200 K (⇒ 980 L☉); photometry gives 1,080 L☉, XHIP 960",
                  "fix": {"lum": 1080, "lum_src": "V 2.65, Hipparcos 2007 12.48±0.36 mas (261 ly), BC at PASTEL 13,490 K (Torres 2010); R²T⁴ of our r and teff gives 980"}},
    # -- temperature
    "phecda|teff": {"verdict": W, "cause": "6,750 K is an F-star temperature for an A0 V star; PASTEL 9,350 K, and the JMDC radius 2.53 R☉ with 9,350 K reproduces our lum 44.6 L☉",
                    "fix": {"teff": 9350, "teff_src": "PASTEL median of 2 (B/pastel)"}},
    "kaus-australis|teff": {"verdict": W, "cause": "11,700 K disagrees with PASTEL 9,220 K and SIMBAD 8,930–9,520 K, and with our own lum 497 L☉ and r 8.8 R☉ (⇒ 9,200 K)",
                            "fix": {"teff": 9220, "teff_src": "PASTEL median of 2 (B/pastel); SIMBAD mesFe_h 8,930–9,520 K"}},
    "tianguan|teff": {"verdict": W, "cause": "15,500 K vs 21,130–21,480 K in all four catalogue values for this B1 IV star; with 21,300 K our own r 5.5 R☉ gives 5,600 L☉, matching the photometric 5,850 L☉",
                      "fix": {"teff": 21300, "teff_src": "PASTEL median of 2 (2000+); SIMBAD mesFe_h 21,132–21,478 K (4 values)"}},
    "achernar|teff": {"verdict": W, "cause": "below every catalogue value (PASTEL 15,000 and 20,230 K) and inconsistent with our own lum 3,490 L☉ and r 6.78 R☉ (⇒ ≈16,900 K). Achernar is strongly gravity-darkened, so any single value is a compromise",
                      "fix": {"teff": 15000, "teff_src": "PASTEL: Levenhagen & Leister 2006 (15,000 K); the other PASTEL value is 20,230 K"}},
    "alderamin|teff": {"verdict": S, "cause": "fast rotator, 15.2 % off; gravity darkening spans ≈6,600–8,600 K"},
    "alpha-arae|teff": {"verdict": S, "cause": "Be star; catalogue values 18,000–22,000 K"},
    "markeb|teff": {"verdict": S, "drop": True, "cause": "a single PASTEL value; ours matches our own L and R"},
    "aludra|teff": {"verdict": S, "drop": True, "cause": "a single PASTEL value (12,670 K); ours matches our own L and R and the B5 Ia class"},
    "chi-cygni|teff": {"verdict": S, "drop": True, "cause": "Mira (S type): Gaia GSP-Phot does not handle it; Teff varies over the cycle"},
    "t-coronae-borealis|teff": {"verdict": S, "drop": True, "cause": "symbiotic recurrent nova: Gaia GSP-Spec fits a composite spectrum; the M3 III giant is ≈3,600 K"},
    # -- mass
    "aludra|mass": {"verdict": W, "cause": "5.5 M☉ cannot shine at our 164,000 L☉; Tetzlaff et al. 2011 give 19.2±0.1 M☉ from tracks",
                    "fix": {"mass": 19.2, "mass_src": "Tetzlaff, Neuhäuser & Hohle 2011 (J/MNRAS/410/190)"}},
    "capella|mass": {"verdict": S, "drop": True, "cause": "reference unreliable: log g from a composite spectrum; ours is Capella Aa's dynamical (orbit) mass"},
    "gamma-velorum|mass": {"verdict": S, "drop": True, "cause": "reference is for the combined light on single-star tracks; ours is the WR star"},
    "mirach|mass": {"verdict": S, "drop": True, "cause": "reference from spectroscopic log g (±0.3 dex ⇒ ±2×) for a cool giant — not decisive"},
    "scheat|mass": {"verdict": S, "drop": True, "cause": "reference from spectroscopic log g of a cool giant — not decisive"},
    "tarazed|mass": {"verdict": S, "drop": True, "cause": "reference from spectroscopic log g of a cool giant — not decisive"},
    "proxima-centauri|mass": {"verdict": S, "drop": True, "cause": "reference unreliable (log g 4.59 is too low for an M5.5 dwarf); 0.122 M☉ is the standard value"},
    # -- magnitudes
    "eta-carinae|mag": {"verdict": S, "drop": True, "cause": "LBV that has brightened from SIMBAD's V 6.5 to ≈4–4.5 this century; the catalog has no `vary` for it (worth adding)"},
    "iota-orionis|mag2": {"verdict": S, "drop": True, "cause": "sources disagree: WDS 7.73 (ours), older WDS/SIMBAD 7.0, Gaia G 7.21 ⇒ V 7.25 (possibly brightened by the 2.7-mag primary 11″ away)"},
}
NOTES = [
    "Almach mass 14 M☉ (ratio 2.4, under the 2.5× flag) is hard to reconcile with its L ≈ 2,500–3,000 L☉, which fits a ≈4–6 M☉ bright giant (log g 1.29 from 10 SIMBAD values with the JMDC radius gives 5.9 M☉). Tetzlaff et al. list 23.7 M☉ but attach the companion's B8 V type — ignored.",
    "Deneb: our 1,400 ly agrees with its own Hipparcos 2007 parallax (2.31±0.32 mas), but Cyg OB7 members give 889 pc ≈ 2,900 ly (22 members, Melnik & Dambis 2020). Not flagged; worth a look if the app prefers association distances for supergiants (as for μ Cep).",
    "β Cep B (Alfirk's companion): ours 8.63 = WDS = SIMBAD (UCAC4), but Gaia G 7.85 ⇒ V ≈ 7.9; Gaia may be brightened by the 3.2-mag primary 13.5″ away, and an early-A dwarf (BP−RP 0.14) at its Gaia distance of 237 pc would be V ≈ 8.0–8.5 — not a clear error.",
    "Albireo B, ι Cnc B, β² Sco and the Trapezium companion: Tycho (TDSC) and WDS are 0.3–0.6 mag brighter than ours, but Gaia DR3 agrees with ours — the README's SIMBAD overrides are confirmed.",
    "ξ UMa: no trigonometric parallax in Hipparcos 1997/2007 (orbital solution) or Gaia DR3 (2-parameter solutions), so its distance is unchecked.",
]

# ---------------------------------------------------------------------------------------------------------------
# 5. outputs
FIELDS = [("pos", "Position (identity, > 60″)"), ("mag", "V magnitude (> 0.3, variables exempt)"), ("bv", "B−V (> 0.2)"),
          ("d", "Distance (> 25 % at plx S/N > 5, else > 50 %)"), ("r", "Radius (> 2×)"), ("lum", "Luminosity (> 2×)"),
          ("teff", "Teff (> 15 %)"), ("mass", "Mass (> 2.5×, soft)"), ("sep", "Double separation (> 20 % or other pair)"),
          ("pa", "Double PA (> 10°)"), ("sep_gaia", "Double sep/PA vs Gaia DR3 positions (> 20 % / 10°)"),
          ("mag1", "Double primary V (> 0.3)"), ("mag2", "Double companion mag (> 0.3)")]

def fmt(v):
    if v is None:
        return "—"
    if isinstance(v, float) and v.is_integer() and abs(v) < 1e6:
        return f"{v:.0f}"
    if isinstance(v, (int, float)):
        return f"{v:,.4g}" if abs(v) >= 1e4 else f"{v:.4g}"
    return str(v)

lines = ["# Stars and double stars — independent cross-check", "",
         "Generated by `scripts/crosscheck/stars.py` (rerun offline with `--offline`; cache in `.local/crosscheck-cache/`).",
         "Compared: `shared/data/catalog.json` (151 `star`, 45 `double_star`) and `shared/data/objectFacts.json` against",
         "SIMBAD, Hipparcos 2007 (I/311), XHIP (V/137D), Gaia DR3 (I/355), JMDC (II/345), PASTEL (B/pastel), WDS (B/wds) and",
         "ORB6. No Wikipedia. Reference values per id are in `shared/data/xcheck/stars.json`; proposed fixes in",
         "`scripts/crosscheck/stars-corrections.json`.", "",
         "Reference choices (all in `stars.py`):",
         "* **Distance**: Gaia DR3 parallax when G ≥ 4.5, RUWE < 1.4 and S/N > 10; else Hipparcos 2007 at S/N > 10; else the",
         "  host cluster (Hunt & Reffert 2023, Gaia DR3; ι Ori, η Car, VY CMa, Pleiades, α Per); else Hipparcos 2007 at S/N > 5,",
         "  Hipparcos 1997, a looser Gaia DR3 parallax, the OB association's median member parallax (Melnik & Dambis 2020;",
         "  μ Cep, ζ Per, Deneb), SIMBAD's parallax, SIMBAD literature distances. Tolerance 25 %, or 50 % for weak references.",
         "* **Radius**: JMDC limb-darkened diameter × that distance (lunar occultations < 2 mas and mid-IR sizes dropped;",
         "  near-IR preferred for M stars); else Gaia FLAME; else from L and T.",
         "* **Luminosity**: R²T⁴ when the radius is interferometric and photospheric; else V + distance + BC_V(T) (Torres",
         "  2010) with A_V = 3.1·E(B−V) from the colour excess, or K + BC_K (Levesque 2005) below 3,700 K. Large-amplitude",
         "  variables are skipped. A double's primary uses its own V, not the pair's combined light.",
         "* **Teff**: PASTEL median within 3″ (papers since 2000 when ≥ 2), else SIMBAD mesFe_h, else Gaia GSP-Spec/Phot;",
         "  catalogue values spread by > 1.4× (a companion mixed in) are not used.",
         "* **Mass**: Tetzlaff et al. 2011 (young stars, same spectral class), else Gaia FLAME, else 10^(log g − 4.438)·R²",
         "  from ≥ 2 spectroscopic gravities and an interferometric radius (soft: ±0.3 dex in log g ⇒ ±2×).",
         "* **Doubles**: sep/PA vs ORB6 2027.0 ephemeris (grade 1–3 orbits, the app's convention) or the WDS last measure",
         "  (same sources as the app, so this catches transcription and wrong-pair errors), and independently vs Gaia DR3",
         "  positions of both stars (2016.0; orbits traced back to 2016). Primary V vs Tycho (TDSC); companion V vs Tycho,",
         "  the companion's SIMBAD V and Gaia G→V (Riello et al. 2021) — flagged only if none supports ours within 0.3.",
         "",
         "## Summary", "", "| Field | Checked | Agree | Flagged | Ours wrong | Within spread / explained |", "|---|---:|---:|---:|---:|---:|"]
summary = {}
for fld, label in FIELDS:
    rs = [r for r in ROWS if r["field"] == fld]
    fl = [r for r in rs if r["flagged"]]
    wrong = [r for r in fl if VERDICTS.get(f"{r['id']}|{fld}", {}).get("verdict") == "ours is wrong"]
    summary[fld] = (len(rs), len(rs) - len(fl), len(fl), len(wrong))
    lines.append(f"| {label} | {len(rs)} | {len(rs) - len(fl)} | {len(fl)} | {len(wrong)} | {len(fl) - len(wrong)} |")
lines += ["", "## Discrepancies beyond tolerance", ""]
for fld, label in FIELDS:
    fl = [r for r in ROWS if r["field"] == fld and r["flagged"]]
    if not fl:
        continue
    lines += [f"### {label}", "", "| id | ours | reference | source | likely cause | verdict |", "|---|---:|---:|---|---|---|"]
    for r in sorted(fl, key=lambda r: r["id"]):
        v = VERDICTS.get(f"{r['id']}|{fld}", {})
        cause = v.get("cause", "(not yet reviewed)") + (f" [{r['extra']}]" if r["extra"] else "")
        lines.append(f"| {r['id']} | {fmt(r['ours'])} | {fmt(r['ref'])} | {r['src']} | {cause} | {v.get('verdict', '?')} |")
    lines.append("")
lines += ["## Not verified", ""]
for fld, ids in sorted(UNVERIFIED.items()):
    lines.append(f"* **{fld}** ({len(ids)}): {', '.join(sorted(ids))}")
lines += ["* **mass** is unverified where no Tetzlaff/FLAME mass exists and fewer than two gravities or no interferometric radius are available.",
          "* **age**: not checked — no catalogue gives model-independent ages for these stars.",
          "* **sp** (spectral type): not compared field-by-field; SIMBAD's type is in the cache if needed.", ""]
# Physically unrelated pairs: the two Gaia parallaxes differ by > 5σ and > 25 % — the "gap between the stars"
# (separation × distance) is then not a real distance.
optical = []
for k_, rf in REF.items():
    gpv = rf.get("gaia_pair", {}).get("v")
    if gpv and gpv[2] and gpv[3]:
        o_ = BYID[k_]
        e1 = next((num(r["e_Plx"]) for r in GCONE[k_][2] if num(r["Plx"]) == gpv[2]), None) or 0.1
        e2 = next((num(r["e_Plx"]) for r in GCONE[k_][2] if num(r["Plx"]) == gpv[3]), None) or 0.1
        if abs(gpv[2] - gpv[3]) > 5 * math.hypot(e1, e2) and ratio(gpv[2], gpv[3]) > 1.25:
            optical.append(f"{k_} ({gpv[2]:.2f} vs {gpv[3]:.2f} mas)")
notes = NOTES + ([f"Optical (unrelated) pairs by Gaia DR3 parallax — the separation×distance 'gap' is not physical: {', '.join(optical)}."] if optical else [])
lines += ["## Notes", ""] + [f"* {n}" for n in notes] + [""]
OUT_REPORT.write_text("\n".join(lines))

# Keep only references we trust: no gravity-based masses or GSP-Phot temperatures, and none the verdicts reject.
for k_, rf in REF.items():
    if rf.get("mass", {}).get("src", "").startswith("log g"):
        rf.pop("mass")
    if rf.get("teff", {}).get("src", "").endswith("GSP-Phot"):
        rf.pop("teff")
for key, v in VERDICTS.items():
    if v.get("drop"):
        oid_, fld_ = key.split("|")
        rf = REF.get(oid_, {})
        rf.pop(fld_, None)
        if fld_ == "d":  # radius and luminosity were computed with that distance
            rf.pop("r", None), rf.pop("lum", None)
        if fld_ == "lum" and rf.get("r", {}).get("src", "").startswith("from photometric"):
            rf.pop("r", None)
OUT_REF.parent.mkdir(parents=True, exist_ok=True)
OUT_REF.write_text(json.dumps({k: v for k, v in REF.items() if v}, ensure_ascii=False, separators=(",", ":"), sort_keys=True))

corr = {}
for key, v in VERDICTS.items():
    if key.startswith("_") or v.get("verdict") != "ours is wrong" or not v.get("fix"):
        continue
    oid_, _fld = key.split("|")
    for fk, fv in v["fix"].items():
        if fk == "catalog":
            corr.setdefault(oid_, {}).setdefault("catalog", {}).update(fv)
        else:
            corr.setdefault(oid_, {})[fk] = fv
OUT_CORR.write_text(json.dumps(corr, ensure_ascii=False, indent=1, sort_keys=True) + "\n")

# console summary + a dump of every flagged row (for review)
for fld, label in FIELDS:
    print(f"{label:<45} checked {summary[fld][0]:>3}  agree {summary[fld][1]:>3}  flagged {summary[fld][2]:>3}  wrong {summary[fld][3]:>3}")
if "--dump" in sys.argv:
    for r in ROWS:
        if r["flagged"]:
            v = VERDICTS.get(f"{r['id']}|{r['field']}")
            print(f"{'*' if not v else ' '} {r['field']:<8} {r['id']:<22} ours {fmt(r['ours']):>9}  ref {fmt(r['ref']):>9}  {r['src']}  [{r['extra']}]")
print(f"wrote {OUT_REF.relative_to(ROOT)} ({OUT_REF.stat().st_size // 1024} KB), {OUT_REPORT.relative_to(ROOT)}, {OUT_CORR.relative_to(ROOT)}", file=sys.stderr)
