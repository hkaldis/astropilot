/**
 * A star's colour from its B−V colour index: its approximate surface temperature (Ballesteros 2012, a blackbody
 * fit good from about 2,500 to 40,000 K), a colour to paint it with, and a word for how it looks.
 */

/** Effective temperature (K) from B−V. */
export function bvTemperature(bv: number): number {
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

/** sRGB colour of a blackbody at temperature `t` (K), scaled to full brightness (Tanner Helland's fit). */
export function temperatureRgb(t: number): [number, number, number] {
  const k = Math.min(Math.max(t, 1000), 40000) / 100;
  const clamp = (x: number) => Math.round(Math.min(255, Math.max(0, x)));
  const r = k <= 66 ? 255 : clamp(329.698727446 * Math.pow(k - 60, -0.1332047592));
  const g = k <= 66 ? clamp(99.4708025861 * Math.log(k) - 161.1195681661) : clamp(288.1221695283 * Math.pow(k - 60, -0.0755148492));
  const b = k >= 66 ? 255 : k <= 19 ? 0 : clamp(138.5177312231 * Math.log(k - 10) - 305.0447927307);
  return [r, g, b];
}

/** The colour to draw a star of colour index `bv` (white when unknown). */
export function starRgb(bv: number | undefined): [number, number, number] {
  return bv === undefined || !Number.isFinite(bv) ? [255, 255, 255] : temperatureRgb(bvTemperature(bv));
}

/** How a star of colour index `bv` looks to the eye. */
export function colourWord(bv: number | undefined): string | null {
  if (bv === undefined || !Number.isFinite(bv)) return null;
  if (bv < -0.1) return "blue-white";
  if (bv < 0.15) return "white";
  if (bv < 0.45) return "yellow-white";
  if (bv < 0.85) return "yellow";
  if (bv < 1.4) return "orange";
  if (bv < 2) return "orange-red";
  return "deep red";
}
