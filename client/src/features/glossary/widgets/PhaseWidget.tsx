import { useState } from "react";
import { moonPhaseName } from "@shared/astro";
import { MoonGlyph } from "@/components/common/Glyphs";
import { Chips, LabeledSlider, Readout } from "./kit";

const MONTH = 29.53;

function clock(h: number): string {
  const x = ((h % 24) + 24) % 24;
  return `${String(Math.floor(x)).padStart(2, "0")}:${String(Math.round((x % 1) * 60) % 60).padStart(2, "0")}`;
}

export default function PhaseWidget() {
  const [age, setAge] = useState(7.4);
  const [south, setSouth] = useState(false);
  const e = (age / MONTH) * 360;
  const lit = (1 - Math.cos((e * Math.PI) / 180)) / 2;
  // The Moon rises about 50 minutes later each day: with the Sun at new Moon, at sunset when full.
  const rise = 6 + age * (24 / MONTH);
  const deep = lit < 0.25 ? (age < MONTH / 2 ? "Good after moonset" : "Good until moonrise") : lit < 0.6 ? "Fair — plan around it" : "Poor: the sky is bright";
  const lunar = lit > 0.97 ? "Flat and glary: few shadows, but bright rays around Tycho" : lit < 0.04 ? "Not visible: too close to the Sun" : "Great: long shadows along the terminator";
  return (
    <div className="grid gap-5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center">
      <div className="grid place-items-center rounded-xl border bg-[#05070c] p-4">
        <MoonGlyph elongation={e} size={140} southern={south} />
      </div>
      <div className="flex flex-col gap-4">
        <LabeledSlider label="Days since new Moon" value={age} min={0} max={29.5} step={0.1} onChange={setAge} display={`${age.toFixed(1)} d · ${moonPhaseName(e)}`} />
        <div className="grid grid-cols-2 gap-3">
          <Readout value={`${Math.round(lit * 100)}%`} label="lit" />
          <Readout value={`≈ ${clock(rise)}`} label="rises (roughly)" />
          <Readout value={deep} label="for faint galaxies" tone={lit < 0.25 ? "good" : lit < 0.6 ? "fair" : "poor"} size="sm" />
          <Readout value={lunar} label="for the Moon itself" size="sm" />
        </div>
        <Chips label="Hemisphere" value={south ? "s" : "n"} onChange={(v) => setSouth(v === "s")} options={[{ v: "n", label: "Seen from the north" }, { v: "s", label: "From the south" }]} />
      </div>
    </div>
  );
}
