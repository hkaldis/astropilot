"""Distances as given in each Wikipedia article's infobox (dist_ly) → cache/infobox.json {id: ly}"""
import json, os, re, sys, time, urllib.parse, urllib.request
ROOT = os.path.dirname(os.path.abspath(__file__))
UA = "AstroPilot-data-build/1.0 (https://astropilot.space; hello@astropilot.space)"
WIKI = json.load(open(os.path.join(ROOT, "cache/wiki.json")))
by_title = {}
for k, v in WIKI.items():
    if v.get("title"): by_title.setdefault(v["title"], []).append(k)
titles = sorted(by_title)
CACHED = os.path.join(ROOT, "cache/infobox.json")
raw = {}
if os.path.exists(CACHED):
    for k, v in json.load(open(CACHED)).items():
        t = WIKI[k]["title"] if k in WIKI else None
        if t: raw[t] = v.get("raw")
for i in (range(0, len(titles), 40) if not raw else []):
    chunk = titles[i:i + 40]
    q = urllib.parse.urlencode({"action": "query", "titles": "|".join(chunk), "prop": "revisions", "rvprop": "content", "rvslots": "main", "format": "json", "formatversion": 2})
    req = urllib.request.Request("https://en.wikipedia.org/w/api.php?" + q, headers={"User-Agent": UA})
    d = json.loads(urllib.request.urlopen(req, timeout=60).read().decode())
    for p in d["query"]["pages"]:
        if p.get("revisions"):
            text = p["revisions"][0]["slots"]["main"]["content"]
            m = re.search(r"\|\s*dist_ly\s*=([^\n]*)", text)
            raw[p["title"]] = m.group(1).strip() if m else None
    print(i, file=sys.stderr); time.sleep(0.5)
UNIT = {"ly": 1, "kly": 1e3, "mly": 1e6, "gly": 1e9, "e6ly": 1e6, "e3ly": 1e3, "pc": 3.26156, "kpc": 3261.56, "mpc": 3.26156e6, "gpc": 3.26156e9, "light-year": 1, "light-years": 1}
NUM = r"[\d][\d,]*(?:\.\d+)?(?:e\d+)?"
def num(x): return float(x.replace(",", ""))
def parse(v):
    if not v: return None
    v = re.sub(r"<ref[^>]*/>|<ref.*?</ref>|<ref[^>]*>.*|<!--.*?-->", "", v, flags=re.S)
    v = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", v)  # [[a|b]] -> b
    m = re.search(r"\{\{\s*(?:convert|cvt)\s*\|([^}]*)\}\}", v, re.I)
    if m:
        args = [a.strip() for a in m.group(1).split("|")]
        try:
            n = num(args[0]); i = 1
            if args[i] in ("+/-", "±", "-", "to", "–"): i += 2
            u = args[i].lower()
            return n * UNIT[u] if u in UNIT else None
        except Exception:
            return None
    m = re.search(r"\{\{\s*val\s*\|([^}]*)\}\}", v, re.I)
    if m:
        args = [a.strip() for a in m.group(1).split("|")]
        pos = [a for a in args if "=" not in a]
        named = dict(a.split("=", 1) for a in args if "=" in a)
        try:
            n = num(pos[0])
        except Exception:
            return None
        u = named.get("u", named.get("ul", "ly")).strip("[] ").lower()
        return n * UNIT.get(u, 1)
    m = re.search(r"(" + NUM + r")\s*(?:(?:±|\+/-|−|-)\s*" + NUM + r"\s*)?(?:&nbsp;)?\s*(million|billion|thousand|M|k|G)?\s*(light-years|light-year|ly|pc|kpc|Mpc|Mly|kly|Gly)\b", v)
    if m:
        n = num(m.group(1)); pre = (m.group(2) or ""); u = m.group(3).lower()
        f = {"million": 1e6, "billion": 1e9, "thousand": 1e3, "m": 1e6, "k": 1e3, "g": 1e9, "": 1}[pre.lower()]
        return n * f * UNIT.get(u, 1)
    return None
for k in ["M51","M12","M7","M104","NGC6946","M110","M53","NGC7662","M31","M13","M42","albireo"]: pass
out = {}
for t, keys in by_title.items():
    ly = parse(raw.get(t))
    for k in keys:
        out[k] = {"ly": ly, "raw": raw.get(t)}
json.dump(out, open(os.path.join(ROOT, "cache/infobox.json"), "w"), indent=0)
print(sum(1 for v in out.values() if v["ly"]), "with an infobox distance", file=sys.stderr)
