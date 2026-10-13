import { useState } from "react";
import { cn } from "@/lib/utils";
import { LabeledSlider, Readout } from "./kit";
import { StarField } from "./StarField";

const STAGES = [
  { from: 0, to: -6, name: "Civil twilight", sees: "Bright planets and the brightest stars appear; you can still read outside." },
  { from: -6, to: -12, name: "Nautical twilight", sees: "The horizon fades; the main constellation stars are out. Fine for the Moon, planets and double stars." },
  { from: -12, to: -18, name: "Astronomical twilight", sees: "Nearly dark to the eye, but the faintest galaxies and nebulae still suffer." },
  { from: -18, to: -90, name: "Astronomical night", sees: "As dark as the sky gets: the time for faint deep-sky objects." },
];

/** Sky colours at the zenith and the horizon for a Sun altitude, blended between key points. */
const KEYS: [number, [number, number, number], [number, number, number]][] = [
  [6, [96, 150, 214], [206, 226, 245]],
  [0, [64, 104, 168], [246, 176, 110]],
  [-6, [32, 48, 98], [196, 104, 74]],
  [-12, [12, 18, 44], [52, 38, 62]],
  [-18, [5, 7, 12], [11, 13, 20]],
  [-24, [5, 7, 12], [8, 10, 16]],
];
function skyAt(sun: number): [string, string] {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [a, za, ha] = KEYS[i];
    const [b, zb, hb] = KEYS[i + 1];
    if (sun <= a && sun >= b) {
      const f = (a - sun) / (a - b);
      const mix = (x: number[], y: number[]) => `rgb(${x.map((v, j) => Math.round(v + (y[j] - v) * f)).join(",")})`;
      return [mix(za, zb), mix(ha, hb)];
    }
  }
  return ["rgb(5,7,12)", "rgb(8,10,16)"];
}

export default function TwilightWidget() {
  const [sun, setSun] = useState(-9);
  const [top, bottom] = skyAt(sun);
  const stage = sun > 0 ? { name: "Daylight", sees: "The Sun is up." } : STAGES.find((s) => sun <= s.from && sun > s.to) ?? STAGES[3];
  // Stars come out as the sky darkens: about magnitude 1 at −6°, 4 at −12°, 6.5 below −18°.
  const limit = sun > -2 ? -3 : sun > -18 ? -0.5 + ((-sun - 2) / 16) * 7 : 6.6;
  return (
    <div className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-xl border" style={{ background: `linear-gradient(to bottom, ${top}, ${bottom})` }}>
        <StarField className="relative block h-auto w-full" limit={limit} sky="transparent" seed={23} label={`The sky with the Sun ${Math.abs(sun)}° ${sun < 0 ? "below" : "above"} the horizon`} />
        <div className="absolute inset-x-0 bottom-0 h-3 bg-[#05070c]/80" aria-hidden="true" />
      </div>
      <LabeledSlider label="Sun's altitude" value={sun} min={-24} max={6} step={0.5} onChange={setSun} display={`${sun > 0 ? "+" : sun < 0 ? "−" : ""}${Math.abs(sun)}°`} />
      {/* The stages along the slider's range. */}
      <div className="flex h-6 overflow-hidden rounded-md text-[10px] leading-6 text-white/80" aria-hidden="true">
        {[
          { w: 6, c: "#4b7cc0", t: "day" },
          { w: 6, c: "#3a5590", t: "civil" },
          { w: 6, c: "#1f2c5c", t: "nautical" },
          { w: 6, c: "#111733", t: "astro" },
          { w: 6, c: "#05070c", t: "night" },
        ].map((s) => (
          <div key={s.t} className="truncate text-center" style={{ flex: s.w, background: s.c }}>
            {s.t}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Readout value={stage.name} label="stage" size="sm" />
        <Readout value={sun > -2 ? "—" : limit.toFixed(1)} label="faintest stars (mag)" />
      </div>
      <p className={cn("text-sm text-muted-foreground")}>{stage.sees}</p>
    </div>
  );
}
