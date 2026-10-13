"""Flag story text that copies long runs of words from the Wikipedia research (≥ 10 words in a row)."""
import json, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
WIKI = json.load(open(os.path.join(ROOT, "cache/wiki.json")))
WIKI.update({k.split(":", 1)[1]: v for k, v in json.load(open(os.path.join(ROOT, "cache/wiki-moons.json"))).items()})
for k in list(WIKI):
    if k.startswith("body:"): WIKI[k[5:]] = WIKI[k]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 10
words = lambda t: re.findall(r"[a-z0-9]+", re.sub(r"\[\[[^|\]]*\|?", "", t.lower()))
hits = 0
for path in sorted(os.listdir(os.path.join(ROOT, "out"))):
    if sys.argv[1:2] and sys.argv[1] != "all" and not path.startswith(sys.argv[1]): continue
    for k, v in json.load(open(os.path.join(ROOT, "out", path))).items():
        src = words((WIKI.get(k) or {}).get("text", ""))
        grams = {" ".join(src[i:i + N]) for i in range(len(src) - N + 1)}
        for part in [v["tagline"], *v["story"], *[f["text"] for f in v["facts"]]]:
            w = words(part)
            for i in range(len(w) - N + 1):
                g = " ".join(w[i:i + N])
                if g in grams:
                    print(f"{path} {k}: …{g}…"); hits += 1
                    break
print(f"{hits} passages with {N}+ words copied", file=sys.stderr)
