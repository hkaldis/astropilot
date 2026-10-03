/**
 * Sky-chart geometry: the instant's scene (one horizon frame + solar-system bodies), the
 * stereographic dome projection, the zoom/pan/rotate view transform and the Milky Way raster.
 *
 * Plane coordinates: zenith at (0,0), horizon on the unit circle, north up (−v), east LEFT (−u),
 * exactly as the sky looks when you lie back and look up. r = tan(zenithDistance / 2).
 */
import { A, DEG, refraction, horizonFrame, bodyAltAz, bodyState, SOLAR_SYSTEM, type HorizonFrame, type Site, type BodyState, type Vec3 } from "@shared/astro";
import type { MilkyWayLevels } from "./data";

// ---------------------------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------------------------

export interface SceneBody extends BodyState {
  color: string;
}

export interface Scene {
  t: number;
  frame: HorizonFrame;
  sun: { alt: number; az: number };
  /** Moon − Sun ecliptic longitude, 0..360 (0 new, 180 full). */
  moonElongation: number;
  /** Moon first, then the planets (apparent topocentric positions incl. refraction). */
  bodies: SceneBody[];
}

export function computeScene(t: number, site: Site): Scene {
  const frame = horizonFrame(t, site);
  const sun = bodyAltAz(A.Body.Sun, t, site);
  const bodies = SOLAR_SYSTEM.map((p) => ({ ...bodyState(p.id, t, site), color: p.color }));
  return { t, frame, sun: { alt: sun.alt, az: sun.az }, moonElongation: A.MoonPhase(new Date(t)), bodies };
}

// ---------------------------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------------------------

/** Plane coordinates of an apparent altitude/azimuth (degrees). */
export function planeOf(alt: number, az: number): [number, number] {
  const r = Math.tan(((90 - Math.max(alt, -80)) * DEG) / 2);
  const a = az * DEG;
  return [-r * Math.sin(a), -r * Math.cos(a)];
}

/** Inverse of planeOf. */
export function altAzOfPlane(u: number, v: number): { alt: number; az: number } {
  const r = Math.hypot(u, v);
  const alt = 90 - (2 * Math.atan(r)) / DEG;
  let az = Math.atan2(-u, -v) / DEG;
  if (az < 0) az += 360;
  return { alt, az };
}

/** Horizontal unit vector (x north, y west, z up) for alt/az in degrees. */
export function horVector(alt: number, az: number): Vec3 {
  const a = alt * DEG;
  const z = az * DEG;
  const c = Math.cos(a);
  return [c * Math.cos(z), -c * Math.sin(z), Math.sin(a)];
}

export interface PointProj {
  u: Float32Array;
  v: Float32Array;
  /** Apparent altitude (degrees, refraction included). */
  alt: Float32Array;
}

/**
 * Project many J2000 unit vectors at once. This is `altAzOf(frame, v)` (same rotation convention,
 * same refraction) inlined and allocation-free, followed by the dome projection — so thousands of
 * stars cost well under a millisecond per instant.
 */
export function projectXyz(xyz: Float64Array, frame: HorizonFrame, prev?: PointProj | null): PointProj {
  const n = (xyz.length / 3) | 0;
  const out: PointProj =
    prev && prev.u.length === n ? prev : { u: new Float32Array(n), v: new Float32Array(n), alt: new Float32Array(n) };
  const r = frame.m;
  const m00 = r[0][0], m10 = r[1][0], m20 = r[2][0];
  const m01 = r[0][1], m11 = r[1][1], m21 = r[2][1];
  const m02 = r[0][2], m12 = r[1][2], m22 = r[2][2];
  for (let i = 0, k = 0; i < n; i++, k += 3) {
    const X = xyz[k], Y = xyz[k + 1], Z = xyz[k + 2];
    const x = m00 * X + m10 * Y + m20 * Z; // north
    const y = m01 * X + m11 * Y + m21 * Z; // west
    const z = m02 * X + m12 * Y + m22 * Z; // zenith
    const h = Math.sqrt(x * x + y * y);
    let alt = Math.atan2(z, h) / DEG;
    alt += refraction(alt);
    const rr = Math.tan(((90 - Math.max(alt, -80)) * DEG) / 2);
    if (h < 1e-12) {
      out.u[i] = 0;
      out.v[i] = 0;
    } else {
      out.u[i] = (rr * y) / h;
      out.v[i] = (-rr * x) / h;
    }
    out.alt[i] = alt;
  }
  return out;
}

/** Screen pixels per degree of sky at an altitude (the stereographic scale grows towards the horizon). */
export function pxPerDegAt(alt: number, S: number): number {
  const half = ((90 - alt) * DEG) / 2;
  const c = Math.cos(half);
  return (S * 0.5 * DEG) / (c * c);
}

// ---------------------------------------------------------------------------------------------
// View transform
// ---------------------------------------------------------------------------------------------

export interface View {
  zoom: number;
  /** View centre in rotated plane coordinates. */
  cx: number;
  cy: number;
  /** Screen rotation (radians, clockwise): 0 = facing south (north up). */
  rot: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 24;
export const HOME_VIEW: View = { zoom: 1, cx: 0, cy: 0, rot: 0 };

/** Facing direction → rotation that puts that horizon at the bottom of the chart. */
export const FACING_ROT: Record<string, number> = { S: 0, W: Math.PI / 2, N: Math.PI, E: (3 * Math.PI) / 2 };

export interface Affine {
  w: number;
  h: number;
  /** Horizon radius at zoom 1 (CSS px). */
  R0: number;
  /** Horizon radius now (CSS px). */
  S: number;
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  cos: number;
  sin: number;
  view: View;
}

export function chartMargin(w: number): number {
  return Math.round(Math.min(30, Math.max(21, w * 0.04)));
}

export function affineOf(view: View, w: number, h: number): Affine {
  const R0 = Math.max(40, Math.min(w, h) / 2 - chartMargin(Math.min(w, h)));
  const S = R0 * view.zoom;
  const cos = Math.cos(view.rot);
  const sin = Math.sin(view.rot);
  return { w, h, R0, S, a: cos * S, b: -sin * S, c: sin * S, d: cos * S, e: w / 2 - view.cx * S, f: h / 2 - view.cy * S, cos, sin, view };
}

export function toScreen(T: Affine, u: number, v: number): [number, number] {
  return [T.a * u + T.b * v + T.e, T.c * u + T.d * v + T.f];
}

export function toPlane(T: Affine, x: number, y: number): [number, number] {
  const ur = (x - T.w / 2) / T.S + T.view.cx;
  const vr = (y - T.h / 2) / T.S + T.view.cy;
  return [ur * T.cos + vr * T.sin, -ur * T.sin + vr * T.cos];
}

/** Rotated-plane coordinates (the space the view centre lives in) of a plane point. */
export function rotatePlane(u: number, v: number, rot: number): [number, number] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [u * c - v * s, u * s + v * c];
}

/** Keep the view on the dome: no panning at zoom 1, up to just past the horizon when zoomed in. */
export function clampView(v: View): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom));
  const maxC = Math.max(0, 1 - 1 / zoom) * 1.15;
  const len = Math.hypot(v.cx, v.cy);
  const k = len > maxC ? (len > 0 ? maxC / len : 0) : 1;
  return { zoom, cx: v.cx * k, cy: v.cy * k, rot: v.rot };
}

/** Zoom by `factor` keeping the screen point (x, y) fixed. */
export function zoomAbout(view: View, T: Affine, factor: number, x: number, y: number): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
  const ur = (x - T.w / 2) / T.S + view.cx;
  const vr = (y - T.h / 2) / T.S + view.cy;
  const S2 = T.R0 * zoom;
  return clampView({ ...view, zoom, cx: ur - (x - T.w / 2) / S2, cy: vr - (y - T.h / 2) / S2 });
}

// ---------------------------------------------------------------------------------------------
// Milky Way: polygons → equirectangular brightness texture (once) → screen raster (per frame)
// ---------------------------------------------------------------------------------------------

export interface MwTexture {
  w: number;
  h: number;
  data: Float32Array; // 0..1
}

function boxBlur(src: Float32Array, w: number, h: number, rad: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const norm = 1 / (2 * rad + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -rad; k <= rad; k++) s += src[row + ((x + k + w) % w)]; // RA wraps
      tmp[row + x] = s * norm;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -rad; k <= rad; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x];
      out[y * w + x] = s * norm;
    }
  }
  return out;
}

const mwCache = new WeakMap<MilkyWayLevels, MwTexture | null>();

export function milkyWayTexture(mw: MilkyWayLevels): MwTexture | null {
  if (mwCache.has(mw)) return mwCache.get(mw)!;
  const W = 1024;
  const H = 512;
  let tex: MwTexture | null = null;
  try {
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      const X = (raH: number) => (raH / 24) * W;
      const Y = (dec: number) => ((90 - dec) / 180) * H;
      for (const level of mw.levels) {
        ctx.beginPath();
        for (const ring of level.rings) {
          const pts = ring.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
          if (pts.length < 3) continue;
          // Unwrap RA so the ring is continuous; rings that wind once around the pole (the band edges)
          // are closed over the north pole — with even-odd filling, two such edges give the band.
          const ras = [pts[0][0]];
          for (let i = 1; i < pts.length; i++) {
            let d = pts[i][0] - pts[i - 1][0];
            if (d > 12) d -= 24;
            if (d < -12) d += 24;
            ras.push(ras[i - 1] + d);
          }
          let dc = pts[0][0] - pts[pts.length - 1][0];
          if (dc > 12) dc -= 24;
          if (dc < -12) dc += 24;
          const closeRa = ras[ras.length - 1] + dc;
          const winding = Math.abs(closeRa - ras[0]) > 12;
          for (const k of [-1, 0, 1]) {
            const off = k * 24;
            ctx.moveTo(X(ras[0] + off), Y(pts[0][1]));
            for (let i = 1; i < pts.length; i++) ctx.lineTo(X(ras[i] + off), Y(pts[i][1]));
            if (winding) {
              ctx.lineTo(X(closeRa + off), Y(pts[0][1]));
              ctx.lineTo(X(closeRa + off), -4);
              ctx.lineTo(X(ras[0] + off), -4);
            }
            ctx.closePath();
          }
        }
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fill("evenodd");
      }
      const img = ctx.getImageData(0, 0, W, H).data;
      const raw = new Float32Array(W * H);
      let max = 0;
      for (let i = 0; i < W * H; i++) {
        raw[i] = img[i * 4 + 3] / 255;
        if (raw[i] > max) max = raw[i];
      }
      if (max > 0) {
        // Two box passes ≈ a Gaussian of ~1°: soft, cloud-like edges instead of polygon outlines.
        const data = boxBlur(boxBlur(raw, W, H, 3), W, H, 3);
        for (let i = 0; i < data.length; i++) data[i] /= max;
        tex = { w: W, h: H, data };
      }
    }
  } catch {
    tex = null;
  }
  mwCache.set(mw, tex);
  return tex;
}

/** Re-samples the texture into a low-resolution screen raster that is scaled up smoothly. */
export class MilkyWayRaster {
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private img: ImageData | null = null;

  constructor() {
    this.cv = document.createElement("canvas");
    this.ctx = this.cv.getContext("2d");
  }

  draw(target: CanvasRenderingContext2D, tex: MwTexture, frame: HorizonFrame, T: Affine, rgb: [number, number, number], strength: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const step = Math.max(2.5, Math.min(T.w, T.h) / 230);
    const rw = Math.ceil(T.w / step);
    const rh = Math.ceil(T.h / step);
    if (this.cv.width !== rw || this.cv.height !== rh) {
      this.cv.width = rw;
      this.cv.height = rh;
      this.img = null;
    }
    if (!this.img) this.img = ctx.createImageData(rw, rh);
    const d = this.img.data;
    const r = frame.m;
    const TW = tex.w;
    const TH = tex.h;
    const td = tex.data;
    const k255 = 255 * strength;
    const [cr, cg, cb] = rgb;
    const halfW = T.w / 2;
    const halfH = T.h / 2;
    const { cx, cy } = T.view;
    for (let j = 0; j < rh; j++) {
      const sy = (j + 0.5) * step;
      const vr = (sy - halfH) / T.S + cy;
      for (let i = 0; i < rw; i++) {
        const p = (j * rw + i) * 4;
        const sx = (i + 0.5) * step;
        const ur = (sx - halfW) / T.S + cx;
        const u = ur * T.cos + vr * T.sin;
        const v = -ur * T.sin + vr * T.cos;
        const rho2 = u * u + v * v;
        if (rho2 >= 1) {
          d[p + 3] = 0;
          continue;
        }
        const q = 1 / (1 + rho2);
        const hx = -2 * v * q;
        const hy = 2 * u * q;
        const hz = (1 - rho2) * q;
        // Horizontal → J2000 (transpose of the frame rotation).
        const ex = r[0][0] * hx + r[0][1] * hy + r[0][2] * hz;
        const ey = r[1][0] * hx + r[1][1] * hy + r[1][2] * hz;
        const ez = r[2][0] * hx + r[2][1] * hy + r[2][2] * hz;
        let ra = Math.atan2(ey, ex);
        if (ra < 0) ra += 2 * Math.PI;
        const dec = Math.asin(ez > 1 ? 1 : ez < -1 ? -1 : ez);
        const tx = (ra / (2 * Math.PI)) * TW - 0.5;
        const ty = ((Math.PI / 2 - dec) / Math.PI) * TH - 0.5;
        const x0 = Math.floor(tx);
        const y0 = Math.max(0, Math.min(TH - 2, Math.floor(ty)));
        const fx = tx - x0;
        const fy = Math.max(0, Math.min(1, ty - y0));
        const xa = ((x0 % TW) + TW) % TW;
        const xb = (xa + 1) % TW;
        const v00 = td[y0 * TW + xa], v10 = td[y0 * TW + xb], v01 = td[(y0 + 1) * TW + xa], v11 = td[(y0 + 1) * TW + xb];
        const val = (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
        // Fade towards the horizon, where extinction swallows the Milky Way.
        let fade = hz / 0.4;
        if (fade > 1) fade = 1;
        fade = fade * fade * (3 - 2 * fade);
        d[p] = cr;
        d[p + 1] = cg;
        d[p + 2] = cb;
        d[p + 3] = val * fade * k255;
      }
    }
    ctx.putImageData(this.img, 0, 0);
    target.save();
    target.imageSmoothingEnabled = true;
    target.imageSmoothingQuality = "high";
    target.drawImage(this.cv, 0, 0, rw * step, rh * step);
    target.restore();
  }
}
