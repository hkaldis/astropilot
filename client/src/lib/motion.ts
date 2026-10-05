/**
 * Small motion helpers. CSS does the animating (tailwind.config.ts keyframes, `animate-*` classes);
 * these add what CSS can't: staggering, counting numbers up, starting when something scrolls into
 * view, and honouring "reduce motion" in script-driven animation.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(cb: () => void) {
  const mq = typeof window !== "undefined" ? window.matchMedia?.(QUERY) : undefined;
  mq?.addEventListener?.("change", cb);
  return () => mq?.removeEventListener?.("change", cb);
}

export const prefersReducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.(QUERY).matches;

/** True when the visitor asked their system for less motion. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}

/** Delay for the i-th item of a list entrance (capped, so long lists don't keep arriving). */
export function stagger(i: number, stepMs = 45, max = 10): CSSProperties {
  return { animationDelay: `${Math.min(i, max) * stepMs}ms` };
}

const easeOut = (x: number) => 1 - Math.pow(1 - x, 4);

/**
 * A number that counts up to `value` on first show (from `from`), then glides to each new value.
 * Returns the in-between value; round or format it when rendering.
 */
export function useCountUp(value: number, { duration = 900, from = 0, delay = 0 }: { duration?: number; from?: number; delay?: number } = {}): number {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced || !Number.isFinite(value) ? value : from);
  const current = useRef(shown);
  useEffect(() => {
    if (reduced || !Number.isFinite(value)) {
      current.current = value;
      setShown(value);
      return;
    }
    const start = current.current;
    if (start === value) return;
    let raf = 0;
    let t0: number | null = null;
    const step = (now: number) => {
      t0 ??= now + delay;
      const k = Math.min(1, Math.max(0, (now - t0) / duration));
      const v = start + (value - start) * easeOut(k);
      current.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, delay, reduced]);
  return shown;
}

/**
 * Whether an element has scrolled into view (once, by default). Put the ref on a container and
 * `data-inview={inView}` on it, then give children `play-on-view` with their `animate-*` class:
 * they hold their first frame until the container is on screen.
 */
export function useInView<T extends Element>({ rootMargin = "0px 0px -8% 0px", once = true }: { rootMargin?: string; once?: boolean } = {}) {
  // A callback ref, so an element that mounts later (a list that fills in) is still observed.
  const [el, setEl] = useState<T | null>(null);
  const [inView, setInView] = useState(false);
  const done = once && inView;
  useEffect(() => {
    if (!el || done) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        // Several changes can arrive together; the last one is the current state.
        if (entries[entries.length - 1].isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) setInView(false);
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el, done, rootMargin, once]);
  return [setEl, inView] as const;
}

/** Run a DOM change (e.g. switching theme) as a gentle cross-fade where the browser supports it. */
export function withViewTransition(change: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (!doc.startViewTransition || prefersReducedMotion()) change();
  else doc.startViewTransition(change);
}
