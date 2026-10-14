#!/usr/bin/env python3
"""Cross-check AstroPilot's nebulae (types planetary_nebula, supernova_remnant, emission_nebula,
reflection_nebula, dark_nebula) against independent open catalogues — distances and angular sizes.

    python3 -I scripts/crosscheck/nebulae.py            # re-runs from cache; fetches only what is missing
    python3 -I scripts/crosscheck/nebulae.py --offline  # never touch the network (fails on a cache miss)

Reads (never writes) shared/data/catalog.json and shared/data/objectFacts.json.
Writes shared/data/xcheck/nebulae.json, scripts/crosscheck/nebulae-report.md,
scripts/crosscheck/nebulae-corrections.json.

Only object names and coordinates are sent (VizieR TAP, SIMBAD TAP), at most one request per second;
every response is cached under .local/crosscheck-cache/nebulae/ (key = SHA-1 of URL + query).

Reference sources
  Planetary nebulae
    C26   Cavichia et al. 2026, VizieR J/ApJ/1004/220: Gaia DR3 central-star parallaxes (zero-point corrected,
          El-Badry-inflated errors)
    GS21  Gonzalez-Santamaria et al. 2021, VizieR J/A+A/656/A51: Gaia EDR3 central stars, Bayesian distances
    CW21  Chornay & Walton 2021, VizieR J/A+A/656/A110: Gaia EDR3 central stars (parallax; combined distance)
    FBP16 Frew, Parker & Bojicic 2016 H-alpha surface-brightness-radius distances, as tabulated by
          Hernandez-Juarez et al. 2024, VizieR J/other/RMxAA/60.227 (which also gives SH18 and a final distance)
    BS23  Bucciarelli & Stanghellini 2023, VizieR J/A+A/680/A104: statistical distances calibrated on Gaia DR3
    SH10  Stanghellini & Haywood 2010, VizieR J/ApJ/714/1096: statistical distances
    HASH  Parker, Bojicic & Frew 2016 HASH PN database, VizieR V/163: major/minor angular diameters
    SEC   Acker et al. 1992 Strasbourg-ESO catalogue, VizieR V/84: optical diameters
  Supernova remnants
    G19   Green 2019 catalogue of Galactic SNRs, VizieR VII/284: angular sizes, types
    M16   Maggi et al. 2016 LMC SNRs, VizieR J/A+A/585/A162: X-ray sizes
    distances: Gaia EDR3 parallax of the Crab pulsar (SIMBAD), Fesen et al. 2018/2021 (Cygnus Loop, arXiv
    1809.01713 / 2109.05368), Zucker et al. 2020 cloud distance (IC 443), SIMBAD mesDistance
  HII regions, reflection and dark nebulae
    Sh2   Sharpless 1959, VizieR VII/20 (diameters);  RCW  Rodgers, Campbell & Whiteoak 1960, VizieR VII/216
    Ced   Cederblad 1946, VizieR VII/231;  vdB  van den Bergh 1966, VizieR VII/21 (2 x max radius)
    LBN   Lynds 1965 bright nebulae, VizieR VII/9;  B  Barnard 1927, VizieR VII/220A
    DB02  Dutra & Bica 2002 dust clouds, VizieR J/A+A/383/631;  B08 Bica et al. 2008 LMC, J/MNRAS/389/678
    distances: Gaia DR3 geometric distances of the ionising / illuminating stars (Bailer-Jones et al. 2021,
    VizieR I/352, via SIMBAD Gaia DR3 ids; SIMBAD/Hipparcos parallax for stars without one), Hunt & Reffert
    2023 cluster distances (VizieR J/A+A/673/A114), Zucker et al. 2020 molecular-cloud distances
    (VizieR J/A+A/633/A51), LMC 49.59 kpc (Pietrzynski et al. 2019), SIMBAD mesDistance parallax entries.

Thresholds (as specified for this audit)
  PN distance: >40% from the Gaia central-star parallax distance when plx/err > 5 (RUWE < 1.4);
               otherwise > factor 2 from the median of the statistical / Bayesian distances.
  SNR, emission, reflection, dark distance: > factor 1.6 from the consensus (median of independent anchors).
  Angular size: > factor 2 from the preferred catalogue size.
"""
import csv, hashlib, io, json, math, os, re, statistics, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(ROOT, "../.."))
CACHE = os.path.join(REPO, ".local/crosscheck-cache/nebulae")
OUT_JSON = os.path.join(REPO, "shared/data/xcheck/nebulae.json")
OUT_MD = os.path.join(ROOT, "nebulae-report.md")
OUT_CORR = os.path.join(ROOT, "nebulae-corrections.json")
OFFLINE = "--offline" in sys.argv
VZ = "https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync"
SB = "https://simbad.cds.unistra.fr/simbad/sim-tap/sync"
LY = 3.261563777  # light-years per parsec
LMC_PC = 49590.0  # Pietrzynski et al. 2019
TYPES = ["planetary_nebula", "supernova_remnant", "emission_nebula", "reflection_nebula", "dark_nebula"]

# ----------------------------------------------------------------------------------------------- fetching
_last = [0.0]


def tap(url, adql, fmt):
    """Run a synchronous ADQL query; cached by SHA-1 of (url, query, format)."""
    os.makedirs(CACHE, exist_ok=True)
    key = hashlib.sha1((url + "\n" + adql + fmt).encode()).hexdigest()
    p = os.path.join(CACHE, key + "." + fmt)
    if os.path.exists(p):
        return open(p).read()
    if OFFLINE:
        sys.exit(f"cache miss in --offline mode: {adql[:120]}")
    data = urllib.parse.urlencode({"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": fmt, "QUERY": adql}).encode()
    for attempt in range(4):
        wait = 1.1 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)  # <= 1 request / s
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": "AstroPilot-crosscheck/1.0 (catalog validation)"})
            with urllib.request.urlopen(req, timeout=180) as r:
                txt = r.read().decode("utf-8", "replace")
            _last[0] = time.time()
            break
        except Exception as e:  # noqa: BLE001
            _last[0] = time.time()
            print(f"  retry {attempt + 1}: {e}", file=sys.stderr)
            time.sleep(3 + 5 * attempt)
    else:
        sys.exit("query failed: " + adql[:200])
    open(p, "w").write(txt)
    return txt


def vz(adql):
    rows = list(csv.reader(io.StringIO(tap(VZ, adql, "tsv")), delimiter="\t", quotechar='"'))
    if not rows:
        return []
    head = [h.strip() for h in rows[0]]
    return [dict(zip(head, [c.strip() for c in r])) for r in rows[1:] if r]


def sb(adql):
    return [{k: (v or "").strip() for k, v in r.items()} for r in csv.DictReader(io.StringIO(tap(SB, adql, "csv")))]


def fnum(s):
    try:
        v = float(s)
        return v if v == v else None
    except (TypeError, ValueError):
        return None


def sql_list(items):
    return ",".join("'" + i.replace("'", "''") + "'" for i in items)


def sep_deg(ra1, de1, ra2, de2):
    a1, d1, a2, d2 = map(math.radians, (ra1, de1, ra2, de2))
    c = math.sin(d1) * math.sin(d2) + math.cos(d1) * math.cos(d2) * math.cos(a1 - a2)
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def gal2eq(l, b):
    """Galactic -> ICRS (degrees)."""
    l, b = math.radians(l), math.radians(b)
    T = [[-0.0548755604162154, -0.8734370902348850, -0.4838350155487132],
         [0.4941094278755837, -0.4448296299600112, 0.7469822444972189],
         [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669]]
    g = [math.cos(b) * math.cos(l), math.cos(b) * math.sin(l), math.sin(b)]
    e = [sum(T[j][i] * g[j] for j in range(3)) for i in range(3)]
    return math.degrees(math.atan2(e[1], e[0])) % 360, math.degrees(math.asin(e[2]))


def rnd(x):
    """2 significant figures (3 above 10,000 ly would be false precision for nebulae)."""
    if x is None:
        return None
    if x == 0:
        return 0
    p = 10 ** (int(math.floor(math.log10(abs(x)))) - 1)
    return int(round(x / p) * p) if p >= 1 else round(round(x / p) * p, 6)


def png_norm(s):
    s = (s or "").upper().replace("PN G", "").replace("PNG", "").replace(" ", "")
    m = re.match(r"^(\d{1,3})\.(\d)([+-])(\d{1,2})\.(\d)", s)
    return f"{int(m.group(1)):03d}.{m.group(2)}{m.group(3)}{int(m.group(4)):02d}.{m.group(5)}" if m else None


# ----------------------------------------------------------------------------------------------- the app's data
CAT = json.load(open(os.path.join(REPO, "shared/data/catalog.json")))
_facts = json.load(open(os.path.join(REPO, "shared/data/objectFacts.json")))
FACTS = _facts.get("facts", _facts) if isinstance(_facts, dict) else {}
OBJS = [o for o in CAT if o["type"] in TYPES]
BYID = {o["id"]: o for o in OBJS}

# ----------------------------------------------------------------------------------------------- SIMBAD
def ids_for(o):
    out = []
    for d in o["designations"]:
        if re.match(r"^(M|NGC|IC|ESO|Sh2|B) ?[\d-]", d):
            out.append(d.replace("Sh2-", "Sh 2-").replace("B 33", "Barnard 33"))
    out.append("NAME " + o["name"])
    return out


allids = sorted({i for o in OBJS for i in ids_for(o)})
res = sb(f"SELECT i.id, b.main_id, b.oid, b.otype, b.ra, b.dec FROM ident AS i JOIN basic AS b ON b.oid=i.oidref WHERE i.id IN ({sql_list(allids)})")
by_ident = {re.sub(r"\s+", " ", r["id"]): r for r in res}
OIDS = {}  # app id -> [oid, ...] (first = primary)
for o in OBJS:
    lst = []
    for i in ids_for(o):
        if i in by_ident and by_ident[i]["oid"] not in lst:
            lst.append(by_ident[i]["oid"])
    OIDS[o["id"]] = lst
oids = sorted({x for v in OIDS.values() for x in v})
idt = sb(f"SELECT oidref, id FROM ident WHERE oidref IN ({','.join(oids)})")
mes = sb(f"SELECT oidref, dist, plus_err, minus_err, unit, method, bibcode FROM mesDistance WHERE oidref IN ({','.join(oids)})")
IDENTS, MES = {}, {}
for r in idt:
    IDENTS.setdefault(r["oidref"], []).append(re.sub(r"\s+", " ", r["id"]))
UNIT = {"pc": 1.0, "kpc": 1e3, "Mpc": 1e6}
for r in mes:
    v = fnum(r["dist"])
    if v is not None:
        MES.setdefault(r["oidref"], []).append((v * UNIT.get(r["unit"], 1.0), r["method"], r["bibcode"]))


def idents_of(aid):
    out = []
    for oid in OIDS.get(aid, []):
        out += IDENTS.get(oid, [])
    return out


# ----------------------------------------------------------------------------------------------- anchors
# Distance anchors for nebulae lit or ionised by known stars / clusters, or embedded in catalogued clouds.
#  star : SIMBAD id of the ionising / illuminating star (vdB / Cederblad give it for reflection nebulae)
#  cl   : Hunt & Reffert 2023 cluster;  cloud: (Zucker 2020 sightline name, search radius deg)
#  lmc  : inside the Large Magellanic Cloud;  simbad: SIMBAD mesDistance parallax entries (2018+) of the object
#  lit  : (pc, citation) published measurements not in SIMBAD
ANCH = {
    "M8": {"cl": ["NGC_6530"], "cloud": [("Lagoon", 1.5)]},
    "M17": {"cloud": [("M17", 1.5)], "simbad": True},  # HR23 "NGC_6618" is a 600 pc, 400 Myr foreground group
    "M20": {"cloud": [("M20", 1.5)], "simbad": True},
    "M43": {"star": ["HD 37061"], "cl": ["NGC_1980"], "cloud": [("Orion", 1.0)]},
    "C9": {"star": ["HD 217086"]},
    "NGC281": {"cl": ["IC_1590"], "star": ["HD 5005A"]},
    "NGC1499": {"star": ["* ksi Per"]},
    "NGC2024": {"cloud": [("Orion", 1.0)], "cl": ["Sigma_Orionis"]},
    "NGC2174": {"cl": ["NGC_2175"], "star": ["HD 42088"]},
    "NGC2237": {"cl": ["NGC_2244"], "cloud": [("Rosette", 2.0)], "simbad": True},
    "NGC2282": {"cl": ["vdBergh_85"], "star": ["HD 289120"]},
    "NGC2359": {"star": ["WR 7"]},
    "NGC2736": {"simbad_obj": ["PSR B0833-45"]},  # Pencil Nebula: a filament of the Vela SNR (pulsar parallax)
    "NGC3247": {"cl": ["Westerlund_2"], "alt_cl": ["Collinder_220"]},  # our position is RCW 49 / Wd 2; HR23 lists NGC_3247 = Collinder_220, 14' SE
    "NGC3372": {"cl": ["Trumpler_14", "Trumpler_16"], "cloud": [("Carina", 2.0)], "simbad": True},
    "NGC6164": {"star": ["HD 148937"]},
    "NGC6165": {"star": ["HD 148937"]},
    "NGC6188": {"cl": ["NGC_6193"]},
    "NGC6334": {"cl": ["NGC_6334"], "simbad": True},
    "NGC6589": {"star": ["HD 167638"], "cl": ["Dias_5"]},
    "NGC6888": {"star": ["WR 136"]},
    "NGC7000": {"cloud": [("North_America", 2.0)], "cl": ["UPK_127"]},
    "NGC7635": {"star": ["BD+60 2522"], "simbad": True},
    "IC405": {"star": ["HD 34078"]},
    "IC434": {"cl": ["Sigma_Orionis"], "cloud": [("Orion", 1.0)]},
    "IC447": {"cl": ["Collinder_95"]},
    "IC1284": {"star": ["BD-19 4953"], "cl": ["Dias_5"]},
    "IC4605": {"star": ["* 22 Sco"], "cloud": [("Ophiuchus", 3.0)]},
    "IC5070": {"cloud": [("North_America", 2.0)], "cl": ["UPK_127"]},
    # reflection
    "M78": {"star": ["BD+00 1177"], "cl": ["NGC_2068"], "cloud": [("Orion", 1.0)]},
    "NGC1432": {"star": ["* 20 Tau"], "cl": ["Melotte_22"]},
    "NGC1435": {"star": ["* 23 Tau"], "cl": ["Melotte_22"]},
    "IC349": {"star": ["* 23 Tau"], "cl": ["Melotte_22"]},
    "NGC1555": {"star": ["V* T Tau"], "cloud": [("Taurus", 3.0)]},
    "NGC1788": {"star": ["HD 293815"]},
    "NGC1909": {"star": ["* bet Ori"], "cloud": [("IC2118", 2.0)]},
    "NGC1973": {"star": ["BD-04 1179"], "cl": ["NGC_1980"], "cloud": [("Orion", 1.0)]},
    "NGC1975": {"cl": ["NGC_1980"], "cloud": [("Orion", 1.0)]},
    "NGC1999": {"star": ["V* V380 Ori"], "cloud": [("Orion", 1.0)]},
    "NGC2182": {"star": ["HD 42261"], "cloud": [("Mon_R2", 2.0)]},
    "NGC2245": {"cl": ["Collinder_95"]},
    "NGC2247": {"star": ["HD 259431"], "cl": ["Collinder_95"]},
    "NGC2261": {"star": ["V* R Mon"], "cl": ["NGC_2264"]},
    "NGC6590": {"star": ["HD 313095"], "cl": ["Dias_5"]},
    "NGC6729": {"star": ["V* R CrA"], "cloud": [("Corona_Australis", 2.0)]},
    "NGC7023": {"star": ["HD 200775"], "cl": ["Theia_5"]},
    "IC1287": {"star": ["HD 170740"]},
    "IC2220": {"star": ["HD 65750"]},
    "IC4592": {"star": ["* nu. Sco"]},
    "IC4604": {"star": ["* rho Oph"], "cloud": [("Ophiuchus", 3.0)]},
    # dark
    "C99": {"cloud": [("Coalsack", 6.0)]},
    "B33": {"cl": ["Sigma_Orionis"], "cloud": [("Orion", 1.5)]},
    # supernova remnants
    "M1": {"star": ["PSR B0531+21"], "lit": [(2000, "Trimble 1973 (PASP 85, 579), via SIMBAD mesDistance")]},
    "NGC6960": {"lit": [(725, "Fesen et al. 2021, Gaia EDR3 stars in/behind the Cygnus Loop (arXiv:2109.05368)"),
                        (735, "Fesen et al. 2018, Gaia DR2 stars in/behind the Cygnus Loop (arXiv:1809.01713)")]},
    "NGC6992": {"lit": [(725, "Fesen et al. 2021, Gaia EDR3 stars in/behind the Cygnus Loop (arXiv:2109.05368)"),
                        (735, "Fesen et al. 2018, Gaia DR2 stars in/behind the Cygnus Loop (arXiv:1809.01713)")]},
    "IC443": {"cloud": [("IC443", 2.0)]},
}
for _lmc in ("NGC1955", "NGC2014", "NGC2069", "NGC2070", "NGC2080", "NGC2060"):
    ANCH[_lmc] = {"lmc": True}

# Explicit size cross-identifications (catalogue, number) where SIMBAD lacks them or position is ambiguous.
SIZE_XID = {
    "M8": [("Sh2", "25")], "M17": [("Sh2", "45")], "M20": [("Sh2", "30"), ("RCW", "147")],
    "C9": [("Sh2", "155")], "NGC281": [("Sh2", "184")], "NGC1499": [("Sh2", "220")],
    "NGC2174": [("Sh2", "252")], "NGC2237": [("Sh2", "275")], "NGC2359": [("Sh2", "298"), ("RCW", "5")],
    "NGC2736": [("RCW", "37")], "NGC3247": [("RCW", "49")], "NGC3372": [("RCW", "53")],
    "NGC6164": [("RCW", "107")], "NGC6165": [("RCW", "107")], "NGC6188": [("RCW", "108")],
    "NGC6334": [("RCW", "127"), ("Sh2", "8")], "NGC6888": [("Sh2", "105")], "NGC7000": [("Sh2", "117")],
    "NGC7635": [("Sh2", "162")], "IC405": [("Sh2", "229")], "IC1284": [("Sh2", "37")],
    "IC443": [("Sh2", "248")], "M1": [("Sh2", "244")], "NGC1555": [("Sh2", "238")],
    "M78": [("vdB", "59")], "NGC1432": [("vdB", "21")], "NGC1435": [("vdB", "22")], "NGC1555b": [],
    "NGC1788": [("vdB", "33")], "NGC1999": [("vdB", "46")], "NGC2182": [("vdB", "72")], "NGC2247": [("vdB", "82")],
    "NGC2282": [("vdB", "85")], "NGC6589": [("vdB", "118")], "NGC6590": [("vdB", "119")], "NGC7023": [("vdB", "139")],
    "IC1287": [("vdB", "124")], "IC4592": [("vdB", "100")], "IC4604": [("vdB", "106")],
    "IC4605": [("vdB", "108")],
}
# Cederblad entries by name (the catalogue's own "Name" column), checked against position below
CED_NAME = {
    "M1": "NGC 1952", "M8": "NGC 6523", "M17": "NGC 6618", "M20": "NGC 6514", "M43": "NGC 1982", "M78": "NGC 2068",
    "NGC281": "NGC 281", "NGC1432": "NGC 1432", "NGC1435": "NGC 1435", "IC349": "IC 349", "NGC1499": "NGC 1499",
    "NGC1788": "NGC 1788", "NGC1909": "IC 2118a", "NGC1999": "NGC 1999", "NGC2024": "NGC 2024", "NGC2182": "NGC 2182",
    "NGC2237": "NGC 2244", "NGC2245": "NGC 2245", "NGC2247": "NGC 2247", "NGC2282": "NGC 2282", "NGC3372": "NGC 3372",
    "NGC6334": "NGC 6334", "NGC6590": "NGC 6590", "NGC7023": "NGC 7023", "NGC7635": "NGC 7635", "IC405": "IC 405",
    "IC434": "IC 434", "IC447": "IC 2169", "IC1284": "IC 1284", "IC1287": "IC 1287", "IC4592": "IC 4592",
    "IC4604": "IC 4604", "NGC2174": "NGC 2175",
}
# Lynds bright-nebula entries by name
LBN_NAME = {
    "M8": "NGC 6523", "NGC281": "NGC  281", "NGC1432": "NGC 1432", "NGC1499": "NGC 1499", "NGC1788": "NGC 1788",
    "NGC1909": "IC 2118", "NGC1999": "NGC 1999", "NGC2182": "NGC 2182", "NGC2237": "NGC 2238", "NGC2245": "NGC 2245",
    "NGC2247": "NGC 2247", "NGC2261": "NGC 2261", "NGC2359": "NGC 2359", "NGC6888": "NGC 6888", "NGC7000": "NGC 7000",
    "NGC7023": "NGC 7023", "NGC7635": "NGC 7635", "IC405": "IC  405", "IC434": "IC  434", "IC443": "IC  443",
    "IC444": "IC  444", "IC447": "IC 2169", "IC1287": "IC 1287", "IC4592": "IC 4592", "IC4604": "IC 4604",
    "IC4605": "IC 4605", "IC5070": "IC 5070", "M20": "NGC 6514", "C9": "S 155", "NGC2174": "NGC 2175", "M1": "NGC 1952",
}
GREEN = {"M1": "G184.6-05.8", "NGC6960": "G074.0-08.5", "NGC6992": "G074.0-08.5", "IC443": "G189.1+03.0"}
BICA = {"NGC1955": ("table4", "NGC1955"), "NGC2014": ("table4", "NGC2014"), "NGC2069": ("table5", "NGC2069"),
        "NGC2070": ("table5", "LMC-N157,DEML263"), "NGC2080": ("table5", "NGC2080"), "NGC2060": ("table5", "NGC2060")}

# ----------------------------------------------------------------------------------------------- stars
stars = sorted({s for a in ANCH.values() for s in a.get("star", []) + a.get("simbad_obj", [])})
srows = sb(f"SELECT i.id, b.main_id, b.oid, b.plx_value, b.plx_err, b.plx_bibcode, b.ra, b.dec FROM ident AS i JOIN basic AS b ON b.oid=i.oidref WHERE i.id IN ({sql_list(stars)})")
STAR = {re.sub(r"\s+", " ", r["id"]): r for r in srows}
star_oids = sorted({r["oid"] for r in srows})
gid_rows = sb(f"SELECT oidref, id FROM ident WHERE oidref IN ({','.join(star_oids)}) AND id LIKE 'Gaia DR3 %'")
GAIA_OF = {r["oidref"]: r["id"].split()[-1] for r in gid_rows}
smes = sb(f"SELECT oidref, dist, unit, method, bibcode FROM mesDistance WHERE oidref IN ({','.join(star_oids)})")
SMES = {}
for r in smes:
    v = fnum(r["dist"])
    if v is not None:
        SMES.setdefault(r["oidref"], []).append((v * UNIT.get(r["unit"], 1.0), r["method"], r["bibcode"]))
gids = sorted(set(GAIA_OF.values()))
BJ = {r["Source"]: r for r in vz(f"SELECT Source, rgeo, \"b_rgeo\", \"B_rgeo\", Flag FROM \"I/352/gedr3dis\" WHERE Source IN ({','.join(gids)})")}
G3 = {r["Source"]: r for r in vz(f"SELECT Source, Plx, e_Plx, RUWE, Gmag FROM \"I/355/gaiadr3\" WHERE Source IN ({','.join(gids)})")}


def star_distance(name):
    """(pc, short label, long label): Gaia DR3 parallax when precise (S/N>5, RUWE<1.4), else the Bailer-Jones 2021
    geometric distance, else SIMBAD's parallax (Hipparcos for stars too bright for Gaia), else SIMBAD mesDistance."""
    r = STAR.get(name)
    if not r:
        return None, None, f"{name}: not found in SIMBAD"
    g = GAIA_OF.get(r["oid"])
    if g and g in G3:
        plx, e, ruwe, gmag = fnum(G3[g]["Plx"]), fnum(G3[g]["e_Plx"]), fnum(G3[g]["RUWE"]), fnum(G3[g]["Gmag"])
        bj = fnum(BJ.get(g, {}).get("rgeo"))
        bright = gmag is not None and gmag < 4.5
        if plx and e and plx / e > 5 and (ruwe or 9) < 1.4 and not bright:
            return 1000.0 / (plx + 0.017), f"star {name}: Gaia DR3 plx", f"{name} Gaia DR3 plx {plx:.3f}±{e:.3f} mas (+0.017 ZP), RUWE {ruwe:.2f}"
        if bj and not bright:
            return bj, f"star {name}: Gaia BJ21 rgeo", f"{name} Bailer-Jones+2021 rgeo (plx {plx}±{e} mas, RUWE {ruwe})"
    plx, e = fnum(r["plx_value"]), fnum(r["plx_err"])
    if plx and e and plx / e > 3:
        bib = r["plx_bibcode"]
        zp = 0.017 if ("1350" in bib or "1355" in bib) else 0.0
        kind = "Hipparcos 2007" if "474..653V" in bib else "Gaia" if zp else bib
        return 1000.0 / (plx + zp), f"star {name}: {kind} plx", f"{name} parallax {plx:.2f}±{e:.2f} mas ({bib})"
    ms = [d for d, m, b in SMES.get(r["oid"], [])]
    if ms:
        return statistics.median(ms), f"star {name}: SIMBAD mesDistance", f"{name} SIMBAD mesDistance ({len(ms)})"
    return None, None, f"{name}: no usable parallax"


# ----------------------------------------------------------------------------------------------- clusters, clouds
clusters = sorted({c for a in ANCH.values() for c in a.get("cl", []) + a.get("alt_cl", [])})
HR = {r["Name"]: r for r in vz(f"SELECT Name, N, RA_ICRS, DE_ICRS, dist16, dist50, dist84, logAge50 FROM \"J/A+A/673/A114/clusters\" WHERE Name IN ({sql_list(clusters)})")}
ZK = vz("SELECT Name, GLON, GLAT, d16, d50, d84 FROM \"J/A+A/633/A51/handbook\"")
for z in ZK:
    z["ra"], z["de"] = gal2eq(float(z["GLON"]), float(z["GLAT"]))


def cloud_distance(o, name, radius):
    ra, de = o["ra"] * 15, o["dec"]
    near = [z for z in ZK if z["Name"] == name and sep_deg(ra, de, z["ra"], z["de"]) <= radius]
    if not near:
        cand = sorted(((sep_deg(ra, de, z["ra"], z["de"]), i) for i, z in enumerate(ZK) if z["Name"] == name))[:2]
        near = [ZK[i] for s, i in cand if s <= radius * 2]
    if not near:
        return None, None
    return statistics.median(float(z["d50"]) for z in near), f"Z20 cloud {name} ({len(near)} sightline{'s' if len(near) > 1 else ''})"


# ----------------------------------------------------------------------------------------------- PN tables
PN_T = {
    "C26": vz("SELECT PNG, Name, GaiaDR3, Plx, e_Plx, RUWE, \"Group\", \"Ang-Sep\" FROM \"J/ApJ/1004/220/table1\""),
    "GS21": vz("SELECT PNG, Plx, e_Plx, Dist, \"b_Dist\", \"B_Dist\", Radang FROM \"J/A+A/656/A51/tablea2\""),
    "CW21": vz("SELECT PNG, Name, GaiaEDR3, Rel, plx, e_plx, RUWE, rcomb, \"b_rcomb\", \"B_rcomb\", pnRad FROM \"J/A+A/656/A110/tablea1\""),
    "HJ24": vz("SELECT PNG, \"1/plx\", \"e_plx/plx\", Bayesian, Z95, SH18, FBP16, Dfinal, e_Dfinal, \"Case\" FROM \"J/other/RMxAA/60.227/table1\""),
    "BS23": vz("SELECT PNG, theta, Dist, \"E_Dist\", \"e_Dist\" FROM \"J/A+A/680/A104/table3\""),
    "SH10": vz("SELECT PNG, d, e_d, theta FROM \"J/ApJ/714/1096/table1\""),
    "HASH": vz("SELECT HASH, PNG, Name, MajDiam, MinDiam, PNstat, Domain FROM \"V/163/pnmain\" WHERE Domain='Galaxy'"),
    "SEC": vz("SELECT PNG, oDiam, rDiam FROM \"V/84/diam\""),
    "T03": vz("SELECT PNG, Name, \"lev0.1a\", \"lev0.1b\" FROM \"J/A+A/405/627/table1\""),
}
PNIDX = {k: {} for k in PN_T}
for k, rows in PN_T.items():
    for r in rows:
        p = png_norm(r.get("PNG"))
        if p:
            PNIDX[k].setdefault(p, []).append(r)


def pn_gs(aid):
    out = []
    for i in idents_of(aid):
        if i.startswith("PN G"):
            p = png_norm(i)
            if p and p not in out:
                out.append(p)
    return out


# ----------------------------------------------------------------------------------------------- size tables
SIZE_T = {
    "Sh2": vz("SELECT Sh2, GLon, GLat, RA1900, DE1900, Diam FROM \"VII/20/catalog\""),
    "LBN": vz("SELECT Seq, GLON, GLAT, Diam1, Diam2, Area, Name, \"_RA.icrs\", \"_DE.icrs\" FROM \"VII/9/catalog\""),
    "Ced": vz("SELECT Ced, m_Ced, Name, Star, SpType, Dim1, Dim2, Dist, \"_RA.icrs\", \"_DE.icrs\" FROM \"VII/231/catalog\""),
    "RCW": vz("SELECT RCW, GLON, GLAT, MajAxis, MinAxis, IDs, \"_RA.icrs\", \"_DE.icrs\" FROM \"VII/216/rcw\""),
    "vdB": vz("SELECT VdB, DM, HD, SpType, Vmag, Type, BRadMax, RRadMax, _RA, _DE FROM \"VII/21/catalog\""),
}
GREEN_T = {r["SNR"]: r for r in vz("SELECT * FROM \"VII/284/snrs\"")}
MAGGI = vz("SELECT MCSNR, OName, RAJ2000, DEJ2000, XSize FROM \"J/A+A/585/A162/tablec1\" WHERE OName LIKE '%157%' OR OName LIKE '%2060%'")
BICA_T = {
    "table5": vz("SELECT Names, RAJ2000, DEJ2000, Type, amaj, amin FROM \"J/MNRAS/389/678/table5\" WHERE Names LIKE '%NGC1955%' OR Names LIKE '%NGC2014%' OR Names LIKE '%NGC2069%' OR Names LIKE '%NGC2070%' OR Names LIKE '%NGC2080%' OR Names LIKE '%NGC2060%' OR Names LIKE '%30Dor%' OR Names LIKE '%N157%' OR Names LIKE '%N158%' OR Names LIKE '%N160%' OR Names LIKE '%N51D%' OR Names LIKE '%N59%'"),
    "table4": vz("SELECT Names, RAJ2000, DEJ2000, Type, amaj, amin FROM \"J/MNRAS/389/678/table4\" WHERE Names LIKE '%NGC1955%' OR Names LIKE '%NGC2014%' OR Names LIKE '%N51D%' OR Names LIKE '%N59%'"),
}
BARN = vz("SELECT TOP 3 * FROM \"VII/220A/barnard\" WHERE Barn LIKE '%33%'")
DB02 = vz("SELECT GLON, GLAT, MajAxis, MinAxis, Names, Note FROM \"J/A+A/383/631/cdn\" WHERE Names LIKE '%oal%' OR Note LIKE '%oal%' OR Names LIKE '%B33%' OR Names LIKE '%B 33%' OR Names LIKE '%Horse%'")


def size_pos(cat, r):
    if cat == "Sh2":
        return gal2eq(float(r["GLon"]), float(r["GLat"]))
    if cat == "vdB":
        return fnum(r["_RA"]), fnum(r["_DE"])
    return fnum(r.get("_RA.icrs") or r.get("_RA_icrs")), fnum(r.get("_DE.icrs") or r.get("_DE_icrs"))


def size_entry(cat, r):
    """(major, minor) arcmin from a size-catalogue row."""
    if cat == "Sh2":
        d = fnum(r["Diam"])
        return (d, None) if d else None
    if cat == "LBN":
        a, b = fnum(r["Diam1"]), fnum(r["Diam2"])
        return (a, b) if a else None
    if cat == "Ced":
        a, b = fnum(r["Dim1"]), fnum(r["Dim2"])
        return (a, b) if a else None
    if cat == "RCW":
        a, b = fnum(r["MajAxis"]), fnum(r["MinAxis"])
        return (a, b) if a else None
    if cat == "vdB":
        rad = [x for x in (fnum(r["BRadMax"]), fnum(r["RRadMax"])) if x]
        return (2 * max(rad), None) if rad else None
    return None


KEYCOL = {"Sh2": "Sh2", "RCW": "RCW", "vdB": "VdB", "LBN": "Seq"}
CAT_KEY = {"Sh2": "Sh2-{n}", "RCW": "RCW {n}", "Ced": "Ced {n}", "vdB": "vdB {n}", "LBN": "LBN {n}"}


def find_sizes(o):
    """All catalogue sizes for a non-PN nebula: explicit cross-ids, SIMBAD idents and catalogue names, each
    position-checked."""
    aid, ra, de = o["id"], o["ra"] * 15, o["dec"]
    ours = (o.get("size") or [None])[0]
    lim = max(15 / 60, 0.8 * (ours or 10) / 60)
    found, seen = [], set()

    def add(cat, r):
        n = r.get(KEYCOL.get(cat, ""), "") if cat != "Ced" else r["Ced"] + r.get("m_Ced", "")
        if (cat, n) in seen:
            return
        p = size_pos(cat, r)
        s = sep_deg(ra, de, *p) if p and p[0] is not None else None
        sz = size_entry(cat, r)
        if not sz or (s is not None and s > max(lim, 0.6 * sz[0] / 60)):
            return
        seen.add((cat, n))
        found.append({"cat": cat, "maj": sz[0], "min": sz[1], "sep": round(s * 60, 1) if s is not None else None,
                      "src": CAT_KEY[cat].format(n=n)})

    xids = list(SIZE_XID.get(aid, []))
    for i in idents_of(aid):
        for pat, cat in ((r"^SH 2-(\d+)$", "Sh2"), (r"^RCW (\d+)$", "RCW"), (r"^LBN (\d+)$", "LBN")):
            m = re.match(pat, i)
            if m:
                xids.append((cat, m.group(1)))
    for cat, n in xids:
        for r in SIZE_T[cat]:
            if r[KEYCOL[cat]].strip() == n:
                add(cat, r)
    if aid in CED_NAME:
        for r in SIZE_T["Ced"]:
            if r["Name"].strip() == CED_NAME[aid]:
                add("Ced", r)
    if aid in LBN_NAME:
        for r in SIZE_T["LBN"]:
            if re.sub(r"\s+", " ", r["Name"].strip()) == re.sub(r"\s+", " ", LBN_NAME[aid]):
                add("LBN", r)
    return found


# ----------------------------------------------------------------------------------------------- evaluation
def facts_of(aid):
    return FACTS.get(aid, {}) if isinstance(FACTS, dict) else {}


def ratio(a, b):
    return max(a, b) / min(a, b)


def phys_ly(size_arcmin, d_ly):
    return size_arcmin / 60 * math.pi / 180 * d_ly if size_arcmin and d_ly else None


OUT = {}
STATS = {}  # (type, field) -> [checked, agree, flagged]
FLAGS = []
NOTES = {}
FILLS = []  # app has no distance, a reference exists


def stat(t, f, ok):
    s = STATS.setdefault((t, f), [0, 0, 0])
    s[0] += 1
    s[1 if ok else 2] += 1


def flag(o, field, ours, ref, src, tier="threshold"):
    FLAGS.append({"id": o["id"], "name": o["name"], "type": o["type"], "field": field, "ours": ours, "ref": ref,
                  "src": src, "tier": tier})


def eval_pn(o):
    aid = o["id"]
    ours_d = facts_of(aid).get("d")
    pngs = pn_gs(aid)
    rec = {"png": ("PN G" + pngs[0]) if pngs else None, "d_refs": []}
    gaia = None
    for p in pngs:  # Gaia DR3 (Cavichia 2026) first, Gaia EDR3 (Chornay & Walton 2021) otherwise
        for r in PNIDX["C26"].get(p, []):
            plx, e = fnum(r["Plx"]), fnum(r["e_Plx"])
            if plx is not None and e:
                gaia = {"plx": plx, "e": e, "ruwe": fnum(r["RUWE"]), "key": "C26", "gid": "DR3 " + r["GaiaDR3"]}
                break
        if not gaia:
            for r in PNIDX["CW21"].get(p, []):
                plx, e = fnum(r["plx"]), fnum(r["e_plx"])
                if plx is not None and e and (fnum(r["Rel"]) or 0) > 0.5:
                    gaia = {"plx": plx + 0.017, "e": e, "ruwe": fnum(r["RUWE"]), "key": "CW21", "gid": "EDR3 " + r["GaiaEDR3"]}
                    break
        if gaia:
            break
    if gaia:
        sn = gaia["plx"] / gaia["e"]
        rec["plx"] = [round(gaia["plx"], 3), round(gaia["e"], 3), gaia["key"]]
        rec["plx_sn"] = round(sn, 1)
        rec["ruwe"] = round(gaia["ruwe"], 2) if gaia["ruwe"] else None
        if gaia["plx"] > 0:
            rec["d_refs"].append([rnd(1000 / gaia["plx"] * LY), f"{gaia['key']} CS plx (S/N {sn:.0f}, RUWE {gaia['ruwe'] or 0:.2f})"])
    stat_d = []  # statistical / Bayesian distances (pc)
    for p in pngs:
        for r in PNIDX["HJ24"].get(p, [])[:1]:
            for col in ("FBP16", "SH18"):
                v = fnum(r[col])
                if v:
                    stat_d.append((v * 1000, col))
            v = fnum(r["Dfinal"])
            if v:
                rec["d_refs"].append([rnd(v * 1000 * LY), "HJ24 adopted"])
        for key, col, scale in (("BS23", "Dist", 1), ("SH10", "d", 1000)):
            for r in PNIDX[key].get(p, [])[:1]:
                v = fnum(r[col])
                if v:
                    stat_d.append((v * scale, key))
        for key, col in (("GS21", "Dist"), ("CW21", "rcomb")):
            for r in PNIDX[key].get(p, [])[:1]:
                v = fnum(r[col])
                if v:
                    rec["d_refs"].append([rnd(v * LY), key + (" Bayesian" if key == "GS21" else " combined")])
        if stat_d:
            break
    for v, lab in stat_d:
        rec["d_refs"].append([rnd(v * LY), lab])
    stat_med = statistics.median(v for v, _ in stat_d) * LY if stat_d else None
    good = gaia and gaia["plx"] > 0 and gaia["plx"] / gaia["e"] > 5 and (gaia["ruwe"] or 0) < 2.0
    if good:
        rec["d"] = rnd(1000 / gaia["plx"] * LY)
        rec["d_range"] = [rnd(1000 / (gaia["plx"] + gaia["e"]) * LY), rnd(1000 / (gaia["plx"] - gaia["e"]) * LY)]
        rec["d_src"] = f"Gaia {gaia['gid']} central-star parallax {gaia['plx']:.3f}±{gaia['e']:.3f} mas ({gaia['key']})" + (
            f"; RUWE {gaia['ruwe']:.2f} (elevated)" if (gaia["ruwe"] or 0) >= 1.4 else "")
        rec["d_method"] = "gaia"
    elif stat_med:
        rec["d"] = rnd(stat_med)
        rec["d_src"] = "median of statistical distances (" + ", ".join(lab for _, lab in stat_d) + ")"
        rec["d_method"] = "statistical"
    if ours_d and rec.get("d"):
        ok = abs(ours_d - rec["d"]) / rec["d"] <= 0.40 if rec["d_method"] == "gaia" else ratio(ours_d, rec["d"]) <= 2.0
        stat(o["type"], "d", ok)
        if not ok:
            flag(o, "d", ours_d, rec["d"], rec["d_src"])
    elif rec.get("d"):
        FILLS.append(aid)
    sizes = []
    for p in pngs:
        hs = sorted(PNIDX["HASH"].get(p, []), key=lambda r: ("TLP".find(r["PNstat"].strip()[:1]) % 9, r["HASH"]))
        for r in hs:
            a, b = fnum(r["MajDiam"]), fnum(r["MinDiam"])
            if a:
                sizes.append({"maj": a / 60, "min": (b / 60) if b else None, "src": f"HASH #{r['HASH']}"})
                break
        for r in PNIDX["SEC"].get(p, [])[:1]:
            a = fnum(r["oDiam"])
            if a:
                sizes.append({"maj": a / 60, "min": None, "src": "SEC optical"})
        for r in PNIDX["T03"].get(p, [])[:1]:
            a, b = fnum(r.get("lev0.1a") or r.get("lev0_1a")), fnum(r.get("lev0.1b") or r.get("lev0_1b"))
            if a:
                sizes.append({"maj": max(a, b or 0) / 60, "min": (min(a, b) / 60) if b else None, "src": "T03 10%-of-peak"})
        if sizes:
            break
    finish_size(o, rec, sizes)
    return rec


def r3(x):
    return None if x is None else round(x, 3) if x < 1 else round(x, 1)


def finish_size(o, rec, sizes):
    """Preferred size = first entry; agreement = within a factor 2 of at least one independent catalogue."""
    ours = o.get("size")
    rec["size_refs"] = [[r3(s["maj"]), r3(s.get("min")), s["src"]] for s in sizes]
    if not sizes:
        return
    best = sizes[0]
    rec["size"] = [r3(best["maj"])] + ([r3(best["min"])] if best.get("min") else [])
    rec["size_src"] = best["src"]
    if ours and ours[0]:
        close = min(sizes, key=lambda s: ratio(ours[0], s["maj"]))
        ok = ratio(ours[0], close["maj"]) <= 2.0
        stat(o["type"], "size", ok)
        if not ok:
            flag(o, "size", ours, [r3(close["maj"])] + ([r3(close["min"])] if close.get("min") else []),
                 "; ".join(f"{s['src']} {r3(s['maj'])}'" for s in sizes))


SIZE_PREF = {"emission_nebula": ["Sh2", "RCW", "Ced", "LBN", "vdB"], "reflection_nebula": ["vdB", "Ced", "LBN", "Sh2", "RCW"],
             "supernova_remnant": ["Sh2", "Ced", "LBN", "RCW", "vdB"]}


def eval_other(o):
    aid, t = o["id"], o["type"]
    ours_d = facts_of(aid).get("d")
    a = ANCH.get(aid, {})
    votes = []  # (pc, short label)
    rec = {"d_refs": []}
    if a.get("lmc"):
        votes.append((LMC_PC, "LMC 49.59 kpc"))
    for s in a.get("star", []):
        d, short, long = star_distance(s)
        if d:
            votes.append((d, short))
            NOTES.setdefault(aid, []).append(long)
        else:
            NOTES.setdefault(aid, []).append(long)
    for c in a.get("cl", []):
        r = HR.get(c)
        if r and fnum(r["dist50"]):
            votes.append((float(r["dist50"]), f"HR23 {c} (N={r['N']}, logt {float(r['logAge50']):.1f})"))
    for name, rad in a.get("cloud", []):
        d, short = cloud_distance(o, name, rad)
        if d:
            votes.append((d, short))
    for pc, cite in a.get("lit", []):
        votes.append((pc, cite))
    if a.get("simbad"):
        v = [(d, b) for oid in OIDS.get(aid, []) for d, m, b in MES.get(oid, [])
             if (m.lower().startswith("paral") or m == "plx") and b[:4] >= "2018" and "633A..51Z" not in b]
        if aid == "M17":  # Xu et al. 2011 trigonometric maser parallax (no method code in SIMBAD)
            v += [(d, b) for oid in OIDS.get(aid, []) for d, m, b in MES.get(oid, []) if "2011ApJ...733...25X" in b]
        if v:
            votes.append((statistics.median(d for d, _ in v), "SIMBAD plx entries " + ", ".join(f"{d:.0f} pc {b}" for d, b in v)))
    for s in a.get("simbad_obj", []):
        r = STAR.get(s)
        ms = SMES.get(r["oid"], []) if r else []
        if ms:
            votes.append((statistics.median(d for d, _, _ in ms), f"{s} SIMBAD " + ", ".join(f"{d:.0f} pc {b}" for d, _, b in ms)))
    for c in a.get("alt_cl", []):  # shown, not voted
        r = HR.get(c)
        if r:
            rec["d_alt"] = [rnd(float(r["dist50"]) * LY), f"HR23 {c} (= NGC_3247 in HR23; log age {float(r['logAge50']):.1f}) at the SIMBAD position of NGC 3247, 14' SE of ours"]
    for d, src in votes:
        rec["d_refs"].append([rnd(d * LY), src])
    if votes:
        med = statistics.median(d for d, _ in votes)
        rec["d"] = rnd(med * LY)
        rec["d_src"] = ("median of " if len(votes) > 1 else "") + "; ".join(src for _, src in votes)
        rec["d_method"] = "anchors"
        ds = [d for d, _ in votes]
        tight = len(ds) >= 2 and max(ds) / min(ds) <= 1.10 or any("Fesen" in s for _, s in votes)
        if ours_d:
            r_ = ratio(ours_d, med * LY)
            ok = r_ <= 1.6
            stat(t, "d", ok)
            if not ok:
                flag(o, "d", ours_d, rec["d"], rec["d_src"])
            elif r_ > 1.25 and tight:
                flag(o, "d", ours_d, rec["d"], rec["d_src"], tier="precise")
        else:
            FILLS.append(aid)
    # sizes
    sizes = []
    if t == "supernova_remnant":
        g = GREEN.get(aid)
        if g and g in GREEN_T:
            r = GREEN_T[g]
            sizes.append({"maj": float(r["MajDiam"]), "min": fnum(r["MinDiam"]), "src": f"Green19 {g} ({r['Names'].split(',')[0]}, type {r['type'].strip()})"})
        if aid == "NGC2060":
            for r in MAGGI:
                if "157B" in r["OName"]:
                    sizes.append({"maj": float(r["XSize"]) / 60, "min": None, "src": f"Maggi16 MCSNR {r['MCSNR']} (N157B) X-ray"})
    if aid in BICA:
        tb, nm = BICA[aid]
        for r in BICA_T[tb]:
            if nm in r["Names"].split(",") or r["Names"].startswith(nm):
                sizes.append({"maj": float(r["amaj"]), "min": fnum(r["amin"]), "src": f"B08 {r['Names'].rstrip(',')}"})
                break
    if t == "dark_nebula":
        if aid == "B33":
            for r in BARN:
                if r["Barn"].strip() == "33" and fnum(r["Diam"]):
                    sizes.append({"maj": float(r["Diam"]), "min": None, "src": "Barnard B 33"})
            for r in DB02:
                if "B33" in [x.strip() for x in r["Names"].split(",")]:
                    sizes.append({"maj": float(r["MajAxis"]), "min": fnum(r["MinAxis"]), "src": "DB02 Horsehead,B33"})
        if aid == "C99":
            for r in DB02:
                if r["Names"].startswith("Coalsack"):
                    sizes.append({"maj": float(r["MajAxis"]), "min": fnum(r["MinAxis"]), "src": "DB02 Coalsack"})
                    rec["d_refs"].append([rnd(150 * LY), "DB02 note d=0.15 kpc"])
    if t in ("emission_nebula", "reflection_nebula", "supernova_remnant"):
        cs = find_sizes(o)
        pref = SIZE_PREF.get(t, []) + ["Sh2", "RCW", "Ced", "vdB", "LBN"]
        cs.sort(key=lambda s: (pref.index(s["cat"]), s["sep"] or 0))
        sizes += [{"maj": s["maj"], "min": s["min"], "src": s["src"]} for s in cs]
    finish_size(o, rec, sizes)
    return rec


for o in OBJS:
    rec = eval_pn(o) if o["type"] == "planetary_nebula" else eval_other(o)
    ours = facts_of(o["id"])
    if ours.get("mass") is not None:
        stat(o["type"], "mass", False)
        flag(o, "mass", ours["mass"], None, "no published nebular mass in any catalogue consulted")
    if NOTES.get(o["id"]):
        rec["notes"] = NOTES[o["id"]]
    # physical size the app would show vs. the reference one
    od, osz = ours.get("d"), (o.get("size") or [None])[0]
    rd, rsz = rec.get("d") or od, (rec.get("size") or [None])[0]
    if od and osz:
        rec["phys_ly_ours"] = rnd(phys_ly(osz, od))
    if rd and rsz:
        rec["phys_ly_ref"] = rnd(phys_ly(rsz, rd))
    OUT[o["id"]] = {k: v for k, v in rec.items() if v not in (None, [], {})}

# ----------------------------------------------------------------------------------------------- verdicts
# Written after reading each flag's evidence (see the report). Corrections are proposed only for "ours is wrong".
VERDICT = {
    ("NGC246", "d"): ("Wikipedia figure; the central star's Gaia EDR3 parallax (S/N 23) and every statistical distance give 1,600-1,800 ly", "ours is wrong"),
    ("NGC7009", "d"): ("Wikipedia figure; Gaia DR3 (S/N 11), GS21, CW21, FBP16 and HJ24 all give 3,900-4,200 ly", "ours is wrong"),
    ("IC4406", "d"): ("our value is the old Stanghellini statistical scale (SIMBAD median); Gaia DR3 parallax (S/N 7.5), GS21, CW21 and BS23 give 3,600-4,200 ly", "ours is wrong"),
    ("NGC3247", "d"): ("mixed identification: 1,592 pc is Loktin & Popova 2017's figure for the cluster NGC 3247 = Collinder 220 (Gaia: 7,500 ly, 200 Myr old, no HII region) 14' SE, while our position, type and size are those of the RCW 49 nebula around Westerlund 2 (Gaia: 15,000 ly)", "ours is wrong"),
    ("NGC6960", "d"): ("1,500 ly is the pre-Gaia 440 pc estimate; Gaia parallaxes of stars inside/behind the Cygnus Loop give 725±15 pc", "ours is wrong"),
    ("NGC6992", "d"): ("1,500 ly is the pre-Gaia 440 pc estimate; Gaia parallaxes of stars inside/behind the Cygnus Loop give 725±15 pc", "ours is wrong"),
    ("NGC1432", "d"): ("Maia is a Pleiades member; the Pleiades are at 135 pc (440 ly, Gaia), as our own NGC 1435 and IC 349 say", "ours is wrong"),
    ("IC5070", "d"): ("the Pelican is the same HII region (Sh2-117) as the North America Nebula, which we put at 2,600 ly; Gaia cluster UPK 127 and Zucker clouds give 2,600 ly", "ours is wrong"),
    ("IC349", "size"): ("25.7' is the extent of the whole Merope reflection nebula (vdB 22 / NGC 1435); IC 349 itself is a ~0.5' knot 0.6' from Merope (Cederblad 19i)", "ours is wrong"),
    ("M17", "size"): ("11' is the bright central bar seen in a telescope; Sharpless (60'), Cederblad (46'x37') and LBN (40'x30') give the whole HII region, so the physical size shown is ~4x too small", "judgement call (visual core vs full region)"),
    ("NGC3247", "size"): ("RCW 49 (90'x35') is the whole HII complex around Westerlund 2; our 5' is its bright core", "within literature spread"),
    ("NGC6164", "size"): ("RCW 107 (8'x4') covers both lobes NGC 6164 + 6165 and the halo around HD 148937; ours is one lobe", "within literature spread (component)"),
    ("NGC6165", "size"): ("RCW 107 (8'x4') covers both lobes NGC 6164 + 6165 and the halo around HD 148937; ours is one lobe", "within literature spread (component)"),
    ("NGC6188", "size"): ("RCW 108 (210'x120') is the whole Ara OB1 complex; NGC 6188 is its bright rim", "within literature spread (component)"),
    ("NGC2736", "size"): ("RCW 37 (13'x3') is noted as 'part of NGC 2736'", "within literature spread (component)"),
    ("NGC6960", "size"): ("Green's 230'x160' is the whole Cygnus Loop; the Western Veil is one filament", "within literature spread (component)"),
    ("NGC6992", "size"): ("Green's 230'x160' is the whole Cygnus Loop; the Eastern Veil is one filament", "within literature spread (component)"),
    ("NGC2392", "size"): ("only the SEC has a diameter (19.5\", the bright inner shell; HASH and T03 give none); our 52\" includes the outer shell, and no second catalogue arbitrates", "within literature spread"),
    ("NGC1432", "mass"): ("4.7 M☉ is a stellar mass (the B7 giant Maia), not the reflection nebula's; no nebular mass is published", "ours is wrong"),
    ("IC4605", "mass"): ("4.4 M☉ is a stellar-scale mass with no published nebular counterpart (IC 4605 is the reflection/emission nebula around the B2V star 22 Sco)", "ours is wrong"),
    ("NGC7293", "mass"): ("no catalogue lists a Helix nebular mass; published ionised + molecular masses differ by factors of several", "unverified"),
}
for fl in FLAGS:
    fl["cause"], fl["verdict"] = VERDICT.get((fl["id"], fl["field"]), ("", "unreviewed"))

# ----------------------------------------------------------------------------------------------- corrections
CORR = {}
for fl in FLAGS:
    if fl["verdict"] != "ours is wrong":
        continue
    c = CORR.setdefault(fl["id"], {})
    rec = OUT[fl["id"]]
    if fl["field"] == "d":
        c["d"] = rec["d"]
        c["d_src"] = rec["d_src"] if len(rec["d_src"]) < 220 else rec["d_src"][:217] + "..."
        if fl["id"] in ("NGC6960", "NGC6992"):
            c["d_src"] = "Fesen et al. 2021 (Gaia EDR3 stars in/behind the Cygnus Loop, 725±15 pc; arXiv:2109.05368); Fesen et al. 2018: 735±25 pc"
        if fl["id"] == "NGC3247":
            c["d_src"] = "Hunt & Reffert 2023 (VizieR J/A+A/673/A114) Westerlund 2, 4.53 kpc, the cluster ionising the RCW 49 nebula at our position (if NGC 3247 is instead meant as the cluster Collinder 220, use 7,500 ly and move it 14' SE)"
        if fl["id"] == "NGC1432":
            c["d"] = 440  # the Pleiades distance, as the app already uses for NGC 1435 and IC 349
            c["d_src"] = "Hunt & Reffert 2023 (VizieR J/A+A/673/A114) Pleiades (Melotte 22) 134.8 pc; Gaia DR3 parallax of Maia 7.67±0.31 mas"
        if fl["id"] == "IC5070":
            c["d_src"] = "Hunt & Reffert 2023 UPK 127 (796 pc) and Zucker et al. 2020 North America clouds (~800 pc) — same complex as NGC 7000"
    elif fl["field"] == "size":
        c["catalog"] = {"size": [0.5, 0.5], "src": "Cederblad 1946 (VizieR VII/231) Ced 19i = IC 349, 0.5'x0.5'"} if fl["id"] == "IC349" else {"size": fl["ref"], "src": fl["src"]}
    elif fl["field"] == "mass":
        c["mass"] = None
        c["mass_src"] = "remove: " + fl["cause"]

# ----------------------------------------------------------------------------------------------- outputs
SOURCES = {
    "C26": "Cavichia et al. 2026, Gaia DR3 central-star parallaxes (ZP-corrected), VizieR J/ApJ/1004/220",
    "GS21": "Gonzalez-Santamaria et al. 2021, Gaia EDR3 central stars, Bayesian distance, VizieR J/A+A/656/A51",
    "CW21": "Chornay & Walton 2021, Gaia EDR3 central stars (plx +0.017 mas ZP; combined distance), VizieR J/A+A/656/A110",
    "FBP16": "Frew, Parker & Bojicic 2016 H-alpha surface-brightness-radius distance, via Hernandez-Juarez et al. 2024 (VizieR J/other/RMxAA/60.227)",
    "SH18": "Stanghellini & Haywood 2018 statistical distance, via Hernandez-Juarez et al. 2024",
    "HJ24": "Hernandez-Juarez, Rodriguez & Pena 2024 adopted distance, VizieR J/other/RMxAA/60.227",
    "BS23": "Bucciarelli & Stanghellini 2023 Gaia-DR3-calibrated statistical distance, VizieR J/A+A/680/A104",
    "SH10": "Stanghellini & Haywood 2010 statistical distance, VizieR J/ApJ/714/1096",
    "HASH": "HASH PN database (Parker, Bojicic & Frew 2016), VizieR V/163 — major/minor diameter",
    "SEC": "Strasbourg-ESO Catalogue of Galactic PNe (Acker et al. 1992), VizieR V/84 — optical diameter",
    "T03": "Tylenda et al. 2003 PN dimensions at 10% of peak H-alpha surface brightness, VizieR J/A+A/405/627",
    "HR23": "Hunt & Reffert 2023 Gaia DR3 cluster census, VizieR J/A+A/673/A114 (dist50)",
    "Z20": "Zucker et al. 2020 molecular-cloud distances, VizieR J/A+A/633/A51 (median d50 of nearby sightlines)",
    "star": "ionising/illuminating star: Gaia DR3 parallax (VizieR I/355, +0.017 mas ZP) or Bailer-Jones et al. 2021 rgeo (VizieR I/352); Hipparcos 2007 via SIMBAD for very bright stars",
    "LMC": "Pietrzynski et al. 2019 LMC distance 49.59 kpc",
    "SIMBAD": "SIMBAD mesDistance entries (parallax-based, 2018+), simbad.cds.unistra.fr",
    "Green19": "Green 2019 Galactic SNR catalogue, VizieR VII/284",
    "Maggi16": "Maggi et al. 2016 LMC SNRs (XMM-Newton), VizieR J/A+A/585/A162",
    "B08": "Bica et al. 2008 LMC extended objects, VizieR J/MNRAS/389/678",
    "Sh2": "Sharpless 1959 HII regions, VizieR VII/20 (max diameter)",
    "RCW": "Rodgers, Campbell & Whiteoak 1960, VizieR VII/216",
    "Ced": "Cederblad 1946 bright diffuse nebulae, VizieR VII/231",
    "vdB": "van den Bergh 1966 reflection nebulae, VizieR VII/21 (2 x max radius)",
    "LBN": "Lynds 1965 bright nebulae, VizieR VII/9 (often the origin of OpenNGC sizes, so not fully independent)",
    "Barnard": "Barnard 1927 dark objects, VizieR VII/220A",
    "DB02": "Dutra & Bica 2002 Galactic dust clouds, VizieR J/A+A/383/631",
    "Fesen": "Fesen et al. 2018 (arXiv:1809.01713) and 2021 (arXiv:2109.05368) Cygnus Loop distance",
}
meta = {"generated_by": "scripts/crosscheck/nebulae.py", "n": len(OBJS), "types": TYPES,
        "units": {"d": "ly", "size": "arcmin [major, minor]", "phys_ly_ours": "ly (our size[0] x our d)", "phys_ly_ref": "ly (preferred catalogue size[0] x reference d)", "plx": "mas [value, error, table]"},
        "rules": {"pn_d": "Gaia CS plx (S/N>5, RUWE<2) else median of FBP16/SH18/BS23/SH10", "other_d": "median of anchors",
                  "size": "preferred = first of size_refs; agreement = within x2 of any catalogue"},
        "sources": SOURCES}
os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
with open(OUT_JSON, "w") as fh:
    json.dump({"meta": meta, "objects": OUT}, fh, separators=(",", ":"), ensure_ascii=False)
with open(OUT_CORR, "w") as fh:
    json.dump(CORR, fh, indent=1, ensure_ascii=False)
    fh.write("\n")


def fmt_d(x):
    return f"{x:,}" if isinstance(x, (int, float)) else str(x)


def fmt_sz(s):
    if not s:
        return "—"
    return "×".join(f"{v:g}′" for v in s if v is not None)


L = []
L.append("# Nebulae: cross-check against independent catalogues\n")
L.append(f"Generated by `scripts/crosscheck/nebulae.py` (re-runs from `.local/crosscheck-cache/nebulae/`; `--offline` never touches the network). "
         f"{len(OBJS)} objects: " + ", ".join(f"{sum(1 for o in OBJS if o['type'] == t)} {t}" for t in TYPES) + ". "
         "Reference values per object are in `shared/data/xcheck/nebulae.json`; proposed fixes in `scripts/crosscheck/nebulae-corrections.json`.\n")
L.append("## Sources\n")
for k, v in SOURCES.items():
    L.append(f"- **{k}**: {v}")
L.append("\nFrew et al. 2016 is not on VizieR as its own catalogue; its distances are read from the Hernandez-Juarez et al. 2024 compilation. "
         "Only names and coordinates were sent; ≤1 request/s.\n")
L.append("## Thresholds\n")
L.append("- PN distance: >40% from the Gaia central-star parallax distance when plx/err > 5 (RUWE < 2; Gaia DR3 from C26, else EDR3 from CW21); otherwise > factor 2 from the median of FBP16, SH18, BS23, SH10.")
L.append("- SNR / emission / reflection / dark distance: > factor 1.6 from the consensus (median of independent anchors: ionising/illuminating star parallax, HR23 cluster, Z20 cloud, LMC, parallax-based literature). "
         "A second tier ('precise') also flags a >25% miss when ≥2 anchors agree within 10% (or a ±2% published measurement), i.e. where the threshold would hide a clearly outdated value.")
L.append("- Angular size: no catalogue within a factor 2 of ours (sizes of diffuse nebulae differ widely between catalogues by definition, so agreement with any one counts).")
L.append("- Mass: any nebular mass in objectFacts is checked for a published nebular counterpart.\n")
L.append("## Summary\n")
L.append("| type | field | checked | agree | flagged |")
L.append("|---|---|---:|---:|---:|")
for t in TYPES:
    for f in ("d", "size", "mass"):
        s = STATS.get((t, f))
        if s:
            L.append(f"| {t} | {f} | {s[0]} | {s[1]} | {s[2]} |")
nprec = sum(1 for fl in FLAGS if fl["tier"] == "precise")
L.append(f"\nPlus {nprec} below-threshold distance flags (tier 'precise'; counted as 'agree' above). "
         f"PN distances checked against Gaia: {sum(1 for o in OBJS if OUT[o['id']].get('d_method') == 'gaia' and facts_of(o['id']).get('d'))}; "
         f"against statistical distances: {sum(1 for o in OBJS if OUT[o['id']].get('d_method') == 'statistical' and facts_of(o['id']).get('d'))}.\n")
L.append("## Discrepancies\n")
L.append("| id | name | field | ours | reference | source | physical size (ours → ref) | likely cause | verdict |")
L.append("|---|---|---|---|---|---|---|---|---|")
order = {"d": 0, "size": 1, "mass": 2}
for fl in sorted(FLAGS, key=lambda f: (f["verdict"] != "ours is wrong", order[f["field"]], f["type"], f["id"])):
    rec = OUT[fl["id"]]
    o_ = BYID[fl["id"]]
    od_, osz_ = facts_of(fl["id"]).get("d"), (o_.get("size") or [None])[0]
    if fl["field"] == "d":  # our angular size at the reference distance
        ph = f"{fmt_d(rnd(phys_ly(osz_, od_)))} → {fmt_d(rnd(phys_ly(osz_, fl['ref'])))} ly" if osz_ else ""
    elif fl["field"] == "size":  # reference angular size at the (corrected if flagged) distance
        dd = CORR.get(fl["id"], {}).get("d") or od_
        ph = f"{fmt_d(rnd(phys_ly(osz_, od_)))} → {fmt_d(rnd(phys_ly(fl['ref'][0], dd)))} ly" if od_ else ""
    else:
        ph = ""
    if fl["field"] == "d":
        ours_s, ref_s = f"{fmt_d(fl['ours'])} ly", f"{fmt_d(fl['ref'])} ly"
    elif fl["field"] == "size":
        ours_s, ref_s = fmt_sz(fl["ours"]), fmt_sz(fl["ref"])
    else:
        ours_s, ref_s = f"{fl['ours']} M☉", "—"
    tier = " (precise tier)" if fl["tier"] == "precise" else ""
    src = fl["src"].replace("|", "/")
    L.append(f"| {fl['id']} | {fl['name']} | {fl['field']}{tier} | {ours_s} | {ref_s} | {src} | {ph} | {fl['cause']} | **{fl['verdict']}** |")
L.append("\n## Missing in the app, reference available\n")
L.append("These objects have no distance in objectFacts; the reference value (not a correction) is in the xcheck file.\n")
L.append("| id | name | reference d | source |")
L.append("|---|---|---|---|")
for aid in FILLS:
    rec = OUT[aid]
    L.append(f"| {aid} | {BYID[aid]['name']} | {fmt_d(rec['d'])} ly | {rec['d_src'].replace('|', '/')} |")
nod = [o["id"] for o in OBJS if not facts_of(o["id"]).get("d") and not OUT[o["id"]].get("d")]
nosz = [o["id"] for o in OBJS if not OUT[o["id"]].get("size")]
L.append(f"\nNo reference distance found (and none in the app): {', '.join(nod) or '—'}. No catalogue size found: {', '.join(nosz) or '—'}.\n")
L.append("## Notes\n")
L.append("- PN central-star parallaxes and our values agree well: most of the app's PN distances already come from Gaia (SIMBAD 'plx'); the failures are the Wikipedia and old-statistical figures.")
L.append("- M 97 (ours 2,000 ly, Gaia 2,600) and NGC 6543 (3,300 vs 4,300) are 23% short of Gaia — inside the 40% band, but both are Wikipedia figures and Gaia S/N > 20.")
L.append("- NGC 7027 and NGC 5315 central stars have RUWE > 2.5 (Gaia parallaxes unreliable); checked against statistical distances instead.")
L.append("- PN sizes: HASH often includes faint halos/lobes, the SEC gives the bright shell, T03 the 10%-of-peak extent. Our values usually follow the SEC, so they pass, but for NGC 2440 (ours 0.27′ vs T03 0.98′, HASH 1.2′), NGC 6302 (0.74′ vs T03 1.5′, HASH 6.5′) and NGC 6445 (0.55′ vs HASH 3.7′) the physical size shown is the bright core only.")
L.append("- LBN sizes coincide exactly with many of ours (OpenNGC adopted them), so LBN agreement is weak evidence; Sh2, RCW, Cederblad and vdB are independent.")
L.append("- Masses: only three nebulae carry one; two are stellar masses attached to reflection nebulae.")
open(OUT_MD, "w").write("\n".join(L) + "\n")

print(f"wrote {OUT_JSON} ({os.path.getsize(OUT_JSON) / 1024:.0f} KB), {OUT_MD}, {OUT_CORR} ({len(CORR)} corrections); {len(FLAGS)} flags", file=sys.stderr)
if "--dump" in sys.argv:
    for fl in FLAGS:
        print(fl["id"], fl["field"], fl["tier"], fl["ours"], fl["ref"], fl["verdict"])
    print("FILLS", FILLS)
    print(STATS)
