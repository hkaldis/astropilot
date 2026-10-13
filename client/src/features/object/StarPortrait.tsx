import { useCallback, useId, useMemo, useState } from "react";
import { Maximize2 } from "lucide-react";
import { Lightbox } from "@/components/common/Lightbox";
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
  const [full, setFull] = useState(false);
  const closeFull = useCallback(() => setFull(false), []);
  const seed = name.length * 7 + name.charCodeAt(0);
  const caption = (
    <>
      {name} painted in its true colour{word ? ` — ${word}` : ""}
      {temp ? `, a surface near ${temp.toLocaleString("en-US")} K` : ""}
      {sp ? ` (spectral type ${sp})` : ""}. Through a telescope a star stays a point of light at any power; its colour is the thing to look for.
    </>
  );
  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <button
        type="button"
        onClick={() => setFull(true)}
        className="group relative block aspect-square cursor-zoom-in overflow-hidden rounded-2xl border bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`View ${name} full screen`}
      >
        <StarArt bv={bv} mag={mag} seed={seed} />
        {word && <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/85">{word}</span>}
        <span className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white/90 backdrop-blur-sm transition-transform group-hover:scale-110" aria-hidden="true">
          <Maximize2 className="h-4 w-4" />
        </span>
      </button>
      <figcaption className="text-2xs leading-relaxed text-muted-foreground">{caption}</figcaption>
      <Lightbox open={full} onClose={closeFull} title={name} caption={caption}>
        <div className="aspect-square h-auto max-h-[calc(100dvh-9rem)] w-full max-w-[calc(100dvh-9rem)]">
          <StarArt bv={bv} mag={mag} seed={seed} />
        </div>
      </Lightbox>
    </figure>
  );
}
