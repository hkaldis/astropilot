"""Research cache for object stories: the English Wikipedia article (plain text) and Wikidata claims for every
catalog object. Output: scripts/data/stories/cache/wiki.json  {id: {title, qid, text}} and wikidata.json {qid: claims}.
Re-runs skip objects already fetched."""
import json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(ROOT, "cache")
UA = "AstroPilot-data-build/1.0 (https://astropilot.space; hello@astropilot.space)"
CAT = json.load(open(os.path.join(ROOT, "../../../shared/data/catalog.json")))

def get(url):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            print("  retry", attempt, e, file=sys.stderr)
            time.sleep(2 + attempt * 3)
    return None

def candidates(o):
    out = []
    if o.get("m"): out.append(f"Messier {o['m']}")
    for d in o["designations"]:
        if re.match(r"^(NGC|IC) \d+[A-Z]?$", d): out.append(d)
    if o.get("c"): out.append(f"Caldwell {o['c']}")
    if o["type"] == "double_star":
        for d in o["designations"]:
            if re.match(r"^[A-Z][a-z]", d) or re.match(r"^\d+ [A-Z]", d): out.append(d.split(" (")[0])
        if o["id"] == "trapezium": out.insert(0, "Trapezium Cluster")
        if o["id"] == "mizar": out.insert(0, "Mizar")
    else:
        for d in o["designations"]:
            if re.match(r"^(Mel|Cr|Melotte|Collinder|Stock|Trumpler|Harvard|Sh2|Barnard|Pal|Palomar|ESO|UGC|vdB|Ced|Berkeley|King|Ruprecht|Tr|Basel|Bochum|Pismis|Lynga|Dolidze|Hogg|Westerlund) ", d) or re.match(r"^[A-Z][a-z]+", d):
                out.append(d)
        if not re.match(r"^(M|NGC|IC|C) \d", o["name"]): out.append(o["name"].split(" (")[0])
    seen, uniq = set(), []
    for t in out:
        if t not in seen:
            seen.add(t); uniq.append(t)
    return uniq

def lookup(title):
    q = urllib.parse.urlencode({"action": "query", "titles": title, "redirects": 1, "prop": "extracts|pageprops", "explaintext": 1, "format": "json", "formatversion": 2})
    d = get("https://en.wikipedia.org/w/api.php?" + q)
    if not d: return None
    pages = d.get("query", {}).get("pages", [])
    if not pages or pages[0].get("missing"): return None
    p = pages[0]
    if "disambiguation" in p.get("pageprops", {}) or p["title"].startswith("List of"): return None
    text = p.get("extract", "")
    # Trim reference-ish tail sections.
    text = re.split(r"\n== (See also|References|Notes|External links|Further reading|Sources|Bibliography) ==", text)[0]
    return {"title": p["title"], "qid": p.get("pageprops", {}).get("wikibase_item"), "text": text[:16000]}

def main():
    path = os.path.join(CACHE, "wiki.json")
    out = json.load(open(path)) if os.path.exists(path) else {}
    for i, o in enumerate(CAT):
        if o["id"] in out: continue
        hit = None
        for t in candidates(o):
            hit = lookup(t)
            time.sleep(0.25)
            if hit: break
        out[o["id"]] = hit or {}
        print(i, o["id"], "→", hit["title"] if hit else "—", file=sys.stderr)
        if i % 20 == 0: json.dump(out, open(path, "w"))
    for b in ["Moon", "Mercury (planet)", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"]:
        key = "body:" + b.split(" ")[0].lower()
        if key not in out:
            out[key] = lookup(b) or {}
            time.sleep(0.25)
    json.dump(out, open(path, "w"))

    # Wikidata claims for every article found.
    wpath = os.path.join(CACHE, "wikidata.json")
    wd = json.load(open(wpath)) if os.path.exists(wpath) else {}
    qids = sorted({v["qid"] for v in out.values() if v.get("qid") and v["qid"] not in wd})
    for k in range(0, len(qids), 40):
        chunk = qids[k:k + 40]
        q = urllib.parse.urlencode({"action": "wbgetentities", "ids": "|".join(chunk), "props": "claims|labels", "languages": "en", "format": "json"})
        d = get("https://www.wikidata.org/w/api.php?" + q)
        for qid, ent in (d or {}).get("entities", {}).items():
            wd[qid] = ent.get("claims", {})
        time.sleep(0.5)
    json.dump(wd, open(wpath, "w"))
    found = sum(1 for v in out.values() if v.get("title"))
    print(f"articles: {found}/{len(out)}  wikidata: {len(wd)}", file=sys.stderr)

main()
