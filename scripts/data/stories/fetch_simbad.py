"""SIMBAD basic data and every distance measurement for each catalog object → cache/simbad.json
{id: {main_id, otype, plx, z, dists: [[value_pc, method, bibcode], ...]}}"""
import csv, io, json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
CAT = json.load(open(os.path.join(ROOT, "../../../shared/data/catalog.json")))
UA = "AstroPilot-data-build/1.0 (https://astropilot.space)"
UNIT = {"pc": 1, "kpc": 1e3, "Mpc": 1e6}

def ids_for(o):
    out = []
    for d in o["designations"]:
        if re.match(r"^(M|NGC|IC|HIP|Mel|Cr|Sh2|Pal|ESO|UGC|PGC|Stock|Trumpler|Harvard|Barnard|vdB) ?[\d-]", d): out.append(d.replace("Mel ", "Melotte ").replace("Cr ", "Collinder ").replace("Sh2 ", "Sh 2-").replace("Sh2-", "Sh 2-"))
    return out

def tap(q):
    data = urllib.parse.urlencode({"REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "csv", "QUERY": q}).encode()
    for attempt in range(4):
        try:
            req = urllib.request.Request("https://simbad.cds.unistra.fr/simbad/sim-tap/sync", data=data, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                return list(csv.DictReader(io.StringIO(r.read().decode())))
        except Exception as e:
            print("retry", e, file=sys.stderr); time.sleep(3 + attempt * 5)
    return []

norm = lambda s: re.sub(r"\s+", " ", s.strip())
want = {o["id"]: ids_for(o) for o in CAT}
allids = sorted({i for v in want.values() for i in v})
rows = []
for k in range(0, len(allids), 60):
    chunk = allids[k:k + 60]
    inlist = ",".join("'" + i.replace("'", "''") + "'" for i in chunk)
    rows += tap(f"SELECT i.id, b.main_id, b.otype, b.plx_value, b.rvz_redshift, d.dist, d.unit, d.method, d.bibcode FROM ident AS i JOIN basic AS b ON b.oid=i.oidref LEFT JOIN mesDistance AS d ON d.oidref=b.oid WHERE i.id IN ({inlist})")
    print(k, len(rows), file=sys.stderr)
    time.sleep(0.5)

by = {}
for r in rows:
    e = by.setdefault(norm(r["id"]), {"main_id": norm(r["main_id"]), "otype": r["otype"], "plx": float(r["plx_value"]) if r["plx_value"] else None, "z": float(r["rvz_redshift"]) if r["rvz_redshift"] else None, "dists": []})
    if r["dist"]:
        e["dists"].append([float(r["dist"]) * UNIT.get(r["unit"].strip(), 1), r["method"].strip(), r["bibcode"]])

out = {}
for oid, ids in want.items():
    for i in ids:
        if norm(i) in by:
            out[oid] = {"via": i, **by[norm(i)]}
            break
json.dump(out, open(os.path.join(ROOT, "cache/simbad.json"), "w"))
print(f"{len(out)}/{len(CAT)} resolved in SIMBAD", file=sys.stderr)
