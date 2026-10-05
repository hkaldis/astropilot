/**
 * A planet's moons through a night: positions at any moment and the night's transits, shadows, eclipses
 * and occultations. Jupiter's are computed in the browser; the moons of Mars, Saturn, Uranus and
 * Neptune come from JPL Horizons through /api/moons.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { galileanEvents, galileanPositions, moonsOf, seriesEvents, seriesPositions, type MoonEvent, type MoonMeta, type MoonPos, type MoonSeriesSet } from "@shared/astro";
import { withParams } from "@/lib/api";

export interface MoonSystem {
  planet: string;
  moons: MoonMeta[];
  status: "ready" | "loading" | "error";
  /** The moons at time t (ms), or null when positions aren't available for that moment. */
  at: (t: number) => MoonPos[] | null;
  /** Transits, shadow transits, eclipses and occultations in the requested window. */
  events: MoonEvent[];
  source: string;
  retry: () => void;
}

const FROM_SERVER = new Set(["mars", "saturn", "uranus", "neptune"]);

export function useMoonSystem(planet: string | null, from: number | null, to: number | null): MoonSystem | null {
  const remote = !!planet && FROM_SERVER.has(planet) && from !== null && to !== null;
  const q = useQuery<MoonSeriesSet & { source: string }>({
    queryKey: [withParams("/api/moons", { planet: planet ?? "", from: Math.round(from ?? 0), to: Math.round(to ?? 0) })],
    enabled: remote,
    staleTime: 60 * 60_000,
    retry: 1,
  });
  const jupiterEvents = useMemo(() => (planet === "jupiter" && from !== null && to !== null ? galileanEvents(from, to) : []), [planet, from, to]);
  const data = q.data;
  const remoteEvents = useMemo(() => (data && from !== null && to !== null ? seriesEvents(data, from, to) : []), [data, from, to]);
  const isError = q.isError;
  const refetch = q.refetch;

  return useMemo<MoonSystem | null>(() => {
    if (!planet || from === null || to === null) return null;
    const moons = moonsOf(planet);
    if (!moons.length) return null;
    if (planet === "jupiter") return { planet, moons, status: "ready", at: galileanPositions, events: jupiterEvents, source: "astronomy-engine (IMCCE L1 theory)", retry: () => undefined };
    return {
      planet,
      moons,
      status: data ? "ready" : isError ? "error" : "loading",
      at: (t) => (data ? seriesPositions(data, t) : null),
      events: remoteEvents,
      source: "JPL Horizons",
      retry: () => void refetch(),
    };
  }, [planet, from, to, data, isError, refetch, jupiterEvents, remoteEvents]);
}
