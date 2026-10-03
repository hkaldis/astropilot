import { useSite } from "@/hooks/useSite";
import { PlacePicker, placeLabel } from "@/components/common/PlacePicker";
import { cn } from "@/lib/utils";

/** Inline "where are you observing from?" prompt for visitors without a location. */
export function NoSite({ className, title = "Where are you observing from?", children }: { className?: string; title?: string; children?: React.ReactNode }) {
  const { setGuestSite } = useSite();
  return (
    <section className={cn("panel grid gap-5 p-5 sm:grid-cols-[1fr_minmax(0,22rem)] sm:p-6", className)}>
      <div>
        <div className="eyebrow mb-2">Your sky</div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {children ??
            "Visibility depends on your latitude, tonight's darkness and the Moon. Pick a place to get altitudes, best times and difficulty for your sky."}
        </p>
      </div>
      <PlacePicker
        onPick={(p) =>
          setGuestSite({
            name: placeLabel(p).split(",")[0],
            lat: p.latitude,
            lon: p.longitude,
            elevation: p.elevation,
            timezone: p.timezone,
            bortle: 5,
            sqm: null,
          })
        }
      />
    </section>
  );
}
