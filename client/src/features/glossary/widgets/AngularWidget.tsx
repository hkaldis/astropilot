import { useState } from "react";
import { cn } from "@/lib/utils";
import { Chips, Readout, SKY } from "./kit";

type Shape = "galaxy" | "cluster" | "nebula" | "planet" | "pair" | "ring" | "fist" | "finger";
const THINGS: { id: string; name: string; w: number; h?: number; shape: Shape; note: string }[] = [
  { id: "m31", name: "Andromeda Galaxy", w: 178, h: 70, shape: "galaxy", note: "The whole galaxy is six full Moons long, though the eye sees mostly its core." },
  { id: "m45", name: "Pleiades", w: 110, shape: "cluster", note: "Too big for most telescopes at their lowest power: binoculars frame it best." },
  { id: "m42", name: "Orion Nebula", w: 85, h: 60, shape: "nebula", note: "Bigger than the full Moon — a low-power eyepiece shows it all." },
  { id: "mizar", name: "Mizar & Alcor", w: 11.8, shape: "pair", note: "A naked-eye pair a third of a Moon apart — a classic eyesight test." },
  { id: "m57", name: "Ring Nebula", w: 1.4, h: 1, shape: "ring", note: "Tiny: at low power it looks like a fat star; it needs 100× or more." },
  { id: "jupiter", name: "Jupiter", w: 0.75, shape: "planet", note: "About 1/40 of the Moon's width: 40× makes it look as big as the Moon does to the eye." },
  { id: "albireo", name: "Albireo's pair", w: 34.4 / 60, shape: "pair", note: "34″ apart: any telescope splits it at 20× or more." },
  { id: "fist", name: "Your fist", w: 600, h: 600, shape: "fist", note: "At arm's length, about 10° — 20 full Moons. Great for judging altitude." },
  { id: "finger", name: "Little finger", w: 60, h: 300, shape: "finger", note: "About 1° wide at arm's length — two full Moons side by side." },
];
const MOON = 31;

function fmt(arcmin: number): string {
  if (arcmin >= 60) return `${(arcmin / 60).toFixed(arcmin >= 600 ? 0 : 1)}°`;
  if (arcmin >= 1) return `${arcmin.toFixed(arcmin < 10 ? 1 : 0)}′`;
  return `${Math.round(arcmin * 60)}″`;
}

function Thing({ shape, w, h, cx, cy }: { shape: Shape; w: number; h: number; cx: number; cy: number }) {
  const rx = w / 2;
  const ry = h / 2;
  switch (shape) {
    case "galaxy":
      return (
        <g transform={`rotate(-35 ${cx} ${cy})`}>
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#ang-gal)" />
        </g>
      );
    case "nebula":
      return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#ang-neb)" />;
    case "cluster":
      return (
        <g fill="#cfe0ff">
          {[
            [0, 0, 1.4],
            [0.35, -0.2, 1.1],
            [-0.3, 0.15, 1],
            [0.15, 0.32, 0.9],
            [-0.18, -0.3, 0.9],
            [0.42, 0.25, 0.7],
            [-0.42, -0.05, 0.7],
          ].map(([dx, dy, s], i) => (
            <circle key={i} cx={cx + dx * rx} cy={cy + dy * rx} r={Math.max(0.6, s * rx * 0.07)} />
          ))}
        </g>
      );
    case "ring":
      return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#9fe6d0" strokeWidth={Math.max(0.4, rx * 0.4)} />;
    case "planet":
      return <circle cx={cx} cy={cy} r={Math.max(0.5, rx)} fill="#e6cfa8" />;
    case "pair":
      return (
        <g>
          <circle cx={cx - rx} cy={cy} r="1.6" fill="#ffd27f" />
          <circle cx={cx + rx} cy={cy} r="1.2" fill="#9fc3ff" />
        </g>
      );
    case "fist":
    case "finger":
      return <rect x={cx - rx} y={cy - ry} width={w} height={h} rx={Math.min(rx, ry) * 0.35} fill="none" stroke="#aab4c8" strokeDasharray="3 3" />;
  }
}

export default function AngularWidget() {
  const [id, setId] = useState("m31");
  const t = THINGS.find((x) => x.id === id)!;
  const h = t.h ?? t.w;
  // One scale for both: the bigger of the two fills about 80 of the 100-unit-high panel.
  const k = 80 / Math.max(MOON, t.w, h);
  const tiny = Math.max(t.w, h) * k < 6;
  const zoom = tiny ? Math.round(24 / (Math.max(t.w, h) * k)) : 1;
  const ratio = t.w / MOON;
  return (
    <div className="flex flex-col gap-4">
      <div className={cn("relative overflow-hidden rounded-xl border", SKY)}>
        <svg viewBox="0 0 200 100" className="block h-auto w-full" role="img" aria-label={`${t.name} beside the full Moon, to scale`}>
          <defs>
            <radialGradient id="ang-gal">
              <stop offset="0" stopColor="#fff6e0" stopOpacity="0.95" />
              <stop offset="0.25" stopColor="#d8d8e8" stopOpacity="0.45" />
              <stop offset="1" stopColor="#9aa6c8" stopOpacity="0.04" />
            </radialGradient>
            <radialGradient id="ang-neb">
              <stop offset="0" stopColor="#e8f4ff" stopOpacity="0.85" />
              <stop offset="0.5" stopColor="#93c7d8" stopOpacity="0.35" />
              <stop offset="1" stopColor="#5f8fa8" stopOpacity="0.03" />
            </radialGradient>
          </defs>
          <circle cx="55" cy="50" r={(MOON * k) / 2} fill="#cfd2d6" />
          <circle cx={55 - MOON * k * 0.12} cy={50 - MOON * k * 0.1} r={MOON * k * 0.11} fill="#a9adb3" />
          <circle cx={55 + MOON * k * 0.14} cy={50 + MOON * k * 0.05} r={MOON * k * 0.08} fill="#a9adb3" />
          <text x="55" y="97" textAnchor="middle" className="fill-white/60 text-[7px]">
            Full Moon · 31′
          </text>
          <Thing shape={t.shape} w={t.w * k} h={h * k} cx={145} cy={50} />
          {tiny && (
            <g>
              <circle cx="178" cy="22" r="17" fill="#0c1018" stroke="#3a4558" />
              <Thing shape={t.shape} w={t.w * k * zoom} h={h * k * zoom} cx={178} cy={22} />
              <text x="178" y="46" textAnchor="middle" className="fill-white/55 text-[6px]">
                magnified ×{zoom}
              </text>
            </g>
          )}
          <text x="145" y="97" textAnchor="middle" className="fill-white/60 text-[7px]">
            {t.name} · {fmt(t.w)}
          </text>
        </svg>
      </div>
      <Chips label="Compare with the Moon" value={id} onChange={setId} options={THINGS.map((x) => ({ v: x.id, label: x.name }))} />
      <div className="grid grid-cols-3 gap-3">
        <Readout value={fmt(t.w)} label="across" />
        <Readout value={`${(t.w * 60).toLocaleString(undefined, { maximumFractionDigits: 0 })}″`} label="in arcseconds" />
        <Readout value={ratio >= 1 ? `${ratio.toFixed(ratio >= 10 ? 0 : 1)}×` : `1/${Math.round(1 / ratio)}`} label="the Moon's width" />
      </div>
      <p className="text-sm text-muted-foreground">{t.note} 1° = 60′ (arcminutes), 1′ = 60″ (arcseconds).</p>
    </div>
  );
}
