import { useId, useMemo } from "react";
import { Map as MapIcon } from "lucide-react";
import { SUN_GALACTOCENTRIC_LY, galacticXYZ, niceYears, toGalactic } from "@shared/lookback";
import { formatLightYears } from "@shared/stories";

const R0 = SUN_GALACTOCENTRIC_LY;
const SIZE = 400;
const C = SIZE / 2;
/** The galaxy drawing's scale: px per light-year (a 50,000-ly radius fills 172 px). */
const KG = 172 / 50_000;

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

/** Galactic-plane position relative to the Sun in light-years, as drawn: towards the centre is up (−y). */
function planeOffset(ra: number, dec: number, d: number) {
  const p = galacticXYZ(ra, dec, d);
  return { dx: -p.y, dy: -p.x, z: p.z, x: p.x };
}

/**
 * The spiral arms: four logarithmic spirals (pitch 14.6°) leaving a central bar, placed so the Sun lies between the
 * Sagittarius Arm (about 5,000 ly towards the centre) and the Perseus Arm (about 6,000 ly outwards), inside the
 * short Orion Arm — close to the picture from maser parallaxes (Reid et al. 2019).
 */
const TAN_PITCH = Math.tan((14.6 * Math.PI) / 180);
const ARM_R0 = 9500;
const ARM0 = (88.3 * Math.PI) / 180;
const ARMS = [0, 1, 2, 3].map((j) => ARM0 + (j * Math.PI) / 2);
/** Perseus and Scutum–Centaurus are the major arms; Sagittarius and Norma/Outer the fainter ones. */
const MAJOR = [false, true, false, true];
const T_MAX = 6.6;
const SAG_GAP = R0 - ARM_R0 * Math.exp(TAN_PITCH * (1.5 * Math.PI - ARMS[0])); // ≈ 5,000 ly
const PER_GAP = ARM_R0 * Math.exp(TAN_PITCH * (3.5 * Math.PI - ARMS[3])) - R0; // ≈ 6,000 ly

const arm = (phi0: number, t: number, r0 = ARM_R0) => {
  const r = r0 * Math.exp(TAN_PITCH * t) * KG;
  return { x: C + r * Math.cos(phi0 + t), y: C - r * Math.sin(phi0 + t) };
};
function armPath(phi0: number, from = 0, to = T_MAX, r0 = ARM_R0) {
  const pts: string[] = [];
  for (let t = from; t <= to + 1e-9; t += 0.05) {
    const p = arm(phi0, t, r0);
    pts.push(`${p.x.toFixed(2)},${p.y.toFixed(2)}`);
  }
  return `M${pts.join("L")}`;
}
/** The Orion (Local) Arm: a short spur through the Sun's neighbourhood, its centre line a little outside the Sun. */
const ORION = { r0: R0 + 300, phi0: 1.5 * Math.PI, from: -0.5, to: 0.42 };
const orionPath = () => armPath(ORION.phi0, ORION.from, ORION.to, ORION.r0);

/** Star dust scattered along the arms (seeded, so the picture never changes). */
const DUST = (() => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pts: { t: number; arm: number; dr: number; da: number; o: number; s: number }[] = [];
  for (let i = 0; i < 420; i++) pts.push({ arm: i % 4, t: rnd() * (T_MAX - 0.2), dr: (rnd() - 0.5) * 0.22, da: (rnd() - 0.5) * 0.12, o: 0.15 + rnd() * 0.55, s: 0.35 + rnd() * 0.75 });
  return pts;
})();

function Label({ x, y, children, anchor = "middle", className = "fill-white/45", size = 9 }: { x: number; y: number; children: React.ReactNode; anchor?: "start" | "middle" | "end"; className?: string; size?: number }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} className={className} style={{ paintOrder: "stroke", stroke: "#05070c", strokeWidth: 3, strokeLinejoin: "round" }}>
      {children}
    </text>
  );
}

/** The object: a pulsing dot, its name on the side away from `from` (the Sun) and away from the edges. */
function Marker({ x, y, name, from, width = SIZE }: { x: number; y: number; name: string; from?: { x: number; y: number }; width?: number }) {
  const right = from ? (Math.abs(x - from.x) < 4 ? x < width * 0.62 : x >= from.x) && x < width - 90 : x < width * 0.62;
  const dy = from && Math.abs(x - from.x) < 30 ? (y < from.y ? -8 : 12) : 3.5;
  return (
    <g>
      <circle cx={x} cy={y} r={5} className="map-pulse fill-none stroke-sky-300" strokeWidth={1.5} />
      <circle cx={x} cy={y} r={4} className="fill-sky-300" />
      <Label x={x + (right ? 9 : -9)} y={y + dy} anchor={right ? "start" : "end"} className="fill-sky-100" size={11}>
        {name}
      </Label>
    </g>
  );
}

function SunMark({ x, y, label, labelAt = "below", size = 9.5 }: { x: number; y: number; label: string; labelAt?: "below" | "above" | "left"; size?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={3.5} className="fill-amber-200" />
      <circle cx={x} cy={y} r={7} className="fill-amber-200/20" />
      <Label
        x={labelAt === "left" ? x - 13 : x}
        y={labelAt === "below" ? y + 18 : labelAt === "above" ? y - 11 : y + 3.5}
        anchor={labelAt === "left" ? "end" : "middle"}
        className="fill-amber-100/85"
        size={size}
      >
        {label}
      </Label>
    </g>
  );
}

/** The Milky Way's disk, arms, bar and dust, in a 400 × 400 box with the centre at (200, 200). */
function GalaxyArt({ uid, labels = true, fs = 1 }: { uid: string; labels?: boolean; fs?: number }) {
  const sag = arm(ARMS[0], 2.35);
  const per = arm(ARMS[3], 5.75);
  const scu = arm(ARMS[1], 4.3);
  return (
    <g>
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
            <path key={a} d={armPath(a)} fill="none" stroke="#9fb6ff" strokeWidth={MAJOR[j] ? 19 : 11} strokeOpacity={MAJOR[j] ? 0.6 : 0.38} strokeLinecap="round" />
          ))}
          <path d={orionPath()} fill="none" stroke="#9fb6ff" strokeWidth={8} strokeOpacity={0.35} strokeLinecap="round" />
        </g>
        {ARMS.map((a, j) => (
          <path key={a} d={armPath(a)} fill="none" stroke="#dbe5ff" strokeWidth={MAJOR[j] ? 1.2 : 0.7} strokeOpacity={MAJOR[j] ? 0.45 : 0.3} strokeLinecap="round" />
        ))}
        <path d={orionPath()} fill="none" stroke="#dbe5ff" strokeWidth={0.6} strokeOpacity={0.3} strokeLinecap="round" />
        {DUST.map((p, i) => {
          const r = ARM_R0 * Math.exp(TAN_PITCH * p.t) * (1 + p.dr) * KG;
          const a = ARMS[p.arm] + p.t + p.da;
          return <circle key={i} cx={C + r * Math.cos(a)} cy={C - r * Math.sin(a)} r={p.s} fill="#e6edff" opacity={p.o} />;
        })}
      </g>
      <ellipse cx={C} cy={C} rx={40} ry={17} transform={`rotate(${-62} ${C} ${C})`} fill={`url(#${uid}bulge)`} />
      {labels && (
        <>
          <Label x={C} y={C + 4} className="fill-white/60" size={9 * fs}>
            Galactic centre
          </Label>
          <Label x={sag.x} y={sag.y} size={8.5 * fs}>
            Sagittarius Arm
          </Label>
          <Label x={per.x} y={per.y} size={8.5 * fs}>
            Perseus Arm
          </Label>
          <Label x={scu.x} y={scu.y} size={8.5 * fs}>
            Scutum–Centaurus Arm
          </Label>
        </>
      )}
    </g>
  );
}

function ScaleBar({ x, y, ly, k }: { x: number; y: number; ly: number; k: number }) {
  const w = ly * k;
  return (
    <g transform={`translate(${x - w} ${y})`}>
      <line x1={0} x2={w} y1={0} y2={0} className="stroke-white/50" strokeWidth={1} />
      <line x1={0} x2={0} y1={-3} y2={3} className="stroke-white/50" />
      <line x1={w} x2={w} y1={-3} y2={3} className="stroke-white/50" />
      <Label x={w / 2} y={-6} size={8.5}>
        {ly.toLocaleString("en-US")} ly
      </Label>
    </g>
  );
}

/** The whole Milky Way seen from above, the Sun, and the object (for objects too far for the close-up). */
function MilkyWay({ name, ra, dec, d }: { name: string; ra: number; dec: number; d: number }) {
  const uid = useId().replace(/:/g, "");
  const sun = { x: C, y: C + R0 * KG };
  const o = planeOffset(ra, dec, d);
  const obj = { x: sun.x + o.dx * KG, y: sun.y + o.dy * KG };
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="block h-auto w-full" role="img" aria-label={`Map of the Milky Way from above, showing the Sun and ${name}`}>
      <GalaxyArt uid={uid} />
      <line x1={sun.x} y1={sun.y} x2={obj.x} y2={obj.y} className="stroke-sky-200/70" strokeWidth={1.2} strokeDasharray="3 3" />
      <SunMark x={sun.x} y={sun.y} label="The Sun" />
      <Marker x={obj.x} y={obj.y} name={name} from={sun} />
      <ScaleBar x={SIZE - 22} y={SIZE - 18} ly={10_000} k={KG} />
    </svg>
  );
}

/** A round number of light-years for the close-up's radius, big enough to hold the object comfortably. */
function zoomRadius(d: number) {
  const want = Math.max(d * 1.5, 600);
  return [600, 800, 1000, 1500, 2000, 3000, 4000, 5000, 6000, 8000].find((r) => r >= want) ?? want;
}

/** Points where two lines touch both circles on the outside — the "cone" from a magnifier to its enlargement. */
function outerTangents(a: { x: number; y: number; r: number }, b: { x: number; y: number; r: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const D = Math.hypot(dx, dy);
  const ux = dx / D;
  const uy = dy / D;
  const c = (b.r - a.r) / D;
  const s = Math.sqrt(Math.max(0, 1 - c * c));
  return [1, -1].map((sign) => {
    const nx = -c * ux - sign * s * uy;
    const ny = -c * uy + sign * s * ux;
    return { x1: a.x + a.r * nx, y1: a.y + a.r * ny, x2: b.x + b.r * nx, y2: b.y + b.r * ny };
  });
}

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Where a label fits beside a point inside a circle: to the right, left, above or below, avoiding other labels.
 * Widths are estimated from the character count.
 */
function placeLabel(x: number, y: number, text: string, fs: number, circle: { x: number; y: number; r: number }, avoid: Box[], prefer: "right" | "left") {
  const w = text.length * fs * 0.56;
  const h = fs;
  const gap = 9;
  const options = [
    { side: "right", tx: x + gap, ty: y + h * 0.35, anchor: "start" as const, box: { x: x + gap, y: y - h * 0.65, w, h } },
    { side: "left", tx: x - gap, ty: y + h * 0.35, anchor: "end" as const, box: { x: x - gap - w, y: y - h * 0.65, w, h } },
    { side: "above", tx: x, ty: y - gap, anchor: "middle" as const, box: { x: x - w / 2, y: y - gap - h, w, h } },
    { side: "below", tx: x, ty: y + gap + h * 0.8, anchor: "middle" as const, box: { x: x - w / 2, y: y + gap, w, h } },
  ];
  if (prefer === "left") [options[0], options[1]] = [options[1], options[0]];
  const inside = (b: Box) => [b.x, b.x + b.w].every((px) => [b.y, b.y + b.h].every((py) => Math.hypot(px - circle.x, py - circle.y) < circle.r - 5));
  return options.find((o) => inside(o.box) && !avoid.some((a) => overlaps(a, o.box))) ?? options[2];
}

/**
 * Nearby objects: the whole galaxy with a magnifier on the Sun, and the same patch enlarged beside it (or below it on
 * phones), joined by the magnifier's cone. The enlargement draws the very same arms, so the Orion Arm we live in, and
 * the Sagittarius and Perseus Arms on either side, line up with the galaxy picture.
 */
function ZoomedGalaxy({ id, name, ra, dec, d, tall }: { id: string; name: string; ra: number; dec: number; d: number; tall: boolean }) {
  const uid = useId().replace(/:/g, "") + (tall ? "t" : "w");
  const W = tall ? 420 : 860;
  const H = tall ? 862 : 420;
  const g = { x: 10, y: tall ? 2 : 10 }; // where the 400 × 400 galaxy box sits
  const sun = { x: g.x + C, y: g.y + C + R0 * KG };
  const Z = tall ? { x: 210, y: 652, r: 196 } : { x: 648, y: 212, r: 196 };
  const R = zoomRadius(d);
  const kz = (Z.r - 14) / R;
  const mag = kz / KG;
  const loupe = { ...sun, r: 9 };
  const cone = outerTangents(loupe, Z);
  // The close-up shows the galaxy drawing itself, enlarged about the Sun.
  const zoomT = `translate(${Z.x} ${Z.y}) scale(${mag}) translate(${-(C)} ${-(C + R0 * KG)})`;
  const o = planeOffset(ra, dec, d);
  const obj = { x: Z.x + o.dx * kz, y: Z.y + o.dy * kz };
  const step = R <= 800 ? 200 : R <= 1500 ? 500 : R <= 3000 ? 1000 : 2000;
  const rings = Array.from({ length: 8 }, (_, i) => (i + 1) * step).filter((r) => r < R * 0.98);
  const others = NEIGHBOURS.filter((n) => n.id !== id && n.d < R * 0.95)
    .map((n) => {
      const p = planeOffset(n.ra, n.dec, n.d);
      return { ...n, x: Z.x + p.dx * kz, y: Z.y + p.dy * kz };
    })
    .filter((n) => Math.hypot(n.x - obj.x, n.y - obj.y) > 28 && Math.hypot(n.x - Z.x, n.y - Z.y) > 24);
  // Where the labels go along the cone, and the side of the Sun its name sits on (clear of the cone).
  const gapD = Math.hypot(Z.x - loupe.x, Z.y - loupe.y);
  const along = loupe.r + (gapD - Z.r - loupe.r) / 2; // halfway across the gap between the magnifier and the enlargement
  const mid = { x: loupe.x + ((Z.x - loupe.x) / gapD) * along, y: loupe.y + ((Z.y - loupe.y) / gapD) * along };
  const orionLabel = { x: Z.x + Z.r * 0.42, y: Z.y + 300 * kz + Math.tan((14.6 * Math.PI) / 180) * Z.r * 0.42 - 6 };
  const magText = mag >= 100 ? `${Math.round(mag / 10) * 10}×` : `${Math.round(mag)}×`;
  // Phones show the tall layout smaller, so its labels are set larger.
  const fs = tall ? 1.35 : 1.1;
  const sunBelow = !(obj.y > Z.y + 8 && Math.abs(obj.x - Z.x) < 50);
  const sunLabelBox: Box = { x: Z.x - 24 * fs, y: sunBelow ? Z.y + 8 : Z.y - 12 - 10 * fs, w: 48 * fs, h: 11 * fs };
  const objLabel = placeLabel(obj.x, obj.y, name, 11 * fs, Z, [sunLabelBox, { x: Z.x - 8, y: Z.y - 8, w: 16, h: 16 }], obj.x < Z.x ? "left" : "right");
  const others2 = others.filter((n) => !overlaps({ x: n.x - n.name.length * 2.6 * fs, y: n.y - 6 - 9 * fs, w: n.name.length * 5.2 * fs, h: 9 * fs }, objLabel.box) && !overlaps({ x: n.x - 30, y: n.y - 16 * fs, w: 60, h: 16 * fs }, sunLabelBox));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`The Milky Way from above with the Sun's neighbourhood enlarged ${magText}, showing ${name}`}>
      <defs>
        <clipPath id={`${uid}clip`}>
          <circle cx={Z.x} cy={Z.y} r={Z.r} />
        </clipPath>
        <linearGradient id={`${uid}cone`} x1={loupe.x} y1={loupe.y} x2={Z.x} y2={Z.y} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7dd3fc" stopOpacity="0.85" />
          <stop offset="1" stopColor="#7dd3fc" stopOpacity="0.25" />
        </linearGradient>
      </defs>

      {/* The whole galaxy, with a magnifier on the Sun. */}
      <g transform={`translate(${g.x} ${g.y})`}>
        <GalaxyArt uid={uid} fs={fs} />
      </g>
      <SunMark x={sun.x} y={sun.y} label="You are here" labelAt={tall ? "left" : "below"} size={9.5 * fs} />
      <ScaleBar x={g.x + SIZE - 22} y={g.y + SIZE - 18} ly={10_000} k={KG} />

      {/* The magnifier's cone. */}
      <path d={`M${cone[0].x1},${cone[0].y1} L${cone[0].x2},${cone[0].y2} L${cone[1].x2},${cone[1].y2} L${cone[1].x1},${cone[1].y1} Z`} fill="#7dd3fc" fillOpacity={0.05} />
      {cone.map((c, i) => (
        <line key={i} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} stroke={`url(#${uid}cone)`} strokeWidth={1} />
      ))}
      <circle cx={loupe.x} cy={loupe.y} r={loupe.r} fill="none" stroke="#7dd3fc" strokeOpacity={0.9} strokeWidth={1.3} />
      <Label x={mid.x + (tall ? 16 : 0)} y={mid.y + (tall ? 4 : -12)} anchor={tall ? "start" : "middle"} size={10 * fs} className="fill-sky-200/90">
        {magText} closer
      </Label>

      {/* The enlargement: the same galaxy drawing, scaled up around the Sun, with the arms near us. */}
      <circle cx={Z.x} cy={Z.y} r={Z.r} fill="#070b16" />
      <g clipPath={`url(#${uid}clip)`}>
        <g transform={zoomT}>
          {/* The arms at about their real width (roughly 1,000 ly, Reid et al. 2014), with a faint glow around them. */}
          {[ARMS[0], ARMS[3]].map((a) => (
            <g key={a}>
              <path d={armPath(a)} fill="none" stroke="#9fb6ff" strokeOpacity={0.06} strokeWidth={3000 * KG} />
              <path d={armPath(a)} fill="none" stroke="#9fb6ff" strokeOpacity={0.13} strokeWidth={1200 * KG} />
            </g>
          ))}
          <path d={orionPath()} fill="none" stroke="#9fb6ff" strokeOpacity={0.07} strokeWidth={2800 * KG} strokeLinecap="round" />
          <path d={orionPath()} fill="none" stroke="#9fb6ff" strokeOpacity={0.15} strokeWidth={1200 * KG} strokeLinecap="round" />
        </g>
        {rings.map((r) => (
          <g key={r}>
            <circle cx={Z.x} cy={Z.y} r={r * kz} fill="none" className="stroke-white/12" strokeDasharray="2 4" />
            <Label x={Z.x + r * kz * 0.71 + 3} y={Z.y - r * kz * 0.71 - 3} anchor="start" size={8 * fs} className="fill-white/35">
              {r.toLocaleString("en-US")} ly
            </Label>
          </g>
        ))}
        <Label x={orionLabel.x} y={orionLabel.y} size={9 * fs} className="fill-indigo-100/60">
          Orion Arm
        </Label>
        {others2.map((n) => (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r={2.2} className="fill-white/50" />
            <Label x={n.x} y={n.y - 6} size={8.5 * fs} className="fill-white/55">
              {n.name}
            </Label>
          </g>
        ))}
        <line x1={Z.x} y1={Z.y} x2={obj.x} y2={obj.y} className="stroke-sky-200/70" strokeWidth={1.2} strokeDasharray="3 3" />
        <g>
          <circle cx={Z.x} cy={Z.y} r={3.5} className="fill-amber-200" />
          <circle cx={Z.x} cy={Z.y} r={7} className="fill-amber-200/20" />
          <Label x={Z.x} y={sunBelow ? Z.y + 8 + 9.5 * fs : Z.y - 12} size={9.5 * fs} className="fill-amber-100/85">
            The Sun
          </Label>
        </g>
        <circle cx={obj.x} cy={obj.y} r={5} className="map-pulse fill-none stroke-sky-300" strokeWidth={1.5} />
        <circle cx={obj.x} cy={obj.y} r={4} className="fill-sky-300" />
        <Label x={objLabel.tx} y={objLabel.ty} anchor={objLabel.anchor} size={11 * fs} className="fill-sky-100">
          {name}
        </Label>
        {/* Which way the neighbouring arms lie. */}
        <Label x={Z.x} y={Z.y - Z.r + 16 + 9 * fs} size={8.5 * fs} className="fill-white/55">
          ↑ Sagittarius Arm, ~{niceYears(SAG_GAP)} ly
        </Label>
        <Label x={Z.x} y={Z.y - Z.r + 18 + 19 * fs} size={8 * fs} className="fill-white/40">
          and the Galactic centre beyond
        </Label>
        <Label x={Z.x} y={Z.y + Z.r - 14} size={8.5 * fs} className="fill-white/55">
          ↓ Perseus Arm, ~{niceYears(PER_GAP)} ly
        </Label>
      </g>
      <circle cx={Z.x} cy={Z.y} r={Z.r} fill="none" stroke="#7dd3fc" strokeOpacity={0.45} strokeWidth={1.3} />
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
        ? null
        : `Seen from above the Milky Way’s disk. ${name} lies ${formatLightYears(d)} from the Sun${Math.hypot(R0 - p.x, p.y) < R0 ? ", on the way towards the Galactic centre" : ""}.`;
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border bg-[#05070c] text-white">
      <div className="flex items-center gap-1.5 px-5 pt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-300/90 sm:px-6">
        <MapIcon className="h-3.5 w-3.5" /> {heading}
      </div>
      {view === "near" ? (
        <div className="px-2 pb-1 pt-3 sm:px-4">
          {/* Side by side on wider screens, one above the other on phones. */}
          <div className="hidden sm:block">
            <ZoomedGalaxy id={id} name={name} ra={ra} dec={dec} d={d} tall={false} />
          </div>
          <div className="mx-auto max-w-[26rem] sm:hidden">
            <ZoomedGalaxy id={id} name={name} ra={ra} dec={dec} d={d} tall />
          </div>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[30rem] p-3">{view === "cosmic" ? <Cosmic id={id} name={name} ra={ra} dec={dec} d={d} /> : <MilkyWay name={name} ra={ra} dec={dec} d={d} />}</div>
      )}
      {showEdge && (
        <div className="border-t border-white/10 px-3 pb-1 pt-3">
          <EdgeOn name={name} ra={ra} dec={dec} d={d} />
          <p className="pb-2 text-center text-[11px] text-white/45">
            Edge-on: {niceYears(Math.abs(p.z))} light-years {p.z > 0 ? "above" : "below"} the disk, out in the galaxy’s halo
          </p>
        </div>
      )}
      <p className="px-5 pb-5 pt-1 text-[0.9rem] leading-relaxed text-white/70 sm:px-6">
        {caption ?? (
          <>
            {name} is in our own corner of the Milky Way. <span className="hidden sm:inline">On the left, the whole galaxy from above; the ring around the Sun is enlarged on the right.</span>
            <span className="sm:hidden">Above, the whole galaxy from above; the ring around the Sun is enlarged below.</span> The Orion Arm we live in, and the Sagittarius and Perseus Arms on either side, are the same in both.
          </>
        )}
      </p>
    </div>
  );
}
