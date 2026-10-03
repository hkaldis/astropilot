/** Finder help: the nearest named bright star and the direction from it. */
import { useQuery } from "@tanstack/react-query";
import { DEG, separation } from "@shared/astro";

export interface NamedStar {
  name: string;
  ra: number; // hours, J2000
  dec: number; // degrees
  mag: number;
}

/** Named bright stars (≤ mag 3), loaded lazily as their own chunk. */
export function useNamedStars() {
  return useQuery<NamedStar[]>({
    queryKey: ["starnames"],
    queryFn: () => import("@shared/data/starnames.json").then((m) => (m.default ?? m) as unknown as NamedStar[]),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** Position angle (north through east, degrees) of point 2 as seen from point 1. */
export function positionAngle(ra1h: number, dec1: number, ra2h: number, dec2: number): number {
  const da = (ra2h - ra1h) * 15 * DEG;
  const d1 = dec1 * DEG;
  const d2 = dec2 * DEG;
  const pa = Math.atan2(Math.sin(da), Math.cos(d1) * Math.tan(d2) - Math.sin(d1) * Math.cos(da)) / DEG;
  return (pa + 360) % 360;
}

const DIRS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

export interface FinderHint {
  star: NamedStar;
  sep: number; // degrees
  direction: string; // "north-east"
}

export function nearestBrightStar(stars: NamedStar[] | undefined, ra: number, dec: number, maxSep = 14): FinderHint | null {
  if (!stars?.length) return null;
  let best: NamedStar | null = null;
  let bestSep = Infinity;
  for (const s of stars) {
    const d = separation(s.ra, s.dec, ra, dec);
    if (d < bestSep) {
      bestSep = d;
      best = s;
    }
  }
  if (!best || bestSep > maxSep) return null;
  const pa = positionAngle(best.ra, best.dec, ra, dec);
  return { star: best, sep: bestSep, direction: DIRS[Math.round(pa / 45) % 8] };
}

/** A finder's-eye-view of distance: 1° ≈ two full Moons; a fist at arm's length ≈ 10°. */
export function sepWords(deg: number): string {
  if (deg < 1) return `${Math.round(deg * 60)}′ (about ${Math.max(1, Math.round(deg * 2))} full Moon${Math.round(deg * 2) > 1 ? "s" : ""})`;
  if (deg < 5) return `${deg.toFixed(1)}° (about ${Math.round(deg * 2)} full Moons, within a finder field)`;
  return `${deg.toFixed(0)}° (about ${deg >= 9 ? "a fist" : "three fingers"} at arm's length)`;
}
