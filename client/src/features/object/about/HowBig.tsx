import { useId } from "react";
import { Ruler } from "lucide-react";
import { SIZE_MILESTONES, type ScaleStory, type ScaleVisual } from "@shared/scale";
import { cn } from "@/lib/utils";

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

/** A log scale from Earth to the Milky Way, with the object's width marked. */
function SizeRuler({ v }: { v: Extract<ScaleVisual, { kind: "ruler" }> }) {
  const lo = Math.log10(5e3);
  const hi = Math.log10(Math.max(2e18, v.km * 4));
  const pos = (kmv: number) => (Math.log10(kmv) - lo) / (hi - lo);
  const x = Math.min(1, Math.max(0, pos(v.km)));
  return (
    <div className="relative mt-1 h-[4.5rem] select-none" aria-hidden="true">
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-border via-foreground/30 to-border" />
      {SIZE_MILESTONES.map((m, i) => {
        const mx = pos(m.km);
        return (
          <div key={m.label} className="absolute top-1/2" style={{ left: `${mx * 100}%` }}>
            <div className="h-2 w-px -translate-y-1/2 bg-foreground/40" />
            <div
              className={cn(
                "absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] leading-none text-muted-foreground",
                i % 2 ? "top-2" : "bottom-3",
                mx < 0.08 && "translate-x-[-15%]",
                mx > 0.9 && "translate-x-[-85%]",
              )}
            >
              {m.label}
            </div>
          </div>
        );
      })}
      <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${x * 100}%` }}>
        <span className="block h-3.5 w-3.5 rounded-full bg-primary shadow-[0_0_12px_3px_hsl(var(--primary)/0.45)]" />
      </div>
    </div>
  );
}

/** How big is it? A comparison to feel, a picture to scale, and the figures. */
export function HowBig({ s, name }: { s: ScaleStory; name: string }) {
  const v = s.visual;
  return (
    <div className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
        <Ruler className="h-3.5 w-3.5" /> How big is it?
      </div>
      <p className="mt-2 font-display text-[1.5rem] leading-tight tracking-tight sm:text-[1.8rem]">{s.headline}</p>
      {v && (
        <div className="mt-4">
          {v.kind === "discs" ? <Discs v={v} /> : v.kind === "orbits" ? <Orbits v={v} /> : v.kind === "galaxies" ? <Galaxies v={v} /> : <SizeRuler v={v} />}
          {v.kind === "ruler" ? (
            <p className="mt-1 text-center text-[11px] text-muted-foreground">Sizes on a scale that grows tenfold every step — {name} is the bright dot</p>
          ) : (
            <p className="mt-1 text-center text-[11px] text-muted-foreground">{v.caption}</p>
          )}
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
