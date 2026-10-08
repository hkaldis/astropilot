/**
 * The Tonight cloud map, without the DOM: the region around a place in Web Mercator, the geostationary
 * satellite that sees it (EUMETSAT's free WMS), the Open-Meteo forecast grid over the same region, and the
 * timeline that runs from the last few satellite images to a week of hourly forecasts.
 */

const R = 6378137;
const RAD = Math.PI / 180;
const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;

export const mercX = (lon: number) => R * lon * RAD;
export const mercY = (lat: number) => R * Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2));
export const lonOfX = (x: number) => x / R / RAD;
export const latOfY = (y: number) => (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) / RAD;
const normLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

export type CloudLayout = "narrow" | "wide";

/**
 * Image size, how much latitude each layout spans (the width follows from the shape) and the forecast
 * grid laid over it. Phones get a 4:3 view of about 950 × 700 km; wider screens about 2000 × 900 km.
 */
export const CLOUD_LAYOUTS: Record<CloudLayout, { w: number; h: number; halfLat: number; cols: number; rows: number }> = {
  narrow: { w: 640, h: 480, halfLat: 3.2, cols: 11, rows: 9 },
  wide: { w: 1100, h: 500, halfLat: 4, cols: 17, rows: 9 },
};

export interface CloudView {
  w: number;
  h: number;
  /** EPSG:3857 box: min x, min y, max x, max y (metres). */
  bbox: [number, number, number, number];
  south: number;
  north: number;
  west: number;
  east: number;
}

/** The region around a place, centred on it (to 0.1°, so neighbours share the same images). */
export function cloudView(lat: number, lon: number, layout: CloudLayout): CloudView {
  const { w, h, halfLat } = CLOUD_LAYOUTS[layout];
  const clat = Math.max(-80 + halfLat, Math.min(80 - halfLat, Math.round(lat * 10) / 10));
  const clon = Math.round(lon * 10) / 10;
  const y0 = mercY(clat - halfLat);
  const y1 = mercY(clat + halfLat);
  const half = ((y1 - y0) / h) * (w / 2);
  const x = mercX(clon);
  return { w, h, bbox: [x - half, y0, x + half, y1], south: clat - halfLat, north: clat + halfLat, west: lonOfX(x - half), east: lonOfX(x + half) };
}

/** Where a place falls in the view, as fractions of its width and height from the top left. */
export function viewPosition(v: CloudView, lat: number, lon: number): { x: number; y: number } {
  return { x: (mercX(lon) - v.bbox[0]) / (v.bbox[2] - v.bbox[0]), y: (v.bbox[3] - mercY(lat)) / (v.bbox[3] - v.bbox[1]) };
}

// ── Satellite ────────────────────────────────────────────────────────────────────────────────

export interface SatSource {
  layer: string;
  /** "mask": cloud / clear-land / clear-water classes; "ir": an infrared brightness image. */
  kind: "mask" | "ir";
  stepMin: number;
  /** How many images back the timeline starts (including the newest). */
  count: number;
  name: string;
}

/** Angle between two places on the globe, in degrees. */
function arc(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const c = Math.sin(lat1 * RAD) * Math.sin(lat2 * RAD) + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.cos((lon1 - lon2) * RAD);
  return Math.acos(Math.max(-1, Math.min(1, c))) / RAD;
}

/**
 * The satellite that sees a place: Meteosat's 15-minute cloud mask from 0° (Europe, Africa, the Atlantic,
 * eastern South America) or from 45.5°E (the Middle East, the Indian Ocean, India); elsewhere EUMETSAT's
 * 3-hourly world infrared composite.
 */
export function satSource(lat: number, lon: number): SatSource {
  const prime = arc(lat, lon, 0, 0);
  const indian = arc(lat, lon, 0, 45.5);
  // The prime 0° service wherever it sees well; near its edge, whichever of the two looks more directly.
  if (prime < 60 || (prime < 74 && prime <= indian)) return { layer: "msg_fes:clm", kind: "mask", stepMin: 15, count: 13, name: "Meteosat cloud mask" };
  if (indian < 74) return { layer: "msg_iodc:clm", kind: "mask", stepMin: 15, count: 13, name: "Meteosat cloud mask" };
  return { layer: "mumi:worldcloudmap_ir108", kind: "ir", stepMin: 180, count: 3, name: "world infrared composite" };
}

const EUMETVIEW = "https://view.eumetsat.int/geoserver";

const isoMinute = (t: number) => new Date(t).toISOString().slice(0, 16) + ":00Z";

/** A WMS image of the view: satellite (with its time), relief background or coastlines. */
export function wmsUrl(layers: string, v: CloudView, format: "image/png8" | "image/jpeg", time?: number): string {
  const p = new URLSearchParams({
    service: "WMS",
    request: "GetMap",
    version: "1.3.0",
    layers,
    styles: "",
    crs: "EPSG:3857",
    bbox: v.bbox.map((n) => Math.round(n)).join(","),
    width: String(v.w),
    height: String(v.h),
    format,
    transparent: "true",
  });
  if (time !== undefined) p.set("time", isoMinute(time));
  return `${EUMETVIEW}/ows?${p}`;
}

/** The layer's own capabilities document (small, unlike the whole server's), which names the newest image. */
export function capabilitiesUrl(layer: string): string {
  const [ws, name] = layer.split(":");
  return `${EUMETVIEW}/${ws}/${name}/ows?service=WMS&request=GetCapabilities&version=1.3.0`;
}

/** The newest image time in a capabilities document (the time dimension's default). */
export function latestImageTime(xml: string): number | null {
  const tag = /<Dimension\b[^>]*\bname="time"[^>]*>/.exec(xml)?.[0];
  const t = tag ? Date.parse(/\bdefault="([^"]+)"/.exec(tag)?.[1] ?? "") : NaN;
  return Number.isFinite(t) ? t : null;
}

/** If the capabilities can't be read: the image that should exist by now. */
export function guessLatestImage(src: SatSource, now: number): number {
  const step = src.stepMin * MIN_MS;
  return Math.floor((now - (src.kind === "mask" ? 25 * MIN_MS : 60 * MIN_MS)) / step) * step;
}

/**
 * Turn a satellite image (RGBA, in place) into white cloud over transparency. The cloud mask paints
 * cloud white, clear land green and clear water blue; the infrared image is brighter where cloud tops are colder.
 */
export function satToClouds(px: Uint8ClampedArray, kind: SatSource["kind"]): void {
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    let a = 0;
    if (px[i + 3] > 0) {
      if (kind === "mask") a = r > 200 && g > 200 && b > 200 ? 220 : 0;
      else {
        const k = Math.max(0, Math.min(1, (r - 95) / 110));
        a = Math.round(230 * k ** 1.2);
      }
    }
    px[i] = 255;
    px[i + 1] = 255;
    px[i + 2] = 255;
    px[i + 3] = a;
  }
}

// ── Forecast grid ────────────────────────────────────────────────────────────────────────────

export interface GridSpec {
  /** South to north. */
  lats: number[];
  /** West to east (may run past ±180° near the date line; the request wraps them). */
  lons: number[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function gridSpec(v: CloudView, layout: CloudLayout): GridSpec {
  const { cols, rows } = CLOUD_LAYOUTS[layout];
  return {
    lats: Array.from({ length: rows }, (_, i) => round2(v.south + ((v.north - v.south) * i) / (rows - 1))),
    lons: Array.from({ length: cols }, (_, i) => round2(v.west + ((v.east - v.west) * i) / (cols - 1))),
  };
}

/** One Open-Meteo request for every grid point (row by row, south first): a week of hourly total cloud. */
export function gridUrl(g: GridSpec): string {
  const lat: string[] = [];
  const lon: string[] = [];
  for (const la of g.lats)
    for (const lo of g.lons) {
      lat.push(la.toFixed(2));
      lon.push(normLon(lo).toFixed(2));
    }
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat.join(",")}&longitude=${lon.join(",")}&hourly=cloud_cover&forecast_days=7&timezone=GMT&timeformat=unixtime&cell_selection=nearest`;
}

export interface CloudGrid extends GridSpec {
  /** Hour starts, epoch ms. */
  times: number[];
  /** Per hour, total cloud % at each point (row by row, south first); −1 where missing. */
  cover: number[][];
}

export function parseGrid(g: GridSpec, json: unknown): CloudGrid | null {
  const list = (Array.isArray(json) ? json : [json]) as { hourly?: { time?: unknown; cloud_cover?: unknown } }[];
  if (list.length !== g.lats.length * g.lons.length) return null;
  const time = list[0]?.hourly?.time;
  if (!Array.isArray(time) || time.length === 0) return null;
  const series = list.map((p) => (Array.isArray(p?.hourly?.cloud_cover) ? (p.hourly!.cloud_cover as unknown[]) : []));
  const cover = time.map((_, ti) =>
    series.map((s) => {
      const v = s[ti];
      return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : -1;
    }),
  );
  return { ...g, times: time.map((s) => Number(s) * 1000), cover };
}

/** Index and fraction of a value between the grid's nodes (clamped to the ends). */
function cell(nodes: number[], v: number): [number, number] {
  const n = nodes.length;
  if (v <= nodes[0]) return [0, 0];
  if (v >= nodes[n - 1]) return [n - 2, 1];
  let i = 0;
  while (i < n - 2 && v > nodes[i + 1]) i++;
  return [i, (v - nodes[i]) / (nodes[i + 1] - nodes[i])];
}

function blend(grid: CloudGrid, values: number[], r: [number, number], c: [number, number]): number | null {
  const cols = grid.lons.length;
  const [ri, fy] = r;
  const [ci, fx] = c;
  const at = (rr: number, cc: number) => values[rr * cols + cc];
  const corners = [at(ri, ci), at(ri, ci + 1), at(ri + 1, ci), at(ri + 1, ci + 1)];
  const weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
  let sum = 0;
  let w = 0;
  corners.forEach((v, k) => {
    if (v >= 0) {
      sum += v * weights[k];
      w += weights[k];
    }
  });
  return w > 0.001 ? sum / w : null;
}

/** Forecast cloud cover (%) at a place for one of the grid's hours, between the grid points. */
export function coverAt(grid: CloudGrid, hour: number, lat: number, lon: number): number | null {
  const values = grid.cover[hour];
  if (!values) return null;
  return blend(grid, values, cell(grid.lats, lat), cell(grid.lons, lon));
}

/** Opacity of the forecast cloud layer for a cover percentage (0–1): nothing below a few percent. */
export const coverAlpha = (cover: number) => (cover <= 8 ? 0 : 0.88 * Math.min(1, (cover - 8) / 80));

/** Catmull-Rom spline through four evenly spaced values, at t (0–1) between the middle two. */
const spline = (p0: number, p1: number, p2: number, p3: number, t: number) =>
  p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));

/**
 * Paint one forecast hour as white cloud over transparency, `w`×`h` pixels covering the view (RGBA).
 * A spline between the grid points keeps the field smooth (straight-line blending shows every grid cell
 * as a square), and each pixel's latitude follows the Mercator rows, so it lines up with the images.
 */
export function paintForecast(grid: CloudGrid, hour: number, v: CloudView, w: number, h: number, out: Uint8ClampedArray): void {
  const cols = grid.lons.length;
  const rows = grid.lats.length;
  const values = (grid.cover[hour] ?? []).map((c) => Math.max(0, c));
  const at = (r: number, c: number) => values[Math.max(0, Math.min(rows - 1, r)) * cols + Math.max(0, Math.min(cols - 1, c))] ?? 0;
  const colCells = Array.from({ length: w }, (_, x) => cell(grid.lons, lonOfX(v.bbox[0] + ((x + 0.5) / w) * (v.bbox[2] - v.bbox[0]))));
  const across = new Array<number>(cols);
  for (let y = 0; y < h; y++) {
    const [r, fy] = cell(grid.lats, latOfY(v.bbox[3] - ((y + 0.5) / h) * (v.bbox[3] - v.bbox[1])));
    for (let c = 0; c < cols; c++) across[c] = spline(at(r - 1, c), at(r, c), at(r + 1, c), at(r + 2, c), fy);
    const col = (c: number) => across[Math.max(0, Math.min(cols - 1, c))];
    for (let x = 0; x < w; x++) {
      const [c, fx] = colCells[x];
      const cover = Math.max(0, Math.min(100, spline(col(c - 1), col(c), col(c + 1), col(c + 2), fx)));
      const i = (y * w + x) * 4;
      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255;
      out[i + 3] = Math.round(255 * coverAlpha(cover));
    }
  }
}

// ── Timeline ─────────────────────────────────────────────────────────────────────────────────

export type CloudFrame = { t: number; kind: "sat" } | { t: number; kind: "forecast"; hour: number };

/**
 * The slider's stops: the last few satellite images up to the newest, then every forecast hour after now
 * (from the current hour when there are no satellite images).
 */
export function cloudFrames(sat: { latest: number; src: SatSource } | null, grid: CloudGrid | null, now: number): CloudFrame[] {
  const out: CloudFrame[] = [];
  if (sat) for (let k = sat.src.count - 1; k >= 0; k--) out.push({ t: sat.latest - k * sat.src.stepMin * MIN_MS, kind: "sat" });
  if (grid) {
    const after = sat ? now : now - HOUR_MS;
    grid.times.forEach((t, hour) => {
      if (t > after) out.push({ t, kind: "forecast", hour });
    });
  }
  return out;
}

/** The stop for "now": the newest satellite image, else the first forecast hour. */
export function nowFrame(frames: CloudFrame[]): number {
  const i = frames.findIndex((f) => f.kind === "forecast");
  return i > 0 ? i - 1 : i === 0 ? 0 : frames.length - 1;
}

/** The stop nearest a time. */
export function frameNear(frames: CloudFrame[], t: number): number {
  let best = 0;
  frames.forEach((f, i) => {
    if (Math.abs(f.t - t) < Math.abs(frames[best].t - t)) best = i;
  });
  return best;
}
