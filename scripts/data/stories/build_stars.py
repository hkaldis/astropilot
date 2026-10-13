"""Add the bright named stars to shared/data/catalog.json as type "star" (run after build-catalog; idempotent: earlier
star entries are replaced). Input: cache/stars-simbad.json (fetch_stars.py), cache/IAU-CSN.txt, shared/data/starnames.json.

Names: the IAU name (WGSN catalogue) when the star has one, else its Bayer name ("Gamma Cassiopeiae"), with the
traditional or chart name kept as another name unless the IAU gives that name to a different star. A few famous fainter
stars keep their well-known names ("Garnet Star", "51 Pegasi") with the IAU name alongside."""
import json, os, re, sys, unicodedata

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(ROOT, "../../..")
sys.path.insert(0, ROOT)
from iau_names import load as load_iau  # noqa: E402

CAT_PATH = os.path.join(REPO, "shared/data/catalog.json")
STARS = json.load(open(os.path.join(ROOT, "cache/stars-simbad.json")))
NAMES = {s["name"]: s for s in json.load(open(os.path.join(REPO, "shared/data/starnames.json")))}
IAU = load_iau()
IAU_BY_HIP = {r["hip"]: r for r in IAU if r["hip"] not in ("_", "")}
# Names the WGSN adopted after that edition (from the stars' Wikipedia articles).
for _hip, _name in {"4427": "Tiansi", "71860": "Uridim", "68002": "Leepwal", "81693": "Tianji"}.items():
    IAU_BY_HIP[_hip] = {"name": _name, "hip": _hip}
IAU_NAME_HIP = {r["name"].lower(): r["hip"] for r in IAU}
GEN = dict(re.findall(r'"(\w{3})": "([^"]+)"', open(os.path.join(REPO, "shared/data/constellations-meta.ts")).read().split("CONSTELLATION_GENITIVES")[1]))

GREEK = {"alf": ("α", "Alpha"), "bet": ("β", "Beta"), "gam": ("γ", "Gamma"), "del": ("δ", "Delta"), "eps": ("ε", "Epsilon"), "zet": ("ζ", "Zeta"), "eta": ("η", "Eta"),
         "tet": ("θ", "Theta"), "iot": ("ι", "Iota"), "kap": ("κ", "Kappa"), "lam": ("λ", "Lambda"), "mu.": ("μ", "Mu"), "nu.": ("ν", "Nu"), "ksi": ("ξ", "Xi"),
         "omi": ("ο", "Omicron"), "pi.": ("π", "Pi"), "rho": ("ρ", "Rho"), "sig": ("σ", "Sigma"), "tau": ("τ", "Tau"), "ups": ("υ", "Upsilon"), "phi": ("φ", "Phi"),
         "chi": ("χ", "Chi"), "psi": ("ψ", "Psi"), "ome": ("ω", "Omega")}
SUP = str.maketrans("0123456789", "⁰¹²³⁴⁵⁶⁷⁸⁹")

# Stars whose brightness swings enough to matter: [brightest, faintest(, period days)] and a typical magnitude.
VARY = {
    "Betelgeuse": ([0.0, 1.6], 0.5), "Mira": ([2.0, 10.1, 332], 6.0), "Algol": ([2.1, 3.4, 2.87], 2.1), "Chi Cygni": ([3.3, 14.2, 408], 8.0),
    "Hind's Crimson Star": ([5.5, 11.7, 445], 8.0), "R Coronae Borealis": ([5.7, 15.2], 5.9), "T Coronae Borealis": ([2.0, 10.8], 10.2),
    "Garnet Star": ([3.4, 5.1], 4.1), "La Superba": ([4.8, 6.3, 160], 5.4), "VY Canis Majoris": ([6.5, 9.6], 7.9), "Navi": ([1.6, 3.0], 2.2),
}
# Popular names people search for that SIMBAD doesn't list.
NICKNAMES = {"Sirius": ["Dog Star"], "Mira": ["Mira Ceti"], "Proxima Centauri": ["Alpha Centauri C"], "Barnard's Star": ["Barnard's Runaway Star"],
             "Eta Carinae": ["Eta Car"], "T Coronae Borealis": ["Blaze Star"], "Algol": ["Demon Star"],
             "Aldebaran": ["Bull's Eye"], "Capella": ["Goat Star"]}
# SIMBAD's magnitude is out of date (η Carinae has brightened to about 4.3 since the 1990s).
MAG_FIX = {"Eta Carinae": 4.3}
# Well-known names kept for the famous fainter stars, even where the IAU has since given another.
KEEP_NAME = {"51 Pegasi", "Epsilon Eridani", "Polaris Australis", "Tau Ceti", "Garnet Star", "Hind's Crimson Star", "La Superba", "Chi Cygni",
             "R Coronae Borealis", "T Coronae Borealis", "Eta Carinae", "VY Canis Majoris", "Barnard's Star", "Proxima Centauri", "Mira", "Thuban"}
# Chart names that are another star's IAU name, or simply wrong (see build-sky.mjs NAME_FIXES).
BAD_ALIAS = {"Atik", "Alnair#2", "Girtab", "Shedar"}

def slug(s):
    s = unicodedata.normalize("NFKD", s.translate(str.maketrans("¹²³", "123"))).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower().replace("'", "")).strip("-")

def bayer(ids):
    """("γ Cas", "Gamma Cassiopeiae", "Cas") from SIMBAD ids like "* gam Cas" / "* gam02 Vel"; also the Flamsteed number."""
    b = f = con = None
    for i in ids:
        m = re.match(r"^\*\s+([a-z]{2,3}\.?)(\d{2})?\s+([A-Z][A-Za-z]{2})(?:\s+A)?$", i.strip())
        if m and m.group(1) in GREEK and b is None:
            g, word = GREEK[m.group(1)]
            n = str(int(m.group(2))).translate(SUP) if m.group(2) else ""
            con = m.group(3)
            b = (f"{g}{n} {con}", f"{word}{n} {GEN.get(con, con)}")
        m = re.match(r"^\*\s+(\d+)\s+([A-Z][A-Za-z]{2})(?:\s+A)?$", i.strip())
        if m and f is None:
            f = f"{m.group(1)} {m.group(2)}"
            con = con or m.group(2)
        m = re.match(r"^V\*\s+\S+\s+([A-Z][A-Za-z]{2})$", i.strip())
        if m and con is None:
            con = m.group(1)
    return b, f, con

def build():
    catalog = [o for o in json.load(open(CAT_PATH)) if o["type"] != "star"]
    taken = {o["id"].lower() for o in catalog} | {"moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune"}
    entries = []
    for key, s in STARS.items():
        ids = [re.sub(r"\s+", " ", i).strip() for i in s["ids"]]
        hip = next((i.split()[1] for i in ids if i.startswith("HIP ")), None)
        hr = next((i for i in ids if re.match(r"^HR \d+$", i)), None)
        hd = next((i for i in ids if re.match(r"^HD \d+$", i)), None)
        (b_short, b_long), flam, con = (bayer(ids)[0] or (None, None)), bayer(ids)[1], bayer(ids)[2]
        chart = s["name"]
        iau = IAU_BY_HIP.get(hip)
        iau_name = iau["name"] if iau and iau["name"][:1].isupper() else None
        if chart in KEEP_NAME or key in KEEP_NAME:
            name = chart
        elif iau_name:
            name = iau_name
        elif key not in BAD_ALIAS and chart.lower() not in IAU_NAME_HIP and b_long:
            name = b_long  # an informal chart name (Navi, Regor…) stays as another name
        else:
            name = b_long or chart
        alts = []
        for a in [iau_name, None if key in BAD_ALIAS else chart, *NICKNAMES.get(chart, [])] + [i[5:] for i in ids if i.startswith("NAME ")]:
            if not a or a.lower() == name.lower() or re.search(r"\b[ABC]$|\bstar$", a, re.I) and a.lower().endswith((" a", " b", " c")):
                continue
            if a.lower() in IAU_NAME_HIP and IAU_NAME_HIP[a.lower()] != hip:
                continue  # the IAU gives this name to another star
            if a not in alts:
                alts.append(a)
        # The Bayer name comes first after the name (page titles read "Betelgeuse (Alpha Orionis)"), then other names.
        desig = [name] + ([b_long] if b_long and b_long != name else []) + [a for a in alts if a != b_long]
        # Variable-star names ("R Lep" → also "R Leporis"), for the stars known by them.
        var = [i[3:] for i in ids if re.match(r"^V\* [A-Z]{1,2} [A-Z][A-Za-z]{2}$", i)]
        var_long = [f"{v.split()[0]} {GEN.get(v.split()[1], v.split()[1])}" for v in var]
        for d in [b_short, *var_long, *var, flam, hr, hd, f"HIP {hip}" if hip else None]:
            if d and d not in desig:
                desig.append(d)
        sid = slug(name)
        if sid in taken:
            sid = f"{sid}-star"
        taken.add(sid)
        v = s["V"] if s["V"] is not None else NAMES.get(chart, {}).get("mag")
        vary, typical = VARY.get(chart, (None, None))
        e = {"id": sid, "name": name, "designations": desig, "type": "star", "ra": round(s["ra"], 4), "dec": round(s["dec"], 3)}
        e["mag"] = round(typical if typical is not None else MAG_FIX.get(chart, v), 2)
        e["con"] = con
        if s["sp"]:
            e["sp"] = s["sp"]
        if s["V"] is not None and s["B"] is not None:
            e["bv"] = round(s["B"] - s["V"], 2)
        if vary:
            e["vary"] = vary
        entries.append(e)
        if not con:
            print("NO CONSTELLATION", key, ids[:6], file=sys.stderr)
    entries.sort(key=lambda e: e["mag"])
    KEY_ORDER = ["id", "name", "designations", "m", "c", "type", "ra", "dec", "mag", "magB", "magOf", "size", "sb", "con", "hubble", "sep", "mag2", "pa", "sp", "bv", "vary", "desc", "showpiece"]
    out = [{k: o[k] for k in KEY_ORDER if k in o} | {k: v for k, v in o.items() if k not in KEY_ORDER} for o in catalog + entries]
    return out, entries

if __name__ == "__main__":
    out, entries = build()
    if "--dry" in sys.argv:
        for e in entries:
            print(f"{e['id']:<24} {e['name']:<22} {e['mag']:>5} {e.get('sp',''):<14} {e['con']}  {e['designations'][1:4]}")
        sys.exit()
    # Keep descriptions already written for stars (merge.py fills them from the stories).
    old = {o["id"]: o for o in json.load(open(CAT_PATH)) if o["type"] == "star"}
    for o in out:
        if o["type"] == "star" and old.get(o["id"], {}).get("desc"):
            o["desc"] = old[o["id"]]["desc"]
    raw = open(CAT_PATH).read()
    json.dump(out, open(CAT_PATH, "w"), ensure_ascii=False, indent=None if not raw.startswith("[\n") else 2, separators=None if raw.startswith("[\n") else (",", ":"))
    print(f"{len(entries)} stars; catalog now {len(out)} objects", file=sys.stderr)
