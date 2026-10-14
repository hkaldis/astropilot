#!/usr/bin/env python3
"""Cross-check the app's open-cluster data against independent open catalogues (VizieR, SIMBAD; no Wikipedia).

Objects: catalog types open_cluster, cluster_nebula, asterism, star_cloud (shared/data/catalog.json), with their
facts (shared/data/objectFacts.json: d, age, members, mass) and visual size (catalog size[0], arcmin).

Reference catalogues (VizieR, queried once over TAP and cached under .local/crosscheck-cache/oc-*.csv):
  HR23   Hunt & Reffert 2023, A&A 673, A114 (Gaia DR3)           J/A+A/673/A114/clusters  dist50, logAge50, N, r50, rt
  HR24   Hunt & Reffert 2024, A&A 686, A42 (Gaia DR3)            J/A+A/686/A42/clusters   MassTot, MassJ, rJ
  CG20   Cantat-Gaudin et al. 2020, A&A 640, A1 (Gaia DR2)        J/A+A/640/A1/table1      DistPc, AgeNN, r50, nbstars07
  D21    Dias et al. 2021, MNRAS 504, 356 (Gaia DR2 isochrones)   J/MNRAS/504/356/table12  Dist, logage, r50, N
  MWSC   Kharchenko et al. 2013, A&A 558, A53 (2MASS/PPMXL)       J/A+A/558/A53/catalog    d, logt, r0/r1/r2
  DAML   Dias et al. 2002 (v3.5), B/ocl (pre-Gaia literature)     B/ocl/clusters           Diam, Dist, Age
  B08    Bica et al. 2008, MNRAS 389, 678 (Magellanic Clouds)     J/MNRAS/389/678/table3   amaj, amin
  SIMBAD identifiers (sim-tap ident/basic), Gaia DR3 (I/355/gaiadr3) for the stars of the M73 asterism.

Writes:
  shared/data/xcheck/open-clusters.json            reference values per id
  scripts/crosscheck/open-clusters-report.md       counts, discrepancies, verdicts
  scripts/crosscheck/open-clusters-corrections.json  clear errors only

Run:  python3 scripts/crosscheck/open-clusters.py            (fetches only what is missing from the cache)
      python3 scripts/crosscheck/open-clusters.py --offline  (cache only; fails if anything is missing)
"""
import csv, io, json, math, os, re, statistics, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(ROOT, "../.."))
CACHE = os.path.join(REPO, ".local/crosscheck-cache")
OFFLINE = "--offline" in sys.argv
LY = 3.26156  # light-years per parsec
VIZIER_TAP = "https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync"
SIMBAD_TAP = "https://simbad.cds.unistra.fr/simbad/sim-tap/sync"
TYPES = ("open_cluster", "cluster_nebula", "asterism", "star_cloud")

# ------------------------------------------------------------------------------------------------ fetching (cached)
_last = [0.0]


def tap(name, url, query):
    """One ADQL query, cached as CSV. Polite: at most one request per ~1.2 s."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"oc-{name}.csv")
    if not os.path.exists(path):
        if OFFLINE:
            sys.exit(f"missing cache {path} (run without --offline)")
        wait = 1.2 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        body = urllib.parse.urlencode({"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "csv", "MAXREC": "50000", "QUERY": query}).encode()
        req = urllib.request.Request(url, data=body, headers={"User-Agent": "AstroPilot crosscheck (open clusters)"})
        with urllib.request.urlopen(req, timeout=180) as r:
            text = r.read().decode("utf-8")
        _last[0] = time.time()
        if text.lstrip().startswith("<"):  # TAP errors come back as a VOTable
            sys.exit(f"TAP error for {name}: {text[:800]}")
        open(path, "w").write(text)
        print(f"fetched {name}: {text.count(chr(10)) - 1} rows", file=sys.stderr)
    return list(csv.DictReader(io.StringIO(open(path).read())))


def num(x):
    try:
        v = float(x)
        return v if v == v else None
    except (TypeError, ValueError):
        return None


V = lambda t: f'"{t}"'
HR23 = tap("hr23", VIZIER_TAP, f"SELECT Name, AllNames, Type, CST, N, RA_ICRS, DE_ICRS, r50, rc, rt, rtot, r50pc, rtpc, Plx, dist16, dist50, dist84, logAge16, logAge50, logAge84, CMDCl50, NXmatches FROM {V('J/A+A/673/A114/clusters')}")
HR24 = tap("hr24", VIZIER_TAP, f"SELECT Name, Type, N, dist50, MassJ, e_MassJ, MassTot, e_MassTot, rJ, rJpc, probJ, Note FROM {V('J/A+A/686/A42/clusters')}")
CG20 = tap("cg20", VIZIER_TAP, f"SELECT Cluster, RA_ICRS, DE_ICRS, r50, nbstars07, plx, Flag, AgeNN, DistPc FROM {V('J/A+A/640/A1/table1')}")
D21 = tap("dias21", VIZIER_TAP, f"SELECT Cluster, RA_ICRS, DE_ICRS, r50, N, Plx, Dist, e_Dist, logage, e_logage FROM {V('J/MNRAS/504/356/table12')}")
MWSC = tap("mwsc", VIZIER_TAP, f"SELECT MWSC, Name, Type, n_Type, RAJ2000, DEJ2000, r0, r1, r2, N1sr2, d, logt, e_logt FROM {V('J/A+A/558/A53/catalog')}")
DAML = tap("ocl", VIZIER_TAP, f"SELECT Cluster, RAJ2000, DEJ2000, Class, Diam, Dist, Age, Nc FROM {V('B/ocl/clusters')}")
B08 = []
for _t in ("table3", "table4", "table5"):  # star clusters, associations, emission nebulae
    for _r in tap("bica08" + ("" if _t == "table3" else "-" + _t), VIZIER_TAP, f"SELECT Names, RAJ2000, DEJ2000, Type, amaj, amin FROM {V('J/MNRAS/389/678/' + _t)} WHERE Names LIKE '%NGC%'"):
        _r["_table"] = _t
        B08.append(_r)
# The four stars of M73 (Gaia DR3, G < 12.5 within 1.5′ of the asterism's centre).
M73_GAIA = tap("m73-gaia", VIZIER_TAP, f"SELECT Source, RA_ICRS, DE_ICRS, Plx, e_Plx, Gmag FROM {V('I/355/gaiadr3')} WHERE 1=CONTAINS(POINT('ICRS', RA_ICRS, DE_ICRS), CIRCLE('ICRS', 314.7333, -12.635, 0.025)) AND Gmag < 12.5")

# ------------------------------------------------------------------------------------------------ the app's data
CAT = json.load(open(os.path.join(REPO, "shared/data/catalog.json")))
_facts = json.load(open(os.path.join(REPO, "shared/data/objectFacts.json")))
FACTS = _facts.get("facts", _facts)
OBJS = [o for o in CAT if o["type"] in TYPES]

# ------------------------------------------------------------------------------------------------ names
PREFIX = {"ngc": "ngc", "ic": "ic", "mel": "melotte", "melotte": "melotte", "cr": "collinder", "collinder": "collinder",
          "harvard": "harvard", "tr": "trumpler", "trumpler": "trumpler", "stock": "stock", "m": "m", "ru": "ruprecht",
          "ruprecht": "ruprecht", "bochum": "bochum", "berkeley": "berkeley", "be": "berkeley", "king": "king", "pismis": "pismis",
          "vdbh": "vdbh", "alessi": "alessi", "basel": "basel", "haffner": "haffner", "lynga": "lynga", "roslund": "roslund"}


def norm(s):
    """'NGC_0869' / 'Cl Melotte   22' / 'Mel 22' → 'ngc 869' / 'melotte 22'. None for names we don't match on."""
    s = re.sub(r"[_\s]+", " ", s.strip().lower())
    s = re.sub(r"^cl ", "", s)
    m = re.match(r"^([a-z]+) ?0*(\d+) ?([a-z]?)$", s)
    if not m or m.group(1) not in PREFIX:
        return None
    return f"{PREFIX[m.group(1)]} {int(m.group(2))}{m.group(3)}"


def simbad_variants(d):
    """SIMBAD pads identifiers ('NGC  2451', 'Cl Melotte   22'); send every padding."""
    m = re.match(r"^(NGC|IC|M|Mel|Cr|Harvard)\s+(\d+)$", d)
    if not m:
        return []
    p, n = m.groups()
    p = {"Mel": "Cl Melotte", "Cr": "Cl Collinder", "Harvard": "Cl Harvard"}.get(p, p)
    return [p + " " * k + n for k in range(1, 5)]


def simbad_ids():
    queries = []
    for o in OBJS:
        for d in o["designations"]:
            queries += simbad_variants(d)
    rows = []
    for i in range(0, len(queries), 400):
        chunk = ", ".join("'" + q.replace("'", "''") + "'" for q in queries[i:i + 400])
        rows += tap(f"simbad-{i // 400}", SIMBAD_TAP,
                    f"SELECT i1.id AS q, i2.id AS alias, b.main_id, b.otype, b.ra, b.dec FROM ident AS i1 JOIN ident AS i2 ON i1.oidref = i2.oidref JOIN basic AS b ON b.oid = i1.oidref WHERE i1.id IN ({chunk})")
    by_q = {}
    for r in rows:
        by_q.setdefault(norm(r["q"]) or r["q"], []).append(r)
    return by_q


SIMBAD = simbad_ids()


def sep_deg(ra1, de1, ra2, de2):
    """ra in degrees."""
    r1, d1, r2, d2 = map(math.radians, (ra1, de1, ra2, de2))
    c = math.sin(d1) * math.sin(d2) + math.cos(d1) * math.cos(d2) * math.cos(r1 - r2)
    return math.degrees(math.acos(max(-1, min(1, c))))


def sexa(s, hours):
    s = (s or "").strip()
    if not s:
        return None
    if re.match(r"^[+-]?\d+(\.\d+)?$", s):
        return float(s)
    p = re.split(r"[\s:]+", s)
    sign = -1 if p[0].startswith("-") else 1
    v = abs(float(p[0])) + float(p[1]) / 60 + (float(p[2]) if len(p) > 2 else 0) / 3600
    return sign * v * (15 if hours else 1)


class Ref:
    """One reference catalogue: rows indexed by normalised name (primary names first, then cross-identifications)."""

    def __init__(self, key, rows, name_cols, ra, de, alias_col=None, hours=False):
        self.key, self.rows, self.idx, self.alias = key, rows, {}, {}
        for r in rows:
            r["_ra"], r["_de"] = sexa(r.get(ra), hours), sexa(r.get(de), False)
            for c in name_cols:
                for part in re.split(r"[,;]", r.get(c) or ""):
                    n = norm(part)
                    if n:
                        self.idx.setdefault(n, []).append(r)
            if alias_col:
                for part in (r.get(alias_col) or "").split(","):
                    n = norm(part)
                    if n:
                        self.alias.setdefault(n, []).append(r)

    def radius(self, r):
        """The reference's own radius for a row (deg), to widen the position check for big clusters."""
        for c, f in (("r50", 3), ("r2", 1), ("Diam", 1 / 120), ("amaj", 1 / 120)):
            v = num(r.get(c))
            if v:
                return v * f
        return 0

    def match(self, o, keys, tol_deg, tight_deg=0.1):
        """Name match checked against position: a row under the object's own name close by (tight_deg) first, then the
        nearest row carrying any of its names (own or cross-identification) within the tolerance. A name match farther
        than the tolerance is returned as '-far' (and not used) so the report can show it."""
        ra, de = o["ra"] * 15, o["dec"]
        cands = []
        for table, how in ((self.idx, "name"), (self.alias, "xid")):
            for k in keys:
                for r in table.get(k, []):
                    if r["_ra"] is None or any(r is c for c, _, _ in cands):
                        continue
                    cands.append((r, sep_deg(ra, de, r["_ra"], r["_de"]), how))
        if not cands:
            return None
        n = len(cands)
        own = sorted((c for c in cands if c[2] == "name" and c[1] <= tight_deg), key=lambda c: c[1])
        ok = own or sorted((c for c in cands if c[1] <= max(tol_deg, self.radius(c[0]))), key=lambda c: (c[1], c[2] != "name"))
        if ok:
            r, s, how = ok[0]
            return {"row": r, "sep": s * 60, "how": how, "n": n}
        r, s, how = min(cands, key=lambda c: (c[2] != "name", c[1]))
        return {"row": r, "sep": s * 60, "how": how + "-far", "n": n}

    def nearest(self, o, rad_deg):
        """Positional fallback: the nearest row within rad_deg."""
        ra, de = o["ra"] * 15, o["dec"]
        best = None
        for r in self.rows:
            if r["_ra"] is None or abs(r["_de"] - de) > rad_deg:
                continue
            s = sep_deg(ra, de, r["_ra"], r["_de"])
            if s <= rad_deg and (best is None or s < best[1]):
                best = (r, s)
        return {"row": best[0], "sep": best[1] * 60, "how": "pos", "n": 1} if best else None


REFS = {
    "HR23": Ref("HR23", HR23, ["Name"], "RA_ICRS", "DE_ICRS", alias_col="AllNames"),
    "CG20": Ref("CG20", CG20, ["Cluster"], "RA_ICRS", "DE_ICRS"),
    "D21": Ref("D21", D21, ["Cluster"], "RA_ICRS", "DE_ICRS"),
    "MWSC": Ref("MWSC", MWSC, ["Name"], "RAJ2000", "DEJ2000"),
    "DAML": Ref("DAML", DAML, ["Cluster"], "RAJ2000", "DEJ2000"),
    "B08": Ref("B08", B08, ["Names"], "RAJ2000", "DEJ2000"),
}
HR24_BY = {r["Name"]: r for r in HR24}


def keys_for(o):
    """Normalised names to look an object up by: its own designations, then SIMBAD's identifiers for them."""
    keys = []
    for d in o["designations"]:
        n = norm(d)
        if n and not n.startswith("m ") and n not in keys:
            keys.append(n)
    for d in o["designations"]:
        n = norm(d)
        for r in SIMBAD.get(n, []) if n else []:
            a = norm(r["alias"])
            if a and not a.startswith("m ") and a not in keys:
                keys.append(a)
    return keys


def lookup(o, keys=None):
    keys = keys or keys_for(o)
    size = (o.get("size") or [0])[0]
    tol = max(size / 60, 0.25)
    tight = max(size / 120, 0.1)
    out = {}
    for k, ref in REFS.items():
        m = ref.match(o, keys, tol, tight)
        if (m is None or m["how"].endswith("far")) and k != "B08":
            # NGC 2451 and similar: catalogues split the object into A/B components.
            m2 = ref.match(o, [x + s for x in keys[:1] for s in "ab"], tol)
            if m2 and not m2["how"].endswith("far"):
                m2["how"] += "-ab"
                m = m2
        if m:
            out[k] = m
    named = any(not m["how"].endswith("far") for m in out.values())
    for k in ("HR23", "CG20", "D21") + (() if named else ("MWSC",)):
        if k in out and not out[k]["how"].endswith("far"):
            continue
        # Not in this catalogue by name: the nearest catalogued cluster inside the object's own radius (or 3′), unless
        # it is another object of ours. Reported for context only; never used as the object's own value.
        p = REFS[k].nearest(o, max(size / 120, 5 / 60))
        if p:
            names = [norm(n) for n in re.split(r"[,;]", (p["row"].get("AllNames") or "") + "," + refname(p["row"]))]
            if not any(NAME_OWNER.get(n) not in (None, o["id"]) for n in names if n):
                out[k + "-pos"] = p
    return out


NAME_OWNER = {}
for _o in CAT:
    for _d in _o.get("designations", []):
        _n = norm(_d)
        if _n:
            NAME_OWNER.setdefault(_n, _o["id"])


def fx(r):
    """Symmetric factor between two positive values (≥ 1)."""
    return max(r, 1 / r) if r else None


def refname(r):
    return (r.get("Name") or r.get("Cluster") or r.get("Names") or "").split(",")[0].strip()


def rnd(x):
    """The app's rounding (scripts/data/stories/build_facts.py): 2–3 significant figures."""
    if x is None:
        return None
    if x < 100:
        return round(x, 1) if x < 20 else round(x)
    p = 10 ** (int(math.log10(x)) - 1)
    if x < 1000:
        p = 10
    return int(round(x / p) * p)


def gmed(xs):
    xs = [x for x in xs if x]
    return math.exp(statistics.median(math.log(x) for x in xs)) if xs else None


def gather(o, keys=None):
    """Everything the references say about one object (values in ly, years, arcmin)."""
    m = lookup(o, keys)
    g = {"m": m}
    row = lambda k: m[k]["row"] if k in m and not m[k]["how"].endswith("far") else None
    hr, cg, d21, mw, da, b8 = (row(k) for k in ("HR23", "CG20", "D21", "MWSC", "DAML", "B08"))
    h24 = HR24_BY.get(hr["Name"]) if hr else None
    g["rows"] = {"HR23": hr, "CG20": cg, "D21": d21, "MWSC": mw, "DAML": da, "B08": b8, "HR24": h24}
    g["d"] = {k: v for k, v in {
        "HR23": num(hr["dist50"]) * LY if hr and num(hr["dist50"]) else None,
        "CG20": num(cg["DistPc"]) * LY if cg and num(cg["DistPc"]) else None,
        "D21": num(d21["Dist"]) * LY if d21 and num(d21["Dist"]) else None,
        "MWSC": num(mw["d"]) * LY if mw and num(mw["d"]) else None,
        "DAML": num(da["Dist"]) * LY if da and num(da["Dist"]) else None}.items() if v}
    g["age"] = {k: v for k, v in {
        "HR23": 10 ** num(hr["logAge50"]) if hr and num(hr["logAge50"]) else None,
        "CG20": 10 ** num(cg["AgeNN"]) if cg and num(cg["AgeNN"]) else None,
        "D21": 10 ** num(d21["logage"]) if d21 and num(d21["logage"]) else None,
        "MWSC": 10 ** num(mw["logt"]) if mw and num(mw["logt"]) else None,
        "DAML": 10 ** num(da["Age"]) if da and num(da["Age"]) else None}.items() if v}
    g["size_in"] = {k: v for k, v in {
        "HR23 2r50": 120 * num(hr["r50"]) if hr and num(hr["r50"]) else None,
        "CG20 2r50": 120 * num(cg["r50"]) if cg and num(cg["r50"]) else None,
        "D21 2r50": 120 * num(d21["r50"]) if d21 and num(d21["r50"]) else None,
        "MWSC 2r1": 120 * num(mw["r1"]) if mw and num(mw["r1"]) else None,
        "DAML Diam": num(da["Diam"]) if da else None,
        "B08 amaj": num(b8["amaj"]) if b8 else None}.items() if v}
    g["size_out"] = {k: v for k, v in {
        "MWSC 2r2": 120 * num(mw["r2"]) if mw and num(mw["r2"]) else None,
        "HR23 2rt": 120 * num(hr["rt"]) if hr and num(hr["rt"]) else None}.items() if v}
    g["members"] = {k: v for k, v in {
        "HR23": int(hr["N"]) if hr else None,
        "CG20": int(num(cg["nbstars07"])) if cg and num(cg["nbstars07"]) else None,
        "D21": int(num(d21["N"])) if d21 and num(d21["N"]) else None,
        "MWSC": int(num(mw["N1sr2"])) if mw and num(mw["N1sr2"]) else None}.items() if v}
    g["mass"] = {k: v for k, v in {
        "HR24 MassTot": num(h24["MassTot"]) if h24 else None,
        "HR24 MassJ": num(h24["MassJ"]) if h24 else None}.items() if v}
    # Clusters near the object in catalogues that lack it by name (context only).
    g["ctx"] = {}
    for k, mm in m.items():
        if k.endswith("-pos"):
            r = mm["row"]
            dv = num(r.get("dist50") or r.get("DistPc") or r.get("Dist") or r.get("d"))
            g["ctx"][k[:-4]] = f"{refname(r)} {mm['sep']:.0f}′ away" + (f", {rnd(dv * LY):,} ly" if dv else "")
    return g


SIMBAD_POS = {}
for _k, _rows in SIMBAD.items():
    r = _rows[0]
    SIMBAD_POS[_k] = {"ra": num(r["ra"]), "dec": num(r["dec"]), "main": re.sub(r"\s+", " ", r["main_id"]), "otype": r["otype"]}


def simbad_of(o):
    for d in o["designations"]:
        n = norm(d)
        if n and n in SIMBAD_POS:
            return SIMBAD_POS[n]
    return None


# ------------------------------------------------------------------------------------------------ checks
GAIA = ("HR23", "CG20", "D21")
SOURCES = {
    "HR23": "Hunt & Reffert 2023, A&A 673, A114 (Gaia DR3), VizieR J/A+A/673/A114",
    "HR24": "Hunt & Reffert 2024, A&A 686, A42 (Gaia DR3 masses), VizieR J/A+A/686/A42",
    "CG20": "Cantat-Gaudin et al. 2020, A&A 640, A1 (Gaia DR2), VizieR J/A+A/640/A1",
    "D21": "Dias et al. 2021, MNRAS 504, 356 (Gaia DR2 isochrone fits), VizieR J/MNRAS/504/356",
    "MWSC": "Kharchenko et al. 2013, A&A 558, A53 (MWSC, pre-Gaia), VizieR J/A+A/558/A53",
    "DAML": "Dias et al. 2002 catalogue v3.5 (pre-Gaia literature compilation), VizieR B/ocl",
    "B08": "Bica et al. 2008, MNRAS 389, 678 (Magellanic Cloud objects), VizieR J/MNRAS/389/678",
    "SIMBAD": "SIMBAD (identifiers, positions)",
    "GaiaDR3": "Gaia DR3, VizieR I/355/gaiadr3",
}
FIELDS = ("d", "age", "size", "members", "mass", "position")
counts = {k: {"checked": 0, "agree": 0, "flagged": 0, "wrong": 0} for k in FIELDS}
issues, spread_notes, match_notes, unverifiable = [], [], [], []
xcheck, corrections = {}, {}
LMC = {"lmc", "smc"}


def fmt(v, field):
    if v is None:
        return "—"
    if field == "d":
        return f"{rnd(v):,} ly"
    if field == "age":
        return f"{v / 1e6:.3g} Myr" if v < 1e9 else f"{v / 1e9:.3g} Gyr"
    if field == "size":
        return f"{v:.3g}′"
    if field == "mass":
        return f"{v:,.0f} M☉"
    return f"{v:,}"


def listing(dct, field):
    return ", ".join(f"{k} {fmt(v, field)}" for k, v in dct.items())


def issue(o, field, ours, ref, refsrc, cause, verdict, fix=None):
    counts[field]["flagged"] += 1
    if verdict == "ours is wrong":
        counts[field]["wrong"] += 1
    issues.append({"id": o["id"], "name": o["name"], "field": field, "ours": ours, "ref": ref, "refsrc": refsrc, "cause": cause, "verdict": verdict})
    if fix and verdict == "ours is wrong":
        c = corrections.setdefault(o["id"], {})
        for k, v in fix.items():
            if k == "catalog":
                c.setdefault("catalog", {}).update(v)
            else:
                c[k] = v


def check_distance(o, f, g, x):
    ours, d = f.get("d"), g["d"]
    gaia = {k: d[k] for k in GAIA if k in d}
    pre = {k: d[k] for k in ("MWSC", "DAML") if k in d}
    if gaia:
        k0 = next(k for k in GAIA if k in gaia)
        col = {"HR23": "dist50", "CG20": "DistPc", "D21": "Dist"}[k0]
        x["d"] = {"v": rnd(gaia[k0]), "src": f"{k0} {refname(g['rows'][k0])} {col} {gaia[k0] / LY:.0f} pc"
                  + "".join(f"; {k} {gaia[k] / LY:.0f}" for k in GAIA if k != k0 and k in gaia)}
    elif pre:
        x["d"] = {"v": rnd(statistics.median(pre.values())), "src": "pre-Gaia only: " + ", ".join(f"{k} {v / LY:.0f} pc" for k, v in pre.items())}
    if not ours or not d:
        return
    src = f.get("src")
    if not gaia and max(pre.values()) / min(pre.values()) > 1.5:
        unverifiable.append(f"{o['id']}: d {fmt(ours, 'd')} ({src}) — no Gaia catalogue has this cluster; the pre-Gaia values disagree ({listing(pre, 'd')})")
        return
    counts["d"]["checked"] += 1
    if not gaia:
        ref = statistics.median(pre.values())
        if fx(ours / ref) <= 1.25:
            counts["d"]["agree"] += 1
            return
        ctx = g["ctx"].get("HR23")
        issue(o, "d", fmt(ours, "d") + f" ({src})", fmt(ref, "d"), listing(d, "d"),
              "no Gaia catalogue has this cluster by name; only pre-Gaia values (MWSC/DAML), which scatter widely" + (f"; nearest HR23 cluster: {ctx}" if ctx else ""),
              "within literature spread")
        return
    ref = statistics.median(gaia.values())
    if fx(ours / ref) <= 1.25:
        counts["d"]["agree"] += 1
        return
    spread = max(gaia.values()) / min(gaia.values()) if len(gaia) > 1 else None
    hr = gaia.get("HR23")
    if src == "gaia" and hr and fx(ours / hr) <= 1.06:
        cause = "ours is HR23's dist50; the Gaia DR2 catalogues put it elsewhere"
    elif src == "gaia":
        cause = "the app's Hunt & Reffert row is a different cluster from the one matched here (cross-identification)"
    else:
        cause = {"plx": "median of SIMBAD parallax measurements (individual stars), not a cluster distance",
                 "lit": "SIMBAD literature distance (pre-Gaia)", "wiki": "Wikipedia/Wikidata value"}.get(src, f"source '{src}'")
    if len(gaia) >= 2 and spread <= 1.25:
        verdict = "ours is wrong"
    elif len(gaia) == 1 and pre and all(fx(v / ref) <= 1.25 for v in pre.values()):
        verdict = "ours is wrong"
    elif len(gaia) == 1 and "HR23" in gaia and src != "gaia":
        h = g["rows"]["HR23"]
        lo, hi = num(h["dist16"]) * LY, num(h["dist84"]) * LY
        verdict = "ours is wrong" if not (lo / 1.15 <= ours <= hi * 1.15) else "within literature spread"
    else:
        verdict = "within literature spread"
    fix = {"d": rnd(hr or ref), "d_src": x["d"]["src"]} if verdict == "ours is wrong" else None
    issue(o, "d", fmt(ours, "d") + f" ({src})", fmt(ref, "d"), listing(d, "d"), cause, verdict, fix)


def check_age(o, f, g, x):
    ours, a = f.get("age"), g["age"]
    if a:
        # The median over all catalogues: robust to the one outlier that young clusters usually have.
        x["age"] = {"v": rnd(gmed(a.values())), "src": listing(a, "age") + ("" if any(k in GAIA for k in a) else " (pre-Gaia only)")}
    if not ours or not a:
        return
    counts["age"]["checked"] += 1
    own = next((k for k, v in a.items() if fx(ours / v) <= 1.06), None)  # the catalogue our value came from
    others = {k: v for k, v in a.items() if k != own}
    cons = gmed(others.values())
    if not others or fx(ours / cons) <= 2:
        counts["age"]["agree"] += 1
        return
    agreeing = {k: v for k, v in others.items() if fx(v / cons) <= 2}
    if not (len(others) >= 2 and len(agreeing) >= max(2, math.ceil(2 * len(others) / 3))):
        spread_notes.append(f"{o['id']}: age {fmt(ours, 'age')} (= {own or 'curated'}) vs {listing(others, 'age')}")
        return
    # Clear only when every other Gaia-based catalogue is also more than 2x from ours.
    og = {k: v for k, v in others.items() if k in GAIA}
    wrong = bool(og) and all(fx(v / ours) > 2 for v in og.values())
    best = {k: v for k, v in agreeing.items() if k in GAIA} or agreeing
    fix = {"age": rnd(gmed(best.values())), "age_src": ("geometric median of " if len(best) > 1 else "") + listing(best, "age")}
    near = [k for k, v in og.items() if fx(v / ours) <= 2]
    cause = (f"ours = {own}" if own else "curated value") + (" (CG20's neural-network age)" if own == "CG20" else "")
    if not wrong:
        cause += f"; {', '.join(near)} within 2x of ours"
    issue(o, "age", fmt(ours, "age"), fmt(cons, "age"), listing(a, "age"), cause, "ours is wrong" if wrong else "within literature spread", fix)


def check_size(o, f, g, x):
    size = (o.get("size") or [None])[0]
    si, so = g["size_in"], g["size_out"]
    if si:
        x["size"] = {"v": round(statistics.median(si.values()), 1), "src": ", ".join(f"{k} {w:.3g}" for k, w in si.items())
                     + ("; outer " + ", ".join(f"{k} {w:.3g}" for k, w in so.items()) if so else "")}
    if not size or not si:
        return
    counts["size"]["checked"] += 1
    cons = statistics.median(si.values())
    if fx(size / cons) <= 3:
        counts["size"]["agree"] += 1
        return
    if size > cons and o["type"] in ("cluster_nebula", "star_cloud", "asterism"):
        verdict, cause = "within literature spread", "our size is the nebula's extent, not the star cluster's (expected for a cluster with nebula)"
    elif size > cons and so and size <= max(so.values()) * 1.2:
        verdict, cause = "within literature spread", "ours is the cluster's full extent (comparable to MWSC r2 / HR23 tidal radius), larger than its core"
    elif size < cons and size >= min(si.values()) / 1.5:
        verdict, cause = "within literature spread", "ours is about the smallest catalogue core size; the Gaia catalogues trace a wider member distribution"
    else:
        verdict = "ours is wrong"
        cause = (f"ours is {cons / size:.1f}x below the catalogues' median and {min(si.values()) / size:.1f}x below the smallest (a core radius taken as a diameter?)"
                 if size < cons else "our size is far beyond every catalogue's cluster extent")
    fix = None
    if verdict == "ours is wrong":
        pick = next(((k, v) for k, v in (("DAML Diam", si.get("DAML Diam")), ("MWSC 2r1", si.get("MWSC 2r1"))) if v and fx(v / size) >= 1.5 and fx(v / cons) <= 3), ("median", cons))
        val = round(pick[1], 1) if pick[1] < 20 else round(pick[1])
        val = int(val) if val == int(val) else val
        why = {"DAML Diam": f"Dias et al. 2002 (B/ocl) apparent diameter {pick[1]:.3g}′", "MWSC 2r1": f"MWSC (J/A+A/558/A53) 2·r1 {pick[1]:.3g}′"}.get(pick[0], "median of catalogue core diameters")
        fix = {"catalog": {"size": [val], "src": why + "; others: " + ", ".join(f"{k} {w:.3g}′" for k, w in si.items() if k != pick[0])}}
    issue(o, "size", fmt(size, "size"), fmt(cons, "size"), listing(si, "size") + ("; outer " + listing(so, "size") if so else ""), cause, verdict, fix)


def check_members(o, f, g, x):
    ours, mem = f.get("members"), g["members"]
    hr = g["rows"]["HR23"]
    if hr:
        x["members"] = {"v": int(hr["N"]), "src": f"HR23 N ({hr['Name']})"}
    if not ours:
        return
    counts["members"]["checked"] += 1
    m = g["m"].get("HR23")
    if not hr:
        issue(o, "members", f"{ours:,}", "—", "no Hunt & Reffert 2023 cluster matches this object by name and position", "app matched a cross-identified row", "within literature spread")
        return
    if int(hr["N"]) != ours:
        alt = [r for r in HR23 if r["N"] == str(ours) and any(norm(n) in keys_for(o) for n in (r["AllNames"] or "").split(","))]
        cause = f"the app's count is HR23 {alt[0]['Name']} (N={ours}), a cross-identified cluster" if alt else "count not found in HR23 for this object"
        issue(o, "members", f"{ours:,}", f"{int(hr['N']):,}", f"HR23 {hr['Name']} N", cause, "ours is wrong", {"members": int(hr["N"]), "members_src": f"Hunt & Reffert 2023 (J/A+A/673/A114) {hr['Name']} N"})
        return
    if m["how"].startswith("xid") and not re.match(r"(?i)(theia|ubc|hsc|cwnu|fsr|ocsn|lisc)", hr["Name"]):
        issue(o, "members", f"{ours:,}", f"{int(hr['N']):,}", f"HR23 {hr['Name']} N", f"HR23 lists this object only as a cross-identification of {hr['Name']} (one merged membership)", "within literature spread")
        return
    # Gaia DR2 catalogues (members with p > 0.7, G < 18) usually find 1–3x fewer stars than HR23.
    dr2 = [v for k, v in mem.items() if k in ("CG20", "D21")]
    if dr2 and fx(ours / max(dr2)) > 6:
        issue(o, "members", f"{ours:,}", f"{max(dr2):,}", listing(mem, "members"), "HR23's membership is much larger than the Gaia DR2 catalogues' (deeper DR3 selection, or a wider structure around the cluster)", "within literature spread")
        return
    counts["members"]["agree"] += 1


def check_mass(o, f, g, x):
    ours = f.get("mass")
    h24 = g["rows"]["HR24"]
    tot = num(h24["MassTot"]) if h24 else None
    e = (num(h24["e_MassTot"]) or 0) if h24 else 0
    if tot:
        x["mass"] = {"v": float(f"{tot:.2g}"), "src": f"HR24 MassTot {tot:.0f}±{e:.0f}"}
    if not ours or not tot:
        return
    counts["mass"]["checked"] += 1
    if fx(ours / tot) <= 3:
        counts["mass"]["agree"] += 1
        return
    members = int(g["members"].get("HR23", 0))
    if ours < 0.3 * members:
        verdict, cause = "ours is wrong", f"impossible: under 0.3 M☉ per star for {members:,} Gaia members (Wikipedia infobox value)"
    elif fx(ours / tot) > 5 and e < 0.3 * tot:
        verdict, cause = "ours is wrong", f"Wikipedia infobox value, {fx(ours / tot):.1f}x off a well-constrained Gaia DR3 mass"
    else:
        verdict, cause = "within literature spread", f"Wikipedia infobox value {fx(ours / tot):.1f}x off HR24; cluster masses differ by method (tidal, summed members, IMF-corrected)"
    fix = {"mass": float(f"{tot:.2g}"), "mass_src": f"Hunt & Reffert 2024 (J/A+A/686/A42) {h24['Name']} MassTot {tot:.0f}±{e:.0f} M☉"}
    issue(o, "mass", fmt(ours, "mass"), fmt(tot, "mass"), f"HR24 MassTot {tot:.0f}±{e:.0f}, MassJ {num(h24['MassJ']) or 0:.0f}", cause, verdict, fix)


def check_position(o, g):
    s = simbad_of(o)
    size = (o.get("size") or [0])[0]
    tol = max(10, size / 2)
    ra, de = o["ra"] * 15, o["dec"]
    far = [(k, m["sep"]) for k, m in g["m"].items() if not k.endswith("pos") and m["sep"] > tol]
    near = [(k, m["sep"]) for k, m in g["m"].items() if not k.endswith("pos") and not m["how"].endswith("far") and m["sep"] <= tol]
    sep_s = sep_deg(ra, de, s["ra"], s["dec"]) * 60 if s and s["ra"] is not None else None
    if sep_s is None and not g["m"]:
        return
    counts["position"]["checked"] += 1
    if sep_s is None or sep_s <= tol:
        counts["position"]["agree"] += 1
        return
    here = f"{o['ra']:.4f}h {o['dec']:+.3f}°"
    there = f"{s['ra'] / 15:.4f}h {s['dec']:+.3f}°"
    also = ", ".join(f"{k} {v:.0f}′" for k, v in far)
    if s["otype"] == "err":
        issue(o, "position", here, there, "SIMBAD", f"SIMBAD {s['main']} is {sep_s:.0f}′ away but flags the object as nonexistent (otype err)" + (f"; also {also}" if also else ""), "within literature spread")
    elif len(far) >= 2 and not near:
        fix = {"catalog": {"ra": round(s["ra"] / 15, 4), "dec": round(s["dec"], 3), "pos_src": f"SIMBAD {s['main']}; {also} by name"}}
        issue(o, "position", here, there, "SIMBAD", f"SIMBAD {s['main']} is {sep_s:.0f}′ away and so are {also}", "ours is wrong", fix)
    else:
        issue(o, "position", here, there, "SIMBAD", f"SIMBAD {s['main']} ({s['otype']}) is {sep_s:.0f}′ away" + (f"; also {also}" if also else "") + (f"; {', '.join(k for k, _ in near)} agree with ours" if near else ""), "within literature spread")


# ------------------------------------------------------------------------------------------------ hand-written notes
# Identity questions that no rule settles; each was checked against the catalogue rows printed with it.
NOTES = {
    "NGC6885": "Two Gaia groups overlap here: the compact Gulliver 18 (HR23, N=248, ~5,000 ly; D21 calls it NGC 6885 at ~4,700 ly), which the app uses, and a sparse nearby group around 20 Vul (HR23 'NGC_6882', ~1,500 ly; DAML's pre-Gaia NGC 6885 at 1,900 ly). Which one NGC 6885 is depends on the author; ours follows HR23's cross-identification. Not changed.",
    "NGC6374": "Our object sits on NGC 6383 (its second designation; HR23/CG20/D21 NGC_6383 within 1′, ~3,600 ly). SIMBAD keeps a separate NGC 6374 31′ west. A naming question for the catalog, not a data error.",
    "NGC1746": "SIMBAD marks NGC 1746 as nonexistent (otype err); neither CG20 nor D21 (Gaia DR2) has it. HR23 cross-identifies it with Theia 754 (which also carries NGC 1750 and Melotte 28), and the app's 2,300 ly / 572 members are that group's; NGC 1750 itself (CG20/D21, 5′ away) is at the same distance. Consistent, if the object is read as the NGC 1750/1758 field.",
    "NGC6997": "HR23 merges NGC 6996 and NGC 6997 into one membership (558 stars, 2,800 ly); CG20 and D21 have NGC 6997 alone at the same distance. Fine.",
    "M42": "Only MWSC has NGC 1976 by name (1,500 ly). D21's Trapezium-FG group (Gaia DR2) lies 2′ from our position — see the context distance in the xcheck file; the app's 1,400 ly lies between them (within 20%).",
}


# ------------------------------------------------------------------------------------------------ run
LMC_LY, SMC_LY = 49.59e3 * LY, 62.44e3 * LY  # Pietrzyński+ 2019, Graczyk+ 2020
special = {}


def find_row(ref, name):
    return next((r for r in REFS[ref].rows if refname(r).replace(" ", "_") == name), None)


for o in OBJS:
    oid, f = o["id"], FACTS.get(o["id"], {})
    x = {}
    if oid == "C14":  # the Double Cluster = NGC 869 + NGC 884; compare with both halves
        parts = [gather(o, ["ngc 869"]), gather(o, ["ngc 884"])]
        hd = [p["d"].get("HR23") for p in parts if p["d"].get("HR23")]
        ages = [v for p in parts for k, v in p["age"].items() if k in GAIA]
        x["d"] = {"v": rnd(statistics.mean(hd)), "src": "HR23 dist50 NGC 869 " + " / NGC 884 ".join(f"{v / LY:.0f}" for v in hd) + " pc (mean)"}
        x["age"] = {"v": rnd(gmed(ages)), "src": "median of HR23/CG20/D21 ages of NGC 869 and NGC 884: " + ", ".join(f"{a / 1e6:.3g}" for a in ages) + " Myr"}
        for fld, ours, ref in (("d", f.get("d"), x["d"]["v"]), ("age", f.get("age"), x["age"]["v"])):
            counts[fld]["checked"] += 1
            if fx(ours / ref) <= (1.25 if fld == "d" else 2):
                counts[fld]["agree"] += 1
            else:
                issue(o, fld, fmt(ours, fld), fmt(ref, fld), x[fld]["src"], "combined object", "within literature spread")
        special[oid] = f"Double Cluster, compared with NGC 869 and NGC 884 separately: d {fmt(f.get('d'), 'd')} vs {x['d']['src']}; age {fmt(f.get('age'), 'age')} vs {x['age']['src']}. Agrees."
        xcheck[oid] = x
        continue
    g = gather(o)
    s = simbad_of(o)
    if not any(not m["how"].endswith("far") for k, m in g["m"].items() if not k.endswith("pos")) and s and s["ra"] is not None:
        # Every catalogue has it by name, but far from our position: compare at SIMBAD's position (the position error
        # itself is reported by check_position).
        far = [m for m in g["m"].values() if m["how"].endswith("far") and sep_deg(s["ra"], s["dec"], m["row"]["_ra"], m["row"]["_de"]) < 0.1]
        if len(far) >= 2:
            check_position(o, g)
            g = gather(dict(o, ra=s["ra"] / 15, dec=s["dec"]))
            match_notes.append(f"{oid}: every catalogue has it by name {far[0]['sep']:.0f}′ from our position, at SIMBAD's — compared there")
            o = dict(o, _moved=True)
    for k, m in g["m"].items():
        if m["how"].endswith("far"):
            match_notes.append(f"{oid}: {k} has {refname(m['row'])} by {m['how'][:-4]} but {m['sep']:.0f}′ away — not used")
        elif m["how"].endswith("-ab"):
            match_notes.append(f"{oid}: {k} splits it into A/B; nearest is {refname(m['row'])} ({m['sep']:.0f}′)")
        elif m["how"] == "xid" and k == "HR23":
            match_notes.append(f"{oid}: HR23 has it only as a cross-identification of {refname(m['row'])} ({m['sep']:.0f}′)")
    if g["ctx"]:
        match_notes.append(f"{oid}: not in " + "/".join(g["ctx"]) + " by name; nearest there: " + "; ".join(f"{k} {v}" for k, v in g["ctx"].items()) + " — context only")
    if f.get("src") in LMC:
        ld = LMC_LY if f["src"] == "lmc" else SMC_LY
        x["d"] = {"v": rnd(ld), "src": ("LMC 49.59 kpc (Pietrzyński+ 2019)" if f["src"] == "lmc" else "SMC 62.44 kpc (Graczyk+ 2020)") + "; per-cluster distances not catalogued"}
        counts["d"]["checked"] += 1
        counts["d"]["agree" if fx(f["d"] / ld) <= 1.25 else "flagged"] += 1
        check_size(o, f, g, x)
        check_position(o, g)
        if not g["m"].get("B08"):
            unverifiable.append(f"{oid}: Magellanic-Cloud cluster not found by name in Bica et al. 2008 tables 3–5; size unchecked")
        xcheck[oid] = x
        continue
    if oid == "M24":
        hd = gather(o, ["ngc 6603"])["d"]
        special[oid] = f"Star cloud, d {fmt(f.get('d'), 'd')} ({f.get('src')}): no catalogue gives a distance for a star cloud. The cluster NGC 6603, seen through it, is at {listing(hd, 'd')}; the cloud's stars lie in front of and around it, so ~10,000 ly is plausible but unverifiable here."
        unverifiable.append(f"M24: star cloud, distance {fmt(f.get('d'), 'd')} ({f.get('src')}) — no catalogue value (NGC 6603 within it: {listing(hd, 'd')})")
        x["d"] = {"v": None, "src": "no catalogue distance for the star cloud; NGC 6603 within it: " + listing(hd, "d")}
        xcheck[oid] = x
        continue
    if oid == "M73":
        dl = sorted(1000 / num(r["Plx"]) * LY for r in M73_GAIA if num(r["Plx"]))
        special[oid] = f"Asterism, d {fmt(f.get('d'), 'd')} ({f.get('src')}): Gaia DR3 parallaxes of its four stars give " + ", ".join(f"{v:,.0f}" for v in dl) + " ly — unrelated stars, no single distance. Ours lies inside the range; fine as a typical value."
        x["d"] = {"v": rnd(statistics.median(dl)), "src": "Gaia DR3 (I/355/gaiadr3) parallaxes of the four stars: " + ", ".join(f"{v:,.0f}" for v in dl) + " ly; median"}
        counts["d"]["checked"] += 1
        counts["d"]["agree" if dl[0] <= f["d"] <= dl[-1] else "flagged"] += 1
        xcheck[oid] = x
        continue
    if oid == "NGC2451":
        # Catalogues split NGC 2451 into A (the naked-eye group around c Puppis, ~190 pc) and B (a background cluster
        # found by Röser & Bastian 1994, ~360 pc). The app's figures are B's.
        A = {k: find_row(k, "NGC_2451A") for k in ("HR23", "CG20", "D21", "DAML")}
        hA, hB = A["HR23"], g["rows"]["HR23"]
        dA = {"HR23": num(hA["dist50"]) * LY, "CG20": num(A["CG20"]["DistPc"]) * LY, "D21": num(A["D21"]["Dist"]) * LY}
        aA = {"HR23": 10 ** num(hA["logAge50"]), "CG20": 10 ** num(A["CG20"]["AgeNN"]), "D21": 10 ** num(A["D21"]["logage"])}
        x["d"] = {"v": rnd(dA["HR23"]), "src": f"NGC 2451A: HR23 dist50 {num(hA['dist50']):.0f} pc; CG20 {num(A['CG20']['DistPc']):.0f}; D21 {num(A['D21']['Dist']):.0f}"}
        x["age"] = {"v": rnd(gmed(aA.values())), "src": "NGC 2451A: median of " + listing(aA, "age")}
        x["members"] = {"v": int(hA["N"]), "src": "HR23 N (NGC_2451A)"}
        for fld in ("d", "members"):
            counts[fld]["checked"] += 1
        cause = (f"the app took NGC 2451B (HR23 {hB['Name']}, {num(hB['dist50']):.0f} pc, N={hB['N']}), the richer of the two HR23 rows that share the cross-ID 'NGC_2451'. "
                 "NGC 2451B is the background cluster found in 1994; the naked-eye NGC 2451 (bright stars around c Puppis) is NGC 2451A")
        issue(o, "d", fmt(f.get("d"), "d") + " (gaia)", fmt(dA["HR23"], "d"), "NGC 2451A: " + listing(dA, "d") + f"; NGC 2451B: HR23 {fmt(num(hB['dist50']) * LY, 'd')}", cause, "ours is wrong",
              {"d": rnd(dA["HR23"]), "d_src": "Hunt & Reffert 2023 (J/A+A/673/A114) NGC_2451A dist50 " + f"{num(hA['dist50']):.0f} pc (CG20 {num(A['CG20']['DistPc']):.0f}, D21 {num(A['D21']['Dist']):.0f})",
               "age": rnd(aA["CG20"]), "age_src": f"Cantat-Gaudin et al. 2020 (J/A+A/640/A1) NGC_2451A AgeNN {num(A['CG20']['AgeNN'])} (HR23 {aA['HR23'] / 1e6:.0f} Myr, D21 {aA['D21'] / 1e6:.0f} Myr); the app has no age now"})
        issue(o, "members", f"{f.get('members'):,}", f"{int(hA['N']):,}", f"HR23 NGC_2451A N {hA['N']}, NGC_2451B N {hB['N']}", "same mix-up: B's member count", "ours is wrong",
              {"members": int(hA["N"]), "members_src": "Hunt & Reffert 2023 (J/A+A/673/A114) NGC_2451A N"})
        check_size(o, f, g, {})
        check_position(o, g)
        xcheck[oid] = x
        continue
    check_distance(o, f, g, x)
    check_age(o, f, g, x)
    check_size(o, f, g, x)
    check_members(o, f, g, x)
    check_mass(o, f, g, x)
    if not o.get("_moved"):
        check_position(o, g)
    if g["ctx"] and not f.get("d") or (g["ctx"] and f.get("src") in ("lit", "plx", "wiki")):
        x["near"] = "; ".join(f"{k} {v}" for k, v in g["ctx"].items())
    named = [k for k, m in g["m"].items() if not m["how"].endswith("far") and not k.endswith("pos")]
    if not named:
        what = "app has no values" if not f else "app has " + ", ".join(f"{k}={v}" for k, v in f.items())
        unverifiable.append(f"{oid}: in no catalogue by name ({what})" + (f"; nearby: {x['near']}" if x.get("near") else ""))
    elif not f.get("d"):
        unverifiable.append(f"{oid}: app has no distance; references: " + (listing(g["d"], "d") or "none") + (f"; SIMBAD otype {s['otype']}" if s else ""))
    if x:
        xcheck[oid] = x

# ------------------------------------------------------------------------------------------------ outputs
os.makedirs(os.path.join(REPO, "shared/data/xcheck"), exist_ok=True)
xpath = os.path.join(REPO, "shared/data/xcheck/open-clusters.json")
XNOTES = {
    "d": "light-years; first Gaia catalogue that has the cluster (HR23 > CG20 > D21), others' pc values listed",
    "age": "years; v = geometric median of all catalogue ages listed",
    "size": "arcmin; v = median of catalogue core diameters (2·r50 of HR23/CG20/D21, 2·r1 MWSC, DAML Diam, B08 major axis); 'outer' = MWSC 2·r2, HR23 2·rt",
    "members": "Gaia DR3 member count of the matched HR23 cluster",
    "mass": "solar masses, HR24 total observed mass",
    "near": "catalogued cluster near an object that the catalogue lacks by name (context only)",
}
json.dump({"_sources": SOURCES, "_fields": XNOTES, **xcheck}, open(xpath, "w"), ensure_ascii=False, separators=(",", ":"))
cpath = os.path.join(ROOT, "open-clusters-corrections.json")
json.dump(dict(sorted(corrections.items())), open(cpath, "w"), ensure_ascii=False, indent=1)

wrong = [i for i in issues if i["verdict"] == "ours is wrong"]
L = ["# Open clusters: cross-check against independent catalogues\n",
     f"Generated by `scripts/crosscheck/open-clusters.py` — re-runnable from `.local/crosscheck-cache/oc-*.csv` (`--offline` uses only the cache). "
     f"Scope: the {len(OBJS)} catalog objects of type open_cluster, cluster_nebula, asterism and star_cloud; their facts (d, age, members, mass) "
     "and catalog visual size. Reference values per object: `shared/data/xcheck/open-clusters.json`; proposed fixes: `open-clusters-corrections.json`.\n",
     "Sources (open, via VizieR TAP / SIMBAD TAP; no Wikipedia):\n"]
L += [f"- **{k}** — {v}" for k, v in SOURCES.items()]
L += ["",
      "Matching: by name (NGC/IC/Melotte/Collinder/Harvard…, normalised; plus SIMBAD's identifiers for each object, and HR23's own "
      "cross-identification lists), checked against position (within the object's diameter or 15′, or 3x the reference's r50). "
      "Name matches farther away are reported, not used. Catalogues that split a cluster (NGC 2451A/B) are matched to the nearer part.",
      "",
      "Rules: **distance** flagged when >25% from the median of the Gaia catalogues (HR23, CG20, D21); called wrong when those agree with "
      "each other (spread ≤25%). **Age** flagged when >2x from the median of the other catalogues *and* those agree (≥2/3 within 2x of their median); "
      "called wrong only when every other Gaia-based catalogue is also >2x from ours. **Visual size** flagged when >3x from the median of "
      "catalogue core diameters (2·r50 of HR23/CG20/D21, 2·r1 of MWSC, DAML's apparent diameter, B08's major axis); called wrong when it is also "
      "<2/3 of the smallest of them. **Members** flagged when the app's count is not the matched HR23 cluster's N, or HR23 and the Gaia DR2 "
      "catalogues differ >6x. **Mass** (app value from Wikipedia infoboxes) flagged when >3x from HR24 MassTot; wrong when physically impossible "
      "(<0.3 M☉ per Gaia member) or >5x off a mass known to ±30%. **Position** flagged when SIMBAD is farther than max(10′, half the size).",
      "", "## Counts\n", "| field | checked | agree | flagged | ours is wrong |", "|---|---:|---:|---:|---:|"]
for k in FIELDS:
    c = counts[k]
    L.append(f"| {k} | {c['checked']} | {c['agree']} | {c['flagged']} | {c['wrong']} |")
L.append(f"\n{len(wrong)} clear errors in {len(corrections)} objects.\n")
for title, sel in (("Clear errors (ours is wrong) — fixes in open-clusters-corrections.json", lambda i: i["verdict"] == "ours is wrong"),
                   ("Flagged, but within the literature spread (no change proposed)", lambda i: i["verdict"] != "ours is wrong")):
    L += [f"## {title}\n"]
    for fld in FIELDS:
        rows = [i for i in issues if sel(i) and i["field"] == fld]
        if not rows:
            continue
        L += [f"### {fld} ({len(rows)})\n", "| id | ours | reference | catalogue values | likely cause |", "|---|---|---|---|---|"]
        L += [f"| {i['id']} | {i['ours']} | {i['ref']} | {i['refsrc']} | {i['cause']} |" for i in rows]
        L.append("")
L += ["## Ages >2x off where the catalogues disagree among themselves (not flagged)\n"]
L += [f"- {s}" for s in spread_notes] or ["- none"]
L += ["\n## Special objects\n"] + [f"- **{k}** — {v}" for k, v in special.items()]
L += ["\n## Identity notes\n"] + [f"- **{k}** — {v}" for k, v in NOTES.items()]
L += ["\n## Matching notes\n"] + ([f"- {s}" for s in match_notes] or ["- none"])
L += ["\n## Unmatched / unverifiable\n"] + ([f"- {s}" for s in unverifiable] or ["- none"])
open(os.path.join(ROOT, "open-clusters-report.md"), "w").write("\n".join(L) + "\n")
print(f"xcheck {os.path.getsize(xpath) / 1024:.0f} KB, {len(xcheck)} ids; issues {len(issues)} ({len(wrong)} wrong); corrections {len(corrections)}", file=sys.stderr)
for k in FIELDS:
    print(k, counts[k], file=sys.stderr)
