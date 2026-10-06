import { memo } from "react";
import { Link } from "wouter";
import { Star } from "lucide-react";
import type { CatalogObject } from "@shared/data/types";
import { formatAngleSize, formatMag, formatTime, type RankedTarget } from "@shared/astro";
import { TypeGlyph } from "@/components/common/Glyphs";
import { Badge } from "@/components/ui/badge";
import { DIFFICULTY_TONE, TYPE_LABEL, objectDesignation } from "@/lib/objects";
import { cn } from "@/lib/utils";
import { AltitudeSparkline } from "./Sparkline";
import { constellationName } from "./constellations";
import { altAt, shownBestTime } from "./sky";

export interface ExploreItem {
  o: CatalogObject;
  r: RankedTarget<CatalogObject> | null;
  visible: boolean;
}

export interface RowContext {
  tz: string | undefined;
  hour12: boolean;
  darkStart: number | null;
  darkEnd: number | null;
  minAlt: number;
  now: number;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Secondary designations worth showing next to the name (max two, never repeating the name). */
const SURVEY = /^(PGC|UGC|MCG|ESO|CGCG|IRAS|2MASX|LEDA|Arp|VV|KUG|SDSS)\b/i;

export function otherDesignations(o: CatalogObject, max = 2): string[] {
  const primary = objectDesignation(o);
  const same = (d: string) => d.replace(/\s/g, "").toLowerCase() === o.name.replace(/\s/g, "").toLowerCase();
  const list = [primary, ...(o.designations ?? [])].filter((d, i, a) => d && a.indexOf(d) === i && !same(d) && !SURVEY.test(d));
  return list.slice(0, max);
}

export function DifficultyBadge({ r, className }: { r: RankedTarget<CatalogObject> | null; className?: string }) {
  if (!r) return null;
  if (r.track.noDarkness)
    return (
      <Badge variant="outline" className={className}>
        No darkness
      </Badge>
    );
  if (r.track.neverUp || r.track.maxAlt < 0) {
    return (
      <Badge variant="outline" className={className}>
        {r.track.maxAlt < 0 ? "Not up" : "Too low"}
      </Badge>
    );
  }
  const d = r.detect.difficulty;
  return (
    <Badge variant={DIFFICULTY_TONE[d] ?? "outline"} className={className}>
      {cap(d)}
    </Badge>
  );
}

function BestText({ r, rc, compact }: { r: RankedTarget<CatalogObject>; rc: RowContext; compact?: boolean }) {
  const t = r.track;
  if (t.noDarkness) return <span className="text-muted-foreground">No darkness tonight</span>;
  if (t.maxAlt < 0) return <span className="text-muted-foreground">Below horizon</span>;
  if (t.neverUp)
    return (
      <span className="text-muted-foreground">
        peaks <span className="num">{Math.round(t.maxAlt)}°</span>
      </span>
    );
  // The refined transit when that's the best moment, so every page shows the same time; the altitude then.
  const time = formatTime(shownBestTime(r.bestTime, t, rc.darkStart, rc.darkEnd), { tz: rc.tz, hour12: rc.hour12 });
  const alt = Math.round(altAt(t, r.bestTime));
  // Compact (phones): a tight separator keeps it no wider than the sparkline above it.
  return compact ? (
    <span className="num whitespace-nowrap">
      {time}
      <span className="mx-px text-muted-foreground">·</span>
      {alt}°
    </span>
  ) : (
    <span>
      <span className="text-muted-foreground">best </span>
      <span className="num">{time}</span>
      <span className="text-muted-foreground"> · </span>
      <span className="num">{alt}°</span>
    </span>
  );
}

export const ResultRow = memo(function ResultRow({ item, rc }: { item: ExploreItem; rc: RowContext }) {
  const { o, r } = item;
  const des = otherDesignations(o);
  const typeLine = [TYPE_LABEL[o.type] ?? o.type, constellationName(o.con)].filter(Boolean).join(" · ");
  const spark = (w: number, h: number) =>
    r ? (
      <AltitudeSparkline
        points={r.track.points}
        darkStart={rc.darkStart}
        darkEnd={rc.darkEnd}
        window={r.track.window}
        minAlt={rc.minAlt}
        now={rc.now}
        best={r.bestTime}
        width={w}
        height={h}
      />
    ) : null;

  return (
    // New matches fade in as the list changes (rows that stay put don't re-animate).
    <li className="animate-fade" style={{ animationDuration: "0.35s" }}>
      <Link
        href={`/object/${encodeURIComponent(o.id)}`}
        className={cn(
          "group grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2.5 transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 sm:px-4",
          "md:grid-cols-[2.25rem_minmax(0,1fr)_6.5rem_7.5rem_8.5rem_6.75rem]",
          !item.visible && r && "opacity-75",
        )}
      >
        <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-foreground/80 group-hover:text-primary">
          <TypeGlyph type={o.type} id={o.id} className="h-[1.15rem] w-[1.15rem]" />
        </span>

        <span className="min-w-0">
          <span className="flex min-w-0 items-baseline gap-2">
            {/* Phones wrap a long name rather than cut it (the star follows its last word); wider screens keep one line. */}
            <span className="min-w-0 font-medium sm:truncate">
              {o.name}
              {o.showpiece && <Star className="ml-1.5 inline h-3 w-3 translate-y-[-1px] fill-gold text-gold sm:hidden" aria-label="Showpiece" />}
            </span>
            {o.showpiece && <Star className="hidden h-3 w-3 shrink-0 translate-y-[1px] fill-gold text-gold sm:block" aria-label="Showpiece" />}
            {des.length > 0 && <span className="num hidden shrink-0 truncate text-xs text-muted-foreground sm:inline">{des.join(" · ")}</span>}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            <span className="num sm:hidden">{des[0] ? `${des[0]} · ` : ""}</span>
            {typeLine}
          </span>
          {/* Mobile: difficulty + magnitude on a third line */}
          <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground md:hidden">
            <DifficultyBadge r={r} />
            <span className="num truncate">
              {[o.mag !== undefined ? `mag ${formatMag(o.mag)}` : null, o.type === "double_star" && o.sep ? `${o.sep}″` : o.size ? formatAngleSize(o.size) : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        </span>

        {/* Mobile right column */}
        <span className="flex flex-col items-end gap-1 text-xs md:hidden">
          {spark(76, 24)}
          {r && <BestText r={r} rc={rc} compact />}
        </span>

        {/* Desktop columns */}
        <span className="hidden text-xs md:block">
          <span className="num block">{o.mag !== undefined ? `mag ${formatMag(o.mag)}` : "—"}</span>
          <span className="num block text-muted-foreground">{o.type === "double_star" && o.sep ? `${o.sep}″ apart` : formatAngleSize(o.size)}</span>
        </span>
        <span className="hidden md:block">{spark(112, 30)}</span>
        <span className="hidden text-xs md:block">{r ? <BestText r={r} rc={rc} /> : null}</span>
        <span className="hidden justify-end md:flex">
          <DifficultyBadge r={r} />
        </span>
      </Link>
    </li>
  );
});
