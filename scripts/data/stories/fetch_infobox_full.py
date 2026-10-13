"""The infobox part of every catalog object's Wikipedia article (mass, number of stars, size, age…), kept raw so it
can be re-read offline → cache/infobox-raw.json {id: wikitext}."""
import json, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
UA = "AstroPilot-data-build/1.0 (https://astropilot.space; hello@astropilot.space)"
WIKI = json.load(open(os.path.join(ROOT, "cache/wiki.json")))
by_title = {}
for k, v in WIKI.items():
    if v.get("title"):
        by_title.setdefault(v["title"], []).append(k)
titles = sorted(by_title)
out = {}
for i in range(0, len(titles), 40):
    chunk = titles[i:i + 40]
    q = urllib.parse.urlencode({"action": "query", "titles": "|".join(chunk), "prop": "revisions", "rvprop": "content", "rvslots": "main", "format": "json", "formatversion": 2})
    for attempt in range(4):
        try:
            d = json.loads(urllib.request.urlopen(urllib.request.Request("https://en.wikipedia.org/w/api.php?" + q, headers={"User-Agent": UA}), timeout=60).read().decode())
            break
        except Exception as e:
            print("retry", e, file=sys.stderr); time.sleep(3 + attempt * 3)
    for p in d["query"]["pages"]:
        if not p.get("revisions"):
            continue
        text = p["revisions"][0]["slots"]["main"]["content"]
        cut = text.find("\n'''")
        box = text[: cut if cut > 0 else 20000][:20000]
        for k in by_title.get(p["title"], []):
            out[k] = box
    print(i, len(out), file=sys.stderr)
    time.sleep(0.5)
json.dump(out, open(os.path.join(ROOT, "cache/infobox-raw.json"), "w"))
print(len(out), "infoboxes", file=sys.stderr)
