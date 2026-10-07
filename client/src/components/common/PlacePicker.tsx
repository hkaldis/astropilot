import { useEffect, useRef, useState } from "react";
import { Crosshair, Loader2, Map as MapIcon, MapPin, Search } from "lucide-react";
import type { GeoPlace } from "@shared/api";
import { apiGet, withParams } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function placeLabel(p: GeoPlace) {
  return [p.name, p.region, p.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");
}

/** "37.85, 22.46", "37.85N 22.46E": coordinates the server reads directly (see parseCoordinates there). */
const COORDS = /^[+-]?\d{1,2}(?:\.\d+)?\s*°?\s*[NS]?\s*[,;/\s]\s*[+-]?\d{1,3}(?:\.\d+)?\s*°?\s*[EW]?$/i;

/**
 * Search for a town, lake, peak, park or observatory, paste coordinates, or use the device position.
 * Towns come back at once; lakes, peaks and the like (OpenStreetMap, slower) are added when they arrive.
 * `onMap`: offer to choose the spot on a map instead. Emits a resolved place.
 */
export function PlacePicker({ onPick, onMap, autoFocus, className }: { onPick: (p: GeoPlace) => void; onMap?: () => void; autoFocus?: boolean; className?: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GeoPlace[]>([]);
  /** Nothing to show yet. */
  const [loading, setLoading] = useState(false);
  /** The full search (lakes, peaks…) is still running. */
  const [more, setMore] = useState(false);
  /** The quick town answer is in (so an empty list means no town by that name). */
  const [townsIn, setTownsIn] = useState(false);
  /** The text the last finished search was for ("nothing found" only speaks about that one). */
  const [doneFor, setDoneFor] = useState("");
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  // Each search has a number: answers to an older one (still in flight as you type) are dropped.
  const seq = useRef(0);

  useEffect(() => {
    clearTimeout(timer.current);
    const query = q.trim();
    if (query.length < 2) {
      seq.current++;
      setResults([]);
      setLoading(false);
      setMore(false);
      setError(null);
      return;
    }
    timer.current = setTimeout(() => {
      const id = ++seq.current;
      const current = () => id === seq.current;
      setLoading(true);
      setMore(!COORDS.test(query));
      setTownsIn(false);
      setError(null);
      let full = false;
      let towns = 0;
      if (!COORDS.test(query))
        apiGet<GeoPlace[]>(withParams("/api/geo/search", { q: query, scope: "towns" }))
          .then((r) => {
            if (!current() || full) return;
            towns = r.length;
            setResults(r);
            setTownsIn(true);
            if (r.length) setLoading(false);
          })
          .catch(() => {
            if (current()) setTownsIn(true);
          });
      apiGet<GeoPlace[]>(withParams("/api/geo/search", { q: query }))
        .then((r) => {
          if (current()) setResults(r);
        })
        .catch((e: Error) => {
          // With towns already listed, they stand; the error only matters when there's nothing.
          if (current() && !towns) setError(e.message);
        })
        .finally(() => {
          full = true;
          if (!current()) return;
          setLoading(false);
          setMore(false);
          setDoneFor(query);
        });
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
          placeholder="Town, lake, peak, park — or coordinates"
          className="h-11 pl-9"
          autoFocus={autoFocus}
          aria-label="Search for a place"
          autoComplete="off"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="outline" onClick={locate} disabled={locating} className="justify-start sm:flex-1">
          {locating ? <Loader2 className="animate-spin" /> : <Crosshair />}
          Use my current position
        </Button>
        {onMap && (
          <Button type="button" variant="outline" onClick={onMap} className="justify-start sm:flex-1">
            <MapIcon /> Choose on the map
          </Button>
        )}
      </div>
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
                    {p.kind && <span className="text-foreground/80">{p.kind} · </span>}
                    {[p.region, p.country].filter(Boolean).join(", ")} · {p.latitude.toFixed(2)}°, {p.longitude.toFixed(2)}°
                  </span>
                </span>
              </button>
            </li>
          ))}
          {more && (
            <li className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking for lakes, peaks and parks too…
            </li>
          )}
        </ul>
      )}
      {more && townsIn && results.length === 0 && (
        <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> No town by that name — looking for lakes, peaks and parks…
        </p>
      )}
      {!loading && !more && doneFor === q.trim() && q.trim().length >= 2 && results.length === 0 && !error && (
        <p className="px-1 text-xs text-muted-foreground">
          Nothing found by that name. Try a nearby town, paste coordinates (e.g. 37.85, 22.46){onMap ? ", or choose the spot on the map" : ""}.
        </p>
      )}
    </div>
  );
}
