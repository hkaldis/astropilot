import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ForecastResponse, NightForecast } from "@shared/forecast";
import { nightOf, currentNightDate, addDays, nightFrames, type NightInfo, type NightFrames } from "@shared/astro";
import type { ObservingSite } from "@shared/api";
import { withParams } from "@/lib/api";

export function useForecast(site: ObservingSite | null) {
  return useQuery<ForecastResponse>({
    queryKey: [site ? withParams("/api/forecast", { lat: site.lat.toFixed(3), lon: site.lon.toFixed(3), bortle: site.bortle }) : "forecast:none"],
    enabled: !!site,
    staleTime: 20 * 60_000,
    refetchInterval: 30 * 60_000,
  });
}

export interface NightContext {
  date: string;
  night: NightInfo;
  frames: NightFrames;
  forecast: NightForecast | null;
  isTonight: boolean;
}

/** Astronomy for the selected night (computed locally) merged with its weather forecast. */
export function useNightContext(site: ObservingSite | null, offset: number, now: number, forecast?: ForecastResponse): NightContext | null {
  // Recompute the night only when the date changes, not every minute.
  const tonightDate = site ? currentNightDate(now, site) : null;
  const date = tonightDate ? addDays(tonightDate, offset) : null;
  const astro = useMemo(() => {
    if (!site || !date) return null;
    const night = nightOf(date, site);
    const frames = nightFrames(night, site, 10);
    return { night, frames };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site?.lat, site?.lon, site?.elevation, date]);
  if (!site || !date || !astro) return null;
  const fc = forecast?.nights.find((n) => n.date === date) ?? null;
  return { date, night: astro.night, frames: astro.frames, forecast: fc, isTonight: offset === 0 };
}
