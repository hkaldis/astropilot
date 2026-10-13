import { useId, useMemo } from "react";
import { Map as MapIcon } from "lucide-react";
import { SUN_GALACTOCENTRIC_LY, galacticXYZ, niceYears, toGalactic } from "@shared/lookback";
import { formatLightYears } from "@shared/stories";

const R0 = SUN_GALACTOCENTRIC_LY;
const SIZE = 400;
const C = SIZE / 2;

/** Well-known places for scale, near the Sun (RA hours, Dec °, light-years). */
const NEIGHBOURS: { id: string; name: string; ra: number; dec: number; d: number }[] = [
  { id: "C41", name: "Hyades", ra: 4.45, dec: 15.87, d: 153 },
  { id: "M45", name: "Pleiades", ra: 3.79, dec: 24.12, d: 444 },
  { id: "M44", name: "Beehive", ra: 8.67, dec: 19.67, d: 610 },
  { id: "M42", name: "Orion Nebula", ra: 5.59, dec: -5.39, d: 1344 },
  { id: "M57", name: "Ring Nebula", ra: 18.89, dec: 33.03, d: 2570 },
  { id: "M8", name: "Lagoon Nebula", ra: 18.06, dec: -24.38, d: 4100 },
  { id: "C14", name: "Double Cluster", ra: 2.33, dec: 57.13, d: 7500 },
  { id: "M13", name: "M 13", ra: 16.69, dec: 36.46, d: 24100 },
];

/** Galaxies for scale beyond the Milky Way. */
const GALAXIES: { id: string; name: string; ra: number; dec: number; d: number }[] = [
  { id: "ESO56-115", name: "Magellanic Clouds", ra: 3.1, dec: -71.3, d: 180_000 },
  { id: "M31", name: "Andromeda", ra: 0.712, dec: 41.27, d: 2_500_000 },
  { id: "M33", name: "Triangulum", ra: 1.564, dec: 30.66, d: 2_730_000 },
  { id: "M81", name: "M 81", ra: 9.926, dec: 69.07, d: 11_700_000 },
  { id: "C77", name: "Centaurus A", ra: 13.425, dec: -43.02, d: 12_000_000 },
  { id: "M87", name: "Virgo Cluster", ra: 12.514, dec: 12.39, d: 54_000_000 },
  { id: "coma", name: "Coma Cluster", ra: 12.998, dec: 27.98, d: 320_000_000 },
];

/** Galactic-plane position relative to the Sun, in map units of `k` px per light-year (toward the centre = up). */
function planeOffset(ra: number, dec: number, d: number) {
  const p = galacticXYZ(ra, dec, d);
  return { dx: -p.y, dy: -p.x, z: p.z, x: p.x };
}

/** Four logarithmic spiral arms (pitch 12°) leaving a central bar, with the Sun between two of them. */
function armPath(phi0: number, k: number) {
  const pts: string[] = [];
  for (let t = 0; t <= 7.6; t += 0.06) {
    const r = 9500 * Math.exp(Math.tan((12 * Math.PI) / 180) * t) * k;
    const a = phi0 + t;
    pts.push(`${(C + r * Math.cos(a)).toFixed(1)},${(C - r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join("L")}`;
}
function armPoint(phi0: number, t: number, k: number) {
  const r = 9500 * Math.exp(Math.tan((12 * Math.PI) / 180) * t) * k;
  return { x: C + r * Math.cos(phi0 + t), y: C - r * Math.sin(phi0 + t) };
}
const ARM0 = (48 * Math.PI) / 180;
const ARMS = [0, 1, 2, 3].map((j) => ARM0 + (j * Math.PI) / 2);
/** Perseus and Scutum–Centaurus are the major arms; Sagittarius and Norma/Outer the fainter ones. */
const MAJOR = [false, true, false, true];

/** Star dust scattered along the arms (seeded, so the picture never changes). */
const DUST = (() => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pts: { t: number; arm: number; dr: number; da: number; o: number; s: number }[] = [];
  for (let i = 0; i < 420; i++) {
    const arm = i % 4;
    pts.push({ arm, t: rnd() * 7.4, dr: (rnd() - 0.5) * 0.22, da: (rnd() - 0.5) * 0.12, o: 0.15 + rnd() * 0.55, s: 0.35 + rnd() * 0.75 });
  }
  return pts;
})();

function Label({ x, y, children, anchor = "middle", className = "fill-white/45", size = 9 }: { x: number; y: number; children: React.ReactNode; anchor?: "start" | "middle" | "end"; className?: string; size?: number }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} className={className} style={{ paintOrder: "stroke", stroke: "#05070c", strokeWidth: 3, strokeLinejoin: "round" }}>
      {children}
    </text>
  );
}

function Marker({ x, y, name }: { x: number; y: number; name: string }) {
  const right = x < SIZE * 0.62;
  return (
    <g>
      <circle cx={x} cy={y} r={5} className="map-pulse fill-none stroke-sky-300" strokeWidth={1.5} />
      <circle cx={x} cy={y} r={4} className="fill-sky-300" />
      <Label x={x + (right ? 9 : -9)} y={y + 3.5} anchor={right ? "start" : "end"} className="fill-sky-100" size={11}>
        {name}
      </Label>
    </g>
  );
}

function SunMark({ x, y, label = "You are here" }: { x: number; y: number; label?: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={3.5} className="fill-amber-200" />
      <circle cx={x} cy={y} r={7} className="fill-amber-200/20" />
      <Label x={x} y={y + 17} className="fill-amber-100/80" size={9.5}>
        {label}
      </Label>
    </g>
  );
}

/** The whole Milky Way seen from above, the Sun, and the object. */
function MilkyWay({ name, ra, dec, d }: { name: string; ra: number; dec: number; d: number }) {
  const uid = useId().replace(/:/g, "");
  const k = 172 / 50_000;
  const sun = { x: C, y: C + R0 * k };
  const o = planeOffset(ra, dec, d);
  const obj = { x: sun.x + o.dx * k, y: sun.y + o.dy * k };
  const near = d * k < 14;
  // Arm names placed away from the Sun, where the object and its label usually are.
  const sag = armPoint(ARMS[0], 3.05, k);
  const per = armPoint(ARMS[3], 6.3, k);
  const scu = armPoint(ARMS[1], 4.6, k);
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="block h-auto w-full" role="img" aria-label={`Map of the Milky Way from above, showing the Sun and ${name}`}>
      <defs>
        <radialGradient id={`${uid}disk`}>
          <stop offset="0" stopColor="#fde7b0" stopOpacity="0.55" />
          <stop offset="0.18" stopColor="#c9b98f" stopOpacity="0.22" />
          <stop offset="0.6" stopColor="#7c93c9" stopOpacity="0.08" />
          <stop offset="1" stopColor="#7c93c9" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}bulge`}>
          <stop offset="0" stopColor="#fff4d6" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="#f5d58f" stopOpacity="0.45" />
          <stop offset="1" stopColor="#f5d58f" stopOpacity="0" />
        </radialGradient>
        <filter id={`${uid}blur`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        {/* The arms fade into the outer disk. */}
        <radialGradient id={`${uid}fadeg`}>
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.62" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={`${uid}fade`}>
          <circle cx={C} cy={C} r={195} fill={`url(#${uid}fadeg)`} />
        </mask>
      </defs>
      <circle cx={C} cy={C} r={185} fill={`url(#${uid}disk)`} />
      <g mask={`url(#${uid}fade)`}>
        <g filter={`url(#${uid}blur)`}>
          {ARMS.map((a, j) => (
            <path key={a} d={armPath(a, k)} fill="none" stroke="#9fb6ff" strokeWidth={MAJOR[j] ? 19 : 11} strokeOpacity={MAJOR[j] ? 0.6 : 0.38} strokeLinecap="round" />
          ))}
        </g>
        {ARMS.map((a, j) => (
          <path key={a} d={armPath(a, k)} fill="none" stroke="#dbe5ff" strokeWidth={MAJOR[j] ? 1.2 : 0.7} strokeOpacity={MAJOR[j] ? 0.45 : 0.3} strokeLinecap="round" />
        ))}
        {DUST.map((p, i) => {
          const r = 9500 * Math.exp(Math.tan((12 * Math.PI) / 180) * p.t) * (1 + p.dr) * k;
          const a = ARMS[p.arm] + p.t + p.da;
          return <circle key={i} cx={C + r * Math.cos(a)} cy={C - r * Math.sin(a)} r={p.s} fill="#e6edff" opacity={p.o} />;
        })}
      </g>
      <ellipse cx={C} cy={C} rx={42} ry={18} transform={`rotate(${-48} ${C} ${C})`} fill={`url(#${uid}bulge)`} />
      <Label x={C} y={C + 4} className="fill-white/60" size={9}>
        Galactic centre
      </Label>
      <Label x={sag.x} y={sag.y} size={8.5}>
        Sagittarius Arm
      </Label>
      <Label x={per.x} y={per.y} size={8.5}>
        Perseus Arm
      </Label>
      <Label x={scu.x} y={scu.y} size={8.5}>
        Scutum–Centaurus Arm
      </Label>
      {!near && <line x1={sun.x} y1={sun.y} x2={obj.x} y2={obj.y} className="stroke-sky-200/70" strokeWidth={1.2} strokeDasharray="3 3" />}
      <SunMark x={sun.x} y={sun.y} label={near ? "You are here" : "The Sun"} />
      {!near && <Marker x={obj.x} y={obj.y} name={name} />}
      {/* Scale bar: 10,000 light-years. */}
      <g transform={`translate(${SIZE - 22 - 10_000 * k} ${SIZE - 18})`}>
        <line x1={0} x2={10_000 * k} y1={0} y2={0} className="stroke-white/50" strokeWidth={1} />
        <line x1={0} x2={0} y1={-3} y2={3} className="stroke-white/50" />
        <line x1={10_000 * k} x2={10_000 * k} y1={-3} y2={3} className="stroke-white/50" />
        <Label x={(10_000 * k) / 2} y={-6} size={8.5}>
          10,000 ly
        </Label>
      </g>
    </svg>
  );
}

/** Close-up around the Sun for nearby objects, with a few famous neighbours for scale. */
function Neighbourhood({ id, name, ra, dec, d }: { id: string; name: string; ra: number; dec: number; d: number }) {
  const span = Math.max(d * 1.4, 1500);
  const k = 170 / span;
  const o = planeOffset(ra, dec, d);
  const obj = { x: C + o.dx * k, y: C + o.dy * k };
  const step = span > 3000 ? 2000 : span > 1500 ? 1000 : 500;
  const rings = [1, 2, 3, 4].map((i) => i * step).filter((r) => r * k < 190);
  const others = NEIGHBOURS.filter((n) => n.id !== id && n.d < span * 1.05)
    .map((n) => {
      const p = planeOffset(n.ra, n.dec, n.d);
      return { ...n, x: C + p.dx * k, y: C + p.dy * k };
    })
    .filter((n) => Math.hypot(n.x - obj.x, n.y - obj.y) > 26 && Math.hypot(n.x - C, n.y - C) > 22 && n.x > 10 && n.x < SIZE - 10 && n.y > 10 && n.y < SIZE - 10);
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="block h-auto w-full" role="img" aria-label={`The Sun's neighbourhood seen from above the Milky Way, with ${name}`}>
      {rings.map((r) => (
        <g key={r}>
          <circle cx={C} cy={C} r={r * k} fill="none" className="stroke-white/10" strokeDasharray="2 4" />
          <Label x={C + r * k * 0.71 + 3} y={C - r * k * 0.71 - 3} anchor="start" size={8} className="fill-white/30">
            {r.toLocaleString("en-US")} ly
          </Label>
        </g>
      ))}
      <Label x={C} y={16} size={8.5} className="fill-white/40">
        ↑ towards the Galactic centre
      </Label>
      {others.map((n) => (
        <g key={n.id}>
          <circle cx={n.x} cy={n.y} r={2.2} className="fill-white/45" />
          <Label x={n.x} y={n.y - 6} size={8.5} className="fill-white/50">
            {n.name}
          </Label>
        </g>
      ))}
      <line x1={C} y1={C} x2={obj.x} y2={obj.y} className="stroke-sky-200/70" strokeWidth={1.2} strokeDasharray="3 3" />
      <SunMark x={C} y={C} label="The Sun" />
      <Marker x={obj.x} y={obj.y} name={name} />
    </svg>
  );
}

/** Seen edge-on: how far above or below the Milky Way's disk an object lies (globular clusters, high-latitude objects). */
function EdgeOn({ name, ra, dec, d }: { name: string; ra: number; dec: number; d: number }) {
  const p = galacticXYZ(ra, dec, d);
  const k = 180 / 55_000;
  const W = SIZE;
  const H = 150;
  const cy = H / 2;
  const sunX = C + R0 * k;
  const ox = sunX - p.x * k;
  const oy = cy - Math.max(-68, Math.min(68, p.z * k));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`The Milky Way edge-on, showing ${name} ${p.z > 0 ? "above" : "below"} the disk`}>
      <defs>
        <radialGradient id="edge-bulge">
          <stop offset="0" stopColor="#fff4d6" stopOpacity="0.9" />
          <stop offset="1" stopColor="#f5d58f" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="edge-disk" x1="0" x2="1">
          <stop offset="0" stopColor="#9fb6ff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#c9d6ff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#9fb6ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse cx={C} cy={cy} rx={175} ry={4} fill="url(#edge-disk)" />
      <ellipse cx={C} cy={cy} rx={30} ry={14} fill="url(#edge-bulge)" />
      <line x1={sunX} y1={cy} x2={ox} y2={oy} className="stroke-sky-200/70" strokeWidth={1.2} strokeDasharray="3 3" />
      <circle cx={sunX} cy={cy} r={3} className="fill-amber-200" />
      <Label x={sunX} y={cy + 15} size={9} className="fill-amber-100/80">
        The Sun
      </Label>
      <circle cx={ox} cy={oy} r={4} className="fill-sky-300" />
      <Label x={ox + (ox < W * 0.6 ? 8 : -8)} y={oy + 4} anchor={ox < W * 0.6 ? "start" : "end"} size={10.5} className="fill-sky-100">
        {name}
      </Label>
    </svg>
  );
}

/** Beyond the Milky Way: our galaxy at the centre, distances on a log scale, famous galaxies for scale. */
function Cosmic({ id, name, ra, dec, d }: { id: string; name: string; ra: number; dec: number; d: number }) {
  const maxD = Math.max(1.2e8, d * 1.6);
  const lo = 4.6;
  const radius = (ly: number) => (178 * (Math.log10(ly) - lo)) / (Math.log10(maxD) - lo);
  const place = (raH: number, decD: number, ly: number) => {
    const l = (toGalactic(raH, decD).l * Math.PI) / 180;
    const r = radius(ly);
    return { x: C - r * Math.sin(l), y: C - r * Math.cos(l) };
  };
  const obj = place(ra, dec, d);
  const rings = [1e5, 1e6, 1e7, 1e8, 1e9].filter((r) => r < maxD);
  const others = GALAXIES.filter((g) => g.id !== id && g.d < maxD && Math.abs(g.d / d - 1) > 0.02)
    .map((g) => ({ ...g, ...place(g.ra, g.dec, g.d) }))
    .filter((g) => Math.hypot(g.x - obj.x, g.y - obj.y) > 24);
  const ringLabel = (r: number) => (r >= 1e9 ? "1 billion ly" : r >= 1e6 ? `${r / 1e6} million ly` : `${(r / 1e3).toLocaleString("en-US")},000 ly`);
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="block h-auto w-full" role="img" aria-label={`Map of nearby galaxies on a logarithmic scale, with the Milky Way at the centre and ${name}`}>
      {rings.map((r) => (
        <g key={r}>
          <circle cx={C} cy={C} r={radius(r)} fill="none" className="stroke-white/10" strokeDasharray="2 4" />
          <Label x={C} y={C - radius(r) - 3} size={8} className="fill-white/30">
            {ringLabel(r)}
          </Label>
        </g>
      ))}
      <ellipse cx={C} cy={C} rx={9} ry={3.5} className="fill-amber-100/70" />
      <ellipse cx={C} cy={C} rx={16} ry={6} className="fill-amber-100/15" />
      <Label x={C} y={C + 18} size={9} className="fill-amber-100/80">
        Milky Way
      </Label>
      {others.map((g) => (
        <g key={g.id}>
          <circle cx={g.x} cy={g.y} r={2.4} className="fill-white/45" />
          <Label x={g.x} y={g.y - 6} size={8.5} className="fill-white/50">
            {g.name}
          </Label>
        </g>
      ))}
      <line x1={C} y1={C} x2={obj.x} y2={obj.y} className="stroke-sky-200/60" strokeWidth={1.2} strokeDasharray="3 3" />
      <Marker x={obj.x} y={obj.y} name={name} />
    </svg>
  );
}

/** Where it is: in the Milky Way, near the Sun, or out among the galaxies. */
export function GalaxyMap({ id, name, type, ra, dec, d, src }: { id: string; name: string; type: string; ra: number; dec: number; d: number; src?: string }) {
  const view = useMemo(() => {
    const p = galacticXYZ(ra, dec, d);
    const fromCentre = Math.hypot(R0 - p.x, p.y, p.z);
    if (type === "galaxy" || type === "galaxy_group" || fromCentre > 62_000) return "cosmic" as const;
    return d < 5000 ? ("near" as const) : ("galaxy" as const);
  }, [ra, dec, d, type]);
  const p = galacticXYZ(ra, dec, d);
  const showEdge = view !== "cosmic" && Math.abs(p.z) > 2500;
  // Out among the galaxies: a galaxy itself, something inside the Magellanic Clouds, or a far-flung member of our own halo.
  const where = type === "galaxy" || type === "galaxy_group" ? "galaxy" : src === "lmc" || src === "smc" ? "cloud" : "halo";
  const heading = view !== "cosmic" ? "Where it is in the Milky Way" : where === "galaxy" ? "Beyond our galaxy" : where === "cloud" ? "In a neighbouring galaxy" : "Far out in the Milky Way’s halo";
  const caption =
    view === "cosmic"
      ? where === "cloud"
        ? `${name} lies in the ${src === "lmc" ? "Large" : "Small"} Magellanic Cloud, a small galaxy orbiting our own, ${formatLightYears(d)} away. Distances grow tenfold at each ring.`
        : where === "halo"
          ? `${name} still belongs to the Milky Way, but orbits far beyond its disk — ${formatLightYears(d)} from us, out towards the nearest galaxies. Distances grow tenfold at each ring.`
          : `Our galaxy at the centre, with distances growing tenfold at each ring. ${name} is ${formatLightYears(d)} away.`
      : view === "near"
        ? `${name} is in our own corner of the Milky Way — the Sun’s neighbourhood, seen from above the disk.`
        : `Seen from above the Milky Way’s disk. ${name} lies ${formatLightYears(d)} from the Sun${Math.hypot(R0 - p.x, p.y) < R0 ? ", on the way towards the Galactic centre" : ""}.`;
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border bg-[#05070c] text-white">
      <div className="flex items-center gap-1.5 px-5 pt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-300/90 sm:px-6">
        <MapIcon className="h-3.5 w-3.5" /> {heading}
      </div>
      <div className={view === "near" ? "grid gap-2 p-3 sm:grid-cols-2" : "mx-auto w-full max-w-[30rem] p-3"}>
        {view === "near" ? (
          <>
            <div>
              <MilkyWay name={name} ra={ra} dec={dec} d={d} />
              <p className="-mt-1 text-center text-[11px] text-white/45">The whole galaxy: we are all here</p>
            </div>
            <div>
              <Neighbourhood id={id} name={name} ra={ra} dec={dec} d={d} />
              <p className="-mt-1 text-center text-[11px] text-white/45">Zoomed in on the Sun’s neighbourhood</p>
            </div>
          </>
        ) : view === "cosmic" ? (
          <Cosmic id={id} name={name} ra={ra} dec={dec} d={d} />
        ) : (
          <MilkyWay name={name} ra={ra} dec={dec} d={d} />
        )}
      </div>
      {showEdge && (
        <div className="border-t border-white/10 px-3 pb-1 pt-3">
          <EdgeOn name={name} ra={ra} dec={dec} d={d} />
          <p className="pb-2 text-center text-[11px] text-white/45">
            Edge-on: {niceYears(Math.abs(p.z))} light-years {p.z > 0 ? "above" : "below"} the disk, out in the galaxy’s halo
          </p>
        </div>
      )}
      <p className="px-5 pb-5 pt-1 text-[0.9rem] leading-relaxed text-white/70 sm:px-6">{caption}</p>
    </div>
  );
}
