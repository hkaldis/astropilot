import { useState } from "react";
import { LabeledSlider, Readout } from "./kit";
import { StarField } from "./StarField";

const WORDS = ["", "Poor", "Below average", "Average", "Good", "Excellent"];
const CAUSE = [
  "",
  "Thick haze, high cloud or smoke: only bright stars show, and town lights glow under the murk.",
  "Hazy: faint stars fade and galaxies lose their outer parts.",
  "Ordinary: the brighter galaxies and nebulae show, the faintest don't.",
  "Clear, dry air: faint stars to the horizon; galaxies show their full extent.",
  "Crisp and dry, often after a cold front or at altitude: the faintest objects are within reach.",
];

export default function TransparencyWidget() {
  const [t, setT] = useState(3);
  const murk = (5 - t) / 4; // 0 … 1
  return (
    <div className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-xl border">
        <StarField className="block h-auto w-full" limit={6.9 - murk * 3} sky={`rgb(${8 + murk * 26},${10 + murk * 24},${18 + murk * 22})`} milkyWay={0.8 - murk * 0.8} haze={murk} label={`Simulated sky with transparency ${t} of 5`} seed={11} />
        {/* A faint galaxy that fades into the murk. */}
        <div
          className="pointer-events-none absolute left-[68%] top-[30%] h-6 w-14 -rotate-[25deg] rounded-full"
          style={{ background: "radial-gradient(closest-side, rgba(235,235,245,0.9), rgba(235,235,245,0.25) 55%, transparent)", opacity: Math.max(0, 0.75 - murk * 0.9), filter: "blur(1.5px)" }}
          aria-hidden="true"
        />
      </div>
      <LabeledSlider label="Transparency" value={t} min={1} max={5} onChange={setT} display={`${t} · ${WORDS[t]}`} hint="Look at the galaxy at upper right as the air gets clearer." />
      <div className="grid grid-cols-2 gap-3">
        <Readout value={`−${(murk * 1.6).toFixed(1)} mag`} label="faint objects lose" tone={t >= 4 ? "good" : t <= 2 ? "poor" : "fair"} />
        <Readout value={t >= 4 ? "Galaxies, nebulae" : t === 3 ? "Bright deep sky" : "Planets, doubles"} label="best for" size="sm" />
      </div>
      <p className="text-sm text-muted-foreground">{CAUSE[t]}</p>
    </div>
  );
}
