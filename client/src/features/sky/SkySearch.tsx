import { useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { compassPoint, type AltAz } from "@shared/astro";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchSky, type SearchEntry } from "./objects";
import { SkyGlyph } from "./Panels";

interface Props {
  index: SearchEntry[];
  /** Current alt/az of a ref (null if unknown). */
  positionOf: (ref: string) => AltAz | null;
  onPick: (ref: string) => void;
  className?: string;
}

export function SkySearch({ index, positionOf, onPick, className }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const results = useMemo(() => searchSky(index, q, 8), [index, q]);

  const pick = (e: SearchEntry) => {
    onPick(e.ref);
    setQ("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      setOpen(true);
      setActive((a) => Math.min(results.length - 1, a + 1));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setActive((a) => Math.max(0, a - 1));
      e.preventDefault();
    } else if (e.key === "Enter") {
      const r = results[active] ?? results[0];
      if (r) pick(r);
      e.preventDefault();
    } else if (e.key === "Escape") {
      setOpen(false);
      if (!q) inputRef.current?.blur();
    }
  };

  const show = open && q.trim().length > 0;

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        placeholder="Find M31, Jupiter, Vega, Orion…"
        aria-label="Find an object on the chart"
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={show && results[active] ? `${listId}-${active}` : undefined}
        className="h-10 rounded-lg bg-surface-2/60 pl-9 pr-9"
        autoComplete="off"
        spellCheck={false}
      />
      {q && (
        <button
          type="button"
          className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground"
          onClick={() => {
            setQ("");
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {show && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-40 mt-1.5 max-h-[22rem] overflow-y-auto rounded-xl border bg-popover p-1 shadow-xl">
          {results.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">Nothing by that name on the chart.</li>}
          {results.map((r, i) => {
            const pos = positionOf(r.ref);
            const up = pos ? pos.alt > 0 : false;
            return (
              <li
                key={r.ref}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(r)}
                onMouseEnter={() => setActive(i)}
                className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5", i === active && "bg-accent")}
              >
                <SkyGlyph glyph={r.glyph} className={cn("h-5 w-5", up ? "text-gold" : "text-muted-foreground")} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.name}</div>
                  <div className="truncate text-2xs text-muted-foreground">{r.sub}</div>
                </div>
                <div className={cn("num shrink-0 text-right text-xs", up ? "text-foreground" : "text-muted-foreground")}>
                  {pos ? (up ? `${Math.round(pos.alt)}° ${compassPoint(pos.az)}` : "below horizon") : ""}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
