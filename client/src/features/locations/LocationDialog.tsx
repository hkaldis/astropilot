import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink, Loader2, Search } from "lucide-react";
import type { ApiLocation, GeoPlace, LocationInput } from "@shared/api";
import { bortleForSqm } from "@shared/astro/visibility";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { PlacePicker } from "@/components/common/PlacePicker";
import { apiGet, withParams } from "@/lib/api";
import { lookupZone } from "@/lib/geoZone";
import { useSite } from "@/hooks/useSite";
import { usePrefs } from "@/hooks/usePrefs";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { LocationMap } from "./LocationMap";
import { BortleExplainer, BortleScale, fmtElevation, lightPollutionUrl, tzOffset, useBortleLabelId } from "./bortle";
import { useLocationMutations } from "./useLocationMutations";
import { useSkyBrightness } from "@/hooks/useSkyBrightness";

export interface LocationSeed {
  name: string;
  lat: number;
  lon: number;
  bortle?: number;
  /** The visitor chose `bortle` themselves: keep it instead of the atlas estimate. */
  bortleChosen?: boolean;
  sqm?: number | null;
}

interface Known {
  lat: number;
  lon: number;
  timezone: string | null;
  elevation: number | null;
}

const SQM_MIN = 16;
const SQM_MAX = 22.5;
const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const parseNum = (s: string) => {
  const t = s.trim().replace(",", ".");
  return t ? Number(t) : null;
};

function Field({ id, label, hint, error, children, className }: { id: string; label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-msg`} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Add or edit a saved location: find the place, fine-tune the pin, set the sky darkness. */
export function LocationDialog({
  open,
  onOpenChange,
  location,
  seed,
  isFirst,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location?: ApiLocation | null;
  /** Pre-fill a new location (e.g. the guest site the visitor was using). */
  seed?: LocationSeed | null;
  isFirst?: boolean;
}) {
  const { site, selectSite } = useSite();
  const { prefs } = usePrefs();
  const { create, update } = useLocationMutations();
  const bortleLabel = useBortleLabelId();

  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);
  const [latStr, setLatStr] = useState("");
  const [lonStr, setLonStr] = useState("");
  const [focusKey, setFocusKey] = useState(0);
  /** Wider when the spot is being chosen on the map, close in to fine-tune a found place. */
  const [mapZoom, setMapZoom] = useState(12);
  const [known, setKnown] = useState<Known | null>(null);
  const [searching, setSearching] = useState(false);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [bortle, setBortle] = useState(5);
  const [bortleTouched, setBortleTouched] = useState(false);
  const [sqmStr, setSqmStr] = useState("");
  const [notes, setNotes] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  // A name suggested from the map pin may follow the pin; a typed or searched one never changes by itself.
  const naming = useRef({ name: "", touched: false, fromPin: false });
  naming.current.name = name;
  naming.current.touched = nameTouched;
  const suggestTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!open) return;
    const lat = location?.latitude ?? seed?.lat ?? null;
    const lon = location?.longitude ?? seed?.lon ?? null;
    setPos(lat !== null && lon !== null ? { lat, lon } : null);
    setLatStr(lat !== null ? String(lat) : "");
    setLonStr(lon !== null ? String(lon) : "");
    setKnown(location && lat !== null && lon !== null ? { lat, lon, timezone: location.timezone, elevation: location.elevation } : null);
    setSearching(lat === null);
    setName(location?.name ?? seed?.name ?? "");
    setNameTouched(!!location);
    setBortle(location?.bortle ?? seed?.bortle ?? 5);
    setBortleTouched(!!location || !!seed?.bortleChosen);
    setSqmStr(location?.sqm != null ? String(location.sqm) : seed?.sqm != null ? String(seed.sqm) : "");
    setNotes(location?.notes ?? "");
    setIsDefault(location ? location.isFavorite : !!isFirst);
    setShowErrors(false);
    setMapZoom(12);
    naming.current.fromPin = false;
    clearTimeout(suggestTimer.current);
    setFocusKey((k) => k + 1);
    create.reset();
    update.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, location, seed, isFirst]);

  const moveTo = useCallback((lat: number, lon: number) => {
    setPos({ lat, lon });
    setLatStr(String(lat));
    setLonStr(String(lon));
  }, []);

  const pick = (p: GeoPlace) => {
    const lat = Math.round(p.latitude * 1e5) / 1e5;
    const lon = Math.round(p.longitude * 1e5) / 1e5;
    moveTo(lat, lon);
    setFocusKey((k) => k + 1);
    setKnown({ lat, lon, timezone: p.timezone, elevation: p.elevation });
    if (!nameTouched) setName(p.name);
    naming.current.fromPin = false;
    setMapZoom(p.kind ? 13 : 12);
    setSearching(false);
  };

  // The pin moved on the map: an unnamed spot gets the nearest place's name (and its zone and height).
  const onMapMove = useCallback(
    (lat: number, lon: number) => {
      moveTo(lat, lon);
      clearTimeout(suggestTimer.current);
      const n = naming.current;
      if (n.touched || (n.name && !n.fromPin)) return;
      suggestTimer.current = setTimeout(() => {
        apiGet<GeoPlace>(withParams("/api/geo/reverse", { lat: lat.toFixed(5), lon: lon.toFixed(5) }))
          .then((p) => {
            const cur = naming.current;
            if (cur.touched || (cur.name && !cur.fromPin)) return;
            cur.fromPin = true;
            setName(p.name.startsWith("Near ") ? p.name : `Near ${p.name}`);
            setKnown({ lat, lon, timezone: p.timezone, elevation: p.elevation });
          })
          .catch(() => undefined);
      }, 700);
    },
    [moveTo],
  );
  useEffect(() => () => clearTimeout(suggestTimer.current), []);

  // A spot without a known zone and height (a lake from OpenStreetMap, a dragged pin) gets them now, so
  // they show before saving and are saved with it (the server's own lookup can be turned away).
  const zoneTried = useRef("");
  useEffect(() => {
    if (!open || !pos || (known && same(pos.lat, known.lat) && same(pos.lon, known.lon) && known.timezone)) return;
    const { lat, lon } = pos;
    const spot = `${lat},${lon}`;
    if (zoneTried.current === spot) return; // one try per spot
    const t = setTimeout(() => {
      zoneTried.current = spot;
      lookupZone(lat, lon)
        .then((z) => setKnown((k) => (k && same(k.lat, lat) && same(k.lon, lon) && k.timezone ? k : { lat, lon, timezone: z.timezone, elevation: z.elevation })))
        .catch(() => undefined);
    }, 800);
    return () => clearTimeout(t);
  }, [open, pos, known]);

  // No search knows the spot: start the map at the current place and let the visitor tap it.
  const chooseOnMap = () => {
    const from = pos ?? (site ? { lat: site.lat, lon: site.lon } : { lat: 37.98, lon: 23.73 });
    moveTo(from.lat, from.lon);
    setKnown(null);
    setMapZoom(9);
    setFocusKey((k) => k + 1);
    setSearching(false);
  };

  const commitCoords = () => {
    const lat = parseNum(latStr);
    const lon = parseNum(lonStr);
    if (lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (!pos || !same(lat, pos.lat) || !same(lon, pos.lon))) {
      setPos({ lat, lon });
      setFocusKey((k) => k + 1);
    }
  };

  // Validation
  const latN = parseNum(latStr);
  const lonN = parseNum(lonStr);
  const sqmN = parseNum(sqmStr);
  const errors: Record<string, string> = {};
  if (!pos) errors.place = "Search for a place or use your current position first.";
  if (latN === null || Number.isNaN(latN) || Math.abs(latN) > 90) errors.lat = "Latitude is −90 to 90";
  if (lonN === null || Number.isNaN(lonN) || Math.abs(lonN) > 180) errors.lon = "Longitude is −180 to 180";
  if (!name.trim()) errors.name = "Give the location a name";
  if (sqmN !== null && (Number.isNaN(sqmN) || sqmN < SQM_MIN || sqmN > SQM_MAX)) errors.sqm = `SQM readings run from about ${SQM_MIN} (city centre) to 22 (pristine sky)`;
  const err = showErrors ? errors : {};
  const sqmValid = sqmN !== null && !errors.sqm ? sqmN : null;
  const effBortle = sqmValid !== null ? bortleForSqm(sqmValid) : bortle;

  // Light-pollution atlas estimate for the chosen spot; pre-fills the class for new places.
  const atlas = useSkyBrightness(pos?.lat, pos?.lon);
  useEffect(() => {
    if (atlas.data && !bortleTouched) setBortle(atlas.data.bortle);
  }, [atlas.data, bortleTouched]);

  const saving = create.isPending || update.isPending;
  const serverError = (location ? update.error : create.error)?.message;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    if (Object.keys(errors).length || !pos || latN === null || lonN === null) return;
    // The typed coordinates are the source of truth (the map may not have caught up with a last edit).
    const at = { lat: latN, lon: lonN };
    const exact = !!(known && same(at.lat, known.lat) && same(at.lon, known.lon));
    const base = { name: name.trim(), latitude: at.lat, longitude: at.lon, bortle: effBortle, sqm: sqmValid, notes: notes.trim() || null };
    if (location) {
      const body: Partial<LocationInput> = { ...base };
      const moved = location.latitude === null || location.longitude === null || !same(location.latitude, at.lat) || !same(location.longitude, at.lon);
      // Moved: the server looks the time zone and elevation up again for the new spot.
      if (moved && exact && known?.timezone) body.timezone = known.timezone;
      if (moved && exact && known?.elevation != null) body.elevation = known.elevation;
      if (isDefault !== location.isFavorite) body.isFavorite = isDefault;
      update.mutate(
        { id: location.id, body },
        {
          onSuccess: (loc) => {
            if (isDefault && !location.isFavorite) selectSite(`loc:${loc.id}`);
            toast({ title: `Saved ${loc.name}` });
            onOpenChange(false);
          },
        },
      );
    } else {
      const body: LocationInput = { ...base, isFavorite: isDefault };
      if (exact && known?.timezone) body.timezone = known.timezone;
      if (exact && known?.elevation != null) body.elevation = known.elevation;
      create.mutate(body, {
        onSuccess: (loc) => {
          // Switch to the new site if it's the default or the visitor was on an unsaved place.
          if (loc.isFavorite || !site || site.key === "guest") selectSite(`loc:${loc.id}`);
          toast({ title: `Saved ${loc.name}`, description: loc.timezone ? `${loc.timezone}${loc.elevation !== null ? ` · ${fmtElevation(loc.elevation, prefs.units)}` : ""}` : undefined });
          onOpenChange(false);
        },
      });
    }
  };

  const exactNow = !!(pos && known && same(pos.lat, known.lat) && same(pos.lon, known.lon));
  const knownLine =
    exactNow && known && (known.timezone || known.elevation !== null) ? (
      <>
        {known.timezone && (
          <>
            {known.timezone}
            {tzOffset(known.timezone) ? ` (${tzOffset(known.timezone)})` : ""}
          </>
        )}
        {known.timezone && known.elevation !== null ? " · " : ""}
        {known.elevation !== null ? `${fmtElevation(known.elevation, prefs.units)} elevation` : ""}
      </>
    ) : (
      "Time zone and elevation are looked up for this exact spot when you save."
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] gap-5 overflow-y-auto p-5 sm:max-w-lg sm:p-6">
        <DialogHeader className="text-left">
          <DialogTitle>{location ? "Edit location" : "Add a location"}</DialogTitle>
          <DialogDescription>Find the place, fine-tune the pin, then tell AstroPilot how dark the sky is there.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          {searching && (
            <div className="flex flex-col gap-2">
              <PlacePicker onPick={pick} onMap={chooseOnMap} />
              {err.place && <p className="text-xs text-destructive">{err.place}</p>}
              {pos && (
                <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setSearching(false)}>
                  Keep the current position
                </Button>
              )}
            </div>
          )}

          {pos && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Position</span>
                {!searching && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSearching(true)}>
                    <Search /> Find another place
                  </Button>
                )}
              </div>
              <LocationMap lat={pos.lat} lon={pos.lon} onMove={onMapMove} focusKey={focusKey} zoom={mapZoom} className="h-56 sm:h-64" />
              <p className="text-xs text-muted-foreground">
                {mapZoom < 12 ? "Zoom and tap the map where you set up, then drag the pin to fine-tune." : "Drag the pin or tap the map to fine-tune the spot you set up on."}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field id="loc-lat" label="Latitude" error={err.lat}>
                  <Input
                    id="loc-lat"
                    inputMode="decimal"
                    autoComplete="off"
                    value={latStr}
                    onChange={(e) => setLatStr(e.target.value)}
                    onBlur={commitCoords}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), commitCoords())}
                    aria-invalid={!!err.lat}
                    aria-describedby="loc-lat-msg"
                    className="num h-10"
                  />
                </Field>
                <Field id="loc-lon" label="Longitude" error={err.lon}>
                  <Input
                    id="loc-lon"
                    inputMode="decimal"
                    autoComplete="off"
                    value={lonStr}
                    onChange={(e) => setLonStr(e.target.value)}
                    onBlur={commitCoords}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), commitCoords())}
                    aria-invalid={!!err.lon}
                    aria-describedby="loc-lon-msg"
                    className="num h-10"
                  />
                </Field>
              </div>
              <p className="num text-xs text-muted-foreground">{knownLine}</p>
            </div>
          )}

          <Field id="loc-name" label="Name" error={err.name}>
            <Input
              id="loc-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameTouched(true);
              }}
              placeholder="e.g. Back garden, Club dark site"
              maxLength={100}
              aria-invalid={!!err.name}
              aria-describedby="loc-name-msg"
              className="h-10"
            />
          </Field>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span id={bortleLabel} className="text-sm font-medium">
                Sky darkness
              </span>
              {pos && (
                <a href={lightPollutionUrl(pos.lat, pos.lon)} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1 text-xs">
                  Check your light pollution <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
            </div>
            <BortleScale
              value={effBortle}
              onChange={(b) => {
                setBortle(b);
                setBortleTouched(true);
              }}
              disabled={sqmValid !== null}
              labelledBy={bortleLabel}
            />
            <BortleExplainer bortle={effBortle} sqm={sqmValid} />
            {pos && atlas.data && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-surface-2/40 px-3 py-2 text-xs">
                <span className="min-w-0">
                  <span className="text-muted-foreground">Light-pollution atlas:</span> zenith ≈ <span className="num font-medium">{atlas.data.sqm.toFixed(2)}</span> mag/arcsec², about{" "}
                  <span className="font-medium">Bortle {atlas.data.bortle}</span>.{" "}
                  <a href={atlas.data.url} target="_blank" rel="noopener noreferrer" className="link">
                    Source
                  </a>
                </span>
                {sqmValid === null && effBortle !== atlas.data.bortle && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={() => {
                      setBortle(atlas.data!.bortle);
                      setBortleTouched(true);
                    }}
                  >
                    Use estimate
                  </Button>
                )}
              </div>
            )}
            {pos && atlas.isLoading && <p className="text-xs text-muted-foreground">Looking up light pollution for this spot…</p>}
          </div>

          <Field
            id="loc-sqm"
            label="SQM reading (optional)"
            error={err.sqm}
            hint={
              sqmValid !== null
                ? `Sets the sky to Bortle ${effBortle}. Clear it to pick the class yourself.`
                : "Measured with a Sky Quality Meter at the zenith, in mag/arcsec². More precise than a Bortle estimate."
            }
          >
            <Input
              id="loc-sqm"
              inputMode="decimal"
              autoComplete="off"
              value={sqmStr}
              onChange={(e) => setSqmStr(e.target.value)}
              placeholder="e.g. 21.2"
              aria-invalid={!!err.sqm}
              aria-describedby="loc-sqm-msg"
              className="num h-10 sm:w-40"
            />
          </Field>

          <Field id="loc-notes" label="Notes (optional)">
            <Textarea id="loc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={2} placeholder="Access, horizons, where to park…" />
          </Field>

          <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
            <Label htmlFor="loc-default" className="flex flex-col gap-0.5">
              <span>Default location</span>
              <span className="text-xs font-normal text-muted-foreground">AstroPilot opens with this site.</span>
            </Label>
            <Switch id="loc-default" checked={isDefault} onCheckedChange={setIsDefault} />
          </div>

          {serverError && (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {serverError}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {location ? "Save changes" : "Save location"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
