"""Split the objects into writing batches with their research: scripts/data/stories/batches/NN.md"""
import json, os, re

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(ROOT, "../../..")
CAT = json.load(open(os.path.join(REPO, "shared/data/catalog.json")))
WIKI = json.load(open(os.path.join(ROOT, "cache/wiki.json")))
WIKI.update(json.load(open(os.path.join(ROOT, "cache/wiki-moons.json"))))
FACTS = json.load(open(os.path.join(ROOT, "cache/facts-raw.json")))["facts"]
LABELS = json.load(open(os.path.join(ROOT, "cache/labels.json"))) if os.path.exists(os.path.join(ROOT, "cache/labels.json")) else {}
os.makedirs(os.path.join(ROOT, "batches"), exist_ok=True)

GENERATED = re.compile(r"^An? [\d.]+-magnitude")
BODIES = ["moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune"]
MOONS = ["io", "europa", "ganymede", "callisto", "mimas", "enceladus", "tethys", "dione", "rhea", "titan", "hyperion", "iapetus", "phobos", "deimos", "miranda", "ariel", "umbriel", "titania", "oberon", "triton"]

def entry(key, name, kind, lines, wiki, limit):
    text = (wiki or {}).get("text", "")
    # Long articles: keep the lead and the sections people find interesting.
    if len(text) > limit:
        text = text[:limit] + " …[truncated]"
    head = f"## {key} — {name}\n" + "\n".join(f"- {l}" for l in lines if l)
    src = f"\n\n### Wikipedia: {wiki['title']}\n{text}" if wiki and wiki.get("title") else "\n\n(No Wikipedia article found — rely on the catalog facts above and well-established knowledge only.)"
    return head + src + "\n"

famous, others = [], []
for o in CAT:
    f = FACTS.get(o["id"], {})
    by = ", ".join(LABELS.get(q, q) for q in f.get("_by", []))
    lines = [
        f"type: {o['type'].replace('_', ' ')}; constellation: {o['con']}; designations: {', '.join(o['designations'])}",
        f"Wikidata discoverer: {by}; year: {f.get('year')}" if by or f.get("year") else None,
        f"observing note already shown in the app: {o['desc']}" if not GENERATED.match(o.get("desc", "")) else None,
        "SHOWPIECE" if o.get("showpiece") else None,
    ]
    is_famous = bool(o.get("m") or o.get("c") or o.get("showpiece") or o["type"] == "double_star")
    (famous if is_famous else others).append(entry(o["id"], o["name"], o["type"], lines, WIKI.get(o["id"]), 9000 if is_famous else 3500))
for b in BODIES:
    famous.append(entry(b, b.capitalize(), "planet", ["type: " + ("our Moon" if b == "moon" else "planet")], WIKI.get("body:" + b), 12000))
for m in MOONS:
    famous.append(entry(m, m.capitalize(), "moon", ["type: moon of a planet"], WIKI.get("moon:" + m), 6000))

def split(entries, budget, most):
    out, cur, size = [], [], 0
    for e in entries:
        if cur and (size + len(e) > budget or len(cur) >= most):
            out.append(cur); cur, size = [], 0
        cur.append(e); size += len(e)
    if cur: out.append(cur)
    return out

batches = split(famous, 330_000, 45) + split(others, 300_000, 100)
for i, b in enumerate(batches):
    open(os.path.join(ROOT, f"batches/{i:02d}.md"), "w").write("\n\n".join(b))
    print(f"{i:02d}: {len(b)} objects, {sum(map(len, b)) // 1000}k chars")
