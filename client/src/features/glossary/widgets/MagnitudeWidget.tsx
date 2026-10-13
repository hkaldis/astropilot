import { useState } from "react";
import { LabeledSlider, Readout, SKY } from "./kit";
import { cn } from "@/lib/utils";

const MARKS: { mag: number; label: string; note?: string }[] = [
  { mag: -4.6, label: "Venus", note: "the brightest planet" },
  { mag: -2.5, label: "Jupiter" },
  { mag: -1.5, label: "Sirius", note: "the brightest star" },
  { mag: 0, label: "Vega" },
  { mag: 2, label: "Polaris" },
  { mag: 4, label: "City limit", note: "faintest stars from a city" },
  { mag: 6.5, label: "Dark-sky eye", note: "faintest stars from a dark site" },
  { mag: 9.5, label: "Binoculars", note: "10×50 under a dark sky" },
  { mag: 14, label: '8″ telescope' },
  { mag: 15.6, label: '16″ telescope' },
];
const MIN = -5;
const MAX = 16;

/** How many times brighter (positive) or fainter one magnitude is than another. */
const ratio = (a: number, b: number) => Math.pow(10, 0.4 * (b - a));

function times(x: number): string {
  if (x >= 1e6) return `${(x / 1e6).toFixed(x >= 1e7 ? 0 : 1)} million`;
  if (x >= 1000) return `${Math.round(x).toLocaleString()}`;
  return x >= 10 ? `${Math.round(x)}` : x.toFixed(1);
}

export default function MagnitudeWidget() {
  const [mag, setMag] = useState(2);
  const vs = ratio(mag, 0);
  const visible = mag <= 6.5 ? "the naked eye under a dark sky" : mag <= 9.5 ? "binoculars" : mag <= 14 ? "an 8-inch telescope" : mag <= 15.6 ? "a 16-inch telescope" : "a large telescope or a camera";
  // Star size and glow fall off with brightness, like a sky chart's.
  const r = Math.max(1.2, 22 * Math.pow(10, -0.11 * (mag - MIN)));
  const glow = Math.max(0, Math.min(1, (4 - mag) / 9));
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <div className={cn("relative grid aspect-square place-items-center overflow-hidden rounded-xl border", SKY)} aria-hidden="true">
          <div className="absolute rounded-full bg-white" style={{ width: r * 2, height: r * 2, boxShadow: `0 0 ${8 + glow * 40}px ${glow * 14}px rgba(200,220,255,${0.25 + glow * 0.5})`, opacity: Math.max(0.25, Math.min(1, 1.15 - mag / 18)) }} />
        </div>
        <div className="flex flex-col gap-4">
          <LabeledSlider label="Magnitude" value={mag} min={MIN} max={MAX} step={0.1} onChange={setMag} display={mag.toFixed(1)} hint="Smaller numbers are brighter; each step is 2.512× fainter." />
          <div className="grid grid-cols-2 gap-3">
            <Readout value={vs >= 1 ? `${times(vs)}× fainter` : `${times(1 / vs)}× brighter`} label="than Vega (mag 0)" />
            <Readout value={visible} label="reaches it" size="sm" />
          </div>
        </div>
      </div>
      {/* The scale, with familiar landmarks to tap. */}
      <div className="relative pt-1">
        <div className="relative h-2 rounded-full bg-gradient-to-r from-white via-sky-300/60 to-sky-950" />
        <div className="relative mt-1 h-24">
          {MARKS.map((m, i) => {
            const x = ((m.mag - MIN) / (MAX - MIN)) * 100;
            const active = Math.abs(m.mag - mag) < 0.05;
            return (
              <button
                key={m.label}
                type="button"
                onClick={() => setMag(m.mag)}
                className={cn(
                  "absolute flex flex-col text-[11px] leading-tight transition-colors",
                  // Keep the end labels inside the box.
                  x < 8 ? "items-start" : x > 88 ? "-translate-x-full items-end" : "-translate-x-1/2 items-center",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
                style={{ left: `${x}%`, top: i % 2 ? 44 : 0 }}
                title={m.note}
              >
                <span className={cn("mb-0.5 h-3 w-px", active ? "bg-primary" : "bg-border")} />
                <span className="whitespace-nowrap">{m.label}</span>
                <span className="num">{m.mag}</span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Five magnitudes are exactly 100× in brightness: a magnitude 6.5 star is 100× fainter than a 1.5 one. Tap a landmark to compare.
      </p>
    </div>
  );
}
