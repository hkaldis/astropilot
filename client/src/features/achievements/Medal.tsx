/** Achievement medals (tier ring, family glyph, progress arc) and the observer-rank emblem. */
import { useId, type CSSProperties, type ReactNode } from "react";
import {
  Binoculars,
  Building2,
  Camera,
  CalendarDays,
  CalendarRange,
  Compass,
  Crosshair,
  Eye,
  Flag,
  Flame,
  Flower2,
  Gem,
  Hourglass,
  Leaf,
  Mountain,
  NotebookPen,
  Orbit,
  Repeat,
  Snowflake,
  Sparkles,
  Sun,
  Timer,
} from "lucide-react";
import type { AchievementTier } from "@shared/api";
import { MoonGlyph, PlanetGlyph, TypeGlyph } from "@/components/common/Glyphs";
import { cn } from "@/lib/utils";

export const TIER_STYLE: Record<AchievementTier, { label: string; color: string; deep: string }> = {
  bronze: { label: "Bronze", color: "#c98d5b", deep: "#7a4b28" },
  silver: { label: "Silver", color: "#c3ccd6", deep: "#5d6874" },
  gold: { label: "Gold", color: "#e8c25c", deep: "#8a6a17" },
  platinum: { label: "Platinum", color: "#a6e6ef", deep: "#3b7f8a" },
};

function ConstellationGlyph({ className }: { className?: string }) {
  const pts: [number, number][] = [
    [4, 17],
    [8, 9],
    [13, 12],
    [17, 5],
    [20, 15],
  ];
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="currentColor" strokeWidth="1.1" opacity="0.6" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === 3 ? 1.9 : 1.4} fill="currentColor" />
      ))}
    </svg>
  );
}

function EclipseGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8" fill="#9a3b2a" />
      <circle cx="12" cy="12" r="8" fill="none" stroke="#e08a5a" strokeWidth="1.2" />
      <circle cx="14.5" cy="10.5" r="6.5" fill="hsl(var(--background))" opacity="0.45" />
    </svg>
  );
}

function HorizonGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M2 17h20" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M6 17a6 6 0 0 1 12 0" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="1.5 2" opacity="0.7" />
      <circle cx="16.5" cy="13.6" r="1.6" fill="currentColor" />
    </svg>
  );
}

/** The glyph inside a family's medal. */
export function familyGlyph(id: string, size = "h-5 w-5"): ReactNode {
  const c = size;
  const letter = (s: string) => <span className="font-display text-[1.05rem] font-semibold leading-none">{s}</span>;
  switch (id) {
    case "messier":
      return letter("M");
    case "caldwell":
      return letter("C");
    case "showpieces":
      return <Gem className={c} />;
    case "solar":
      return <PlanetGlyph id="saturn" className="h-7 w-7" />;
    case "doubles":
      return <TypeGlyph type="double_star" className={c} />;
    case "constellations":
      return <ConstellationGlyph className={c} />;
    case "winter":
      return <Snowflake className={c} />;
    case "spring":
      return <Flower2 className={c} />;
    case "summer":
      return <Sun className={c} />;
    case "autumn":
      return <Leaf className={c} />;
    case "southern":
      return <Compass className={c} />;
    case "galaxies":
      return <TypeGlyph type="galaxy" className={c} />;
    case "nebulae":
      return <TypeGlyph type="emission_nebula" className={c} />;
    case "planetaries":
      return <TypeGlyph type="planetary_nebula" className={c} />;
    case "globulars":
      return <TypeGlyph type="globular_cluster" className={c} />;
    case "openclusters":
      return <TypeGlyph type="open_cluster" className={c} />;
    case "first-light":
      return <Sparkles className={c} />;
    case "marathon":
      return <Timer className={c} />;
    case "messier-marathon":
      return <Flag className={c} />;
    case "night-owl":
      return <Hourglass className={c} />;
    case "lunar-cycle":
      return <MoonGlyph elongation={110} size={22} />;
    case "opposition":
      return <Orbit className={c} />;
    case "eclipse":
      return <EclipseGlyph className="h-6 w-6" />;
    case "dark-sky":
      return <Mountain className={c} />;
    case "city-lights":
      return <Building2 className={c} />;
    case "tight-double":
      return <Crosshair className={c} />;
    case "faint":
      return <Eye className={c} />;
    case "horizon":
      return <HorizonGlyph className={c} />;
    case "binoculars":
      return <Binoculars className={c} />;
    case "nights":
      return <CalendarDays className={c} />;
    case "months":
      return <CalendarRange className={c} />;
    case "clear-spell":
      return <Flame className={c} />;
    case "seasons":
      return <Repeat className={c} />;
    case "field-notes":
      return <NotebookPen className={c} />;
    case "photographer":
      return <Camera className={c} />;
    default:
      return <Sparkles className={c} />;
  }
}

/**
 * A medal: the tier it reached (none = locked), with an arc showing progress to the next tier.
 * Locked medals are monochrome; earned ones take their tier's metal. The arc sweeps up to its value,
 * and gold and platinum medals catch a passing glint (both wait for a `data-inview` container).
 */
export function Medal({
  family,
  tier,
  progress = 0,
  nextTier,
  size = 48,
  className,
  title,
  delay = 0,
}: {
  family: string;
  tier: AchievementTier | null;
  /** 0..1 towards the next tier (drawn as an arc). */
  progress?: number;
  nextTier?: AchievementTier | null;
  size?: number;
  className?: string;
  title?: string;
  /** ms before the arc and glint start (for staggered lists). */
  delay?: number;
}) {
  const gid = useId().replace(/:/g, "");
  const style = tier ? TIER_STYLE[tier] : null;
  const arcColor = nextTier ? TIER_STYLE[nextTier].color : style?.color;
  const r = 21;
  const p = Math.max(0, Math.min(1, progress));
  const shiny = tier === "gold" || tier === "platinum";
  return (
    <div className={cn("relative grid shrink-0 place-items-center", className)} style={{ width: size, height: size }} title={title} aria-hidden={title ? undefined : true}>
      <svg viewBox="0 0 48 48" className="absolute inset-0 h-full w-full">
        <defs>
          {style && (
            <radialGradient id={`m-${gid}`} cx="0.35" cy="0.3" r="0.8">
              <stop offset="0" style={{ stopColor: style.color, stopOpacity: 0.55 }} />
              <stop offset="0.65" style={{ stopColor: style.color, stopOpacity: 0.16 }} />
              <stop offset="1" style={{ stopColor: style.deep, stopOpacity: 0.25 }} />
            </radialGradient>
          )}
        </defs>
        {style ? (
          <>
            <circle cx="24" cy="24" r="17" fill={`url(#m-${gid})`} />
            <circle cx="24" cy="24" r="17" fill="none" stroke={style.color} strokeWidth="1.6" />
          </>
        ) : (
          <circle cx="24" cy="24" r="17" fill="none" stroke="hsl(var(--border))" strokeWidth="1.4" strokeDasharray="2.5 2.5" />
        )}
        {/* Track and arc towards the next tier. */}
        {nextTier && (
          <>
            <circle cx="24" cy="24" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="2" opacity="0.7" />
            {p > 0 && (
              <circle
                cx="24"
                cy="24"
                r={r}
                fill="none"
                stroke={arcColor}
                strokeWidth="2"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={`${p} 1`}
                transform="rotate(-90 24 24)"
                className="play-on-view animate-arc"
                style={{ "--arc": p, animationDelay: `${delay + 150}ms` } as CSSProperties}
              />
            )}
          </>
        )}
      </svg>
      <span className={cn("relative grid place-items-center", style ? "text-foreground" : "text-muted-foreground opacity-60 grayscale")} style={{ transform: `scale(${size / 48})` }}>
        {familyGlyph(family)}
      </span>
      {shiny && (
        <span className="pointer-events-none absolute inset-[15%] overflow-hidden rounded-full" aria-hidden="true">
          <span
            className="play-on-view absolute inset-y-0 left-1/4 w-1/2 animate-sheen bg-gradient-to-r from-transparent via-white/45 to-transparent opacity-0"
            style={{ animationDelay: `${delay + 600}ms` }}
          />
        </span>
      )}
    </div>
  );
}

/** The observer-rank emblem: a star with the level, ringed by progress to the next rank. */
export function RankEmblem({ level, progress, size = 96 }: { level: number; progress: number; size?: number }) {
  const gid = useId().replace(/:/g, "");
  const r = 44;
  const p = Math.max(0.001, Math.min(1, progress));
  const star = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? 30 : 13;
    return `${50 + rr * Math.cos(a)},${50 + rr * Math.sin(a)}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="shrink-0" aria-hidden="true">
      <defs>
        <radialGradient id={`r-${gid}`} cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" style={{ stopColor: "hsl(var(--gold))", stopOpacity: 0.95 }} />
          <stop offset="1" style={{ stopColor: "hsl(var(--gold))", stopOpacity: 0.35 }} />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="4"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={`${p} 1`}
        transform="rotate(-90 50 50)"
        className="animate-arc"
        style={{ "--arc": p, animationDuration: "1.4s", animationDelay: "0.2s" } as CSSProperties}
      />
      <circle cx="50" cy="50" r="36" fill="hsl(var(--primary) / 0.08)" />
      <polygon points={star} fill={`url(#r-${gid})`} stroke="hsl(var(--gold))" strokeWidth="1" strokeLinejoin="round" className="origin-box origin-center animate-pop" style={{ animationDelay: "0.35s" }} />
      <text x="50" y="56" textAnchor="middle" className="fill-background font-display" style={{ fontSize: 17, fontWeight: 700 }}>
        {level}
      </text>
    </svg>
  );
}
