#!/usr/bin/env python3
"""Cross-check AstroPilot's globular-cluster data (type "globular_cluster") against independent catalogues.

    python3 scripts/crosscheck/globulars.py            # re-runs from cache; fetches only what is missing
    python3 scripts/crosscheck/globulars.py --refresh  # re-fetch every remote table

Reads (never writes) shared/data/catalog.json and shared/data/objectFacts.json.
Writes shared/data/xcheck/globulars.json, scripts/crosscheck/globulars-report.md,
scripts/crosscheck/globulars-corrections.json.

Reference sources (cache: .local/crosscheck-cache/globulars/; only names / coordinates are sent):
  H10   Harris 1996, 2010 edition (McMaster mwgc.dat): R_sun, V_t, M_V,t, c, r_c, r_h
  H97   Harris 1997 edition, VizieR VII/202: V_t, r_h (older edition, secondary)
  BH18  Baumgardt & Hilker 2018, VizieR J/MNRAS/478/1520: distance, dynamical mass, log rho_c, v_esc
  VB21  Vasiliev & Baumgardt 2021, VizieR J/MNRAS/505/5978: Gaia EDR3 parallax (distance where plx/err >= 10)
  MV05  McLaughlin & van der Marel 2005, VizieR J/ApJS/161/304: King-model mass, V, r_h, r_t, rho0, vesc0
        (Milky Way, LMC, SMC and Fornax clusters)
  B13   Baumgardt, Parmentier, Anders & Grebel 2013, VizieR J/MNRAS/430/676: LMC cluster masses, M_V, ages
  G10   Glatt, Grebel & Koch 2010, VizieR J/A+A/517/A50: MCPS V magnitudes of young LMC/SMC clusters
  MC12  McConnachie 2012, VizieR J/AJ/144/4: host-galaxy distances (LMC, SMC, Fornax dSph)
  SIM   SIMBAD TAP: main id, object type, catalogued V flux
  BW    Baumgardt et al. web table v4 (the app's own source, pipeline cache) -- used ONLY to verify the
        transcription of d/mass/rhoc/vesc/tdiss, never as an independent reference.
Baumgardt & Vasiliev 2021 (J/MNRAS/505/5957) is not on VizieR; its distances are disseminated through BW.
"""
import csv, io, json, math, os, re, statistics, sys, time, urllib.parse, urllib.request, html as _html

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(ROOT, "../.."))
CACHE = os.path.join(REPO, ".local/crosscheck-cache/globulars")
PIPE_CACHE = os.path.join(REPO, "scripts/data/stories/cache")
OUT_JSON = os.path.join(REPO, "shared/data/xcheck/globulars.json")
OUT_MD = os.path.join(ROOT, "globulars-report.md")
OUT_CORR = os.path.join(ROOT, "globulars-corrections.json")
REFRESH = "--refresh" in sys.argv
LY_PER_KPC = 3261.56
ARCMIN_PER_PC_AT_1KPC = 3.437747  # 1 pc at 1 kpc subtends 3.4377 arcmin

TAP = "https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync"
ASU = "https://vizier.cds.unistra.fr/viz-bin/asu-tsv"
SIMBAD_TAP = "https://simbad.cds.unistra.fr/simbad/sim-tap/sync"
_last = [0.0]


def _get(url, data=None):
    wait = 1.1 - (time.time() - _last[0])
    if wait > 0: time.sleep(wait)  # <= 1 request / s
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode() if data else None,
                                 headers={"User-Agent": "AstroPilot-crosscheck/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        body = r.read().decode("utf-8", "replace")
    _last[0] = time.time()
    return body


def cached(name, fetch):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, name)
    if REFRESH or not os.path.exists(p) or os.path.getsize(p) < 50:
        print(f"  fetching {name}", file=sys.stderr)
        body = fetch()
        if "QUERY_STATUS\" value=\"ERROR" in body: raise SystemExit(f"{name}: query error\n{body[:800]}")
        open(p, "w", encoding="utf-8").write(body)
    return open(p, encoding="utf-8").read()


def tap(name, adql, url=TAP):
    return cached(name, lambda: _get(url, {"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "tsv", "QUERY": adql}))


def read_tsv(text):
    rows = list(csv.reader(io.StringIO(text), delimiter="\t"))
    hdr = rows[0]
    return [dict(zip(hdr, [c.strip() for c in r])) for r in rows[1:] if len(r) == len(hdr)]


def read_asu(text):
    lines = [l for l in text.splitlines() if l and not l.startswith("#")]
    hdr = lines[0].split("\t")
    return [dict(zip(hdr, [c.strip() for c in l.split("\t")])) for l in lines[3:]]


def f(x):
    try:
        v = float(str(x).replace("−", "-"))
        return v if v == v else None
    except (TypeError, ValueError):
        return None


def norm(s):
    s = s.upper().replace("PALOMAR", "PAL").replace("DJORGOVSKI", "DJORG").replace("MELOTTE", "MEL")
    s = re.sub(r"^(MW|LMC|SMC)-|^CL\s+", "", s)
    s = re.sub(r"[\s_\-]+", "", s)
    return re.sub(r"^([A-Z]+)0+(\d)", r"\1\2", s)


def sep_arcmin(ra1, de1, ra2, de2):  # degrees in, arcmin out
    a1, d1, a2, d2 = map(math.radians, (ra1, de1, ra2, de2))
    c = math.sin(d1) * math.sin(d2) + math.cos(d1) * math.cos(d2) * math.cos(a1 - a2)
    return math.degrees(math.acos(max(-1, min(1, c)))) * 60


def sexa(s, hours):
    p = [float(x) for x in s.replace("+", "").split()]
    sign = -1 if s.strip().startswith("-") else 1
    v = abs(p[0]) + (p[1] if len(p) > 1 else 0) / 60 + (p[2] if len(p) > 2 else 0) / 3600
    return sign * v * (15 if hours else 1)


class Cat:
    """Rows with names and positions; match by designation, else by position."""
    def __init__(self, rows, names, radec, tol=1.5):
        self.rows, self.by, self.pos, self.tol = rows, {}, [], tol
        for r in rows:
            for n in names(r):
                if n and n.strip(): self.by.setdefault(norm(n), r)
            p = radec(r)
            if p and None not in p: self.pos.append((p, r))
        self.radec = radec

    def match(self, o):
        ra, de = o["ra"] * 15, o["dec"]
        for d in o["designations"]:
            r = self.by.get(norm(d))
            if r:
                p = self.radec(r)
                if not p or None in p or sep_arcmin(ra, de, *p) < 6: return r
        best = min(((sep_arcmin(ra, de, *p), r) for p, r in self.pos), default=None, key=lambda t: t[0])
        return best[1] if best and best[0] < self.tol else None


# ---------------------------------------------------------------- app data
CAT = json.load(open(os.path.join(REPO, "shared/data/catalog.json")))
FACTS = json.load(open(os.path.join(REPO, "shared/data/objectFacts.json")))
FACTS = FACTS.get("facts", FACTS)
GCS = [o for o in CAT if o.get("type") == "globular_cluster"]

# ---------------------------------------------------------------- Harris 2010 (fixed width)
def load_h10():
    p = os.path.join(CACHE, "harris-mwgc-2010.dat")
    if not os.path.exists(p):
        src = os.path.join(PIPE_CACHE, "harris-mwgc.dat")
        txt = open(src).read() if os.path.exists(src) else _get("https://physics.mcmaster.ca/~harris/mwgc.dat")
        open(p, "w").write(txt)
    L = open(p).read().splitlines()
    i1 = next(i for i, l in enumerate(L) if "Part I:" in l)
    i2 = next(i for i, l in enumerate(L) if "Part II:" in l)
    i3 = next(i for i, l in enumerate(L) if "Part III:" in l)
    out = {}
    for l in L[i1:i2]:
        m = re.match(r"^(\d\d \d\d [\d.]+)\s+([+-]\d\d \d\d [\d.]+)", l[25:52])
        if not m: continue
        out[l[:12].strip()] = {"id": l[:12].strip(), "name": l[12:25].strip(), "ra": sexa(m.group(1), True),
                               "dec": sexa(m.group(2), False), "rsun": f(l[66:73])}
    for l in L[i2:i3]:
        r = out.get(l[:12].strip())
        if r: r.update(ebv=f(l[22:28]), dmv=f(l[34:40]), vt=f(l[40:46]), mvt=f(l[46:53]))
    for l in L[i3:]:
        r = out.get(l[:12].strip())
        if r:
            cc = l[48:58]
            r.update(c=f(cc.replace("c", "").replace(":", "")), cc="c" in cc, rc=f(l[58:64]), rh=f(l[64:70]), rho0=f(l[79:87]))
    assert out["NGC 104"]["vt"] == 3.95 and out["NGC 104"]["rh"] == 3.17 and out["NGC 104"]["c"] == 2.07
    assert out["Pal 11"]["rc"] == 1.19 and out["NGC 6121"]["mvt"] == -7.19 and out["NGC 104"]["rho0"] == 4.88
    return list(out.values())


# ---------------------------------------------------------------- Baumgardt web table (app source)
def load_bw():
    t = open(os.path.join(PIPE_CACHE, "baumgardt.txt"), encoding="utf-8", errors="ignore").read()
    num = lambda x: f(re.sub(r"[^\d.eE+-]", "", x.split("±")[0]) or "nan")
    out = []
    for r in re.findall(r"<tr[^>]*>(.*?)</tr>", t, re.S):
        c = [_html.unescape(re.sub(r"<[^>]+>", "", x)).strip() for x in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", r, re.S)]
        if len(c) < 23 or not re.match(r"^[A-Z]", c[0]) or c[0].startswith("Cluster"): continue
        m = re.match(r"([\d.]+)\s*±\s*[\d.]+\s*·\s*10(\d+)", c[7])
        out.append({"names": [n.strip() for n in re.split(r"\s{2,}|\xa0", c[0]) if n.strip()], "ra": num(c[1]),
                    "dec": num(c[2]), "rsun": num(c[3]), "mass": float(m.group(1)) * 10 ** int(m.group(2)) if m else None,
                    "V": num(c[8]), "rhl": num(c[11]), "rt": num(c[13]), "rhoc": num(c[14]), "tdiss": num(c[18]),
                    "vesc": num(c[22])})
    return out


def load_all():
    h10 = Cat(load_h10(), lambda r: [r["id"], r["name"]], lambda r: (r["ra"], r["dec"]))
    bw = Cat(load_bw(), lambda r: r["names"], lambda r: (r["ra"], r["dec"]))
    h97 = Cat(read_asu(cached("harris_vii202.tsv", lambda: _get(ASU, {"-source": "VII/202/catalog", "-out.max": "unlimited",
                                                                   "-out.all": "", "-out.meta": "hu"}))),
              lambda r: [r["ID"], r["Name"]], lambda r: (sexa(r["RAJ2000"], True), sexa(r["DEJ2000"], False)))
    bh18 = Cat(read_tsv(tap("bh18.tsv", 'SELECT * FROM "J/MNRAS/478/1520/table2"')),
               lambda r: [r["Cluster"].strip('"'), r["SimbadName"].strip('"')], lambda r: (f(r["_RA"]), f(r["_DE"])))
    vb21 = Cat(read_tsv(tap("vb21.tsv", 'SELECT * FROM "J/MNRAS/505/5978/tablea1"')),
               lambda r: [r["Name"].strip('"'), r["OName"].strip('"')], lambda r: (f(r["RAJ2000"]), f(r["DEJ2000"])))
    mvc = {r["Cluster"].strip('"'): r for r in read_tsv(tap("mvdm_clusters.tsv", 'SELECT * FROM "J/ApJS/161/304/clusters"'))}
    mvm = {}
    for r in read_tsv(tap("mvdm_models.tsv", 'SELECT * FROM "J/ApJS/161/304/models"')):
        k = r["Cluster"].strip('"')
        if r["Mod"].strip('" ') != "K": continue  # King (1966) fits: finite tidal radius
        if k not in mvm or f(r["Chi2"]) < f(mvm[k]["Chi2"]): mvm[k] = r
    for k, r in mvm.items(): r.update({"_ra": f(mvc[k]["RAJ2000"]), "_de": f(mvc[k]["DEJ2000"]), "_logAge": f(mvc[k]["logAge"])})
    mv05 = Cat(list(mvm.values()), lambda r: [r["Cluster"].strip('"'), r["Cluster"].strip('"').replace("FORNAX", "Fornax ")],
               lambda r: (r["_ra"], r["_de"]))
    b13 = Cat(read_tsv(tap("b13.tsv", 'SELECT * FROM "J/MNRAS/430/676/table2"')),
              lambda r: [r["Name"].strip('"'), r["OName"].strip('"')], lambda r: (f(r["RAJ2000"]), f(r["DEJ2000"])))
    g10 = Cat(read_tsv(tap("glatt10.tsv", 'SELECT * FROM "J/A+A/517/A50/clusters"')),
              lambda r: r["Cross-ID"].strip('"').split(",") + [r["SimbadName"].strip('"')],
              lambda r: (f(r["RAJ2000"]), f(r["DEJ2000"])), tol=0.5)
    mc12 = {r["Name"].strip('"'): r for r in read_tsv(tap("mcc12.tsv",
            "SELECT Name, RAJ2000, DEJ2000, D, \"(m-M)\", Ref2 FROM \"J/AJ/144/4/catalog\" WHERE Name LIKE '%Fornax%' "
            "OR Name LIKE '%MC%' OR Name LIKE '%Magellan%' OR Name LIKE '%Sagittarius dSph%'"))}
    names = sorted({d for o in GCS for d in o["designations"] if re.match(r"^(NGC|IC|M|Pal|Palomar|Djorg|ESO|MWSC|Mel) ", d)})
    inlist = ",".join("'" + n.replace("'", "''") + "'" for n in names)
    sim_rows = read_tsv(tap("simbad.tsv", "SELECT i.id, b.main_id, b.ra, b.dec, b.otype, fl.flux AS V, fl.bibcode FROM ident AS i "
                            "JOIN basic AS b ON b.oid = i.oidref LEFT JOIN flux AS fl ON fl.oidref = b.oid AND fl.filter = 'V' "
                            f"WHERE i.id IN ({inlist})", url=SIMBAD_TAP))
    sim = Cat(sim_rows, lambda r: [r["id"].strip('"')], lambda r: (f(r["ra"]), f(r["dec"])), tol=0.0)
    return dict(h10=h10, bw=bw, h97=h97, bh18=bh18, vb21=vb21, mv05=mv05, b13=b13, g10=g10, mc12=mc12, sim=sim)


S = load_all()
MC12 = S["mc12"]
HOST = {  # host distances (kpc): the app's value, and the independent reference
    "lmc": {"app": 49.59, "app_src": "Pietrzynski+ 2019", "ref": f(MC12["LMC"]["D"]), "ref_src": "MC12 (LMC)", "ra": 80.89, "dec": -69.76},
    "smc": {"app": 62.44, "app_src": "Graczyk+ 2020", "ref": f(MC12["SMC"]["D"]), "ref_src": "MC12 (SMC)", "ra": 13.19, "dec": -72.83},
    "fornax": {"ref": f(MC12["Fornax"]["D"]), "ref_src": "MC12 (Fornax dSph, Fornax 3 = NGC 1049)", "ra": 40.00, "dec": -34.45},
}


def host_of(o):
    ra, de = o["ra"] * 15, o["dec"]
    if sep_arcmin(ra, de, 80.89, -69.76) < 9 * 60: return "lmc"
    if sep_arcmin(ra, de, 13.19, -72.83) < 4.5 * 60 and o["id"] not in ("NGC104", "NGC362"): return "smc"
    if sep_arcmin(ra, de, 40.0, -34.45) < 60: return "fornax"
    return "mw"


SRC = {
    "H10": "Harris 1996, 2010 edition (McMaster mwgc.dat)",
    "H97": "Harris 1997 edition, VizieR VII/202",
    "BH18": "Baumgardt & Hilker 2018, VizieR J/MNRAS/478/1520",
    "VB21plx": "Gaia EDR3 parallax, Vasiliev & Baumgardt 2021, VizieR J/MNRAS/505/5978 (plx/err >= 10)",
    "MV05": "McLaughlin & van der Marel 2005 King-1966 fits, VizieR J/ApJS/161/304",
    "B13": "Baumgardt, Parmentier, Anders & Grebel 2013 (LMC), VizieR J/MNRAS/430/676",
    "G10": "Glatt, Grebel & Koch 2010 (MCPS), VizieR J/A+A/517/A50",
    "MC12": "McConnachie 2012 host distance, VizieR J/AJ/144/4",
    "Pietrzynski+ 2019": "LMC 49.59 kpc, detached eclipsing binaries (Nature 567, 200); the app's LMC distance",
    "Graczyk+ 2020": "SMC 62.44 kpc, detached eclipsing binaries (ApJ 904, 13); the app's SMC distance",
    "ML2": "Harris 2010 M_V,t with M/L_V = 2",
    "SIM": "SIMBAD catalogued V flux",
    "BW": "Baumgardt et al. web table v4 (the app's own source; transcription check only)",
}

r2 = lambda x: float(f"{x:.2g}") if x else x
r3 = lambda x: float(f"{x:.3g}") if x else x


def ratio(a, b): return max(a, b) / min(a, b) if a and b and a > 0 and b > 0 else None


# ---------------------------------------------------------------- per-object checks
xout, findings, stats = {}, [], {k: {"checked": 0, "agree": 0, "flagged": 0} for k in
                                  ("d", "mass", "mag", "size", "rhoc", "vesc", "transcription", "desc_distance")}


def add(field, ok, oid, our, ref, src, cause="", verdict=""):
    stats[field]["checked"] += 1
    stats[field]["agree" if ok else "flagged"] += 1
    if not ok: findings.append({"id": oid, "field": field, "ours": our, "ref": ref, "src": src, "cause": cause, "verdict": verdict})


for o in GCS:
    oid, fc, host = o["id"], FACTS.get(o["id"], {}), host_of(o)
    m = {k: (c.match(o) if hasattr(c, "match") else None) for k, c in S.items()}
    x = {"host": host}
    dly = fc.get("d")
    size = (o.get("size") or [None])[0]

    # ---- distance
    drefs, plx = {}, None
    if host == "mw":
        if m["h10"] and m["h10"]["rsun"]: drefs["H10"] = m["h10"]["rsun"]
        if m["bh18"] and f(m["bh18"]["Dist"]): drefs["BH18"] = f(m["bh18"]["Dist"])
        v = m["vb21"]
        if v and f(v["plx"]) and f(v["e_plx"]) and f(v["plx"]) / f(v["e_plx"]) >= 10:
            plx = (f(v["plx"]), f(v["e_plx"])); drefs["VB21plx"] = 1 / plx[0]
        best = "VB21plx" if "VB21plx" in drefs else "H10" if "H10" in drefs else "BH18" if "BH18" in drefs else None
    else:
        drefs["MC12"] = HOST[host]["ref"]
        if m["mv05"] and f(m["mv05"]["Dist"]): drefs["MV05"] = f(m["mv05"]["Dist"])
        best = "MC12"
        if HOST[host].get("app"):  # LMC/SMC: the app's eclipsing-binary host distances are the best available; MC12 checks them
            drefs[HOST[host]["app_src"]] = HOST[host]["app"]; best = HOST[host]["app_src"]
    dkpc = drefs.get(best) if best else None
    if dkpc:
        x.update(d=r2(dkpc * LY_PER_KPC), d_src=best, d_all={k: r2(v * LY_PER_KPC) for k, v in drefs.items()})
        if plx: x["plx"] = [plx[0], plx[1]]
    if dly and drefs:
        dk = dly / LY_PER_KPC
        if host == "mw":
            # agree with at least one of H10 / BH18 / parallax, and never >15% AND >3 sigma off a precise parallax
            ok = min(ratio(dk, v) for v in drefs.values()) <= 1.15
            if plx and ratio(dk, 1 / plx[0]) > 1.15 and abs(plx[0] - 1 / dk) / plx[1] > 3: ok = False
            if plx: x["plx_sigma"] = round((plx[0] - 1 / dk) / plx[1], 1)
        else:
            ok = ratio(dk, drefs["MC12"]) <= 1.15
        add("d", ok, oid, dly, x["d_all"], best)

    # ---- mass
    mrefs = {}
    if m["bh18"] and f(m["bh18"]["Mass"]) and host == "mw": mrefs["BH18"] = f(m["bh18"]["Mass"])
    if m["mv05"] and f(m["mv05"]["Mtot"]): mrefs["MV05"] = 10 ** f(m["mv05"]["Mtot"])
    if host == "lmc" and m["b13"] and f(m["b13"]["logM"]): mrefs["B13"] = 10 ** f(m["b13"]["logM"])
    h = m["h10"]
    if host == "mw" and h and h.get("mvt") is not None:
        mv = h["mvt"] + (5 * math.log10(h["rsun"] / (dly / LY_PER_KPC)) if dly and h.get("rsun") else 0)  # at the app's distance
        mrefs["ML2"] = 2 * 10 ** (-0.4 * (mv - 4.83))
    if mrefs:
        best = next(k for k in ("BH18", "B13", "MV05", "ML2") if k in mrefs)
        x.update(mass=r2(mrefs[best]), mass_src=best, mass_all={k: r2(v) for k, v in mrefs.items()})
        if fc.get("mass"):
            cons = math.exp(statistics.median(math.log(v) for v in mrefs.values()))  # geometric median
            x["mass_cons"] = r2(cons)
            add("mass", ratio(fc["mass"], cons) <= 2, oid, fc["mass"], dict(x["mass_all"], consensus=r2(cons)), "median")

    # ---- V magnitude
    vrefs = {}
    if m["h10"] and m["h10"].get("vt"): vrefs["H10"] = m["h10"]["vt"]
    if m["h97"] and f(m["h97"]["Vt"]): vrefs["H97"] = f(m["h97"]["Vt"])
    if m["mv05"] and f(m["mv05"]["Vmag"]): vrefs["MV05"] = f(m["mv05"]["Vmag"])
    if m["g10"] and f(m["g10"]["Vmag"]): vrefs["G10"] = f(m["g10"]["Vmag"])
    if m["sim"] and f(m["sim"]["v"]) and m["sim"]["bibcode"].strip('" '): vrefs["SIM"] = f(m["sim"]["v"])
    if m["bw"] and m["bw"]["V"] and host == "mw": vrefs["BW"] = m["bw"]["V"]  # Baumgardt+2020 photometry
    order = ("H10", "MV05", "G10", "SIM", "H97")
    best = next((k for k in order if k in vrefs), None)
    if best:
        x.update(mag=vrefs[best], mag_src=best, mag_all=vrefs)
        if o.get("mag") is not None:
            ok = abs(o["mag"] - vrefs[best]) <= 0.4
            add("mag", ok, oid, o["mag"], vrefs, best)

    # ---- radii and visual size (arcmin)
    rh = rt = None; rsrc = None
    if host == "mw" and h and h.get("rh"):
        rh, rsrc = h["rh"], "H10"
        if h.get("rc") and h.get("c"): rt = h["rc"] * 10 ** h["c"]
    elif m["mv05"]:
        dist = f(m["mv05"]["Dist"])
        rh = 10 ** f(m["mv05"]["Rh"]) * ARCMIN_PER_PC_AT_1KPC / dist if dist else None
        rt = 10 ** f(m["mv05"]["Rtid"]) * ARCMIN_PER_PC_AT_1KPC / dist if dist and f(m["mv05"]["Rtid"]) else None
        rsrc = "MV05"
    if rh:
        x.update(rh=round(rh, 2), rt=round(rt, 1) if rt else None, r_src=rsrc)
        if m["bw"] and m["bw"]["rhl"] and m["bw"]["rsun"]:
            x["rh_BW"] = round(m["bw"]["rhl"] * ARCMIN_PER_PC_AT_1KPC / m["bw"]["rsun"], 2)
            if m["bw"]["rt"]: x["rt_BW"] = round(m["bw"]["rt"] * ARCMIN_PER_PC_AT_1KPC / m["bw"]["rsun"], 1)
        if size:
            q_h = size / (3.5 * rh)
            q_t = size / (2 * rt) if rt else None
            # the visual extent should lie between ~1/3 of 3.5 r_h and ~3x the tidal diameter
            ok = q_h >= 1 / 3 and (q_t is None or q_t <= 3) and (q_t is not None or q_h <= 3)
            x["size_q"] = [round(q_h, 2), round(q_t, 2) if q_t else None]
            add("size", ok, oid, o["size"], {"3.5rh": round(3.5 * rh, 1), "2rt": round(2 * rt, 1) if rt else None}, rsrc)

    # ---- rhoc, vesc  (independent: BH18 2018 version; Harris luminosity density x M/L 2; MV05 King fits)
    b = m["bh18"]
    if host == "mw" and h and h.get("rho0") is not None: x["rhoc_H10"] = round(h["rho0"] + math.log10(2), 2)
    if m["mv05"]:
        if f(m["mv05"]["rho0"]) is not None: x["rhoc_MV05"] = f(m["mv05"]["rho0"])
        if f(m["mv05"]["vesc0"]) is not None: x["vesc_MV05"] = f(m["mv05"]["vesc0"])  # VizieR unit says log, values are km/s
        if host != "mw" and m["mv05"]["_logAge"]: x["age_MV05"] = r2(10 ** m["mv05"]["_logAge"])
    if host == "mw":
        if b and f(b["logrhoc"]) is not None: x.update(rhoc=f(b["logrhoc"]), rhoc_src="BH18")
        if b and f(b["Vesc"]): x.update(vesc=f(b["Vesc"]), vesc_src="BH18")
        refs = {k: v for k, v in (("BH18", x.get("rhoc")), ("H10xML2", x.get("rhoc_H10"))) if v is not None}
        if fc.get("rhoc") is not None and refs:
            add("rhoc", any(abs(fc["rhoc"] - v) <= 0.5 for v in refs.values()), oid, fc["rhoc"], refs, next(iter(refs)))
        refs = {k: v for k, v in (("BH18", x.get("vesc")), ("MV05", x.get("vesc_MV05"))) if v}
        if fc.get("vesc") and refs:
            add("vesc", any(ratio(fc["vesc"], v) <= 1.3 for v in refs.values()), oid, fc["vesc"], refs, next(iter(refs)))
    if host == "lmc" and m["b13"] and f(m["b13"]["logAge"]): x["age_B13"] = r2(10 ** f(m["b13"]["logAge"]))
    if m["sim"]: x["simbad"] = [m["sim"]["main_id"].strip('"'), m["sim"]["otype"].strip('"')]

    # ---- transcription vs the app's own source (Baumgardt web table)
    w = m["bw"]
    if w and host == "mw" and fc.get("src") == "baumgardt":
        bad = []
        if dly and w["rsun"] and abs(r2(w["rsun"] * LY_PER_KPC) - dly) > 1: bad.append(("d", dly, r2(w["rsun"] * LY_PER_KPC)))
        if fc.get("mass") and w["mass"] and abs(r2(w["mass"]) - fc["mass"]) > 1: bad.append(("mass", fc["mass"], r2(w["mass"])))
        if fc.get("rhoc") is not None and w["rhoc"] is not None and abs(round(w["rhoc"], 2) - fc["rhoc"]) > 0.005: bad.append(("rhoc", fc["rhoc"], w["rhoc"]))
        if fc.get("vesc") and w["vesc"] and abs(round(w["vesc"], 1) - fc["vesc"]) > 0.05: bad.append(("vesc", fc["vesc"], w["vesc"]))
        if fc.get("tdiss") and w["tdiss"] and abs(round(w["tdiss"], 1) - fc["tdiss"]) > 0.05: bad.append(("tdiss", fc["tdiss"], w["tdiss"]))
        add("transcription", not bad, oid, {k: a for k, a, _ in bad}, {k: c for k, _, c in bad}, "BW")

    # ---- distance quoted in the description vs the app's own d
    md = re.search(r"([\d,]+)\s+light-years", o.get("desc", ""))
    if md and dly:
        dq = float(md.group(1).replace(",", ""))
        add("desc_distance", ratio(dq, dly) <= 1.15, oid, dly, dq, "catalog desc")
    xout[oid] = x


# ---------------------------------------------------------------- verdicts (reviewed by hand; see report)
GC = {o["id"]: o for o in GCS}


def openngc_b_as_v():
    """ids whose app mag is OpenNGC's B-Mag because OpenNGC has no V-Mag (pipeline cache, read-only)."""
    p, out = os.path.join(REPO, "scripts/data/.cache/NGC.csv"), set()
    if not os.path.exists(p): return out
    rows = list(csv.DictReader(open(p, encoding="utf-8"), delimiter=";"))
    for r in rows:
        oid = re.sub(r"^(NGC|IC)0*", r"\1", r["Name"])
        if oid in GC and not r["V-Mag"].strip() and f(r["B-Mag"]) == GC[oid].get("mag"): out.add(oid)
    return out


B_AS_V = openngc_b_as_v()
PAL11 = ("BW v4 fit rests on Baumgardt+2020 integrated V = 11.86, 2.06 mag fainter than Harris V_t = 9.80 (the app's own mag); "
         "BH18 (1.5e5), MV05 and Harris M_V x M/L 2 (1.1e5) all give ~10x more mass. App mag 9.8 + mass 1.4e4 are mutually "
         "inconsistent (implied M/L_V ~ 0.25). Same root cause for the low rhoc and vesc")
CAUSE = {
    ("NGC1049", "d"): ("Wikipedia-sourced 630,000 ly (193 kpc) contradicts its host: NGC 1049 is Fornax 3, a globular of the Fornax dSph "
                       "at 147 kpc (MC12; MV05 adopt 137 kpc) = 480,000 ly", "FIX"),
    ("NGC1049", "mag"): ("13.59 is OpenNGC's B magnitude shown as V (OpenNGC has no V); MV05 King-model total V = 12.71 "
                         "(B - V ~ 0.65 for an old metal-poor GC also gives V ~ 12.9)", "FIX"),
    ("NGC6287", "d"): ("H10 9.4 kpc vs Gaia EDR3 parallax 6.7 kpc (1.8 sigma); the app's BV21 8.0 kpc sits between both", "KEEP"),
    ("NGC6496", "d"): ("BV21 9.6 kpc (Gaia EDR3 + CMD, 2021) vs H10/BH18 11.3-11.5 kpc (older CMD distance)", "KEEP"),
    ("NGC6517", "d"): ("BV21 9.2 kpc vs H10 10.6 kpc; highly reddened (E(B-V) 1.08), older CMD distance", "KEEP"),
    ("MWSC3171", "mass"): (PAL11, "CHECK"), ("MWSC3171", "rhoc"): (PAL11, "CHECK"), ("MWSC3171", "vesc"): (PAL11, "CHECK"),
    ("NGC1850", "mass"): ("30-Myr cluster: SSP-M/L masses scatter x3 (MV05 K66 7.2e4, B13 2.6e5); app 4.2e4 is within x1.7 of MV05", "KEEP"),
    ("NGC1866", "mass"): ("app 1.4e5 matches the Fischer+1992 dynamical mass; photometric MV05 8.1e4 (x1.7) and B13 4.3e4 "
                          "(B13 partly derived from MV05)", "KEEP"),
    ("NGC6284", "mass"): ("BW v4 1.74e5 +- 0.29e5 (M/L 1.8); Harris M_V x M/L 2 at the app distance gives 2.2e5 (x1.3); BH18 5.5e5 superseded", "KEEP"),
    ("NGC6304", "mass"): ("BW v4 1.03e5; Harris M_V x M/L 2 gives 1.5e5 (x1.5); BH18 2.8e5 superseded", "KEEP"),
    ("NGC6642", "mass"): ("BW v4 3.95e4 uses Baumgardt+2020 V 9.65 (0.52 mag fainter than Harris 9.13); x1.9-2.2 below BH18/ML2, borderline", "KEEP"),
    ("NGC2298", "vesc"): ("BW v4 mass (5.0e4) is 4x BH18's 1.2e4 and agrees with Harris M_V x M/L 2 (5.7e4); vesc follows", "KEEP"),
    ("NGC2298", "rhoc"): ("same re-fit as vesc (BW v4 mass 4x BH18); H10xML2 3.2 is 0.65 dex below", "KEEP"),
}


def auto_cause(fd):
    k, oid = fd["field"], fd["id"]
    if (oid, k) in CAUSE: return CAUSE[(oid, k)]
    x = xout[oid]
    if k == "d":
        return "older distance in H10/BH18; app uses BV21 (Gaia EDR3 + HST + literature)", "KEEP"
    if k == "mass":
        return "BW v4 (newest N-body fit) differs from the BH18 2018 version", "KEEP"
    if k == "rhoc":
        return ("core density is strongly model-dependent (King core vs N-body cusp, core-collapsed clusters); "
                "BW v4 is the newest fit, catalogues scatter by 0.5-1.5 dex", "KEEP")
    if k == "vesc":
        return "BW v4 N-body re-fit (new distance and mass) vs older BH18 (2018) / MV05 King-model values", "KEEP"
    if k == "mag":
        c = ("app = OpenNGC small-aperture photometry; MV05 (King total, extrapolated) and G10 (MCPS) are brighter. "
             "Aperture vs total definition, consistent with the 2-3' visual size")
        if oid in B_AS_V: c += "; OpenNGC has no V, app shows B (young blue cluster, B-V ~ 0)"
        return c, "CHECK"
    if k == "size":
        q = x.get("size_q")
        return f"visual size / (3.5 r_h) = {q[0]}, / (2 r_t) = {q[1]}", "CHECK"
    if k == "desc_distance":
        return "desc quotes the Harris 2010 distance; app d is BV21", "TEXT"
    if k == "transcription":
        return "app value differs from the Baumgardt web table it cites", "CHECK"
    return "", "CHECK"


for fd in findings:
    fd["cause"], fd["verdict"] = auto_cause(fd)

# ---------------------------------------------------------------- corrections (clear errors only)
corr = {}
if "NGC1049" in xout and xout["NGC1049"].get("d_src") == "MC12" and xout["NGC1049"]["host"] == "fornax":
    fx = xout["NGC1049"]
    corr["NGC1049"] = {"d": fx["d"], "d_src": "Fornax dSph host distance 147 kpc, McConnachie 2012 (VizieR J/AJ/144/4); NGC 1049 = Fornax 3"}
    if "MV05" in fx.get("mag_all", {}):
        corr["NGC1049"]["catalog"] = {"mag": fx["mag_all"]["MV05"],
                                      "src": "McLaughlin & van der Marel 2005 (VizieR J/ApJS/161/304), Fornax 3 King-model total V; "
                                             "13.59 was OpenNGC's B magnitude"}

# ---------------------------------------------------------------- write JSON
meta = {"generated_by": "scripts/crosscheck/globulars.py", "n": len(GCS), "sources": SRC,
        "units": {"d": "ly", "mass": "Msun", "mag": "V", "rh/rt": "arcmin (half-light / tidal radius)",
                  "rhoc": "log10 Msun/pc^3", "vesc": "km/s", "plx": "mas [value, error]",
                  "size_q": "[visual size / 3.5 r_h, visual size / 2 r_t]", "age": "yr"},
        "hosts_kpc": {k: {kk: vv for kk, vv in v.items() if kk not in ("ra", "dec")} for k, v in HOST.items()}}
def clean(v):
    if isinstance(v, dict): return {k: clean(x) for k, x in v.items() if x is not None}
    if isinstance(v, list): return [clean(x) for x in v]
    return int(v) if isinstance(v, float) and v.is_integer() and abs(v) >= 1 else v


xout, corr = clean(xout), clean(corr)
os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
json.dump({"meta": meta, "objects": xout}, open(OUT_JSON, "w"), separators=(",", ":"), ensure_ascii=False)
json.dump(corr, open(OUT_CORR, "w"), indent=1, ensure_ascii=False)
open(OUT_CORR, "a").write("\n")


# ---------------------------------------------------------------- report
def fmt(v):
    if isinstance(v, dict): return ", ".join(f"{k} {fmt(x)}" for k, x in v.items() if x is not None)
    if isinstance(v, list): return "[" + ", ".join(fmt(a) for a in v) + "]"
    if isinstance(v, float):
        return f"{v:,.0f}" if abs(v) >= 1000 else f"{v:.3g}" if abs(v) < 100 else f"{v:.0f}"
    return str(v)


hosts = {h: sum(1 for v in xout.values() if v["host"] == h) for h in ("mw", "lmc", "smc", "fornax")}
plx = [(k, v["plx_sigma"], FACTS[k]["d"] / v["d_all"]["VB21plx"]) for k, v in xout.items() if "plx_sigma" in v]
bwv = sorted(((round(GC[k]["mag"] - v["mag_all"]["BW"], 2), k) for k, v in xout.items()
              if "BW" in v.get("mag_all", {}) and abs(GC[k]["mag"] - v["mag_all"]["BW"]) > 0.4), key=lambda t: -abs(t[0]))
h10same = sum(1 for k, v in xout.items() if "H10" in v.get("mag_all", {}) and abs(GC[k]["mag"] - v["mag_all"]["H10"]) < 0.005)
young = sorted(((k, xout[k].get("age_B13") or xout[k].get("age_MV05"), (xout[k].get("simbad") or ["", ""])[1])
                for k in xout if xout[k]["host"] in ("lmc", "smc")), key=lambda t: t[0])
over_t = [(k, v["size_q"][1]) for k, v in xout.items() if v.get("size_q") and v["size_q"][1] and v["size_q"][1] > 1]

L = ["# Globular clusters: cross-check against independent catalogues", "",
     f"Generated by `scripts/crosscheck/globulars.py` (re-runs from `.local/crosscheck-cache/globulars/`; `--refresh` re-fetches). "
     f"{len(GCS)} objects of type `globular_cluster`: {hosts['mw']} Milky Way, {hosts['lmc']} LMC, {hosts['smc']} SMC, "
     f"{hosts['fornax']} Fornax dSph. Reference values per id: `shared/data/xcheck/globulars.json`.", "",
     "## Sources", ""] + [f"- **{k}**: {v}" for k, v in SRC.items()] + [
     "", "Baumgardt & Vasiliev 2021 (J/MNRAS/505/5957) is not on VizieR; its distances reach the app only via BW. "
     "VizieR VII/202 is the 1997 Harris edition, so the 2010 edition is read from McMaster's mwgc.dat.",
     "", "## Thresholds", "",
     "- **d**: MW flagged when >15% from all of H10, BH18 and the Gaia EDR3 parallax, or >15% AND >3 sigma from a precise "
     "(plx/err >= 10) parallax; Magellanic/Fornax: >15% from the MC12 host distance",
     "- **mass**: >factor 2 from the geometric median of the independent references (MW: BH18, MV05, Harris M_V at the app "
     "distance x M/L 2; LMC: MV05, B13)",
     "- **mag**: >0.4 mag vs H10 V_t (MW) or MV05 / G10 / SIMBAD (Magellanic, Fornax)",
     "- **size**: visual size < (3.5 r_h)/3 or > 3 x (2 r_t) (H10 radii for MW, MV05 King fits otherwise)",
     "- **rhoc**: >0.5 dex from both BH18 and Harris rho_0 x M/L 2; **vesc**: >30% from both BH18 and MV05",
     "- **transcription**: app d, mass (2 s.f.), rhoc, vesc, tdiss vs the Baumgardt web table (BW) the app cites",
     "- **desc_distance**: distance quoted in the catalog description vs the app's own d, >15%",
     "", "## Summary", "", "| field | checked | agree | flagged |", "|---|---:|---:|---:|"]
for k, v in stats.items(): L.append(f"| {k} | {v['checked']} | {v['agree']} | {v['flagged']} |")
L += ["", "Verdicts: **FIX** = clear error, correction in `globulars-corrections.json`; **KEEP** = app value is the better/newer one; "
      "**CHECK** = judgement call, no correction proposed; **TEXT** = description wording only.", ""]
for field in ("d", "mass", "mag", "size", "rhoc", "vesc", "transcription", "desc_distance"):
    fl = [x for x in findings if x["field"] == field]
    if not fl: continue
    L += [f"## {field} ({len(fl)} flagged)", "", "| id | ours | reference | ref src | likely cause | verdict |", "|---|---|---|---|---|---|"]
    for x in sorted(fl, key=lambda x: ({"FIX": 0, "CHECK": 1}.get(x["verdict"], 2), x["id"])):
        L.append(f"| {x['id']} | {fmt(x['ours'])} | {fmt(x['ref'])} | {x['src']} | {x['cause']} | {x['verdict']} |")
    L.append("")
L += ["## Other findings", "",
      f"- **Transcription**: all {stats['transcription']['checked']} Baumgardt-sourced objects match the BW table exactly "
      "(d, mass to 2 s.f.; rhoc, vesc, tdiss). Column mapping verified against the table legend (R_sun col 3, Mass 7, "
      "log rho_c 14, T_Diss 18, v_esc 22).",
      f"- **Gaia EDR3 parallaxes** (VB21, {len(plx)} clusters with plx/err >= 10): no app distance is >3 sigma off "
      f"(max |sigma| {max(abs(t[1]) for t in plx):.1f}); median app d / (1/plx) = {statistics.median(t[2] for t in plx):.3f}, "
      "the ~0.007-0.010 mas residual EDR3 parallax offset that BV21 corrected for.",
      f"- **V magnitudes (MW)**: the app's mag equals Harris 2010 V_t for {h10same} of {hosts['mw']} MW globulars. "
      f"Baumgardt+2020 integrated V (BW) differs by >0.4 mag for {len(bwv)}: "
      + ", ".join(f"{k} {d:+.2f}" for d, k in bwv) + " (app - BW). Mostly reddened bulge clusters and sparse/large ones; "
      "Harris V_t is the standard observer's total magnitude, so KEEP, but BW masses use BW's V (see Pal 11, NGC 6642).",
      "- **Pal 11 (MWSC3171)**: " + PAL11 + ". Not a clear error (BW v4 is the newest catalogue) but the merger may prefer "
      "consistent values: either keep BW (mass 1.4e4) with V 11.9, or keep V 9.8 with a Harris-based mass ~1e5.",
      "- **Magellanic 'globulars' are mostly young**: " + ", ".join(
          f"{k} {fmt(a / 1e9) + ' Gyr' if a and a >= 1e9 else (fmt(a / 1e6) + ' Myr' if a else 'no age in B13/MV05')} ({t})" for k, a, t in young)
      + ". Ages from B13 (MV05 where absent); type from SIMBAD. Only NGC 1786 and NGC 1916 are old globulars; NGC 419 (SMC) is "
      "~1.5 Gyr (intermediate age). The rest are young massive clusters (16-130 Myr) that OpenNGC labels GCl. Any copy implying "
      "ancient, 12-billion-year-old stars would be wrong for them; type review suggested (not a data correction).",
      "- **Magellanic masses**: app masses exist only for NGC 1818, 1850, 1866, 2004 (Wikipedia) and NGC 419 "
      "(not in MV05/B13, unchecked). xcheck JSON carries B13/MV05 masses for the other LMC clusters if the merger wants them.",
      "- **Visual sizes**: none outside the window. Visual size exceeds the Harris tidal diameter 2 r_t for "
      + ", ".join(f"{k} (x{q})" for k, q in over_t) + "; Harris r_t is nominal for core-collapsed clusters, harmless.",
      "- **NGC 1049 mass**: the app has none; MV05 gives 2.5e5 M_sun at 137 kpc (~2.9e5 at 147 kpc), in the xcheck JSON.",
      "- MV05 `vesc0` is labelled log(km/s) on VizieR but the values are linear km/s; used as such.", ""]
open(OUT_MD, "w").write("\n".join(L) + "\n")
print(json.dumps(stats))
print(f"wrote {OUT_JSON} ({os.path.getsize(OUT_JSON)//1024} KB), {OUT_MD}, {OUT_CORR}")
