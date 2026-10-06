/**
 * Canvas renderer for the dome chart. Draws one frame from precomputed projections and returns
 * the hit targets (screen position + radius) used for tap/hover picking.
 */
import { altAzOf, isMoonId, MOON_BY_ID, moonsOf, type MoonId } from "@shared/astro";
import type { ConstellationLabel, NamedStar, SkyDso, StarField } from "./data";
import { type Affine, type MilkyWayRaster, type MwTexture, type PointProj, type Scene, horVector, planeOf, pxPerDegAt } from "./engine";
import { type HSL, type SkyTheme, domeColor, hsla, hslToRgb, mixHsl, starTint } from "./theme";

export interface Layers {
  stars: boolean;
  constellations: boolean;
  names: boolean;
  milkyWay: boolean;
  planets: boolean;
  dso: boolean;
  targets: boolean;
  grid: boolean;
  ground: boolean;
}

export const DEFAULT_LAYERS: Layers = {
  stars: true,
  constellations: true,
  names: true,
  milkyWay: true,
  planets: true,
  dso: true,
  targets: true,
  grid: false,
  ground: true,
};

export interface Pickable {
  ref: string;
  x: number;
  y: number;
  r: number;
  pri: number;
}

export interface Polyline {
  abbr: string;
  xyz: Float64Array;
}

export interface RenderInput {
  ctx: CanvasRenderingContext2D;
  dpr: number;
  T: Affine;
  scene: Scene;
  theme: SkyTheme;
  layers: Layers;
  stars: StarField | null;
  starProj: PointProj | null;
  names: NamedStar[] | null;
  polylines: Polyline[] | null;
  lineProj: PointProj[] | null;
  labels: ConstellationLabel[] | null;
  mwTex: MwTexture | null;
  mwRaster: MilkyWayRaster | null;
  lineLayer: HTMLCanvasElement | null;
  dsos: SkyDso[];
  selected: string | null;
  hovered: string | null;
  targets: Set<string>;
}

export const FONT = "Geist, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const TAU = Math.PI * 2;
const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

const HAS_LETTER_SPACING = typeof CanvasRenderingContext2D !== "undefined" && "letterSpacing" in CanvasRenderingContext2D.prototype;
const spaced = (s: string) => (HAS_LETTER_SPACING ? s : s.split("").join(" "));

// ---------------------------------------------------------------------------------------------
// Labels with greedy collision avoidance (highest priority first)
// ---------------------------------------------------------------------------------------------

interface LabelReq {
  text: string;
  x: number;
  y: number;
  gap: number;
  size: number;
  font: string;
  color: string;
  prio: number;
  force?: boolean;
  center?: boolean;
  spacing?: boolean;
}

class LabelPlacer {
  private reqs: LabelReq[] = [];
  private boxes: number[] = [];
  private placed: { text: string; x: number; y: number; font: string; color: string; spacing?: boolean }[] = [];

  queue(r: LabelReq) {
    this.reqs.push(r);
  }

  /** Reserve a disc (e.g. a planet) so labels don't cover it. */
  block(x: number, y: number, r: number) {
    this.boxes.push(x - r, y - r, x + r, y + r);
  }

  private free(x0: number, y0: number, x1: number, y1: number, w: number, h: number) {
    if (x0 < 2 || y0 < 2 || x1 > w - 2 || y1 > h - 2) return false;
    const b = this.boxes;
    for (let i = 0; i < b.length; i += 4) if (x0 < b[i + 2] && x1 > b[i] && y0 < b[i + 3] && y1 > b[i + 1]) return false;
    return true;
  }

  run(ctx: CanvasRenderingContext2D, w: number, h: number) {
    this.reqs.sort((a, b) => b.prio - a.prio);
    for (const r of this.reqs) {
      ctx.font = r.font;
      if (HAS_LETTER_SPACING) (ctx as any).letterSpacing = r.spacing ? "1.6px" : "0px";
      const tw = ctx.measureText(r.text).width;
      const hh = r.size;
      const cands: [number, number][] = r.center
        ? [[r.x - tw / 2, r.y - hh / 2]]
        : [
            [r.x + r.gap, r.y - hh / 2],
            [r.x - r.gap - tw, r.y - hh / 2],
            [r.x - tw / 2, r.y - r.gap - hh],
            [r.x - tw / 2, r.y + r.gap],
          ];
      let at: [number, number] | null = null;
      for (const c of cands) {
        if (this.free(c[0] - 1.5, c[1] - 1, c[0] + tw + 1.5, c[1] + hh + 1, w, h)) {
          at = c;
          break;
        }
      }
      if (!at && r.force) at = cands[0];
      if (!at) continue;
      this.boxes.push(at[0] - 1.5, at[1] - 1, at[0] + tw + 1.5, at[1] + hh + 1);
      this.placed.push({ text: r.text, x: at[0], y: at[1] + hh / 2, font: r.font, color: r.color, spacing: r.spacing });
    }
  }

  draw(ctx: CanvasRenderingContext2D, halo: string) {
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = halo;
    for (const p of this.placed) {
      ctx.font = p.font;
      if (HAS_LETTER_SPACING) (ctx as any).letterSpacing = p.spacing ? "1.6px" : "0px";
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    if (HAS_LETTER_SPACING) (ctx as any).letterSpacing = "0px";
  }
}

// ---------------------------------------------------------------------------------------------
// Glyphs
// ---------------------------------------------------------------------------------------------

function drawDso(ctx: CanvasRenderingContext2D, d: SkyDso, x: number, y: number, r: number, lw: number) {
  ctx.lineWidth = lw;
  ctx.beginPath();
  switch (d.symbol) {
    case "galaxy": {
      const ratio = d.major > 0 && d.minor > 0 ? clamp(d.minor / d.major, 0.34, 1) : 0.5;
      ctx.ellipse(x, y, r, Math.max(r * ratio, 1.6), -0.45, 0, TAU);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "globular":
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y + r);
      ctx.stroke();
      break;
    case "open":
      ctx.setLineDash([Math.max(1, lw), lw * 2.1]);
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    case "planetary": {
      const ri = r * 0.55;
      ctx.arc(x, y, ri, 0, TAU);
      ctx.fill();
      ctx.moveTo(x + ri, y);
      ctx.lineTo(x + r, y);
      ctx.moveTo(x - ri, y);
      ctx.lineTo(x - r, y);
      ctx.moveTo(x, y + ri);
      ctx.lineTo(x, y + r);
      ctx.moveTo(x, y - ri);
      ctx.lineTo(x, y - r);
      ctx.stroke();
      break;
    }
    case "double":
      ctx.arc(x, y, Math.max(1.6, r * 0.32), 0, TAU);
      ctx.save();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      ctx.stroke();
      break;
    case "dark": {
      const s = r * 0.85;
      ctx.setLineDash([lw * 1.5, lw * 2]);
      ctx.rect(x - s, y - s, 2 * s, 2 * s);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    default: {
      const s = r * 0.85;
      const c2 = ctx as CanvasRenderingContext2D & { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void };
      if (typeof c2.roundRect === "function") c2.roundRect(x - s, y - s, 2 * s, 2 * s, Math.min(2, s * 0.3));
      else ctx.rect(x - s, y - s, 2 * s, 2 * s);
      ctx.fill();
      ctx.stroke();
    }
  }
}

function drawMoon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, sunAngle: number, illum: number, th: SkyTheme) {
  const lit: HSL = th.light ? [45, 70, 88] : [44, 35, 90];
  ctx.save();
  ctx.translate(x, y);
  if (!th.light) {
    const g = ctx.createRadialGradient(0, 0, r * 0.9, 0, 0, r * 3.4);
    g.addColorStop(0, hsla(lit, 0.06 + 0.16 * illum));
    g.addColorStop(1, hsla(lit, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 3.4, 0, TAU);
    ctx.fill();
  }
  ctx.rotate(sunAngle);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = th.light ? hsla(th.muted, 0.28) : hsla(th.foreground, 0.11);
  ctx.fill();
  if (illum > 0.004) {
    const e = Math.max(0.001, r * Math.abs(1 - 2 * illum));
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    ctx.ellipse(0, 0, e, r, 0, Math.PI / 2, -Math.PI / 2, illum < 0.5);
    ctx.closePath();
    ctx.fillStyle = hsla(lit, 1);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = th.light ? hsla(th.foreground, 0.55) : hsla(th.foreground, 0.22);
  ctx.stroke();
  ctx.restore();
}

function drawPlanet(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, saturn: boolean, th: SkyTheme) {
  if (!th.light) {
    const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 3.2);
    g.addColorStop(0, color + "55");
    g.addColorStop(1, color + "00");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 3.2, 0, TAU);
    ctx.fill();
  }
  if (saturn) {
    ctx.beginPath();
    ctx.ellipse(x, y, r * 2.15, r * 0.72, -0.38, 0, TAU);
    ctx.lineWidth = 1;
    ctx.strokeStyle = th.light ? hsla(th.foreground, 0.6) : color;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = th.light ? 1.1 : 0.8;
  ctx.strokeStyle = th.light ? hsla(th.foreground, 0.75) : hsla(th.background, 0.7);
  ctx.stroke();
}

function drawSun(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, th: SkyTheme) {
  const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 4);
  g.addColorStop(0, hsla(th.gold, 0.45));
  g.addColorStop(1, hsla(th.gold, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 4, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hsla(th.gold, 0.9);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    ctx.moveTo(x + Math.cos(a) * r * 1.45, y + Math.sin(a) * r * 1.45);
    ctx.lineTo(x + Math.cos(a) * r * 2.05, y + Math.sin(a) * r * 2.05);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = hsla(th.gold, 1);
  ctx.fill();
}

function reticle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, dashed = false) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  if (dashed) ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    ctx.moveTo(x + dx * (r + 2.5), y + dy * (r + 2.5));
    ctx.lineTo(x + dx * (r + 8), y + dy * (r + 8));
  }
  ctx.stroke();
  ctx.restore();
}

// Scratch buffers for the star pass (reused between frames).
let sbX = new Float32Array(0);
let sbY = new Float32Array(0);
let sbR = new Float32Array(0);
let sbI = new Int32Array(0);
function ensureScratch(n: number) {
  if (sbX.length < n) {
    sbX = new Float32Array(n);
    sbY = new Float32Array(n);
    sbR = new Float32Array(n);
    sbI = new Int32Array(n);
  }
}

function tintClass(bv: number): number {
  if (!Number.isFinite(bv)) return 1;
  if (bv < -0.05) return 0;
  if (bv < 0.25) return 1;
  if (bv < 0.6) return 2;
  if (bv < 1.1) return 3;
  if (bv < 1.5) return 4;
  return 5;
}
const TINT_BV = [-0.2, 0.1, 0.4, 0.85, 1.3, 1.8];
const ALPHAS = [0.36, 0.52, 0.68, 0.84, 1];

const CARDINALS: [string, number, number][] = [
  ["N", 0, 2],
  ["NE", 45, 1],
  ["E", 90, 2],
  ["SE", 135, 1],
  ["S", 180, 2],
  ["SW", 225, 1],
  ["W", 270, 2],
  ["NW", 315, 1],
];

// ---------------------------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------------------------

export interface RenderStats {
  starsDrawn: number;
  ms: number;
}

export function renderSky(I: RenderInput): { picks: Pickable[]; stats: RenderStats } {
  const t0 = performance.now();
  const { ctx, T, scene, theme: th, layers, dpr } = I;
  const { w, h, S, a, b, c, d, e, f } = T;
  const zoom = T.view.zoom;
  const zl = Math.log2(zoom);
  const chartPx = T.R0 * 2;
  const sf = clamp(chartPx / 720, 0.6, 1.15);
  const fs = clamp(0.86 + 0.18 * sf, 0.95, 1.06);
  const sunAlt = scene.sun.alt;
  const clipH = layers.ground;
  const ox = e;
  const oy = f;
  const dome = domeColor(th, sunAlt);
  const ground: HSL = th.light ? th.background : mixHsl(th.background, th.surface2, 0.55);
  const darkness = clamp((-sunAlt - 4) / 12, 0, 1);
  const minAlt = clipH ? -0.6 : -50;
  const picks: Pickable[] = [];
  const labels = new LabelPlacer();
  const fontPx = (px: number) => Math.round(px * fs * 10) / 10;
  const fPlanet = fontPx(12);
  const fStar = fontPx(11);
  const fDso = fontPx(10.5);
  const fCon = fontPx(9.5);
  const font = (weight: number, px: number) => `${weight} ${px}px ${FONT}`;
  const below = (alt: number) => alt < -0.6;
  const onScreen = (x: number, y: number, m: number) => x > -m && y > -m && x < w + m && y < h + m;
  const marks: { x: number; y: number; r: number; kind: "target" | "selected" | "hover"; label?: string }[] = [];
  let ghost: { alt: number; az: number; name: string } | null = null;

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = hsla(ground);
  ctx.fillRect(0, 0, w, h);

  // ---- Dome ------------------------------------------------------------------------------------
  ctx.save();
  if (clipH) {
    ctx.beginPath();
    ctx.arc(ox, oy, S, 0, TAU);
    ctx.clip();
  }
  ctx.fillStyle = hsla(dome);
  ctx.fillRect(0, 0, w, h);

  // Twilight glow towards the Sun, and a faint haze ring near the horizon.
  if (!th.light && sunAlt > -18) {
    const [su, sv] = planeOf(sunAlt, scene.sun.az);
    const gx = a * su + b * sv + e;
    const gy = c * su + d * sv + f;
    const k = sunAlt > 0 ? 0.3 : 0.3 * Math.pow(1 + sunAlt / 18, 1.7);
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, S * 1.3);
    g.addColorStop(0, hsla(th.gold, k));
    g.addColorStop(0.4, hsla(th.gold, k * 0.35));
    g.addColorStop(1, hsla(th.gold, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  if (clipH) {
    const g = ctx.createRadialGradient(ox, oy, S * 0.7, ox, oy, S);
    g.addColorStop(0, hsla(th.muted, 0));
    g.addColorStop(1, hsla(th.muted, th.light ? 0.06 : 0.08));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // Milky Way
  if (layers.milkyWay && I.mwTex && I.mwRaster) {
    const col = th.light ? hslToRgb(th.primary) : hslToRgb(mixHsl(th.foreground, th.primary, 0.12));
    const strength = th.light ? 0.14 : (0.2 + 0.08 * sf) * (0.4 + 0.6 * darkness);
    I.mwRaster.draw(ctx, I.mwTex, scene.frame, T, col, strength);
  }

  // Alt/az grid
  if (layers.grid) {
    const stepAlt = zoom < 2.5 ? 30 : zoom < 6 ? 10 : 5;
    const stepAz = zoom < 2.5 ? 45 : zoom < 6 ? 15 : 5;
    ctx.save();
    ctx.strokeStyle = hsla(th.muted, th.light ? 0.32 : 0.22);
    ctx.lineWidth = 0.8;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    for (let alt = stepAlt; alt < 90; alt += stepAlt) {
      const r = Math.tan(((90 - alt) * Math.PI) / 360) * S;
      ctx.moveTo(ox + r, oy);
      ctx.arc(ox, oy, r, 0, TAU);
    }
    for (let az = 0; az < 360; az += stepAz) {
      const [u0, v0] = planeOf(0, az);
      const [u1, v1] = planeOf(90 - stepAlt / 2, az);
      ctx.moveTo(a * u0 + b * v0 + e, c * u0 + d * v0 + f);
      ctx.lineTo(a * u1 + b * v1 + e, c * u1 + d * v1 + f);
    }
    ctx.stroke();
    ctx.restore();
    ctx.font = font(500, fontPx(9.5));
    ctx.fillStyle = hsla(th.muted, 0.75);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let alt = stepAlt; alt < 90; alt += stepAlt) {
      // Label along the upward screen direction from the zenith.
      const r = Math.tan(((90 - alt) * Math.PI) / 360) * S;
      if (onScreen(ox, oy - r, -4)) ctx.fillText(`${alt}°`, ox + 9, oy - r + 7);
    }
  }

  // ---- Star positions (needed for line gaps) -----------------------------------------------------
  const starLimit = clamp(4.55 + 1.2 * Math.log2(chartPx / 360) + 1.15 * zl - 2 * clamp((sunAlt + 16) / 14, 0, 1), 3, 6.6);
  const zf = 1 + 0.16 * zl;
  const starR = (mag: number) => sf * zf * (0.35 + 0.47 * Math.pow(Math.max(0, 6.5 - mag), 0.92));
  let nDrawn = 0;
  const st = I.stars;
  const sp = I.starProj;
  if (layers.stars && st && sp && sp.u.length === st.n) {
    ensureScratch(st.n);
    for (let i = 0; i < st.n; i++) {
      const mag = st.mag[i];
      if (mag > starLimit) break;
      const alt = sp.alt[i];
      if (alt < minAlt) continue;
      const u = sp.u[i];
      const v = sp.v[i];
      const x = a * u + b * v + e;
      const y = c * u + d * v + f;
      if (x < -6 || y < -6 || x > w + 6 || y > h + 6) continue;
      sbX[nDrawn] = x;
      sbY[nDrawn] = y;
      sbR[nDrawn] = starR(mag);
      sbI[nDrawn] = i;
      nDrawn++;
    }
  }

  // ---- Constellation figures (own layer so they can stop short of the stars) --------------------
  const hlCon = I.selected?.startsWith("con:") ? I.selected.slice(4) : null;
  if (layers.constellations && I.polylines && I.lineProj && I.lineLayer) {
    const lc = I.lineLayer;
    const dw = Math.round(w * dpr);
    const dh = Math.round(h * dpr);
    if (lc.width !== dw || lc.height !== dh) {
      lc.width = dw;
      lc.height = dh;
    }
    const g = lc.getContext("2d");
    if (g) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, dw, dh);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.lineJoin = "round";
      g.lineCap = "round";
      const minLineAlt = clipH ? -6 : -50;
      const trace = (p: PointProj) => {
        let pen = false;
        const n = p.u.length;
        for (let k = 0; k < n; k++) {
          if (p.alt[k] < minLineAlt) {
            pen = false;
            continue;
          }
          const x = a * p.u[k] + b * p.v[k] + e;
          const y = c * p.u[k] + d * p.v[k] + f;
          if (pen) g.lineTo(x, y);
          else g.moveTo(x, y);
          pen = true;
        }
      };
      g.beginPath();
      for (let k = 0; k < I.polylines.length; k++) if (I.polylines[k].abbr !== hlCon) trace(I.lineProj[k]);
      g.strokeStyle = hsla(th.primary, th.light ? 0.5 : 0.32);
      g.lineWidth = Math.max(0.85, 0.95 * sf);
      g.stroke();
      if (hlCon) {
        g.beginPath();
        for (let k = 0; k < I.polylines.length; k++) if (I.polylines[k].abbr === hlCon) trace(I.lineProj[k]);
        g.strokeStyle = hsla(th.gold, 0.95);
        g.lineWidth = 1.7;
        g.stroke();
      }
      // Knock gaps around the stars so the figures read like a printed atlas.
      g.globalCompositeOperation = "destination-out";
      g.beginPath();
      for (let k = 0; k < nDrawn; k++) {
        if (st!.mag[sbI[k]] > 4.9) break;
        const rr = sbR[k] + 1.6 + 1.2 * sf;
        g.moveTo(sbX[k] + rr, sbY[k]);
        g.arc(sbX[k], sbY[k], rr, 0, TAU);
      }
      g.fillStyle = "#000";
      g.fill();
      g.globalCompositeOperation = "source-over";
      ctx.drawImage(lc, 0, 0, w, h);
    }
  }

  // Constellation names
  if (layers.constellations && I.labels) {
    const col = hsla(th.muted, th.light ? 0.8 : 0.62);
    for (const l of I.labels) {
      const aa = altAzOf(scene.frame, l.v);
      if (aa.alt < (clipH ? 3 : -40)) continue;
      const [u, v] = planeOf(aa.alt, aa.az);
      const x = a * u + b * v + e;
      const y = c * u + d * v + f;
      if (!onScreen(x, y, 0)) continue;
      const hl = l.abbr === hlCon;
      labels.queue({
        text: spaced(l.name.toUpperCase()),
        x,
        y,
        gap: 0,
        size: fCon,
        font: font(hl ? 650 : 560, fCon),
        color: hl ? hsla(th.gold, 1) : col,
        prio: hl ? 99 : zoom < 2 ? 34 : 24,
        center: true,
        spacing: true,
        force: hl,
      });
      if (hl) picks.push({ ref: `con:${l.abbr}`, x, y, r: 10, pri: 1 });
    }
  }

  // ---- Deep-sky objects ------------------------------------------------------------------------
  const dsoLimit = 8.5 + 1.6 * zl;
  const dsoStroke = hsla(th.primary, th.light ? 0.9 : 0.78);
  const dsoFill = hsla(th.primary, th.light ? 0.08 : 0.07);
  const dsoLabel = hsla(th.primary, th.light ? 0.95 : 0.82);
  const smallChart = chartPx < 520;
  for (const dso of I.dsos) {
    const ref = `dso:${dso.o.id}`;
    const isSel = ref === I.selected;
    const isHov = ref === I.hovered;
    const isTgt = layers.targets && I.targets.has(ref);
    const base = layers.dso && (dso.primary || (zoom >= 2.2 && (dso.o.mag ?? 99) <= dsoLimit) || zoom >= 5);
    if (!base && !isTgt && !isSel && !isHov) continue;
    const aa = altAzOf(scene.frame, dso.v);
    if (aa.alt < minAlt) {
      if (isSel) ghost = { alt: aa.alt, az: aa.az, name: dso.label };
      continue;
    }
    const [u, v] = planeOf(aa.alt, aa.az);
    const x = a * u + b * v + e;
    const y = c * u + d * v + f;
    if (!onScreen(x, y, 60)) continue;
    const rs = clamp((dso.major * pxPerDegAt(aa.alt, S)) / 2, (3.3 + 0.35 * zl) * sf + 0.6, 90);
    ctx.save();
    if (below(aa.alt)) ctx.globalAlpha = 0.45;
    ctx.strokeStyle = isTgt ? hsla(th.gold, 0.95) : dsoStroke;
    ctx.fillStyle = dsoFill;
    drawDso(ctx, dso, x, y, rs, Math.max(1, 1.05 * sf));
    ctx.restore();
    picks.push({ ref, x, y, r: Math.max(rs, 5), pri: 3 });
    if (isTgt) marks.push({ x, y, r: rs + 4, kind: "target" });
    if (isSel) marks.push({ x, y, r: rs + 6, kind: "selected" });
    else if (isHov) marks.push({ x, y, r: rs + 4, kind: "hover" });
    // Overview: only the showpieces are named; Messier numbers appear from 1.5×, everything from 3×.
    const wantLabel =
      isSel || isHov || isTgt || zoom >= 3 || (dso.o.showpiece && (!smallChart || zoom >= 1.3)) || (dso.primary && zoom >= (smallChart ? 1.9 : 1.5));
    if (wantLabel)
      labels.queue({
        text: dso.label,
        x,
        y,
        gap: rs + 3,
        size: fDso,
        font: font(isSel || isTgt ? 600 : 500, fDso),
        color: isSel || isTgt ? hsla(th.gold, 1) : dsoLabel,
        prio: isSel ? 100 : isHov ? 98 : isTgt ? 80 : dso.o.showpiece ? 32 : dso.o.m ? 22 : 15,
        force: isSel || isHov,
      });
  }

  // ---- Stars -----------------------------------------------------------------------------------
  if (nDrawn > 0 && st) {
    const base = hslToRgb(th.foreground);
    const paths: Path2D[] = [];
    for (let k = 0; k < 30; k++) paths.push(new Path2D());
    const used = new Uint8Array(30);
    for (let k = 0; k < nDrawn; k++) {
      const i = sbI[k];
      const mag = st.mag[i];
      let al = clamp(0.35 + (0.65 * (starLimit - mag)) / 1.6, 0.35, 1);
      if (sp!.alt[i] < -0.6) al *= 0.45;
      const ai = Math.min(4, Math.max(0, Math.round((al - 0.36) / 0.16)));
      const ti = tintClass(st.bv[i]);
      const bi = ti * 5 + ai;
      const r = sbR[k];
      const p = paths[bi];
      p.moveTo(sbX[k] + r, sbY[k]);
      p.arc(sbX[k], sbY[k], r, 0, TAU);
      used[bi] = 1;
    }
    for (let ti = 0; ti < 6; ti++) {
      const tint = hslToRgb(th.light ? [starTint(TINT_BV[ti])[0], 70, 32] : starTint(TINT_BV[ti]));
      const mix = th.light ? 0.22 : 0.42;
      const r = Math.round(base[0] + (tint[0] - base[0]) * mix);
      const g = Math.round(base[1] + (tint[1] - base[1]) * mix);
      const bl = Math.round(base[2] + (tint[2] - base[2]) * mix);
      for (let ai = 0; ai < 5; ai++) {
        const bi = ti * 5 + ai;
        if (!used[bi]) continue;
        ctx.fillStyle = `rgba(${r},${g},${bl},${ALPHAS[ai]})`;
        ctx.fill(paths[bi]);
      }
    }
    // Soft glow on the brightest stars.
    if (!th.light) {
      for (let k = 0; k < nDrawn; k++) {
        const i = sbI[k];
        const mag = st.mag[i];
        if (mag > 1.6) break;
        const tint = hslToRgb(starTint(st.bv[i]));
        const r = sbR[k];
        const gg = ctx.createRadialGradient(sbX[k], sbY[k], r * 0.6, sbX[k], sbY[k], r * 3.6);
        gg.addColorStop(0, `rgba(${tint[0]},${tint[1]},${tint[2]},${0.1 + 0.07 * (1.6 - mag)})`);
        gg.addColorStop(1, `rgba(${tint[0]},${tint[1]},${tint[2]},0)`);
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(sbX[k], sbY[k], r * 3.6, 0, TAU);
        ctx.fill();
      }
    }
    // Anonymous stars are pickable too (lowest priority).
    for (let k = 0; k < nDrawn; k++) {
      const i = sbI[k];
      picks.push({ ref: `anon:${i}`, x: sbX[k], y: sbY[k], r: sbR[k] + 1, pri: (starLimit - st.mag[i]) * 0.12 });
      const ref = `anon:${i}`;
      if (ref === I.selected) marks.push({ x: sbX[k], y: sbY[k], r: sbR[k] + 6, kind: "selected" });
      else if (ref === I.hovered) marks.push({ x: sbX[k], y: sbY[k], r: sbR[k] + 4, kind: "hover" });
    }
  }

  // Named stars: labels + picking.
  if (I.names && (layers.stars || layers.names)) {
    const nameLimit = (chartPx < 520 ? 0.9 : 1.6) + 1.15 * zl;
    for (const s of I.names) {
      const ref = `star:${s.name}`;
      const isSel = ref === I.selected;
      const isHov = ref === I.hovered;
      if (!layers.stars && !isSel) continue;
      const aa = altAzOf(scene.frame, s.v);
      if (aa.alt < minAlt) {
        if (isSel) ghost = { alt: aa.alt, az: aa.az, name: s.name };
        continue;
      }
      const [u, v] = planeOf(aa.alt, aa.az);
      const x = a * u + b * v + e;
      const y = c * u + d * v + f;
      if (!onScreen(x, y, 4)) continue;
      const r = starR(s.mag);
      if (!st) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fillStyle = hsla(th.foreground, 0.9);
        ctx.fill();
      }
      picks.push({ ref, x, y, r: r + 1, pri: 2 });
      if (isSel) marks.push({ x, y, r: r + 6, kind: "selected" });
      else if (isHov) marks.push({ x, y, r: r + 4, kind: "hover" });
      if ((layers.names && s.mag <= nameLimit) || isSel || isHov)
        labels.queue({
          text: s.name,
          x,
          y,
          gap: r + 3,
          size: fStar,
          font: font(isSel ? 600 : 500, fStar),
          color: isSel ? hsla(th.gold, 1) : hsla(th.foreground, th.light ? 0.85 : 0.78),
          prio: isSel ? 100 : isHov ? 98 : 60 - s.mag * 5,
          force: isSel || isHov,
        });
    }
  }

  // ---- Sun, Moon and planets ---------------------------------------------------------------------
  if (layers.planets) {
    const sunHor = horVector(scene.sun.alt, scene.sun.az);
    // A planet's moon is drawn as its planet (a few arcminutes away at most): selecting it, or saving it as a
    // target, marks the planet, and the label names both.
    const selId = I.selected?.startsWith("moon:") ? I.selected.slice(5).toLowerCase() : null;
    const selMoon = selId && isMoonId(selId) ? MOON_BY_ID[selId as MoonId] : null;
    for (const body of scene.bodies) {
      const ref = `body:${body.id}`;
      const moonSel = selMoon?.parent === body.id ? selMoon : null;
      const isSel = ref === I.selected || !!moonSel;
      const isHov = ref === I.hovered;
      const isTgt = layers.targets && (I.targets.has(ref) || moonsOf(body.id).some((m) => I.targets.has(`moon:${m.id}`)));
      if (body.alt < minAlt) {
        if (isSel) ghost = { alt: body.alt, az: body.az, name: moonSel?.name ?? body.name };
        continue;
      }
      const [u, v] = planeOf(body.alt, body.az);
      const x = a * u + b * v + e;
      const y = c * u + d * v + f;
      if (!onScreen(x, y, 40)) continue;
      ctx.save();
      if (below(body.alt)) ctx.globalAlpha = 0.45;
      let r: number;
      if (body.id === "moon") {
        const rTrue = ((body.diameter / 3600) * pxPerDegAt(body.alt, S)) / 2;
        r = Math.max(6.2 * sf + 0.8 * zl, rTrue);
        // Bright limb points to the Sun along the great circle through both.
        const m = horVector(body.alt, body.az);
        const dot = m[0] * sunHor[0] + m[1] * sunHor[1] + m[2] * sunHor[2];
        const tx = sunHor[0] - dot * m[0];
        const ty = sunHor[1] - dot * m[1];
        const tz = sunHor[2] - dot * m[2];
        const tl = Math.hypot(tx, ty, tz) || 1;
        const px = m[0] + (0.03 * tx) / tl;
        const py = m[1] + (0.03 * ty) / tl;
        const pz = m[2] + (0.03 * tz) / tl;
        const pAlt = Math.atan2(pz, Math.hypot(px, py)) / (Math.PI / 180);
        const pAz = Math.atan2(-py, px) / (Math.PI / 180);
        const mAlt = Math.atan2(m[2], Math.hypot(m[0], m[1])) / (Math.PI / 180);
        const [mu, mv] = planeOf(mAlt, body.az);
        const [pu, pv] = planeOf(pAlt, pAz);
        const ang = Math.atan2(c * (pu - mu) + d * (pv - mv), a * (pu - mu) + b * (pv - mv));
        drawMoon(ctx, x, y, r, ang, body.illumination, th);
      } else {
        r = Math.max(2.4 * sf, starR(body.mag) + 0.5 * sf);
        drawPlanet(ctx, x, y, r, body.color, body.id === "saturn", th);
      }
      ctx.restore();
      labels.block(x, y, r + 1);
      picks.push({ ref, x, y, r: Math.max(r + 2, 6), pri: 4 });
      if (isTgt) marks.push({ x, y, r: r + 4, kind: "target" });
      if (isSel) marks.push({ x, y, r: r + 6, kind: "selected" });
      else if (isHov) marks.push({ x, y, r: r + 4, kind: "hover" });
      labels.queue({
        text: body.id === "moon" ? `Moon ${Math.round(body.illumination * 100)}%` : moonSel ? `${body.name} · ${moonSel.name}` : body.name,
        x,
        y,
        gap: r + 4,
        size: fPlanet,
        font: font(600, fPlanet),
        color: hsla(th.gold, 1),
        prio: isSel ? 100 : 90,
        force: true,
      });
    }
    if (sunAlt > -0.9) {
      const [u, v] = planeOf(sunAlt, scene.sun.az);
      const x = a * u + b * v + e;
      const y = c * u + d * v + f;
      if (onScreen(x, y, 30)) {
        const r = 6.5 * sf;
        drawSun(ctx, x, y, r, th);
        labels.block(x, y, r * 2);
        picks.push({ ref: "body:sun", x, y, r: r + 4, pri: 4 });
        if (I.selected === "body:sun") marks.push({ x, y, r: r + 8, kind: "selected" });
        labels.queue({ text: "Sun", x, y, gap: r * 2.2, size: fPlanet, font: font(600, fPlanet), color: hsla(th.gold, 1), prio: 95, force: true });
      }
    } else if (I.selected === "body:sun") ghost = { alt: sunAlt, az: scene.sun.az, name: "Sun" };
  }

  // Highlight marks
  for (const m of marks) {
    if (m.kind === "selected") reticle(ctx, m.x, m.y, m.r, hsla(th.gold, 1));
    else if (m.kind === "target") {
      ctx.save();
      ctx.strokeStyle = hsla(th.gold, 0.85);
      ctx.lineWidth = 1.2;
      ctx.setLineDash([2.5, 2.5]);
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, TAU);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.save();
      ctx.strokeStyle = hsla(th.foreground, 0.55);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.restore(); // dome clip

  // ---- Ground, horizon and compass ----------------------------------------------------------------
  if (clipH) {
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(ox, oy, S, 0, TAU, true);
    ctx.fillStyle = hsla(ground);
    ctx.fill("evenodd");
  }
  ctx.beginPath();
  ctx.arc(ox, oy, S, 0, TAU);
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = hsla(th.muted, th.light ? 0.6 : 0.48);
  ctx.stroke();

  const dirOf = (az: number): [number, number] => {
    const [u, v] = planeOf(0, az);
    return [(a * u + b * v) / S, (c * u + d * v) / S];
  };
  ctx.beginPath();
  for (let az = 0; az < 360; az += 5) {
    const ten = az % 15 === 0;
    if (!ten && zoom < 2) continue;
    const len = az % 90 === 0 ? 8 : az % 45 === 0 ? 6 : ten ? 4 : 2.5;
    const [dx, dy] = dirOf(az);
    const x0 = ox + dx * S;
    const y0 = oy + dy * S;
    if (!onScreen(x0, y0, 10)) continue;
    ctx.moveTo(x0, y0);
    ctx.lineTo(ox + dx * (S + len), oy + dy * (S + len));
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = hsla(th.muted, th.light ? 0.65 : 0.5);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const [name, az, weight] of CARDINALS) {
    const [dx, dy] = dirOf(az);
    const off = weight === 2 ? 15 : 14;
    const x = ox + dx * (S + off * fs);
    const y = oy + dy * (S + off * fs);
    if (!onScreen(x, y, -6)) continue;
    ctx.font = font(weight === 2 ? 650 : 500, weight === 2 ? fontPx(12.5) : fontPx(10));
    ctx.fillStyle = name === "N" ? hsla(th.gold, 1) : weight === 2 ? hsla(th.foreground, 0.85) : hsla(th.muted, 0.85);
    ctx.fillText(name, x, y);
  }

  // Selected object below the horizon: show where it is, or a notch on the horizon at its azimuth.
  if (ghost && clipH) {
    const [u, v] = planeOf(ghost.alt, ghost.az);
    const x = a * u + b * v + e;
    const y = c * u + d * v + f;
    if (onScreen(x, y, -10)) {
      reticle(ctx, x, y, 7, hsla(th.gold, 0.9), true);
      labels.queue({ text: `${ghost.name} · below horizon`, x, y, gap: 15, size: fDso, font: font(600, fDso), color: hsla(th.gold, 1), prio: 100, force: true });
    } else {
      const [dx, dy] = dirOf(ghost.az);
      const hx = ox + dx * S;
      const hy = oy + dy * S;
      if (onScreen(hx, hy, -4)) {
        const nx = -dy;
        const ny = dx;
        ctx.beginPath();
        ctx.moveTo(hx + dx * 2, hy + dy * 2);
        ctx.lineTo(hx + dx * 11 + nx * 5, hy + dy * 11 + ny * 5);
        ctx.lineTo(hx + dx * 11 - nx * 5, hy + dy * 11 - ny * 5);
        ctx.closePath();
        ctx.fillStyle = hsla(th.gold, 1);
        ctx.fill();
        labels.queue({ text: `${ghost.name} is below the horizon`, x: hx - dx * 14, y: hy - dy * 14, gap: 0, size: fDso, font: font(600, fDso), color: hsla(th.gold, 1), prio: 100, force: true, center: true });
      }
    }
  }

  // ---- Labels last, on top of everything ------------------------------------------------------------
  labels.run(ctx, w, h);
  labels.draw(ctx, hsla(dome, 0.85));
  ctx.restore();

  return { picks, stats: { starsDrawn: nDrawn, ms: performance.now() - t0 } };
}

/** Best hit near (x, y): closest, with a bonus for important objects. */
export function pickAt(picks: Pickable[], x: number, y: number, tol: number): Pickable | null {
  let best: Pickable | null = null;
  let bestScore = Infinity;
  for (const p of picks) {
    const dist = Math.hypot(p.x - x, p.y - y);
    if (dist > p.r + tol) continue;
    const score = dist - p.r * 0.5 - p.pri * 4;
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}
