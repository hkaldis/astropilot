/**
 * The real night sky as a backdrop: the naked-eye stars and the best-known figures around the
 * celestial pole, wheeling slowly about it as they do through the night (counter-clockwise around
 * Polaris, clockwise around the south pole), with a gentle twinkle and the odd meteor.
 * Oriented for the current sidereal time, so the Plough or the Southern Cross sit where they are now.
 * One still frame for people who prefer reduced motion. Decorative only (aria-hidden).
 */
import { useEffect, useRef } from "react";
import backdrop from "@shared/data/backdrop.json";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/lib/motion";

const DATA = backdrop as unknown as { stars: [number, number, number, number][]; lines: Record<string, [number, number][][]> };
const DEG = Math.PI / 180;

/** Greenwich mean sidereal time, degrees (IAU 1982; ample for a backdrop). */
function gmstDeg(ms: number): number {
  const d = ms / 86_400_000 + 2440587.5 - 2451545.0;
  return (((280.46061837 + 360.98564736629 * d) % 360) + 360) % 360;
}

/** Star tint from B−V (blue-white … orange), for the dark themes. */
function tint(bv: number): [number, number, number] {
  if (bv < -0.1) return [178, 200, 255];
  if (bv < 0.15) return [212, 224, 255];
  if (bv < 0.45) return [242, 245, 255];
  if (bv < 0.75) return [255, 243, 222];
  if (bv < 1.2) return [255, 226, 184];
  return [255, 204, 158];
}

interface Star {
  r: number; // degrees from the pole
  ra: number; // radians
  size: number; // px (before devicePixelRatio)
  alpha: number;
  rgb: [number, number, number];
  twinkle: number; // 0 = steady
  phase: number;
  speed: number;
}

interface Meteor {
  x: number;
  y: number;
  dx: number;
  dy: number;
  len: number;
  t0: number;
  dur: number;
}

export function SkyBackdrop({
  hemisphere = "north",
  pole = [0.62, 0.3],
  span = 95,
  lon,
  meteors = true,
  figures = true,
  speed = 0.3,
  className,
}: {
  hemisphere?: "north" | "south";
  /** Where the celestial pole sits, as fractions of the width and height. */
  pole?: [number, number];
  /** Degrees of sky, out from the pole, that fit the height. */
  span?: number;
  /** Observer's longitude for the starting orientation (estimated from the time zone when unknown). */
  lon?: number | null;
  meteors?: boolean;
  /** Faint constellation figures. */
  figures?: boolean;
  /** Turning rate, degrees per second (the real sky turns 0.004°/s). */
  speed?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [px, py] = pole;
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const south = hemisphere === "south";
    const polarDist = (dec: number) => (south ? 90 + dec : 90 - dec);
    const stars: Star[] = DATA.stars
      .filter(([, dec]) => polarDist(dec) < 125)
      .map(([ra, dec, mag, bv]) => ({
        r: polarDist(dec),
        ra: ra * 15 * DEG,
        size: Math.min(2.7, Math.max(0.45, 0.42 + (4.6 - mag) * 0.4)),
        alpha: Math.min(1, Math.max(0.28, 0.32 + (4.6 - mag) / 5.2)),
        rgb: tint(bv),
        twinkle: mag < 3.2 ? 0.14 + Math.random() * 0.16 : 0,
        phase: Math.random() * Math.PI * 2,
        speed: 0.9 + Math.random() * 1.6,
      }))
      .reverse(); // faint first, so bright stars draw on top
    const lines = figures
      ? Object.values(DATA.lines)
          .flat()
          .map((pl) => pl.map(([ra, dec]) => ({ r: polarDist(dec), ra: ra * 15 * DEG })))
          .filter((pl) => pl.some((p) => p.r < 110))
      : [];

    const longitude = lon ?? -new Date().getTimezoneOffset() / 4; // 15° per hour of offset
    const lst0 = (gmstDeg(Date.now()) + longitude) * DEG;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let meteor: Meteor | null = null;
    let nextMeteor = performance.now() + 2500 + Math.random() * 4000;
    const radiant = { x: 0.25 + Math.random() * 0.6, y: -0.35 };
    const t0 = performance.now();
    // Light theme: stars in the page's ink colour rather than starlight.
    let light = false;
    let ink = "";
    const readTheme = () => {
      light = document.documentElement.classList.contains("light");
      ink = light ? getComputedStyle(document.documentElement).getPropertyValue("--foreground").trim() : "";
    };
    readTheme();

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };

    const draw = (now: number) => {
      if (!w || !h) return;
      const elapsed = reduced ? 0 : (now - t0) / 1000;
      const lst = lst0 + elapsed * speed * DEG;
      const cx = px * w;
      const cy = py * h;
      const scale = h / span;
      const sgn = south ? 1 : -1; // north: east is right of the pole and the sky turns counter-clockwise
      const pos = (r: number, ra: number): [number, number] => {
        const ha = lst - ra;
        return [cx + sgn * r * scale * Math.sin(ha), cy - r * scale * Math.cos(ha)];
      };
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (lines.length) {
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = light ? `hsl(${ink} / 0.08)` : "rgba(165, 190, 235, 0.11)";
        ctx.beginPath();
        for (const pl of lines) {
          pl.forEach((p, i) => {
            const [x, y] = pos(p.r, p.ra);
            if (i) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          });
        }
        ctx.stroke();
      }

      for (const s of stars) {
        const [x, y] = pos(s.r, s.ra);
        if (x < -4 || y < -4 || x > w + 4 || y > h + 4) continue;
        let a = s.alpha;
        if (s.twinkle && !reduced) a *= 1 - s.twinkle * (0.5 + 0.5 * Math.sin(elapsed * s.speed + s.phase));
        ctx.fillStyle = light ? `hsl(${ink} / ${(a * 0.55).toFixed(3)})` : `rgba(${s.rgb[0]}, ${s.rgb[1]}, ${s.rgb[2]}, ${a.toFixed(3)})`;
        if (s.size < 1) ctx.fillRect(x - s.size, y - s.size, s.size * 2, s.size * 2);
        else {
          if (s.size > 2 && !light) {
            ctx.globalAlpha = 0.16 * a;
            ctx.beginPath();
            ctx.arc(x, y, s.size * 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          ctx.beginPath();
          ctx.arc(x, y, s.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (meteors && !reduced) {
        if (!meteor && now >= nextMeteor) {
          const x = (0.1 + Math.random() * 0.8) * w;
          const y = (0.05 + Math.random() * 0.55) * h;
          const vx = x - radiant.x * w;
          const vy = y - radiant.y * h;
          const n = Math.hypot(vx, vy) || 1;
          meteor = { x, y, dx: vx / n, dy: vy / n, len: 70 + Math.random() * 90, t0: now, dur: 650 + Math.random() * 450 };
        }
        if (meteor) {
          const p = (now - meteor.t0) / meteor.dur;
          if (p >= 1) {
            meteor = null;
            nextMeteor = now + 6000 + Math.random() * 11000;
          } else {
            const travel = meteor.len * 1.6 * p;
            const hx = meteor.x + meteor.dx * travel;
            const hy = meteor.y + meteor.dy * travel;
            const tail = meteor.len * Math.min(1, p * 2.5);
            const g = ctx.createLinearGradient(hx - meteor.dx * tail, hy - meteor.dy * tail, hx, hy);
            const a = Math.sin(Math.PI * p) * (light ? 0.5 : 0.9);
            g.addColorStop(0, light ? `hsl(${ink} / 0)` : "rgba(255, 255, 255, 0)");
            g.addColorStop(1, light ? `hsl(${ink} / ${a.toFixed(3)})` : `rgba(235, 244, 255, ${a.toFixed(3)})`);
            ctx.strokeStyle = g;
            ctx.lineWidth = 1.3;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(hx - meteor.dx * tail, hy - meteor.dy * tail);
            ctx.lineTo(hx, hy);
            ctx.stroke();
          }
        }
      }
    };

    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 30) return; // ~30 fps is plenty for a slow sky
      last = now;
      draw(now);
    };
    const run = (on: boolean) => {
      if (reduced || on === (raf !== 0)) return;
      if (on) raf = requestAnimationFrame(loop);
      else {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    resize();
    draw(performance.now());
    const ro = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    ro.observe(canvas);
    // Only animate while on screen (a hidden or scrolled-away sky costs nothing).
    const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver((entries) => run(entries[entries.length - 1].isIntersecting)) : null;
    if (io) io.observe(canvas);
    else run(true);
    // Follow theme changes (and redraw a still sky).
    const mo = new MutationObserver(() => {
      readTheme();
      draw(performance.now());
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io?.disconnect();
      mo.disconnect();
    };
  }, [hemisphere, px, py, span, lon, meteors, figures, speed, reduced]);

  return <canvas ref={ref} aria-hidden="true" className={cn("pointer-events-none block h-full w-full animate-[fade_1.6s_ease-out_backwards]", className)} />;
}
