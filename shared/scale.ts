/**
 * "How big is it?" — an object's size and mass turned into comparisons people can feel: planets against Earth,
 * moons against our Moon, stars against the Sun and the planets' orbits, double stars by the real gap between them,
 * nebulae and clusters against the Solar System and the nearest star (and a scale model where the Solar System is a
 * coin), galaxies against the Milky Way.
 * Shared by the object page and its server-rendered version.
 */
import { AU_PER_LY, BODY_PHYSICS, EARTH, NEPTUNE_AU, SUN, escapeOf, gravityOf, type BodyPhysics } from "./bodies";
import { lookback, niceYears } from "./lookback";
import { starRgb, temperatureRgb } from "./starColor";
import { physicalSizeLy, type ObjectFacts } from "./stories";

export interface ScaleStat {
  label: string;
  value: string;
  sub?: string;
}

/** Discs to scale (radii in any one unit), largest first; `ring` draws orbits around the first disc (radii in its unit). */
export type ScaleVisual =
  | { kind: "discs"; items: { label: string; r: number; color: string; main?: boolean; glyph?: string }[]; caption: string }
  | { kind: "orbits"; star: { label: string; rAu: number; color: string }; orbits: { label: string; au: number }[]; caption: string }
  | { kind: "galaxies"; mw: number; obj: { label: string; major: number; minor: number }; caption: string }
  | { kind: "model"; title: string; rows: ModelRow[]; caption: string; text: string };

/**
 * One row of the scale model: a thing's real size (`note`), its size in the model and something everyday that big.
 * `icon` is "coin", "voyager" or a catalog type.
 */
export interface ModelRow {
  label: string;
  note: string;
  size: string;
  like: string;
  icon: string;
  main?: boolean;
}

export interface ScaleStory {
  headline: string;
  lines: string[];
  stats: ScaleStat[];
  visual: ScaleVisual | null;
}

// ------------------------------------------------------------------------------------------------ numbers

/** 3 → "3", 17.8 → "18", 1321 → "1,321", 2.6e8 → "260 million". */
export function nice(n: number): string {
  if (n >= 1e12) return `${+(n / 1e12).toPrecision(2)} trillion`;
  if (n >= 1e9) return `${+(n / 1e9).toPrecision(2)} billion`;
  if (n >= 1e6) return `${+(n / 1e6).toPrecision(2)} million`;
  // Three significant figures below 10,000, two above: 1,320 · 4,560 · 16,000 · 480,000.
  if (n >= 1000) return Number(n.toPrecision(n >= 10_000 ? 2 : 3)).toLocaleString("en-US");
  if (n >= 10) return Math.round(n).toLocaleString("en-US");
  return n >= 1 ? String(+n.toFixed(1)) : String(+n.toPrecision(2));
}

/** A ratio as people say it: 11.2 → "11×", 0.38 → "38%". */
const ratio = (x: number) => (x >= 1.05 ? `${nice(x)}×` : `${Math.round(x * 100)}%`);
/** "11× Earth" / "38% of Earth". */
const versus = (x: number, what: string) => (x >= 1.05 ? `${nice(x)}× ${what}` : `${Math.round(x * 100)}% of ${what}`);
const minus = (s: string) => s.replace(/-/g, "−");
const TIMES = ["no", "once", "twice", "three times", "four times", "five times"];
/** "1 light-year", "9.1 light-years", "1,860 light-years". */
const ly = (x: number) => {
  const v = x < 10 ? String(+x.toFixed(1)) : nice(x);
  return `${v} light-year${v === "1" ? "" : "s"}`;
};
/** "1 Sun", "2,000 Suns" — and the possessive, "one Sun’s" / "2,000 Suns’" (worth of…). */
const suns = (x: number) => {
  const v = nice(x);
  return `${v} Sun${v === "1" ? "" : "s"}`;
};
const sunsWorth = (x: number) => {
  const v = nice(x);
  return v === "1" ? "one Sun’s" : `${v} Suns’`;
};
/** "twice" or "N times", for prose. */
const times = (x: number) => (x >= 1.9 && x < 2.1 ? "twice" : `${nice(x)} times`);
const km = (n: number) => `${Math.round(n).toLocaleString("en-US")} km`;
const SUPER = "⁰¹²³⁴⁵⁶⁷⁸⁹";
/** 1.898e27 → "1.9 × 10²⁷". */
const sci = (n: number, digits = 2) => {
  const [m, e] = n.toExponential(digits - 1).split("e");
  return `${m} × 10${String(+e).replace(/\d/g, (d) => SUPER[+d])}`;
};
const kg70 = (g: number) => Math.round((70 * g) / 9.81);

function duration(hours: number): string {
  const h = Math.abs(hours);
  if (h < 48) {
    const whole = Math.floor(h);
    const min = Math.round((h - whole) * 60);
    return min ? `${whole} h ${min} min` : `${whole} hours`;
  }
  const d = h / 24;
  return d < 700 ? `${nice(d)} Earth days` : `${nice(d / 365.25)} Earth years`;
}

const TWO_AU_S = 499.005; // light time for 1 AU, seconds

function lightTime(seconds: number): string {
  if (seconds < 120) return `${Math.round(seconds)} seconds`;
  if (seconds < 7200) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 2 * 86400) return `${+(seconds / 3600).toFixed(1)} hours`;
  if (seconds < 365.25 * 86400) return `${Math.round(seconds / 86400)} days`;
  return `${nice(seconds / (365.25 * 86400))} years`;
}

// --------------------------------------------------------------------------------------------- planets

const PLANET_COLOR: Record<string, string> = {
  earth: "#4f8fdc", moon: "#c9c4b6", mercury: "#b7aa9b", venus: "#e8d8a8", mars: "#d9774b", jupiter: "#d8b48a",
  saturn: "#e3cf96", uranus: "#9fd9de", neptune: "#5f86d8", sun: "#ffd27a",
};
const PLANET_NAME: Record<string, string> = { mercury: "Mercury", venus: "Venus", mars: "Mars", jupiter: "Jupiter", saturn: "Saturn", uranus: "Uranus", neptune: "Neptune" };
/** Where each planet sits, AU: what a giant star in the Sun's place would reach. */
const ORBITS = [
  { label: "Mercury", au: 0.387 },
  { label: "Venus", au: 0.723 },
  { label: "Earth", au: 1 },
  { label: "Mars", au: 1.524 },
  { label: "Jupiter", au: 5.203 },
  { label: "Saturn", au: 9.537 },
];
const DISCOVERED: Record<string, number> = { uranus: 1781, neptune: 1846 };

export function planetScale(id: string, nowYear = new Date().getFullYear()): ScaleStory | null {
  const p = BODY_PHYSICS[id];
  if (!p || !PLANET_NAME[id]) return null;
  const name = PLANET_NAME[id];
  const rr = p.radiusKm / EARTH.radiusKm;
  const mr = p.massKg / EARTH.massKg;
  const vol = rr ** 3;
  const g = gravityOf(p);
  const headline =
    rr > 1.05 ? `${nice(vol)} Earths could fit inside ${name}` : rr > 0.9 ? `Almost Earth’s twin: ${ratio(rr)} of its width` : `Earth could hold ${nice(1 / vol)} planets the size of ${name}`;
  const lines = [
    `${name} is ${rr > 1.05 ? `${times(rr)} as wide as Earth` : `${ratio(rr)} of Earth’s width`} — ${km(2 * p.radiusKm)} across.`,
    mr > 1.05
      ? `It weighs as much as ${nice(mr)} Earths${p.density && p.density < 1 ? ", yet it’s lighter than water for its size: in a big enough ocean it would float" : ""}.`
      : `It has ${ratio(mr)} of Earth’s mass.`,
    `A 70 kg person would feel like ${kg70(g)} kg ${rr > 3 ? "at its cloud tops — there’s no ground to stand on" : "on its surface"}.`,
  ];
  const day = p.solarDayH ?? 0;
  const year = (p.orbitDays ?? 0) * 24;
  if (p.rotationH && Math.abs(p.rotationH) > year) lines.push(`It spins so slowly — and backwards — that one turn takes longer than its year: ${duration(p.rotationH)} against ${duration(year)}.`);
  else if (day > 1000) lines.push(`From one sunrise to the next takes ${duration(day)} — ${+(day / year).toFixed(1)} of its years.`);
  else if (day < 11) lines.push(`A whole day lasts just ${duration(day)}, so fast that ${name} bulges at its equator.`);
  else if (day > 20 && day < 30) lines.push(`A day lasts ${duration(day)} — almost the same as ours.`);
  if (id === "uranus") lines.push("It spins on its side, tipped over by 98°: each pole gets 42 years of sunlight, then 42 years of darkness.");
  if (DISCOVERED[id]) {
    const laps = (nowYear - DISCOVERED[id]) / ((p.orbitDays ?? 1) / 365.25);
    const first = Math.round(DISCOVERED[id] + (p.orbitDays ?? 0) / 365.25);
    lines.push(
      `One trip round the Sun takes ${duration(year)}: since its discovery in ${DISCOVERED[id]} it has ${laps < 2 ? `gone round just once, completing that first lap in ${first}` : `gone round only ${TIMES[Math.floor(laps)] ?? `${Math.floor(laps)} times`}`}.`,
    );
  }
  const t = p.tempC;
  return {
    headline,
    lines,
    stats: [
      { label: "Diameter", value: km(2 * p.radiusKm), sub: versus(rr, "Earth") },
      { label: "Mass", value: mr >= 1.05 ? `${nice(mr)}× Earth` : `${ratio(mr)} of Earth`, sub: `${sci(p.massKg, 3)} kg` },
      { label: "Gravity", value: `${+(g / 9.81).toFixed(2)} g`, sub: `70 kg feels like ${kg70(g)} kg` },
      { label: "Day", value: duration(day), sub: p.rotationH && p.rotationH < 0 ? "spins backwards" : "sunrise to sunrise" },
      { label: "Year", value: duration(year), sub: "once round the Sun" },
      ...(t !== undefined ? [{ label: "Temperature", value: minus(Array.isArray(t) ? `${t[0]} to ${t[1]} °C` : `${t} °C`), sub: rr > 3 ? "at the cloud tops" : Array.isArray(t) ? "night to day" : "average" }] : []),
    ],
    visual: {
      kind: "discs",
      items: [
        { label: name, r: p.radiusKm, color: PLANET_COLOR[id], main: true, glyph: id },
        { label: "Earth", r: EARTH.radiusKm, color: PLANET_COLOR.earth, glyph: "earth" },
      ].sort((a, b) => b.r - a.r),
      caption: `${name} and Earth to scale`,
    },
  };
}

// --------------------------------------------------------------------------------------------- the Moon

export function earthMoonScale(): ScaleStory {
  const m = BODY_PHYSICS.moon;
  const rr = m.radiusKm / EARTH.radiusKm;
  const g = gravityOf(m);
  const planetsWide = ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune"].reduce((s, id) => s + 2 * BODY_PHYSICS[id].radiusKm, 0);
  return {
    headline: `About ${Math.round(1 / rr ** 3)} Moons would fill Earth — and it would take ${Math.round(EARTH.massKg / m.massKg)} to match its weight`,
    lines: [
      `The Moon is ${ratio(rr)} of Earth’s width — ${km(2 * m.radiusKm)} across.`,
      `A 70 kg astronaut feels like ${kg70(g)} kg there, which is why the Apollo crews bounded instead of walking.`,
      `On average it is ${km(384_400)} away — about 30 Earths side by side. All the other planets, lined up, would fit in the gap when the Moon is at its farthest: together they are ${km(planetsWide)} wide.`,
      `A day there, sunrise to sunrise, lasts ${+(708.7 / 24).toFixed(1)} Earth days: two weeks of sunlight, then two weeks of night.`,
    ],
    stats: [
      { label: "Diameter", value: km(2 * m.radiusKm), sub: `${ratio(rr)} of Earth` },
      { label: "Mass", value: `${+((m.massKg / EARTH.massKg) * 100).toFixed(1)}% of Earth`, sub: "Earth weighs as much as 81 Moons" },
      { label: "Gravity", value: `${+(g / 9.81).toFixed(2)} g`, sub: `70 kg feels like ${kg70(g)} kg` },
      { label: "Day", value: "29.5 Earth days", sub: "sunrise to sunrise" },
      { label: "Temperature", value: "−178 to 117 °C", sub: "night to day" },
    ],
    visual: {
      kind: "discs",
      items: [
        { label: "Earth", r: EARTH.radiusKm, color: PLANET_COLOR.earth, glyph: "earth" },
        { label: "Moon", r: m.radiusKm, color: PLANET_COLOR.moon, main: true, glyph: "moon" },
      ],
      caption: "Earth and the Moon to scale",
    },
  };
}

// ------------------------------------------------------------------------------------ the planets' moons

export function satelliteScale(id: string, name: string, parentName: string): ScaleStory | null {
  const s = BODY_PHYSICS[id];
  const moon = BODY_PHYSICS.moon;
  if (!s) return null;
  const rM = s.radiusKm / moon.radiusKm;
  const mM = s.massKg / moon.massKg;
  const g = gravityOf(s);
  const vesc = escapeOf(s);
  const mercury = BODY_PHYSICS.mercury;
  const d = 2 * s.radiusKm;
  const headline =
    s.radiusKm > mercury.radiusKm
      ? `Bigger than the planet Mercury${id === "ganymede" ? " — the largest moon in the Solar System" : ""}`
      : rM > 0.9 && rM < 1.1
        ? "About the size of our own Moon"
        : rM >= 1.1
          ? `${times(rM)} as wide as our Moon`
        : d < 60
          ? `Only ${km(d)} across: you could drive across it in ${Math.max(5, Math.round((d / 100) * 60))} minutes`
          : `Our Moon could hold ${nice(1 / rM ** 3)} moons this size`;

  const lines = [
    `${name} is ${km(d)} across — ${rM > 1.05 ? `${times(rM)} our Moon’s width` : `${ratio(rM)} of our Moon’s width`}${s.radiusKm > mercury.radiusKm ? `, and wider than Mercury (${km(2 * mercury.radiusKm)})` : ""}.`,
    `It has ${mM >= 1.05 ? `${times(mM)} our Moon’s mass` : mM >= 0.01 ? `${ratio(mM)} of our Moon’s mass` : `about 1/${nice(1 / mM)} of our Moon’s mass`}${s.radiusKm > mercury.radiusKm && s.massKg < mercury.massKg ? " — but less than half of Mercury’s: it’s made largely of ice" : ""}.`,
    vesc < 30
      ? `Its gravity is so weak that ${vesc < 7 ? "you could almost jump off it" : "a thrown ball would leave it for ever"}: escape speed is just ${Math.round(vesc)} m/s (${+(vesc * 3.6).toFixed(0)} km/h).`
      : `A 70 kg person would feel like ${g < 0.98 ? `${+((70 * g) / 9.81).toFixed(1)}` : kg70(g)} kg on its surface.`,
  ];
  const visual: ScaleVisual = {
    kind: "discs",
    items: [
      ...(s.radiusKm > 0.75 * mercury.radiusKm ? [{ label: "Mercury", r: mercury.radiusKm, color: PLANET_COLOR.mercury, glyph: "mercury" }] : []),
      { label: "our Moon", r: moon.radiusKm, color: PLANET_COLOR.moon, glyph: "moon" },
      { label: name, r: s.radiusKm, color: "#b9c7d8", main: true },
    ].sort((a, b) => b.r - a.r),
    caption: `${name}${s.radiusKm > 0.75 * mercury.radiusKm ? ", our Moon and Mercury" : " and our Moon"} to scale`,
  };
  return {
    headline,
    lines,
    stats: [
      { label: "Diameter", value: km(d), sub: versus(rM, "our Moon") },
      { label: "Mass", value: mM >= 1.05 ? `${nice(mM)}× our Moon` : mM >= 0.01 ? `${ratio(mM)} of our Moon` : `1/${nice(1 / mM)} of our Moon`, sub: `${sci(s.massKg)} kg` },
      { label: "Gravity", value: `${+(g / 9.81).toPrecision(2)} g`, sub: vesc < 1000 ? `escape at ${Math.round(vesc)} m/s` : `70 kg feels like ${kg70(g)} kg` },
    ],
    visual,
  };
}

// ------------------------------------------------------------------------------------------------- stars

const R_SUN_AU = SUN.radiusKm / 149_597_870.7; // 0.00465

export function starScale(s: { name: string; r?: number; mass?: number; lum?: number; color: string; companionAu?: number; subject?: string }): ScaleStory | null {
  const { r, mass, lum } = s;
  if (!r && !mass) return null;
  const lines: string[] = [];
  let headline = "";
  let visual: ScaleVisual | null = null;
  // What the headline (or an earlier line) has already said, so the lines below don't repeat it.
  let saidWidth = false;
  let saidLight = false;
  let saidMass = false;
  const sameAsSun = (x: number) => x >= 0.95 && x < 1.05;
  if (r) {
    const au = r * R_SUN_AU;
    const swallowed = ORBITS.filter((o) => o.au < au).map((o) => o.label);
    const crossS = (2 * r * SUN.radiusKm) / 299_792;
    if (swallowed.length) {
      const list = swallowed.length > 1 ? `${swallowed.slice(0, -1).join(", ")} and ${swallowed[swallowed.length - 1]}` : swallowed[0];
      headline = `In the Sun’s place, it would swallow the ${swallowed.length > 1 ? "orbits" : "orbit"} of ${list}`;
    } else if (r >= 5) headline = `${nice(r ** 3)} Suns could fit inside it`;
    else if (r >= 0.8) {
      headline = `${sameAsSun(r) ? "About as wide as the Sun" : `${times(r)} as wide as the Sun`}${lum ? ` — and ${sameAsSun(lum) ? "about as bright" : lum >= 1.05 ? `${times(lum)} as bright` : `${ratio(lum)} as bright`}` : ""}`;
      saidWidth = true;
      saidLight = !!lum;
    } else if (r < 0.3) headline = `A star barely ${r * SUN.radiusKm < 1.2 * 69_911 ? "the size" : `${+((r * SUN.radiusKm) / 69_911).toFixed(1)} times the width`} of Jupiter`;
    else {
      headline = `Smaller than the Sun: ${ratio(r)} of its width`;
      saidWidth = true;
    }
    const km = `${nice(2 * r * SUN.radiusKm)} km`;
    lines.push(`${s.subject ?? s.name} is ${saidWidth ? `about ${km} across` : `${r >= 1.05 ? `${times(r)} as wide as the Sun` : `${ratio(r)} of the Sun’s width`} — about ${km} across`}.`);
    if (crossS > 60) lines.push(`Light takes ${lightTime(crossS)} to cross it; it crosses the Sun in under five seconds.`);
    if (mass) {
      const density = (mass / r ** 3) * 1.41; // g/cm³
      if (density < 0.0012) {
        lines.push(`For all its size it holds ${mass < 1.5 ? "about as much matter as the Sun" : `only ${nice(mass)} Suns’ worth of matter`}: on average it is thinner than the air you breathe.`);
        saidMass = true;
      }
      else if (density > 10) lines.push(`It packs ${times(mass / r ** 3)} the Sun’s density.`);
    }
    if (r > 50) visual = { kind: "orbits", star: { label: s.name, rAu: au, color: s.color }, orbits: ORBITS.filter((o) => o.au < au * 2.6), caption: `${s.name} in the Sun’s place, with the planets’ orbits` };
    else
      visual = {
        kind: "discs",
        items: [
          { label: s.name, r: r * SUN.radiusKm, color: s.color, main: true },
          { label: "the Sun", r: SUN.radiusKm, color: PLANET_COLOR.sun, glyph: "sun" },
          ...(r < 0.4 ? [{ label: "Jupiter", r: 69_911, color: PLANET_COLOR.jupiter, glyph: "jupiter" }] : []),
        ].sort((a, b) => b.r - a.r),
        caption: `${s.name}, the Sun${r < 0.4 ? " and Jupiter" : ""} to scale`.replace(/, the Sun to/, " and the Sun to"),
      };
  }
  if (lum && !saidLight) lines.push(sameAsSun(lum) ? "It gives off about as much light as the Sun." : lum >= 1.05 ? `It gives off as much light as ${nice(lum)} Suns.` : `It gives off ${lum < 0.01 ? `less than 1%` : ratio(lum)} of the Sun’s light.`);
  if (mass) {
    const of = sameAsSun(mass) ? "about the Sun’s mass" : mass >= 1.05 ? `${times(mass)} the Sun’s mass` : `${ratio(mass)} of the Sun’s mass`;
    if (!saidMass) lines.push(`It has ${of}${mass >= 10 ? " — heavy enough to end its life as a supernova" : mass < 0.5 ? ", and will glow for far longer than the Sun" : ""}.`);
    else if (mass >= 10) lines.push("That is still heavy enough for it to end its life as a supernova.");
    if (!headline) headline = of[0].toUpperCase() + of.slice(1);
  }
  const au = s.companionAu;
  if (au) {
    const n = au / NEPTUNE_AU;
    lines.push(`Its companion star is at least ${nice(au)} times Earth’s distance from the Sun away — ${n >= 1.5 ? `${times(n)} as far as Neptune is from the Sun` : n >= 0.7 ? "about as far as Neptune is from the Sun" : "closer than Neptune is to the Sun"}.`);
  }
  return {
    headline,
    lines,
    stats: [
      ...(r ? [{ label: "Width", value: r >= 1.05 ? `${nice(r)}× the Sun` : `${ratio(r)} of the Sun`, sub: `${nice(2 * r * SUN.radiusKm)} km` }] : []),
      ...(mass ? [{ label: "Mass", value: mass >= 1.05 ? `${nice(mass)}× the Sun` : `${ratio(mass)} of the Sun` }] : []),
      ...(lum ? [{ label: "Light", value: lum >= 1.05 ? `${nice(lum)}× the Sun` : `${lum < 0.01 ? "<1%" : ratio(lum)} of the Sun` }] : []),
      ...(au ? [{ label: "Companion", value: `${nice(au)} AU`, sub: "at least, from the brighter star" }] : []),
    ],
    visual,
  };
}

// ------------------------------------------------------------------------------------------- double stars

/** Voyager 1's distance from the Sun, AU: 163 at the start of 2024, moving out 3.57 AU a year. */
export function voyagerAu(when = new Date()): number {
  return 163 + (when.getFullYear() + when.getMonth() / 12 - 2024) * VOYAGER_AU_PER_YEAR;
}
const VOYAGER_AU_PER_YEAR = 3.57;

export function doubleScale(name: string, sepArcsec: number, distLy: number): ScaleStory {
  const au = sepArcsec * (distLy / 3.26156);
  const light = au * TWO_AU_S;
  const v = voyagerAu();
  const auM = (x: number) => (x / (2 * NEPTUNE_AU)) * COIN_M;
  const gap = auM(au);
  return {
    headline: `The two stars are at least ${times(au)} Earth’s distance from the Sun apart`,
    lines: [
      `That’s ${au / NEPTUNE_AU >= 1.5 ? `${times(au / NEPTUNE_AU)}` : "about"} the distance from the Sun to Neptune${au / NEPTUNE_AU < 0.7 ? " or less" : ""}: light takes ${lightTime(light)} to cross the gap.`,
      ...(au > 3 * v
        ? [`Voyager 1, our farthest spacecraft, has flown ${nice(v)} AU from the Sun since 1977. At its speed, crossing this gap would take about ${nice(au / VOYAGER_AU_PER_YEAR)} years.`]
        : []),
      `We may see the pair at a slant, so this is the least they can be apart.`,
    ],
    stats: [{ label: "Real gap", value: `${nice(au)} AU`, sub: `light takes ${lightTime(light)}` }],
    visual: coinModel(
      { label: "Between its two stars", note: `at least ${nice(au)} Earth–Sun distances`, m: gap, like: everyday(gap), icon: "double_star" },
      [{ label: "Voyager 1", note: "our farthest spacecraft, after 49 years", m: auM(v), like: `${everyday(auM(v))} from the Sun`, icon: "voyager" }],
      `Shrink our Solar System — the Sun and all eight planets — to the size of a coin, and ${name}’s two stars would be at least ${modelSize(gap)} apart (${everyday(gap)}), while the nearest star would be a football pitch away.`,
    ),
  };
}

// --------------------------------------------------------------------------------------------- deep sky

const MILKY_WAY_LY = 100_000;
const SOLAR_SYSTEM_LY = (2 * NEPTUNE_AU) / AU_PER_LY;

/**
 * The scale model: shrink our Solar System, out to Neptune, to a 2.4 cm coin and keep everything else in step. Then
 * the nearest star is a football pitch away, the Orion Nebula 880 m across and the Milky Way a 3-hour flight wide —
 * sizes people can picture, where light-years mean little.
 */
const COIN_M = 0.024;
const M_PER_LY = COIN_M / SOLAR_SYSTEM_LY;

/** "the Orion Nebula", "the Pleiades", but "Omega Centauri", "M 13", "Kemble’s Cascade". */
export function theName(name: string): string {
  return /\b(Nebula|Nebulae|Cluster|Galaxy|Cloud|Clouds|Group|Pleiades|Hyades|Loop|Bubble|Pillars|Remnant|Complex|Trapezium|Coathanger|Veil|Arc|Wall)\b/.test(name) && !/['’]s\b/.test(name) ? `the ${name}` : name;
}

/** A length in the model: "27 m", "880 m", "2.9 km". */
function modelSize(m: number): string {
  if (m < 1) return `${m < 0.1 ? +(m * 100).toFixed(1) : Math.round(m * 100)} cm`;
  // Three significant figures, so the rows divide out to the headline's numbers.
  if (m < 1000) return `${m < 10 ? +m.toFixed(1) : Number(m.toPrecision(3))} m`;
  const km = m / 1000;
  return `${km < 10 ? Number(km.toPrecision(3)) : nice(km)} km`;
}

/** Something everyday that long: a bus, a tennis court, so many football pitches, a walk, a drive, a flight. */
function everyday(m: number): string {
  if (m < 0.05) return "about the width of a coin";
  if (m < 0.13) return "about a hand’s width";
  if (m < 0.45) return "about the length of a ruler";
  if (m < 1.3) return "about a long stride";
  if (m < 3) return "about the height of a door";
  if (m < 7) return "about the length of a car";
  if (m < 18) return "about the length of a bus";
  if (m < 37) return "about the length of a tennis court";
  if (m < 62) return "about the length of an Olympic pool";
  if (m < 160) return "about the length of a football pitch";
  if (m < 1000) return `${Math.round(m / 105)} football pitches end to end`;
  const walk = m / 83; // minutes, at 5 km/h
  if (walk < 50) return `a ${Math.round(walk / 5) * 5}-minute walk`;
  if (walk < 80) return "an hour’s walk";
  if (walk < 330) return `a ${Math.round(walk / 60)}-hour walk`;
  const drive = m / 1333; // minutes, at 80 km/h
  if (drive < 50) return `a ${Math.round(drive / 5) * 5}-minute drive`;
  if (drive < 80) return "an hour’s drive";
  if (drive < 330) return `a ${Math.round(drive / 60)}-hour drive`;
  return `a ${Math.round(m / 800_000)}-hour flight`;
}

/** The model as rows from smallest to largest: the coin, the nearest star, the Milky Way, and the object among them. */
function coinModel(main: Omit<ModelRow, "size"> & { m: number }, extra: (Omit<ModelRow, "size"> & { m: number })[], text: string): ScaleVisual {
  const mw = MILKY_WAY_LY * M_PER_LY;
  const rows = [
    { label: "Our Solar System", note: "the Sun and all eight planets", m: COIN_M, like: "a coin", icon: "coin" },
    { label: "The nearest star", note: "Proxima Centauri, 4.2 light-years away", m: 4.24 * M_PER_LY, like: "a football pitch away", icon: "star" },
    { label: "Our Milky Way", note: "100,000 light-years across", m: mw, like: `${everyday(mw)} across`, icon: "galaxy" },
    ...extra,
    { ...main, main: true },
  ].sort((a, b) => a.m - b.m);
  return {
    kind: "model",
    title: "If our Solar System were the size of a coin…",
    rows: rows.map(({ m, ...r }) => ({ ...r, size: modelSize(m) })),
    caption: "Everything shrunk by the same amount",
    text,
  };
}

export interface DeepScaleInput {
  name: string;
  type: string;
  sizeLy?: number;
  minorLy?: number;
  mass?: number;
  stars?: number;
  members?: number;
  age?: number;
  rhoc?: number;
  vesc?: number;
  tdiss?: number;
}

export function deepScale(o: DeepScaleInput): ScaleStory | null {
  const w = o.sizeLy;
  if (!w && !o.mass) return null;
  const lines: string[] = [];
  const stats: ScaleStat[] = [];
  let headline = "";
  const galaxy = o.type === "galaxy" || o.type === "galaxy_group";
  // Nebulae and clusters: as many Solar Systems side by side, or so many times the distance to the nearest star —
  // the two yardsticks people know — and the coin model to picture it.
  let ys: { headline: string; sentence: string } | null = null;
  let visual: ScaleVisual | null = null;
  if (w && !galaxy) {
    const ss = w / SOLAR_SYSTEM_LY;
    const r = w / 4.24;
    const headline =
      r >= 1.2
        ? `${times(r).replace(/^t/, "T")} the distance from the Sun to the nearest star`
        : r >= 0.8
          ? "About as wide as the distance from the Sun to the nearest star"
          : ss >= 2
            ? `${nice(ss)} Solar Systems side by side`
            : "About as wide as our Solar System";
    ys = { headline, sentence: `That’s ${headline[0].toLowerCase()}${headline.slice(1)}.` };
    const m = w * M_PER_LY;
    const across = `${ly(w)} across`;
    visual = coinModel(
      { label: o.name, note: across, m, like: everyday(m), icon: o.type },
      [],
      `Shrink our Solar System — the Sun and all eight planets — to the size of a coin, and ${theName(o.name)} would be ${modelSize(m)} across (${everyday(m)}); the nearest star would be a football pitch away, and the Milky Way ${modelSize(MILKY_WAY_LY * M_PER_LY)} across.`,
    );
  }
  if (w) {
    stats.push({ label: "Width", value: ly(w) });
    const t = w < 0.1 ? `${Math.round(w * 365.25)} days` : w < 0.9 ? `${Math.round(w * 12)} months` : w < 1.5 ? "about a year" : `${nice(w)} years`;
    lines.push(`Light itself takes ${t} to cross it.`);
  }
  if (galaxy) {
    if (w) {
      const r = w / MILKY_WAY_LY;
      headline = r > 1.15 ? `${+r.toFixed(1)} times as wide as our Milky Way` : r > 0.85 ? "About as wide as our Milky Way" : r >= 0.1 ? `${Math.round(r * 100)}% of the Milky Way’s width` : "A dwarf beside the Milky Way";
      visual = { kind: "galaxies", mw: MILKY_WAY_LY, obj: { label: o.name, major: w, minor: o.minorLy ?? w * 0.6 }, caption: `${o.name} and the Milky Way to scale` };
    }
    if (w) {
      // Shrunk to a 100 m pitch, how big would the Solar System be?
      const um = (100 * SOLAR_SYSTEM_LY) / w * 1e6;
      lines.push(`Shrink it to the length of a football pitch and our whole Solar System would be ${um < 2 ? "smaller than a bacterium" : um < 15 ? "about the size of a red blood cell" : "thinner than a human hair"}.`);
    }
    if (o.stars) lines.push(`It holds about ${nice(o.stars)} stars — the Milky Way has a few hundred billion.`);
    if (o.mass) {
      lines.push(`All told — stars, gas and dark matter — it weighs about ${suns(o.mass)}.`);
      stats.push({ label: "Mass", value: suns(o.mass) });
    }
    if (o.stars) stats.push({ label: "Stars", value: nice(o.stars) });
  } else if (o.type === "globular_cluster") {
    if (o.mass) {
      headline = `About ${sunsWorth(o.mass)} worth of stars${w ? ` in a ball ${ly(w)} wide` : ""}`;
      stats.push({ label: "Mass", value: suns(o.mass) });
    }
    if (ys) {
      if (headline) lines.push(ys.sentence);
      else headline = ys.headline;
    }
    if (o.rhoc) {
      // Stars of half a solar mass on average: their spacing in the core, against our 4.2 light-years.
      const spacingLy = Math.pow(10 ** o.rhoc / 0.5, -1 / 3) * 3.26156;
      const days = spacingLy * 365.25;
      const gap = days < 60 ? `${Math.round(days)} light-days` : days < 700 ? `${Math.round(days / 30.4)} light-months` : `${+spacingLy.toFixed(1)} light-years`;
      lines.push(
        `In its core the stars are packed so tightly that each one’s nearest neighbour is about ${gap} away. Our nearest neighbour, Proxima Centauri, is 4.2 light-years from the Sun — ${times(4.24 / spacingLy)} farther.`,
      );
      stats.push({ label: "Core spacing", value: gap, sub: "between neighbouring stars" });
    }
    if (o.vesc) {
      const e = o.vesc / 11.2;
      lines.push(`To break free from its centre, a star would need ${Math.round(o.vesc)} km/s — ${e >= 1.15 ? `${e >= 1.9 && e < 2.1 ? "twice" : `${+e.toFixed(1)} times`} the speed a rocket needs to leave Earth` : e >= 0.9 ? "about the speed a rocket needs to leave Earth" : "less than the 11.2 km/s a rocket needs to leave Earth"}.`);
    }
    if (o.tdiss) lines.push(o.tdiss > 13.8 ? `It will hold together for another ${nice(o.tdiss)} billion years or so — longer than the universe has existed.` : `The Milky Way’s tides will pull it apart in about ${o.tdiss < 1 ? `${niceYears(o.tdiss * 1e9)} years` : `${nice(o.tdiss)} billion years`}.`);
  } else {
    if (o.type === "open_cluster" || o.type === "cluster_nebula") {
      if (o.members) {
        lines.push(`Gaia has picked out ${o.members.toLocaleString("en-US")} stars moving together through space as its members.`);
        stats.push({ label: "Stars", value: o.members.toLocaleString("en-US"), sub: "members found by Gaia" });
      }
      if (o.mass) stats.push({ label: "Mass", value: suns(o.mass) });
      if (o.age) {
        const lb = lookback(o.age);
        headline = `Born about ${niceYears(o.age)} years ago, ${lb.moment.replace(/^when /, "when ")}`;
      }
    } else if (o.mass) {
      lines.push(`It holds about ${sunsWorth(o.mass)} worth of ${o.type === "planetary_nebula" || o.type === "supernova_remnant" ? "material" : "gas and dust"}.`);
      stats.push({ label: "Mass", value: suns(o.mass) });
    }
    if (ys) {
      if (headline) lines.push(ys.sentence);
      else headline = ys.headline;
    }
  }
  if (!headline) headline = w ? `${ly(w)} across` : `About ${suns(o.mass!)}`;
  return { headline, lines, stats, visual };
}

export type { BodyPhysics };

/**
 * The comparison for a catalog object, from its facts: one choice shared by the object page and its server-rendered
 * version. A double whose brighter star has a known size is told as that star, with its companion's distance.
 */
export function catalogScale(o: { type: string; bv?: unknown; sep?: unknown; size?: unknown }, name: string, f: ObjectFacts | null | undefined): ScaleStory | null {
  const bv = typeof o.bv === "number" ? o.bv : undefined;
  const sep = typeof o.sep === "number" ? o.sep : undefined;
  const size = Array.isArray(o.size) ? (o.size as number[]) : undefined;
  // Its colour from B−V, or from its temperature when the catalog has no colour index (the doubles).
  const color = () => `rgb(${(bv === undefined && f?.teff ? temperatureRgb(f.teff) : starRgb(bv)).join(",")})`;
  const d = f?.d;
  if (o.type === "star") return starScale({ name, r: f?.r, mass: f?.mass, lum: f?.lum, color: color() });
  if (o.type === "double_star") {
    if (f?.r) return starScale({ name, r: f.r, mass: f.mass, lum: f.lum, color: color(), companionAu: sep && d ? sep * (d / 3.26156) : undefined, subject: "Its main star" });
    return sep && d ? doubleScale(name, sep, d) : null;
  }
  return deepScale({
    name,
    type: o.type,
    sizeLy: d && size?.[0] && o.type !== "asterism" ? physicalSizeLy(size[0], d) : undefined,
    minorLy: d && size?.[1] ? physicalSizeLy(size[1], d) : undefined,
    mass: f?.mass,
    stars: f?.stars,
    members: f?.members,
    age: f?.age,
    rhoc: f?.rhoc,
    vesc: f?.vesc,
    tdiss: f?.tdiss,
  });
}
