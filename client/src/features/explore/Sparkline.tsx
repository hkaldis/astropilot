import { memo } from "react";
import type { TrackPoint } from "@shared/astro";
import { cn } from "@/lib/utils";

export interface SparklineProps {
  points: TrackPoint[];
  /** Darkness window (astronomical night) to shade. */
  darkStart: number | null;
  darkEnd: number | null;
  /** Visible window (dark and above the minimum altitude) to emphasise. */
  window: [number, number] | null;
  minAlt: number;
  now?: number;
  best?: number | null;
  width?: number;
  height?: number;
  className?: string;
}

/**
 * A tiny altitude-through-the-night graph: x = the night, y = 0–90°.
 * Shaded = astronomical darkness; bright stroke = observable (dark and above your minimum altitude).
 */
export const AltitudeSparkline = memo(function AltitudeSparkline({
  points,
  darkStart,
  darkEnd,
  window,
  minAlt,
  now,
  best,
  width = 112,
  height = 30,
  className,
}: SparklineProps) {
  if (points.length < 2) return <svg width={width} height={height} className={className} aria-hidden="true" />;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const pad = 1.5;
  const x = (t: number) => ((t - t0) / (t1 - t0)) * width;
  const y = (alt: number) => pad + (1 - Math.max(0, Math.min(90, alt)) / 90) * (height - 2 * pad);

  let base = "";
  points.forEach((p, i) => {
    base += `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.alt).toFixed(1)}`;
  });

  // Highlighted (observable) segment.
  let hi = "";
  if (window) {
    let started = false;
    for (const p of points) {
      if (p.t < window[0] || p.t > window[1] || p.alt < minAlt) {
        started = false;
        continue;
      }
      hi += `${started ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.alt).toFixed(1)}`;
      started = true;
    }
  }

  const bestPt = best ? points.find((p) => p.t === best) : undefined;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("overflow-visible", className)} aria-hidden="true">
      <rect x={0} y={0} width={width} height={height} rx={3} className="fill-muted/40" />
      {darkStart !== null && darkEnd !== null && (
        <rect x={x(darkStart)} y={0} width={Math.max(0, x(darkEnd) - x(darkStart))} height={height} className="fill-sky-astro/20 dark:fill-sky-astro/70" />
      )}
      <line x1={0} x2={width} y1={y(minAlt)} y2={y(minAlt)} className="stroke-muted-foreground/25" strokeDasharray="2 2" strokeWidth={1} />
      <path d={base} fill="none" className="stroke-muted-foreground/55" strokeWidth={1.1} strokeLinejoin="round" />
      {hi && <path d={hi} fill="none" className="stroke-primary" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />}
      {bestPt && bestPt.alt >= minAlt && <circle cx={x(bestPt.t)} cy={y(bestPt.alt)} r={2.2} className="fill-primary" />}
      {now !== undefined && now >= t0 && now <= t1 && (
        <line x1={x(now)} x2={x(now)} y1={0} y2={height} className="stroke-gold" strokeWidth={1.2} />
      )}
    </svg>
  );
});
