import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { addDays, currentNightDate, upcomingEvents, formatDate, formatMag, formatTime, nightDateOf, nightOf } from "@shared/astro";
import type { ObservingSite } from "@shared/api";
import type { IssPass, SpaceWeather, StationId } from "@shared/forecast";
import { Skel } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { withParams } from "@/lib/api";
import { cn } from "@/lib/utils";
import { stagger, useCountUp, useReducedMotion } from "@/lib/motion";
import { useNow } from "@/hooks/useNow";

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
  const all = useMemo(() => {
    const s = { lat: site.lat, lon: site.lon, elevation: site.elevation ?? 0, timezone: site.timezone };
    return upcomingEvents(day * 86_400_000, 50, s)
      .filter((e) => e.importance >= 2)
      .map((e) => {
        // Listed while still ahead or under way: a shower until its peak night is over, an eclipse until it ends.
        if (e.kind !== "meteor") return { e, until: e.end ?? e.time };
        const n = nightOf(nightDateOf(e.time, s), s);
        return { e, until: Math.max(e.end ?? 0, n.sunrise ?? n.nextNoon) };
      });
  }, [day, site.lat, site.lon, site.elevation, site.timezone]);
  const events = all
    .filter((x) => x.until > now)
    .map((x) => x.e)
    .slice(0, limit);
  const fmt = (t: number) => formatTime(t, { tz, hour12 });
  return (
    <ol className="flex flex-col">
      {events.map((e, i) => (
        <li key={e.id} className="flex animate-rise gap-3 border-b py-2.5 last:border-b-0" style={stagger(i, 45)}>
          <div className="w-14 shrink-0 text-right">
            <div className="num text-xs font-medium">{formatDate(e.time, { tz })}</div>
            {(e.kind === "moon" || e.kind === "eclipse" || e.kind === "opposition" || e.kind === "conjunction") && <div className="num text-2xs text-muted-foreground">{fmt(e.time)}</div>}
          </div>
          <span className="relative mt-1.5 h-2 w-2 shrink-0">
            {/* Imminent (within three days): a soft pulse. */}
            {e.time - now < 3 * 86_400_000 && <span className={cn("absolute inset-0 animate-ping-soft rounded-full opacity-0", KIND_DOT[e.kind])} aria-hidden="true" />}
            <span className={cn("absolute inset-0 rounded-full", KIND_DOT[e.kind])} />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium leading-snug">{e.title}</div>
            <div className="text-xs text-muted-foreground">{e.detail}</div>
            {e.start !== undefined && e.end !== undefined && (
              <div className="num mt-0.5 text-2xs text-muted-foreground">
                {e.kind === "meteor" ? "Best" : e.daytime ? "In your sky" : "Visible"} {fmt(e.start)}–{fmt(e.end)}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * `reach`: the latitude beyond which the station never climbs 10° above the horizon — its orbit's
 * inclination plus the ground distance to a 10°-high station (ISS 51.6° + 12.5°, Tiangong 41.5° + 11.8°).
 */
const STATIONS: { id: StationId; name: string; reach: number }[] = [
  { id: "iss", name: "ISS", reach: 64.1 },
  { id: "tiangong", name: "Tiangong", reach: 53.3 },
];
const satOf = (p: IssPass) => p.sat ?? "iss";

/** "Thu 15 Oct, 19:42" in the site's time zone. */
const whenText = (t: number, tz?: string, hour12?: boolean) => `${formatDate(t, { tz, style: "weekday" })} ${formatDate(t, { tz })}, ${formatTime(t, { tz, hour12 })}`;

/**
 * Why a station isn't in the list, and when it next is: its next visible pass in the 10-day
 * prediction (none of its passes is listed, so that's the first visible one — perhaps later in the
 * three nights, behind the other station's), or that every pass falls in daylight / Earth's shadow,
 * or that it never gets 10° up here.
 */
function stationNote(st: (typeof STATIONS)[number], lat: number, all: IssPass[], tz?: string, hour12?: boolean): string {
  const { id, name } = st;
  const mine = all.filter((p) => satOf(p) === id);
  // No passes at all: out of reach this far north/south, or its orbit couldn't be loaded.
  // (Within a degree of the limit, passes above 10° are rare enough to miss a 10-day window.)
  if (!mine.length) return Math.abs(lat) > st.reach - 1 ? `${name} never climbs more than 10° above your horizon from here.` : `${name}'s orbit couldn't be loaded just now.`;
  const next = mine.find((p) => p.visible);
  if (next) return `${name}: next visible pass ${whenText(next.start, tz, hour12)}.`;
  const day = mine.filter((p) => p.hidden === "daylight").length;
  const shade = mine.filter((p) => p.hidden === "shadow").length;
  const why = shade === 0 ? "in daylight" : day === 0 ? "while it's in Earth's shadow, unlit" : "in daylight or while it's in Earth's shadow";
  return `${name} only crosses your sky ${why} for the next 10 days.`;
}

/**
 * Where to look, as a small sky dial (north up, east left, as when you look up): the visible part of
 * the pass, with the station gliding along it for the next pass.
 */
function PassTrack({ p, live }: { p: IssPass; live: boolean }) {
  const S = 40;
  const c = S / 2;
  const R = c - 2.5;
  const pt = ([az, alt]: [number, number]): [number, number] => {
    const r = R * (1 - Math.max(0, Math.min(90, alt)) / 90);
    const a = (az * Math.PI) / 180;
    return [c - r * Math.sin(a), c - r * Math.cos(a)];
  };
  const track: [number, number][] = p.track?.length
    ? p.track
    : [
        [p.startAz, p.startAlt ?? 10],
        [p.maxAz, p.maxAlt],
        [p.endAz, p.endAlt ?? 10],
      ];
  const d = `M${track.map((t) => pt(t).map((v) => v.toFixed(1)).join(",")).join(" L")}`;
  const [ex, ey] = pt(track[track.length - 1]);
  const [mx, my] = pt([p.maxAz, p.maxAlt]);
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="h-10 w-10 shrink-0" aria-hidden="true">
      <circle cx={c} cy={c} r={R} className="fill-surface-2 stroke-border" strokeWidth={1} />
      <circle cx={c} cy={c} r={R / 2} fill="none" className="stroke-border" strokeWidth={0.6} strokeDasharray="1.5 2" />
      <text x={c} y={6.2} textAnchor="middle" className="fill-muted-foreground text-[5.5px] font-medium">
        N
      </text>
      <path d={d} fill="none" className="animate-draw stroke-primary" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} />
      <circle cx={ex} cy={ey} r={1.3} className="fill-primary/60" />
      {live ? (
        <circle r={2} className="fill-gold">
          <animateMotion dur="5.5s" repeatCount="indefinite" path={d} keyPoints="0;1;1" keyTimes="0;0.72;1" calcMode="linear" />
          <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.06;0.66;0.74;1" dur="5.5s" repeatCount="indefinite" />
        </circle>
      ) : (
        <circle cx={mx} cy={my} r={1.7} className="fill-gold" />
      )}
    </svg>
  );
}

/** Visible passes of the crewed stations (ISS and Tiangong) over the current night and the next two (whichever night is selected). */
export function IssPasses({ site, tz, hour12 }: { site: ObservingSite; tz?: string; hour12?: boolean }) {
  const q = useQuery<IssPass[]>({
    queryKey: [withParams("/api/satellites/passes", { lat: site.lat.toFixed(3), lon: site.lon.toFixed(3), elev: Math.round(site.elevation ?? 0) })],
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
    retry: 1,
  });
  const reduced = useReducedMotion();
  const now = useNow();
  const tonight = currentNightDate(now, site);
  // The end of the night after next, at the site.
  const horizon = useMemo(() => nightOf(addDays(tonight, 2), site).nextNoon, [tonight, site.lat, site.lon, site.elevation, site.timezone]); // eslint-disable-line react-hooks/exhaustive-deps
  if (q.isLoading) return <Skel className="h-24 w-full" />;
  // An error only matters when there's nothing to show (a failed background refresh keeps the last list).
  if (!q.data)
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Couldn't load the stations' orbits just now.</p>
        <Button variant="outline" size="sm" onClick={() => void q.refetch()} disabled={q.isFetching}>
          {q.isFetching && <Loader2 className="animate-spin" />}
          Try again
        </Button>
      </div>
    );
  // Passes that are over drop out while the page stays open (the list is fetched every half hour).
  const ahead = q.data.filter((p) => p.end > now);
  const soon = ahead.filter((p) => p.visible && p.start < horizon).slice(0, 4);
  const notes = STATIONS.filter((st) => !soon.some((p) => satOf(p) === st.id)).map((st) => ({ id: st.id, text: stationNote(st, site.lat, ahead, tz, hour12) }));
  return (
    <div className="flex flex-col gap-2.5">
      {soon.length > 0 ? (
        <ul className="flex flex-col">
          {soon.map((p, i) => (
            <li key={`${satOf(p)}-${p.start}`} className="flex animate-rise items-center gap-3 border-b py-2 last:border-b-0" style={stagger(i, 60)}>
              <PassTrack p={p} live={i === 0 && !reduced} />
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  <span className="num font-medium">
                    {formatDate(p.start, { tz, style: "weekday" })} {formatTime(p.start, { tz, hour12 })}
                  </span>
                  <span className="text-muted-foreground"> · {p.name ?? "ISS"}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {p.startDir} → {p.endDir} · max {Math.round(p.maxAlt)}°{p.magnitude !== undefined && p.magnitude !== null ? ` · mag ${formatMag(p.magnitude)}` : ""}
                </div>
              </div>
              <span className="num text-xs text-muted-foreground">{Math.max(1, Math.round((p.end - p.start) / 60000))} min</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="animate-rise text-sm">No visible passes in the next three nights.</p>
      )}
      {notes.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {notes.map((n, i) => (
            <li key={n.id} className="animate-fade" style={{ animationDelay: `${200 + i * 80}ms` }}>
              {n.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AuroraNote({ site }: { site: ObservingSite }) {
  const q = useQuery<SpaceWeather>({
    queryKey: [withParams("/api/space-weather", { lat: site.lat.toFixed(2), lon: site.lon.toFixed(2) })],
    staleTime: 15 * 60_000,
    retry: 0,
  });
  if (!q.data) return null;
  return <AuroraBody kp={q.data.kpNow} note={q.data.aurora.note} />;
}

function AuroraBody({ kp, note }: { kp: number; note: string }) {
  const shown = useCountUp(kp, { duration: 1000 });
  const tone = kp >= 6 ? "text-q-excellent" : kp >= 4 ? "text-q-fair" : "text-muted-foreground";
  return (
    <div className="relative flex items-start gap-3 overflow-hidden rounded-xl">
      {/* A storm brewing: a slow green-violet curtain behind the reading. */}
      {kp >= 5 && (
        <span
          className="pointer-events-none absolute inset-0 animate-aurora bg-[linear-gradient(110deg,transparent_10%,hsl(152_70%_50%/0.16)_35%,hsl(275_70%_60%/0.12)_60%,transparent_85%)] bg-[length:220%_100%]"
          aria-hidden="true"
        />
      )}
      <div className={cn("num relative text-2xl font-semibold leading-none", tone)}>
        <span aria-hidden="true">{shown.toFixed(1)}</span>
        <span className="sr-only">{kp.toFixed(1)}</span>
      </div>
      <div className="relative text-sm">
        <div className="font-medium">Geomagnetic activity (Kp)</div>
        <div className="text-xs text-muted-foreground">{note}</div>
      </div>
    </div>
  );
}
