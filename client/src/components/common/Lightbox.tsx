import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_ZOOM = 5;

/**
 * A picture full screen: pinch, double-tap or scroll to zoom, drag to look around, swipe down (or tap ✕, press Esc,
 * or go back) to close. The phone's back gesture closes it too, instead of leaving the page.
 */
export function Lightbox({
  open,
  onClose,
  title,
  caption,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  caption?: ReactNode;
  /** The picture, filling the stage (an <img> with object-contain, or an SVG). */
  children: ReactNode;
}) {
  // ---- Back closes it: a history entry while it's open.
  const pushed = useRef(false);
  useEffect(() => {
    if (!open) return;
    history.pushState({ ...(history.state ?? {}), lightbox: true }, "");
    pushed.current = true;
    const onPop = () => {
      pushed.current = false;
      onClose();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open, onClose]);
  const close = useCallback(() => {
    if (pushed.current) history.back(); // pops our entry; the popstate handler closes
    else onClose();
  }, [onClose]);

  // ---- Zoom and pan.
  const [t, setT] = useState({ s: 1, x: 0, y: 0 });
  const [drag, setDrag] = useState(0); // swipe-down distance at zoom 1
  const [animate, setAnimate] = useState(false);
  const [hint, setHint] = useState(true);
  const stage = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ s: number; x: number; y: number; dist: number; mx: number; my: number; px: number; py: number } | null>(null);
  const lastTap = useRef(0);

  useEffect(() => {
    if (!open) return;
    setT({ s: 1, x: 0, y: 0 });
    setDrag(0);
    setHint(true);
    const id = setTimeout(() => setHint(false), 2800);
    return () => clearTimeout(id);
  }, [open]);

  const clampT = (s: number, x: number, y: number) => {
    const r = stage.current?.getBoundingClientRect();
    if (!r || s <= 1) return { s: 1, x: 0, y: 0 };
    const mx = ((s - 1) * r.width) / 2;
    const my = ((s - 1) * r.height) / 2;
    return { s, x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
  };
  /** Zoom to `s` keeping the stage point under (cx, cy) — client coordinates — in place. */
  const zoomAt = (s: number, cx: number, cy: number, from = t) => {
    const r = stage.current!.getBoundingClientRect();
    const ox = cx - (r.left + r.width / 2);
    const oy = cy - (r.top + r.height / 2);
    const k = s / from.s;
    return clampT(s, ox - (ox - from.x) * k, oy - (oy - from.y) * k);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* not a live pointer (synthetic events): fine without capture */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setAnimate(false);
    setHint(false);
    const ps = [...pointers.current.values()];
    if (ps.length === 2) {
      const [a, b] = ps;
      gesture.current = { s: t.s, x: t.x, y: t.y, dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, px: 0, py: 0 };
    } else if (ps.length === 1) {
      gesture.current = { s: t.s, x: t.x, y: t.y, dist: 0, mx: 0, my: 0, px: e.clientX, py: e.clientY };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const ps = [...pointers.current.values()];
    if (ps.length >= 2 && g.dist > 0) {
      const [a, b] = ps;
      const s = Math.max(1, Math.min(MAX_ZOOM, (g.s * Math.hypot(a.x - b.x, a.y - b.y)) / g.dist));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const next = zoomAt(s, g.mx, g.my, { s: g.s, x: g.x, y: g.y });
      setT(clampT(s, next.x + (mx - g.mx), next.y + (my - g.my)));
    } else if (ps.length === 1) {
      const dx = e.clientX - g.px;
      const dy = e.clientY - g.py;
      if (g.s > 1) setT(clampT(g.s, g.x + dx, g.y + dy));
      else setDrag(Math.max(0, dy));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    const start = g && pointers.current.size === 1 ? { x: g.px, y: g.py } : null;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) {
      // Pinch → one finger left: carry on panning from here.
      const [p] = [...pointers.current.values()];
      gesture.current = { s: t.s, x: t.x, y: t.y, dist: 0, mx: 0, my: 0, px: p.x, py: p.y };
      return;
    }
    gesture.current = null;
    setAnimate(true);
    if (drag > 110) {
      close();
      return;
    }
    setDrag(0);
    // A tap that didn't move: two in quick succession toggle the zoom there.
    const moved = start ? Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8 : true;
    if (!moved) {
      const now = performance.now();
      if (now - lastTap.current < 300) {
        lastTap.current = 0;
        setT(t.s > 1.05 ? { s: 1, x: 0, y: 0 } : zoomAt(2.5, e.clientX, e.clientY));
      } else lastTap.current = now;
    }
  };
  const onWheel = (e: React.WheelEvent) => {
    setAnimate(false);
    const s = Math.max(1, Math.min(MAX_ZOOM, t.s * Math.exp(-e.deltaY * 0.0025)));
    setT(zoomAt(s, e.clientX, e.clientY));
  };

  const fade = Math.max(0.35, 1 - drag / 400);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && close()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black data-[state=open]:animate-in data-[state=open]:fade-in-0" style={{ opacity: fade }} />
        <DialogPrimitive.Content
          className="fixed inset-0 z-[60] flex flex-col text-white outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <DialogPrimitive.Title className="min-w-0 truncate pt-2 text-base font-semibold [text-shadow:0_1px_3px_#000]">{title}</DialogPrimitive.Title>
            <button
              type="button"
              onClick={close}
              className="pointer-events-auto grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/15 text-white backdrop-blur-md transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label="Close full screen"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div
            ref={stage}
            className="relative flex-1 touch-none select-none overflow-hidden"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            <div
              className={cn("absolute inset-0 flex items-center justify-center p-2 [&_img]:max-h-full [&_img]:max-w-full [&_img]:object-contain", t.s > 1 ? "cursor-grab" : "cursor-zoom-in")}
              style={{
                transform: `translate(${t.x}px, ${t.y + drag}px) scale(${t.s * (1 - drag / 1500)})`,
                transition: animate ? "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)" : "none",
              }}
            >
              {children}
            </div>
            <div
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-4 flex justify-center transition-opacity duration-500",
                hint ? "opacity-100" : "opacity-0",
              )}
              aria-hidden="true"
            >
              <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white/85 backdrop-blur">
                <ZoomIn className="h-3.5 w-3.5" /> Pinch or double-tap to zoom · swipe down to close
              </span>
            </div>
          </div>

          {caption && (
            <div className="relative z-10 max-h-[30vh] overflow-y-auto bg-gradient-to-t from-black via-black/85 to-black/40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 text-xs leading-relaxed text-white/75" style={{ opacity: fade }}>
              {caption}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
