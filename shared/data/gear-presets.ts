/**
 * Curated popular equipment for quick-add, plus the shared vocabulary for gear
 * (telescope types, filter types, camera types, validation limits, sensor strings).
 *
 * Specs are manufacturers' published values. Central obstruction is given as % of the
 * aperture diameter where it is published or well established; otherwise it is omitted.
 * Binoculars store a nominal objective focal length (magnification × 18 mm) — only their
 * aperture and magnification are meaningful.
 */

// ------------------------------------------------------------------------------------
// Vocabulary
// ------------------------------------------------------------------------------------

export const TELESCOPE_TYPES = [
  { id: "refractor", label: "Refractor" },
  { id: "reflector", label: "Newtonian reflector" },
  { id: "dobsonian", label: "Dobsonian" },
  { id: "sct", label: "Schmidt–Cassegrain" },
  { id: "mak", label: "Maksutov–Cassegrain" },
  { id: "rc", label: "Ritchey–Chrétien" },
  { id: "astrograph", label: "Astrograph" },
  { id: "smart", label: "Smart telescope" },
  { id: "binoculars", label: "Binoculars" },
  { id: "other", label: "Other" },
] as const;
export type TelescopeType = (typeof TELESCOPE_TYPES)[number]["id"];
export const TELESCOPE_TYPE_IDS = TELESCOPE_TYPES.map((t) => t.id) as [TelescopeType, ...TelescopeType[]];

export function telescopeTypeLabel(type: string | null | undefined): string {
  return TELESCOPE_TYPES.find((t) => t.id === type)?.label ?? "Telescope";
}

/** Map free-form / legacy type strings ("Reflector", "Catadioptric") to a canonical type. */
export function normalizeTelescopeType(type: string | null | undefined, name = ""): TelescopeType | null {
  const t = (type ?? "").trim().toLowerCase();
  if (!t) return null;
  if ((TELESCOPE_TYPE_IDS as string[]).includes(t)) return t as TelescopeType;
  if (/bino/.test(t)) return "binoculars";
  if (/dob/.test(t)) return "dobsonian";
  if (/newton|reflector/.test(t)) return /dob/i.test(name) ? "dobsonian" : "reflector";
  if (/refract|apo|achromat|\bed\b/.test(t)) return "refractor";
  if (/maks?|maksutov/.test(t)) return "mak";
  if (/ritchey|^rc$/.test(t)) return "rc";
  if (/smart/.test(t)) return "smart";
  if (/rasa|hyperstar|astrograph/.test(t)) return "astrograph";
  if (/sct|schmidt|cata|cassegrain/.test(t)) {
    if (/mak/i.test(name)) return "mak";
    if (/ritchey|\brc\d*\b/i.test(name)) return "rc";
    if (/rasa/i.test(name)) return "astrograph";
    return "sct";
  }
  return "other";
}

/** Types that take eyepieces (binoculars and smart telescopes don't). */
export function usesEyepieces(type: string | null | undefined): boolean {
  return type !== "binoculars" && type !== "smart";
}

export const FILTER_TYPES = [
  { id: "uhc", label: "UHC / narrowband nebula", short: "UHC" },
  { id: "oiii", label: "OIII", short: "OIII" },
  { id: "h_beta", label: "H-beta", short: "H-β" },
  { id: "lps", label: "Broadband light-pollution (CLS, LPR)", short: "LPR" },
  { id: "moon", label: "Moon / neutral density", short: "Moon" },
  { id: "variable_polarizer", label: "Variable polariser", short: "Polariser" },
  { id: "neodymium", label: "Neodymium (Moon & Skyglow)", short: "Neodymium" },
  { id: "contrast_booster", label: "Contrast booster", short: "Contrast" },
  { id: "semi_apo", label: "Minus-violet / Semi-APO", short: "Minus-violet" },
  { id: "fringe_killer", label: "Fringe killer", short: "Fringe killer" },
  { id: "color_red", label: "Colour: red (#23A, #25)", short: "Red" },
  { id: "color_orange", label: "Colour: orange (#21)", short: "Orange" },
  { id: "color_yellow", label: "Colour: yellow (#8, #12)", short: "Yellow" },
  { id: "color_green", label: "Colour: green (#56, #58)", short: "Green" },
  { id: "color_blue", label: "Colour: blue (#80A, #82A)", short: "Blue" },
  { id: "color_violet", label: "Colour: violet (#47)", short: "Violet" },
  { id: "color", label: "Colour filter set", short: "Colour set" },
  { id: "h_alpha", label: "H-alpha (imaging)", short: "H-α" },
  // Legacy values still valid in the database enum.
  { id: "cls", label: "Broadband light-pollution (CLS)", short: "CLS", legacy: true },
  { id: "light_pollution", label: "Broadband light-pollution", short: "LPR", legacy: true },
  { id: "nd", label: "Neutral density", short: "ND", legacy: true },
  { id: "none", label: "Clear / no filter", short: "Clear", legacy: true },
] as const;
export type FilterType = (typeof FILTER_TYPES)[number]["id"];
/** All values of the database enum `filter_type`. */
export const FILTER_TYPE_IDS = FILTER_TYPES.map((f) => f.id) as [FilterType, ...FilterType[]];

export function filterTypeLabel(type: string, short = false): string {
  const f = FILTER_TYPES.find((x) => x.id === type);
  return f ? (short ? f.short : f.label) : type;
}

/**
 * The family a filter belongs to, in the vocabulary of `filterAdvice()` (shared/astro/optics):
 * lets features match the user's filters against advice like `best: "oiii"`.
 */
export function filterFamily(type: string): "uhc" | "oiii" | "h_beta" | "lps" | "moon" | "color" | "h_alpha" | "none" {
  switch (type) {
    case "uhc":
      return "uhc";
    case "oiii":
      return "oiii";
    case "h_beta":
      return "h_beta";
    case "h_alpha":
      return "h_alpha";
    case "lps":
    case "cls":
    case "light_pollution":
      return "lps";
    case "moon":
    case "nd":
    case "variable_polarizer":
      return "moon";
    case "none":
      return "none";
    default:
      return "color"; // colour, neodymium, contrast/minus-violet filters: planetary & lunar contrast aids
  }
}

export const CAMERA_TYPES = [
  { id: "dslr", label: "DSLR / mirrorless" },
  { id: "astrocam", label: "Astronomy camera" },
  { id: "smartphone", label: "Smartphone" },
] as const;
export type CameraType = (typeof CAMERA_TYPES)[number]["id"];
export const CAMERA_TYPE_IDS = CAMERA_TYPES.map((c) => c.id) as [CameraType, ...CameraType[]];

export function cameraTypeLabel(type: string): string {
  return CAMERA_TYPES.find((c) => c.id === type)?.label ?? type;
}

/** Validation ranges shared by the API and the forms. */
export const GEAR_LIMITS = {
  name: 100,
  aperture: { min: 10, max: 1500 }, // mm
  focalLength: { min: 50, max: 20000 }, // mm
  fRatio: { min: 1, max: 40 },
  obstruction: { min: 0, max: 70 }, // % of diameter
  eyepieceFocal: { min: 2, max: 60 }, // mm
  afov: { min: 30, max: 120 }, // degrees
  barlowFactor: { min: 0.3, max: 5 },
  sensor: 50, // characters
  sensorMm: { min: 1, max: 60 },
  pixelUm: { min: 0.8, max: 30 },
  binocularMag: { min: 4, max: 40 },
} as const;

/** Nominal eyepiece focal length used to store binoculars (focal length = magnification × this). */
export const BINOCULAR_NOMINAL_EYEPIECE = 18;

/** Magnification of binoculars: from a "10×50" style name, else from the nominal focal length. */
export function binocularMagnification(t: { name: string; aperture: number; focalLength: number }): number {
  const m = t.name.match(/(\d{1,2}(?:[.,]\d)?)\s*[x×]\s*(\d{2,3})/i);
  if (m) {
    const mag = parseFloat(m[1].replace(",", "."));
    if (mag >= GEAR_LIMITS.binocularMag.min && mag <= GEAR_LIMITS.binocularMag.max) return mag;
  }
  return Math.round((t.focalLength / BINOCULAR_NOMINAL_EYEPIECE) * 10) / 10;
}

/** A zoom eyepiece's focal-length range, read from its name ("8–24 mm zoom"). */
export function zoomRange(name: string): [number, number] | null {
  if (!/zoom/i.test(name)) return null;
  const m = name.match(/(\d+(?:[.,]\d+)?)\s*(?:mm)?\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s*mm/i);
  if (!m) return null;
  const a = parseFloat(m[1].replace(",", "."));
  const b = parseFloat(m[2].replace(",", "."));
  if (!(a > 0 && b > a && b <= 60)) return null;
  return [a, b];
}

export function barlowKind(factor: number): "barlow" | "reducer" | "corrector" {
  if (factor > 1.2) return "barlow";
  if (factor < 0.97) return "reducer";
  return "corrector";
}

// ------------------------------------------------------------------------------------
// Sensor strings: "23.5 × 15.7 mm · 3.76 µm" (stored in cameras.sensor_size, varchar 50)
// ------------------------------------------------------------------------------------

export interface SensorSpec {
  w: number; // mm
  h: number; // mm
  pixel: number | null; // µm
}

const trim = (n: number) => String(Math.round(n * 100) / 100);

export function formatSensor(s: { w: number; h: number; pixel?: number | null }): string {
  return `${trim(s.w)} × ${trim(s.h)} mm${s.pixel ? ` · ${trim(s.pixel)} µm` : ""}`;
}

/** Parse "23.5x15.6", "23.5 × 15.7 mm · 3.76 µm", "36 x 24mm, 5.9um". Null if it doesn't look like a size. */
export function parseSensor(s: string | null | undefined): SensorSpec | null {
  if (!s) return null;
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*(?:mm)?\s*[x×*]\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) return null;
  const w = parseFloat(m[1].replace(",", "."));
  const h = parseFloat(m[2].replace(",", "."));
  const L = GEAR_LIMITS.sensorMm;
  if (!(w >= L.min && w <= L.max && h >= L.min && h <= L.max)) return null;
  const p = s.match(/(\d+(?:[.,]\d+)?)\s*(?:µm|μm|um|micron)/i);
  const pixel = p ? parseFloat(p[1].replace(",", ".")) : null;
  return { w, h, pixel: pixel && pixel >= GEAR_LIMITS.pixelUm.min && pixel <= GEAR_LIMITS.pixelUm.max ? pixel : null };
}

/** Common sensor formats for custom camera entry. */
export const SENSOR_FORMATS: { id: string; label: string; w: number; h: number }[] = [
  { id: "ff", label: "Full frame", w: 36, h: 24 },
  { id: "apsc", label: "APS-C (Nikon, Sony, Fuji)", w: 23.5, h: 15.6 },
  { id: "apsc-canon", label: "APS-C (Canon)", w: 22.3, h: 14.9 },
  { id: "43in", label: '4/3″ (IMX294)', w: 19.1, h: 13 },
  { id: "mft", label: "Micro Four Thirds", w: 17.3, h: 13 },
  { id: "1in", label: '1″ (IMX183)', w: 13.2, h: 8.8 },
  { id: "1in-sq", label: '1″ square (IMX533)', w: 11.3, h: 11.3 },
  { id: "12in", label: '1/1.2″ (IMX585)', w: 11.1, h: 6.3 },
  { id: "18in", label: '1/1.8″ (IMX678)', w: 7.7, h: 4.3 },
  { id: "128in", label: '1/2.8″ (IMX462, IMX290)', w: 5.6, h: 3.2 },
  { id: "13in", label: '1/3″ (IMX224)', w: 4.9, h: 3.7 },
];

// ------------------------------------------------------------------------------------
// Presets
// ------------------------------------------------------------------------------------

export interface TelescopePreset {
  name: string;
  type: TelescopeType;
  aperture: number; // mm
  focalLength: number; // mm
  obstruction?: number; // % of diameter
}

export interface EyepiecePreset {
  name: string;
  series: string;
  focalLength: number; // mm (zooms: shortest focal length)
  afov: number; // degrees (zooms: at the shortest focal length)
}

export interface BarlowPreset {
  name: string;
  factor: number;
}

export interface FilterPreset {
  name: string;
  type: FilterType;
}

export interface CameraPreset {
  name: string;
  type: CameraType;
  sensor: { w: number; h: number; pixel?: number } | null;
}

const bino = (name: string, aperture: number, mag: number): TelescopePreset => ({
  name,
  type: "binoculars",
  aperture,
  focalLength: mag * BINOCULAR_NOMINAL_EYEPIECE,
});

export const TELESCOPE_PRESETS: TelescopePreset[] = [
  // Dobsonians
  { name: "Sky-Watcher Heritage 130P", type: "dobsonian", aperture: 130, focalLength: 650 },
  { name: "Sky-Watcher Heritage 150P", type: "dobsonian", aperture: 150, focalLength: 750 },
  { name: "Sky-Watcher Skyliner 150P", type: "dobsonian", aperture: 150, focalLength: 1200 },
  { name: "Sky-Watcher Skyliner 200P (8″)", type: "dobsonian", aperture: 200, focalLength: 1200, obstruction: 24 },
  { name: "Sky-Watcher Skyliner 250PX (10″)", type: "dobsonian", aperture: 254, focalLength: 1200, obstruction: 23 },
  { name: "Sky-Watcher Skyliner 300P FlexTube (12″)", type: "dobsonian", aperture: 305, focalLength: 1500, obstruction: 23 },
  { name: "Sky-Watcher 350P FlexTube (14″)", type: "dobsonian", aperture: 355, focalLength: 1650 },
  { name: "Sky-Watcher 400P FlexTube (16″)", type: "dobsonian", aperture: 406, focalLength: 1800 },
  { name: "Orion SkyQuest XT4.5", type: "dobsonian", aperture: 114, focalLength: 900 },
  { name: "Orion SkyQuest XT6", type: "dobsonian", aperture: 150, focalLength: 1200 },
  { name: "Orion SkyQuest XT8", type: "dobsonian", aperture: 203, focalLength: 1200 },
  { name: "Orion SkyQuest XT10", type: "dobsonian", aperture: 254, focalLength: 1200 },
  { name: "Orion SkyQuest XT12", type: "dobsonian", aperture: 305, focalLength: 1500 },
  { name: "Apertura AD8", type: "dobsonian", aperture: 203, focalLength: 1200 },
  { name: "Apertura AD10", type: "dobsonian", aperture: 254, focalLength: 1250 },
  { name: "Apertura AD12", type: "dobsonian", aperture: 305, focalLength: 1525 },
  { name: "Zhumell Z8", type: "dobsonian", aperture: 203, focalLength: 1200 },
  { name: "Zhumell Z10", type: "dobsonian", aperture: 254, focalLength: 1250 },
  { name: "Celestron StarSense Explorer 8″ Dobsonian", type: "dobsonian", aperture: 203, focalLength: 1200 },
  { name: "Celestron StarSense Explorer 10″ Dobsonian", type: "dobsonian", aperture: 254, focalLength: 1200 },
  { name: "Meade LightBridge Mini 114", type: "dobsonian", aperture: 114, focalLength: 450 },
  { name: "Meade LightBridge Plus 12″", type: "dobsonian", aperture: 305, focalLength: 1524 },
  { name: "Meade LightBridge 16″", type: "dobsonian", aperture: 406, focalLength: 1829 },
  { name: "Explore Scientific 10″ Truss Dobsonian", type: "dobsonian", aperture: 254, focalLength: 1270 },
  { name: "Celestron FirstScope 76", type: "reflector", aperture: 76, focalLength: 300 },

  // Newtonian reflectors
  { name: "Sky-Watcher Explorer 130P", type: "reflector", aperture: 130, focalLength: 900 },
  { name: "Sky-Watcher Explorer 150P", type: "reflector", aperture: 150, focalLength: 750 },
  { name: "Sky-Watcher Explorer 200P", type: "reflector", aperture: 200, focalLength: 1000 },
  { name: "Sky-Watcher Quattro 200P (f/4)", type: "reflector", aperture: 200, focalLength: 800 },
  { name: "Sky-Watcher Quattro 250P (f/4)", type: "reflector", aperture: 254, focalLength: 1000 },
  { name: "Celestron AstroMaster 130EQ", type: "reflector", aperture: 130, focalLength: 650 },
  { name: "Celestron NexStar 130SLT", type: "reflector", aperture: 130, focalLength: 650 },
  { name: "Celestron StarSense Explorer DX 130AZ", type: "reflector", aperture: 130, focalLength: 650 },
  { name: "Orion SpaceProbe 130ST", type: "reflector", aperture: 130, focalLength: 650 },

  // Refractors
  { name: "Celestron AstroMaster 70AZ", type: "refractor", aperture: 70, focalLength: 900 },
  { name: "Celestron StarSense Explorer LT 80AZ", type: "refractor", aperture: 80, focalLength: 900 },
  { name: "Celestron Inspire 100AZ", type: "refractor", aperture: 100, focalLength: 660 },
  { name: "Celestron Omni XLT 102", type: "refractor", aperture: 102, focalLength: 1000 },
  { name: "Sky-Watcher StarTravel 102", type: "refractor", aperture: 102, focalLength: 500 },
  { name: "Sky-Watcher Evostar 90", type: "refractor", aperture: 90, focalLength: 900 },
  { name: "Sky-Watcher Evostar 72ED", type: "refractor", aperture: 72, focalLength: 420 },
  { name: "Sky-Watcher Evostar 80ED", type: "refractor", aperture: 80, focalLength: 600 },
  { name: "Sky-Watcher Evostar 100ED", type: "refractor", aperture: 100, focalLength: 900 },
  { name: "Sky-Watcher Evostar 120ED", type: "refractor", aperture: 120, focalLength: 900 },
  { name: "Sky-Watcher Esprit 80ED", type: "refractor", aperture: 80, focalLength: 400 },
  { name: "Sky-Watcher Esprit 100ED", type: "refractor", aperture: 100, focalLength: 550 },
  { name: "Sky-Watcher Esprit 120ED", type: "refractor", aperture: 120, focalLength: 840 },
  { name: "William Optics RedCat 51", type: "refractor", aperture: 51, focalLength: 250 },
  { name: "William Optics ZenithStar 61", type: "refractor", aperture: 61, focalLength: 360 },
  { name: "William Optics ZenithStar 73", type: "refractor", aperture: 73, focalLength: 430 },
  { name: "Askar FRA400", type: "refractor", aperture: 72, focalLength: 400 },
  { name: "Askar 103APO", type: "refractor", aperture: 103, focalLength: 700 },
  { name: "Svbony SV503 80ED", type: "refractor", aperture: 80, focalLength: 560 },
  { name: "Svbony SV503 102ED", type: "refractor", aperture: 102, focalLength: 714 },
  { name: "Explore Scientific ED102 FCD100", type: "refractor", aperture: 102, focalLength: 714 },
  { name: "Tele Vue 85", type: "refractor", aperture: 85, focalLength: 600 },
  { name: "Tele Vue NP101is", type: "refractor", aperture: 101, focalLength: 540 },
  { name: "Takahashi FSQ-85EDP", type: "refractor", aperture: 85, focalLength: 450 },
  { name: "Takahashi FC-100DL", type: "refractor", aperture: 100, focalLength: 900 },

  // Schmidt–Cassegrains (obstruction: Celestron published values)
  { name: "Celestron NexStar 5SE", type: "sct", aperture: 127, focalLength: 1250 },
  { name: "Celestron NexStar 6SE", type: "sct", aperture: 150, focalLength: 1500, obstruction: 37 },
  { name: "Celestron NexStar 8SE (C8)", type: "sct", aperture: 203, focalLength: 2032, obstruction: 31 },
  { name: "Celestron C9.25", type: "sct", aperture: 235, focalLength: 2350, obstruction: 36 },
  { name: "Celestron C11", type: "sct", aperture: 279, focalLength: 2800, obstruction: 34 },
  { name: "Celestron C14", type: "sct", aperture: 356, focalLength: 3910, obstruction: 32 },
  { name: "Celestron EdgeHD 8", type: "sct", aperture: 203, focalLength: 2032, obstruction: 34 },
  { name: "Celestron EdgeHD 11", type: "sct", aperture: 279, focalLength: 2800 },
  { name: "Meade LX90 8″", type: "sct", aperture: 203, focalLength: 2000 },
  { name: "Meade LX200 10″", type: "sct", aperture: 254, focalLength: 2500 },

  // Maksutov–Cassegrains
  { name: "Sky-Watcher Skymax 90", type: "mak", aperture: 90, focalLength: 1250 },
  { name: "Sky-Watcher Skymax 102", type: "mak", aperture: 102, focalLength: 1300 },
  { name: "Sky-Watcher Skymax 127", type: "mak", aperture: 127, focalLength: 1500 },
  { name: "Sky-Watcher Skymax 150 PRO", type: "mak", aperture: 150, focalLength: 1800 },
  { name: "Sky-Watcher Skymax 180 PRO", type: "mak", aperture: 180, focalLength: 2700 },
  { name: "Celestron C90 Mak", type: "mak", aperture: 90, focalLength: 1250 },
  { name: "Celestron NexStar 4SE", type: "mak", aperture: 102, focalLength: 1325 },
  { name: "Meade ETX90", type: "mak", aperture: 90, focalLength: 1250 },
  { name: "Meade ETX125", type: "mak", aperture: 127, focalLength: 1900 },

  // Ritchey–Chrétiens & astrographs
  { name: "GSO / Astro-Tech 6″ RC", type: "rc", aperture: 152, focalLength: 1370 },
  { name: "GSO / Astro-Tech 8″ RC", type: "rc", aperture: 203, focalLength: 1624 },
  { name: "GSO / Astro-Tech 10″ RC", type: "rc", aperture: 254, focalLength: 2000 },
  { name: "Celestron RASA 8", type: "astrograph", aperture: 203, focalLength: 400 },
  { name: "Celestron RASA 11", type: "astrograph", aperture: 279, focalLength: 620 },

  // Smart telescopes
  { name: "ZWO Seestar S50", type: "smart", aperture: 50, focalLength: 250 },
  { name: "ZWO Seestar S30", type: "smart", aperture: 30, focalLength: 150 },
  { name: "Vaonis Vespera II", type: "smart", aperture: 50, focalLength: 250 },
  { name: "DWARF 3", type: "smart", aperture: 35, focalLength: 150 },
  { name: "Unistellar Odyssey", type: "smart", aperture: 85, focalLength: 320 },
  { name: "Unistellar eQuinox 2", type: "smart", aperture: 114, focalLength: 450 },
  { name: "Celestron Origin", type: "smart", aperture: 152, focalLength: 335 },

  // Binoculars
  bino("7×50 binoculars", 50, 7),
  bino("10×50 binoculars", 50, 10),
  bino("Canon 10×42 L IS WP", 42, 10),
  bino("Nikon Action EX 10×50", 50, 10),
  bino("Celestron SkyMaster 15×70", 70, 15),
  bino("Celestron SkyMaster 25×100", 100, 25),
];

const eps = (series: string, afov: number, focals: number[], afovOverride: Record<number, number> = {}): EyepiecePreset[] =>
  focals.map((f) => ({ name: `${series} ${f} mm`, series, focalLength: f, afov: afovOverride[f] ?? afov }));

export const EYEPIECE_PRESETS: EyepiecePreset[] = [
  // Bundled & budget
  { name: "Sky-Watcher Super 25 mm (bundled)", series: "Sky-Watcher Super", focalLength: 25, afov: 50 },
  { name: "Sky-Watcher Super 10 mm (bundled)", series: "Sky-Watcher Super", focalLength: 10, afov: 52 },
  { name: "Orion Sirius Plössl 25 mm (bundled)", series: "Orion Sirius Plössl", focalLength: 25, afov: 52 },
  { name: "Orion Sirius Plössl 10 mm (bundled)", series: "Orion Sirius Plössl", focalLength: 10, afov: 52 },
  { name: "Meade Series 4000 Super Plössl 26 mm", series: "Meade Series 4000", focalLength: 26, afov: 52 },
  ...eps("Celestron Omni Plössl", 52, [4, 6, 9, 12.5, 15, 32, 40], { 32: 50, 40: 43 }),
  ...eps("Celestron X-Cel LX", 60, [2.3, 5, 7, 9, 12, 18, 25]),
  ...eps("Celestron Luminos", 82, [7, 10, 15, 19, 23, 31]),
  ...eps("BST Starguider / Paradigm ED", 60, [3.2, 5, 8, 12, 15, 18, 25]),
  ...eps("Sky-Watcher UWA Planetary", 58, [4, 5, 6, 7, 9]),
  ...eps("Sky-Watcher Nirvana", 82, [4, 7, 16]),
  ...eps("Sky-Watcher Panaview", 70, [26, 32, 38]),

  // Zooms (stored at the short end; the full range is read from the name)
  { name: "Celestron 8–24 mm Zoom", series: "Zoom", focalLength: 8, afov: 60 },
  { name: "Baader Hyperion Zoom Mark IV 8–24 mm", series: "Zoom", focalLength: 8, afov: 68 },
  { name: "Tele Vue Nagler Zoom 3–6 mm", series: "Zoom", focalLength: 3, afov: 50 },

  // Baader
  ...eps("Baader Hyperion", 68, [3.5, 5, 8, 10, 13, 17, 21, 24]),
  ...eps("Baader Hyperion Aspheric", 72, [31, 36]),
  ...eps("Baader Morpheus", 76, [4.5, 6.5, 9, 12.5, 14, 17.5]),
  ...eps("Baader Classic Ortho", 50, [6, 10, 18]),
  { name: "Baader Classic Plössl 32 mm", series: "Baader Classic Plössl", focalLength: 32, afov: 50 },

  // Explore Scientific
  ...eps("Explore Scientific 52°", 52, [4.5, 6.5, 10, 15, 20, 25, 30, 40]),
  ...eps("Explore Scientific 62°", 62, [5.5, 9, 14, 20, 26, 32, 40]),
  ...eps("Explore Scientific 68°", 68, [16, 20, 24, 28, 34, 40]),
  ...eps("Explore Scientific 82°", 82, [4.7, 6.7, 8.8, 11, 14, 18, 24, 30]),
  ...eps("Explore Scientific 100°", 100, [5.5, 9, 14, 20, 25, 30]),
  { name: "Explore Scientific 120° 9 mm", series: "Explore Scientific 120°", focalLength: 9, afov: 120 },

  // Tele Vue
  ...eps("Tele Vue Plössl", 50, [8, 11, 15, 20, 25, 32, 40, 55], { 40: 43 }),
  ...eps("Tele Vue DeLite", 62, [3, 4, 5, 7, 9, 11, 13, 15, 18.2]),
  ...eps("Tele Vue Delos", 72, [3.5, 4.5, 6, 8, 10, 12, 14, 17.3]),
  ...eps("Tele Vue Panoptic", 68, [19, 24, 27, 35, 41]),
  ...eps("Tele Vue Nagler", 82, [2.5, 3.5, 5, 7, 9, 11, 12, 13, 16, 17, 20, 22, 26, 31]),
  ...eps("Tele Vue Ethos", 100, [6, 8, 10, 13, 17, 21]),
  ...eps("Tele Vue Ethos SX", 110, [3.7, 4.7]),

  // Pentax & Vixen
  ...eps("Pentax XW", 70, [3.5, 5, 7, 10, 14, 20, 30, 40]),
  ...eps("Vixen SLV", 50, [2.5, 4, 5, 6, 9, 10, 12, 15, 20, 25]),
];

export const BARLOW_PRESETS: BarlowPreset[] = [
  // Barlows & focal extenders
  { name: "Celestron Omni 2× Barlow", factor: 2 },
  { name: "Celestron X-Cel LX 2× Barlow", factor: 2 },
  { name: "Celestron X-Cel LX 3× Barlow", factor: 3 },
  { name: "Celestron Luminos 2.5× Barlow", factor: 2.5 },
  { name: "Sky-Watcher Deluxe 2× ED Barlow", factor: 2 },
  { name: "Orion Shorty 2× Barlow", factor: 2 },
  { name: "Baader VIP 2× Barlow", factor: 2 },
  { name: "Baader Q-Barlow 2.25×", factor: 2.25 },
  { name: "Baader Hyperion Zoom Barlow 2.25×", factor: 2.25 },
  { name: "Explore Scientific 2× Focal Extender", factor: 2 },
  { name: "Explore Scientific 3× Focal Extender", factor: 3 },
  { name: "Explore Scientific 5× Focal Extender", factor: 5 },
  { name: "Tele Vue 2× Barlow", factor: 2 },
  { name: "Tele Vue 3× Barlow", factor: 3 },
  { name: "Tele Vue Big Barlow 2×", factor: 2 },
  { name: "Tele Vue Powermate 2×", factor: 2 },
  { name: "Tele Vue Powermate 2.5×", factor: 2.5 },
  { name: "Tele Vue Powermate 4×", factor: 4 },
  { name: "Tele Vue Powermate 5×", factor: 5 },
  // Reducers
  { name: "Celestron f/6.3 Reducer/Corrector (0.63×)", factor: 0.63 },
  { name: "Meade f/6.3 Focal Reducer (0.63×)", factor: 0.63 },
  { name: "Celestron EdgeHD 0.7× Reducer", factor: 0.7 },
  { name: "Sky-Watcher 0.85× Reducer/Flattener (Evostar ED)", factor: 0.85 },
  { name: "Tele Vue TRF-2008 0.8× Reducer/Flattener", factor: 0.8 },
  // Coma correctors
  { name: "Tele Vue Paracorr Type 2 (1.15×)", factor: 1.15 },
  { name: "Baader MPCC Mark III coma corrector", factor: 1 },
  { name: "Explore Scientific HR coma corrector", factor: 1 },
];

export const FILTER_PRESETS: FilterPreset[] = [
  // Narrowband & line filters
  { name: "Astronomik UHC", type: "uhc" },
  { name: "Astronomik UHC-E", type: "uhc" },
  { name: "Astronomik OIII", type: "oiii" },
  { name: "Astronomik H-beta", type: "h_beta" },
  { name: "Baader UHC-S", type: "uhc" },
  { name: "Baader O-III (10 nm visual)", type: "oiii" },
  { name: "Baader H-beta", type: "h_beta" },
  { name: "Lumicon UHC", type: "uhc" },
  { name: "Lumicon OIII", type: "oiii" },
  { name: "Lumicon H-Beta", type: "h_beta" },
  { name: "Orion UltraBlock", type: "uhc" },
  { name: "Orion Oxygen-III", type: "oiii" },
  { name: "Orion H-Beta", type: "h_beta" },
  { name: "Tele Vue Bandmate II Nebustar", type: "uhc" },
  { name: "Tele Vue Bandmate II OIII", type: "oiii" },
  { name: "Tele Vue Bandmate II H-Beta", type: "h_beta" },
  { name: "DGM NPB", type: "uhc" },
  { name: "Celestron UHC/LPR", type: "uhc" },
  { name: "Celestron OIII", type: "oiii" },
  { name: "Explore Scientific UHC", type: "uhc" },
  { name: "Explore Scientific OIII", type: "oiii" },
  { name: "Explore Scientific H-Beta", type: "h_beta" },
  { name: "Optolong UHC", type: "uhc" },
  { name: "Svbony UHC", type: "uhc" },
  // Broadband light-pollution
  { name: "Astronomik CLS", type: "lps" },
  { name: "Lumicon Deep Sky", type: "lps" },
  { name: "Orion SkyGlow Broadband", type: "lps" },
  { name: "Optolong L-Pro", type: "lps" },
  { name: "Optolong CLS", type: "lps" },
  { name: "Svbony CLS", type: "lps" },
  // Moon & planets
  { name: "Moon filter (ND 0.9, 13%)", type: "moon" },
  { name: "Baader ND 0.9", type: "moon" },
  { name: "Orion Variable Polarizing Filter", type: "variable_polarizer" },
  { name: "Baader Neodymium (Moon & Skyglow)", type: "neodymium" },
  { name: "Baader Contrast Booster", type: "contrast_booster" },
  { name: "Baader Semi-APO", type: "semi_apo" },
  { name: "Baader Fringe Killer", type: "fringe_killer" },
  { name: "Wratten #8 light yellow", type: "color_yellow" },
  { name: "Wratten #12 deep yellow", type: "color_yellow" },
  { name: "Wratten #21 orange", type: "color_orange" },
  { name: "Wratten #23A light red", type: "color_red" },
  { name: "Wratten #25 red", type: "color_red" },
  { name: "Wratten #47 violet", type: "color_violet" },
  { name: "Wratten #56 light green", type: "color_green" },
  { name: "Wratten #58 green", type: "color_green" },
  { name: "Wratten #80A blue", type: "color_blue" },
  { name: "Wratten #82A light blue", type: "color_blue" },
  { name: "Colour filter set (#21, #25, #58, #80A)", type: "color" },
];

const cam = (name: string, type: CameraType, w: number, h: number, pixel?: number): CameraPreset => ({ name, type, sensor: { w, h, pixel } });

export const CAMERA_PRESETS: CameraPreset[] = [
  // Deep-sky astronomy cameras
  cam("ZWO ASI2600MC Pro", "astrocam", 23.5, 15.7, 3.76),
  cam("ZWO ASI2600MM Pro", "astrocam", 23.5, 15.7, 3.76),
  cam("ZWO ASI2600MC Air", "astrocam", 23.5, 15.7, 3.76),
  cam("ZWO ASI533MC Pro", "astrocam", 11.3, 11.3, 3.76),
  cam("ZWO ASI533MM Pro", "astrocam", 11.3, 11.3, 3.76),
  cam("ZWO ASI294MC Pro", "astrocam", 19.1, 13.0, 4.63),
  cam("ZWO ASI294MM Pro", "astrocam", 19.1, 13.0, 2.31),
  cam("ZWO ASI6200MC Pro", "astrocam", 36, 24, 3.76),
  cam("ZWO ASI6200MM Pro", "astrocam", 36, 24, 3.76),
  cam("ZWO ASI2400MC Pro", "astrocam", 36, 24, 5.94),
  cam("ZWO ASI183MC Pro", "astrocam", 13.2, 8.8, 2.4),
  cam("ZWO ASI183MM Pro", "astrocam", 13.2, 8.8, 2.4),
  cam("ZWO ASI1600MM Pro", "astrocam", 17.7, 13.4, 3.8),
  cam("ZWO ASI071MC Pro", "astrocam", 23.6, 15.7, 4.78),
  cam("QHY268C", "astrocam", 23.5, 15.7, 3.76),
  cam("QHY268M", "astrocam", 23.5, 15.7, 3.76),
  cam("QHY600M", "astrocam", 36, 24, 3.76),
  cam("QHY533C", "astrocam", 11.3, 11.3, 3.76),
  cam("QHY294C Pro", "astrocam", 19.1, 13.0, 4.63),
  cam("QHY183C", "astrocam", 13.2, 8.8, 2.4),
  cam("Player One Poseidon-C Pro", "astrocam", 23.5, 15.7, 3.76),
  cam("Player One Poseidon-M Pro", "astrocam", 23.5, 15.7, 3.76),
  cam("Player One Ares-C Pro", "astrocam", 11.3, 11.3, 3.76),
  cam("Svbony SV605CC", "astrocam", 11.3, 11.3, 3.76),
  cam("Svbony SV405CC", "astrocam", 19.1, 13.0, 4.63),
  cam("Atik Horizon II", "astrocam", 17.6, 13.3, 3.8),
  cam("Starlight Xpress Trius SX-694", "astrocam", 12.5, 10.0, 4.54),
  // Planetary & guide cameras
  cam("ZWO ASI585MC Pro", "astrocam", 11.1, 6.3, 2.9),
  cam("ZWO ASI678MC", "astrocam", 7.7, 4.3, 2.0),
  cam("ZWO ASI662MC", "astrocam", 5.6, 3.1, 2.9),
  cam("ZWO ASI462MC", "astrocam", 5.6, 3.2, 2.9),
  cam("ZWO ASI224MC", "astrocam", 4.9, 3.7, 3.75),
  cam("ZWO ASI174MM Mini", "astrocam", 11.3, 7.1, 5.86),
  cam("ZWO ASI290MM Mini", "astrocam", 5.6, 3.2, 2.9),
  cam("ZWO ASI120MM Mini", "astrocam", 4.8, 3.6, 3.75),
  cam("QHY5III462C", "astrocam", 5.6, 3.2, 2.9),
  cam("QHY5III585C", "astrocam", 11.1, 6.3, 2.9),
  cam("QHY5III678C", "astrocam", 7.7, 4.3, 2.0),
  cam("Player One Uranus-C Pro", "astrocam", 11.1, 6.3, 2.9),
  cam("Svbony SV705C", "astrocam", 11.1, 6.3, 2.9),
  cam("Svbony SV305", "astrocam", 5.6, 3.2, 2.9),
  // DSLR & mirrorless
  cam("Canon EOS Ra", "dslr", 36, 24, 5.36),
  cam("Canon EOS R", "dslr", 36, 24, 5.36),
  cam("Canon EOS R5", "dslr", 36, 24, 4.39),
  cam("Canon EOS R6 Mark II", "dslr", 35.9, 23.9, 5.93),
  cam("Canon EOS 6D", "dslr", 35.8, 23.9, 6.55),
  cam("Canon EOS 6D Mark II", "dslr", 35.9, 24, 5.67),
  cam("Canon EOS 5D Mark IV", "dslr", 36, 24, 5.36),
  cam("Canon EOS 60Da", "dslr", 22.3, 14.9, 4.3),
  cam("Canon EOS 90D", "dslr", 22.3, 14.8, 3.2),
  cam("Canon EOS R7", "dslr", 22.3, 14.8, 3.2),
  cam("Canon EOS R10", "dslr", 22.3, 14.9, 3.72),
  cam("Canon EOS R50", "dslr", 22.3, 14.9, 3.72),
  cam("Canon EOS 2000D / Rebel T7", "dslr", 22.3, 14.9, 3.72),
  cam("Canon EOS 250D / Rebel SL3", "dslr", 22.3, 14.9, 3.72),
  cam("Canon EOS 800D / Rebel T7i", "dslr", 22.3, 14.9, 3.72),
  cam("Nikon D810A", "dslr", 35.9, 24, 4.88),
  cam("Nikon D850", "dslr", 35.9, 23.9, 4.35),
  cam("Nikon Z5", "dslr", 35.9, 23.9, 5.95),
  cam("Nikon Z6 II", "dslr", 35.9, 23.9, 5.95),
  cam("Nikon Z6 III", "dslr", 35.9, 23.9, 5.95),
  cam("Nikon Zf", "dslr", 35.9, 23.9, 5.95),
  cam("Nikon D5600", "dslr", 23.5, 15.6, 3.89),
  cam("Nikon D7500", "dslr", 23.5, 15.7, 4.2),
  cam("Sony A7 III", "dslr", 35.6, 23.8, 5.93),
  cam("Sony A7 IV", "dslr", 35.9, 23.9, 5.12),
  cam("Sony A7S III", "dslr", 35.6, 23.8, 8.4),
  cam("Sony A7R V", "dslr", 35.7, 23.8, 3.76),
  cam("Sony A6400", "dslr", 23.5, 15.6, 3.92),
  cam("Sony A6700", "dslr", 23.3, 15.5, 3.76),
  cam("Fujifilm X-T4", "dslr", 23.5, 15.6, 3.76),
  cam("Fujifilm X-T5", "dslr", 23.5, 15.6, 3.04),
  cam("OM System OM-1", "dslr", 17.4, 13.0, 3.32),
  // Phones are used afocally through an eyepiece, so their sensor size doesn't set the field.
  { name: "Smartphone (through the eyepiece)", type: "smartphone", sensor: null },
];

/** Standard eyepiece focal lengths, used when suggesting what to buy. */
export const STANDARD_EYEPIECE_FOCALS = [3, 3.5, 4, 4.5, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18, 20, 21, 24, 25, 26, 28, 30, 32, 35, 40];
