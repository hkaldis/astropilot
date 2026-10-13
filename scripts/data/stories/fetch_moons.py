import json, os, sys, time
sys.argv = [sys.argv[0]]
ROOT = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(ROOT, "fetch_wiki.py")).read().split("def main():")[0])
MOONS = {"io":"Io (moon)","europa":"Europa (moon)","ganymede":"Ganymede (moon)","callisto":"Callisto (moon)","mimas":"Mimas (moon)","enceladus":"Enceladus","tethys":"Tethys (moon)","dione":"Dione (moon)","rhea":"Rhea (moon)","titan":"Titan (moon)","hyperion":"Hyperion (moon)","iapetus":"Iapetus (moon)","phobos":"Phobos (moon)","deimos":"Deimos (moon)","miranda":"Miranda (moon)","ariel":"Ariel (moon)","umbriel":"Umbriel","titania":"Titania (moon)","oberon":"Oberon (moon)","triton":"Triton (moon)"}
out = {}
for k, t in MOONS.items():
    out["moon:" + k] = lookup(t) or {}
    print(k, out["moon:" + k].get("title"), file=sys.stderr)
    time.sleep(0.3)
json.dump(out, open(os.path.join(ROOT, "cache/wiki-moons.json"), "w"))
