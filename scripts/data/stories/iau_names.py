"""Parse the IAU Catalog of Star Names (WGSN; https://www.pas.rochester.edu/~emamajek/WGSN/IAU-CSN.txt)."""
import os, re

def load(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache/IAU-CSN.txt")):
    out = []
    for l in open(path, encoding="utf-8").read().splitlines():
        if not l.strip() or l[0] in "#$":
            continue
        t = l.split()
        di = next(i for i, x in enumerate(t) if re.match(r"^\d{4}-\d{2}-\d{2}$", x))
        head = re.split(r"\s{2,}", l.strip())
        out.append({
            "ascii": head[0], "name": head[1], "desig": head[2],
            "bayer": t[di - 11], "greek": t[di - 10], "con": t[di - 9], "comp": t[di - 8],
            "mag": t[di - 6], "hip": t[di - 4], "hd": t[di - 3], "ra": float(t[di - 2]) / 15, "dec": float(t[di - 1]),
        })
    return out

if __name__ == "__main__":
    rows = load()
    print(len(rows), [r for r in rows if r["name"] in ("Aldebaran", "Alula Australis", "Girtab", "Uridim")])
