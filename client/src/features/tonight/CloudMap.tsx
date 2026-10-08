/**
 * Clouds around the site: Meteosat images for the last few hours (EUMETSAT), then Open-Meteo's forecast
 * for every hour of the coming week, on one timeline. The browser fetches both directly — no server work,
 * and neither service rations our server's address.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pause, Play } from "lucide-react";
import { HOUR_MS, currentNightDate, formatDate, formatTime, nightOf, sunAltitude } from "@shared/astro";
import type { ObservingSite } from "@shared/api";
import type { ForecastHour } from "@shared/forecast";
import {
  capabilitiesUrl,
  cloudFrames,
  cloudView,
  coverAt,
  frameNear,
  gridSpec,
  gridUrl,
  guessLatestImage,
  latestImageTime,
  nowFrame,
  paintForecast,
  parseGrid,
  satSource,
  satToClouds,
  viewPosition,
  wmsUrl,
  type CloudFrame,
  type CloudGrid,
  type CloudLayout,
  type CloudView,
  type GridSpec,
  type SatSource,
} from "@shared/cloudMap";
import { Button } from "@/components/ui/button";
import { store } from "@/lib/storage";
import { cn } from "@/lib/utils";

const WIDE = "(min-width: 640px)";
function useLayout(): CloudLayout {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(WIDE);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => (window.matchMedia(WIDE).matches ? "wide" : "narrow"),
  );
}

async function fetchOk(url: string): Promise<Response> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r;
}

/** When the newest satellite image was taken (null while unknown). */
function useLatestImage(src: SatSource) {
  return useQuery({
    queryKey: ["cloudmap", "latest", src.layer],
    queryFn: async () => {
      const t = latestImageTime(await (await fetchOk(capabilitiesUrl(src.layer))).text());
      if (t === null) throw new Error("No image time");
      return t;
    },
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
  });
}

const GRID_KEY = "ap.cloudGrid";
type StoredGrid = { url: string; at: number; grid: CloudGrid };

/** The forecast grid, remembered for a few hours so a reload shows it at once (and spends no requests). */
function useCloudGrid(spec: GridSpec) {
  const url = useMemo(() => gridUrl(spec), [spec]);
  const stored = useMemo(() => {
    const s = store.get<StoredGrid | null>(GRID_KEY, null);
    return s && s.url === url && Date.now() - s.at < 3 * HOUR_MS ? s : null;
  }, [url]);
  return useQuery({
    queryKey: ["cloudmap", "grid", url],
    queryFn: async () => {
      const grid = parseGrid(spec, await (await fetchOk(url)).json());
      if (!grid) throw new Error("Unexpected forecast grid");
      store.set(GRID_KEY, { url, at: Date.now(), grid } satisfies StoredGrid);
      return grid;
    },
    initialData: stored?.grid,
    initialDataUpdatedAt: stored?.at,
    staleTime: HOUR_MS,
    gcTime: 6 * HOUR_MS,
    retry: 1,
  });
}

/** Satellite images as white cloud over transparency, ready to draw (shared by every map on the page). */
const satImages = new Map<string, Promise<HTMLCanvasElement>>();
function loadSat(url: string, src: SatSource, v: CloudView): Promise<HTMLCanvasElement> {
  let p = satImages.get(url);
  if (!p) {
    p = new Promise<HTMLCanvasElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = v.w;
          c.height = v.h;
          const ctx = c.getContext("2d", { willReadFrequently: true })!;
          ctx.drawImage(img, 0, 0, v.w, v.h);
          const data = ctx.getImageData(0, 0, v.w, v.h);
          satToClouds(data.data, src.kind);
          ctx.putImageData(data, 0, 0);
          // Shrink it so that, stretched back, the mask's square pixels blur into soft-edged cloud
          // (and lone noisy pixels fade); that's about the satellite's own resolution anyway.
          const small = document.createElement("canvas");
          small.width = Math.round(v.w / 3);
          small.height = Math.round(v.h / 3);
          const sctx = small.getContext("2d", { willReadFrequently: true })!;
          sctx.imageSmoothingEnabled = true;
          sctx.imageSmoothingQuality = "high";
          sctx.drawImage(c, 0, 0, small.width, small.height);
          resolve(small);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error("Satellite image failed"));
      img.src = url;
    });
    satImages.set(url, p);
    p.catch(() => satImages.delete(url));
    if (satImages.size > 48) satImages.delete(satImages.keys().next().value!);
  }
  return p;
}

/** Share of the pixels around the site with cloud on them (0–1). */
function cloudyAround(c: HTMLCanvasElement, x: number, y: number): number {
  const px = Math.round(x * c.width);
  const py = Math.round(y * c.height);
  const r = 2;
  const x0 = Math.max(0, px - r);
  const y0 = Math.max(0, py - r);
  const w = Math.min(c.width, px + r + 1) - x0;
  const h = Math.min(c.height, py + r + 1) - y0;
  if (w <= 0 || h <= 0) return 0;
  const a = c.getContext("2d", { willReadFrequently: true })!.getImageData(x0, y0, w, h).data;
  let n = 0;
  for (let i = 3; i < a.length; i += 4) if (a[i] > 60) n++;
  return n / (w * h);
}

const relIn = (ms: number) => {
  const h = Math.max(1, Math.round(ms / HOUR_MS));
  return h < 48 ? `in ${h} h` : `in ${Math.round(h / 24)} days`;
};

type Shown = { frame: CloudFrame; here: string | null; missing?: boolean };

const relAgo = (ms: number) => {
  const min = Math.max(0, Math.round(ms / 60_000));
  return min < 60 ? `${min} min ago` : `${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min ` : ""}ago`;
};

export default function CloudMap({
  site,
  hours,
  focus,
  now,
  tz,
  hour12,
}: {
  site: ObservingSite;
  /** The site's own forecast, for the cloud figure at the marker. */
  hours?: ForecastHour[];
  /** A night picked elsewhere on the page (its middle), or null for now. */
  focus: number | null;
  now: number;
  tz?: string;
  hour12: boolean;
}) {
  const layout = useLayout();
  const view = useMemo(() => cloudView(site.lat, site.lon, layout), [site.lat, site.lon, layout]);
  const spec = useMemo(() => gridSpec(view, layout), [view, layout]);
  const src = useMemo(() => satSource(site.lat, site.lon), [site.lat, site.lon]);
  const marker = viewPosition(view, site.lat, site.lon);

  const latestQ = useLatestImage(src);
  const gridQ = useCloudGrid(spec);
  const grid = gridQ.data ?? null;
  const [satBroken, setSatBroken] = useState(false);
  useEffect(() => setSatBroken(false), [src.layer, view]);
  const latest = latestQ.data ?? (latestQ.isError ? guessLatestImage(src, now) : null);

  // Wait for the (small, quick) image-time lookup, so "now" doesn't open on a forecast and then jump.
  const frames = useMemo(
    () => (latestQ.isPending ? [] : cloudFrames(latest !== null && !satBroken ? { latest, src } : null, grid, now)),
    [latestQ.isPending, latest, satBroken, src, grid, now],
  );

  // The chosen moment (null: now). Kept as a time, so the stop stays put when the frames shift.
  const [selT, setSelT] = useState<number | null>(focus);
  useEffect(() => setSelT(focus), [focus]);
  const cur = frames.length === 0 ? -1 : selT === null ? nowFrame(frames) : frameNear(frames, selT);
  const frame = cur >= 0 ? frames[cur] : null;

  const [playing, setPlaying] = useState(false);
  const [pending, setPending] = useState(false);
  const [warm, setWarm] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const [bgReady, setBgReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const background = wmsUrl("backgrounds:ne_gray", view, "image/jpeg");
  const lines = wmsUrl("backgrounds:ne_10m_coastline,backgrounds:ne_boundary_lines_land", view, "image/png8");
  const satUrl = (t: number) => wmsUrl(src.layer, view, src.kind === "mask" ? "image/png8" : "image/jpeg", t);

  // Forecast hours are painted small and stretched (they're smooth anyway): cache them per grid and view.
  const painted = useRef(new Map<string, HTMLCanvasElement>());
  useEffect(() => painted.current.clear(), [grid, view]);
  const forecastCanvas = (hour: number) => {
    const key = `${hour}`;
    let c = painted.current.get(key);
    if (!c && grid) {
      c = document.createElement("canvas");
      c.width = Math.round(view.w / 4);
      c.height = Math.round(view.h / 4);
      const ctx = c.getContext("2d")!;
      const img = ctx.createImageData(c.width, c.height);
      paintForecast(grid, hour, view, c.width, c.height, img.data);
      ctx.putImageData(img, 0, 0);
      painted.current.set(key, c);
    }
    return c ?? null;
  };

  const siteCover = (f: CloudFrame): number | null => {
    if (f.kind !== "forecast") return null;
    const own = hours?.find((h) => h.t === f.t);
    return own ? own.cloud : grid ? coverAt(grid, f.hour, site.lat, site.lon) : null;
  };

  // Draw the chosen moment.
  const frameKey = frame ? `${frame.kind}:${frame.t}` : "";
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!frame || !canvas) return;
    let cancelled = false;
    const draw = (img: HTMLCanvasElement | null) => {
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!img) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    if (frame.kind === "forecast") {
      draw(forecastCanvas(frame.hour));
      const c = siteCover(frame);
      setShown({ frame, here: c === null ? null : c < 10 ? "clear" : `${Math.round(c)}% cloud` });
      setPending(false);
      return;
    }
    setPending(true);
    loadSat(satUrl(frame.t), src, view)
      .then((img) => {
        if (cancelled) return;
        draw(img);
        const share = cloudyAround(img, marker.x, marker.y);
        setShown({ frame, here: share >= 0.6 ? "cloud" : share <= 0.15 ? "clear" : "patchy cloud" });
        setPending(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Without the newest image the satellite part is no use: fall back to the forecast alone.
        if (frame.t === latest) setSatBroken(true);
        else setShown({ frame, here: null, missing: true });
        setPending(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey, view, grid, src.layer, hours]);

  // Once someone heads into the past or presses play, fetch the earlier images together.
  useEffect(() => {
    if (!warm || latest === null || satBroken) return;
    frames.forEach((f) => f.kind === "sat" && loadSat(satUrl(f.t), src, view).catch(() => {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warm, latest, satBroken, view, src.layer]);

  // Play: step through the frames, waiting for any image still on its way.
  useEffect(() => {
    if (!playing || pending || !frame) return;
    if (cur >= frames.length - 1) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(() => setSelT(frames[cur + 1].t), frame.kind === "sat" ? 300 : 160);
    return () => clearTimeout(id);
  }, [playing, pending, cur, frames, frame]);

  // Tonight: the middle of the current night (or now, once that has passed).
  const tonightMid = useMemo(() => nightOf(currentNightDate(now, site), site).solarMidnight, [site.lat, site.lon, Math.floor(now / HOUR_MS)]);

  // The timeline track: daylight, twilight and night at the site, and where each day starts.
  const track = useMemo(() => {
    const bands: { from: number; to: number; level: number }[] = [];
    const days: { i: number; label: string }[] = [];
    let lastDay = "";
    frames.forEach((f, i) => {
      const alt = sunAltitude(f.t, site);
      const level = alt > 0 ? 2 : alt > -12 ? 1 : 0;
      const last = bands[bands.length - 1];
      if (last && last.level === level) last.to = i + 1;
      else bands.push({ from: i, to: i + 1, level });
      const day = formatDate(f.t, { tz, style: "weekday" });
      if (f.kind === "forecast" && day !== lastDay && lastDay !== "") days.push({ i, label: day });
      lastDay = day;
    });
    return { bands, days, sats: frames.filter((f) => f.kind === "sat").length };
  }, [frames, site.lat, site.lon, tz]);

  const label = (f: CloudFrame) =>
    f.kind === "sat" ? formatTime(f.t, { tz, hour12 }) : `${formatDate(f.t, { tz, style: "weekday" })} ${formatTime(f.t, { tz, hour12 })}`;

  const unavailable = frames.length === 0 && (gridQ.isError || !grid) && (latestQ.isError || satBroken);
  const loading = !unavailable && (frames.length === 0 || !shown);
  const n = frames.length;
  const show = shown?.frame;

  const go = (t: number | null) => {
    setPlaying(false);
    setSelT(t);
  };

  return (
    <div className="panel overflow-hidden p-0">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#0e1116] sm:aspect-[11/5]">
        <img
          src={background}
          alt=""
          className={cn("absolute inset-0 h-full w-full object-cover transition-opacity duration-500 [filter:brightness(0.5)_contrast(1.2)]", bgReady ? "opacity-100" : "opacity-0")}
          onLoad={() => setBgReady(true)}
          crossOrigin="anonymous"
          decoding="async"
        />
        <canvas ref={canvasRef} width={view.w} height={view.h} className="absolute inset-0 h-full w-full" aria-hidden="true" />
        <img src={lines} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" decoding="async" />
        <span
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow-[0_0_0_3px_rgba(0,0,0,0.45)]"
          style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }}
          title={site.name}
        />
        {show && (
          <div className="absolute left-2 top-2 rounded-lg bg-black/60 px-2.5 py-1.5 text-white backdrop-blur-sm sm:left-3 sm:top-3">
            <p className="text-sm font-medium leading-tight">
              <span className={cn("mr-1.5 inline-block size-2 rounded-full align-middle", show.kind === "sat" ? "bg-emerald-400" : "bg-sky-300")} />
              {show.kind === "sat" ? "Satellite" : "Forecast"} · {label(show)}
            </p>
            <p className="text-xs leading-tight text-white/70">
              {shown?.missing ? "No image for this time" : show.kind === "sat" ? relAgo(now - show.t) : relIn(show.t - now)}
              {shown?.here && !shown.missing ? ` · here: ${shown.here}` : ""}
            </p>
          </div>
        )}
        {(loading || pending) && !unavailable && (
          <div className="absolute right-2 top-2 size-4 animate-spin rounded-full border-2 border-white/30 border-t-white sm:right-3 sm:top-3" aria-label="Loading clouds" />
        )}
        {unavailable && <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/80">The cloud map is unavailable right now.</p>}
      </div>

      <div className="flex flex-col gap-2 p-3 sm:p-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            variant="subtle"
            size="icon-sm"
            className="shrink-0"
            disabled={n < 2}
            aria-label={playing ? "Pause" : "Play"}
            onClick={() => {
              if (playing) return setPlaying(false);
              setWarm(true);
              if (cur >= n - 1) setSelT(frames[0].t);
              setPlaying(true);
            }}
          >
            {playing ? <Pause /> : <Play />}
          </Button>
          <div className="relative h-11 min-w-0 flex-1">
            <div className="absolute inset-x-[9px] top-[9px] h-2.5 overflow-hidden rounded-full bg-slate-600 ring-1 ring-border dark:bg-[#0e1116]">
              {track.bands.map((b) => (
                <span
                  key={b.from}
                  className={cn("absolute inset-y-0", b.level === 2 ? "bg-sky-100 dark:bg-sky-200/45" : b.level === 1 ? "bg-slate-400 dark:bg-sky-300/20" : "")}
                  style={{ left: `${(b.from / n) * 100}%`, width: `${((b.to - b.from) / n) * 100}%` }}
                />
              ))}
              {track.sats > 0 && <span className="absolute inset-y-0 left-0 border-b-2 border-emerald-400/80" style={{ width: `${(track.sats / n) * 100}%` }} />}
            </div>
            <div className="pointer-events-none absolute inset-x-[9px] top-[24px] h-5">
              {track.days.filter((d) => n - d.i >= 8).map((d) => (
                <span key={d.i} className="absolute top-0 border-l border-border pl-1 text-2xs leading-4 text-muted-foreground" style={{ left: `${(d.i / n) * 100}%` }}>
                  {d.label}
                </span>
              ))}
            </div>
            <input
              type="range"
              className="cloud-range absolute inset-x-0 top-0 h-7 w-full cursor-pointer"
              min={0}
              max={Math.max(0, n - 1)}
              step={1}
              value={Math.max(0, cur)}
              disabled={n < 2}
              aria-label="Time"
              aria-valuetext={frame ? `${frame.kind === "sat" ? "Satellite" : "Forecast"}, ${label(frame)}` : undefined}
              onPointerDown={() => {
                setPlaying(false);
                setWarm(true);
              }}
              onChange={(e) => {
                const f = frames[Number(e.target.value)];
                if (!f) return;
                if (f.kind === "sat") setWarm(true);
                setSelT(f.t);
              }}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex gap-1.5">
            <Button variant={selT === null ? "subtle" : "outline"} size="sm" onClick={() => go(null)}>
              Now
            </Button>
            <Button variant="outline" size="sm" disabled={!grid} onClick={() => go(Math.max(tonightMid, now + HOUR_MS))}>
              Tonight
            </Button>
          </div>
          <p className="text-2xs text-muted-foreground">
            {latest !== null && !satBroken ? (
              <>
                Satellite: {src.name} ©{" "}
                <a href="https://view.eumetsat.int" target="_blank" rel="noreferrer" className="link">
                  EUMETSAT
                </a>{" "}
                {new Date(now).getUTCFullYear()}
              </>
            ) : (
              "Satellite images unavailable right now"
            )}
            {" · "}
            {grid ? (
              <>
                Forecast:{" "}
                <a href="https://open-meteo.com" target="_blank" rel="noreferrer" className="link">
                  Open-Meteo
                </a>
              </>
            ) : gridQ.isError ? (
              "Forecast map unavailable right now"
            ) : (
              "Forecast loading…"
            )}
            {" · "}Relief: Natural Earth
          </p>
        </div>
      </div>
    </div>
  );
}
