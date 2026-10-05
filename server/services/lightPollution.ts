/**
 * Artificial sky brightness at a point, from David J. Lorenz's World Atlas of the Artificial Night Sky
 * Brightness (2025 edition; a re-calculation of Cinzano/Falchi's atlas from VIIRS night-light data processed
 * by the Earth Observation Group, Colorado School of Mines). https://djlorenz.github.io/astronomy/lp/
 *
 * The atlas publishes 5°×5° binary tiles at 1/120° (~1 km) resolution covering latitudes −65°…+75°.
 * Each grid point holds the artificial-to-natural zenith brightness ratio, delta-encoded:
 *   value[0,0] = 128·b[0] + b[1]; then signed byte steps up the first column (latitude) and along the row.
 *   ratio = (5/195)·(e^(0.0195·v) − 1);  zenith SQM = 22.0 − 2.5·log10(1 + ratio)  (mag/arcsec²).
 * The atlas models brightness at the zenith; the Bortle class is a whole-sky, naked-eye judgement, so the
 * class we derive from it is labelled an estimate and users can override it.
 */
import zlib from "zlib";
import { TTLCache, fetchWithTimeout, USER_AGENT } from "../http";
import { bortleForSqm } from "@shared/astro/visibility";

export const ATLAS_YEAR = 2025;
export const ATLAS_ATTRIBUTION =
  "Light pollution: World Atlas of Artificial Night Sky Brightness (D. J. Lorenz, 2025), from VIIRS data by the Earth Observation Group, Colorado School of Mines";
export const ATLAS_URL = "https://djlorenz.github.io/astronomy/lp/";

const TILE_POINTS = 600;
const mod = (n: number, m: number) => ((n % m) + m) % m;

/** Decoded tile: compressed integer values, row-major from the south-west corner (lat rows × lon columns). */
type Tile = Int32Array;

const tileCache = new TTLCache<Tile>(7 * 24 * 60 * 60 * 1000, 24); // ~1.4 MB per tile
const tileFailures = new TTLCache<true>(10 * 60 * 1000, 200);
const inFlight = new Map<string, Promise<Tile | null>>();

function decodeTile(raw: Buffer): Tile | null {
  const d = new Int8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  if (d.length < TILE_POINTS * TILE_POINTS + 1) return null;
  const out = new Int32Array(TILE_POINTS * TILE_POINTS);
  // Column 0 (west edge): first value is 2 bytes, then latitude steps at offsets 600·i + 1.
  let v = 128 * d[0] + d[1];
  out[0] = v;
  for (let i = 1; i < TILE_POINTS; i++) {
    v += d[TILE_POINTS * i + 1];
    out[TILE_POINTS * i] = v;
  }
  // Each row: longitude steps at offsets 600·row + 1 + j.
  for (let row = 0; row < TILE_POINTS; row++) {
    let w = out[TILE_POINTS * row];
    for (let j = 1; j < TILE_POINTS; j++) {
      w += d[TILE_POINTS * row + 1 + j];
      out[TILE_POINTS * row + j] = w;
    }
  }
  return out;
}

function loadTile(tx: number, ty: number): Promise<Tile | null> {
  const key = `${tx}_${ty}`;
  const hit = tileCache.get(key);
  if (hit) return Promise.resolve(hit);
  if (tileFailures.get(key)) return Promise.resolve(null);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const p = (async () => {
    try {
      const url = `https://djlorenz.github.io/astronomy/binary_tiles/${ATLAS_YEAR}/binary_tile_${tx}_${ty}.dat.gz`;
      const r = await fetchWithTimeout(url, { timeoutMs: 10_000, headers: { "User-Agent": USER_AGENT } });
      if (r.status === 404) {
        tileFailures.set(key, true); // ocean-only or outside coverage
        return null;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const tile = decodeTile(zlib.gunzipSync(Buffer.from(await r.arrayBuffer())));
      if (tile) tileCache.set(key, tile);
      return tile;
    } catch (e: any) {
      console.warn(`[light-pollution] tile ${key} unavailable: ${e?.name === "AbortError" ? "timeout" : e?.message ?? e}`);
      tileFailures.set(key, true);
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, p);
  return p;
}

export interface SkyBrightness {
  /** Estimated zenith sky brightness in mag/arcsec² (natural sky ≈ 22.0). */
  sqm: number;
  /** Artificial ÷ natural zenith brightness. */
  ratio: number;
  /** Bortle class estimated from the zenith brightness (approximate; Bortle is a whole-sky naked-eye scale). */
  bortle: number;
  source: string;
  attribution: string;
  url: string;
}

/** Null when the point is outside the atlas (|lat| beyond −65…75) or the data host is unreachable. */
export async function skyBrightnessAt(lat: number, lon: number): Promise<SkyBrightness | null> {
  const lonFromDateLine = mod(lon + 180, 360);
  const latFromStart = lat + 65;
  const tx = Math.floor(lonFromDateLine / 5) + 1;
  const ty = Math.floor(latFromStart / 5) + 1;
  if (ty < 1 || ty > 28) return null;
  const tile = await loadTile(tx, ty);
  if (!tile) return null;
  // Same nearest-grid-point convention as the atlas viewer (1-based indices).
  const ix = Math.min(TILE_POINTS, Math.max(1, Math.round(120 * (lonFromDateLine - 5 * (tx - 1) + 1 / 240))));
  const iy = Math.min(TILE_POINTS, Math.max(1, Math.round(120 * (latFromStart - 5 * (ty - 1) + 1 / 240))));
  const v = tile[TILE_POINTS * (iy - 1) + (ix - 1)];
  const ratio = Math.max(0, (5 / 195) * (Math.exp(0.0195 * v) - 1));
  const sqm = 22.0 - 2.5 * Math.log10(1 + ratio);
  return {
    sqm: Math.round(sqm * 100) / 100,
    ratio: Math.round(ratio * 1000) / 1000,
    bortle: bortleForSqm(sqm),
    source: `World Atlas ${ATLAS_YEAR} (D. J. Lorenz)`,
    attribution: ATLAS_ATTRIBUTION,
    url: ATLAS_URL,
  };
}
