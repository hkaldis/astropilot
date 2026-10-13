import { useState } from "react";
import { scopeLimits, setup } from "@shared/astro";
import { photoOf } from "@shared/objectImages";
import { FieldView } from "@/features/object/FieldView";
import { useActiveScope } from "@/hooks/useScope";
import { Button } from "@/components/ui/button";
import { Chips, LabeledSlider, Readout } from "./kit";

/** Objects to frame, with their catalog size (arcmin), position angle and type. */
const TARGETS = [
  { id: "M45", name: "Pleiades", type: "open_cluster", size: [110, 110], pa: null },
  { id: "M31", name: "Andromeda", type: "galaxy", size: [177.8, 69.7], pa: 35 },
  { id: "M42", name: "Orion Nebula", type: "cluster_nebula", size: [85, 60], pa: null },
  { id: "M13", name: "M 13", type: "globular_cluster", size: [20, 20], pa: null },
  { id: "M57", name: "Ring Nebula", type: "planetary_nebula", size: [1.4, 1], pa: 60 },
] as const;

function band(pupil: number, mag: number, maxUseful: number): { label: string; tone?: "good" | "fair" | "poor" } {
  if (pupil > 7.2) return { label: "Wider than your eye's pupil: light is wasted", tone: "poor" };
  if (mag > maxUseful * 1.02) return { label: "More than the air or the telescope can use", tone: "fair" };
  if (pupil >= 4) return { label: "Low power: big nebulae, clusters, sweeping", tone: "good" };
  if (pupil >= 2) return { label: "Medium power: galaxies, globulars, most deep sky", tone: "good" };
  if (pupil >= 0.7) return { label: "High power: Moon, planets, close doubles", tone: "good" };
  return { label: "Very high: steady nights and tight doubles only", tone: "fair" };
}

export default function EyepieceWidget() {
  const active = useActiveScope();
  const mine = active.kind === "telescope" ? active : null;
  const [aperture, setAperture] = useState(mine ? Math.round(mine.scope.aperture) : 203);
  const [focal, setFocal] = useState(mine ? Math.round(mine.scope.focalLength) : 1200);
  const [eyepiece, setEyepiece] = useState(mine?.eyepieces[0]?.focalLength ?? 25);
  const [afov, setAfov] = useState(mine?.eyepieces[0]?.afov ?? 52);
  const [barlow, setBarlow] = useState(1);
  const [targetId, setTargetId] = useState<string>("M45");

  const s = setup({ aperture, focalLength: focal }, { focalLength: eyepiece, afov }, barlow > 1 ? { factor: barlow } : null);
  const lim = scopeLimits({ aperture, focalLength: focal });
  const b = band(s.exitPupil, s.magnification, lim.maxUsefulMag);
  const target = TARGETS.find((t) => t.id === targetId)!;
  const photo = photoOf(target.id, { id: target.id, type: target.type, size: [...target.size] });
  const eyeR = 46; // 7 mm
  const pupilR = Math.min(eyeR * 1.25, (s.exitPupil / 7) * eyeR);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_15.5rem]">
        <div className="flex flex-col gap-4">
          {mine && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              Starting from your {mine.scope.name}
              {mine.corrector ? ` with the ${mine.corrector.name}` : ""}.
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setAperture(203);
                  setFocal(1200);
                }}
              >
                Try an 8″ f/6 instead
              </Button>
            </div>
          )}
          <LabeledSlider label="Telescope aperture" value={aperture} min={50} max={500} step={1} onChange={setAperture} display={`${aperture} mm (${(aperture / 25.4).toFixed(1)}″)`} />
          <LabeledSlider label="Telescope focal length" value={focal} min={300} max={3000} step={10} onChange={setFocal} display={`${focal} mm · f/${(focal / aperture).toFixed(1)}`} />
          <LabeledSlider label="Eyepiece focal length" value={eyepiece} min={3} max={40} step={0.5} onChange={setEyepiece} display={`${eyepiece} mm`} />
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Eyepiece apparent field</span>
            <Chips label="Apparent field" value={afov} onChange={setAfov} options={[50, 60, 68, 82, 100].map((v) => ({ v, label: `${v}°` }))} />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Barlow</span>
            <Chips label="Barlow" value={barlow} onChange={setBarlow} options={[{ v: 1, label: "None" }, { v: 2, label: "2×" }, { v: 3, label: "3×" }]} />
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <FieldView fieldDeg={s.trueField} shape={{ kind: "extended", type: target.type, major: target.size[0], minor: target.size[1], pa: target.pa }} photo={photo?.kind === "survey" ? photo : null} size={232} label={`${target.name} in a ${(s.trueField * 60).toFixed(0)}′ field`} />
          <Chips label="Object in the field" value={targetId} onChange={setTargetId} options={TARGETS.map((t) => ({ v: t.id, label: t.name }))} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4">
        <Readout value={`${Math.round(s.magnification)}×`} label="magnification" tone={s.magnification > lim.maxUsefulMag * 1.02 ? "fair" : undefined} />
        <Readout value={`${s.exitPupil.toFixed(1)} mm`} label="exit pupil" tone={s.exitPupil > 7.2 ? "poor" : undefined} />
        <Readout value={s.trueField >= 1 ? `${s.trueField.toFixed(2)}°` : `${Math.round(s.trueField * 60)}′`} label="true field" />
        <Readout value={`${Math.round(lim.maxUsefulMag)}×`} label="max useful power" />
      </div>

      <div className="flex items-center gap-4">
        {/* The beam leaving the eyepiece against a dark-adapted pupil. */}
        <svg viewBox="0 0 120 120" className="h-24 w-24 shrink-0" role="img" aria-label={`Exit pupil ${s.exitPupil.toFixed(1)} mm against a 7 mm eye pupil`}>
          <circle cx="60" cy="60" r={eyeR} fill="none" className="stroke-muted-foreground" strokeDasharray="3 3" />
          <circle cx="60" cy="60" r={pupilR} className={s.exitPupil > 7.2 ? "fill-q-poor/40" : "fill-primary/35"} />
          <circle cx="60" cy="60" r={pupilR} fill="none" className="stroke-primary" />
        </svg>
        <div className="text-sm">
          <div className={b.tone === "poor" ? "text-q-poor" : b.tone === "fair" ? "text-q-fair" : "font-medium"}>{b.label}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Magnification = {Math.round(focal * barlow)} ÷ {eyepiece} mm. Exit pupil = {aperture} ÷ {Math.round(s.magnification)}×. The dashed circle is a dark-adapted 7 mm pupil.
          </div>
        </div>
      </div>
    </div>
  );
}
