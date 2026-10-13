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
    case "star":
      // A single bright star: a glow with four soft rays.
      return (
        <svg viewBox="0 0 24 24" className={c} aria-hidden="true">
          <circle cx="12" cy="12" r="7.5" fill="hsl(var(--gold))" opacity="0.14" />
          <path d="M12 3.5 13.1 10.9 20.5 12 13.1 13.1 12 20.5 10.9 13.1 3.5 12 10.9 10.9Z" fill="hsl(var(--gold))" opacity="0.85" />
          <circle cx="12" cy="12" r="2.3" fill="hsl(var(--gold))" />
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
// Planets, Earth, the Moon and the Sun as flat illustrations: solid colours, crisp shapes and a flat crescent of
// shade on the night side. Their colours are intrinsic, so they stay fixed in every theme.
// ------------------------------------------------------------------------------------

const PLANET_STYLE: Record<string, { base: string }> = {
  mercury: { base: "#a9a39b" },
  venus: { base: "#eedcaa" },
  mars: { base: "#d4643a" },
  jupiter: { base: "#ecd8b4" },
  saturn: { base: "#ead39c" },
  uranus: { base: "#a6e1e6" },
  neptune: { base: "#4b74e0" },
};

/** The radius of each glyph's globe in its 24-unit box, so a picture can draw it to scale… */
export const GLYPH_BODY_R: Record<string, number> = { mercury: 6.8, venus: 8.6, earth: 8.6, moon: 8, mars: 8.5, jupiter: 9.5, saturn: 6.2, uranus: 7.4, neptune: 7.6, sun: 9.2 };
/** …and how far its rings or glow reach beyond the globe, across and up. */
export const GLYPH_EXTENT: Record<string, [number, number]> = { saturn: [1.78, 1], uranus: [1.05, 1.47], sun: [1.22, 1.22] };

/** A circle as a path, for even-odd cut-outs. */
const circlePath = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

/**
 * A small, recognisable portrait of each planet (and of Earth, the Moon and the Sun). Inside another SVG, pass
 * `x`, `y` and `size` to place it there instead of sizing it with CSS.
 */
export function PlanetGlyph({ id, className, title, x, y, size }: { id: string; className?: string; title?: string; x?: number; y?: number; size?: number }) {
  const uid = useId().replace(/:/g, "");
  const clip = `pl-cl-${uid}`;
  const c = cn("h-5 w-5 shrink-0", className);
  const box = size === undefined ? { className: c } : { x, y, width: size, height: size, overflow: "visible" as const };
  const label = title ?? id.charAt(0).toUpperCase() + id.slice(1);
  const R = GLYPH_BODY_R[id] ?? 8;
  const clipped = (children: React.ReactNode) => <g clipPath={`url(#${clip})`}>{children}</g>;
  // The night side: the disc minus itself nudged towards the light leaves a crescent of shade at the lower right.
  const shade = (opacity = 0.24) => (
    <path d={circlePath(12, 12, R) + circlePath(12 - R * 0.3, 12 - R * 0.3, R * 1.04)} fillRule="evenodd" fill="#0b1020" opacity={opacity} clipPath={`url(#${clip})`} />
  );
  const disc = (fill: string) => <circle cx="12" cy="12" r={R} fill={fill} />;
  const svg = (children: React.ReactNode) => (
    <svg viewBox="0 0 24 24" {...box} role="img" aria-label={label}>
      <defs>
        <clipPath id={clip}>
          <circle cx="12" cy="12" r={R} />
        </clipPath>
      </defs>
      {children}
    </svg>
  );
  switch (id) {
    case "mercury":
      return svg(
        <>
          {disc(PLANET_STYLE.mercury.base)}
          {clipped(
            <g fill="#8d877f">
              <circle cx="10" cy="10" r="1.3" />
              <circle cx="14.3" cy="13.4" r="1.6" />
              <circle cx="9.6" cy="15" r="0.9" />
              <circle cx="14.6" cy="8.7" r="0.8" />
              <circle cx="12.2" cy="12.3" r="0.5" />
            </g>,
          )}
          {shade()}
        </>,
      );
    case "venus":
      return svg(
        <>
          {disc(PLANET_STYLE.venus.base)}
          {clipped(
            <>
              <path d="M3 8.5c3-1.4 6.5-.4 9.5-.9s5.5-1.2 8.5-.2v2.2c-3-.8-5.6.1-8.6.5s-6.4-.5-9.4.6z" fill="#e0c88e" />
              <path d="M3 11c3-.6 6 .3 9 0s5.8-.8 9 0v1c-3-.5-6 .2-9 .5s-6-.5-9 0z" fill="#f8edd0" />
              <path d="M3 13.2c3.2-1 6.4.2 9.6-.3s5.6-1 8.4 0v2c-2.8-.7-5.4.2-8.4.5s-6.6-.6-9.6.4z" fill="#e0c88e" />
            </>,
          )}
          {shade(0.2)}
        </>,
      );
    case "earth":
      return svg(
        <>
          {disc("#3a7bd5")}
          {clipped(
            <>
              {/* Africa (the Sahara sand-coloured), Europe's edge, Arabia and Madagascar; Antarctica below */}
              <g transform="translate(1.9 1.6) scale(0.84)">
                <path d="M5.6 5.2c1.7-.7 3.6-.9 5.4-.7 1.2.1 2.3.4 3.2.9l-.4.9c-1.3-.3-2.7-.4-4-.3-1.4.1-2.8.4-4 .9z" fill="#5ba84c" />
                <path d="M8.2 6.3C9.8 5.9 12.4 5.8 13.9 6.4l.5 1c.7 1.4 1.2 2.4 2 3-.2 1-1 1.9-1.4 3-.4 1.5-1.4 3.4-2.7 4.7-.6.2-1-.5-1.2-1.3-.4-1.6-.5-3.2-1.1-4.4-.5-.8-1.4-1-2.4-1.3-1.1-.4-1.8-1.5-1.7-2.5.3-1.2 1.2-2 2.3-2.3z" fill="#5ba84c" />
                <path d="M8.2 6.3C9.8 5.9 12.4 5.8 13.9 6.4l.5 1c.4.8.8 1.5 1.2 2.1-1.7.5-3.7.5-5.5.2-1.3-.2-2.5-.2-3.5.2-.5-.6-.8-1.4-.7-2.1.3-1.1 1.3-1.8 2.3-2.1z" fill="#dcb873" />
                <path d="M14.9 6.6c1.3.1 2.7.8 3.5 1.8-.6 1-1.5 1.5-2.2 1.6-.6-1-1-2.2-1.3-3.4z" fill="#dcb873" />
                <ellipse cx="16.3" cy="15.1" rx="0.45" ry="1.15" transform="rotate(20 16.3 15.1)" fill="#5ba84c" />
              </g>
              <ellipse cx="12" cy="20.9" rx="5.4" ry="1.8" fill="#f4f8ff" />
            </>,
          )}
          {shade()}
        </>,
      );
    case "moon":
      return svg(
        <>
          {disc("#d6d1c6")}
          {clipped(
            <>
              {/* the dark "seas" of the near side, and a few bright craters */}
              <g fill="#b1ab9f">
                <ellipse cx="9.3" cy="9.4" rx="2.7" ry="2.1" />
                <ellipse cx="13.6" cy="10.2" rx="1.9" ry="1.5" />
                <ellipse cx="12.2" cy="14.4" rx="2.4" ry="1.6" />
                <circle cx="7.6" cy="13.4" r="1.1" />
              </g>
              <g fill="#e6e2d9">
                <circle cx="13.6" cy="17.4" r="0.8" />
                <circle cx="8.9" cy="16.9" r="0.55" />
              </g>
            </>,
          )}
          {shade(0.22)}
        </>,
      );
    case "mars":
      return svg(
        <>
          {disc(PLANET_STYLE.mars.base)}
          {clipped(
            <>
              {/* Syrtis Major, the southern dark belt and Acidalia; the white north polar cap */}
              <g fill="#a9472a">
                <path d="M3.6 12.9c2.2-.9 4.4-.6 6.4.2 1.8.7 3.8 1 5.8.6 1.6-.3 3-.2 4.4.3l-.2 1.7c-1.6-.2-3.2 0-4.8.3-2.2.4-4.3.2-6.3-.6-1.8-.7-3.6-.8-5.4-.3z" />
                <path d="M11 7.6c.9.6 1.4 1.7 1.6 2.9.2 1.3.9 2.3 1.9 2.9-.6.6-1.7.6-2.6.2-1.2-.6-1.6-1.9-1.8-3.1-.2-1.1-.1-2.1.9-2.9z" />
                <path d="M5.4 8c1.2-.5 2.6-.4 3.6.3-.6.8-1.8 1.1-2.9.9-.5-.1-.9-.6-.7-1.2z" />
              </g>
              <ellipse cx="12" cy="4.1" rx="4.2" ry="1.8" fill="#fff6ef" />
              <ellipse cx="12" cy="20.4" rx="2.4" ry="0.8" fill="#fff6ef" opacity="0.7" />
            </>,
          )}
          {shade()}
        </>,
      );
    case "jupiter":
      return svg(
        <>
          {disc(PLANET_STYLE.jupiter.base)}
          {clipped(
            <>
              {/* polar regions, the belts (brown) and zones (cream), the Great Red Spot and a white oval */}
              <rect x="2" y="2" width="20" height="3.6" fill="#cdb48f" />
              <rect x="2" y="18.4" width="20" height="4" fill="#cdb48f" />
              <rect x="2" y="6.2" width="20" height="0.8" fill="#c39a6d" />
              <rect x="2" y="8.3" width="20" height="2.1" fill="#c0814f" />
              <rect x="2" y="10.4" width="20" height="2.4" fill="#f6ead2" />
              <rect x="2" y="12.9" width="20" height="2" fill="#c58a58" />
              <rect x="2" y="16.6" width="20" height="0.8" fill="#c9a079" />
              <ellipse cx="15.1" cy="15.7" rx="2.7" ry="1.55" fill="#f3e2c4" />
              <ellipse cx="15.1" cy="15.7" rx="2.05" ry="1.1" fill="#d2603d" />
              <ellipse cx="8.3" cy="17.6" rx="0.75" ry="0.38" fill="#fffaf0" />
            </>,
          )}
          {shade(0.22)}
        </>,
      );
    case "saturn":
      return svg(
        <>
          {/* the rings behind the globe, the globe, then the rings' near side in front */}
          <ellipse cx="12" cy="12" rx="11" ry="3.4" transform="rotate(-16 12 12)" fill="none" stroke="#d9bf86" strokeWidth="1.3" />
          <ellipse cx="12" cy="12" rx="9.2" ry="2.85" transform="rotate(-16 12 12)" fill="none" stroke="#c4a76f" strokeWidth="1.1" />
          {disc(PLANET_STYLE.saturn.base)}
          {clipped(
            <>
              <rect x="4" y="9.6" width="16" height="1.1" fill="#d7b778" />
              <rect x="4" y="12.6" width="16" height="0.9" fill="#d9bd85" />
              <rect x="4" y="14.4" width="16" height="0.7" fill="#cfb07a" />
            </>,
          )}
          {shade(0.22)}
          <path d="M1.427 15.032 A11 3.4 -16 0 0 22.573 8.968" fill="none" stroke="#ecd6a2" strokeWidth="1.3" />
          <path d="M3.156 14.536 A9.2 2.85 -16 0 0 20.844 9.464" fill="none" stroke="#d2b67d" strokeWidth="1.1" />
        </>,
      );
    case "uranus":
      return svg(
        <>
          {/* Uranus is tipped on its side: its faint rings stand almost upright */}
          <ellipse cx="12" cy="12" rx="2.6" ry="10.6" transform="rotate(8 12 12)" fill="none" stroke="#cfeff1" strokeWidth="0.8" opacity="0.8" />
          {disc(PLANET_STYLE.uranus.base)}
          {clipped(<circle cx="10.4" cy="10.6" r="3.2" fill="#bdeef1" />)}
          {shade(0.22)}
          <path d="M13.475 1.503 A2.6 10.6 8 0 1 10.525 22.497" fill="none" stroke="#e6f8f9" strokeWidth="0.8" />
        </>,
      );
    case "neptune":
      return svg(
        <>
          {disc(PLANET_STYLE.neptune.base)}
          {clipped(
            <>
              <rect x="3" y="8.8" width="18" height="1.2" fill="#5b84ea" />
              <rect x="3" y="15.8" width="18" height="1.4" fill="#3e64cf" />
              {/* the Great Dark Spot, its bright companion cloud and high white streaks */}
              <ellipse cx="10.3" cy="13.2" rx="1.8" ry="1" fill="#26408f" />
              <g fill="none" stroke="#fff" strokeLinecap="round">
                <path d="M12.6 9.3c1.4-.45 3-.4 4.3.15" strokeWidth="0.75" />
                <path d="M8.7 14.75c1.2.35 2.6.3 3.6-.2" strokeWidth="0.6" />
              </g>
              <ellipse cx="14.4" cy="16.4" rx="0.6" ry="0.3" fill="#fff" />
            </>,
          )}
          {shade()}
        </>,
      );
    case "sun":
      return svg(
        <>
          {/* short flat rays (a see-through glow turns muddy on a dark background) */}
          <g stroke="#ffcf4d" strokeWidth="1" strokeLinecap="round">
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i * Math.PI) / 6;
              return <line key={i} x1={12 + Math.cos(a) * 10.3} y1={12 + Math.sin(a) * 10.3} x2={12 + Math.cos(a) * 11.6} y2={12 + Math.sin(a) * 11.6} />;
            })}
          </g>
          {disc("#ffc23a")}
          <circle cx="11.2" cy="11.2" r={R * 0.72} fill="#ffd866" />
        </>,
      );
    default:
      return svg(
        <>
          {disc("#a9a39b")}
          {shade()}
        </>,
      );
  }
}

export const PLANET_IDS = Object.keys(PLANET_STYLE);
