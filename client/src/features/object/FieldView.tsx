/**
 * True-field-of-view framing preview: the eyepiece field as a circle, the object drawn at its
 * catalog size. North up, east left (as on a star chart).
 */
import { useId } from "react";
import { cn } from "@/lib/utils";

export type FieldShape =
  | { kind: "extended"; type: string; major: number; minor: number; pa?: number | null } // arcmin
  | { kind: "point" }
  | { kind: "disk"; diameterArcsec: number; illumination: number; litWest: boolean; ringTilt?: number; moons?: { name: string; dx: number; dy: number; hidden?: boolean }[] };

const NICE_ARCSEC = [1, 2, 5, 10, 15, 20, 30, 60, 120, 300, 600, 900, 1200, 1800, 3600, 7200, 18000];

function niceScale(fieldArcsec: number) {
  const target = fieldArcsec * 0.25;
  let best = NICE_ARCSEC[0];
  for (const v of NICE_ARCSEC) if (v <= target) best = v;
  return best;
}

export function angleLabel(arcsec: number): string {
  if (arcsec >= 3600) return `${+(arcsec / 3600).toFixed(1)}°`;
  if (arcsec >= 60) return `${+(arcsec / 60).toFixed(arcsec < 600 ? 1 : 0)}′`;
  return `${Math.round(arcsec)}″`;
}

/** Path of the lit part of a disk with illuminated fraction f (0..1), lit side west (right) or east (left). */
function phasePath(cx: number, cy: number, r: number, f: number, litWest: boolean) {
  const k = Math.abs(1 - 2 * f) * r; // terminator ellipse half-width
  // Outer limb: half circle on the lit side; terminator: half ellipse bulging toward (f>0.5) or away from it.
  const outerSweep = litWest ? 1 : 0;
  const innerSweep = f > 0.5 ? (litWest ? 1 : 0) : litWest ? 0 : 1;
  return `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${outerSweep} ${cx} ${cy + r} A ${k} ${r} 0 0 ${innerSweep} ${cx} ${cy - r} Z`;
}

/** A planet or Moon disk with its phase and (for Saturn) rings, lit side toward the Sun. */
function Disk({ cx, cy, r, shape }: { cx: number; cy: number; r: number; shape: Extract<FieldShape, { kind: "disk" }> }) {
  const lit = Math.max(0, Math.min(1, shape.illumination));
  const tilt = shape.ringTilt;
  const rx = r * 2.27;
  const ry = tilt !== undefined ? Math.max(0.6, rx * Math.abs(Math.sin((tilt * Math.PI) / 180))) : 0;
  const sw = Math.max(1, r * 0.3);
  return (
    <g>
      {tilt !== undefined && <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" className="stroke-gold/75" strokeWidth={sw} />}
      <circle cx={cx} cy={cy} r={r} className="fill-muted-foreground/35" />
      {lit > 0.995 ? <circle cx={cx} cy={cy} r={r} className="fill-gold" /> : lit > 0.005 ? <path d={phasePath(cx, cy, r, lit, shape.litWest)} className="fill-gold" /> : null}
      {tilt !== undefined && (
        // the near half of the rings passes in front of the globe
        <path d={`M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 0 ${cx + rx} ${cy}`} fill="none" className="stroke-gold/75" strokeWidth={sw} />
      )}
    </g>
  );
}

export function FieldView({ fieldDeg, shape, size = 248, className, label }: { fieldDeg: number; shape: FieldShape; size?: number; className?: string; label?: string }) {
  const uid = useId().replace(/:/g, "");
  const S = size;
  const c = S / 2;
  const R = S / 2 - 14;
  const fieldArcmin = fieldDeg * 60;
  const k = R / (fieldArcmin / 2); // px per arcmin
  const scaleArcsec = niceScale(fieldArcmin * 60);
  const scalePx = (scaleArcsec / 60) * k;

  let body: React.ReactNode = null;
  let tiny = false;
  let inset: React.ReactNode = null;
  if (shape.kind === "extended") {
    const rx0 = (shape.major / 2) * k;
    const ry0 = (Math.max(shape.minor || shape.major, 0.05) / 2) * k;
    tiny = rx0 < 3;
    const rx = Math.max(rx0, 2.2);
    const ry = Math.max(ry0, 2.2);
    // Major axis vertical, then rotate by PA (north → east = counter-clockwise on a north-up, east-left view).
    const rot = shape.pa !== undefined && shape.pa !== null ? -shape.pa : 90;
    const t = shape.type;
    const grad = `fg-${uid}`;
    if (t === "planetary_nebula") {
      body = (
        <g transform={`rotate(${rot} ${c} ${c})`}>
          <ellipse cx={c} cy={c} rx={ry} ry={rx} className="fill-primary/15 stroke-primary/80" strokeWidth={Math.max(1.2, Math.min(rx, ry) * 0.35)} />
          <circle cx={c} cy={c} r={Math.min(1.4, rx / 3)} className="fill-foreground" />
        </g>
      );
    } else if (t === "open_cluster" || t === "asterism" || t === "star_cloud") {
      body = <ellipse cx={c} cy={c} rx={ry} ry={rx} transform={`rotate(${rot} ${c} ${c})`} className="fill-foreground/[0.06] stroke-foreground/50" strokeDasharray="4 3" strokeWidth={1.2} />;
    } else if (t === "dark_nebula") {
      body = <ellipse cx={c} cy={c} rx={ry} ry={rx} transform={`rotate(${rot} ${c} ${c})`} className="fill-background/70 stroke-foreground/40" strokeDasharray="4 3" strokeWidth={1.2} />;
    } else {
      const core = t === "globular_cluster" ? 0.75 : t.startsWith("galaxy") ? 0.6 : 0.4;
      body = (
        <g transform={`rotate(${rot} ${c} ${c})`}>
          <defs>
            <radialGradient id={grad}>
              <stop offset="0" stopColor="hsl(var(--foreground))" stopOpacity={core} />
              <stop offset={t.startsWith("galaxy") ? "0.25" : "0.45"} stopColor="hsl(var(--foreground))" stopOpacity={core * 0.45} />
              <stop offset="1" stopColor="hsl(var(--foreground))" stopOpacity="0.04" />
            </radialGradient>
          </defs>
          <ellipse cx={c} cy={c} rx={ry} ry={rx} fill={`url(#${grad})`} />
          <ellipse cx={c} cy={c} rx={ry} ry={rx} fill="none" className="stroke-foreground/35" strokeDasharray="3 3" strokeWidth={1} />
        </g>
      );
    }
  } else if (shape.kind === "point") {
    body = <circle cx={c} cy={c} r={2} className="fill-foreground" />;
    tiny = true;
  } else {
    const r0 = (shape.diameterArcsec / 120) * k;
    const r = Math.max(r0, 1.6);
    tiny = r0 < 4;
    if (r0 < 9) {
      // Magnified detail so the phase and ring tilt are readable.
      const RI = 30;
      const ri = shape.ringTilt !== undefined ? 11 : 15;
      const zoom = ri / Math.max(r0, 0.01);
      const ix = S - RI - 2;
      const iy = S - RI - 2;
      inset = (
        <g>
          <circle cx={ix} cy={iy} r={RI} className="fill-surface-2 stroke-border dark:fill-sky-night" strokeWidth={1.2} />
          <Disk cx={ix} cy={iy} r={ri} shape={shape} />
          <text x={ix} y={iy + RI + 11} textAnchor="middle" className="num fill-muted-foreground text-[9px]">
            detail ×{zoom >= 10 ? Math.round(zoom / 5) * 5 : Math.round(zoom)}
          </text>
        </g>
      );
    }
    body = (
      <g>
        <Disk cx={c} cy={c} r={r} shape={shape} />
        {shape.moons?.map((m) => {
          const mx = c - (m.dx / 60) * k; // east is left
          const my = c - (m.dy / 60) * k;
          if (m.hidden || Math.hypot(mx - c, my - c) > R) return null;
          return (
            <g key={m.name}>
              <circle cx={mx} cy={my} r={1.4} className="fill-foreground" />
              <text x={mx} y={my - 5} textAnchor="middle" className="fill-muted-foreground text-[8px]">
                {m.name.slice(0, 2)}
              </text>
            </g>
          );
        })}
      </g>
    );
  }

  const clip = `clip-${uid}`;
  return (
    <figure className={cn("flex flex-col items-center", className)}>
      <svg width={S} height={S + 22} viewBox={`0 0 ${S} ${S + 22}`} role="img" aria-label={label ?? `Eyepiece field of ${fieldDeg.toFixed(2)} degrees`} className="max-w-full">
        <defs>
          <clipPath id={clip}>
            <circle cx={c} cy={c} r={R} />
          </clipPath>
          <radialGradient id={`vig-${uid}`}>
            <stop offset="0.7" stopColor="hsl(var(--background))" stopOpacity="0" />
            <stop offset="1" stopColor="hsl(var(--background))" stopOpacity="0.55" />
          </radialGradient>
        </defs>
        <circle cx={c} cy={c} r={R} className="fill-surface-2 dark:fill-sky-night" />
        <g clipPath={`url(#${clip})`}>
          {body}
          {tiny && <circle cx={c} cy={c} r={10} fill="none" className="stroke-primary/70" strokeWidth={1} strokeDasharray="2 2.5" />}
          <circle cx={c} cy={c} r={R} fill={`url(#vig-${uid})`} />
        </g>
        <circle cx={c} cy={c} r={R} fill="none" className="stroke-border" strokeWidth={1.5} />
        <text x={c} y={9} textAnchor="middle" className="fill-muted-foreground text-[9px] font-medium">
          N
        </text>
        <text x={4} y={c} dy="0.32em" className="fill-muted-foreground text-[9px] font-medium">
          E
        </text>
        {inset}
        <g transform={`translate(${c - scalePx / 2} ${S + 6})`}>
          <line x1={0} x2={scalePx} y1={0} y2={0} className="stroke-muted-foreground" strokeWidth={1.2} />
          <line x1={0} x2={0} y1={-3} y2={3} className="stroke-muted-foreground" />
          <line x1={scalePx} x2={scalePx} y1={-3} y2={3} className="stroke-muted-foreground" />
          <text x={scalePx / 2} y={13} textAnchor="middle" className="num fill-muted-foreground text-[9px]">
            {angleLabel(scaleArcsec)}
          </text>
        </g>
      </svg>
    </figure>
  );
}
