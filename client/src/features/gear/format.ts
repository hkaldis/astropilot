/** Number formatting for optics. All outputs are plain strings; render them inside `.num`. */

const trimZero = (s: string) => s.replace(/\.0$/, "");

export const fmtMag = (m: number) => `${m >= 10 ? Math.round(m) : trimZero(m.toFixed(1))}×`;
export const fmtPupil = (p: number) => `${p.toFixed(1)} mm`;
export const fmtFRatio = (f: number) => `f/${trimZero(f.toFixed(1))}`;
export const fmtArcsec = (a: number) => `${a < 1 ? a.toFixed(2) : a.toFixed(1)}″`;
export const fmtMm = (mm: number) => `${trimZero(mm.toFixed(mm < 10 ? 1 : 0))} mm`;
/** "1200 mm", with a no-break space so a line never splits a value from its unit. */
export const fmtFocal = (mm: number) => `${trimZero(String(Math.round(mm * 10) / 10))}\u00a0mm`;
export const fmtFactor = (f: number) => `${trimZero(String(Math.round(f * 100) / 100))}×`;

/** True field: degrees when ≥ 1°, arcminutes below. */
export function fmtField(deg: number) {
  if (deg >= 1) return `${deg.toFixed(deg >= 10 ? 0 : 1)}°`;
  return `${Math.max(1, Math.round(deg * 60))}′`;
}

export function fmtInches(mm: number) {
  const inch = mm / 25.4;
  return `${trimZero(inch.toFixed(inch >= 10 ? 0 : 1))}″`;
}

/** "1.12° × 0.75°" or "38′ × 25′" for a camera field. */
export function fmtFieldPair(wDeg: number, hDeg: number) {
  if (wDeg >= 1) return `${wDeg.toFixed(2)}° × ${hDeg.toFixed(2)}°`;
  return `${Math.round(wDeg * 60)}′ × ${Math.round(hDeg * 60)}′`;
}

export const fmtLightGrasp = (x: number) => `${x >= 100 ? Math.round(x).toLocaleString("en") : x.toFixed(0)}×`;
