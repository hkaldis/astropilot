/** Where a planet's moon is, in words: its distance and direction from the planet, or what hides it. */
import { separationOf, type MoonPos } from "@shared/astro";

const DIRS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
/** Compass direction of an offset given east and north. */
export const direction = (dx: number, dy: number) => DIRS[Math.round((((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360) / 45) % 8];
export const angleText = (arcsec: number) => (arcsec < 60 ? `${Math.round(arcsec)}″` : `${(arcsec / 60).toFixed(arcsec < 600 ? 1 : 0)}′`);

export function whereText(p: MoonPos, planet: string) {
  if (p.occulted) return `Behind ${planet}`;
  if (p.eclipse === "total") return `In ${planet}'s shadow`;
  if (p.transit) return `Crossing in front of ${planet}`;
  return `${angleText(separationOf(p))} ${direction(p.dx, p.dy)}${p.eclipse === "partial" ? " · partly eclipsed" : ""}`;
}
