/**
 * Makes the object pictures in client/public/img/objects/ (see shared/objectImages.ts).
 *
 *   npx tsx scripts/object-images.ts            # whatever is missing
 *   npx tsx scripts/object-images.ts --force    # everything again
 *   npx tsx scripts/object-images.ts --only=M31,NGC7000,jupiter
 *
 * Deep-sky objects: a DSS2 colour cutout from CDS hips2fits, centred on the object (the red plate alone
 * where the colour version burns out). The Moon, planets and their moons: the lead image of their Wikipedia
 * article; the brightest double stars: a photograph chosen by hand. Both only from Wikimedia Commons under a
 * free licence, credited in shared/data/commonsImages.json. Needs `cwebp` (brew install webp).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import catalog from "../shared/data/catalog.json";
import { MOONS } from "../shared/astro/moons";
import { SOLAR_SYSTEM } from "../shared/astro/planets";
import { OBJECT_IMAGE_PX, hasSurveyPhoto, surveyFieldArcmin, type CommonsImageCredit } from "../shared/objectImages";

const OUT = path.resolve("client/public/img/objects");
const CREDITS = path.resolve("shared/data/commonsImages.json");
const UA = "AstroPilot/1.0 (https://astropilot.space; hello@astropilot.space)";
const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",").map((s) => s.toLowerCase());
const want = (id: string) => !only || only.includes(id.toLowerCase());
const outFile = (id: string) => path.join(OUT, `${id.toLowerCase()}.webp`);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string, tries = 3): Promise<Buffer> {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(90_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(2000 * i);
    }
  }
}

const tmpFile = (ext: string) => path.join(os.tmpdir(), `ap-img-${process.pid}-${Math.random().toString(36).slice(2)}.${ext}`);

function toWebp(input: Buffer, ext: string, dest: string, resize?: number, crop?: [number, number, number, number]) {
  const tmp = tmpFile(ext);
  fs.writeFileSync(tmp, input);
  try {
    execFileSync("cwebp", ["-quiet", "-q", "72", "-m", "6", ...(crop ? ["-crop", ...crop.map(String)] : []), ...(resize ? ["-resize", String(resize), "0"] : []), tmp, "-o", dest]);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/**
 * A square around the brightest stars of a photo (in its own pixels), when they're a small speck in a big
 * dark frame — as a double star usually is — so the pair stays visible on a phone. Null to keep the frame.
 */
function cropToStars(input: Buffer, ext: string): [number, number, number, number] | null {
  const src = tmpFile(ext);
  const bmp = tmpFile("bmp");
  fs.writeFileSync(src, input);
  try {
    const dims = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", src]).toString();
    const W = Number(/pixelWidth: (\d+)/.exec(dims)?.[1]);
    const H = Number(/pixelHeight: (\d+)/.exec(dims)?.[1]);
    execFileSync("sips", ["-s", "format", "bmp", "-Z", "400", src, "--out", bmp], { stdio: "ignore" });
    const d = fs.readFileSync(bmp);
    const off = d.readUInt32LE(10);
    const w = d.readInt32LE(18);
    const hRaw = d.readInt32LE(22);
    const h = Math.abs(hRaw);
    const bpp = d.readUInt16LE(28) / 8;
    const stride = (w * bpp + 3) & ~3;
    const lum = (x: number, y: number) => {
      const o = off + (hRaw > 0 ? h - 1 - y : y) * stride + x * bpp;
      return 0.3 * d[o + 2] + 0.59 * d[o + 1] + 0.11 * d[o];
    };
    // The brightest star: of the near-saturated pixels, the one with the brightest surroundings
    // (a bigger burnt-out core is a brighter star).
    let max = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) max = Math.max(max, lum(x, y));
    let mx = 0, my = 0, best = -1;
    for (let y = 2; y < h - 2; y++)
      for (let x = 2; x < w - 2; x++) {
        if (lum(x, y) < max * 0.95) continue;
        let sum = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) sum += lum(x + dx, y + dy);
        if (sum > best) [best, mx, my] = [sum, x, y];
      }
    // Its companion is near it: frame the bright pixels within a seventh of the frame.
    const short = Math.min(w, h);
    const R = short * 0.15;
    let x0 = mx, y0 = my, x1 = mx, y1 = my;
    for (let y = Math.max(0, Math.floor(my - R)); y < Math.min(h, my + R); y++)
      for (let x = Math.max(0, Math.floor(mx - R)); x < Math.min(w, mx + R); x++)
        if (Math.hypot(x - mx, y - my) <= R && lum(x, y) >= max * 0.5) {
          x0 = Math.min(x0, x); x1 = Math.max(x1, x);
          y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
    const spread = Math.max(x1 - x0, y1 - y0) + 1;
    const k = W / w; // back to the photo's own pixels
    const side = Math.min(short, Math.max(spread * 4, short * 0.3, 160 / k));
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const S = Math.round(side * k);
    const X = Math.round(Math.max(0, Math.min(W - S, cx * k - S / 2)));
    const Y = Math.round(Math.max(0, Math.min(H - S, cy * k - S / 2)));
    return [X, Y, S, S];
  } finally {
    fs.rmSync(src, { force: true });
    fs.rmSync(bmp, { force: true });
  }
}

type Entry = (typeof catalog)[number] & { size?: number[]; sep?: number };

/**
 * Bright nebulae and star fields where the survey's colour version is burnt out (mostly the southern Milky
 * Way and the Large Magellanic Cloud, whose blue plates saturate): the red plate alone keeps their detail.
 * Chosen by comparing the two side by side.
 */
const RED_PLATE = new Set(
  "ngc3324 ngc2060 ngc6530 ngc3293 ngc1973 ngc6540 ngc6441 ngc6453 ngc1980 ngc6520 ngc2069 ngc6553 ngc1910 ngc1916 ngc2037 ngc6522 ngc1975 ngc2074 ngc6067 ngc2080 ngc1854 ngc1858 ngc1850 m7 m11 ngc1970 ngc1763 ngc1856 ngc1984 ngc6997 ngc6451 ngc2042 ngc6528 ngc6401 ngc6645 m28 ngc6683 ngc330 ngc2100 ngc5999 ngc6544 ngc6604 ngc6583".split(" "),
);

async function survey(o: Entry) {
  const fovDeg = surveyFieldArcmin(o) / 60;
  const q = new URLSearchParams({
    hips: RED_PLATE.has(o.id.toLowerCase()) ? "CDS/P/DSS2/red" : "CDS/P/DSS2/color",
    width: String(OBJECT_IMAGE_PX),
    height: String(OBJECT_IMAGE_PX),
    fov: fovDeg.toFixed(4),
    projection: "TAN",
    coordsys: "icrs",
    ra: (o.ra * 15).toFixed(5),
    dec: o.dec.toFixed(5),
    format: "jpg",
  });
  const jpg = await get(`https://alasky.cds.unistra.fr/hips-image-services/hips2fits?${q}`);
  toWebp(jpg, "jpg", outFile(o.id));
}

const WIKI: Record<string, string> = {
  moon: "Moon",
  mercury: "Mercury (planet)",
  venus: "Venus",
  mars: "Mars",
  jupiter: "Jupiter",
  saturn: "Saturn",
  uranus: "Uranus",
  neptune: "Neptune",
  io: "Io (moon)",
  europa: "Europa (moon)",
  ganymede: "Ganymede (moon)",
  callisto: "Callisto (moon)",
  mimas: "Mimas (moon)",
  enceladus: "Enceladus",
  tethys: "Tethys (moon)",
  dione: "Dione (moon)",
  rhea: "Rhea (moon)",
  titan: "Titan (moon)",
  hyperion: "Hyperion (moon)",
  iapetus: "Iapetus (moon)",
  phobos: "Phobos (moon)",
  deimos: "Deimos (moon)",
  miranda: "Miranda (moon)",
  ariel: "Ariel (moon)",
  umbriel: "Umbriel (moon)",
  titania: "Titania (moon)",
  oberon: "Oberon (moon)",
  triton: "Triton (moon)",
};

/**
 * A chosen file on Commons: where the article has no lead image, and for the bright double stars (whose
 * articles only have constellation maps). Each double was picked by eye from the star's Commons category
 * or a search, for showing the pair (or the star in its field) as an observer would see or photograph it.
 * The other 21 bright doubles have no free photograph that shows them usefully; their pages show the pair
 * diagram instead.
 */
const COMMONS_FILE: Record<string, string> = {
  mimas: "Mimas Cassini.jpg",
  umbriel: "Umbriel (moon).jpg",
  "61-cygni": "61cyg.jpg",
  acrab: "Graffias tel140.png",
  acrux: "Wide-field view of part of the Coalsack Nebula.jpg",
  albireo: "Albireo through Celestron C8.jpg",
  algieba: "Gamma Leonis Algieba orientation.jpg",
  almach: "Alamach tel140mm.png",
  alnitak: "Star-Alnitak.png",
  "alpha-centauri": "Best image of Alpha Centauri A and B.jpg",
  antares: "Antares nebulosity.jpg",
  "cor-caroli": "Cor Caroli July 26 2025.png",
  "epsilon-lyrae": "Double Double June 9 2025.png",
  "eta-cassiopeiae": "Eta Cassiopeiae.jpg",
  "eta-persei": "Eta Persei.jpg",
  "gamma-delphini": "Gamma Delphini.png",
  "iota-cancri": "Iota Cancri.jpg",
  mizar: "ALCOR et MIZAR (7060991417).jpg",
  "nu-draconis": "Nu Draconis.jpg",
  polaris: "2006-02-c-compass large web.jpg",
  rasalgethi: "Double star Alpha Hercules.jpg",
  rigel: "Rigel & IC 2118 (Orion - Eridanus) (Giuseppe Donatiello).jpg",
  "sigma-orionis": "SigmaOrionis.jpg",
  trapezium: "Orionnebel.P1025321.jpg",
  "zeta-lyrae": "Zeta Lyrae.jpg",
};

/** Double-star photos where the pair is a speck in a big frame: cropped to the stars. */
const CROP_TO_STARS = new Set([
  "61-cygni", "albireo", "algieba", "cor-caroli", "eta-cassiopeiae", "eta-persei", "gamma-delphini",
  "nu-draconis", "rasalgethi", "zeta-lyrae",
]);

/** Where the file's own record lacks the credit its makers ask for. */
const CREDIT_OVERRIDE: Record<string, Partial<CommonsImageCredit>> = {
  polaris: { author: "NASA, ESA, N. Evans (Harvard-Smithsonian CfA) and H. Bond (STScI)", what: "Hubble Space Telescope" },
};

const strip = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/** Who made it, in a few words, from the Commons description and author fields. */
function whatOf(desc: string, author: string): string {
  const s = `${desc} ${author}`;
  for (const [re, name] of [
    [/hubble/i, "Hubble Space Telescope"],
    [/juno/i, "Juno"],
    [/cassini/i, "Cassini"],
    [/voyager/i, "Voyager"],
    [/galileo/i, "Galileo"],
    [/messenger/i, "MESSENGER"],
    [/new horizons/i, "New Horizons"],
    [/mariner/i, "Mariner"],
    [/mars reconnaissance|hirise/i, "Mars Reconnaissance Orbiter"],
    [/viking/i, "Viking"],
    [/akatsuki/i, "Akatsuki"],
    [/lunar reconnaissance|lroc/i, "Lunar Reconnaissance Orbiter"],
  ] as const)
    if (re.test(s)) return name;
  return "";
}

async function commonsImage(id: string, credits: Record<string, CommonsImageCredit>) {
  const title = WIKI[id];
  let name: string | undefined = COMMONS_FILE[id];
  if (!name) {
    const pi = JSON.parse(
      (await get(`https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=name&titles=${encodeURIComponent(title)}`)).toString(),
    );
    name = Object.values<{ pageimage?: string }>(pi.query.pages)[0]?.pageimage;
  }
  if (!name) throw new Error(`no lead image for ${title}`);
  const info = JSON.parse(
    (
      await get(
        `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=${CROP_TO_STARS.has(id) ? 1920 : 960}&titles=${encodeURIComponent(`File:${name}`)}`,
      )
    ).toString(),
  );
  const ii = Object.values<{
    imageinfo?: { thumburl?: string; thumbwidth?: number; url: string; width: number; descriptionurl: string; extmetadata: Record<string, { value: string }> }[];
  }>(info.query.pages)[0]?.imageinfo?.[0];
  if (!ii) throw new Error(`${name} isn't on Commons (not freely licensed)`);
  const meta = ii.extmetadata;
  const license = strip(meta.LicenseShortName?.value ?? "");
  if (!/public domain|^pd|cc0|cc by/i.test(license)) throw new Error(`${name}: licence "${license}" isn't free enough`);
  const src = ii.thumburl ?? ii.url;
  const ext = path.extname(new URL(src).pathname).slice(1).toLowerCase() || "jpg";
  const data = await get(src);
  const type = ext === "jpeg" ? "jpg" : ext;
  const crop = CROP_TO_STARS.has(id) ? cropToStars(data, type) : null;
  // Shrink big images to the standard width; never blow up a small one.
  const width = crop ? crop[2] : (ii.thumbwidth ?? ii.width);
  toWebp(data, type, outFile(id), width > OBJECT_IMAGE_PX ? OBJECT_IMAGE_PX : undefined, crop ?? undefined);
  const author = strip(meta.Artist?.value ?? meta.Credit?.value ?? "").slice(0, 140);
  credits[id] = {
    page: ii.descriptionurl,
    author,
    license,
    ...(meta.LicenseUrl?.value ? { licenseUrl: meta.LicenseUrl.value } : {}),
    what: whatOf(strip(meta.ImageDescription?.value ?? ""), author),
    ...CREDIT_OVERRIDE[id],
  };
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const failed: string[] = [];
  let done = 0;

  const deep = (catalog as Entry[]).filter((o) => hasSurveyPhoto(o) && want(o.id) && (force || !fs.existsSync(outFile(o.id))));
  console.log(`Survey photos to make: ${deep.length}`);
  await pool(deep, 3, async (o) => {
    try {
      await survey(o);
    } catch (e) {
      failed.push(`${o.id}: ${(e as Error).message}`);
    }
    if (++done % 25 === 0) console.log(`  ${done}/${deep.length}`);
  });

  const credits: Record<string, CommonsImageCredit> = fs.existsSync(CREDITS) ? JSON.parse(fs.readFileSync(CREDITS, "utf8")) : {};
  const ids = [...SOLAR_SYSTEM.map((p) => p.id as string), ...MOONS.map((m) => m.id as string), ...Object.keys(COMMONS_FILE)].filter(
    (id, i, all) => all.indexOf(id) === i && want(id) && (force || !fs.existsSync(outFile(id)) || !credits[id]),
  );
  console.log(`Wikimedia Commons images to make: ${ids.length}`);
  for (const id of ids) {
    try {
      await commonsImage(id, credits);
    } catch (e) {
      failed.push(`${id}: ${(e as Error).message}`);
    }
    await sleep(300);
  }
  fs.writeFileSync(CREDITS, JSON.stringify(Object.fromEntries(Object.entries(credits).sort(([a], [b]) => a.localeCompare(b))), null, 2) + "\n");

  if (failed.length) {
    console.log(`Failed (${failed.length}):\n  ${failed.join("\n  ")}`);
    process.exitCode = 1;
  } else console.log("All done.");
}

main();
