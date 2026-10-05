import { useQuery } from "@tanstack/react-query";
import type { SkyBrightnessEstimate } from "@shared/api";
import { apiGet, withParams } from "@/lib/api";

const url = (lat: number, lon: number) => withParams("/api/geo/sky-brightness", { lat: lat.toFixed(3), lon: lon.toFixed(3) });

export function fetchSkyBrightness(lat: number, lon: number) {
  return apiGet<SkyBrightnessEstimate>(url(lat, lon));
}

/** Estimated zenith sky brightness and Bortle class from the light-pollution atlas (null outside coverage). */
export function useSkyBrightness(lat?: number | null, lon?: number | null) {
  const ok = typeof lat === "number" && typeof lon === "number" && Number.isFinite(lat) && Number.isFinite(lon);
  return useQuery<SkyBrightnessEstimate>({
    queryKey: [ok ? url(lat!, lon!) : "sky-brightness:none"],
    enabled: ok,
    staleTime: Infinity,
    retry: 0,
  });
}
