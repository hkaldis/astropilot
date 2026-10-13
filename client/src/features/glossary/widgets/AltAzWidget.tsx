import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Readout, SKY } from "./kit";

const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const compass = (az: number) => POINTS[Math.round(az / 22.5) % 16];
const R = 92;
const C = 110;

/** Air the light passes through, relative to straight up (Kasten & Young 1989). */
const airmass = (alt: number) => 1 / (Math.sin((alt * Math.PI) / 180) + 0.50572 * Math.pow(alt + 6.07995, -1.6364));

/**
 * The sky as a sky chart draws it: the horizon is the rim, overhead is the centre, north at the top and
 * east on the left (as when lying on your back with your head to the north). Drag the star around.
 */
export default function AltAzWidget() {
  const [p, setP] = useState({ alt: 35, az: 135 });
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const r = R * (1 - p.alt / 90);
  const x = C - r * Math.sin((p.az * Math.PI) / 180);
  const y = C - r * Math.cos((p.az * Math.PI) / 180);

  const move = (e: React.PointerEvent) => {
    const box = svg.current!.getBoundingClientRect();
    const dx = ((e.clientX - box.left) / box.width) * 220 - C;
    const dy = ((e.clientY - box.top) / box.height) * 220 - C;
    const dist = Math.min(R, Math.hypot(dx, dy));
    const az = (((Math.atan2(-dx, -dy) * 180) / Math.PI) + 360) % 360;
    setP({ alt: Math.round(90 * (1 - dist / R)), az: Math.round(az) });
  };
  const am = airmass(Math.max(p.alt, 0.5));

  return (
    <div className="grid gap-5 sm:grid-cols-[15rem_minmax(0,1fr)] sm:items-center">
      <svg
        ref={svg}
        viewBox="0 0 220 220"
        className={cn("w-full max-w-[15rem] touch-none select-none justify-self-center rounded-full", SKY)}
        role="slider"
        aria-label="Drag the star to change its altitude and direction"
        aria-valuetext={`${p.alt}° up, towards the ${compass(p.az)}`}
        tabIndex={0}
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          move(e);
        }}
        onPointerMove={(e) => dragging.current && move(e)}
        onPointerUp={() => (dragging.current = false)}
        onKeyDown={(e) => {
          const step = { ArrowUp: [5, 0], ArrowDown: [-5, 0], ArrowLeft: [0, -10], ArrowRight: [0, 10] }[e.key];
          if (!step) return;
          e.preventDefault();
          setP((q) => ({ alt: Math.max(0, Math.min(90, q.alt + step[0])), az: (q.az + step[1] + 360) % 360 }));
        }}
      >
        {[30, 60].map((a) => (
          <circle key={a} cx={C} cy={C} r={R * (1 - a / 90)} fill="none" stroke="#2a3446" strokeDasharray="2 3" />
        ))}
        <circle cx={C} cy={C} r={R} fill="none" stroke="#4a5670" strokeWidth="1.5" />
        <line x1={C} y1={C - R} x2={C} y2={C + R} stroke="#222b3b" />
        <line x1={C - R} y1={C} x2={C + R} y2={C} stroke="#222b3b" />
        {[
          ["N", C, C - R - 6],
          ["S", C, C + R + 13],
          ["E", C - R - 10, C + 4],
          ["W", C + R + 10, C + 4],
        ].map(([t, tx, ty]) => (
          <text key={t as string} x={tx as number} y={ty as number} textAnchor="middle" className="fill-white/70 text-[11px] font-semibold">
            {t}
          </text>
        ))}
        <text x={C + 3} y={C - R * (1 - 30 / 90) - 2} className="fill-white/35 text-[7px]">
          30°
        </text>
        <text x={C + 3} y={C - R * (1 - 60 / 90) - 2} className="fill-white/35 text-[7px]">
          60°
        </text>
        <text x={C + 3} y={C - 3} className="fill-white/35 text-[7px]">
          zenith
        </text>
        <line x1={C} y1={C} x2={x} y2={y} stroke="hsl(var(--primary))" strokeOpacity="0.5" />
        <circle cx={x} cy={y} r="7" fill="#fff" className="cursor-grab drop-shadow-[0_0_6px_rgba(255,255,255,0.8)]" />
      </svg>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Readout value={`${p.alt}°`} label="altitude" />
          <Readout value={`${p.az}° ${compass(p.az)}`} label="azimuth" />
          <Readout value={am.toFixed(1)} label="airmass" tone={am > 2.5 ? "poor" : am > 1.6 ? "fair" : "good"} />
          <Readout value={`−${(am * 0.25).toFixed(1)} mag`} label="dimmed by the air" />
        </div>
        <p className="text-sm text-muted-foreground">
          {p.alt >= 60
            ? "High in the sky: the clearest, steadiest view — though a Dobsonian is awkward right overhead."
            : p.alt >= 30
              ? `About ${Math.round(p.alt / 10)} fists above the horizon, towards the ${compass(p.az)}: a good height for most objects.`
              : p.alt >= 15
                ? "Low: the light crosses a lot of air, so expect dimming, haze and unsteady seeing."
                : "On the horizon: trees, buildings and haze will likely hide it. Wait for it to climb."}{" "}
          Drag the star, or use the arrow keys.
        </p>
      </div>
    </div>
  );
}
