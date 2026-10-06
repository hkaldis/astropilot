import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * AstroPilot mark: a crescent orbit with a guiding star.
 * `intro` draws it in once (orbit, then the star); `glow` lets the guiding star softly shine. Every so often
 * the comet laps its ring (the .logo-* animations in index.css).
 */
export function Logo({ className, withText = true, intro = false, glow = false }: { className?: string; withText?: boolean; intro?: boolean; glow?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const gid = `ap-g-${uid}`;
  const halo = `ap-h-${uid}`;
  const trail = `ap-t-${uid}`;
  const draw = intro ? { pathLength: 1, strokeDasharray: 1, className: "animate-draw" } : {};
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0 overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: "hsl(var(--primary))" }} />
            <stop offset="1" style={{ stopColor: "hsl(var(--gold))" }} />
          </linearGradient>
          {glow && (
            <radialGradient id={halo}>
              <stop offset="0" style={{ stopColor: "hsl(var(--gold))", stopOpacity: 0.55 }} />
              <stop offset="1" style={{ stopColor: "hsl(var(--gold))", stopOpacity: 0 }} />
            </radialGradient>
          )}
          {/* Fades away behind the head, along the orbit it follows while it laps the ring. */}
          <linearGradient id={trail} gradientUnits="userSpaceOnUse" x1="18.24" y1="24.92" x2="22.6" y2="9.6">
            <stop offset="0" style={{ stopColor: "hsl(var(--primary))", stopOpacity: 0 }} />
            <stop offset="1" style={{ stopColor: "hsl(var(--gold))" }} />
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="14.5" fill="none" stroke={`url(#${gid})`} strokeWidth="1.5" opacity="0.9" {...draw} />
        {/* The comet: its tail, the trail it leaves while lapping the ring, and its head. */}
        <g className="logo-comet">
          <path className="logo-trail" d="M18.24 24.92A9.19 9.19 0 0 0 22.6 9.6" fill="none" stroke={`url(#${trail})`} strokeWidth="2.2" strokeLinecap="round" />
          <g className="logo-tail">
            <path d="M9 22.5c3.8-1.2 9.5-5.4 13.4-12.2" fill="none" stroke={`url(#${gid})`} strokeWidth="2.2" strokeLinecap="round" {...draw} style={intro ? { animationDelay: "0.25s" } : undefined} />
          </g>
          <g className="logo-head">
            {glow && <circle cx="22.6" cy="9.6" r="6.5" fill={`url(#${halo})`} className="animate-breathe" />}
            <circle cx="22.6" cy="9.6" r="2.3" fill="hsl(var(--gold))" className={intro ? "origin-box origin-center animate-pop" : undefined} style={intro ? { animationDelay: "0.85s" } : undefined} />
          </g>
        </g>
        <circle cx="10.5" cy="11" r="0.9" fill="hsl(var(--foreground))" fillOpacity="0.8" className={intro ? "animate-fade" : undefined} style={intro ? { animationDelay: "1.1s" } : undefined} />
        <circle cx="20.5" cy="21.5" r="0.7" fill="hsl(var(--foreground))" fillOpacity="0.6" className={intro ? "animate-fade" : undefined} style={intro ? { animationDelay: "1.25s" } : undefined} />
      </svg>
      {withText && (
        <span className="font-display text-[1.35rem] leading-none tracking-tight">
          Astro<span className="italic text-primary">Pilot</span>
        </span>
      )}
    </span>
  );
}

/** Small schematic icon per object type (drawn, not emoji). Pass `id` for planets to get that planet's own icon. */
export function TypeGlyph({ type, className, id }: { type: string; className?: string; id?: string }) {
  if (type === "planet" && id && id in PLANET_STYLE) return <PlanetGlyph id={id} className={className} />;
  const c = cn("h-5 w-5 shrink-0", className);
  const stroke = "currentColor";
  switch (type) {
    case "galaxy":
    case "galaxy_group":
      return (
        <svg viewBox="0 0 24 24" className={c} aria-hidden="true">
          <ellipse cx="12" cy="12" rx="9.5" ry="3.6" transform="rotate(-25 12 12)" fill="none" stroke={stroke} strokeWidth="1.4" opacity="0.55" />
          <ellipse cx="12" cy="12" rx="5" ry="1.8" transform="rotate(-25 12 12)" fill={stroke} opacity="0.5" />
          <circle cx="12" cy="12" r="1.6" fill={stroke} />
        </svg>
      );
    case "globular_cluster":
      return (
        <svg viewBox="0 0 24 24" className={c} aria-hidden="true">
          {[...Array(18)].map((_, i) => {
            const a = i * 2.4;
            const r = 2 + (i % 6) * 1.25;
            return <circle key={i} cx={12 + Math.cos(a) * r} cy={12 + Math.sin(a) * r} r={i < 6 ? 1.1 : 0.7} fill={stroke} opacity={1 - r / 12} />;
          })}
          <circle cx="12" cy="12" r="2.2" fill={stroke} />
        </svg>
      );
    case "open_cluster":
    case "asterism":
    case "star_cloud":
      return (
        <svg viewBox="0 0 24 24" className={c} aria-hidden="true">
          {[
            [6, 8, 1.3],
            [11, 5, 1],
            [16, 9, 1.5],
            [9, 14, 1.1],
            [14, 15, 0.9],
            [18, 17, 1.2],
            [6, 18, 0.8],
            [12, 10, 0.7],
          ].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill={stroke} />
          ))}
        </svg>
      );
    case "planetary_nebula":
      return (
        <svg viewBox="0 0 24 24" className={c} aria-hidden="true">
          <circle cx="12" cy="12" r="7" fill="none" stroke={stroke} strokeWidth="2.4" opacity="0.65" />
          <circle cx="12" cy="12" r="1.2" fill={stroke} />
        </svg>
      );
    case "double_star":
      return (
        <svg viewBox="0 0 24 24" className={c} aria-hidden="true">
          <circle cx="9" cy="13" r="3.2" fill="hsl(var(--gold))" />
          <circle cx="16" cy="9" r="2" fill="hsl(var(--primary))" />
        </svg>
      );
    case "dark_nebula":
      return (
        <svg viewBox="0 0 24 24" className={c} aria-hidden="true">
          <path d="M4 15c2-6 6-9 10-8 3 .8 4 3 6 2-1 4-4 7-8 7-3 0-5-2-8-1z" fill={stroke} opacity="0.85" />
          {[[5, 6], [19, 17], [8, 20], [18, 5]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="0.8" fill={stroke} opacity="0.6" />
          ))}
        </svg>
      );
    case "planet":
      return (
        <svg viewBox="0 0 24 24" className={c} aria-hidden="true">
          <circle cx="12" cy="12" r="5.5" fill={stroke} opacity="0.8" />
          <ellipse cx="12" cy="12" rx="10" ry="3" fill="none" stroke={stroke} strokeWidth="1.3" transform="rotate(-18 12 12)" />
        </svg>
      );
    case "moon":
      return (
        <svg viewBox="0 0 24 24" className={c} aria-hidden="true">
          <path d="M15.5 3.5a8.5 8.5 0 1 0 5 13.5A7 7 0 0 1 15.5 3.5z" fill={stroke} />
        </svg>
      );
    case "satellite":
      // A planet's moon: a small world on its orbit around a larger one.
      return (
        <svg viewBox="0 0 24 24" className={c} aria-hidden="true">
          <circle cx="10" cy="13" r="6" fill={stroke} opacity="0.35" />
          <ellipse cx="11.5" cy="12" rx="10" ry="4.2" transform="rotate(-24 11.5 12)" fill="none" stroke={stroke} strokeWidth="1" strokeDasharray="1.6 1.8" opacity="0.65" />
          <circle cx="19.2" cy="7.4" r="2.5" fill={stroke} />
        </svg>
      );
    default:
      // nebulae and remnants
      return (
        <svg viewBox="0 0 24 24" className={c} aria-hidden="true">
          <path d="M5 14c-1.5-3 1-6.5 4-6 1-3 5.5-3.5 7-1 3-.5 5 2 4 5 1.5 2-.5 5-3 4.5-1 2.5-5 3-6.5 1-3 1-6-1-5.5-3.5z" fill={stroke} opacity="0.45" />
          <path d="M8 13c1-2 3-3 5-2s3 0 4 1" fill="none" stroke={stroke} strokeWidth="1.2" opacity="0.9" />
        </svg>
      );
  }
}

/**
 * The Moon's phase as seen from Earth. `elongation` 0..360 (0 new, 180 full);
 * the lit side is on the right while waxing as seen from the north; pass `southern` to mirror it.
 */
export function MoonGlyph({ elongation, size = 44, className, southern = false }: { elongation: number; size?: number; className?: string; southern?: boolean }) {
  const e = ((elongation % 360) + 360) % 360;
  const frac = (1 - Math.cos((e * Math.PI) / 180)) / 2; // illuminated fraction
  const waxing = e < 180;
  const r = 20;
  // Terminator ellipse x-radius
  const k = Math.abs(1 - 2 * frac) * r;
  // Path: half disk on lit side + terminator ellipse
  const sweepOuter = waxing ? 1 : 0;
  const sweepInner = frac > 0.5 ? (waxing ? 1 : 0) : waxing ? 0 : 1;
  const d = `M 22 2 A ${r} ${r} 0 0 ${sweepOuter} 22 42 A ${k} ${r} 0 0 ${sweepInner} 22 2 Z`;
  return (
    <svg viewBox="0 0 44 44" width={size} height={size} className={className} aria-label={`Moon ${Math.round(frac * 100)}% illuminated`} role="img" style={southern ? { transform: "scaleX(-1)" } : undefined}>
      <circle cx="22" cy="22" r={r} style={{ fill: "hsl(var(--sky-night))" }} />
      {frac > 0.01 && <path d={d} fill="#efe6cf" />}
      <circle cx="22" cy="22" r={r} fill="none" style={{ stroke: "hsl(var(--foreground) / 0.18)" }} strokeWidth="1" />
    </svg>
  );
}

// ------------------------------------------------------------------------------------
// Planets: each one drawn from its real look (colours are intrinsic, so they stay fixed in every theme).
// ------------------------------------------------------------------------------------

const PLANET_STYLE: Record<string, { base: string; light: string; dark: string }> = {
  mercury: { base: "#9a8f86", light: "#cfc6bd", dark: "#5f5650" },
  venus: { base: "#e9d9a8", light: "#fbf3d6", dark: "#b8a46c" },
  mars: { base: "#c4562f", light: "#ec8a5c", dark: "#7e2f19" },
  jupiter: { base: "#d9b88f", light: "#f3e2c4", dark: "#9c7a55" },
  saturn: { base: "#e3c98f", light: "#f7e8bf", dark: "#a88c55" },
  uranus: { base: "#9fdbe0", light: "#d4f3f4", dark: "#5fa9b2" },
  neptune: { base: "#3f66d1", light: "#7f9ff0", dark: "#22398a" },
};

/** A small, recognisable portrait of each planet. */
export function PlanetGlyph({ id, className, title }: { id: string; className?: string; title?: string }) {
  const uid = useId().replace(/:/g, "");
  const st = PLANET_STYLE[id] ?? PLANET_STYLE.mercury;
  const shade = `pl-sh-${uid}`;
  const clip = `pl-cl-${uid}`;
  const c = cn("h-5 w-5 shrink-0", className);
  const body = (r: number, cx = 12, cy = 12) => (
    <>
      <circle cx={cx} cy={cy} r={r} fill={`url(#${shade})`} />
    </>
  );
  const defs = (r: number, cx = 12, cy = 12) => (
    <defs>
      <radialGradient id={shade} cx="35%" cy="32%" r="75%">
        <stop offset="0" style={{ stopColor: st.light }} />
        <stop offset="0.55" style={{ stopColor: st.base }} />
        <stop offset="1" style={{ stopColor: st.dark }} />
      </radialGradient>
      <clipPath id={clip}>
        <circle cx={cx} cy={cy} r={r} />
      </clipPath>
    </defs>
  );
  const label = title ?? id.charAt(0).toUpperCase() + id.slice(1);
  switch (id) {
    case "saturn":
      return (
        <svg viewBox="0 0 24 24" className={c} role="img" aria-label={label}>
          {defs(6.2)}
          {/* ring behind the globe */}
          <ellipse cx="12" cy="12" rx="11" ry="3.4" transform="rotate(-16 12 12)" fill="none" stroke="#cbb27a" strokeWidth="1.6" opacity="0.55" />
          {body(6.2)}
          <g clipPath={`url(#${clip})`}>
            <rect x="4" y="10.2" width="16" height="1.1" fill={st.dark} opacity="0.35" />
            <rect x="4" y="13.2" width="16" height="0.8" fill={st.dark} opacity="0.25" />
          </g>
          {/* front half of the ring */}
          <path d="M1.427 15.032 A11 3.4 -16 0 0 22.573 8.968" fill="none" stroke="#e8d3a0" strokeWidth="1.6" />
        </svg>
      );
    case "jupiter":
      return (
        <svg viewBox="0 0 24 24" className={c} role="img" aria-label={label}>
          {defs(9.5)}
          {body(9.5)}
          <g clipPath={`url(#${clip})`}>
            <rect x="2" y="6.2" width="20" height="1.6" fill="#a9825b" opacity="0.75" />
            <rect x="2" y="9.4" width="20" height="2.2" fill="#9a6f4a" opacity="0.8" />
            <rect x="2" y="13.4" width="20" height="2" fill="#a07650" opacity="0.75" />
            <rect x="2" y="16.6" width="20" height="1.2" fill="#b08a63" opacity="0.6" />
            <ellipse cx="15" cy="14.6" rx="2.1" ry="1.1" fill="#b4472f" />
          </g>
        </svg>
      );
    case "mars":
      return (
        <svg viewBox="0 0 24 24" className={c} role="img" aria-label={label}>
          {defs(8.5)}
          {body(8.5)}
          <g clipPath={`url(#${clip})`}>
            <ellipse cx="12" cy="4" rx="4.6" ry="1.9" fill="#f6efe8" />
            <path d="M6.5 11.5c1.6-1.1 3.4-.9 4.6.4.8.9 2.4 1 3.3.1 1-.9 2.6-.7 3.6.5-1 2-3 2.4-4.4 1.6-1.2-.6-2.4-.4-3.5.5-1.4 1.1-3.3.4-3.6-1.4z" fill="#7a2c18" opacity="0.65" />
          </g>
        </svg>
      );
    case "venus":
      return (
        <svg viewBox="0 0 24 24" className={c} role="img" aria-label={label}>
          {defs(8.6)}
          {body(8.6)}
          <g clipPath={`url(#${clip})`} fill="none" stroke="#c9b37a" strokeWidth="1" opacity="0.55">
            <path d="M4 9c3-1.5 6 1.2 9 0s5-1.4 7 0" />
            <path d="M3.5 13c3.5-1.2 6.5 1.4 9.5.2s5.2-1 7.5.2" />
            <path d="M5 16.8c3-1 5.5.9 8.2 0 2.3-.8 3.9-.6 5.4.2" />
          </g>
        </svg>
      );
    case "mercury":
      return (
        <svg viewBox="0 0 24 24" className={c} role="img" aria-label={label}>
          {defs(6.8)}
          {body(6.8)}
          <g clipPath={`url(#${clip})`} fill={st.dark} opacity="0.55">
            <circle cx="10" cy="10" r="1.2" />
            <circle cx="14.2" cy="13.4" r="1.5" />
            <circle cx="9.6" cy="15" r="0.8" />
            <circle cx="14.6" cy="8.6" r="0.7" />
          </g>
        </svg>
      );
    case "uranus":
      return (
        <svg viewBox="0 0 24 24" className={c} role="img" aria-label={label}>
          {defs(7.4)}
          {/* Uranus is tipped on its side: the ring system stands almost upright */}
          <ellipse cx="12" cy="12" rx="2.6" ry="10.6" transform="rotate(8 12 12)" fill="none" stroke="#bfe9ec" strokeWidth="0.9" opacity="0.7" />
          {body(7.4)}
          <path d="M13.475 1.503 A2.6 10.6 8 0 1 10.525 22.497" fill="none" stroke="#e1f7f8" strokeWidth="0.9" opacity="0.9" />
        </svg>
      );
    case "neptune":
      return (
        <svg viewBox="0 0 24 24" className={c} role="img" aria-label={label}>
          {defs(7.6)}
          {body(7.6)}
          <g clipPath={`url(#${clip})`}>
            <ellipse cx="10.4" cy="13.6" rx="2" ry="1.1" fill="#16285e" opacity="0.85" />
            <path d="M12.5 9.6c1.3-.5 2.8-.4 4 .2" fill="none" stroke="#e8f0ff" strokeWidth="0.9" strokeLinecap="round" opacity="0.85" />
            <rect x="4" y="7" width="16" height="0.9" fill="#5f84e6" opacity="0.45" />
          </g>
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={c} role="img" aria-label={label}>
          {defs(8)}
          {body(8)}
        </svg>
      );
  }
}

export const PLANET_IDS = Object.keys(PLANET_STYLE);
