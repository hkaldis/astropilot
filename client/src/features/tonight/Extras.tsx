import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { upcomingEvents, formatDate, formatTime } from "@shared/astro";
import type { ObservingSite } from "@shared/api";
import type { IssPass, SpaceWeather } from "@shared/forecast";
import { withParams } from "@/lib/api";
import { cn } from "@/lib/utils";

const KIND_DOT: Record<string, string> = {
  moon: "bg-gold",
  meteor: "bg-primary",
  opposition: "bg-q-excellent",
  elongation: "bg-q-good",
  eclipse: "bg-q-poor",
  conjunction: "bg-q-fair",
  season: "bg-muted-foreground",
};

export function EventsList({ site, now, tz, hour12, limit = 7 }: { site: ObservingSite; now: number; tz?: string; hour12?: boolean; limit?: number }) {
  const day = Math.floor(now / 86_400_000);
  const events = useMemo(
    () => upcomingEvents(day * 86_400_000, 50, { lat: site.lat, lon: site.lon }).filter((e) => e.importance >= 2 && e.time > now - 86_400_000).slice(0, limit),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [day, site.lat, site.lon, limit],
  );
  return (
    <ol className="flex flex-col">
      {events.map((e) => (
        <li key={e.id} className="flex gap-3 border-b py-2.5 last:border-b-0">
          <div className="w-14 shrink-0 text-right">
            <div className="num text-xs font-medium">{formatDate(e.time, { tz })}</div>
            {(e.kind === "moon" || e.kind === "eclipse" || e.kind === "opposition") && <div className="num text-2xs text-muted-foreground">{formatTime(e.time, { tz, hour12 })}</div>}
          </div>
          <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", KIND_DOT[e.kind])} />
          <div className="min-w-0">
            <div className="text-sm font-medium leading-snug">{e.title}</div>
            <div className="text-xs text-muted-foreground">{e.detail}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function IssPasses({ site, tz, hour12, until }: { site: ObservingSite; tz?: string; hour12?: boolean; until: number }) {
  const q = useQuery<IssPass[]>({
    queryKey: [withParams("/api/iss/passes", { lat: site.lat.toFixed(3), lon: site.lon.toFixed(3), elev: Math.round(site.elevation ?? 0) })],
    staleTime: 30 * 60_000,
    retry: 0,
  });
  const passes = (q.data ?? []).filter((p) => p.visible && p.start < until + 2 * 86_400_000).slice(0, 3);
  if (q.isError || (!q.isLoading && passes.length === 0)) return <p className="text-sm text-muted-foreground">No visible ISS passes in the next few nights.</p>;
  return (
    <ul className="flex flex-col">
      {passes.map((p) => (
        <li key={p.start} className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0">
          <div>
            <div className="num text-sm font-medium">
              {formatDate(p.start, { tz, style: "weekday" })} {formatTime(p.start, { tz, hour12 })}
            </div>
            <div className="text-xs text-muted-foreground">
              {p.startDir} → {p.endDir} · max {Math.round(p.maxAlt)}°{p.magnitude !== undefined && p.magnitude !== null ? ` · mag ${p.magnitude.toFixed(1)}` : ""}
            </div>
          </div>
          <span className="num text-xs text-muted-foreground">{Math.max(1, Math.round((p.end - p.start) / 60000))} min</span>
        </li>
      ))}
    </ul>
  );
}

export function AuroraNote({ site }: { site: ObservingSite }) {
  const q = useQuery<SpaceWeather>({
    queryKey: [withParams("/api/space-weather", { lat: site.lat.toFixed(2), lon: site.lon.toFixed(2) })],
    staleTime: 15 * 60_000,
    retry: 0,
  });
  if (!q.data) return null;
  const kp = q.data.kpNow;
  const tone = kp >= 6 ? "text-q-excellent" : kp >= 4 ? "text-q-fair" : "text-muted-foreground";
  return (
    <div className="flex items-start gap-3">
      <div className={cn("num text-2xl font-semibold leading-none", tone)}>{kp.toFixed(1)}</div>
      <div className="text-sm">
        <div className="font-medium">Geomagnetic activity (Kp)</div>
        <div className="text-xs text-muted-foreground">{q.data.aurora.note}</div>
      </div>
    </div>
  );
}
