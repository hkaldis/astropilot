import { useState } from "react";
import { LabeledSlider, Readout, SKY } from "./kit";
import { cn } from "@/lib/utils";

/** The view is 8″ wide. */
const SPAN = 8;

export default function ResolutionWidget() {
  const [aperture, setAperture] = useState(150);
  const [logSep, setLogSep] = useState(Math.log10(1.2));
  const sep = Math.pow(10, logSep);
  const dawes = 116 / aperture;
  const airy = 138 / aperture; // radius of the first dark ring, arcsec (550 nm)
  const k = 200 / SPAN;
  const verdict = sep >= dawes * 1.25 ? "Cleanly split" : sep >= dawes ? "Just split: a notch between them" : sep >= dawes * 0.7 ? "Elongated: one star, stretched" : "Not split: looks single";
  const tone = sep >= dawes * 1.25 ? "good" : sep >= dawes ? "fair" : "poor";
  return (
    <div className="flex flex-col gap-4">
      <div className={cn("overflow-hidden rounded-xl border", SKY)}>
        <svg viewBox="0 0 200 90" className="block h-auto w-full" role="img" aria-label={`Two equal stars ${sep.toFixed(2)}″ apart through a ${aperture} mm telescope: ${verdict}`}>
          <defs>
            <radialGradient id="airy">
              <stop offset="0" stopColor="#fff" stopOpacity="1" />
              <stop offset="0.35" stopColor="#fff" stopOpacity="0.75" />
              <stop offset="0.7" stopColor="#fff" stopOpacity="0.12" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g style={{ mixBlendMode: "screen" }}>
            {[-1, 1].map((s) => (
              <g key={s}>
                <circle cx={100 + (s * sep * k) / 2} cy={45} r={airy * k * 1.65} fill="none" stroke="#fff" strokeOpacity="0.14" strokeWidth={Math.max(0.6, airy * k * 0.35)} />
                <circle cx={100 + (s * sep * k) / 2} cy={45} r={airy * k} fill="url(#airy)" />
              </g>
            ))}
          </g>
          <line x1="10" y1="82" x2={10 + k} y2="82" stroke="#8a95aa" />
          <text x={12 + k} y="84.5" className="fill-white/50 text-[6px]">
            1″
          </text>
        </svg>
      </div>
      <LabeledSlider label="Aperture" value={aperture} min={50} max={500} step={5} onChange={setAperture} display={`${aperture} mm (${(aperture / 25.4).toFixed(1)}″)`} />
      <LabeledSlider label="Separation of the pair" value={logSep} min={Math.log10(0.2)} max={Math.log10(6)} step={0.01} onChange={setLogSep} display={`${sep.toFixed(sep < 1 ? 2 : 1)}″`} />
      <div className="grid grid-cols-2 gap-3">
        <Readout value={`${dawes.toFixed(2)}″`} label="Dawes limit (116 ÷ mm)" />
        <Readout value={verdict} label="two equal stars" tone={tone} size="sm" />
      </div>
      <p className="text-sm text-muted-foreground">
        Each star is a tiny Airy disk with a faint ring; bigger apertures make smaller disks.
        {dawes < 1 ? " In practice the air rarely lets you split pairs much closer than about 1″, whatever the telescope." : ""} Unequal pairs are harder than equal ones.
      </p>
    </div>
  );
}
