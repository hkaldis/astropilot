import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

// Leaflet guesses its marker image URLs from the CSS path, which breaks under a bundler:
// point the default icon at the bundled PNGs instead (no CDN).
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

/** Wrap a longitude into −180…180 (Leaflet lets you pan around the world more than once). */
export const normLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

function Recenter({ lat, lon, zoom, focusKey }: { lat: number; lon: number; zoom?: number; focusKey: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], zoom ?? map.getZoom(), { animate: false });
    // Only when the position comes from outside (search, typed coordinates) — not while dragging.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);
  return null;
}

/** The map is created inside an animating dialog: re-measure once it has its final size. */
function SizeFix() {
  const map = useMap();
  useEffect(() => {
    const timers = [60, 250, 600].map((ms) => setTimeout(() => map.invalidateSize(), ms));
    return () => timers.forEach(clearTimeout);
  }, [map]);
  return null;
}

function ClickToMove({ onMove }: { onMove: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onMove(round5(e.latlng.lat), round5(normLon(e.latlng.lng))) });
  return null;
}

/** OpenStreetMap with a draggable pin. Tap the map or drag the pin to fine-tune the position. */
export function LocationMap({
  lat,
  lon,
  onMove,
  focusKey,
  zoom = 12,
  className,
}: {
  lat: number;
  lon: number;
  onMove: (lat: number, lon: number) => void;
  /** Change this to recentre the map on lat/lon. */
  focusKey: number;
  zoom?: number;
  className?: string;
}) {
  const { theme } = useTheme();
  const handlers = useMemo(
    () => ({
      dragend: (e: L.LeafletEvent) => {
        const p = (e.target as L.Marker).getLatLng();
        onMove(round5(p.lat), round5(normLon(p.lng)));
      },
    }),
    [onMove],
  );
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-lg border",
        // Keep Leaflet's controls in our palette in the dark theme.
        "dark:[&_.leaflet-bar_a]:border-border dark:[&_.leaflet-bar_a]:bg-popover dark:[&_.leaflet-bar_a]:text-foreground",
        "dark:[&_.leaflet-control-attribution]:bg-background/80 dark:[&_.leaflet-control-attribution]:text-muted-foreground [&_.leaflet-control-attribution_a]:text-primary",
        className,
      )}
    >
      <MapContainer center={[lat, lon]} zoom={zoom} scrollWheelZoom={false} className="h-full w-full" worldCopyJump>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
          maxZoom={19}
          // Dark themes: let the bright tiles sink into the dark map background instead of glaring.
          opacity={theme === "light" ? 1 : 0.72}
        />
        <Marker position={[lat, lon]} draggable eventHandlers={handlers} title="Drag to fine-tune" />
        <ClickToMove onMove={onMove} />
        <Recenter lat={lat} lon={lon} focusKey={focusKey} />
        <SizeFix />
      </MapContainer>
    </div>
  );
}
