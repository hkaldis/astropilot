"""The bright named stars for the catalog: SIMBAD data for every proper-named star in shared/data/starnames.json
(matched by position, brightest star within 2′) plus a few famous fainter ones, then their Wikipedia articles.
Output: cache/stars-simbad.json and cache/wiki-stars.json. Stars already in the catalog (as double stars) are skipped."""
import csv, io, json, math, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(ROOT, "../../..")
UA = "AstroPilot-data-build/1.0 (https://astropilot.space; hello@astropilot.space)"
CACHE = os.path.join(ROOT, "cache")

# Famous stars fainter than the named-star list (mag 3) — variables, record holders, history, exoplanets.
EXTRAS = [
    ("Thuban", "* alf Dra"), ("Mira", "* omi Cet"), ("Garnet Star", "* mu. Cep"), ("Hind's Crimson Star", "V* R Lep"),
    ("La Superba", "V* Y CVn"), ("Chi Cygni", "* chi Cyg"), ("R Coronae Borealis", "V* R CrB"), ("T Coronae Borealis", "V* T CrB"),
    ("Eta Carinae", "* eta Car"), ("VY Canis Majoris", "V* VY CMa"), ("Barnard's Star", "NAME Barnard's star"),
    ("Proxima Centauri", "NAME Proxima Centauri"), ("Tau Ceti", "* tau Cet"), ("Epsilon Eridani", "* eps Eri"),
    ("51 Pegasi", "* 51 Peg"), ("Polaris Australis", "* sig Oct"),
]

def tap(q):
    data = urllib.parse.urlencode({"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "csv", "QUERY": q}).encode()
    for attempt in range(4):
        try:
            req = urllib.request.Request("https://simbad.cds.unistra.fr/simbad/sim-tap/sync", data=data, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=90) as r:
                text = r.read().decode()
                if text.lstrip().startswith("<?xml"):
                    print("query error:", text[:400], file=sys.stderr); return []
                return list(csv.DictReader(io.StringIO(text)))
        except Exception as e:
            print("retry", e, file=sys.stderr); time.sleep(3 + attempt * 4)
    return []

# (The identifier list comes in a separate query: joining SIMBAD's big `ids` table makes every query crawl.)
COLS = "b.oid, b.main_id, b.ra, b.dec, b.sp_type, b.plx_value, b.plx_bibcode, f.V AS vmag, f.B AS bmag"
FROM = "basic AS b LEFT JOIN allfluxes AS f ON f.oidref = b.oid"

def by_position(ra_h, dec):
    rows = tap(f"SELECT TOP 5 {COLS} FROM {FROM} WHERE CONTAINS(POINT('ICRS', b.ra, b.dec), CIRCLE('ICRS', {ra_h * 15}, {dec}, 0.034)) = 1 AND f.V IS NOT NULL ORDER BY vmag ASC")
    return rows[0] if rows else None

def by_id(ident):
    rows = tap(f"SELECT {COLS} FROM {FROM} JOIN ident AS x ON x.oidref = b.oid WHERE x.id = '{ident.replace(chr(39), chr(39) * 2)}'")
    return rows[0] if rows else None

def hipparcos_plx(oid):
    rows = tap(f"SELECT plx, plx_err, bibcode FROM mesPlx WHERE oidref = {oid}")
    hip = [float(r["plx"]) for r in rows if r["bibcode"] == "2007A&A...474..653V" and r["plx"]]
    return hip[0] if hip else None

def ids_in(ids):
    return ",".join("'" + i.replace("'", "''") + "'" for i in ids)

def main():
    names = json.load(open(os.path.join(REPO, "shared/data/starnames.json")))
    catalog = json.load(open(os.path.join(REPO, "shared/data/catalog.json")))
    have = {d.lower() for o in catalog if o["type"] != "star" for d in o["designations"] + [o["name"]]}
    todo, seen_names = [], set()
    for s in names:
        n = s["name"]
        if n.lower() in have or n == "Toliman":  # Toliman is α Centauri B, part of the α Centauri page
            continue
        key = n if n not in seen_names else f"{n}#2"
        seen_names.add(n)
        todo.append({"key": key, "name": n, "ident": f"NAME {n}", "pos": (s["ra"], s["dec"])})
    todo += [{"key": n, "name": n, "ident": i, "pos": None} for n, i in EXTRAS]

    # 1. Everything by identifier, in batches (IAU names are SIMBAD "NAME …" identifiers).
    rows = {}
    for k in range(0, len(todo), 40):
        chunk = todo[k:k + 40]
        for r in tap(f"SELECT x.id AS q, {COLS} FROM {FROM} JOIN ident AS x ON x.oidref = b.oid WHERE x.id IN ({ids_in(t['ident'] for t in chunk)})"):
            rows[re.sub(r"\s+", " ", r["q"]).strip()] = r
        print("batch", k, len(rows), file=sys.stderr)
    out = {}
    pending = []
    for t in todo:
        r = rows.get(t["ident"])
        # The name must point at the star at this place (d3-celestial's list has a few odd names): else by position.
        if t["pos"] and (not r or abs(float(r["ra"]) / 15 - t["pos"][0]) * 15 * math.cos(math.radians(t["pos"][1])) > 0.04 or abs(float(r["dec"]) - t["pos"][1]) > 0.04):
            if r: print("NAME MISMATCH", t["key"], r["main_id"], file=sys.stderr)
            r = by_position(*t["pos"])
            if r: r["_by_position"] = True
        if not r:
            print("NOT FOUND", t["key"], file=sys.stderr); continue
        out[t["key"]] = {"name": t["name"], "oid": int(r["oid"]), "main_id": r["main_id"], "ra": float(r["ra"]) / 15, "dec": float(r["dec"]), "sp": r["sp_type"] or None,
                         "V": float(r["vmag"]) if r["vmag"] else None, "B": float(r["bmag"]) if r["bmag"] else None,
                         "plx": float(r["plx_value"]) if r["plx_value"] else None, "plx_bib": r["plx_bibcode"],
                         "ids": [], "matched": "position" if r.get("_by_position") else "name"}
    # Every identifier of every star (Bayer, Flamsteed, HR, HD, HIP…), in batches.
    by_oid = {v["oid"]: v for v in out.values()}
    oid_list = list(by_oid)
    for k in range(0, len(oid_list), 60):
        for r in tap(f"SELECT oidref, ids FROM ids WHERE oidref IN ({','.join(map(str, oid_list[k:k + 60]))})"):
            by_oid[int(r["oidref"])]["ids"] = r["ids"].split("|")
    # 2. Hipparcos (van Leeuwen 2007) parallaxes: Gaia's are unreliable for stars this bright.
    oids = [v["oid"] for v in out.values()]
    hip = {}
    for k in range(0, len(oids), 80):
        for r in tap(f"SELECT oidref, plx FROM mesPlx WHERE bibcode = '2007A&A...474..653V' AND oidref IN ({','.join(map(str, oids[k:k + 80]))})"):
            if r["plx"]: hip[int(r["oidref"])] = float(r["plx"])
    for v in out.values():
        v["hip_plx"] = hip.get(v["oid"])
    json.dump(out, open(os.path.join(CACHE, "stars-simbad.json"), "w"), indent=0)
    print(len(out), "stars;", sum(1 for v in out.values() if v["matched"] == "position"), "by position;", len(hip), "Hipparcos parallaxes", file=sys.stderr)

main()
