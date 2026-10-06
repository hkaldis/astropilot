import { useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { fmtMag } from "./format";
import type { KitAnalysis } from "./kit";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const TICKS = [5, 10, 20, 30, 50, 75, 100, 150, 200, 300, 500, 750, 1000];

/**
 * Your magnifications on a log scale from the minimum useful power (7 mm exit pupil) to the
 * maximum useful power, with the low / medium / high exit-pupil sweet spots shaded.
 */
export function KitChart({ analysis: a, className }: { analysis: KitAnalysis; className?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const uid = useId().replace(/:/g, "");
  const W = Math.max(width, 260);
  const H = 128;
  const padX = 16;
  const mags = a.points.flatMap((p) => [p.mag, p.magHigh]);
  const lo = Math.min(a.minUseful / 1.35, ...mags.map((m) => m / 1.12));
  const hi = Math.max(a.maxUseful * 1.25, ...mags.map((m) => m * 1.12));
  const x = (m: number) => padX + (Math.log(m / lo) / Math.log(hi / lo)) * (W - 2 * padX);

  const trackTop = 22;
  const trackH = 38;
  const cy = trackTop + trackH / 2;

  // Eyepiece labels below the track, in up to two rows so they never overlap.
  const singles = a.points.filter((p) => !p.barlow);
  const rowEnds = [-Infinity, -Infinity];
  const labels = singles.map((p) => {
    const cx = p.zoom ? (x(p.mag) + x(p.magHigh)) / 2 : x(p.mag);
    const text = p.zoom ? `${p.zoom[0]}–${p.zoom[1]}` : `${Math.round(p.focal * 10) / 10}`;
    const half = text.length * 3.4 + 4;
    let row = rowEnds.findIndex((end) => cx - half > end);
    if (row < 0) row = 1;
    rowEnds[row] = cx + half;
    return { p, cx, text, y: trackTop + trackH + 15 + row * 13 };
  });

  const minX = x(a.minUseful);
  const maxX = x(a.maxUseful);
  const ticks: number[] = [];
  for (const t of TICKS) {
    const tx = x(t);
    if (t < lo || t > hi) continue;
    if (Math.abs(tx - minX) < 30 || Math.abs(tx - maxX) < 34) continue;
    if (ticks.length && tx - x(ticks[ticks.length - 1]) < 30) continue;
    ticks.push(t);
  }
  const axisY = H - 12;

  const described = a.points.length
    ? `Your magnifications: ${singles.map((p) => (p.zoom ? `${fmtMag(p.mag)} to ${fmtMag(p.magHigh)}` : fmtMag(p.mag))).join(", ")}.`
    : "No eyepieces yet.";

  return (
    <div ref={ref} className={cn("w-full", className)}>
      {width > 0 && (
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Useful magnification for this telescope runs from ${fmtMag(a.minUseful)} to ${fmtMag(a.maxUseful)}. ${described}`}
          className="block overflow-visible"
        >
          <defs>
            <pattern id={`hatch-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" className="stroke-border" strokeWidth="2" />
            </pattern>
          </defs>

          {/* outside the useful range */}
          <rect x={padX} y={trackTop} width={Math.max(0, minX - padX)} height={trackH} fill={`url(#hatch-${uid})`} rx="6" />
          <rect x={maxX} y={trackTop} width={Math.max(0, W - padX - maxX)} height={trackH} fill={`url(#hatch-${uid})`} rx="6" />
          {/* useful range */}
          <rect x={minX} y={trackTop} width={maxX - minX} height={trackH} className="origin-box origin-left animate-grow-x fill-muted/60" rx="6" />

          {/* sweet spots */}
          {a.bands.map((b, i) => {
            const bx = x(b.range[0]);
            const bw = Math.max(4, x(b.range[1]) - bx);
            const ok = b.coveredBy.length > 0;
            return (
              <g key={b.band.id} className="animate-fade" style={{ animationDelay: `${250 + i * 110}ms` }}>
                <rect
                  x={bx}
                  y={trackTop}
                  width={bw}
                  height={trackH}
                  rx="5"
                  className={ok ? "fill-q-excellent/15 stroke-q-excellent/50" : b.outOfReach ? "fill-transparent stroke-muted-foreground/40" : "fill-q-fair/15 stroke-q-fair/70"}
                  strokeWidth="1"
                  strokeDasharray={ok ? undefined : "3 3"}
                />
                <text x={bx + bw / 2} y={trackTop - 7} textAnchor="middle" className={cn("text-[10.5px] font-medium", ok ? "fill-muted-foreground" : "fill-q-fair")}>
                  {b.band.id === "low" ? "Low" : b.band.id === "medium" ? "Medium" : "High"}
                  {!ok && !b.outOfReach ? " · gap" : ""}
                </text>
              </g>
            );
          })}

          {/* min / max useful markers */}
          <line x1={minX} x2={minX} y1={trackTop - 2} y2={axisY - 9} className="stroke-muted-foreground/50" strokeDasharray="2 2" />
          <line x1={maxX} x2={maxX} y1={trackTop - 2} y2={axisY - 9} className="stroke-muted-foreground/50" strokeDasharray="2 2" />

          {/* Barlow / reducer combinations */}
          {a.points
            .filter((p) => p.barlow)
            .map((p) =>
              p.zoom ? (
                <line key={p.key} x1={x(p.mag)} x2={x(p.magHigh)} y1={cy + 9} y2={cy + 9} strokeWidth="3" strokeLinecap="round" className="animate-fade stroke-primary/40" style={{ animationDelay: "0.7s" }} />
              ) : (
                <circle key={p.key} cx={x(p.mag)} cy={cy} r="4.5" className="origin-box origin-center animate-pop fill-background stroke-primary/70" strokeWidth="1.5" style={{ animationDelay: "0.7s" }} />
              ),
            )}
          {/* Eyepieces on their own: each pops into place (a newly added one too) */}
          {singles.map((p, i) =>
            p.zoom ? (
              <line key={p.key} x1={x(p.mag)} x2={x(p.magHigh)} y1={cy} y2={cy} strokeWidth="7" strokeLinecap="round" className="origin-box origin-left animate-grow-x stroke-primary" style={{ animationDelay: `${400 + i * 80}ms` }} />
            ) : (
              <circle key={p.key} cx={x(p.mag)} cy={cy} r="5.5" className="origin-box origin-center animate-pop fill-primary stroke-background" strokeWidth="2" style={{ animationDelay: `${400 + i * 80}ms` }} />
            ),
          )}
          {labels.map((l) => (
            <text key={l.p.key} x={l.cx} y={l.y} textAnchor="middle" className="num animate-fade fill-foreground text-[10.5px]" style={{ animationDelay: "0.55s" }}>
              {l.text}
            </text>
          ))}

          {/* axis */}
          {ticks.map((t) => (
            <text key={t} x={x(t)} y={axisY} textAnchor="middle" className="num fill-muted-foreground text-[11px] sm:text-[10px]">
              {t}×
            </text>
          ))}
          <text x={minX} y={axisY} textAnchor="middle" className="num fill-muted-foreground text-[11px] font-medium sm:text-[10px]">
            {fmtMag(a.minUseful)} min
          </text>
          <text x={maxX} y={axisY} textAnchor="middle" className="num fill-muted-foreground text-[11px] font-medium sm:text-[10px]">
            {fmtMag(a.maxUseful)} max
          </text>
        </svg>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-muted-foreground" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" /> eyepiece (mm)
        </span>
        {a.points.some((p) => p.barlow) && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-primary/70" /> with Barlow / reducer
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm border border-q-excellent/50 bg-q-excellent/15" /> sweet spot covered
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm border border-dashed border-q-fair/70 bg-q-fair/15" /> gap
        </span>
      </div>
    </div>
  );
}
