/**
 * Theme tokens for the canvas chart. The chart reads the same CSS variables as the rest of the
 * app (index.css) so dark, light and night-vision modes all stay consistent without hard-coded colours.
 */

export type HSL = [number, number, number];

export interface SkyTheme {
  light: boolean;
  background: HSL;
  foreground: HSL;
  muted: HSL; // --muted-foreground
  border: HSL;
  primary: HSL;
  gold: HSL;
  surface2: HSL;
  card: HSL;
  skyNight: HSL;
  skyAstro: HSL;
  skyNautical: HSL;
  skyCivil: HSL;
  skyDay: HSL;
}

const DARK_FALLBACK: SkyTheme = {
  light: false,
  background: [228, 45, 4],
  foreground: [220, 28, 93],
  muted: [222, 13, 62],
  border: [228, 20, 14.5],
  primary: [196, 92, 66],
  gold: [41, 96, 67],
  surface2: [228, 28, 9.5],
  card: [228, 34, 6.5],
  skyNight: [230, 50, 6],
  skyAstro: [232, 45, 12],
  skyNautical: [228, 42, 22],
  skyCivil: [222, 45, 36],
  skyDay: [205, 60, 58],
};

function parseHsl(raw: string): HSL | null {
  const m = raw.trim().match(/^(-?[\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/);
  return m ? [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])] : null;
}

export function readSkyTheme(): SkyTheme {
  if (typeof document === "undefined") return DARK_FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const get = (name: string, fb: HSL) => parseHsl(cs.getPropertyValue(name)) ?? fb;
  const background = get("--background", DARK_FALLBACK.background);
  return {
    light: background[2] > 50,
    background,
    foreground: get("--foreground", DARK_FALLBACK.foreground),
    muted: get("--muted-foreground", DARK_FALLBACK.muted),
    border: get("--border", DARK_FALLBACK.border),
    primary: get("--primary", DARK_FALLBACK.primary),
    gold: get("--gold", DARK_FALLBACK.gold),
    surface2: get("--surface-2", DARK_FALLBACK.surface2),
    card: get("--card", DARK_FALLBACK.card),
    skyNight: get("--sky-night", DARK_FALLBACK.skyNight),
    skyAstro: get("--sky-astro", DARK_FALLBACK.skyAstro),
    skyNautical: get("--sky-nautical", DARK_FALLBACK.skyNautical),
    skyCivil: get("--sky-civil", DARK_FALLBACK.skyCivil),
    skyDay: get("--sky-day", DARK_FALLBACK.skyDay),
  };
}

export function hsla(c: HSL, a = 1): string {
  return `hsla(${c[0]}, ${c[1]}%, ${c[2]}%, ${a})`;
}

export function mixHsl(a: HSL, b: HSL, t: number): HSL {
  const k = Math.min(1, Math.max(0, t));
  let dh = b[0] - a[0];
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return [a[0] + dh * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export function hslToRgb([h, s, l]: HSL): [number, number, number] {
  const S = s / 100;
  const L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

/** Sky colour of the dome for a Sun altitude (degrees). Twilight brightens it, but never so much that stars stop reading. */
export function domeColor(t: SkyTheme, sunAlt: number): HSL {
  if (t.light) return t.card;
  const stops: [number, HSL][] = [
    [-18, t.skyNight],
    [-12, mixHsl(t.skyNight, t.skyAstro, 0.85)],
    [-6, mixHsl(t.skyAstro, t.skyNautical, 0.75)],
    [0, mixHsl(t.skyNautical, t.skyCivil, 0.7)],
    [8, mixHsl(t.skyCivil, t.skyDay, 0.25)],
  ];
  if (sunAlt <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (sunAlt <= stops[i][0]) {
      const [a0, c0] = stops[i - 1];
      const [a1, c1] = stops[i];
      return mixHsl(c0, c1, (sunAlt - a0) / (a1 - a0));
    }
  }
  return stops[stops.length - 1][1];
}

/** Subtle B−V tint for a star (blue-white → orange-red), as an HSL hue/saturation pair. */
export function starTint(bv: number): HSL {
  if (!Number.isFinite(bv)) return [0, 0, 100];
  if (bv < -0.05) return [214, 90, 80];
  if (bv < 0.25) return [205, 60, 92];
  if (bv < 0.6) return [48, 70, 90];
  if (bv < 1.1) return [38, 90, 76];
  if (bv < 1.5) return [26, 95, 70];
  return [14, 95, 66];
}
