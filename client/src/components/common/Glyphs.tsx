import { useId } from "react";
import { cn } from "@/lib/utils";

/** AstroPilot mark: a crescent orbit with a guiding star. */
export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  const gid = `ap-g-${useId().replace(/:/g, "")}`;
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: "hsl(var(--primary))" }} />
            <stop offset="1" style={{ stopColor: "hsl(var(--gold))" }} />
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="14.5" fill="none" stroke={`url(#${gid})`} strokeWidth="1.5" opacity="0.9" />
        <path d="M9 22.5c3.8-1.2 9.5-5.4 13.4-12.2" fill="none" stroke={`url(#${gid})`} strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="22.6" cy="9.6" r="2.3" fill="hsl(var(--gold))" />
        <circle cx="10.5" cy="11" r="0.9" fill="hsl(var(--foreground))" opacity="0.8" />
        <circle cx="20.5" cy="21.5" r="0.7" fill="hsl(var(--foreground))" opacity="0.6" />
      </svg>
      {withText && (
        <span className="font-display text-[1.35rem] leading-none tracking-tight">
          Astro<span className="italic text-primary">Pilot</span>
        </span>
      )}
    </span>
  );
}

/** Small schematic icon per object type (drawn, not emoji). */
export function TypeGlyph({ type, className }: { type: string; className?: string }) {
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
 * the lit side is on the right while waxing (northern-hemisphere view).
 */
export function MoonGlyph({ elongation, size = 44, className }: { elongation: number; size?: number; className?: string }) {
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
    <svg viewBox="0 0 44 44" width={size} height={size} className={className} aria-label={`Moon ${Math.round(frac * 100)}% illuminated`} role="img">
      <circle cx="22" cy="22" r={r} style={{ fill: "hsl(var(--sky-night))" }} />
      {frac > 0.01 && <path d={d} fill="#efe6cf" />}
      <circle cx="22" cy="22" r={r} fill="none" style={{ stroke: "hsl(var(--foreground) / 0.18)" }} strokeWidth="1" />
    </svg>
  );
}
