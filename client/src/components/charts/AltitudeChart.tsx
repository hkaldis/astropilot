/**
 * Altitude-through-the-night chart (hand-built SVG, theme tokens only).
 * Generic: give it a time domain, one or more altitude series, optional twilight bands,
 * a minimum-altitude line, a "now" marker, a highlighted window and a peak marker.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type SkyBandTone = "day" | "civil" | "nautical" | "astro" | "night";
export interface SkyBand {
  from: number;
  to: number;
  tone: SkyBandTone;
}

export interface AltitudePoint {
  t: number;
  alt: number;
}

export interface AltitudeSeries {
  id: string;
  label: string;
  points: AltitudePoint[];
  /** primary: the subject (bold, filled); moon: faint dashed gold; muted: thin grey comparison line. */
  variant?: "primary" | "moon" | "muted";
}

export interface AltitudeChartProps {
  start: number;
  end: number;
  series: AltitudeSeries[];
  bands?: SkyBand[];
  minAlt?: number | null;
  now?: number | null;
  /** e.g. the best observing window */
  highlight?: [number, number] | null;
  highlightLabel?: string;
  peak?: { t: number; alt: number } | null;
  tz?: string;
  hour12?: boolean;
  height?: number;
  className?: string;
  /** Screen-reader summary of what the chart shows. */
  ariaLabel: string;
  legend?: boolean;
}

/** Twilight bands from a night description (any of the instants may be null). */
export function twilightBands(
  n: {
    sunset: number | null;
    civilDusk: number | null;
    nauticalDusk: number | null;
    astroDusk: number | null;
    astroDawn: number | null;
    nauticalDawn: number | null;
    civilDawn: number | null;
    sunrise: number | null;
    darkness?: string;
  },
  start: number,
  end: number,
): SkyBand[] {
  const ev: { t: number | null; before: SkyBandTone; after: SkyBandTone }[] = [
    { t: n.sunset, before: "day", after: "civil" },
    { t: n.civilDusk, before: "civil", after: "nautical" },
    { t: n.nauticalDusk, before: "nautical", after: "astro" },
    { t: n.astroDusk, before: "astro", after: "night" },
    { t: n.astroDawn, before: "night", after: "astro" },
    { t: n.nauticalDawn, before: "astro", after: "nautical" },
    { t: n.civilDawn, before: "nautical", after: "civil" },
    { t: n.sunrise, before: "civil", after: "day" },
  ];
  const events = ev.filter((e): e is { t: number; before: SkyBandTone; after: SkyBandTone } => e.t !== null && e.t > start && e.t < end).sort((a, b) => a.t - b.t);
  if (!events.length) return [{ from: start, to: end, tone: n.darkness === "astronomical" ? "night" : n.sunset === null && n.sunrise === null ? "day" : "nautical" }];
  const out: SkyBand[] = [];
  let cursor = start;
  let tone = events[0].before;
  for (const e of events) {
    if (e.t > cursor) out.push({ from: cursor, to: e.t, tone });
    cursor = e.t;
    tone = e.after;
  }
  if (cursor < end) out.push({ from: cursor, to: end, tone });
  return out;
}

// Light theme: soft tints (dark text and lines stay readable); dark theme: a real night gradient.
const BAND_CLASS: Record<SkyBandTone, string> = {
  day: "fill-sky-day/20 dark:fill-sky-day/25",
  civil: "fill-sky-civil/20 dark:fill-sky-civil/45",
  nautical: "fill-sky-nautical/20 dark:fill-sky-nautical/55",
  astro: "fill-sky-astro/20 dark:fill-sky-astro/70",
  night: "fill-sky-night/25 dark:fill-sky-night/90",
};

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function makeTickFormat(tz: string | undefined, hour12: boolean) {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  } catch {
    fmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  }
  const parts = (t: number) => {
    const p = fmt.formatToParts(t);
    return { h: Number(p.find((x) => x.type === "hour")?.value ?? 0), m: Number(p.find((x) => x.type === "minute")?.value ?? 0) };
  };
  const label = (t: number) => {
    const { h } = parts(t);
    if (!hour12) return `${String(h).padStart(2, "0")}:00`;
    const hh = h % 12 === 0 ? 12 : h % 12;
    return `${hh} ${h < 12 ? "AM" : "PM"}`;
  };
  const time = (t: number) => {
    const { h, m } = parts(t);
    if (!hour12) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const hh = h % 12 === 0 ? 12 : h % 12;
    return `${hh}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  };
  return { parts, label, time };
}

function interpolate(points: AltitudePoint[], t: number): number | null {
  if (!points.length || t < points[0].t || t > points[points.length - 1].t) return null;
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  if (b.t === a.t) return a.alt;
  return a.alt + ((b.alt - a.alt) * (t - a.t)) / (b.t - a.t);
}

export function AltitudeChart({
  start,
  end,
  series,
  bands,
  minAlt,
  now,
  highlight,
  highlightLabel = "best window",
  peak,
  tz,
  hour12 = false,
  height = 220,
  className,
  ariaLabel,
  legend = true,
}: AltitudeChartProps) {
  const uid = useId().replace(/:/g, "");
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hoverT, setHoverT] = useState<number | null>(null);

  const M = { l: 30, r: 8, t: 14, b: 22 };
  const W = Math.max(width, 240);
  const H = height;
  const pw = W - M.l - M.r;
  const ph = H - M.t - M.b;
  const x = useCallback((t: number) => M.l + ((t - start) / (end - start)) * pw, [start, end, pw]);
  const y = useCallback((alt: number) => M.t + (1 - alt / 90) * ph, [ph]);
  const fmt = useMemo(() => makeTickFormat(tz, hour12), [tz, hour12]);

  const ticks = useMemo(() => {
    const out: number[] = [];
    if (!(end > start)) return out;
    const { m } = fmt.parts(start);
    let t = start - (start % 60_000) + ((60 - m) % 60) * 60_000;
    for (let i = 0; i < 60 && t <= end; i++, t += 3_600_000) out.push(t);
    const every = Math.max(1, Math.ceil((hour12 ? 44 : 40) / (pw / Math.max(1, (end - start) / 3_600_000))));
    // Keep labels on even local hours when thinning.
    return out.filter((tt) => fmt.parts(tt).h % every === 0);
  }, [start, end, fmt, pw, hour12]);

  const pathOf = (pts: AltitudePoint[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.alt).toFixed(1)}`).join("");
  const primary = series.find((s) => (s.variant ?? "primary") === "primary");

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const t = start + ((px - M.l) / pw) * (end - start);
    setHoverT(Math.max(start, Math.min(end, t)));
  };

  const hover = hoverT !== null ? series.map((s) => ({ s, alt: interpolate(s.points, hoverT) })) : null;
  const clipPlot = `plot-${uid}`;
  const clipAbove = `above-${uid}`;
  const grad = `grad-${uid}`;
  const yMin = minAlt !== null && minAlt !== undefined ? y(minAlt) : null;

  return (
    <div className={cn("w-full", className)}>
      <div ref={wrapRef} className="relative w-full select-none" style={{ height: H }}>
        {width > 0 && (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="block overflow-visible">
            <defs>
              <clipPath id={clipPlot}>
                <rect x={M.l} y={M.t} width={pw} height={ph} />
              </clipPath>
              {yMin !== null && (
                <clipPath id={clipAbove}>
                  <rect x={M.l} y={M.t - 4} width={pw} height={Math.max(0, yMin - M.t + 4)} />
                </clipPath>
              )}
              <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="hsl(var(--primary))" stopOpacity="0.28" />
                <stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Sky bands */}
            <g clipPath={`url(#${clipPlot})`}>
              <rect x={M.l} y={M.t} width={pw} height={ph} className="fill-muted/40" />
              {bands?.map((b, i) => (
                <rect key={i} x={x(b.from)} y={M.t} width={Math.max(0, x(b.to) - x(b.from))} height={ph} className={BAND_CLASS[b.tone]} />
              ))}
              {highlight && (
                <rect x={x(highlight[0])} y={M.t} width={Math.max(2, x(highlight[1]) - x(highlight[0]))} height={ph} className="fill-primary/[0.07]" />
              )}
            </g>

            {/* Grid */}
            {[0, 30, 60, 90].map((a) => (
              <g key={a}>
                <line x1={M.l} x2={M.l + pw} y1={y(a)} y2={y(a)} className={a === 0 ? "stroke-muted-foreground/45" : "stroke-foreground/[0.07]"} strokeWidth={1} />
                <text x={M.l - 6} y={y(a)} dy="0.32em" textAnchor="end" className="num fill-muted-foreground text-[10px]">
                  {a}°
                </text>
              </g>
            ))}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={M.t + ph} y2={M.t + ph + 4} className="stroke-muted-foreground/45" />
                <text x={x(t)} y={H - 5} textAnchor="middle" className="num fill-muted-foreground text-[10px]">
                  {fmt.label(t)}
                </text>
              </g>
            ))}

            {/* Minimum altitude */}
            {yMin !== null && (
              <g>
                <line x1={M.l} x2={M.l + pw} y1={yMin} y2={yMin} className="stroke-muted-foreground/60" strokeDasharray="3 4" strokeWidth={1} />
                <text x={M.l + pw - 4} y={yMin - 4} textAnchor="end" className="num fill-muted-foreground text-[10px]">
                  {minAlt}° min
                </text>
              </g>
            )}

            {/* Series */}
            <g clipPath={`url(#${clipPlot})`}>
              {series
                .filter((s) => s.variant === "moon" || s.variant === "muted")
                .map((s) => (
                  <path
                    key={s.id}
                    d={pathOf(s.points)}
                    fill="none"
                    className={s.variant === "moon" ? "stroke-gold/70" : "stroke-muted-foreground/60"}
                    strokeWidth={s.variant === "moon" ? 1.4 : 1.2}
                    strokeDasharray={s.variant === "moon" ? "5 4" : undefined}
                  />
                ))}
              {primary && (
                <>
                  <path d={`${pathOf(primary.points)}L${x(primary.points[primary.points.length - 1]?.t ?? end)},${y(0)}L${x(primary.points[0]?.t ?? start)},${y(0)}Z`} fill={`url(#${grad})`} />
                  <path d={pathOf(primary.points)} fill="none" className="stroke-primary/40" strokeWidth={1.6} strokeLinejoin="round" />
                  <path
                    d={pathOf(primary.points)}
                    fill="none"
                    className="stroke-primary"
                    strokeWidth={2.4}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    clipPath={yMin !== null ? `url(#${clipAbove})` : undefined}
                  />
                </>
              )}
            </g>

            {/* Moon label at its highest point */}
            {series
              .filter((s) => s.variant === "moon")
              .map((s) => {
                const top = s.points.reduce<AltitudePoint | null>((m, p) => (p.alt > (m?.alt ?? -90) ? p : m), null);
                if (!top || top.alt < 4) return null;
                const lx = Math.min(Math.max(x(top.t), M.l + 18), M.l + pw - 18);
                return (
                  <text key={`${s.id}-l`} x={lx} y={y(top.alt) - 6} textAnchor="middle" className="fill-gold/90 text-[10px]">
                    {s.label}
                  </text>
                );
              })}

            {/* Highlight label (bottom edge, clear of the peak and "now" labels) */}
            {highlight && x(highlight[1]) - x(highlight[0]) > 70 && (
              <text x={(x(highlight[0]) + x(highlight[1])) / 2} y={M.t + ph - 6} textAnchor="middle" className="fill-primary/80 text-[9px] uppercase tracking-[0.12em]">
                {highlightLabel}
              </text>
            )}

            {/* Peak */}
            {peak && peak.alt > 0 && (() => {
              // Label above the point unless that would hit the top edge or the "now" pill.
              const px = x(peak.t);
              const py = y(peak.alt);
              const nearNow = now !== null && now !== undefined && now >= start && now <= end && Math.abs(x(now) - px) < 56;
              const below = py - 9 < M.t + 10 || (nearNow && py - 9 < M.t + 24);
              return (
                <g>
                  <circle cx={px} cy={py} r={4} className="fill-background stroke-primary" strokeWidth={2} />
                  <text
                    x={Math.min(Math.max(px, M.l + 40), M.l + pw - 40)}
                    y={below ? py + 17 : py - 9}
                    textAnchor="middle"
                    className="num fill-foreground text-[11px] font-medium"
                    style={{ paintOrder: "stroke", stroke: "hsl(var(--background) / 0.7)", strokeWidth: 3 }}
                  >
                    {Math.round(peak.alt)}° · {fmt.time(peak.t)}
                  </text>
                </g>
              );
            })()}

            {/* Now */}
            {now !== null && now !== undefined && now >= start && now <= end && (
              <g>
                <line x1={x(now)} x2={x(now)} y1={M.t} y2={M.t + ph} className="stroke-gold" strokeWidth={1.4} />
                <rect x={x(now) - 15} y={M.t - 13} width={30} height={13} rx={6.5} className="fill-gold" />
                <text x={x(now)} y={M.t - 3.5} textAnchor="middle" className="fill-background text-[9px] font-semibold uppercase tracking-wider">
                  now
                </text>
              </g>
            )}

            {/* Hover */}
            {hoverT !== null && (
              <line x1={x(hoverT)} x2={x(hoverT)} y1={M.t} y2={M.t + ph} className="stroke-foreground/50" strokeWidth={1} strokeDasharray="2 2" />
            )}
            {hover?.map(({ s, alt }) =>
              alt !== null && alt >= 0 ? (
                <circle key={s.id} cx={x(hoverT!)} cy={y(alt)} r={3} className={s.variant === "moon" ? "fill-gold" : s.variant === "muted" ? "fill-muted-foreground" : "fill-primary"} />
              ) : null,
            )}
            <rect
              x={M.l}
              y={M.t}
              width={pw}
              height={ph}
              fill="transparent"
              style={{ touchAction: "pan-y" }}
              onPointerMove={onMove}
              onPointerDown={onMove}
              onPointerLeave={() => setHoverT(null)}
            />
          </svg>
        )}
        {hoverT !== null && hover && (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-md border bg-popover/95 px-2 py-1 text-2xs shadow-sm backdrop-blur"
            style={{ left: Math.min(Math.max(x(hoverT) - 60, 0), W - 120), width: 120 }}
          >
            <div className="num font-medium">{fmt.time(hoverT)}</div>
            {hover.map(({ s, alt }) => (
              <div key={s.id} className="flex justify-between gap-2 text-muted-foreground">
                <span className="truncate">{s.label}</span>
                <span className="num text-foreground">{alt === null ? "—" : alt < 0 ? "below" : `${Math.round(alt)}°`}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {legend && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-muted-foreground">
          {primary && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded bg-primary" /> {primary.label}
            </span>
          )}
          {series
            .filter((s) => s.variant === "moon")
            .map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1.5">
                <svg width="16" height="4" aria-hidden="true">
                  <line x1="0" x2="16" y1="2" y2="2" className="stroke-gold" strokeWidth="1.5" strokeDasharray="4 3" />
                </svg>
                {s.label}
              </span>
            ))}
          {bands && bands.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="flex h-2.5 overflow-hidden rounded-sm border">
                <span className="w-1.5 bg-sky-civil/60" />
                <span className="w-1.5 bg-sky-nautical/70" />
                <span className="w-1.5 bg-sky-astro/80" />
                <span className="w-1.5 bg-sky-night" />
              </span>
              twilight → full darkness
            </span>
          )}
        </div>
      )}
    </div>
  );
}
