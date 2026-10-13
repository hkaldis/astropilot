import { useId, useMemo } from "react";
import { seeded } from "./kit";

interface Star {
  x: number;
  y: number;
  mag: number;
}

/** A believable patch of sky: few bright stars, many faint ones (about 3× more per magnitude). */
function makeStars(seed: number, count: number): Star[] {
  const rnd = seeded(seed);
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    // Inverse of a cumulative count that grows ×3 per magnitude, from −1 to 8.
    const u = rnd();
    const mag = -1 + Math.log(1 + u * (Math.pow(3, 9) - 1)) / Math.log(3);
    stars.push({ x: rnd() * 100, y: rnd() * 62, mag });
  }
  return stars;
}

/**
 * A night sky drawn for given conditions: stars fainter than `limit` vanish, `sky` sets the background,
 * `milkyWay` (0–1) the band's strength, `glow` (0–1) a light dome on the horizon, `haze` (0–1) a milky veil.
 */
export function StarField({
  limit,
  sky,
  milkyWay = 0,
  glow = 0,
  glowColor = "255,170,90",
  haze = 0,
  seed = 7,
  count = 520,
  className,
  label,
}: {
  limit: number;
  sky: string;
  milkyWay?: number;
  glow?: number;
  glowColor?: string;
  haze?: number;
  seed?: number;
  count?: number;
  className?: string;
  label: string;
}) {
  const uid = useId().replace(/:/g, "");
  const stars = useMemo(() => makeStars(seed, count), [seed, count]);
  return (
    <svg viewBox="0 0 100 62" className={className} role="img" aria-label={label} preserveAspectRatio="xMidYMid slice">
      <defs>
        <filter id={`mw-${uid}`} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
        <linearGradient id={`dome-${uid}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={`rgb(${glowColor})`} stopOpacity={0.85 * glow} />
          <stop offset="0.55" stopColor={`rgb(${glowColor})`} stopOpacity={0.18 * glow} />
          <stop offset="1" stopColor={`rgb(${glowColor})`} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="100" height="62" fill={sky} />
      {milkyWay > 0.01 && (
        <g opacity={milkyWay} filter={`url(#mw-${uid})`}>
          <path d="M-10 52 C 20 30, 45 26, 110 6 L 110 22 C 50 36, 25 44, -10 66 Z" fill="rgb(205,214,235)" opacity="0.45" />
          <path d="M 30 40 C 45 33, 60 29, 75 22" stroke="rgb(20,24,34)" strokeWidth="3" fill="none" opacity="0.6" />
          <ellipse cx="38" cy="38" rx="9" ry="5" fill="rgb(230,232,245)" opacity="0.5" />
        </g>
      )}
      {stars.map((s, i) => {
        if (s.mag > limit) return null;
        // Stars near the limit are barely there; bright ones are bigger.
        const margin = limit - s.mag;
        const opacity = Math.min(1, 0.25 + margin / 2.2) * (1 - haze * 0.35);
        const r = Math.max(0.13, 0.62 - s.mag * 0.065);
        return <circle key={i} cx={s.x} cy={s.y} r={r} fill="#fff" opacity={opacity} />;
      })}
      {haze > 0 && <rect width="100" height="62" fill="rgb(150,160,175)" opacity={haze * 0.35} />}
      {glow > 0 && <rect width="100" height="62" fill={`url(#dome-${uid})`} />}
    </svg>
  );
}
