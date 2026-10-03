import { useEffect, useMemo, useRef, useState } from "react";
import type { ForecastHour } from "@shared/forecast";
import type { NightInfo, NightFrames } from "@shared/astro";
import { formatTime, HOUR_MS } from "@shared/astro";
import { cn } from "@/lib/utils";

type Tone = "excellent" | "good" | "fair" | "poor" | "bad";
const TONE_VAR: Record<Tone, string> = {
  excellent: "--q-excellent",
  good: "--q-good",
  fair: "--q-fair",
  poor: "--q-poor",
  bad: "--q-bad",
};
const scaleTone = (v: number): Tone => (v >= 4.5 ? "excellent" : v >= 3.5 ? "good" : v >= 2.5 ? "fair" : v >= 1.5 ? "poor" : "bad");
const cloudTone = (c: number): Tone => (c < 10 ? "excellent" : c < 30 ? "good" : c < 55 ? "fair" : c < 80 ? "poor" : "bad");
const scoreTone = (s: number): Tone => (s >= 80 ? "excellent" : s >= 62 ? "good" : s >= 42 ? "fair" : s >= 22 ? "poor" : "bad");

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

interface Props {
  night: NightInfo;
  frames: NightFrames;
  hours: ForecastHour[];
  tz?: string;
  hour12?: boolean;
  now: number;
  units: "metric" | "imperial";
  bestWindow?: { start: number; end: number } | null;
}

const LABEL_W = 92;
const ROWS = [
  { key: "sky", label: "Sky", h: 26 },
  { key: "cloud", label: "Clouds", h: 30 },
  { key: "seeing", label: "Seeing", h: 22 },
  { key: "transp", label: "Transparency", h: 22 },
  { key: "moon", label: "Moon", h: 22 },
  { key: "score", label: "Deep sky", h: 30 },
] as const;

export function NightStrip({ night, frames, hours, tz, hour12, now, units, bestWindow }: Props) {
  const start = Math.floor(((night.sunset ?? night.noon + 6 * HOUR_MS) - HOUR_MS) / HOUR_MS) * HOUR_MS;
  const end = Math.ceil(((night.sunrise ?? night.nextNoon - 6 * HOUR_MS) + HOUR_MS) / HOUR_MS) * HOUR_MS;
  const cols = Math.max(1, Math.round((end - start) / HOUR_MS));
  const [wrapRef, wrapW] = useWidth<HTMLDivElement>();
  const minCol = 34;
  const plotW = Math.max(cols * minCol, (wrapW || 640) - LABEL_W);
  const colW = plotW / cols;
  const x = (t: number) => ((t - start) / (end - start)) * plotW;

  const byHour = useMemo(() => {
    const m = new Map<number, ForecastHour>();
    for (const h of hours) m.set(Math.floor(h.t / HOUR_MS) * HOUR_MS, h);
    return m;
  }, [hours]);

  const [hover, setHover] = useState<number | null>(null);
  const top = 22;
  const rowY: number[] = [];
  let y = top;
  for (const r of ROWS) {
    rowY.push(y);
    y += r.h + 6;
  }
  const H = y + 4;

  // Twilight gradient stops from 10-min Sun altitudes.
  const skyStops = frames.times
    .map((t, i) => ({ t, alt: frames.sunAlt[i] }))
    .filter((s) => s.t >= start && s.t <= end)
    .map((s) => {
      const v = s.alt > 0 ? "--sky-day" : s.alt > -6 ? "--sky-civil" : s.alt > -12 ? "--sky-nautical" : s.alt > -18 ? "--sky-astro" : "--sky-night";
      return { off: (s.t - start) / (end - start), v };
    });
  const moonPath = frames.times
    .map((t, i) => ({ t, alt: frames.moon[i].alt }))
    .filter((s) => s.t >= start && s.t <= end)
    .map((s, i) => `${i ? "L" : "M"}${x(s.t).toFixed(1)},${(rowY[4] + ROWS[4].h - (Math.max(0, s.alt) / 90) * ROWS[4].h).toFixed(1)}`)
    .join(" ");

  const colTimes = Array.from({ length: cols }, (_, i) => start + i * HOUR_MS);
  const hovered = hover !== null ? byHour.get(colTimes[hover]) : undefined;
  const fmt = (t: number) => formatTime(t, { tz, hour12 });
  const temp = (c: number) => (units === "imperial" ? `${Math.round((c * 9) / 5 + 32)}°F` : `${Math.round(c)}°C`);
  const speed = (k: number) => (units === "imperial" ? `${Math.round(k * 0.621)} mph` : `${Math.round(k)} km/h`);
  const gradId = `sky-${night.date}`;
  const hasWeather = hours.length > 0;

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="overflow-x-auto scrollbar-none">
        <div className="flex" style={{ width: LABEL_W + plotW }}>
          <div className="sticky left-0 z-10 shrink-0 bg-card" style={{ width: LABEL_W }}>
            <svg width={LABEL_W} height={H} aria-hidden="true">
              {ROWS.map((r, i) => (
                <text key={r.key} x={0} y={rowY[i] + r.h / 2 + 4} className="fill-muted-foreground text-[11px]">
                  {r.label}
                </text>
              ))}
            </svg>
          </div>
          <svg
            width={plotW}
            height={H}
            role="img"
            aria-label={`Hour-by-hour conditions from ${fmt(start)} to ${fmt(end)}`}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id={gradId} x1="0" x2="1" y1="0" y2="0">
                {skyStops.map((s, i) => (
                  <stop key={i} offset={s.off} style={{ stopColor: `hsl(var(${s.v}))` }} />
                ))}
              </linearGradient>
            </defs>
            {/* hour labels */}
            {colTimes.map((t, i) =>
              i % (colW < 40 ? 2 : 1) === 0 ? (
                <text key={t} x={i * colW + 3} y={13} className="num fill-muted-foreground text-[10.5px]">
                  {fmt(t)}
                </text>
              ) : null,
            )}
            {/* sky band */}
            <rect x={0} y={rowY[0]} width={plotW} height={ROWS[0].h} rx={6} fill={`url(#${gradId})`} />
            {bestWindow && (
              <g>
                <rect x={x(bestWindow.start)} y={rowY[0] - 2} width={Math.max(2, x(bestWindow.end) - x(bestWindow.start))} height={H - rowY[0]} rx={8} fill="hsl(var(--primary))" opacity={0.07} />
                <text x={x(bestWindow.start) + 6} y={rowY[0] + 17} className="fill-primary text-[10.5px] font-medium">
                  best window
                </text>
              </g>
            )}
            {/* weather rows */}
            {colTimes.map((t, i) => {
              const h = byHour.get(t);
              const cx = i * colW;
              const cell = (row: number, tone: Tone | null, label: string | null, strength = 1) => (
                <g key={row}>
                  <rect
                    x={cx + 1.5}
                    y={rowY[row]}
                    width={colW - 3}
                    height={ROWS[row].h}
                    rx={4}
                    fill={tone ? `hsl(var(${TONE_VAR[tone]}))` : "hsl(var(--muted))"}
                    opacity={tone ? 0.18 + 0.62 * strength : 0.5}
                  />
                  {label && colW >= 30 && (
                    <text x={cx + colW / 2} y={rowY[row] + ROWS[row].h / 2 + 3.5} textAnchor="middle" className="num fill-foreground text-[10px]">
                      {label}
                    </text>
                  )}
                </g>
              );
              return (
                <g key={t} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} style={{ cursor: "default" }}>
                  <rect x={cx} y={0} width={colW} height={H} fill="transparent" />
                  {h ? (
                    <>
                      {cell(1, cloudTone(h.cloud), `${Math.round(h.cloud)}`, 0.35 + (h.cloud / 100) * 0.65)}
                      {cell(2, scaleTone(h.seeing), null, 0.7)}
                      {cell(3, scaleTone(h.transparency), null, 0.7)}
                      {cell(5, h.dark ? scoreTone(h.dsoScore) : null, h.dark ? `${Math.round(h.dsoScore)}` : null, 0.8)}
                    </>
                  ) : (
                    <>
                      {cell(1, null, null)}
                      {cell(2, null, null)}
                      {cell(3, null, null)}
                      {cell(5, null, null)}
                    </>
                  )}
                  {hover === i && <rect x={cx + 0.5} y={rowY[0] - 3} width={colW - 1} height={H - rowY[0] + 1} rx={6} fill="none" stroke="hsl(var(--foreground))" strokeOpacity={0.35} />}
                </g>
              );
            })}
            {/* moon */}
            <rect x={0} y={rowY[4]} width={plotW} height={ROWS[4].h} rx={4} fill="hsl(var(--muted))" opacity={0.35} />
            <path d={moonPath} fill="none" stroke="hsl(var(--gold))" strokeWidth={1.6} strokeOpacity={0.4 + 0.6 * frames.moonIllumination} />
            {/* now */}
            {now >= start && now <= end && (
              <g>
                <line x1={x(now)} x2={x(now)} y1={rowY[0] - 4} y2={H} stroke="hsl(var(--primary))" strokeWidth={1.5} />
                <circle cx={x(now)} cy={rowY[0] - 4} r={3} fill="hsl(var(--primary))" />
              </g>
            )}
          </svg>
        </div>
      </div>
      {!hasWeather && <p className="mt-2 text-xs text-muted-foreground">Weather forecast not available for this night — showing sky and Moon only.</p>}
      <div className={cn("mt-3 min-h-[3.25rem] rounded-lg border bg-surface-2/50 px-3 py-2 text-xs", !hovered && "text-muted-foreground")}>
        {hovered ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span className="num font-medium text-foreground">{fmt(hovered.t)}</span>
            <span>
              Clouds <b className="num font-medium text-foreground">{Math.round(hovered.cloud)}%</b>
              <span className="num text-muted-foreground"> (low {Math.round(hovered.cloudLow)} · mid {Math.round(hovered.cloudMid)} · high {Math.round(hovered.cloudHigh)})</span>
            </span>
            <span>
              Seeing <b className="num font-medium text-foreground">~{hovered.seeingArcsec.toFixed(1)}″</b>
            </span>
            <span>
              Transparency <b className="num font-medium text-foreground">{hovered.transparency}/5</b>
            </span>
            <span>
              Humidity <b className="num font-medium text-foreground">{Math.round(hovered.humidity)}%</b>
            </span>
            <span>
              Wind <b className="num font-medium text-foreground">{speed(hovered.wind)}</b>
            </span>
            <span>
              Temp <b className="num font-medium text-foreground">{temp(hovered.temp)}</b>
            </span>
            {hovered.dewRisk !== "low" && <span className="text-q-fair">Dew risk {hovered.dewRisk}</span>}
            <span>
              Moon <b className="num font-medium text-foreground">{hovered.moonAlt > 0 ? `${Math.round(hovered.moonAlt)}° up` : "below horizon"}</b>
            </span>
          </div>
        ) : (
          <span>Tap or hover an hour for details. Green is good, red is poor; numbers are cloud cover % and deep-sky score.</span>
        )}
      </div>
    </div>
  );
}
