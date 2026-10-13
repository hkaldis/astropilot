import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Chips, Readout, SKY } from "./kit";

const PAIRS = [
  { id: "albireo", name: "Albireo", pa: 54, sep: 34.3, c1: "#ffcf7a", c2: "#8fb6ff", m1: 3.2, m2: 5.1 },
  { id: "rigel", name: "Rigel", pa: 204, sep: 9.4, c1: "#dfe8ff", c2: "#cfd8ff", m1: 0.3, m2: 6.8 },
  { id: "polaris", name: "Polaris", pa: 236, sep: 18.4, c1: "#fff2d6", c2: "#dfe6ff", m1: 2.0, m2: 9.1 },
  { id: "mizar", name: "Mizar", pa: 153, sep: 14.4, c1: "#f2f5ff", c2: "#f2f5ff", m1: 2.2, m2: 3.9 },
];
const VIEWS = [
  { v: "chart", label: "Star chart: N up, E left" },
  { v: "newt", label: "Dobsonian: turned 180°" },
  { v: "diag", label: "With a star diagonal: mirrored" },
] as const;
type View = (typeof VIEWS)[number]["v"];

const dir = (pa: number) => ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(pa / 45) % 8];

export default function PAWidget() {
  const [pair, setPair] = useState(PAIRS[0]);
  const [pa, setPa] = useState(PAIRS[0].pa);
  const [view, setView] = useState<View>("chart");
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef(false);
  const D = 62;
  // Position angle runs from north (up) through east (left on a chart).
  const cx = 100 - D * Math.sin((pa * Math.PI) / 180);
  const cy = 100 - D * Math.cos((pa * Math.PI) / 180);
  const transform = view === "newt" ? "rotate(180 100 100)" : view === "diag" ? "translate(200 0) scale(-1 1)" : undefined;

  const move = (e: React.PointerEvent) => {
    if (view !== "chart") return;
    const b = svg.current!.getBoundingClientRect();
    const dx = ((e.clientX - b.left) / b.width) * 200 - 100;
    const dy = ((e.clientY - b.top) / b.height) * 200 - 100;
    setPa(Math.round((((Math.atan2(-dx, -dy) * 180) / Math.PI) + 360) % 360));
  };
  const big = (m: number) => Math.max(2.2, 7 - m * 0.75);
  const arc = (() => {
    const r = 26;
    const end = { x: 100 - r * Math.sin((pa * Math.PI) / 180), y: 100 - r * Math.cos((pa * Math.PI) / 180) };
    return `M100 ${100 - r} A ${r} ${r} 0 ${pa > 180 ? 1 : 0} 0 ${end.x} ${end.y}`;
  })();

  return (
    <div className="grid gap-5 sm:grid-cols-[15rem_minmax(0,1fr)] sm:items-center">
      <svg
        ref={svg}
        viewBox="0 0 200 200"
        className={cn("w-full max-w-[15rem] touch-none select-none justify-self-center rounded-full", SKY, view === "chart" && "cursor-grab")}
        role="slider"
        tabIndex={0}
        aria-label="Position angle of the companion: drag it around the bright star"
        aria-valuenow={pa}
        aria-valuetext={`${pa}°, ${dir(pa)} of the bright star`}
        onPointerDown={(e) => {
          drag.current = true;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          move(e);
        }}
        onPointerMove={(e) => drag.current && move(e)}
        onPointerUp={() => (drag.current = false)}
        onKeyDown={(e) => {
          const step = e.key === "ArrowLeft" || e.key === "ArrowUp" ? 5 : e.key === "ArrowRight" || e.key === "ArrowDown" ? -5 : 0;
          if (!step) return;
          e.preventDefault();
          setPa((p) => (p + step + 360) % 360);
        }}
      >
        <g transform={transform}>
          <circle cx="100" cy="100" r="90" fill="none" stroke="#2c3546" />
          <circle cx="100" cy="100" r={D} fill="none" stroke="#1f2736" strokeDasharray="2 3" />
          <path d={arc} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" />
          <line x1="100" y1="100" x2="100" y2="16" stroke="#3a4558" />
          <circle cx="100" cy="100" r={big(pair.m1)} fill={pair.c1} className="drop-shadow-[0_0_6px_rgba(255,230,180,0.6)]" />
          <circle cx={cx} cy={cy} r={big(pair.m2)} fill={pair.c2} />
          {[
            ["N", 100, 12],
            ["E", 12, 104],
          ].map(([t, x, y]) => (
            <text key={t as string} x={x as number} y={y as number} textAnchor="middle" className="fill-white/75 text-[11px] font-semibold" transform={view === "diag" ? `translate(${2 * (x as number)} 0) scale(-1 1)` : view === "newt" ? `rotate(180 ${x} ${(y as number) - 4})` : undefined}>
              {t}
            </text>
          ))}
        </g>
      </svg>
      <div className="flex flex-col gap-4">
        <Chips
          label="Double star"
          value={pair.id}
          onChange={(id) => {
            const p = PAIRS.find((x) => x.id === id)!;
            setPair(p);
            setPa(p.pa);
          }}
          options={PAIRS.map((p) => ({ v: p.id, label: p.name }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <Readout value={`${pa}°`} label="position angle" />
          <Readout value={`${pair.sep}″`} label="separation" />
        </div>
        <p className="text-sm text-muted-foreground">
          The companion is {dir(pa)} of the bright star{pa !== pair.pa ? ` (${pair.name}'s real one is at ${pair.pa}°)` : ""}. Angles run from north (0°) through east (90°), south
          (180°) and west (270°). {view === "chart" ? "Drag it around." : "Your telescope may show it like this — the angle on the sky is the same."}
        </p>
        <Chips label="View" value={view} onChange={setView} options={VIEWS.map((v) => ({ v: v.v, label: v.label }))} />
      </div>
    </div>
  );
}
