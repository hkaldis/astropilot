import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Compass, Loader2, Minus, Plus, RotateCcw } from "lucide-react";
import { compassPoint } from "@shared/astro";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { store } from "@/lib/storage";
import { cn } from "@/lib/utils";
import type { SkyData, SkyDso } from "./data";
import {
  type PointProj,
  type Scene,
  type View,
  FACING_ROT,
  HOME_VIEW,
  MAX_ZOOM,
  MilkyWayRaster,
  affineOf,
  altAzOfPlane,
  clampView,
  milkyWayTexture,
  planeOf,
  projectXyz,
  rotatePlane,
  toPlane,
  zoomAbout,
} from "./engine";
import { type Layers, type Pickable, type Polyline, pickAt, renderSky } from "./render";
import { readSkyTheme } from "./theme";

export interface SkyCanvasHandle {
  zoomBy: (factor: number) => void;
  reset: () => void;
  /** Animate the view to an alt/az, zooming in to at least `zoom`. */
  centreOn: (alt: number, az: number, zoom?: number) => void;
}

interface Props {
  scene: Scene;
  data: SkyData;
  dsos: SkyDso[];
  layers: Layers;
  selected: string | null;
  targets: Set<string>;
  /** Changes whenever the app theme changes, so colours are re-read from CSS. */
  themeKey: string;
  onSelect: (ref: string | null) => void;
  ariaLabel: string;
  className?: string;
}

type Facing = "N" | "E" | "S" | "W";
const FACING_LABEL: Record<Facing, string> = { N: "North", E: "East", S: "South", W: "West" };

const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

function shortestAngle(from: number, to: number) {
  let d = (to - from) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export const SkyCanvas = forwardRef<SkyCanvasHandle, Props>(function SkyCanvas(props, ref) {
  const hintId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const [facing, setFacingState] = useState<Facing>(() => {
    const f = store.get<string>("ap.sky.facing", "S");
    return (["N", "E", "S", "W"].includes(f) ? f : "S") as Facing;
  });
  const viewRef = useRef<View>({ ...HOME_VIEW, rot: FACING_ROT[facing] });
  const picksRef = useRef<Pickable[]>([]);
  const hoveredRef = useRef<string | null>(null);
  const rafRef = useRef(0);
  const animRef = useRef(0);
  const propsRef = useRef(props);
  propsRef.current = props;
  const lineLayer = useMemo(() => (typeof document !== "undefined" ? document.createElement("canvas") : null), []);
  const mwRaster = useMemo(() => (typeof document !== "undefined" ? new MilkyWayRaster() : null), []);
  const cacheRef = useRef<{ scene: Scene | null; stars: unknown; polys: unknown; starProj: PointProj | null; lineProj: PointProj[] | null }>({
    scene: null,
    stars: null,
    polys: null,
    starProj: null,
    lineProj: null,
  });
  const theme = useMemo(() => readSkyTheme(), [props.themeKey]);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const polylines = useMemo<Polyline[] | null>(
    () => props.data.lines?.flatMap((f) => f.lines.map((xyz) => ({ abbr: f.abbr, xyz }))) ?? null,
    [props.data.lines],
  );
  const polylinesRef = useRef(polylines);
  polylinesRef.current = polylines;

  const [zoomed, setZoomed] = useState(false);
  const [looking, setLooking] = useState<string | null>(null);
  const lookingRef = useRef<string | null>(null);
  const zoomedRef = useRef(false);

  // ---- Drawing ------------------------------------------------------------------------------------
  const draw = useCallback(() => {
    const tDraw = performance.now();
    const canvas = canvasRef.current;
    const { w, h, dpr } = sizeRef.current;
    if (!canvas || w < 10 || h < 10) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dw = Math.round(w * dpr);
    const dh = Math.round(h * dpr);
    if (canvas.width !== dw || canvas.height !== dh) {
      canvas.width = dw;
      canvas.height = dh;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const p = propsRef.current;
    const view = viewRef.current;
    const T = affineOf(view, w, h);

    const cache = cacheRef.current;
    const polys = polylinesRef.current;
    if (cache.scene !== p.scene || cache.stars !== p.data.stars) {
      cache.starProj = p.data.stars ? projectXyz(p.data.stars.xyz, p.scene.frame, cache.starProj) : null;
    }
    if (cache.scene !== p.scene || cache.polys !== polys) {
      cache.lineProj = polys ? polys.map((pl, k) => projectXyz(pl.xyz, p.scene.frame, cache.polys === polys ? cache.lineProj?.[k] : null)) : null;
    }
    cache.scene = p.scene;
    cache.stars = p.data.stars;
    cache.polys = polys;

    const { picks, stats } = renderSky({
      ctx,
      dpr,
      T,
      scene: p.scene,
      theme: themeRef.current,
      layers: p.layers,
      stars: p.data.stars,
      starProj: cache.starProj,
      names: p.data.names,
      polylines: polys,
      lineProj: cache.lineProj,
      labels: p.data.labels,
      mwTex: p.layers.milkyWay && p.data.milkyWay ? milkyWayTexture(p.data.milkyWay) : null,
      mwRaster,
      lineLayer,
      dsos: p.dsos,
      selected: p.selected,
      hovered: hoveredRef.current,
      targets: p.targets,
    });
    picksRef.current = picks;
    if (import.meta.env.DEV) (window as any).__skyRender = { ...stats, total: performance.now() - tDraw, view };

    // Overlay state (only re-render React when it actually changes).
    const isZoomed = view.zoom > 1.02;
    if (isZoomed !== zoomedRef.current) {
      zoomedRef.current = isZoomed;
      setZoomed(isZoomed);
      canvas.style.touchAction = isZoomed ? "none" : "pan-y";
    }
    let look: string | null = null;
    if (view.zoom > 1.6) {
      const [u, v] = toPlane(T, w / 2, h / 2);
      const aa = altAzOfPlane(u, v);
      look = aa.alt > 84 ? "Looking straight up" : aa.alt < 0 ? `Below the ${compassPoint(aa.az)} horizon` : `Looking ${compassPoint(aa.az)} · ${Math.round(aa.alt)}° up`;
    }
    if (look !== lookingRef.current) {
      lookingRef.current = look;
      setLooking(look);
    }
  }, [lineLayer, mwRaster]);

  const requestDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      draw();
    });
  }, [draw]);

  useEffect(() => {
    requestDraw();
  }, [props.scene, props.data, props.dsos, props.layers, props.selected, props.targets, theme, polylines, requestDraw]);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      cancelAnimationFrame(animRef.current);
    },
    [],
  );

  // Size & DPR
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      sizeRef.current = { w: Math.round(r.width), h: Math.round(r.height), dpr: Math.min(3, window.devicePixelRatio || 1) };
      requestDraw();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const mq = window.matchMedia?.(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq?.addEventListener?.("change", measure);
    return () => {
      ro.disconnect();
      mq?.removeEventListener?.("change", measure);
    };
  }, [requestDraw]);

  // Labels use the app font; redraw once it has loaded.
  useEffect(() => {
    const fonts = (document as any).fonts as FontFaceSet | undefined;
    if (!fonts) return;
    let alive = true;
    Promise.all([fonts.load("500 11px Geist"), fonts.load("600 12px Geist")])
      .catch(() => null)
      .then(() => alive && requestDraw());
    return () => {
      alive = false;
    };
  }, [requestDraw]);

  // ---- View changes & animation -----------------------------------------------------------------
  const setView = useCallback(
    (v: View) => {
      viewRef.current = clampView(v);
      requestDraw();
    },
    [requestDraw],
  );

  const stopAnim = () => {
    cancelAnimationFrame(animRef.current);
    animRef.current = 0;
  };

  const animateTo = useCallback(
    (target: View, ms = 480) => {
      stopAnim();
      const from = { ...viewRef.current };
      const to = clampView(target);
      const dRot = shortestAngle(from.rot, to.rot);
      // The centre is stored in rotated coordinates; interpolate it in plane coordinates so rotation keeps the sky in place.
      const pFrom = rotatePlane(from.cx, from.cy, -from.rot);
      const pTo = rotatePlane(to.cx, to.cy, -to.rot);
      const t0 = performance.now();
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const step = (now: number) => {
        const p = reduce ? 1 : Math.min(1, (now - t0) / ms);
        const k = easeOut(p);
        const rot = from.rot + dRot * k;
        const zoom = Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * k);
        const pu = pFrom[0] + (pTo[0] - pFrom[0]) * k;
        const pv = pFrom[1] + (pTo[1] - pFrom[1]) * k;
        const [cx, cy] = rotatePlane(pu, pv, rot);
        viewRef.current = clampView({ zoom, cx, cy, rot });
        draw();
        if (p < 1) animRef.current = requestAnimationFrame(step);
        else animRef.current = 0;
      };
      animRef.current = requestAnimationFrame(step);
    },
    [draw],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const { w, h } = sizeRef.current;
      const v = viewRef.current;
      const T = affineOf(v, w, h);
      animateTo(zoomAbout(v, T, factor, w / 2, h / 2), 260);
    },
    [animateTo],
  );

  const reset = useCallback(() => animateTo({ zoom: 1, cx: 0, cy: 0, rot: viewRef.current.rot }), [animateTo]);

  const centreOn = useCallback(
    (alt: number, az: number, zoom = 2.6) => {
      const v = viewRef.current;
      const [u, vv] = planeOf(Math.max(alt, 0), az);
      const z = Math.min(MAX_ZOOM, Math.max(v.zoom, zoom));
      const [cx, cy] = rotatePlane(u, vv, v.rot);
      animateTo({ zoom: z, cx, cy, rot: v.rot });
    },
    [animateTo],
  );

  useImperativeHandle(ref, () => ({ zoomBy, reset, centreOn }), [zoomBy, reset, centreOn]);

  const setFacing = (f: Facing) => {
    setFacingState(f);
    store.set("ap.sky.facing", f);
    const v = viewRef.current;
    const p = rotatePlane(v.cx, v.cy, -v.rot);
    const rot = FACING_ROT[f];
    const [cx, cy] = rotatePlane(p[0], p[1], rot);
    animateTo({ zoom: v.zoom, cx, cy, rot }, 560);
  };

  // ---- Pointer interaction ------------------------------------------------------------------------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    mode: "none" | "pan" | "pinch";
    sx: number;
    sy: number;
    view: View;
    dist: number;
    mx: number;
    my: number;
    moved: boolean;
  }>({ mode: "none", sx: 0, sy: 0, view: HOME_VIEW, dist: 1, mx: 0, my: 0, moved: false });
  const lastTap = useRef({ t: 0, x: 0, y: 0 });

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const startGesture = () => {
    const pts = [...pointers.current.values()];
    const g = gesture.current;
    g.view = { ...viewRef.current };
    if (pts.length >= 2) {
      g.mode = "pinch";
      g.dist = Math.max(10, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
      g.mx = (pts[0].x + pts[1].x) / 2;
      g.my = (pts[0].y + pts[1].y) / 2;
      g.moved = true;
    } else if (pts.length === 1) {
      g.mode = "pan";
      g.sx = pts[0].x;
      g.sy = pts[0].y;
    } else g.mode = "none";
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    stopAnim();
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* not capturable */
    }
    if (pointers.current.size === 1) gesture.current.moved = false;
    startGesture();
  };

  const setHover = (refStr: string | null) => {
    if (hoveredRef.current === refStr) return;
    hoveredRef.current = refStr;
    requestDraw();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = local(e);
    const canvas = e.currentTarget;
    if (!pointers.current.has(e.pointerId)) {
      // Hover (mouse/pen without buttons)
      if (e.pointerType === "touch") return;
      const hit = pickAt(picksRef.current, p.x, p.y, 7);
      setHover(hit ? hit.ref : null);
      canvas.style.cursor = hit ? "pointer" : viewRef.current.zoom > 1.02 ? "grab" : "default";
      return;
    }
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    const { w, h } = sizeRef.current;
    if (g.mode === "pan") {
      const dx = p.x - g.sx;
      const dy = p.y - g.sy;
      if (!g.moved && Math.hypot(dx, dy) > (e.pointerType === "touch" ? 8 : 4)) g.moved = true;
      if (g.moved) {
        const T = affineOf(g.view, w, h);
        setView({ ...g.view, cx: g.view.cx - dx / T.S, cy: g.view.cy - dy / T.S });
        if (viewRef.current.zoom > 1.02) canvas.style.cursor = "grabbing";
      }
    } else if (g.mode === "pinch") {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      const dist = Math.max(10, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
      const mx = (pts[0].x + pts[1].x) / 2;
      const my = (pts[0].y + pts[1].y) / 2;
      const T0 = affineOf(g.view, w, h);
      const z = zoomAbout(g.view, T0, dist / g.dist, g.mx, g.my);
      const S = T0.R0 * z.zoom;
      setView({ ...z, cx: z.cx - (mx - g.mx) / S, cy: z.cy - (my - g.my) / S });
    }
  };

  const endPointer = (e: React.PointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    const wasTap = !cancelled && g.mode === "pan" && !g.moved;
    if (pointers.current.size > 0) {
      startGesture(); // pinch → pan with the remaining finger
      return;
    }
    g.mode = "none";
    e.currentTarget.style.cursor = viewRef.current.zoom > 1.02 ? "grab" : "default";
    if (!wasTap) return;
    const now = performance.now();
    const lt = lastTap.current;
    const isDouble = now - lt.t < 320 && Math.hypot(p.x - lt.x, p.y - lt.y) < 30;
    lastTap.current = { t: isDouble ? 0 : now, x: p.x, y: p.y };
    if (isDouble) {
      const { w, h } = sizeRef.current;
      const v = viewRef.current;
      animateTo(zoomAbout(v, affineOf(v, w, h), 2, p.x, p.y), 320);
      return;
    }
    const tol = e.pointerType === "touch" ? 20 : e.pointerType === "pen" ? 12 : 8;
    const hit = pickAt(picksRef.current, p.x, p.y, tol);
    propsRef.current.onSelect(hit ? hit.ref : null);
  };

  // Wheel zoom (non-passive so the page doesn't scroll underneath).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopAnim();
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const unit = e.deltaMode === 1 ? 0.06 : e.deltaMode === 2 ? 1 : 0.0022;
      const factor = Math.exp(-e.deltaY * unit * (e.ctrlKey ? 2.2 : 1));
      const { w, h } = sizeRef.current;
      const v = viewRef.current;
      setView(zoomAbout(v, affineOf(v, w, h), factor, x, y));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [setView]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const { w, h } = sizeRef.current;
    const v = viewRef.current;
    const T = affineOf(v, w, h);
    const pan = (dx: number, dy: number) => setView({ ...v, cx: v.cx + (dx * w * 0.12) / T.S, cy: v.cy + (dy * h * 0.12) / T.S });
    switch (e.key) {
      case "+":
      case "=":
        zoomBy(1.6);
        break;
      case "-":
      case "_":
        zoomBy(1 / 1.6);
        break;
      case "0":
        reset();
        break;
      case "ArrowLeft":
        pan(-1, 0);
        break;
      case "ArrowRight":
        pan(1, 0);
        break;
      case "ArrowUp":
        pan(0, -1);
        break;
      case "ArrowDown":
        pan(0, 1);
        break;
      case "Escape":
        propsRef.current.onSelect(null);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const starsLoading = props.data.starsLoading;

  return (
    <div ref={wrapRef} className={cn("relative aspect-square w-full select-none", props.className)}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ touchAction: "pan-y" }}
        tabIndex={0}
        role="img"
        aria-label={props.ariaLabel}
        aria-describedby={hintId}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endPointer(e, false)}
        onPointerCancel={(e) => endPointer(e, true)}
        onPointerLeave={(e) => {
          if (e.pointerType !== "touch" && !pointers.current.size) setHover(null);
        }}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
      />
      <span id={hintId} className="sr-only">
        Keyboard: plus and minus zoom, arrow keys pan, 0 shows the whole sky, Escape clears the selection.
      </span>

      {starsLoading && (
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading stars…
        </div>
      )}

      {looking && (
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 whitespace-nowrap rounded-full border bg-background/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur" aria-live="polite">
          {looking}
        </div>
      )}

      <div className="absolute right-1 top-1 flex flex-col gap-1.5 sm:right-2 sm:top-2">
        <Button variant="outline" size="icon" className="h-10 w-10 bg-background/70 backdrop-blur" onClick={() => zoomBy(1.6)} aria-label="Zoom in">
          <Plus />
        </Button>
        <Button variant="outline" size="icon" className="h-10 w-10 bg-background/70 backdrop-blur" onClick={() => zoomBy(1 / 1.6)} aria-label="Zoom out" disabled={!zoomed}>
          <Minus />
        </Button>
        {zoomed && (
          <Button variant="outline" size="icon" className="h-10 w-10 bg-background/70 backdrop-blur" onClick={reset} aria-label="Show the whole sky">
            <RotateCcw />
          </Button>
        )}
      </div>

      <div className="absolute bottom-1 left-1 sm:bottom-2 sm:left-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-10 gap-1.5 bg-background/70 px-3 backdrop-blur" aria-label={`Facing ${FACING_LABEL[facing]} — change which horizon is at the bottom`}>
              <Compass className="text-primary" />
              <span className="text-xs">
                Facing <span className="font-semibold">{facing}</span>
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Turn the chart so the horizon you face is at the bottom.</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={facing} onValueChange={(v) => setFacing(v as Facing)}>
              {(["N", "E", "S", "W"] as Facing[]).map((f) => (
                <DropdownMenuRadioItem key={f} value={f}>
                  Facing {FACING_LABEL[f]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
});
