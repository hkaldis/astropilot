import { useState } from "react";
import { Link } from "wouter";
import { Check, ChevronDown, MapPin, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useSite } from "@/hooks/useSite";
import { useAuth } from "@/hooks/useAuth";
import { PlacePicker, placeLabel } from "@/components/common/PlacePicker";
import { cn } from "@/lib/utils";

export function SiteSwitcher() {
  const { site, sites, selectSite, setGuestSite } = useSite();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearching(false);
      }}
    >
      <PopoverTrigger asChild>
        <button
          className="flex min-w-0 max-w-[60vw] items-center gap-2 rounded-full border bg-surface-2/60 py-1.5 pl-3 pr-2.5 text-sm transition-colors hover:bg-accent sm:max-w-sm"
          aria-label="Choose observing location"
        >
          <MapPin className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate font-medium">{site ? site.name : "Set your location"}</span>
          {site && <span className="num shrink-0 rounded-full bg-muted px-1.5 text-2xs text-muted-foreground">B{site.bortle}</span>}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,22rem)] p-2">
        {!searching ? (
          <div className="flex flex-col gap-1">
            {sites.length > 0 && <div className="eyebrow px-2 pb-1 pt-1">Observing from</div>}
            {sites.map((s) => (
              <button
                key={s.key}
                className={cn("flex items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-accent", s.key === site?.key && "bg-accent")}
                onClick={() => {
                  selectSite(s.key);
                  setOpen(false);
                }}
              >
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {s.lat.toFixed(2)}°, {s.lon.toFixed(2)}° · Bortle {s.bortle}
                    {s.key === "guest" ? " · not saved" : ""}
                  </span>
                </span>
                {s.key === site?.key && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
            <Button variant="ghost" className="justify-start" onClick={() => setSearching(true)}>
              <Plus /> {user ? "Look at another place" : sites.length ? "Change place" : "Choose a place"}
            </Button>
            {user && (
              <Button asChild variant="ghost" className="justify-start text-muted-foreground" onClick={() => setOpen(false)}>
                <Link href="/locations">Manage saved locations</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="p-1">
            <PlacePicker
              autoFocus
              onPick={(p) => {
                setGuestSite({
                  name: placeLabel(p).split(",")[0],
                  lat: p.latitude,
                  lon: p.longitude,
                  elevation: p.elevation,
                  timezone: p.timezone,
                  bortle: site?.bortle ?? 5,
                  sqm: null,
                });
                setOpen(false);
                setSearching(false);
              }}
            />
            <p className="mt-2 px-1 text-2xs text-muted-foreground">
              Assumes a suburban sky (Bortle {site?.bortle ?? 5}). {user ? "Save it under Locations to set its real sky darkness." : "Sign up to save locations with their sky darkness."}
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
