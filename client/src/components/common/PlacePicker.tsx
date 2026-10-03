import { useEffect, useRef, useState } from "react";
import { Crosshair, Loader2, MapPin, Search } from "lucide-react";
import type { GeoPlace } from "@shared/api";
import { apiGet, withParams } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function placeLabel(p: GeoPlace) {
  return [p.name, p.region, p.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");
}

/** Search for a town/observatory or use the device position. Emits a resolved place. */
export function PlacePicker({ onPick, autoFocus, className }: { onPick: (p: GeoPlace) => void; autoFocus?: boolean; className?: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        setResults(await apiGet<GeoPlace[]>(withParams("/api/geo/search", { q: q.trim() })));
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer.current);
  }, [q]);

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setError("Your browser can't share its position. Search for a place instead.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const p = await apiGet<GeoPlace>(withParams("/api/geo/reverse", { lat: pos.coords.latitude.toFixed(5), lon: pos.coords.longitude.toFixed(5) }));
          onPick({ ...p, latitude: pos.coords.latitude, longitude: pos.coords.longitude, elevation: p.elevation ?? pos.coords.altitude ?? null });
        } catch {
          onPick({
            name: "My position",
            region: null,
            country: null,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            elevation: pos.coords.altitude ?? null,
            timezone: null,
          });
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        setError(err.code === err.PERMISSION_DENIED ? "Location permission was denied. Search for your town instead." : "Couldn't get your position. Search for your town instead.");
      },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 600_000 },
    );
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="place-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a town, observatory or dark-sky park"
          className="h-11 pl-9"
          autoFocus={autoFocus}
          aria-label="Search for a place"
          autoComplete="off"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      <Button type="button" variant="outline" onClick={locate} disabled={locating} className="justify-start">
        {locating ? <Loader2 className="animate-spin" /> : <Crosshair />}
        Use my current position
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {results.length > 0 && (
        <ul className="max-h-64 overflow-auto rounded-lg border" role="listbox" aria-label="Places">
          {results.map((p, i) => (
            <li key={`${p.latitude},${p.longitude},${i}`}>
              <button
                type="button"
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none"
                onClick={() => onPick(p)}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[p.region, p.country].filter(Boolean).join(", ")} · {p.latitude.toFixed(2)}°, {p.longitude.toFixed(2)}°
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!loading && q.trim().length >= 2 && results.length === 0 && !error && <p className="px-1 text-xs text-muted-foreground">No places found. Try a nearby town.</p>}
    </div>
  );
}
