#!/usr/bin/env python3
"""Cross-check the app's galaxies and galaxy groups against independent extragalactic databases.

What the app shows (read only): shared/data/catalog.json (size [maj, min] arcmin, mag, magB) and
shared/data/objectFacts.json (d light-years, src, mass M_sun "all told", stars).

References (open, none of them Wikipedia, none of them the SIMBAD medians the app's distances came from):
  * HyperLEDA meandata (Makarov et al. 2014): logd25 / logr25 -> D25 size, bt / btc / vt, bvtc, mod0 / modz,
    vmaxg (inclination-corrected rotation), vdis.
  * RC3 (de Vaucouleurs et al. 1991, VizieR VII/155): D25, BT, (B-V)T -> VT = BT - (B-V)T.
  * Cosmicflows-4 (Tully et al. 2023, VizieR J/ApJ/944/94): per-galaxy DM by method (Cepheid, TRGB, SBF, maser, ...)
    and group distances.
  * NED-D, NED's redshift-independent distances (per-object nDistance pages): median of modern (>= 2000)
    measurements, primary methods (Cepheids, TRGB, SBF, masers, ...) separately.
  * Hickson Compact Groups (VizieR VII/213): angular size, total magnitude, redshift.
  * A short table of published total (halo) masses, cited, for the few galaxies where one is well measured.

Run:   python3 scripts/crosscheck/galaxies.py            (fetches what is not cached, <= 1 request/s)
       python3 scripts/crosscheck/galaxies.py --offline  (cache only)
Cache: .local/crosscheck-cache/galaxies/
Writes: shared/data/xcheck/galaxies.json, scripts/crosscheck/galaxies-report.md, scripts/crosscheck/galaxies-corrections.json
"""
import csv, html, io, json, math, os, re, statistics, sys, time, urllib.parse, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."))
CACHE = os.path.join(ROOT, ".local/crosscheck-cache/galaxies")
OUT_JSON = os.path.join(ROOT, "shared/data/xcheck/galaxies.json")
OUT_MD = os.path.join(ROOT, "scripts/crosscheck/galaxies-report.md")
OUT_CORR = os.path.join(ROOT, "scripts/crosscheck/galaxies-corrections.json")
OFFLINE = "--offline" in sys.argv
UA = "AstroPilot-crosscheck/1.0 (data validation; contact via github.com/hkaldis)"
LY_PER_PC = 3.261563777
G = 4.30091e-3  # pc Msun^-1 (km/s)^2
os.makedirs(CACHE, exist_ok=True)

CAT = json.load(open(os.path.join(ROOT, "shared/data/catalog.json")))
_F = json.load(open(os.path.join(ROOT, "shared/data/objectFacts.json")))
FACTS = _F.get("facts", _F)
GAL = [o for o in CAT if o["type"] in ("galaxy", "galaxy_group")]

# ---------------------------------------------------------------------------------------------- fetching (cached)
_last = [0.0]

def fetch(url, key, data=None, timeout=120):
    path = os.path.join(CACHE, key)
    if os.path.exists(path):
        return open(path, encoding="utf-8").read()
    if OFFLINE:
        return None
    wait = 1.1 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                txt = r.read().decode("utf-8", "replace")
            _last[0] = time.time()
            open(path, "w", encoding="utf-8").write(txt)
            return txt
        except Exception as e:  # noqa: BLE001
            print(f"  retry {key}: {e}", file=sys.stderr)
            _last[0] = time.time()
            time.sleep(3 + 5 * attempt)
    return None

def vizier_tap(query, key):
    data = urllib.parse.urlencode({"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "csv", "QUERY": query}).encode()
    txt = fetch("https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync", key, data=data)
    return list(csv.DictReader(io.StringIO(txt))) if txt else []

def fnum(x):
    try:
        v = float(x)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None

# ---------------------------------------------------------------------------------------------- identifiers
def pgc_of(o):
    for d in o["designations"]:
        m = re.match(r"^PGC (\d+)$", d)
        if m:
            return int(m.group(1))
    return None

EXTRA_PGC = {"NGC4676": [43062, 43065]}  # the Mice: HyperLEDA lists the two galaxies (and the pair as PGC 4588524)
HCG = {"HCG79": 79, "HCG92": 92}

def ned_name(o):
    if o["id"] in HCG:
        return f"HCG {HCG[o['id']]:03d}"
    if o["id"] == "NGC4676":
        return "NGC 4676A"
    if o["id"] == "ESO56-115":
        return "Large Magellanic Cloud"
    if o["id"] == "NGC292":
        return "Small Magellanic Cloud"
    for d in o["designations"]:
        if re.match(r"^(NGC|IC) \d+[A-Z]?$", d):
            return d
    p = pgc_of(o)
    return f"PGC {p:06d}" if p else o["designations"][0]

# ---------------------------------------------------------------------------------------------- HyperLEDA
LEDA_FIELDS = "objname,pgc,logd25,e_logd25,logr25,bt,e_bt,btc,vt,e_vt,bvtc,modbest,e_modbest,mod0,e_mod0,modz,vmaxg,e_vmaxg,vdis,v,vvir,type,t,incl,ag"

def leda_rows(pgcs, key):
    q = urllib.parse.urlencode({"n": "meandata", "c": "o", "of": "1,leda,simbad", "nra": "l", "nakd": "1", "d": LEDA_FIELDS,
                                "sql": f"pgc in ({','.join(map(str, pgcs))})", "ob": "", "a": "csv[,]"})
    txt = fetch("http://atlas.obs-hp.fr/hyperleda/fG.cgi?" + q, key)
    if not txt:
        return []
    lines = [l for l in txt.splitlines() if l and not l.startswith("#")]
    return list(csv.DictReader(io.StringIO("\n".join(lines))))

# ---------------------------------------------------------------------------------------------- NED-D
PRIMARY = ("cepheid", "trgb", "sbf", "maser", "eclipsing", "rr lyrae", "miras", "jagb", "red clump", "horizontal branch", "carbon star")

def ned_distances(o):
    key = "ned-" + re.sub(r"[^A-Za-z0-9]+", "_", ned_name(o)) + ".html"
    txt = fetch("https://ned.ipac.caltech.edu/cgi-bin/nDistance?" + urllib.parse.urlencode({"name": ned_name(o)}), key, timeout=90)
    if not txt:
        return None
    rows = []
    i = txt.find("Individually Referenced")
    for tr in re.findall(r"<tr>(.*?)</tr>", txt[i:] if i >= 0 else "", re.S):
        tds = [html.unescape(re.sub(r"<[^>]+>", "", t)).strip() for t in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if len(tds) < 5:
            continue
        dm, d = fnum(tds[0]), fnum(tds[2])
        if dm is None or d is None:
            continue
        year = int(tds[4][:4]) if re.match(r"^\d{4}", tds[4]) else None
        rows.append({"dm": dm, "mpc": d, "method": tds[3], "ref": tds[4], "year": year, "notes": tds[5] if len(tds) > 5 else ""})
    return rows

def ned_summary(rows):
    if not rows:
        return None
    # NED-D gives values as published, not homogenised: 1980s Tully-Fisher distances are on an H0 ~ 100 scale (~30 %
    # short) and "Tully est" (NBG 1988) is a group/redshift estimate. Only post-2000 measurements are used, and the
    # all-methods median only when at least two papers contribute.
    modern = [r for r in rows if (r["year"] or 0) >= 2000 and "APPARENT" not in r["notes"].upper() and "tully est" not in r["method"].lower()]
    prim = [r for r in (modern or rows) if any(p in r["method"].lower() for p in PRIMARY)]
    out = {"n": len(rows), "n_modern": len(modern)}
    if modern and len({r["ref"] for r in modern}) >= 2:
        out["all_mpc"] = statistics.median(r["mpc"] for r in modern)
        out["n_all"] = len(modern)
    if prim:
        out["prim_mpc"] = statistics.median(r["mpc"] for r in prim)
        out["n_prim"] = len(prim)
        meth = sorted({r["method"].strip() for r in prim})
        out["prim_methods"] = ", ".join(meth)
    return out

# ---------------------------------------------------------------------------------------------- published total masses
# Only where a total (halo, "stars, gas and dark matter") mass is well measured. Stellar masses are listed so the
# app's star counts can be judged (stars ~ M* / 0.4 Msun for a Kroupa IMF, to a factor ~2).
LIT = {
    "ESO56-115": {"mass": 1.4e11, "mass_src": "Erkal et al. 2019, MNRAS 487, 2685 (1.38e11 Msun, from the Orphan stream; also Peñarrubia+2016 2.5e11, Shipp+2021 1.4e11)",
                  "mstar": 2.7e9, "mstar_src": "van der Marel et al. 2002, AJ 124, 2639",
                  "m_inner": 1.7e10, "m_inner_src": "van der Marel & Kallivayalil 2014, ApJ 781, 121: 1.7e10 within 8.7 kpc"},
    "NGC292": {"mstar": 3.1e8, "mstar_src": "Skibba et al. 2012, ApJ 761, 42 (Harris & Zaritsky 2004: 3.1e8)"},
    "M31": {"mass": 1.5e12, "mass_src": "Watkins et al. 2010 1.4e12; Patel et al. 2017 1.37e12; Fardal et al. 2013 2.0e12; range 0.8-2.5e12",
            "mstar": 1.2e11, "mstar_src": "Tamm et al. 2012, A&A 546, A4 (1.0-1.5e11); Sick et al. 2015 1.0e11"},
    "M101": {"mstar": 5.3e10, "mstar_src": "van Dokkum et al. 2014, ApJ 782, L24"},
    "M33": {"mass": 4.3e11, "mass_src": "Corbelli et al. 2014, A&A 572, A23 (virial mass 4.3 +/- 1.0e11; 5e10 is only the mass inside 17 kpc, Corbelli 2003)",
            "mstar": 5e9, "mstar_src": "Corbelli et al. 2014 (4.8-5.5e9)"},
}

# ---------------------------------------------------------------------------------------------- reviewer notes
# Likely cause + verdict for each flagged item, written after reading the first run. Keyed "id:field".
LV = "OpenNGC's V-Mag is HyperLEDA's vt, which here is fainter than its own B (bt) — impossible for a galaxy of this colour"
NOTES = {
    # distances
    "NGC1566:d": "Ours is the median of 1980s–2010s Tully-Fisher values (5.5–10 Mpc, several on an H0≈100 scale). TRGB (Sabbi+2018, LEGUS) gives 17.9 Mpc, matching its Hubble-flow distance (17 Mpc) and the Dorado-group SBF members NGC 1549/1553 (~60 Mly). **Error → 58 Mly.**",
    "NGC3938:d": "Ours (12.9 Mpc) is pulled down by 1984 Tully-Fisher values on an H0≈100 scale. SN II distances: 17.9 Mpc (Poznanski+2009), 21.9–22.4 Mpc (Rodríguez+2014); Hubble flow ~15 Mpc. **Error → ~58 Mly** (17.9 Mpc).",
    "NGC4490:d": "TRGB from Cosmicflows-4 (6.9 Mpc) and NED-D (6.5 Mpc) agree; ours (8.9 Mpc) is a mixed SIMBAD median. **Error → 22 Mly.**",
    "NGC4568:d": "Ours is the bare redshift (v ≈ 2300 km/s), wrong for a Virgo-cluster member with a large peculiar velocity. Post-2000 Tully-Fisher 17.3–19.7 Mpc; its interacting partner NGC 4567 is 55 Mly in the app. **Error → 55 Mly.**",
    "NGC4596:d": "Ours is the bare redshift (v ≈ 1900 km/s); Virgo member. Cosmicflows-4 SBF 16.8 Mpc. **Error → 55 Mly.**",
    "NGC5643:d": "Ours is the bare redshift. SH0ES Cepheids + TRGB (Cosmicflows-4) 12.7 Mpc; host of SN 2017cbv. **Error → 41 Mly.**",
    "M108:d": "Ours is Wikipedia's (≈ Hubble-flow) value. Cosmicflows-4 (Tully-Fisher) 9.2 Mpc and the median of 11 post-2000 TF distances 9.9 Mpc agree; no TRGB/Cepheid exists. **Error → 31 Mly.**",
    "NGC4565:d": "Below the 30 % cut against the blended reference, but the references disagree: the TRGB distance (Radburn-Smith+2011, 11.9 Mpc; Cosmicflows-4 weighted 11.9 Mpc) vs SBF 16–18 Mpc (one survey and its recalibrations; SBF is unreliable in a dusty edge-on disc). Ours (57 Mly) is the SBF value; TRGB says 39 Mly, which also brings its width from 280,000 to 190,000 ly. **Likely error → 39 Mly** (judgement: TRGB over SBF).",
    "NGC4051:d": "−28 %: Cosmicflows-4 Cepheids (Yuan+2021) 16.6 Mpc = 54 Mly vs ours 39 Mly. Under threshold; 54 Mly would be better.",
    "NGC5068:d": "+24 %: TRGB 5.16 Mpc (Karachentsev+2017; CF4 5.0 Mpc) = 17 Mly vs ours 21 Mly. Under threshold; 17 Mly would be better.",
    "ESO97-13:d": "−35 % (secondary tier, 40 % cut): Circinus is 4.2 Mpc = 13.7 Mly (Tully+2009, Karachentsev+2013); ours 9.1 Mly is low. Consider 13.7 Mly.",
    "M77:d": "+39 % vs Tully-Fisher 10.1 Mpc (two papers); ours 14.4 Mpc is the long-standing literature value (Bland-Hawthorn+1997). Genuinely uncertain — keep.",
    "IC342:d": "Cosmicflows-4 lists TRGB 26.75 mag (2.2 Mpc), but the TRGB paper itself (Wu+2014) and Cepheids give 3.3 Mpc = 10.8 Mly — ours (11 Mly) agrees with those. Keep.",
    "NGC4567:d": "Its redshift (v ≈ 2300 km/s) would give 110 Mly, wrong for a Virgo member; checked against its partner NGC 4568 instead (post-2000 TF, 57 Mly). Ours 55 Mly is right.",
    # magnitudes
    "NGC2841:mag": f"{LV} (vt ±1.37). RC3 VT 9.22; LEDA bt − RC3 (B−V) gives 9.19. **Error → 9.2.**",
    "NGC5005:mag": f"{LV} (vt ±1.64). RC3 VT 9.81; LEDA bt − RC3 (B−V) 9.74. **Error → 9.8.**",
    "NGC4438:mag": "LEDA vt (±1.21) gives B−V 0.05 for an S0/a with RC3 B−V 0.85. RC3 VT 10.17; LEDA bt − (B−V) 10.12. **Error → 10.2.**",
    "NGC55:mag": f"{LV} (vt 8.54 > bt 8.39). RC3 VT 7.87 (BT 8.42, B−V 0.55); LEDA bt − (B−V) 7.84. **Error → 7.9.**",
    "NGC300:mag": "LEDA vt gives B−V 0.11; RC3 B−V 0.59. RC3 VT 8.13; LEDA bt − (B−V) 8.18. **Error → 8.1** (borderline 0.5 mag, but both routes agree).",
    "NGC1313:mag": "LEDA vt gives B−V 0.16 (RC3 0.49), but the B magnitudes also disagree (LEDA 9.65, RC3 9.20): V is 8.7 (RC3) or 9.2 (LEDA bt − B−V). Soft — keep, or use ~9.0.",
    "NGC6744:mag": "V 9.25 is fainter than LEDA bt 9.14; a Sbc spiral has B−V ≈ 0.7, so V ≈ 8.4–8.5. No measured total V found (not in RC3). Soft — likely too faint by ~0.7 mag.",
    "NGC3561:mag": "V 14.7 fainter than LEDA bt 14.46 (the Guitar, a faint pair). Small object, effect on visibility is minor. Soft.",
    "ESO270-17:mag": "LEDA vt implies B−V 0.04 for a dusty edge-on at low galactic latitude (should be red). Soft — V probably ~0.5 mag too faint.",
    # masses
    "ESO56-115:mass": "1e10 is the old dynamical mass inside ~9 kpc (van der Marel & Kallivayalil 2014 give 1.7e10 inside 8.7 kpc); stellar mass is 2.7e9. The total with its dark halo is 1.4e11 (Erkal+2019; Shipp+2021 1.4e11; Peñarrubia+2016 2.5e11). **Error → 1.4e11.**",
    "M33:mass": "5e10 is the mass inside 17 kpc (Corbelli 2003). The app says 'all told … and dark matter': the virial mass is 4.3±1.0e11 (Corbelli+2014; Patel+2017 use 2.5e11). **Error → 4e11.**",
    "IC1613:mass": "1.1e8 is the stellar mass (McConnachie 2012: M★ 1.0e8; our B-band estimate 9e7); its HI rotation alone needs several ×1e8. Not a total. **Drop** (no solid total).",
    "NGC2841:mass": "7e10 is below the mass its own 290 km/s rotation needs inside D25 (v²R/G ≈ 3e11) and ≈ its stellar mass; the HI rotation curve stays flat to ~50 kpc (THINGS), implying ~1e12. **Drop** (no single solid total).",
    "NGC7793:mass": "3.2e9 ≈ its stellar mass (B-band estimate 2e9) and below v²R₂₅/G even with LEDA's low vmax (77 km/s; the HI curve reaches ~115). Not a total. **Drop.**",
    "NGC6744:mass": "5.9e10 ≈ the B-band stellar-mass estimate (4e10) and ~v²R₂₅/G — the mass inside the visible disk at most, not 'all told' (a Milky-Way-sized spiral; total ~1e12). Soft — consider dropping.",
    # stars
    "M101:stars": "Published M★ 5.3e10 (van Dokkum+2014) → ~1.3e11 stars; even a mean stellar mass of 0.2 M☉ gives < 3e11. The 'trillion stars' figure is a 2006 press-release number. **Error → 1.3e11** (or drop).",
    "M31:stars": "M★ 1.0–1.5e11 (Tamm+2012) → 2.5–4e11 stars. 'A trillion' is the popular round figure, ~3× high. Soft — 4e11 would be defensible.",
    "M33:stars": "M★ ≈ 5e9 (Corbelli+2014) → ~1.3e10 stars; 4e10 is the popular figure, ~3× high. Soft.",
    "NGC292:stars": "M★ ≈ 3.1e8 (Skibba+2012; Harris & Zaritsky 2004) → ~8e8 stars; 3e9 is ~4× high. Soft — ~1e9 would be defensible.",
    "M63:stars": "B-band M★ estimate 3.7e10 (literature ~5–8e10) → 1–2e11 stars; 4e11 is 2–4× high. Soft.",
    "M100:stars": "B-band M★ estimate ~5e10 → ~1.2e11 stars; 4e11 is ~3× high. Soft.",
}
# Clear errors -> corrections file. Keyed by id; values merged into the corrections entry.
CORRECT = {
    "ESO56-115": {"mass": 1.4e11, "mass_src": "Erkal et al. 2019, MNRAS 487, 2685 (total incl. dark halo, 1.38e11 Msun)"},
    "M33": {"mass": 4e11, "mass_src": "Corbelli et al. 2014, A&A 572, A23 (virial mass 4.3 +/- 1.0e11 Msun)"},
    "IC1613": {"mass": None, "mass_src": "drop: 1.1e8 is the stellar mass (McConnachie 2012), not a total"},
    "NGC2841": {"mass": None, "mass_src": "drop: 7e10 is below v^2 R25 / G = 3e11 for its 290 km/s rotation; not a total"},
    "NGC7793": {"mass": None, "mass_src": "drop: 3.2e9 is ~its stellar mass, below its disk dynamical mass; not a total"},
    "M101": {"stars": 1.3e11, "stars_src": "M* = 5.3e10 Msun (van Dokkum et al. 2014, ApJ 782, L24) / 0.4 Msun per star"},
    # distances: d_src is the app's DISTANCE_SOURCE key; d_ref says exactly where the number comes from
    "NGC1566": {"d": 5.8e7, "d_src": "cep", "d_ref": "TRGB 17.9 Mpc (Sabbi et al. 2018, ApJS 235, 23); Hubble flow 17 Mpc"},
    "NGC3938": {"d": 5.8e7, "d_src": "lit", "d_ref": "SN II 17.9 Mpc (Poznanski et al. 2009); 21.9-22.4 Mpc (Rodriguez et al. 2014)"},
    "NGC4490": {"d": 2.2e7, "d_src": "cep", "d_ref": "TRGB 6.9 Mpc (Cosmicflows-4, Tully et al. 2023); NED-D TRGB 6.5 Mpc"},
    "NGC4568": {"d": 5.5e7, "d_src": "lit", "d_ref": "Virgo member; post-2000 Tully-Fisher 17.3-19.7 Mpc (NED-D); same as partner NGC 4567"},
    "NGC4596": {"d": 5.5e7, "d_src": "sbf", "d_ref": "SBF 16.8 Mpc (Cosmicflows-4, Tully et al. 2023)"},
    "NGC5643": {"d": 4.1e7, "d_src": "cep", "d_ref": "Cepheids + TRGB 12.7 Mpc (Cosmicflows-4; Riess et al. 2022)"},
    "M108": {"d": 3.1e7, "d_src": "lit", "d_ref": "Tully-Fisher 9.2 Mpc (Cosmicflows-4); median of 11 post-2000 TF distances 9.9 Mpc (NED-D)"},
    "NGC4565": {"d": 3.9e7, "d_src": "cep", "d_ref": "TRGB 11.9 Mpc (Radburn-Smith et al. 2011, ApJS 195, 18; adopted by Cosmicflows-4); replaces SBF 17.5 Mpc"},
}
RC3V = "RC3 VT = BT - (B-V)T (de Vaucouleurs et al. 1991); the OpenNGC/HyperLEDA vt used now implies B-V <= 0.11 (or V fainter than B)"
CATALOG_FIX = {  # catalog.json fields
    "NGC2841": {"mag": 9.2, "src": RC3V},
    "NGC5005": {"mag": 9.8, "src": RC3V},
    "NGC4438": {"mag": 10.2, "src": RC3V},
    "NGC55": {"mag": 7.9, "src": RC3V},
    "NGC300": {"mag": 8.1, "src": RC3V},
}
for _k, _v in CATALOG_FIX.items():
    CORRECT.setdefault(_k, {})["catalog"] = _v


# ---------------------------------------------------------------------------------------------- main
def main():
    pgcs = sorted({p for o in GAL for p in ([pgc_of(o)] if pgc_of(o) else []) + EXTRA_PGC.get(o["id"], [])})
    print(f"{len(GAL)} galaxies/groups, {len(pgcs)} PGC numbers", file=sys.stderr)

    leda = {}
    for k in range(0, len(pgcs), 80):
        for r in leda_rows(pgcs[k:k + 80], f"leda-{k:03d}.csv"):
            if fnum(r.get("pgc")):
                leda[int(float(r["pgc"]))] = r
    print(f"HyperLEDA: {len(leda)} rows", file=sys.stderr)

    rc3 = {}
    for k in range(0, len(pgcs), 120):
        chunk = pgcs[k:k + 120]
        q = ("SELECT PGC, name, D25, R25, BT, \"B-VT\", T FROM \"VII/155/rc3\" WHERE PGC IN (" + ",".join(f"'PGC{p:>5d}'" for p in chunk) + ")")
        for r in vizier_tap(q, f"rc3-{k:03d}.csv"):
            m = re.search(r"(\d+)", r.get("PGC", ""))
            if m:
                rc3[int(m.group(1))] = r
    print(f"RC3: {len(rc3)} rows", file=sys.stderr)

    cf4 = {}
    for k in range(0, len(pgcs), 150):
        q = 'SELECT * FROM "J/ApJ/944/94/table2" WHERE PGC IN (' + ",".join(map(str, pgcs[k:k + 150])) + ")"
        for r in vizier_tap(q, f"cf4-{k:03d}.csv"):
            cf4[int(r["PGC"])] = r
    groups_needed = sorted({int(r["1PGC"]) for r in cf4.values() if fnum(r.get("1PGC"))})
    cf4g = {}
    for k in range(0, len(groups_needed), 150):
        q = 'SELECT * FROM "J/ApJ/944/94/groups" WHERE "1PGC" IN (' + ",".join(map(str, groups_needed[k:k + 150])) + ")"
        for r in vizier_tap(q, f"cf4g-{k:03d}.csv"):
            cf4g[int(r["1PGC"])] = r
    print(f"CF4: {len(cf4)} galaxies, {len(cf4g)} groups", file=sys.stderr)

    hcg = {int(r["HCG"]): r for r in vizier_tap('SELECT * FROM "VII/213/groups" WHERE HCG IN (\'79\',\'92\')', "hcg-groups.csv") if fnum(r.get("HCG"))}

    ned = {}
    for i, o in enumerate(GAL):
        rows = ned_distances(o)
        ned[o["id"]] = ned_summary(rows) if rows else None
        if (i + 1) % 25 == 0:
            print(f"NED-D {i + 1}/{len(GAL)}", file=sys.stderr)

    results = analyse(leda, rc3, cf4, cf4g, hcg, ned)
    write_outputs(results)

def dm_to_ly(dm):
    return 10 ** (dm / 5 + 1) * LY_PER_PC

def mpc_to_ly(m):
    return m * 1e6 * LY_PER_PC

# Interacting pairs in the catalog lie at one distance: a member with a weaker reference borrows its partner's.
PAIRS = {"NGC4567": "NGC4568", "NGC4568": "NGC4567", "NGC4038": "NGC4039", "NGC4039": "NGC4038",
         "NGC4435": "NGC4438", "NGC4438": "NGC4435", "M51": "NGC5195", "NGC5195": "M51"}
TIER_RANK = {"primary": 3, "secondary": 2, "redshift": 1, None: 0}

def lookup(o, leda, rc3, cf4, cf4g):
    p = pgc_of(o)
    L = leda.get(43062 if o["id"] == "NGC4676" else p) if (p or o["id"] == "NGC4676") else None
    R = rc3.get(p) if p else None
    C = cf4.get(p) if p else None
    if o["id"] == "NGC4676" and not C:
        C = cf4.get(43062) or cf4.get(43065)
    CG = cf4g.get(int(C["1PGC"])) if C and fnum(C.get("1PGC")) else None
    return L, R, C, CG

def distance_refs(o, L, C, CG, N, hcg):
    """(tier, [(label, ly), ...], redshift (label, ly) or None) — the best tier of independent distances."""
    oid = o["id"]
    cands_prim, cands_sec = [], []
    if C:
        prim = [(fnum(C.get(k)), k[2:], fnum(C.get("e_" + k)) or 0.2) for k in ("DMceph", "DMtrgb", "DMsbf", "DMmas") if fnum(C.get(k))]
        if prim:  # inverse-variance mean: TRGB/Cepheid (±0.05) outweigh SBF in dusty spirals (±0.3)
            dm = sum(v / e ** 2 for v, _, e in prim) / sum(1 / e ** 2 for _, _, e in prim)
            cands_prim.append(("CF4 " + "+".join(n for _, n, _ in prim), dm_to_ly(dm)))
        if fnum(C.get("DM")):
            cands_sec.append(("CF4 DM (all methods)", dm_to_ly(fnum(C["DM"]))))
    if N:
        if N.get("prim_mpc"):
            cands_prim.append((f"NED-D median {N['prim_methods']} (n={N['n_prim']})", mpc_to_ly(N["prim_mpc"])))
        if N.get("all_mpc"):
            cands_sec.append((f"NED-D median of post-2000 distances (n={N['n_all']})", mpc_to_ly(N["all_mpc"])))
    if CG and fnum(CG.get("Dist")) and not cands_sec:
        cands_sec.append(("CF4 group distance", mpc_to_ly(fnum(CG["Dist"]))))
    z_d = None
    if oid in HCG and HCG[oid] in hcg and fnum(hcg[HCG[oid]].get("z")):
        z_d = ("Hickson VII/213 z=%.4f, H0=70" % fnum(hcg[HCG[oid]]["z"]), fnum(hcg[HCG[oid]]["z"]) * 299792.458 / 70 * 1e6 * LY_PER_PC)
    elif L and fnum(L.get("modz")):
        z_d = ("HyperLEDA modz (Virgo-infall velocity, H0=70)", dm_to_ly(fnum(L["modz"])))
    if cands_prim:
        return "primary", cands_prim, z_d
    if cands_sec:
        return "secondary", cands_sec, z_d
    if z_d:
        return "redshift", [z_d], z_d
    return None, [], None

def analyse(leda, rc3, cf4, cf4g, hcg, ned):
    res = []
    DREF = {}
    for o in GAL:
        L, R, C, CG = lookup(o, leda, rc3, cf4, cf4g)
        DREF[o["id"]] = distance_refs(o, L, C, CG, ned.get(o["id"]), hcg)
    for a, b in PAIRS.items():
        if a in DREF and b in DREF and TIER_RANK[DREF[b][0]] > TIER_RANK[DREF[a][0]]:
            t, c, z = DREF[b]
            DREF[a] = (t, [(f"partner {b}: {n}", v) for n, v in c], DREF[a][2])
    for o in GAL:
        oid, f = o["id"], FACTS.get(o["id"]) or {}
        L, R, C, CG = lookup(o, leda, rc3, cf4, cf4g)
        r = {"id": oid, "name": o["name"], "type": o["type"], "ours": {"d": f.get("d"), "src": f.get("src"), "size": o.get("size"), "mag": o.get("mag"),
             "magB": bool(o.get("magB")), "mass": f.get("mass"), "stars": f.get("stars")}, "ref": {}, "flags": [], "checked": set()}
        ref = r["ref"]

        # ---------------- distance
        tier, cands, z_d = DREF[oid]
        tol = 0.30 if tier == "primary" else 0.40
        if cands:
            dref = 10 ** statistics.mean(math.log10(v) for _, v in cands)
            spread = max(v for _, v in cands) / min(v for _, v in cands)
            ref["d"] = dref
            ref["d_src"] = "; ".join(f"{n} {v / 1e6:.3g} Mly" for n, v in cands)
            ref["d_tier"] = tier
            ref["d_spread"] = spread
            if z_d and tier != "redshift":
                ref["d_z"] = z_d[1]
            if f.get("d"):
                r["checked"].add("d")
                dev = f["d"] / dref - 1
                ref["d_dev"] = dev
                if abs(dev) > tol:
                    r["flags"].append(("d", f"{f['d'] / 1e6:.3g} Mly ({f.get('src')})", f"{dref / 1e6:.3g} Mly [{tier}] {ref['d_src']}", f"{dev:+.0%}", "refs disagree x%.2f" % spread if spread > 1.25 else ""))

        # ---------------- size (D25)
        d25 = d25min = None
        if L and fnum(L.get("logd25")):
            d25 = 0.1 * 10 ** fnum(L["logd25"])
            d25min = d25 / 10 ** fnum(L["logr25"]) if fnum(L.get("logr25")) is not None else None
            ref["size_src"] = "HyperLEDA logd25/logr25"
        if R and fnum(R.get("D25")):
            ref["size_rc3"] = round(0.1 * 10 ** fnum(R["D25"]), 2)
        if oid in HCG and HCG[oid] in hcg and fnum(hcg[HCG[oid]].get("AngSize")):
            d25, d25min = fnum(hcg[HCG[oid]]["AngSize"]), None
            ref["size_src"] = "Hickson VII/213 group angular size"
        if d25:
            ref["size"] = [round(d25, 2)] + ([round(d25min, 2)] if d25min else [])
            ours = (o.get("size") or [None])[0]
            if ours:
                r["checked"].add("size")
                ratio = ours / d25
                # HyperLEDA's automatic D25 fails for some very large or low-surface-brightness objects; a size that
                # matches RC3's D25 is not an error.
                if ref.get("size_rc3") and abs(math.log(ours / ref["size_rc3"])) < abs(math.log(ratio)):
                    ratio = ours / ref["size_rc3"]
                ref["size_ratio"] = ratio
                if ratio > 1.6 or ratio < 1 / 1.6:
                    extra = f"RC3 {ref['size_rc3']}′" if ref.get("size_rc3") else ""
                    r["flags"].append(("size", f"{ours}′", f"{d25:.2f}′ D25 ({ref['size_src']})", f"x{ratio:.2f}", extra))

        # ---------------- magnitude
        vt_rc3 = None
        if R and fnum(R.get("BT")) is not None and fnum(R.get("B-VT")) is not None:
            vt_rc3 = fnum(R["BT"]) - fnum(R["B-VT"])  # V = B - (B-V)
        vt_leda = fnum(L.get("vt")) if L else None
        e_vt = fnum(L.get("e_vt")) if L else None
        bt = fnum(L.get("bt")) if L else None
        if R and fnum(R.get("BT")) is not None:
            ref["bt_rc3"] = fnum(R["BT"])
        if bt is not None:
            ref["bt"] = bt
        if oid in HCG and HCG[oid] in hcg and fnum(hcg[HCG[oid]].get("Totmag")):
            ref["bt"] = fnum(hcg[HCG[oid]]["Totmag"]); ref["bt_src"] = "Hickson total B"
        mref = band = msrc = None
        if o.get("magB"):
            mref, band, msrc = ref.get("bt"), "B", "HyperLEDA bt"
        elif vt_rc3 is not None:
            mref, band, msrc = vt_rc3, "V", "RC3 BT-(B-V)T"
        elif vt_leda is not None and (e_vt is None or e_vt <= 0.3):
            mref, band, msrc = vt_leda, "V", "HyperLEDA vt"
        if mref is not None:
            ref["mag"], ref["mag_band"], ref["mag_src"] = round(mref, 2), band, msrc
            if o.get("mag") is not None:
                r["checked"].add("mag")
                dm_ = o["mag"] - mref
                ref["mag_dev"] = dm_
                if abs(dm_) > 0.5:
                    other = []
                    if vt_leda is not None: other.append(f"LEDA vt {vt_leda:.2f}±{e_vt if e_vt is not None else '?'}")
                    if bt is not None: other.append(f"LEDA bt {bt:.2f}")
                    r["flags"].append(("mag", f"{o['mag']}{'B' if o.get('magB') else 'V'}", f"{mref:.2f}{band} ({msrc})", f"{dm_:+.2f}", ", ".join(other)))
        # Without an RC3 V: a V magnitude barely brighter than (or fainter than) HyperLEDA's B means B-V < 0.15 — no
        # whole galaxy is that blue, so the V (usually HyperLEDA vt, which OpenNGC copies) is suspect.
        if o.get("mag") is not None and not o.get("magB") and bt is not None and o["mag"] > bt - 0.15 and vt_rc3 is None:
            r["checked"].add("mag")
            r["flags"].append(("mag", f"{o['mag']}V", f"HyperLEDA bt {bt:.2f} implies B−V = {bt - o['mag']:+.2f}", "", f"LEDA vt {vt_leda}±{e_vt}" if vt_leda is not None else ""))

        # ---------------- mass and stars
        dist_pc = (ref.get("d") or f.get("d") or 0) / LY_PER_PC
        vmax = fnum(L.get("vmaxg")) if L else None
        ttype = fnum(L.get("t")) if L else None
        # Rotation only means something for discs: not for ellipticals / spheroidals, nor nearly face-on discs.
        if vmax and vmax >= 40 and d25 and dist_pc and (fnum(L.get("incl")) or 0) >= 30 and (ttype is None or ttype > -3):
            rad = dist_pc * math.radians(d25 / 120)
            ref["mdyn25"] = vmax ** 2 * rad / G
            ref["vmax"] = vmax
        btc, bv = (fnum(L.get("btc")), fnum(L.get("bvtc"))) if L else (None, None)
        if btc is not None and dist_pc:
            if bv is None:
                t = fnum(L.get("t")) if L else None
                bv = 0.9 if t is not None and t <= 0 else 0.65 if t is not None and t <= 4 else 0.45
            MB = btc - 5 * math.log10(dist_pc / 10)
            LB = 10 ** (-0.4 * (MB - 5.44))
            ml = 10 ** (-0.994 + 1.804 * bv - 0.15)  # Bell & de Jong 2001, Kroupa-like IMF (-0.15 dex)
            ref["mstar_est"] = LB * ml
        lit = LIT.get(oid, {})
        for k in ("mass", "mass_src", "mstar", "mstar_src", "m_inner", "m_inner_src"):
            if k in lit:
                ref[k] = lit[k]
        mstar = ref.get("mstar") or ref.get("mstar_est")
        if f.get("mass"):
            r["checked"].add("mass")
            m = f["mass"]
            why = []
            if ref.get("mass") and not (0.5 < m / ref["mass"] < 2):
                why.append(f"published total {ref['mass']:.2g} ({ref['mass_src'].split(' (')[0].split(';')[0]})")
            if ref.get("mdyn25") and m < 0.5 * ref["mdyn25"]:
                why.append(f"below the mass needed inside its own optical disk, v²R/G = {ref['mdyn25']:.1g} (vmax {vmax:.0f} km/s)")
            if mstar and m < 1.5 * mstar:
                why.append(f"≈ stellar mass ({mstar:.1g}{' published' if ref.get('mstar') else ', B-band estimate'})")
            if ref.get("mdyn25") and m > 100 * ref["mdyn25"]:
                why.append(f">100x disk dynamical mass {ref['mdyn25']:.1g}")
            if why:
                r["flags"].append(("mass", f"{m:.2g}", "; ".join(why), "", ""))
        if f.get("stars"):
            r["checked"].add("stars")
            n = f["stars"]
            why = []
            if mstar:
                nest = mstar / 0.4
                ref["stars_est"] = nest
                if not (1 / 3 < n / nest < 3):
                    why.append(f"stellar mass {mstar:.2g} → ~{nest:.1g} stars ({'published' if ref.get('mstar') else 'B-band M/L estimate'}), x{n / nest:.1f}")
            if f.get("mass") and n * 0.1 > f["mass"]:
                why.append(f"stars × 0.1 Msun ({n * 0.1:.1g}) exceed the stated total mass {f['mass']:.2g}")
            if why:
                r["flags"].append(("stars", f"{n:.2g}", "; ".join(why), "", ""))
        res.append(r)
    return res

def sig(x, n=2):
    return float(f"{x:.{n}g}") if x is not None else None

def write_outputs(results):
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    xj = {"_meta": {
        "about": "Independent reference values for the app's galaxies and galaxy groups (scripts/crosscheck/galaxies.py).",
        "d": "light-years; geometric mean of the reference distances of the best tier (primary = Cepheid/TRGB/SBF/maser from Cosmicflows-4 and NED-D; secondary = all redshift-independent methods; redshift = HyperLEDA modz / Hickson z, H0=70)",
        "size": "D25 isophotal diameter [major, minor] arcmin (HyperLEDA logd25, logr25; Hickson group size for HCGs); size_rc3 = RC3 D25 major axis; w = size[0] x d in light-years",
        "mag": "total magnitude in the band the app uses (V: RC3 BT-(B-V)T or HyperLEDA vt; B: HyperLEDA bt)",
        "mass": "published total (halo) mass, Msun, only where well measured; mdyn25 = vmax^2 R25 / G, a lower bound for the total",
        "mstar": "stellar mass, Msun (published, or estimated from HyperLEDA btc and (B-V) with Bell & de Jong 2001 M/L)"}}
    for r in results:
        ref, e = r["ref"], {}
        if ref.get("d"):
            e["d"] = sig(ref["d"]); e["d_tier"] = ref["d_tier"]; e["d_src"] = ref["d_src"]
        if ref.get("size"):
            e["size"] = ref["size"]; e["size_src"] = ref["size_src"]
            if ref.get("d"):
                e["w"] = sig(ref["d"] * math.radians(ref["size"][0] / 60))  # reference width, ly (D25 x reference distance)
        if ref.get("size_rc3"):
            e["size_rc3"] = ref["size_rc3"]
        if ref.get("mag") is not None:
            e["mag"] = ref["mag"]; e["mag_band"] = ref["mag_band"]; e["mag_src"] = ref["mag_src"]
        if ref.get("mass"):
            e["mass"] = ref["mass"]; e["mass_src"] = ref["mass_src"]
        if ref.get("mdyn25"):
            e["mdyn25"] = sig(ref["mdyn25"])
        if ref.get("mstar"):
            e["mstar"] = ref["mstar"]; e["mstar_src"] = ref["mstar_src"]
        elif ref.get("mstar_est"):
            e["mstar"] = sig(ref["mstar_est"], 1); e["mstar_src"] = "estimate: HyperLEDA btc, (B-V)tc, Bell & de Jong 2001"
        xj[r["id"]] = e
    json.dump(xj, open(OUT_JSON, "w"), indent=None, separators=(",", ":"), ensure_ascii=False)
    open(OUT_JSON, "a").write("\n")

    # ---------------- corrections
    corr = {}
    for oid, c in CORRECT.items():
        corr[oid] = c
    json.dump(corr, open(OUT_CORR, "w"), indent=1, ensure_ascii=False)
    open(OUT_CORR, "a").write("\n")

    # ---------------- report
    fields = ["d", "size", "mag", "mass", "stars"]
    lines = ["# Galaxies and galaxy groups — cross-check against extragalactic databases", "",
             "Generated by `python3 scripts/crosscheck/galaxies.py` (re-runs offline from `.local/crosscheck-cache/galaxies/`).", "",
             "References: HyperLEDA (D25, bt, vt, bvtc, vmaxg), RC3 VII/155 (BT, (B−V)T), Cosmicflows-4 J/ApJ/944/94 (per-galaxy and group distance moduli by method), "
             "NED-D (median of post-2000 redshift-independent distances; primary methods separately), Hickson VII/213, and cited total-mass papers. "
             "SIMBAD's mesDistance is not used: the app's own distances are medians of it.", "",
             "Thresholds: distance > 30 % off when a Cepheid/TRGB/SBF/maser reference exists, > 40 % otherwise; size (major axis) > ×1.6 vs D25; magnitude > 0.5 mag; "
             "mass flagged if it is a stellar or partial mass (below ½ v²R₂₅/G for its rotation, or < 1.5× the stellar mass) or more than ×2 from a published total; star count flagged if > ×3 from M★/0.4 M☉.", "",
             f"{len(results)} objects ({sum(r['type'] == 'galaxy' for r in results)} galaxies, {sum(r['type'] == 'galaxy_group' for r in results)} groups).", "",
             "| field | checked | agree | flagged |", "|---|---|---|---|"]
    for fl in fields:
        ch = sum(fl in r["checked"] for r in results)
        fg = sum(any(x[0] == fl for x in r["flags"]) for r in results)
        lines.append(f"| {fl} | {ch} | {ch - fg} | {fg} |")
    tiers = {}
    for r in results:
        if "d" in r["checked"]:
            tiers[r["ref"]["d_tier"]] = tiers.get(r["ref"]["d_tier"], 0) + 1
    lines += ["", "Distance reference tier for the checked objects: " + ", ".join(f"{k} {v}" for k, v in sorted(tiers.items())) + ".", ""]
    devs = [abs(r["ref"]["d_dev"]) for r in results if "d_dev" in r["ref"]]
    if devs:
        lines.append(f"Distance |ours/ref − 1|: median {statistics.median(devs):.0%}, 90th percentile {sorted(devs)[int(0.9 * len(devs))]:.0%}.")
    sdev = [abs(math.log(r["ref"]["size_ratio"])) for r in results if "size_ratio" in r["ref"]]
    if sdev:
        lines.append(f"Size: median |ln(ours/D25)| {statistics.median(sdev):.3f} (identical in {sum(x < 0.01 for x in sdev)} of {len(sdev)} — the catalog takes D25 from OpenNGC/LEDA).")
    mdev = [abs(r["ref"]["mag_dev"]) for r in results if "mag_dev" in r["ref"]]
    if mdev:
        lines.append(f"Magnitude: median |Δ| {statistics.median(mdev):.2f} mag.")
    lines.append("")
    for fl, title in (("d", "Distances"), ("size", "Sizes"), ("mag", "Magnitudes"), ("mass", "Masses"), ("stars", "Star counts")):
        rows = [(r, x) for r in results for x in r["flags"] if x[0] == fl]
        lines += [f"## {title} — {len(rows)} flagged", ""]
        if not rows:
            lines += ["None.", ""]
            continue
        lines += ["| id | name | ours | reference | Δ | likely cause / verdict |", "|---|---|---|---|---|---|"]
        for r, x in sorted(rows, key=lambda t: t[0]["id"]):
            note = NOTES.get(f"{r['id']}:{fl}", "")
            extra = f" ({x[4]})" if x[4] else ""
            lines.append(f"| {r['id']} | {r['name']} | {x[1]} | {x[2]}{extra} | {x[3]} | {note} |")
        lines.append("")
    unflagged_notes = [(k, v) for k, v in NOTES.items() if not any(f"{r['id']}:{x[0]}" == k for r in results for x in r["flags"])]
    if unflagged_notes:
        lines += ["## Other notes (not over threshold)", ""] + [f"- **{k}** — {v}" for k, v in unflagged_notes] + [""]
    lines += ["## Corrections proposed", "", "`scripts/crosscheck/galaxies-corrections.json` — clear errors only. `\"mass\": null` means drop the value (no solid published total to replace it).", ""]
    def show(k, v):
        if v is None:
            return f"{k}: drop"
        if k == "d":
            return f"d: {v / 1e6:g} Mly"
        return f"{k}: {v:.2g}" if isinstance(v, float) else f"{k}: {v}"
    for oid, c in CORRECT.items():
        bits = [show(k, v) for k, v in c.items() if k in ("d", "mass", "stars")]
        if "catalog" in c:
            bits.append("catalog " + ", ".join(f"{k}: {v}" for k, v in c["catalog"].items() if k != "src"))
        why = c.get("d_ref") or c.get("mass_src") or c.get("stars_src") or c.get("catalog", {}).get("src", "")
        lines.append(f"- **{oid}** — {'; '.join(bits)} ({why})")
    open(OUT_MD, "w").write("\n".join(lines) + "\n")
    print(f"wrote {OUT_JSON} ({os.path.getsize(OUT_JSON) // 1024} KB), {OUT_MD}, {OUT_CORR}", file=sys.stderr)
    for fl in fields:
        print(fl, sum(fl in r["checked"] for r in results), "checked,", sum(any(x[0] == fl for x in r["flags"]) for r in results), "flagged", file=sys.stderr)

if __name__ == "__main__":
    main()
