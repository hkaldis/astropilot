"""Wikipedia articles for the catalog's stars, and the figures in their infoboxes (distance, radius, luminosity,
temperature, mass) → cache/wiki-stars.json {id: {title, text, infobox: {...}}}. Re-runs skip stars already fetched."""
import json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(ROOT, "../../..")
UA = "AstroPilot-data-build/1.0 (https://astropilot.space; hello@astropilot.space)"
CAT = [o for o in json.load(open(os.path.join(REPO, "shared/data/catalog.json"))) if o["type"] == "star"]

def get(params):
    q = urllib.parse.urlencode({**params, "format": "json", "formatversion": 2})
    for attempt in range(4):
        try:
            req = urllib.request.Request("https://en.wikipedia.org/w/api.php?" + q, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            print("retry", e, file=sys.stderr); time.sleep(2 + 3 * attempt)
    return None

def article(title):
    d = get({"action": "query", "titles": title, "redirects": 1, "prop": "extracts|pageprops|revisions", "explaintext": 1, "rvprop": "content", "rvslots": "main"})
    pages = (d or {}).get("query", {}).get("pages", [])
    if not pages or pages[0].get("missing") or "disambiguation" in pages[0].get("pageprops", {}):
        return None
    p = pages[0]
    text = re.split(r"\n== (See also|References|Notes|External links|Further reading|Sources|Bibliography) ==", p.get("extract", ""))[0]
    wikitext = p["revisions"][0]["slots"]["main"]["content"] if p.get("revisions") else ""
    # The wikitext up to the article's first bold line (the infobox), kept so its figures can be re-read offline.
    cut = wikitext.find("\n'''")
    box = wikitext[: cut if cut > 0 else 20000][:20000]
    return {"title": p["title"], "text": text[:14000], "infobox": infobox(box), "wikitext": box}

NUM = r"[-+]?\d[\d,]*(?:\.\d+)?(?:e[-+]?\d+)?"

def first_number(v):
    if not v:
        return None
    v = re.sub(r"<ref[^>]*/>|<ref.*?</ref>|<ref[^>]*>.*|<!--.*?-->", "", v, flags=re.S)
    v = re.sub(r"\{\{\s*(?:val|Val)\s*\|\s*(" + NUM + r")[^}]*\}\}", r"\1", v)
    v = re.sub(r"\{\{\s*(?:±|plusminus)[^}]*\}\}", "", v)
    m = re.search(r"(" + NUM + r")\s*(?:×|x)\s*10\s*(?:<sup>|\^)\s*(" + NUM + ")", v)
    if m:
        return float(m.group(1).replace(",", "")) * 10 ** float(m.group(2))
    m = re.search("(" + NUM + r")\s*(million|billion|thousand)?", v)
    if not m:
        return None
    return float(m.group(1).replace(",", "")) * {"million": 1e6, "billion": 1e9, "thousand": 1e3}.get(m.group(2) or "", 1)

def infobox(wt):
    out = {}
    # Binary and multiple stars number their components (radius1, mass2…): the first one is the bright star.
    fields = (("dist_ly", ("dist_ly",)), ("dist_pc", ("dist_pc",)), ("radius", ("radius", "radius1", "radius_a")), ("luminosity", ("luminosity", "luminosity1", "luminosity_a")),
              ("temperature", ("temperature", "temperature1", "temperature_a")), ("mass", ("mass", "mass1", "mass_a")), ("age_gyr", ("age_gyr", "age_gyr1")), ("age_myr", ("age_myr", "age_myr1")))
    for key, names in fields:
        for field in names:
            m = re.search(r"\|\s*" + field + r"\s*=([^\n|{]*(?:\{\{[^}]*\}\}[^\n|{]*)*)", wt)
            n = first_number(m.group(1)) if m else None
            if n is not None:
                out[key] = n
                break
    return out

def candidates(o):
    d = o["designations"]
    bayer_long = next((x for x in d if re.match(r"^[A-Z][a-z]+[¹²³]? [A-Z][a-z]+", x) and x.split()[0] in GREEK_WORDS), None)
    var_long = next((x for x in d if re.match(r"^[A-Z]{1,2} [A-Z][a-z]+(?: [A-Z][a-z]+)?$", x) and len(x.split()[0]) <= 2), None)
    out = [bayer_long, var_long, o["name"], f"{o['name']} (star)"]
    return [c.replace("¹", "1").replace("²", "2") if c else None for c in out]

GREEK_WORDS = {"Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa", "Lambda", "Mu", "Nu", "Xi", "Omicron", "Pi", "Rho", "Sigma", "Tau", "Upsilon", "Phi", "Chi", "Psi", "Omega", "Alpha1", "Alpha2", "Gamma2", "Iota1"}

def main():
    path = os.path.join(ROOT, "cache/wiki-stars.json")
    out = json.load(open(path)) if os.path.exists(path) else {}
    for v in out.values():  # re-read the infoboxes kept from earlier runs (parser changes need no refetch)
        if v.get("wikitext"):
            v["infobox"] = infobox(v["wikitext"])
    for o in CAT:
        if o["id"] in out:
            continue
        hit = None
        for t in candidates(o):
            if not t:
                continue
            hit = article(t)
            time.sleep(0.3)
            if hit:
                break
        out[o["id"]] = hit or {}
        print(o["id"], "→", hit["title"] if hit else "—", hit["infobox"] if hit else "", file=sys.stderr)
        json.dump(out, open(path, "w"))
    json.dump(out, open(path, "w"))
    print(sum(1 for v in out.values() if v.get("title")), "/", len(out), "articles", file=sys.stderr)

main()
