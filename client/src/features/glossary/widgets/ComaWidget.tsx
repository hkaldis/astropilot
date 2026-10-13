import { useState } from "react";
import { comaArcsec } from "@shared/astro";
import { useActiveScope } from "@/hooks/useScope";
import { Chips, LabeledSlider, Readout, SKY } from "./kit";
import { cn } from "@/lib/utils";

const FIELD = 70; // true field, arcmin (a wide eyepiece at low power on a big Dobsonian)
const GAIN = 0.9; // drawing scale: px of smear per arcsecond — exaggerated so the pattern shows

/** Stars across the field in rings, so the growth of coma from the centre is plain to see. */
const STARS = (() => {
  const out: { r: number; a: number }[] = [{ r: 0, a: 0 }];
  for (const [r, n] of [
    [0.25, 6],
    [0.5, 10],
    [0.75, 14],
    [0.95, 18],
  ] as const)
    for (let i = 0; i < n; i++) out.push({ r, a: (i / n) * Math.PI * 2 + r * 1.7 });
  return out;
})();

export default function ComaWidget() {
  const active = useActiveScope();
  const nativeF = active.kind === "telescope" ? active.scope.focalLength / (active.corrector?.factor ?? 1) / active.scope.aperture : 4.5;
  const [f, setF] = useState(Math.min(10, Math.max(3, Math.round(nativeF * 10) / 10)));
  const [corrected, setCorrected] = useState(false);
  const edge = comaArcsec(f, FIELD / 2);
  // Within this radius the smear stays under 1″ — about as sharp as the air allows.
  const sharp = (16 * f * f * (1 / 60)) / 3;
  const R = 92;
  return (
    <div className="grid gap-5 sm:grid-cols-[15rem_minmax(0,1fr)] sm:items-center">
      <svg viewBox="0 0 200 200" className={cn("w-full max-w-[15rem] justify-self-center rounded-full", SKY)} role="img" aria-label={`A ${FIELD}′ eyepiece field at f/${f.toFixed(1)}${corrected ? " with a coma corrector" : ""}`}>
        <defs>
          <radialGradient id="coma-star" cx="0.5" cy="0.25" r="0.75">
            <stop offset="0" stopColor="#fff" stopOpacity="1" />
            <stop offset="0.25" stopColor="#fff" stopOpacity="0.7" />
            <stop offset="1" stopColor="#c8d6ff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r={R} fill="none" stroke="#2c3546" strokeWidth="1.5" />
        {STARS.map((s, i) => {
          const x = 100 + Math.cos(s.a) * s.r * R;
          const y = 100 + Math.sin(s.a) * s.r * R;
          const len = corrected ? 0 : comaArcsec(f, s.r * (FIELD / 2)) * GAIN;
          // Rotate so the local +y axis points straight out from the centre: coma flares outward.
          const deg = (s.a * 180) / Math.PI - 90;
          // A coma flare: a bright head with a fan pointing away from the centre.
          return (
            <g key={i} transform={`translate(${x} ${y}) rotate(${deg})`}>
              {len > 0.6 && <ellipse cx="0" cy={len * 0.55} rx={0.9 + len * 0.28} ry={len * 0.75} fill="url(#coma-star)" opacity="0.8" />}
              <circle r="1.5" fill="#fff" />
            </g>
          );
        })}
      </svg>
      <div className="flex flex-col gap-4">
        <LabeledSlider label="Focal ratio of the mirror" value={f} min={3} max={10} step={0.1} onChange={setF} display={`f/${f.toFixed(1)}`} hint={active.kind === "telescope" ? `Your ${active.scope.name} is f/${nativeF.toFixed(1)}.` : "Fast Dobsonians are f/4–f/5; slow ones f/6–f/8."} />
        <Chips label="Coma corrector" value={corrected ? "on" : "off"} onChange={(v) => setCorrected(v === "on")} options={[{ v: "off", label: "No corrector" }, { v: "on", label: "With a coma corrector" }]} />
        <div className="grid grid-cols-2 gap-3">
          <Readout value={corrected ? "≈ 0″" : `${edge.toFixed(1)}″`} label={`smear at the edge of a ${FIELD}′ field`} tone={corrected || edge < 3 ? "good" : edge < 8 ? "fair" : "poor"} />
          <Readout value={corrected ? "whole field" : `${sharp.toFixed(1)}′`} label="sharp out to (blur under 1″)" />
        </div>
        <p className="text-sm text-muted-foreground">
          Stars are pinpoints at the centre and flare outward towards the edge; the smear grows straight out from the centre and with 1/f². The drawing exaggerates
          it so the pattern shows — the numbers are real.
        </p>
      </div>
    </div>
  );
}
