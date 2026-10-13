import { useState } from "react";
import { sqmForBortle } from "@shared/astro";
import { cn } from "@/lib/utils";
import { useSite } from "@/hooks/useSite";
import { LabeledSlider, Readout } from "./kit";
import { StarField } from "./StarField";

const CLASSES: { nelm: number; name: string; sees: string }[] = [
  { nelm: 7.8, name: "Excellent dark site", sees: "The Milky Way casts shadows; the zodiacal light and airglow are obvious; M 33 is a naked-eye object." },
  { nelm: 7.3, name: "Truly dark site", sees: "The summer Milky Way is full of structure; clouds show as black holes in the starry sky." },
  { nelm: 6.8, name: "Rural sky", sees: "Some light domes on the horizon; the Milky Way is still richly detailed overhead." },
  { nelm: 6.3, name: "Rural–suburban", sees: "Light domes in several directions; the Milky Way shows overhead but fades towards the horizon." },
  { nelm: 5.8, name: "Suburban", sees: "The Milky Way is weak overhead and invisible near the horizon; the Andromeda Galaxy is a faint smudge." },
  { nelm: 5.3, name: "Bright suburban", sees: "The Milky Way is gone except perhaps overhead; the sky is a grey-white glow." },
  { nelm: 4.8, name: "Suburban–urban", sees: "No Milky Way; the sky glows light grey; galaxies are hard even in telescopes." },
  { nelm: 4.3, name: "City sky", sees: "Only the main constellation stars; the sky is bright enough to read by." },
  { nelm: 3.8, name: "Inner city", sees: "Only the brightest stars, the planets and the Moon; stick to doubles and planets." },
];

export default function BortleWidget() {
  // Start at the user's own sky, when we know it.
  const { site } = useSite();
  const mine = site ? Math.min(9, Math.max(1, Math.round(site.bortle))) : null;
  const [b, setB] = useState(mine ?? 4);
  const c = CLASSES[b - 1];
  const k = (b - 1) / 8; // 0 dark … 1 city
  const sky = `rgb(${Math.round(5 + 70 * k ** 1.3)},${Math.round(7 + 62 * k ** 1.4)},${Math.round(14 + 52 * k ** 1.5)})`;
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-xl border">
        <StarField
          className="block h-auto w-full"
          limit={c.nelm - 0.4}
          sky={sky}
          milkyWay={Math.max(0, 1 - (b - 1) / 4.5)}
          glow={Math.min(1, (b - 2) / 6)}
          label={`Simulated night sky, Bortle class ${b}`}
        />
      </div>
      <LabeledSlider
        label="Bortle class"
        value={b}
        min={1}
        max={9}
        onChange={setB}
        display={`${b} · ${c.name}`}
        hint={mine ? (b === mine ? `This is about the sky at ${site!.name}.` : `${site!.name} is about class ${mine}. 1 is a pristine desert sky; 9 a city centre.`) : "1 is a pristine desert sky; 9 a city centre."}
      />
      {mine && b !== mine && (
        <button type="button" onClick={() => setB(mine)} className="link -mt-2 w-fit text-sm">
          Show my sky (class {mine})
        </button>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Readout value={c.nelm.toFixed(1)} label="faintest naked-eye stars (mag)" />
        <Readout value={sqmForBortle(b).toFixed(2)} label="sky brightness, SQM (mag/arcsec²)" />
      </div>
      <p className={cn("text-sm", b >= 7 ? "text-q-fair" : "text-muted-foreground")}>{c.sees}</p>
    </div>
  );
}
