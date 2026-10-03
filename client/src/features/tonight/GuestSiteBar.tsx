import { useMutation } from "@tanstack/react-query";
import { Loader2, MapPinned } from "lucide-react";
import { BORTLE } from "@shared/astro";
import type { ApiLocation, ObservingSite } from "@shared/api";
import { api, queryClient } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useSite } from "@/hooks/useSite";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

/** For an unsaved (guest) site: pick its sky darkness, and save it to the account when signed in. */
export function GuestSiteBar({ site }: { site: ObservingSite }) {
  const { user } = useAuth();
  const { setGuestSite, selectSite, clearGuestSite } = useSite();
  const save = useMutation({
    mutationFn: () =>
      api<ApiLocation>("POST", "/api/locations", {
        name: site.name,
        latitude: site.lat,
        longitude: site.lon,
        bortle: site.bortle,
        elevation: site.elevation,
        timezone: site.timezone,
        isFavorite: true,
      }),
    onSuccess: (loc) => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      if (loc?.id) selectSite(`loc:${loc.id}`);
      clearGuestSite();
      toast({ title: `Saved ${site.name}`, description: "It's now your default observing site." });
    },
    onError: (e: any) => toast({ title: "Couldn't save location", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-surface-2/40 px-4 py-3 text-sm sm:flex-row sm:items-center">
      <MapPinned className="hidden h-5 w-5 shrink-0 text-primary sm:block" />
      <div className="min-w-0 flex-1">
        <span className="font-medium">How dark is the sky at {site.name}?</span>{" "}
        <span className="text-muted-foreground">It changes what you can see. Not sure? Suburbs are ~5, rural ~3–4, dark sites 1–2.</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Select value={String(site.bortle)} onValueChange={(v) => setGuestSite({ ...site, bortle: Number(v) })}>
          <SelectTrigger className="h-9 w-[12.5rem]" aria-label="Sky darkness (Bortle class)">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(BORTLE).map(([b, v]) => (
              <SelectItem key={b} value={b}>
                Bortle {b} · {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {user && (
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />}Save
          </Button>
        )}
      </div>
    </div>
  );
}
