"""Check a writer's output against its batch: python3 check.py NN  → prints problems (empty = OK)."""
import json, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
n = sys.argv[1]
ids = re.findall(r"^## (\S+) — ", open(os.path.join(ROOT, f"batches/{n}.md")).read(), re.M)
stars = n.startswith("s")
famous = stars or int(n) <= 6
slugs = set(open(os.path.join(ROOT, "glossary-slugs.txt")).read().split())
try:
    out = json.load(open(os.path.join(ROOT, f"out/{n}.json")))
except Exception as e:
    print("cannot read out file:", e); sys.exit(1)

problems = []
missing = [i for i in ids if i not in out]
extra = [k for k in out if k not in ids]
if missing: problems.append(f"missing ids: {missing}")
if extra: problems.append(f"ids not in the batch: {extra}")
DIST = re.compile(r"\d[\d,.]*\s*(?:thousand|million|billion)?\s*(?:light[- ]years?|ly|parsecs?|pc)\b", re.I)
HYPE = re.compile(r"\b(stunning|breathtaking|jaw-dropping|mesmeri[sz]ing|awe-inspiring|truly|incredibly)\b", re.I)
for k, v in out.items():
    if k not in ids: continue
    p = lambda m: problems.append(f"{k}: {m}")
    if not isinstance(v, dict): p("not an object"); continue
    for f in ("tagline", "story", "facts", "discovered") + (("desc",) if stars else ()):
        if f not in v: p(f"no '{f}'")
    if stars and isinstance(v.get("desc"), str) and not 60 <= len(v["desc"]) <= 320: p(f"desc length {len(v['desc'])} (60–320)")
    if stars and isinstance(v.get("desc"), str) and "[[" in v["desc"]: p("no glossary links in desc")
    tag, story, facts = v.get("tagline", ""), v.get("story", []), v.get("facts", [])
    if not isinstance(tag, str) or not 20 <= len(tag) <= 130: p(f"tagline length {len(tag) if isinstance(tag, str) else '?'} (20–130 chars)")
    if not isinstance(story, list) or not story or not all(isinstance(x, str) for x in story): p("story must be a list of paragraph strings"); continue
    words = sum(len(re.sub(r"\[\[[^|\]]*\|?", "", x).split()) for x in story)
    lo, hi = (80, 210) if famous else (35, 130)
    if not lo <= words <= hi: p(f"story is {words} words ({lo}–{hi})")
    if len(story) > 3: p("more than 3 paragraphs")
    if not isinstance(facts, list) or len(facts) > 4 or (famous and len(facts) < 2): p(f"{len(facts) if isinstance(facts, list) else '?'} facts ({'2' if famous else '0'}–4)")
    for f in facts if isinstance(facts, list) else []:
        if not isinstance(f, dict) or set(f) != {"title", "text"}: p(f"fact must be {{title, text}}: {f}"); continue
        if not 3 <= len(f["title"]) <= 45: p(f"fact title length {len(f['title'])} (≤45): {f['title']}")
        if not 30 <= len(f["text"]) <= 300: p(f"fact text length {len(f['text'])} (30–300): {f['title']}")
    d = v.get("discovered")
    if d is not None and (not isinstance(d, dict) or set(d) - {"by", "year", "note"} or (d.get("year") is not None and not isinstance(d["year"], int))):
        p(f"discovered must be null or {{by, year, note}} with an integer year: {d}")
    text = " ".join([tag] + story + [f.get("text", "") + " " + f.get("title", "") for f in facts if isinstance(f, dict)] + ([v.get("desc", "")] if stars else []))
    links = re.findall(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]", text)
    for s in links:
        if s not in slugs: p(f"unknown glossary slug [[{s}]]")
    if len(links) > 4: p(f"{len(links)} glossary links (max 4)")
    if "[[" in tag: p("no glossary links in the tagline")
    for m in DIST.findall(text): p(f"states a distance/size number: '{m}'")
    for m in HYPE.findall(text): p(f"hype word: '{m}'")
    if "!" in text: p("exclamation mark")
    if re.search(r"\bdid you know\b", text, re.I): p("'did you know' phrasing")
print("\n".join(problems) if problems else f"OK: {len(ids)} objects")
