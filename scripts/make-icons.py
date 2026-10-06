"""
AstroPilot's icons, all drawn from the logo mark (client/src/components/common/Glyphs.tsx → Logo):
favicon.svg (browser tabs), favicon.ico/.png (older browsers), apple-touch-icon.png and the PWA icons,
including a full-bleed maskable one. PNGs are rendered by headless Chrome.

    CHROME="/path/to/chrome" python3 scripts/make-icons.py

Without CHROME, it tries Google Chrome and Playwright's Chrome for Testing on macOS.
"""
import glob, os, pathlib, struct, subprocess, tempfile

PUBLIC = pathlib.Path(__file__).resolve().parent.parent / "client" / "public"
BLUE, GOLD, BG, FG = "#59cef8", "#fcc85a", "#06070f", "#e8ebf2"  # the dark theme's --primary, --gold, --background, --foreground


def find_chrome() -> str:
    candidates = [os.environ.get("CHROME", ""), "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
    candidates += sorted(glob.glob(os.path.expanduser("~/Library/Caches/ms-playwright/chromium-*/chrome-mac*/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing")))
    for c in candidates:
        if c and os.path.exists(c):
            return c
    raise SystemExit("Chrome not found: set CHROME to a Chrome or Chromium binary.")


def mark(scale, ring=1.5, tail=2.2, head=2.3, star=(0.9, 0.7), ring_op=0.9):
    """The logo mark (32-unit box) scaled about its centre; heavier lines than the app's keep small sizes legible."""
    return f'''<g transform="translate(16 16) scale({scale}) translate(-16 -16)">
    <circle cx="16" cy="16" r="14.5" fill="none" stroke="url(#g)" stroke-width="{ring}" opacity="{ring_op}"/>
    <path d="M9 22.5c3.8-1.2 9.5-5.4 13.4-12.2" fill="none" stroke="url(#g)" stroke-width="{tail}" stroke-linecap="round"/>
    <circle cx="22.6" cy="9.6" r="6.5" fill="url(#h)"/><circle cx="22.6" cy="9.6" r="{head}" fill="{GOLD}"/>
    <circle cx="10.5" cy="11" r="{star[0]}" fill="{FG}" fill-opacity=".85"/>
    <circle cx="20.5" cy="21.5" r="{star[1]}" fill="{FG}" fill-opacity=".65"/>
  </g>'''


DEFS = f'''<defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{BLUE}"/><stop offset="1" stop-color="{GOLD}"/></linearGradient>
    <radialGradient id="h"><stop offset="0" stop-color="{GOLD}" stop-opacity=".55"/><stop offset="1" stop-color="{GOLD}" stop-opacity="0"/></radialGradient>
    <radialGradient id="sky" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="#101a30"/><stop offset="1" stop-color="{BG}"/></radialGradient>
  </defs>'''


def svg(body: str) -> str:
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">\n  {DEFS}\n  {body}\n</svg>\n'


SOURCES = {
    # Browser tabs: a dark tile, so the light mark shows on light tab strips.
    "favicon": svg(f'<rect width="32" height="32" rx="7.5" fill="{BG}"/>\n  ' + mark(0.8, ring=2.1, tail=3.0, head=3.0, star=(1.1, 0.9), ring_op=1)),
    # Installed app ("any": rounded tile; iOS and maskable: full-bleed, the system shapes them).
    "app": svg(f'<rect width="32" height="32" rx="7" fill="url(#sky)"/>\n  ' + mark(0.78, ring=1.7, tail=2.5, head=2.5, star=(1.0, 0.8))),
    "touch": svg(f'<rect width="32" height="32" fill="url(#sky)"/>\n  ' + mark(0.74, ring=1.7, tail=2.5, head=2.5, star=(1.0, 0.8))),
    "maskable": svg(f'<rect width="32" height="32" fill="url(#sky)"/>\n  ' + mark(0.66, ring=1.7, tail=2.5, head=2.5, star=(1.0, 0.8))),
}
PNGS = [("favicon", 16, "favicon-16"), ("favicon", 32, "favicon-32"), ("favicon", 48, "favicon-48"), ("favicon", 64, "favicon"),
        ("touch", 180, "apple-touch-icon"), ("app", 192, "icon-192"), ("app", 512, "icon-512"), ("maskable", 512, "icon-maskable-512")]


def main():
    chrome = find_chrome()
    (PUBLIC / "favicon.svg").write_text(SOURCES["favicon"])
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        for name, src in SOURCES.items():
            (tmp / f"{name}.svg").write_text(src)
        rendered = {}
        for src, size, out in PNGS:
            page = tmp / f"{out}.html"
            page.write_text(f'<!doctype html><style>html,body{{margin:0;background:transparent}}img{{display:block;width:{size}px;height:{size}px}}</style><img src="{src}.svg">')
            png = tmp / f"{out}.png"
            subprocess.run([chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--default-background-color=00000000",
                            f"--window-size={size},{size}", f"--screenshot={png}", page.as_uri()], check=True, capture_output=True)
            rendered[out] = png.read_bytes()
        for out, data in rendered.items():
            if not out.startswith("favicon-"):
                (PUBLIC / f"{out}.png").write_bytes(data)
        # favicon.ico with the 16, 32 and 48 px images stored as PNG.
        imgs = [(s, rendered[f"favicon-{s}"]) for s in (16, 32, 48)]
        offset, entries, blob = 6 + 16 * len(imgs), b"", b""
        for s, png in imgs:
            entries += struct.pack("<BBBBHHII", s, s, 0, 0, 1, 32, len(png), offset + len(blob))
            blob += png
        (PUBLIC / "favicon.ico").write_bytes(struct.pack("<HHH", 0, 1, len(imgs)) + entries + blob)
    print("Icons written to", PUBLIC, "— bump ?v= in client/index.html and manifest.webmanifest so browsers refetch them.")


if __name__ == "__main__":
    main()
