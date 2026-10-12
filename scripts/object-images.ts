/**
 * Makes the object pictures in client/public/img/objects/ (see shared/objectImages.ts).
 *
 *   npx tsx scripts/object-images.ts            # whatever is missing
 *   npx tsx scripts/object-images.ts --force    # everything again
 *   npx tsx scripts/object-images.ts --only=M31,NGC7000,jupiter
 *
 * Deep-sky objects: a DSS2 colour cutout from CDS hips2fits, centred on the object. The Moon, planets and
 * their moons: the lead image of their Wikipedia article, if Wikimedia Commons has it under a free licence,
 * credited in shared/data/bodyImages.json. Needs `cwebp` (brew install webp).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import catalog from "../shared/data/catalog.json";
import { MOONS } from "../shared/astro/moons";
import { SOLAR_SYSTEM } from "../shared/astro/planets";
import { OBJECT_IMAGE_PX, hasSurveyPhoto, surveyFieldArcmin, type BodyImageCredit } from "../shared/objectImages";

const OUT = path.resolve("client/public/img/objects");
const CREDITS = path.resolve("shared/data/bodyImages.json");
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

function toWebp(input: Buffer, ext: string, dest: string, resize?: number) {
  const tmp = path.join(os.tmpdir(), `ap-img-${process.pid}-${Math.random().toString(36).slice(2)}.${ext}`);
  fs.writeFileSync(tmp, input);
  try {
    execFileSync("cwebp", ["-quiet", "-q", "72", "-m", "6", ...(resize ? ["-resize", String(resize), "0"] : []), tmp, "-o", dest]);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

type Entry = (typeof catalog)[number] & { size?: number[]; sep?: number };

async function survey(o: Entry) {
  const fovDeg = surveyFieldArcmin(o) / 60;
  const q = new URLSearchParams({
    hips: "CDS/P/DSS2/color",
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

/** Where the article has no lead image (or a poor one): a chosen file on Commons. */
const COMMONS_FILE: Record<string, string> = {
  mimas: "Mimas Cassini.jpg",
  umbriel: "Umbriel (moon).jpg",
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

async function body(id: string, credits: Record<string, BodyImageCredit>) {
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
        `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=960&titles=${encodeURIComponent(`File:${name}`)}`,
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
  // Shrink big images to the standard width; never blow up a small one.
  const width = ii.thumbwidth ?? ii.width;
  toWebp(await get(src), ext === "jpeg" ? "jpg" : ext, outFile(id), width > OBJECT_IMAGE_PX ? OBJECT_IMAGE_PX : undefined);
  const author = strip(meta.Artist?.value ?? meta.Credit?.value ?? "").slice(0, 140);
  credits[id] = {
    page: ii.descriptionurl,
    author,
    license,
    ...(meta.LicenseUrl?.value ? { licenseUrl: meta.LicenseUrl.value } : {}),
    what: whatOf(strip(meta.ImageDescription?.value ?? ""), author),
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

  const credits: Record<string, BodyImageCredit> = fs.existsSync(CREDITS) ? JSON.parse(fs.readFileSync(CREDITS, "utf8")) : {};
  const ids = [...SOLAR_SYSTEM.map((p) => p.id as string), ...MOONS.map((m) => m.id as string)].filter(
    (id, i, all) => all.indexOf(id) === i && want(id) && (force || !fs.existsSync(outFile(id)) || !credits[id]),
  );
  console.log(`Planet and moon images to make: ${ids.length}`);
  for (const id of ids) {
    try {
      await body(id, credits);
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
