/**
 * A planet and its moons through the night: a live diagram (north up and east left, or flipped to match
 * your eyepiece), a time slider with play, each moon with how easy it is in your scope, and the night's
 * transits, shadow transits, eclipses and occultations.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Minus, Pause, Play, Plus, RotateCcw } from "lucide-react";
import { formatMag, formatTime, planetDisk, poleAngle, type MoonEvent, type MoonEventKind, type MoonId, type MoonPos, type SatelliteDetect } from "@shared/astro";
import { Skel } from "@/components/common/Page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DIFFICULTY_TONE } from "@/lib/objects";
import { store } from "@/lib/storage";
import { stagger } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { MoonSystem } from "./useMoonSystem";
import { whereText } from "./where";

type View = "sky" | "mirror" | "inverted";
const VIEWS: { id: View; label: string; hint: string }[] = [
  { id: "sky", label: "Sky", hint: "North up, east left — as on a star chart or in binoculars." },
  { id: "mirror", label: "Diagonal", hint: "Mirror image, as through a star diagonal (refractors and SCTs)." },
  { id: "inverted", label: "Newtonian", hint: "Turned upside down, as in a Newtonian or any scope without a diagonal." },
];

const DISK: Record<string, [string, string]> = {
  mars: ["#ec8a5c", "#7e2f19"],
  jupiter: ["#f3e2c4", "#9c7a55"],
  saturn: ["#f7e8bf", "#a88c55"],
  uranus: ["#d4f3f4", "#5fa9b2"],
  neptune: ["#7f9ff0", "#22398a"],
};

const ZOOMS = [1, 3, 9];
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

const EVENT_TEXT: Record<MoonEventKind, (moon: string, planet: string) => string> = {
  transit: (m, p) => `${m} crosses in front of ${p}`,
  shadow: (m, p) => `${m}'s shadow crosses ${p}`,
  occultation: (m, p) => `${m} passes behind ${p}`,
  eclipse: (m, p) => `${m} is eclipsed in ${p}'s shadow`,
};

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export interface PlanetLook {
  id: string;
  name: string;
  /** Apparent diameter, arcsec. */
  diameter: number;
  ringTilt?: number;
  raJ2000: number;
  decJ2000: number;
  distanceAu?: number;
}

export function MoonSystemPanel({
  system,
  planet,
  range,
  initial,
  now,
  tz,
  hour12,
  highlight,
  rate,
  altAt,
}: {
  system: MoonSystem;
  planet: PlanetLook;
  /** The time the slider covers (the night). */
  range: [number, number];
  /** Where the slider starts: now during the night, else the planet's best time. */
  initial: number;
  now: number;
  tz?: string;
  hour12?: boolean;
  highlight?: MoonId;
  /** How easy a moon is with the active instrument at that moment (null when the planet is down). */
  rate?: (p: MoonPos, t: number) => SatelliteDetect | null;
  /** The planet's altitude at a moment, for flagging events it is down for. */
  altAt?: (t: number) => number | null;
}) {
  const [w0, w1] = range;
  const [t, setT] = useState(() => clamp(initial, w0, w1));
  const [playing, setPlaying] = useState(false);
  const [zoomPick, setZoom] = useState<number | null>(null);
  const [view, setView] = useState<View>(() => store.get<View>("ap.moonView", "sky"));
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const fmt = (x: number) => formatTime(x, { tz, hour12 });

  // A new night (not a new minute) resets the slider.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setT(clamp(initial, w0, w1)), [w0, w1]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const speed = (w1 - w0) / 24_000; // the whole night in about 24 seconds
    const tick = (ms: number) => {
      const dt = Math.min(100, ms - last);
      last = ms;
      setT((cur) => {
        const next = cur + dt * speed;
        if (next >= w1) {
          setPlaying(false);
          return w1;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, w0, w1]);

  // How far each moon strays tonight, so the scale holds still while the time moves.
  const reachOf = useMemo(() => {
    const per = new Map<MoonId, { x: number; y: number }>();
    for (let s = w0; s <= w1; s += 30 * 60_000) {
      for (const p of system.at(s) ?? []) {
        const r = per.get(p.id) ?? { x: 0, y: 0 };
        per.set(p.id, { x: Math.max(r.x, Math.abs(p.dx)), y: Math.max(r.y, Math.abs(p.dy)) });
      }
    }
    return per;
  }, [system, w0, w1]);
  const reach = useMemo(() => {
    let x = 0;
    let y = 0;
    reachOf.forEach((r) => {
      x = Math.max(x, r.x);
      y = Math.max(y, r.y);
    });
    return { x, y };
  }, [reachOf]);

  const pos = system.at(t);
  const W = Math.max(width, 280);
  const H = clamp(Math.round(W * 0.36), 180, 250);
  const R0 = planet.diameter / 2;
  const k0 = Math.min((W / 2 - 34) / Math.max(reach.x, R0 * 2.4, 1), (H / 2 - 26) / Math.max(reach.y, R0 * 1.4, 1));
  const maxZoom = ZOOMS.reduce((m, z, i) => (R0 * k0 * z <= H * 0.22 ? i : m), 0);
  // Open as close in as still shows three moons in four (and the page's own moon): Saturn's far-flung
  // Iapetus shouldn't shrink the rest to a huddle. Moons beyond the frame get a marker at its edge.
  const defaultZoom = useMemo(() => {
    const fits = (id: MoonId, zi: number) => {
      const r = reachOf.get(id);
      return !!r && r.x * k0 * ZOOMS[zi] <= W / 2 - 34 && r.y * k0 * ZOOMS[zi] <= H / 2 - 26;
    };
    for (let zi = maxZoom; zi > 0; zi--) {
      const n = system.moons.filter((m) => fits(m.id, zi)).length;
      if (n >= 0.75 * system.moons.length && (!highlight || fits(highlight, zi))) return zi;
    }
    return 0;
  }, [reachOf, k0, W, H, maxZoom, system.moons, highlight]);
  const z = Math.min(zoomPick ?? defaultZoom, maxZoom);
  const k = k0 * ZOOMS[z];
  const cx = W / 2;
  const cy = H / 2;
  const sx = view === "sky" ? -1 : 1;
  const sy = view === "inverted" ? 1 : -1;
  const at = (dx: number, dy: number) => [cx + sx * dx * k, cy + sy * dy * k] as const;
  const R = Math.max(R0 * k, 3.2);
  const pa = poleAngle(planet.id, planet.raJ2000, planet.decJ2000) ?? 0;
  // Screen direction of the planet's equator (rings and belts) and of its north pole.
  const along = (deg: number) => {
    const [x1, y1] = at(Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180));
    return [(x1 - cx) / k, (y1 - cy) / k] as const;
  };
  const [ux, uy] = along(pa + 90);
  const [vx, vy] = along(pa);
  const ringAngle = (Math.atan2(uy, ux) * 180) / Math.PI;
  const [lit, deep] = DISK[planet.id] ?? ["#ddd", "#888"];
  // Oblate planets drawn as they look: Jupiter about 6% and Saturn up to 10% flatter than round.
  const disk = planet.distanceAu ? planetDisk(planet.id, planet.raJ2000, planet.decJ2000, planet.distanceAu) : null;
  const flat = disk ? disk.polar / disk.radius : 1;
  const tilt = planet.ringTilt;
  // A compass rose in the top-left corner, its arrows pointing north and east as this view shows them.
  const rose = { x: sx < 0 ? 26 : 10, y: sy < 0 ? 26 : 10 };
  const ROSE_BOX: [number, number, number, number] = [0, 0, 36, 36];
  const planetUp = altAt ? (altAt(t) ?? 0) > 0 : true;

  // Moons on screen, with labels kept apart.
  const shown = (pos ?? [])
    .map((p) => {
      const [x, y] = at(p.dx, p.dy);
      return { p, x, y, out: x < 6 || x > W - 6 || y < 6 || y > H - 6 };
    })
    .filter((m) => !m.p.occulted);
  const inside = shown.filter((m) => !m.out);
  const dot = (mag: number | null) => clamp(3.4 - 0.22 * ((mag ?? 10) - 5), 1.3, 3.6);
  // Labels: below, above, right or left of each moon — the first spot that's clear of the others and of
  // the planet; a moon whose every spot is taken stays unlabelled (the list below names it). The page's
  // own moon and the brightest are placed first.
  const labels = new Map<MoonId, { x: number; y: number; anchor: "start" | "middle" | "end" }>();
  {
    const boxes: [number, number, number, number][] = [[cx - R - 2, cy - R - 2, cx + R + 2, cy + R + 2], ROSE_BOX];
    const hit = (b: [number, number, number, number]) => b[0] < 2 || b[2] > W - 2 || b[1] < 2 || b[3] > H - 2 || boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
    const order = [...inside].sort((a, b) => Number(b.p.id === highlight) - Number(a.p.id === highlight) || (a.p.mag ?? 99) - (b.p.mag ?? 99));
    for (const { p, x, y } of order) {
      const r = dot(p.mag);
      boxes.push([x - r, y - r, x + r, y + r]);
    }
    for (const { p, x, y } of order) {
      const name = system.moons.find((m) => m.id === p.id)?.name ?? "";
      const w = name.length * 5.6 + 2;
      const r = dot(p.mag) + 2;
      const spots: { x: number; y: number; anchor: "start" | "middle" | "end"; box: [number, number, number, number] }[] = [
        { x, y: y + r + 9, anchor: "middle", box: [x - w / 2, y + r, x + w / 2, y + r + 11] },
        { x, y: y - r - 3, anchor: "middle", box: [x - w / 2, y - r - 11, x + w / 2, y - r] },
        { x: x + r + 2, y: y + 3.5, anchor: "start", box: [x + r + 1, y - 5.5, x + r + 3 + w, y + 5.5] },
        { x: x - r - 2, y: y + 3.5, anchor: "end", box: [x - r - 3 - w, y - 5.5, x - r - 1, y + 5.5] },
      ];
      const spot = spots.find((sp) => !hit(sp.box)) ?? (p.id === highlight ? spots[0] : null);
      if (spot) {
        boxes.push(spot.box);
        labels.set(p.id, { x: spot.x, y: spot.y, anchor: spot.anchor });
      }
    }
  }

  // The night's events, with double shadow transits called out.
  const events = system.events;
  const doubles = useMemo(() => {
    const sh = events.filter((e) => e.kind === "shadow");
    const out: { a: MoonEvent; b: MoonEvent; start: number; end: number }[] = [];
    for (let i = 0; i < sh.length; i++)
      for (let j = i + 1; j < sh.length; j++) {
        const s = Math.max(sh[i].start ?? w0, sh[j].start ?? w0);
        const e = Math.min(sh[i].end ?? w1, sh[j].end ?? w1);
        if (e > s) out.push({ a: sh[i], b: sh[j], start: s, end: e });
      }
    return out;
  }, [events, w0, w1]);

  const pct = (x: number) => ((x - w0) / (w1 - w0)) * 100;
  const nowIn = now >= w0 && now <= w1;

  return (
    <div className="flex flex-col gap-5">
      <div className="panel overflow-hidden">
        {/* Time and controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-3 py-2.5 sm:px-4">
          <div className="flex items-baseline gap-2">
            <span className="num text-xl font-medium leading-none">{fmt(t)}</span>
            <span className="text-xs text-muted-foreground">
              {nowIn && Math.abs(t - now) < 90_000 ? "now" : ""}
              {altAt && altAt(t) !== null ? `${nowIn && Math.abs(t - now) < 90_000 ? " · " : ""}${planet.name} ${Math.round(altAt(t)!)}° up` : ""}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div role="radiogroup" aria-label="Eyepiece view" className="inline-flex rounded-md border p-0.5">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  role="radio"
                  aria-checked={view === v.id}
                  title={v.hint}
                  onClick={() => {
                    setView(v.id);
                    store.set("ap.moonView", v.id);
                  }}
                  className={cn("rounded px-2 py-1 text-2xs transition-colors", view === v.id ? "bg-primary/15 font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Zoom out" disabled={z === 0} onClick={() => setZoom(Math.max(0, z - 1))}>
              <Minus />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Zoom in" disabled={z >= maxZoom} onClick={() => setZoom(Math.min(maxZoom, z + 1))}>
              <Plus />
            </Button>
          </div>
        </div>

        {/* The diagram */}
        <div ref={wrapRef} className="relative bg-surface-2 dark:bg-sky-night">
          {system.status === "loading" ? (
            <div className="grid place-items-center gap-2 py-10" style={{ height: H }}>
              <Skel className="h-3 w-48" />
              <p className="text-xs text-muted-foreground">Fetching positions from {system.source}…</p>
            </div>
          ) : system.status === "error" || !pos ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 text-center" style={{ height: H }}>
              <p className="text-sm text-muted-foreground">{system.status === "error" ? "Couldn't load the moons' positions just now." : "No positions for this moment."}</p>
              {system.status === "error" && (
                <Button variant="outline" size="sm" onClick={system.retry}>
                  Try again
                </Button>
              )}
            </div>
          ) : (
            <svg
              width={W}
              height={H}
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-label={`${planet.name} and its moons at ${fmt(t)}: ${(pos ?? [])
                .map((p) => {
                  const where = whereText(p, planet.name);
                  return `${system.moons.find((m) => m.id === p.id)?.name} ${where.charAt(0).toLowerCase()}${where.slice(1)}`;
                })
                .join("; ")}`}
              className="block animate-fade"
            >
              <defs>
                <radialGradient id={`disk-${planet.id}`} cx="0.38" cy="0.34" r="0.75">
                  <stop offset="0" stopColor={lit} />
                  <stop offset="1" stopColor={deep} />
                </radialGradient>
              </defs>
              {/* rings behind the globe */}
              {tilt !== undefined && (
                <ellipse cx={cx} cy={cy} rx={R * 2.27} ry={Math.max(0.6, R * 2.27 * Math.abs(Math.sin((tilt * Math.PI) / 180)))} transform={`rotate(${ringAngle} ${cx} ${cy})`} fill="none" stroke="#d8c08a" strokeOpacity={0.55} strokeWidth={Math.max(1, R * 0.32)} />
              )}
              <ellipse cx={cx} cy={cy} rx={R} ry={R * flat} transform={`rotate(${ringAngle} ${cx} ${cy})`} fill={`url(#disk-${planet.id})`} />
              {planet.id === "jupiter" && R > 8 && (
                <g stroke={deep} strokeOpacity={0.55} strokeWidth={Math.max(1, R * 0.12)}>
                  {[-0.32, 0.3].map((f) => {
                    const ox = vx * f * R * flat;
                    const oy = vy * f * R * flat;
                    const half = Math.sqrt(1 - f * f) * R * 0.98;
                    return <line key={f} x1={cx + ox - ux * half} y1={cy + oy - uy * half} x2={cx + ox + ux * half} y2={cy + oy + uy * half} />;
                  })}
                </g>
              )}
              {/* the near half of the rings, in front of the globe */}
              {tilt !== undefined &&
                (() => {
                  const a = R * 2.27;
                  const b = Math.max(0.6, a * Math.abs(Math.sin((tilt * Math.PI) / 180)));
                  const side = tilt >= 0 ? -1 : 1; // north face seen → the near side lies to the south
                  const pts = Array.from({ length: 25 }, (_, i) => {
                    const th = (i / 24) * Math.PI;
                    const c = Math.cos(th) * a;
                    const s = Math.sin(th) * b * side;
                    return `${(cx + ux * c + vx * s).toFixed(1)},${(cy + uy * c + vy * s).toFixed(1)}`;
                  });
                  return <polyline points={pts.join(" ")} fill="none" stroke="#e8d3a0" strokeOpacity={0.85} strokeWidth={Math.max(1, R * 0.32)} />;
                })()}
              {/* moons' shadows on the cloud tops */}
              {(pos ?? []).map((p) =>
                p.shadow ? <circle key={`sh-${p.id}`} cx={at(p.shadow.dx, p.shadow.dy)[0]} cy={at(p.shadow.dx, p.shadow.dy)[1]} r={Math.max(1.4, dot(p.mag) * 0.8)} fill="#0b0b10" /> : null,
              )}
              {/* moons */}
              {inside.map(({ p, x, y }, i) => {
                const meta = system.moons.find((m) => m.id === p.id)!;
                const hl = p.id === highlight;
                const r = dot(p.mag);
                const dim = p.eclipse === "total";
                return (
                  <g key={p.id} className="animate-fade" style={stagger(i, 40)}>
                    {hl && <circle cx={x} cy={y} r={r + 4} fill="none" className="stroke-primary" strokeWidth={1.4} />}
                    <circle
                      cx={x}
                      cy={y}
                      r={r}
                      className={dim ? "fill-none stroke-muted-foreground" : p.transit ? "fill-foreground stroke-black/60" : "fill-foreground"}
                      strokeWidth={dim ? 1 : p.transit ? 1 : 0}
                      opacity={dim ? 0.6 : 1}
                    />
                    {labels.has(p.id) && (
                      <text
                        x={labels.get(p.id)!.x}
                        y={labels.get(p.id)!.y}
                        textAnchor={labels.get(p.id)!.anchor}
                        className={cn("text-[10px]", hl ? "fill-primary font-semibold" : "fill-muted-foreground")}
                        style={{ paintOrder: "stroke", stroke: "hsl(var(--background) / 0.6)", strokeWidth: 3 }}
                      >
                        {meta.name}
                      </text>
                    )}
                  </g>
                );
              })}
              {/* moons beyond the frame: a marker at the edge pointing their way */}
              {shown
                .filter((m) => m.out)
                .map(({ p, x, y }) => {
                  const left = x < cx;
                  const ex = clamp(x, 14, W - 14);
                  // Clear of the compass rose (top left) and the horizon note (top right).
                  const ey = clamp(y, left ? ROSE_BOX[3] + 6 : planetUp ? 14 : 28, H - 14);
                  return (
                    <text key={`out-${p.id}`} x={ex} y={ey + 3} textAnchor={left ? "start" : "end"} className={cn("text-[9.5px]", p.id === highlight ? "fill-primary font-semibold" : "fill-muted-foreground")}>
                      {left ? `← ${system.moons.find((m) => m.id === p.id)?.name}` : `${system.moons.find((m) => m.id === p.id)?.name} →`}
                    </text>
                  );
                })}
              {/* compass rose */}
              <g aria-hidden="true">
                <path d={`M ${rose.x} ${rose.y + sy * 9} L ${rose.x} ${rose.y} L ${rose.x + sx * 9} ${rose.y}`} fill="none" className="stroke-muted-foreground" strokeOpacity={0.6} strokeWidth={1} />
                <g className="fill-muted-foreground text-[9px] font-medium" textAnchor="middle" dominantBaseline="central">
                  <text x={rose.x} y={rose.y + sy * 15.5}>
                    N
                  </text>
                  <text x={rose.x + sx * 15} y={rose.y}>
                    E
                  </text>
                </g>
              </g>
              {!planetUp && (
                <text x={W - 10} y={14} textAnchor="end" className="fill-q-poor text-[10px]">
                  {planet.name} is below the horizon
                </text>
              )}
            </svg>
          )}
        </div>

        {/* Time slider */}
        <div className="flex items-center gap-2.5 border-t px-3 py-2.5 sm:px-4">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={playing ? "Pause" : "Play the night"}
            onClick={() => {
              if (!playing && t >= w1 - 60_000) setT(w0);
              setPlaying((p) => !p);
            }}
            disabled={system.status !== "ready"}
          >
            {playing ? <Pause /> : <Play />}
          </Button>
          <div className="relative min-w-0 flex-1">
            <input
              type="range"
              min={w0}
              max={w1}
              step={60_000}
              value={Math.round(t)}
              onChange={(e) => {
                setPlaying(false);
                setT(Number(e.target.value));
              }}
              aria-label="Time"
              aria-valuetext={fmt(t)}
              className="w-full accent-[hsl(var(--primary))]"
            />
            {nowIn && <span className="pointer-events-none absolute -bottom-1.5 h-1.5 w-px bg-gold" style={{ left: `${pct(now)}%` }} aria-hidden="true" />}
          </div>
          {nowIn && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPlaying(false);
                setT(now);
              }}
            >
              <RotateCcw /> Now
            </Button>
          )}
        </div>
      </div>

      {/* The moons */}
      <ul className="flex flex-col divide-y divide-border/70 rounded-xl border">
        {system.moons.map((m, i) => {
          const p = pos?.find((x) => x.id === m.id) ?? null;
          const r = p && rate && !p.occulted && p.eclipse !== "total" ? rate(p, t) : null;
          const hl = m.id === highlight;
          return (
            <li key={m.id} className={cn("flex animate-rise items-center gap-3 px-3 py-2.5 sm:px-4", hl && "bg-primary/[0.06]")} style={stagger(i, 35)}>
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  {hl ? (
                    <span className="font-medium">{m.name}</span>
                  ) : (
                    <Link href={`/object/${m.id}`} className="font-medium hover:underline">
                      {m.name}
                    </Link>
                  )}
                  <span className="num text-xs text-muted-foreground"> · mag {formatMag(p?.mag ?? m.mag)}</span>
                </div>
                <div className="text-xs text-muted-foreground">{p ? whereText(p, planet.name) : "—"}</div>
              </div>
              {p && (p.occulted || p.eclipse === "total") ? (
                <Badge variant="outline">Hidden</Badge>
              ) : r ? (
                <Badge variant={DIFFICULTY_TONE[r.difficulty] ?? "outline"} title={r.note}>
                  {r.difficulty.charAt(0).toUpperCase() + r.difficulty.slice(1)}
                </Badge>
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* Tonight's events */}
      {(events.length > 0 || doubles.length > 0) && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Tonight's moon events</h3>
          <ul className="flex flex-col gap-1">
            {doubles.map((d) => (
              <li key={`dbl-${d.start}`}>
                <button
                  onClick={() => {
                    setPlaying(false);
                    setT(clamp(d.start + Math.min(60_000, (d.end - d.start) / 2), w0, w1));
                  }}
                  className="flex w-full items-baseline gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/60"
                >
                  <span className="num w-28 shrink-0 text-xs font-medium text-gold">
                    {fmt(d.start)}–{fmt(d.end)}
                  </span>
                  <span className="font-medium text-gold">
                    Double shadow transit: {system.moons.find((m) => m.id === d.a.moon)?.name} and {system.moons.find((m) => m.id === d.b.moon)?.name}
                  </span>
                </button>
              </li>
            ))}
            {events.map((e, i) => {
              const name = system.moons.find((m) => m.id === e.moon)?.name ?? e.moon;
              const mid = ((e.start ?? w0) + (e.end ?? w1)) / 2;
              const down = altAt ? (altAt(mid) ?? 0) <= 0 : false;
              const approx = e.approx ? "≈" : "";
              const when = e.start !== null && e.end !== null ? `${approx}${fmt(e.start)}–${fmt(e.end)}` : e.start !== null ? `from ${approx}${fmt(e.start)}` : e.end !== null ? `until ${approx}${fmt(e.end)}` : "all night";
              return (
                <li key={`${e.moon}-${e.kind}-${e.start ?? "x"}-${i}`}>
                  <button
                    onClick={() => {
                      setPlaying(false);
                      // Land just inside the event, so the diagram shows it under way.
                      const into = e.start !== null ? e.start + Math.min(60_000, ((e.end ?? e.start + 120_000) - e.start) / 2) : (e.end ?? t) - 60_000;
                      setT(clamp(into, w0, w1));
                    }}
                    className={cn("flex w-full items-baseline gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/60", down && "opacity-55")}
                  >
                    <span className="num w-28 shrink-0 text-xs">{when}</span>
                    <span className="min-w-0">
                      {EVENT_TEXT[e.kind](name, planet.name)}
                      {down && <span className="text-xs text-muted-foreground"> — {planet.name} is down</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="text-2xs text-muted-foreground">
        Positions from {system.source}. {VIEWS.find((v) => v.id === view)!.hint} Tap an event to jump to it; times in {tz ?? "your time zone"}.
      </p>
    </div>
  );
}
