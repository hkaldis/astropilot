import { useId } from "react";
import { Ruler } from "lucide-react";
import { nice, type BarLook, type ScaleStory, type ScaleVisual } from "@shared/scale";

const W = 360;

function Text({ x, y, children, anchor = "middle", className = "fill-foreground/70", size = 10 }: { x: number; y: number; children: React.ReactNode; anchor?: "start" | "middle" | "end"; className?: string; size?: number }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} className={className}>
      {children}
    </text>
  );
}

/** Spheres side by side, to scale, standing on one line; anything too small to see is marked with a ring. */
function Discs({ v }: { v: Extract<ScaleVisual, { kind: "discs" }> }) {
  const uid = useId().replace(/:/g, "");
  const H = 150;
  const maxR = Math.max(...v.items.map((i) => i.r));
  const gap = 18;
  // Each slot is as wide as its sphere or its name, whichever is wider, so small neighbours' labels don't collide;
  // three big spheres in a row are shrunk to fit the width.
  const layout = (k: number) => {
    const widths = v.items.map((i) => Math.max(2 * i.r * k, i.label.length * 5.8 + 4, 8));
    return { k, widths, total: widths.reduce((a, b) => a + b, 0) + gap * (v.items.length - 1) };
  };
  let { k, widths, total } = layout((H / 2 - 14) / maxR);
  if (total > W - 12) ({ k, widths, total } = layout((k * (W - 12)) / total));
  let x = (W - total) / 2;
  const base = H - 28;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={v.caption}>
      <defs>
        {/* A sphere: its colour, a soft highlight towards the light, and darker edges. */}
        <radialGradient id={`${uid}hi`} cx="0.36" cy="0.32" r="0.7">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}limb`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.62" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.38" />
        </radialGradient>
      </defs>
      <line x1={8} x2={W - 8} y1={base} y2={base} className="stroke-border" strokeDasharray="2 3" />
      {v.items.map((it, i) => {
        const r = Math.max(it.r * k, 0.6);
        const cx = x + widths[i] / 2;
        x += widths[i] + gap;
        const tiny = r < 2.5;
        return (
          <g key={it.label}>
            <circle cx={cx} cy={base - r} r={r} fill={it.color} />
            <circle cx={cx} cy={base - r} r={r} fill={`url(#${uid}limb)`} />
            <circle cx={cx} cy={base - r} r={r} fill={`url(#${uid}hi)`} />
            {tiny && <circle cx={cx} cy={base - r} r={6} fill="none" className="stroke-foreground/50" strokeWidth={0.8} />}
            <Text x={cx} y={base + 15} className={it.main ? "fill-foreground font-medium" : "fill-muted-foreground"} size={10.5}>
              {it.label}
            </Text>
          </g>
        );
      })}
    </svg>
  );
}

/** A giant star drawn in the Sun's place, with the planets' orbits to scale. */
function Orbits({ v }: { v: Extract<ScaleVisual, { kind: "orbits" }> }) {
  const uid = useId().replace(/:/g, "");
  const H = 220;
  const c = { x: W / 2, y: H / 2 };
  const maxAu = Math.max(v.star.rAu, ...v.orbits.map((o) => o.au));
  const k = (H / 2 - 12) / maxAu;
  // The inner orbits sit a few pixels apart, so their names go in a column on the right, joined to each orbit by
  // a thin line; innermost at the top so the lines never cross.
  const lx = c.x + (H / 2 - 12) + 14;
  const top = c.y - 15 * v.orbits.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={v.caption}>
      <defs>
        <radialGradient id={`${uid}star`}>
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="0.5" stopColor={v.star.color} stopOpacity="0.75" />
          <stop offset="0.95" stopColor={v.star.color} stopOpacity="0.45" />
          <stop offset="1" stopColor={v.star.color} stopOpacity="0.1" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} rx={12} className="fill-[#05070c]" />
      <circle cx={c.x} cy={c.y} r={v.star.rAu * k} fill={`url(#${uid}star)`} />
      {v.orbits.map((o, i) => {
        const inside = o.au < v.star.rAu;
        const r = o.au * k;
        const ly = top + 15 * i + 8;
        return (
          <g key={o.label}>
            <circle cx={c.x} cy={c.y} r={r} fill="none" stroke={inside ? "#fff" : "#9fb6ff"} strokeOpacity={inside ? 0.55 : 0.4} strokeDasharray={inside ? "2 3" : undefined} strokeWidth={0.9} />
            <polyline points={`${c.x + r},${c.y} ${lx - 18},${ly - 3} ${lx - 4},${ly - 3}`} fill="none" stroke="#fff" strokeOpacity={0.3} strokeWidth={0.6} />
            <circle cx={c.x + r} cy={c.y} r={1.3} className="fill-white/70" />
            <Text x={lx} y={ly} anchor="start" size={9.5} className={inside ? "fill-white/90" : "fill-white/55"}>
              {o.label}
            </Text>
          </g>
        );
      })}
      <circle cx={c.x} cy={c.y} r={1.6} className="fill-amber-200" />
      <Text x={c.x} y={c.y + 13} size={9} className="fill-amber-100/80">
        the Sun
      </Text>
    </svg>
  );
}

/** Our galaxy and another, side by side to scale. */
function Galaxies({ v }: { v: Extract<ScaleVisual, { kind: "galaxies" }> }) {
  const uid = useId().replace(/:/g, "");
  const H = 150;
  const maxD = Math.max(v.mw, v.obj.major);
  const k = (W / 2 - 24) / maxD;
  const cy = H / 2 - 6;
  const lx = W / 4 + 4;
  const rx = (3 * W) / 4 - 4;
  const glow = (id: string, color: string) => (
    <radialGradient id={`${uid}${id}`}>
      <stop offset="0" stopColor="#fff7e0" stopOpacity="0.95" />
      <stop offset="0.25" stopColor={color} stopOpacity="0.55" />
      <stop offset="1" stopColor={color} stopOpacity="0" />
    </radialGradient>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={v.caption}>
      <defs>
        {glow("mw", "#c9d6ff")}
        {glow("obj", "#e9d7ff")}
      </defs>
      <rect width={W} height={H} rx={12} className="fill-[#05070c]" />
      <ellipse cx={lx} cy={cy} rx={(v.mw / 2) * k} ry={(v.mw / 2) * k * 0.42} fill={`url(#${uid}mw)`} />
      <ellipse cx={rx} cy={cy} rx={(v.obj.major / 2) * k} ry={Math.max(1.5, (v.obj.minor / 2) * k)} fill={`url(#${uid}obj)`} />
      <Text x={lx} y={H - 12} size={10} className="fill-white/70">
        Milky Way
      </Text>
      <Text x={rx} y={H - 12} size={10} className="fill-white">
        {v.obj.label}
      </Text>
    </svg>
  );
}

/** A tiny seeded random generator, so a cluster's stars land in the same places on every render. */
function seeded(text: string) {
  let a = [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LOOK_COLOR: Record<BarLook, string> = {
  cloud: "#ff7aa6",
  reflection: "#8fb4ff",
  dark: "#a08468",
  starcloud: "#f2e2b8",
  ring: "#7fe8d8",
  shell: "#ff9466",
  cluster: "#cfdcff",
  globular: "#ffe2a6",
  pair: "#ffffff",
};

/** The object, drawn across [x, x + w] around the line y = cy: a glow, a ring, a shell, a spray of stars… */
function ObjectShape({ look, x, w, cy, ry, seed, uid }: { look: BarLook; x: number; w: number; cy: number; ry: number; seed: string; uid: string }) {
  const c = LOOK_COLOR[look];
  const cx = x + w / 2;
  const rx = w / 2;
  const glow = <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${uid}glow)`} />;
  if (look === "pair") {
    return (
      <g>
        <line x1={x} x2={x + w} y1={cy} y2={cy} stroke="#fff" strokeOpacity={0.35} strokeDasharray="3 3" />
        <circle cx={x} cy={cy} r={4} fill="#ffd9a0" />
        <circle cx={x + w} cy={cy} r={3.2} fill="#a9c4ff" />
      </g>
    );
  }
  if (look === "ring" || look === "shell") {
    return (
      <g>
        {glow}
        <ellipse cx={cx} cy={cy} rx={Math.max(rx - 1, 1)} ry={Math.max(ry - 1, 1)} fill="none" stroke={c} strokeOpacity={0.85} strokeWidth={look === "ring" ? 2 : 1.4} strokeDasharray={look === "shell" ? "4 2 1 2" : undefined} />
      </g>
    );
  }
  if (look === "cluster" || look === "globular" || look === "starcloud") {
    const rand = seeded(seed);
    const n = look === "globular" ? Math.round(Math.min(140, Math.max(14, w / 2))) : Math.round(Math.min(60, Math.max(6, w / 4)));
    const dots = Array.from({ length: n }, () => {
      const a = rand() * 2 * Math.PI;
      // A globular's stars crowd towards its centre; an open cluster's are spread loosely.
      const d = look === "globular" ? rand() ** 1.8 : Math.sqrt(rand());
      return { x: cx + Math.cos(a) * d * rx, y: cy + Math.sin(a) * d * ry, r: 0.6 + rand() * (look === "globular" ? 0.9 : 1.3) };
    });
    return (
      <g>
        {glow}
        {dots.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={c} fillOpacity={0.9} />
        ))}
      </g>
    );
  }
  return glow;
}

/**
 * The object across its width, and under it, to the same scale, a distance people know — from the Sun to a star they
 * can see. Dashed guides carry the object's edges down to that line, and faint copies of it show how many times it
 * fits.
 */
function Bars({ v }: { v: Extract<ScaleVisual, { kind: "bars" }> }) {
  const uid = useId().replace(/:/g, "");
  const H = 132;
  const x0 = 16;
  const k = (W - 2 * x0) / Math.max(v.obj.size, v.stick.size);
  const ow = Math.max(v.obj.size * k, 3);
  const sw = Math.max(v.stick.size * k, 2);
  const oy = 50;
  const sy = 102;
  const ry = Math.min(20, Math.max(3, ow * 0.3));
  const fmt = (x: number) => `${x < 10 ? +x.toFixed(1) : nice(x)} ${v.unit}`;
  const fits = v.obj.size / v.stick.size;
  const copies = fits > 1.15 && sw >= 8 ? Math.floor(fits) : 0;
  const c = LOOK_COLOR[v.obj.look];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={v.caption}>
      <defs>
        <radialGradient id={`${uid}glow`}>
          <stop offset="0" stopColor="#fff" stopOpacity={v.obj.look === "dark" ? 0.25 : 0.7} />
          <stop offset="0.35" stopColor={c} stopOpacity={0.55} />
          <stop offset="1" stopColor={c} stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect width={W} height={H} rx={12} className="fill-[#05070c]" />
      <Text x={x0} y={20} anchor="start" size={11} className="fill-white">
        {v.obj.label} · {fmt(v.obj.size)}
      </Text>
      {/* The object's two edges, carried down to the yardstick. */}
      {[x0, x0 + ow].map((gx) => (
        <line key={gx} x1={gx} x2={gx} y1={oy - ry - 3} y2={sy + 6} stroke="#fff" strokeOpacity={0.22} strokeDasharray="2 3" />
      ))}
      <ObjectShape look={v.obj.look} x={x0} w={ow} cy={oy} ry={ry} seed={v.obj.label} uid={uid} />
      {fits > 1.15 && (
        <g>
          <line x1={x0 + sw} x2={x0 + ow} y1={sy} y2={sy} stroke="#fff" strokeOpacity={0.3} strokeDasharray="3 3" />
          {Array.from({ length: Math.max(0, copies - 1) }, (_, i) => (
            <line key={i} x1={x0 + (i + 2) * sw} x2={x0 + (i + 2) * sw} y1={sy - 3} y2={sy + 3} stroke="#fff" strokeOpacity={0.35} />
          ))}
          <Text x={x0 + ow} y={sy - 8} anchor="end" size={10} className="fill-white/60">
            {`×${fits < 10 ? +fits.toFixed(1) : nice(fits)}`}
          </Text>
        </g>
      )}
      <line x1={x0} x2={x0 + sw} y1={sy} y2={sy} stroke="#fff" strokeOpacity={0.8} strokeWidth={1.3} />
      {/* Smaller end dots when the yardstick is only a sliver, so they don't merge into one. */}
      {v.stick.from ? <circle cx={x0} cy={sy} r={sw < 12 ? 2 : 3.4} fill="#ffd27a" /> : <line x1={x0} x2={x0} y1={sy - 4} y2={sy + 4} stroke="#fff" strokeOpacity={0.8} />}
      <circle cx={x0 + sw} cy={sy} r={sw < 12 ? 2 : 3.4} fill={v.stick.color} />
      <Text x={x0} y={sy + 20} anchor="start" size={11} className="fill-white/75">
        {v.stick.from ? `${v.stick.from[0].toUpperCase()}${v.stick.from.slice(1)} → ${v.stick.to}` : v.stick.to} · {fmt(v.stick.size)}
      </Text>
    </svg>
  );
}

/** How big is it? A comparison to feel, a picture to scale, and the figures. */
export function HowBig({ s }: { s: ScaleStory }) {
  const v = s.visual;
  return (
    <div className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
        <Ruler className="h-3.5 w-3.5" /> How big is it?
      </div>
      <p className="mt-2 font-display text-[1.5rem] leading-tight tracking-tight sm:text-[1.8rem]">{s.headline}</p>
      {v && (
        <div className="mt-4">
          {v.kind === "discs" ? <Discs v={v} /> : v.kind === "orbits" ? <Orbits v={v} /> : v.kind === "galaxies" ? <Galaxies v={v} /> : <Bars v={v} />}
          <p className="mt-1 text-center text-[11px] text-muted-foreground">{v.caption}</p>
        </div>
      )}
      {s.lines.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2 text-[0.95rem] leading-relaxed text-foreground/85">
          {s.lines.map((l, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden="true" />
              <span>{l}</span>
            </li>
          ))}
        </ul>
      )}
      {s.stats.length > 0 && (
        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 sm:grid-cols-3">
          {s.stats.map((st) => (
            <div key={st.label} className="min-w-0">
              <dt className="eyebrow">{st.label}</dt>
              <dd className="num mt-0.5 text-[1rem] font-medium leading-tight">{st.value}</dd>
              {st.sub && <dd className="mt-0.5 text-2xs text-muted-foreground">{st.sub}</dd>}
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
