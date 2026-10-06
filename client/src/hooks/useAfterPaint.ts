import { startTransition, useEffect, useState } from "react";

/**
 * False on the first render, true once the browser has painted and has a moment: heavy work for sections
 * below the fold waits for it, so the top of the page shows first (a phone can spend a few hundred
 * milliseconds on a 50-day event search before drawing anything otherwise).
 */
export function useAfterPaint(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const go = () => startTransition(() => setReady(true));
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback && w.cancelIdleCallback) {
      const id = w.requestIdleCallback(go, { timeout: 300 });
      return () => w.cancelIdleCallback!(id);
    }
    const id = setTimeout(go, 30);
    return () => clearTimeout(id);
  }, []);
  return ready;
}
