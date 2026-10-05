/** Search the deep-sky catalog and the Solar System to pick what was observed. */
import { useMemo, useState } from "react";
import { SOLAR_SYSTEM } from "@shared/astro/planets";
import type { CatalogObject } from "@shared/data/types";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { TypeGlyph } from "@/components/common/Glyphs";
import { useCatalog } from "@/hooks/useCatalog";
import { objectDesignation } from "@/lib/objects";
import { typeLabel } from "./format";

export interface PickedObject {
  ref: string;
  name: string;
  type: string;
}

interface Candidate extends PickedObject {
  sub: string;
  keys: string[]; // normalised search keys
  rank: number; // lower is better when tied
}

const norm = (s: string) => s.toLowerCase().replace(/[\s\-–_.'’]+/g, "");

function toCandidate(o: CatalogObject): Candidate {
  const designation = objectDesignation(o);
  return {
    ref: o.id,
    name: o.name,
    type: o.type,
    sub: [designation !== o.name ? designation : null, typeLabel(o.type), o.con].filter(Boolean).join(" · "),
    keys: [o.id, o.name, ...(o.designations ?? [])].map(norm),
    rank: (o.showpiece ? 0 : 10) + (o.m ? 0 : 5) + (o.mag ?? 12) / 2,
  };
}

const SOLAR: Candidate[] = SOLAR_SYSTEM.map((p, i) => ({
  ref: p.id,
  name: p.name,
  type: p.id === "moon" ? "moon" : "planet",
  sub: p.id === "moon" ? "Earth's Moon" : "Planet",
  keys: [norm(p.id), norm(p.name)],
  rank: i,
}));

function score(c: Candidate, q: string): number {
  let best = Infinity;
  for (const k of c.keys) {
    if (k === q) best = Math.min(best, 0);
    else if (k.startsWith(q)) best = Math.min(best, 1 + (k.length - q.length) / 100);
    else if (q.length >= 3 && k.includes(q)) best = Math.min(best, 3);
  }
  return best;
}

export function ObjectPicker({ onPick, autoFocus }: { onPick: (o: PickedObject) => void; autoFocus?: boolean }) {
  const { objects, isLoading } = useCatalog();
  const [query, setQuery] = useState("");
  const candidates = useMemo(() => objects.map(toCandidate), [objects]);

  const results = useMemo(() => {
    const q = norm(query);
    if (!q) return null;
    return [...SOLAR, ...candidates]
      .map((c) => ({ c, s: score(c, q) }))
      .filter((x) => Number.isFinite(x.s))
      .sort((a, b) => a.s - b.s || a.c.rank - b.c.rank)
      .slice(0, 40)
      .map((x) => x.c);
  }, [query, candidates]);

  const showpieces = useMemo(
    () =>
      objects
        .filter((o) => o.showpiece)
        .map(toCandidate)
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 12),
    [objects],
  );

  const item = (c: Candidate) => (
    <CommandItem key={c.ref} value={c.ref} onSelect={() => onPick({ ref: c.ref, name: c.name, type: c.type })} className="min-h-11 gap-3 py-2">
      <TypeGlyph type={c.type} id={c.ref} className="text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{c.name}</div>
        <div className="truncate text-xs text-muted-foreground">{c.sub}</div>
      </div>
    </CommandItem>
  );

  return (
    <Command shouldFilter={false} className="rounded-lg border bg-background">
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search M 13, NGC 7000, Jupiter, Ring Nebula…"
        aria-label="Search for an object"
        autoFocus={autoFocus}
        className="text-base md:text-sm"
      />
      <CommandList className="max-h-[min(46dvh,340px)]">
        {results ? (
          <>
            <CommandEmpty>{isLoading ? "Loading the catalog…" : "Nothing matches. Try a catalog number like “M 57” or “NGC 869”."}</CommandEmpty>
            {results.length > 0 && <CommandGroup heading="Results">{results.map(item)}</CommandGroup>}
          </>
        ) : (
          <>
            <CommandGroup heading="Solar System">{SOLAR.map(item)}</CommandGroup>
            {showpieces.length > 0 && <CommandGroup heading="Showpieces">{showpieces.map(item)}</CommandGroup>}
          </>
        )}
      </CommandList>
    </Command>
  );
}
