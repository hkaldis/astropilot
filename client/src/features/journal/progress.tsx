/** Journal progress visuals: Messier/Caldwell grids, Solar System chips, by-type bars, monthly activity. */
import { useMemo } from "react";
import { Link } from "wouter";
import { Check } from "lucide-react";
import { SOLAR_SYSTEM } from "@shared/astro/planets";
import type { CatalogObject } from "@shared/data/types";
import { cn } from "@/lib/utils";
import { monthLabel, typePlural } from "./format";

/** Small numbered tiles, ten per row (so rows read 1–10, 11–20, …). Observed tiles are filled. */
export function CatalogGrid({
  title,
  prefix,
  total,
  seen,
  objects,
  field,
}: {
  title: string;
  prefix: "M" | "C";
  total: number;
  seen: number[];
  objects: CatalogObject[];
  field: "m" | "c";
}) {
  const seenSet = useMemo(() => new Set(seen), [seen]);
  const byNumber = useMemo(() => {
    const map = new Map<number, CatalogObject>();
    for (const o of objects) {
      const n = o[field];
      if (n) map.set(n, o);
    }
    return map;
  }, [objects, field]);
  const pct = Math.round((seenSet.size / total) * 100);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="num text-sm">
          {seenSet.size}
          <span className="text-muted-foreground"> / {total}</span>
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <ol className="grid grid-cols-10 gap-[3px]" aria-label={`${title}: ${seenSet.size} of ${total} observed`}>
        {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
          const on = seenSet.has(n);
          const o = byNumber.get(n);
          const label = `${prefix} ${n}${o && o.name !== `${prefix} ${n}` && !o.name.startsWith("NGC") && !o.name.startsWith("IC") ? ` · ${o.name}` : ""}`;
          return (
            <li key={n}>
              <Link
                href={`/object/${o?.id ?? `${prefix}${n}`}`}
                title={`${label} — ${on ? "observed" : "not yet"}`}
                aria-label={`${label}, ${on ? "observed" : "not yet observed"}`}
                className={cn(
                  "num grid aspect-square place-items-center rounded-[5px] text-[0.6rem] leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on
                    ? "bg-primary font-semibold text-primary-foreground hover:bg-primary/85"
                    : "border border-border text-muted-foreground/80 hover:border-primary/50 hover:text-foreground",
                )}
              >
                {n}
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The Moon and the seven planets, ticked off when seen. */
export function SolarSystemChips({ planetsSeen, moonSeen }: { planetsSeen: string[]; moonSeen: boolean }) {
  const seen = new Set(planetsSeen);
  if (moonSeen) seen.add("moon");
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={`Solar System: ${seen.size} of ${SOLAR_SYSTEM.length} observed`}>
      {SOLAR_SYSTEM.map((p) => {
        const on = seen.has(p.id);
        return (
          <li key={p.id}>
            <Link
              href={`/object/${p.id}`}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
                on ? "border-gold/40 bg-gold/10 text-foreground hover:bg-gold/15" : "border-dashed text-muted-foreground hover:border-solid hover:text-foreground",
              )}
              aria-label={`${p.name}, ${on ? "observed" : "not yet observed"}`}
            >
              {on ? <Check className="h-3.5 w-3.5 text-gold" aria-hidden="true" /> : <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" aria-hidden="true" />}
              {p.name}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Horizontal bars: unique objects per type. */
export function TypeBars({ byType }: { byType: Record<string, number> }) {
  const rows = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map((r) => r[1]));
  if (!rows.length) return <p className="text-sm text-muted-foreground">Nothing logged yet.</p>;
  return (
    <dl className="flex flex-col gap-2.5">
      {rows.map(([type, n]) => (
        <div key={type} className="grid grid-cols-[minmax(0,9.5rem)_1fr_2.25rem] items-center gap-3 text-sm">
          <dt className="truncate text-muted-foreground">{typePlural(type)}</dt>
          <dd className="contents">
            <svg className="h-2 w-full overflow-visible" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
              <rect x="0" y="0" width="100" height="8" rx="4" className="fill-muted" />
              <rect x="0" y="0" width={Math.max(3, (n / max) * 100)} height="8" rx="4" className="fill-primary" />
            </svg>
            <span className="num text-right">{n}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Observations per month for the last 12 months. */
export function MonthBars({ perMonth }: { perMonth: { month: string; observations: number }[] }) {
  const max = Math.max(1, ...perMonth.map((m) => m.observations));
  const H = 96;
  const W = perMonth.length * 10;
  const total = perMonth.reduce((a, m) => a + m.observations, 0);
  return (
    <figure className="flex flex-col gap-2">
      <div className="grid text-center" style={{ gridTemplateColumns: `repeat(${perMonth.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {perMonth.map((m) => (
          <span key={m.month} className={cn("num text-2xs", m.observations ? "text-foreground" : "text-transparent")}>
            {m.observations || 0}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-24 w-full" role="img" aria-label={`Observations per month over the last 12 months: ${total} in total.`}>
        <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} className="stroke-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {perMonth.map((m, i) => {
          const h = m.observations ? Math.max(3, (m.observations / max) * (H - 4)) : 0;
          return (
            <rect key={m.month} x={i * 10 + 2} y={H - h} width="6" height={h} rx="1.2" className={i === perMonth.length - 1 ? "fill-primary" : "fill-primary/55"}>
              <title>{`${monthLabel(m.month)}: ${m.observations} observation${m.observations === 1 ? "" : "s"}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="grid text-center" style={{ gridTemplateColumns: `repeat(${perMonth.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {perMonth.map((m) => (
          <span key={m.month} className="text-2xs text-muted-foreground">
            {monthLabel(m.month, "short").slice(0, 1)}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Observations per month</caption>
        <tbody>
          {perMonth.map((m) => (
            <tr key={m.month}>
              <th scope="row">{monthLabel(m.month)}</th>
              <td>{m.observations}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
