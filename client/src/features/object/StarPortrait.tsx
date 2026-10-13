import { useId, useMemo } from "react";
import { bvTemperature, colourWord, starRgb } from "@shared/starColor";
import { cn } from "@/lib/utils";

/**
 * A star painted in its own colour (from its B−V index): a glowing point with soft diffraction spikes on a dark
 * field. Stars have no photograph worth showing — on survey plates a bright star is an overexposed blob — but their
 * colour is real, and it's what the eye looks for.
 */
export function StarArt({ bv, mag = 2, seed = 1, className, twinkle = true }: { bv?: number; mag?: number; seed?: number; className?: string; twinkle?: boolean }) {
  const uid = useId().replace(/:/g, "");
  const [r, g, b] = starRgb(bv);
  const rgb = `rgb(${r},${g},${b})`;
  // Brighter stars glow larger, within reason.
  const core = Math.max(9, Math.min(17, 15 - mag * 1.2));
  const field = useMemo(() => {
    let s = seed * 9301 + 49297;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: 46 }, () => ({ x: rnd() * 200, y: rnd() * 200, r: 0.3 + rnd() * 0.8, o: 0.15 + rnd() * 0.45 }));
  }, [seed]);
  return (
    <svg viewBox="0 0 200 200" className={cn("block h-full w-full", className)} aria-hidden="true">
      <defs>
        <radialGradient id={`${uid}glow`}>
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.12" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="0.3" stopColor={rgb} stopOpacity="0.85" />
          <stop offset="0.62" stopColor={rgb} stopOpacity="0.22" />
          <stop offset="1" stopColor={rgb} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}spikeH`} x1="0" x2="1">
          <stop offset="0" stopColor={rgb} stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor={rgb} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${uid}spikeV`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={rgb} stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor={rgb} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="200" height="200" fill="#04060b" />
      {field.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p.r} fill="#dfe7ff" opacity={p.o} />
      ))}
      <g className={twinkle ? "star-twinkle" : undefined} style={{ transformOrigin: "100px 100px" }}>
        <circle cx="100" cy="100" r={core * 4.2} fill={`url(#${uid}glow)`} />
        <rect x={100 - core * 5} y={99.2} width={core * 10} height={1.6} fill={`url(#${uid}spikeH)`} />
        <rect x={99.2} y={100 - core * 5} width={1.6} height={core * 10} fill={`url(#${uid}spikeV)`} />
        <circle cx="100" cy="100" r={core * 0.42} fill="#fff" />
      </g>
    </svg>
  );
}

/** The object page's picture for a star: its colour, with what the colour means. */
export function StarPortrait({ name, bv, sp, mag, className }: { name: string; bv?: number; sp?: string; mag?: number; className?: string }) {
  const word = colourWord(bv);
  const temp = bv !== undefined ? Math.round(bvTemperature(bv) / 100) * 100 : null;
  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <div className="relative aspect-square overflow-hidden rounded-2xl border bg-black">
        <StarArt bv={bv} mag={mag} seed={name.length * 7 + name.charCodeAt(0)} />
        {word && <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/85">{word}</span>}
      </div>
      <figcaption className="text-2xs leading-relaxed text-muted-foreground">
        {name} painted in its true colour{word ? ` — ${word}` : ""}
        {temp ? `, a surface near ${temp.toLocaleString("en-US")} K` : ""}
        {sp ? ` (spectral type ${sp})` : ""}. Through a telescope a star stays a point of light at any power; its colour is the thing to look for.
      </figcaption>
    </figure>
  );
}
