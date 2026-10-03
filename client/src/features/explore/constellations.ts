/** IAU constellation names (from the shared sky data) with lookup helpers. */
import { CONSTELLATION_NAMES } from "@shared/data/constellations-meta";

export const CONSTELLATIONS: Record<string, string> = CONSTELLATION_NAMES;

const BY_UPPER: Record<string, string> = Object.fromEntries(Object.entries(CONSTELLATIONS).map(([k, v]) => [k.toUpperCase(), v]));

/** Full name for an IAU abbreviation (case-insensitive); falls back to the input. */
export function constellationName(abbr: string | null | undefined): string {
  if (!abbr) return "";
  return CONSTELLATIONS[abbr] ?? BY_UPPER[abbr.toUpperCase()] ?? abbr;
}

/** Canonical abbreviation ("UMA" → "UMa"), or null if unknown. */
export function canonicalConstellation(abbr: string | null | undefined): string | null {
  if (!abbr) return null;
  if (CONSTELLATIONS[abbr]) return abbr;
  const up = abbr.toUpperCase();
  return Object.keys(CONSTELLATIONS).find((k) => k.toUpperCase() === up) ?? null;
}
