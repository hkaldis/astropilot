/**
 * "When did this light set off?" — light-travel time turned into a moment in history, for the object pages'
 * time machine and their server-rendered text; and where an object sits in (or beyond) the Milky Way.
 */

/** Dated moments, by calendar year (negative = BC). Each reads after "when" / "before" / "after". */
export const HISTORY: { year: number; event: string }[] = [
  { year: 2021, event: "the James Webb Space Telescope was launched" },
  { year: 2006, event: "Pluto was reclassified as a dwarf planet" },
  { year: 1990, event: "the Hubble Space Telescope was launched" },
  { year: 1969, event: "Apollo 11 landed on the Moon" },
  { year: 1957, event: "Sputnik became the first artificial satellite" },
  { year: 1930, event: "Pluto was discovered" },
  { year: 1924, event: "Edwin Hubble showed that other galaxies exist" },
  { year: 1903, event: "the Wright brothers made the first powered flight" },
  { year: 1879, event: "Edison lit his first practical light bulb — the start of light pollution" },
  { year: 1846, event: "Neptune was discovered" },
  { year: 1781, event: "William Herschel discovered Uranus" },
  { year: 1771, event: "Charles Messier published his famous catalogue" },
  { year: 1687, event: "Isaac Newton published his laws of motion and gravity" },
  { year: 1609, event: "Galileo first turned a telescope to the sky" },
  { year: 1543, event: "Copernicus put the Sun at the centre of the Solar System" },
  { year: 1492, event: "Columbus crossed the Atlantic" },
  { year: 1455, event: "Gutenberg printed his Bible" },
  { year: 1054, event: "Chinese astronomers recorded the supernova that made the Crab Nebula" },
  { year: 964, event: "al-Sufi described the Andromeda Galaxy in his Book of Fixed Stars" },
  { year: 800, event: "Charlemagne was crowned emperor" },
  { year: 537, event: "the Hagia Sophia was completed in Constantinople" },
  { year: 125, event: "the Pantheon was rebuilt in Rome" },
  { year: 79, event: "Vesuvius buried Pompeii" },
  { year: -438, event: "the Parthenon was dedicated in Athens" },
  { year: -776, event: "the first recorded Olympic Games were held" },
  { year: -1323, event: "Tutankhamun was buried in the Valley of the Kings" },
  { year: -2560, event: "the Great Pyramid of Giza was completed" },
  { year: -3000, event: "the first circle of Stonehenge was raised" },
  { year: -3200, event: "writing was invented in Mesopotamia" },
  { year: -5500, event: "the first towns were growing in the Fertile Crescent" },
  { year: -9500, event: "the stone pillars of Göbekli Tepe, the oldest known temple, were raised" },
];

/** Deep time: [from, to) years ago, each reading after "when". */
export const DEEP_TIME: { from: number; to: number; event: string }[] = [
  { from: 11_500, to: 15_000, event: "the last Ice Age was ending" },
  { from: 15_000, to: 30_000, event: "the last Ice Age was at its height, and mammoths roamed beneath the ice sheets" },
  { from: 30_000, to: 60_000, event: "people were painting the oldest known cave art" },
  { from: 60_000, to: 200_000, event: "our species still lived mostly in Africa" },
  { from: 200_000, to: 400_000, event: "the first Homo sapiens appeared in Africa" },
  { from: 400_000, to: 1_500_000, event: "early humans were learning to use fire" },
  { from: 1_500_000, to: 4_000_000, event: "our distant ancestors were making the first stone tools" },
  { from: 4_000_000, to: 8_000_000, event: "our ancestors and the chimpanzees' were going their separate ways" },
  { from: 8_000_000, to: 20_000_000, event: "great apes were spreading through Africa and Europe" },
  { from: 20_000_000, to: 40_000_000, event: "the Himalayas and the Alps were rising" },
  { from: 40_000_000, to: 66_000_000, event: "mammals were taking over a world without dinosaurs" },
  { from: 66_000_000, to: 150_000_000, event: "dinosaurs still walked the Earth" },
  { from: 150_000_000, to: 252_000_000, event: "dinosaurs were rising and the supercontinent Pangaea was breaking apart" },
  { from: 252_000_000, to: 541_000_000, event: "the first plants and animals were moving onto land" },
  { from: 541_000_000, to: 14_000_000_000, event: "there were no animals on Earth at all" },
];

/** Milestones for the time-machine scale: years ago (from `nowYear`) and a short label. */
export function milestones(nowYear: number): { ago: number; label: string }[] {
  return [
    { ago: nowYear - 1969, label: "Moon landing" },
    { ago: nowYear - 1609, label: "Galileo’s telescope" },
    { ago: nowYear + 2560, label: "Great Pyramid" },
    { ago: 20_000, label: "Ice Age" },
    { ago: 300_000, label: "First humans" },
    { ago: 2_600_000, label: "First stone tools" },
    { ago: 66_000_000, label: "Dinosaurs’ end" },
  ];
}

/** A year for people, rounded to `step`: "1580", "AD 680", "2570 BC" (year 0 is 1 BC). */
export function yearLabel(year: number, step = 1): string {
  const round = (y: number) => Math.round(y / step) * step;
  if (year <= 0) return `${round(1 - year)} BC`;
  const y = round(year);
  return y < 1000 ? `AD ${y}` : String(y);
}

/** Round a span of years the way people say it: 3, 40, 150, 1,200, 24,000, 2.5 million. */
export function niceYears(n: number): string {
  if (n >= 1e9) return `${+(n / 1e9).toPrecision(2)} billion`;
  if (n >= 1e6) return `${+(n / 1e6).toPrecision(2)} million`;
  const p = n < 20 ? 1 : n < 200 ? 5 : n < 2000 ? 10 : n < 20_000 ? 100 : 1000;
  return (Math.round(n / p) * p).toLocaleString("en-US");
}

export interface Lookback {
  /** Years the light has travelled. */
  ago: number;
  /** "around 1580" / "about 24,000 years ago" */
  when: string;
  /** "a generation before Galileo first turned a telescope to the sky" / "when the last Ice Age was at its height…" */
  moment: string;
}

/** When light that has travelled `ago` years set off, with a moment in history to hang it on. */
export function lookback(ago: number, nowYear = new Date().getFullYear()): Lookback {
  const departed = Math.round(nowYear - ago);
  if (ago < 11_500) {
    // Calendar history: the closest dated moment, and how far before or after it the light left.
    let best = HISTORY[0];
    for (const h of HISTORY) if (Math.abs(h.year - departed) < Math.abs(best.year - departed)) best = h;
    const gap = best.year - departed;
    const close = Math.abs(gap) <= Math.max(2, ago * 0.04);
    const span = niceYears(Math.abs(gap));
    const moment = close ? `around the time ${best.event}` : `${span} ${Math.abs(gap) === 1 ? "year" : "years"} ${gap > 0 ? "before" : "after"} ${best.event}`;
    const when = ago < 2 ? "about a year ago" : ago < 100 ? `in ${yearLabel(departed)}` : `around ${yearLabel(departed, ago < 1000 ? 5 : 10)}`;
    return { ago, when, moment };
  }
  const deep = DEEP_TIME.find((d) => ago >= d.from && ago < d.to) ?? DEEP_TIME[DEEP_TIME.length - 1];
  return { ago, when: `about ${niceYears(ago)} years ago`, moment: `when ${deep.event}` };
}

// ------------------------------------------------------------------------------------------- the galaxy

/** Galactic longitude and latitude (degrees) of a J2000 position (RA in hours). */
export function toGalactic(raHours: number, decDeg: number): { l: number; b: number } {
  const r = Math.PI / 180;
  const ra = raHours * 15 * r;
  const dec = decDeg * r;
  // IAU 1958 pole and node, precessed to J2000.
  const raP = 192.85948 * r;
  const decP = 27.12825 * r;
  const lNcp = 122.93192 * r;
  const sb = Math.sin(dec) * Math.sin(decP) + Math.cos(dec) * Math.cos(decP) * Math.cos(ra - raP);
  const b = Math.asin(sb);
  const y = Math.cos(dec) * Math.sin(ra - raP);
  const x = Math.sin(dec) * Math.cos(decP) - Math.cos(dec) * Math.sin(decP) * Math.cos(ra - raP);
  const l = (lNcp - Math.atan2(y, x)) / r;
  return { l: ((l % 360) + 360) % 360, b: b / r };
}

/** The Sun's distance from the centre of the Milky Way, in light-years (GRAVITY 2019: 8.18 kpc). */
export const SUN_GALACTOCENTRIC_LY = 26_700;

/**
 * Position relative to the Sun in light-years: x towards the Galactic centre, y in the direction of the
 * Galaxy's rotation (l = 90°), z towards the north Galactic pole.
 */
export function galacticXYZ(raHours: number, decDeg: number, distLy: number): { x: number; y: number; z: number; l: number; b: number } {
  const { l, b } = toGalactic(raHours, decDeg);
  const r = Math.PI / 180;
  return { x: distLy * Math.cos(b * r) * Math.cos(l * r), y: distLy * Math.cos(b * r) * Math.sin(l * r), z: distLy * Math.sin(b * r), l, b };
}
