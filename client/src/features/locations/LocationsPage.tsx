import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, MapPin, MoreHorizontal, Navigation, Pencil, Plus, Star, Trash2 } from "lucide-react";
import type { ApiLocation, ObservingSite } from "@shared/api";
import { BORTLE } from "@shared/astro/visibility";
import { EmptyState, ErrorState, PageHeader, Section, Skel, usePageTitle } from "@/components/common/Page";
import { PlacePicker } from "@/components/common/PlacePicker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { usePrefs } from "@/hooks/usePrefs";
import { useSite } from "@/hooks/useSite";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { BortleExplainer, BortleScale, SKY_SWATCH, bortleTone, fmtElevation, fmtLat, fmtLon, lightPollutionUrl, tzOffset, useBortleLabelId } from "./bortle";
import { LocationDialog, type LocationSeed } from "./LocationDialog";
import { LOCATIONS_KEY, useLocationMutations } from "./useLocationMutations";

export default function LocationsPage() {
  usePageTitle("Locations");
  const { user, isLoading } = useAuth();
  if (isLoading) return <LocationsSkeleton />;
  return user ? <MyLocations /> : <GuestLocations />;
}

function LocationsSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <Skel className="h-12 w-56" />
      <Skel className="h-36" />
      <Skel className="h-36" />
    </div>
  );
}

function BortleMark({ bortle }: { bortle: number }) {
  return (
    <div className="flex w-12 shrink-0 flex-col items-center gap-1.5" aria-hidden="true">
      <span className="eyebrow">Bortle</span>
      <span className={cn("num text-xl font-semibold leading-none", bortleTone(bortle))}>{bortle}</span>
      <span className={cn("h-1.5 w-9 rounded-full", SKY_SWATCH[bortle])} />
    </div>
  );
}

function siteLine(l: { latitude: number | null; longitude: number | null; elevation: number | null; timezone: string | null }, units: "metric" | "imperial") {
  const parts: string[] = [];
  if (l.latitude !== null && l.longitude !== null) parts.push(`${fmtLat(l.latitude)}, ${fmtLon(l.longitude)}`);
  if (l.elevation !== null) parts.push(fmtElevation(l.elevation, units));
  if (l.timezone) {
    const off = tzOffset(l.timezone);
    parts.push(off ? `${l.timezone} (${off})` : l.timezone);
  }
  return parts.join(" · ");
}

function LocationCard({
  l,
  isDefault,
  isCurrent,
  units,
  onUse,
  onMakeDefault,
  onEdit,
  onDelete,
}: {
  l: ApiLocation;
  isDefault: boolean;
  isCurrent: boolean;
  units: "metric" | "imperial";
  onUse: () => void;
  onMakeDefault: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const b = BORTLE[Math.min(9, Math.max(1, l.bortle))];
  const hasCoords = l.latitude !== null && l.longitude !== null;
  return (
    <li className={cn("panel flex flex-col gap-4 p-4 sm:p-5", isCurrent && "border-primary/50")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate text-base font-semibold leading-snug">{l.name}</h3>
            {isDefault && (
              <Badge variant="gold">
                <Star className="fill-current" aria-hidden="true" /> Default
              </Badge>
            )}
            {isCurrent && (
              <Badge variant="default">
                <Navigation aria-hidden="true" /> Observing from here
              </Badge>
            )}
          </div>
          <p className="num mt-1 text-xs text-muted-foreground sm:text-sm">{hasCoords ? siteLine(l, units) : "No coordinates yet — edit it to place it on the map."}</p>
        </div>
        <div className="-mr-2 -mt-1 flex shrink-0 items-center">
          {!isDefault && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={onMakeDefault} aria-label={`Make ${l.name} your default location`}>
                  <Star />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Make default</TooltipContent>
            </Tooltip>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground" aria-label={`Options for ${l.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil /> Edit
              </DropdownMenuItem>
              {hasCoords && (
                <DropdownMenuItem asChild>
                  <a href={lightPollutionUrl(l.latitude!, l.longitude!)} target="_blank" rel="noopener noreferrer">
                    <ExternalLink /> Light-pollution map
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex items-start gap-3 border-t pt-4">
        <BortleMark bortle={l.bortle} />
        <div className="min-w-0">
          <div className="text-sm font-medium">
            <span className="sr-only">Bortle {l.bortle}: </span>
            {b.label}
            {l.sqm !== null && <span className="num font-normal text-muted-foreground"> · SQM {l.sqm.toFixed(2)}</span>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{b.description}</p>
          {l.notes && <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{l.notes}</p>}
        </div>
      </div>

      {!isCurrent && hasCoords && (
        <div>
          <Button variant="outline" size="sm" className="h-9" onClick={onUse}>
            <Navigation /> Observe from here
          </Button>
        </div>
      )}
    </li>
  );
}

function MyLocations() {
  const q = useQuery<ApiLocation[]>({ queryKey: LOCATIONS_KEY });
  const { site, selectSite } = useSite();
  const { prefs } = usePrefs();
  const { update, remove } = useLocationMutations();
  const [dlg, setDlg] = useState<{ location: ApiLocation | null; seed: LocationSeed | null }>({ location: null, seed: null });
  const [dlgOpen, setDlgOpen] = useState(false);
  const [del, setDel] = useState<ApiLocation | null>(null);
  const [delOpen, setDelOpen] = useState(false);

  const locs = q.data ?? [];
  const defaultId = locs.find((l) => l.id === prefs.defaultLocationId)?.id ?? locs.find((l) => l.isFavorite)?.id ?? null;
  const guest = site?.key === "guest" ? site : null;
  const units = prefs.units ?? "metric";

  const openAdd = (seed: LocationSeed | null = null) => {
    setDlg({ location: null, seed });
    setDlgOpen(true);
  };
  const makeDefault = (l: ApiLocation) =>
    update.mutate(
      { id: l.id, body: { isFavorite: true } },
      {
        onSuccess: () => {
          selectSite(`loc:${l.id}`);
          toast({ title: `${l.name} is your default`, description: "AstroPilot opens with this site." });
        },
        onError: (e) => toast({ title: "Couldn't change the default", description: e.message, variant: "destructive" }),
      },
    );
  const use = (l: ApiLocation) => {
    selectSite(`loc:${l.id}`);
    toast({ title: `Observing from ${l.name}` });
  };
  const confirmDelete = () => {
    if (!del) return;
    remove.mutate(del.id, {
      onSuccess: () => {
        toast({ title: `Deleted ${del.name}`, description: "Journal sessions from there keep their notes and sky details." });
        setDelOpen(false);
      },
      onError: (e) => toast({ title: `Couldn't delete ${del.name}`, description: e.message, variant: "destructive" }),
    });
  };

  const header = (
    <PageHeader
      eyebrow="Observing sites"
      title="Locations"
      description="Where you observe. Each site's sky darkness, time zone and elevation shape the forecast and what AstroPilot suggests."
      actions={
        <Button onClick={() => openAdd()}>
          <Plus /> Add location
        </Button>
      }
    />
  );

  if (q.isLoading) return <LocationsSkeleton />;
  if (q.isError)
    return (
      <div className="flex flex-col gap-8">
        {header}
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      </div>
    );

  return (
    <div className="flex flex-col gap-8">
      {header}

      {guest && (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-sm">
            <div className="font-medium">You're looking at {guest.name}, which isn't saved</div>
            <p className="text-muted-foreground">Save it to keep it one tap away, with its sky darkness and notes.</p>
          </div>
          <Button variant="outline" className="shrink-0" onClick={() =>
              openAdd({
                name: guest.name,
                lat: guest.lat,
                lon: guest.lon,
                bortle: guest.bortle,
                bortleChosen: guest.bortleSource === "user",
                sqm: guest.bortleSource === "atlas" ? null : guest.sqm,
              })
            }
          >
            <MapPin /> Save this place
          </Button>
        </div>
      )}

      {locs.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-5 w-5" />}
          title="Save your first observing site"
          description="Your back garden, a club dark site, a holiday spot: AstroPilot uses its coordinates, time zone, elevation and sky darkness for every plan."
          action={
            <Button onClick={() => openAdd()}>
              <Plus /> Add location
            </Button>
          }
        />
      ) : (
        <Section title={`${locs.length} saved ${locs.length === 1 ? "location" : "locations"}`}>
          <ul className="grid gap-3 lg:grid-cols-2">
            {locs.map((l) => (
              <LocationCard
                key={l.id}
                l={l}
                units={units}
                isDefault={l.id === defaultId}
                isCurrent={site?.locationId === l.id}
                onUse={() => use(l)}
                onMakeDefault={() => makeDefault(l)}
                onEdit={() => {
                  setDlg({ location: l, seed: null });
                  setDlgOpen(true);
                }}
                onDelete={() => {
                  setDel(l);
                  setDelOpen(true);
                }}
              />
            ))}
          </ul>
        </Section>
      )}

      <LocationDialog open={dlgOpen} onOpenChange={setDlgOpen} location={dlg.location} seed={dlg.seed} isFirst={locs.length === 0} />

      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {del?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Journal sessions you logged there stay in your journal with their notes and sky details; they just won't be linked to this place.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ------------------------------------------------------------------------------------
// Signed out
// ------------------------------------------------------------------------------------

function GuestLocations() {
  const { site, setGuestSite } = useSite();
  const { prefs } = usePrefs();
  const label = useBortleLabelId();
  const guest: ObservingSite | null = site;
  const setBortle = (b: number) =>
    guest && setGuestSite({ name: guest.name, lat: guest.lat, lon: guest.lon, elevation: guest.elevation, timezone: guest.timezone, bortle: b, sqm: null, bortleSource: "user" });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Observing sites" title="Locations" description="Where you observe sets the sky darkness, time zone and horizon behind every forecast and suggestion." />

      <section className="panel grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
        <div>
          <h2 className="text-[1.05rem] font-semibold tracking-tight">Save the places you observe from</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {[
              "Your garden, a club dark site, a holiday spot — switch between them in one tap",
              "Each with its own sky darkness (Bortle class or a measured SQM reading)",
              "Times shown in the site's own time zone, wherever you are",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-2 sm:w-48">
          <Button asChild>
            <Link href="/register">Create free account</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </section>

      <Section title="Where you're observing from" description="Used right now for the forecast and visibility. Kept in this browser only.">
        {guest ? (
          <div className="panel flex flex-col gap-4 p-4 sm:p-5">
            <div>
              <h3 className="text-base font-semibold">{guest.name}</h3>
              <p className="num mt-1 text-xs text-muted-foreground sm:text-sm">
                {siteLine({ latitude: guest.lat, longitude: guest.lon, elevation: guest.elevation, timezone: guest.timezone }, prefs.units ?? "metric")}
              </p>
            </div>
            <div className="flex flex-col gap-2 border-t pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span id={label} className="text-sm font-medium">
                  How dark is your sky?
                </span>
                <a href={lightPollutionUrl(guest.lat, guest.lon)} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1 text-xs">
                  Check your light pollution <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </div>
              <BortleScale value={guest.bortle} onChange={setBortle} labelledBy={label} />
              <BortleExplainer bortle={guest.bortle} sqm={guest.bortleSource === "atlas" ? guest.sqm : null} sqmKind="atlas" />
              {guest.bortleSource === "atlas" && (
                <p className="text-2xs text-muted-foreground">
                  Estimated from the{" "}
                  <a href="https://djlorenz.github.io/astronomy/lp/" target="_blank" rel="noreferrer" className="link">
                    2025 light-pollution atlas
                  </a>
                  . If you know your sky better, pick its class above.
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No place set yet — search for your town or use your current position.</p>
        )}
        <div className="panel p-4 sm:p-5">
          <div className="mb-3 text-sm font-medium">{guest ? "Somewhere else?" : "Choose a place"}</div>
          <PlacePicker
            onPick={(p) => {
              setGuestSite({ name: p.name, lat: p.latitude, lon: p.longitude, elevation: p.elevation, timezone: p.timezone, bortle: guest?.bortle ?? 5, sqm: null });
              toast({ title: `Observing from ${p.name}`, description: "Sky darkness is estimated from the light-pollution atlas — adjust it if you know better." });
            }}
          />
        </div>
      </Section>
    </div>
  );
}
