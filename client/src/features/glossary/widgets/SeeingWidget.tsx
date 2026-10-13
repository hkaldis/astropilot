import { useState } from "react";
import { cn } from "@/lib/utils";
import { LabeledSlider, Readout, SKY } from "./kit";

const WORDS = ["", "Poor", "Below average", "Average", "Good", "Excellent"];
const ARCSEC = ["", "about 4″", "about 3″", "about 2″", "about 1.3″", "under 1″"];
const ADVICE = [
  "",
  "Stars boil into blobs at any power. Stick to low-power deep-sky objects.",
  "High power is soft and jumpy. Medium power for clusters and nebulae is fine.",
  "Jupiter's main belts are steady between wobbles; moments of clarity come and go.",
  "Planets hold fine detail; close double stars split cleanly.",
  "Rare and precious: push the magnification, hunt planetary detail and the tightest doubles.",
];

/** Jupiter, simply drawn: belts, zones and the Great Red Spot. */
function Jupiter() {
  return (
    <svg viewBox="0 0 100 94" className="h-full w-full">
      <defs>
        <clipPath id="jup-clip">
          <ellipse cx="50" cy="47" rx="44" ry="41" />
        </clipPath>
        <radialGradient id="jup-limb" cx="0.45" cy="0.45" r="0.6">
          <stop offset="0.65" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.45" />
        </radialGradient>
      </defs>
      <g clipPath="url(#jup-clip)">
        <rect width="100" height="94" fill="#e8dcc4" />
        <rect y="22" width="100" height="9" fill="#b98b62" />
        <rect y="33" width="100" height="3" fill="#cfae88" />
        <rect y="52" width="100" height="10" fill="#a8774f" />
        <rect y="66" width="100" height="3" fill="#c79f78" />
        <rect y="13" width="100" height="3" fill="#cdb79a" />
        <ellipse cx="62" cy="64" rx="7" ry="3.6" fill="#c0603f" />
        <path d="M10 37 q8 3 16 0 t16 0 t16 0 t16 0 t16 0" stroke="#9b6c48" strokeWidth="1.2" fill="none" />
        <rect width="100" height="94" fill="url(#jup-limb)" />
      </g>
    </svg>
  );
}

export default function SeeingWidget() {
  const [s, setS] = useState(2);
  const bad = 5 - s; // 0 … 4
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <figure className={cn("relative grid aspect-square place-items-center overflow-hidden rounded-xl border", SKY)}>
          <div className={cn(bad > 0 && "seeing-boil")} style={{ ["--j" as string]: bad * 2.2, filter: `blur(${bad * 1.3}px)` }}>
            <div className="h-[7.5rem] w-32 sm:h-36 sm:w-40">
              <Jupiter />
            </div>
          </div>
          <figcaption className="absolute bottom-1.5 left-2 text-[11px] text-white/60">Jupiter at 200×</figcaption>
        </figure>
        <figure className={cn("relative grid aspect-square place-items-center overflow-hidden rounded-xl border", SKY)}>
          <div className={cn(bad > 0 && "seeing-boil")} style={{ ["--j" as string]: bad * 3, filter: `blur(${bad * 1.1}px)` }}>
            {/* A steady star at high power: the Airy disk and its first ring. */}
            <div className="relative grid h-24 w-24 place-items-center">
              <div className="absolute h-10 w-10 rounded-full border border-white/25" style={{ opacity: Math.max(0, 1 - bad * 0.4) }} />
              <div className="h-3 w-3 rounded-full bg-white shadow-[0_0_6px_2px_rgba(255,255,255,0.6)]" />
            </div>
          </div>
          <figcaption className="absolute bottom-1.5 left-2 text-[11px] text-white/60">A star at 300×</figcaption>
        </figure>
      </div>
      <LabeledSlider label="Seeing" value={s} min={1} max={5} onChange={setS} display={`${s} · ${WORDS[s]}`} hint="AstroPilot's 1–5 scale, as on Tonight's hour-by-hour forecast." />
      <div className="grid grid-cols-2 gap-3">
        <Readout value={ARCSEC[s]} label="star blur (FWHM)" tone={s >= 4 ? "good" : s <= 2 ? "poor" : "fair"} />
        <Readout value={s >= 4 ? "Planets, doubles" : s === 3 ? "Most things" : "Deep sky"} label="best for" size="sm" />
      </div>
      <p className="text-sm text-muted-foreground">{ADVICE[s]}</p>
    </div>
  );
}
