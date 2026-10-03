/** Catalog search (names, any designation, constellations) and the Explore filter state. */
import type { CatalogObject } from "@shared/data/types";
import { TYPE_GROUPS } from "@/lib/objects";
import { CONSTELLATIONS, canonicalConstellation, constellationName } from "./constellations";

const GREEK: Record<string, string> = {
  α: "alpha", β: "beta", γ: "gamma", δ: "delta", ε: "epsilon", ζ: "zeta", η: "eta", θ: "theta", ι: "iota", κ: "kappa", λ: "lambda", μ: "mu",
  ν: "nu", ξ: "xi", ο: "omicron", π: "pi", ρ: "rho", σ: "sigma", ς: "sigma", τ: "tau", υ: "upsilon", φ: "phi", χ: "chi", ψ: "psi", ω: "omega",
};

/** Lower-case, spell out Greek letters, strip accents: "Boötes" → "bootes", "β Cyg" → "beta cyg". */
function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/[α-ω]/g, (c) => GREEK[c] ?? c)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Search key: folded, without spaces or punctuation — "NGC 224" → "ngc224", "β Cyg" → "betacyg". */
export function norm(s: string): string {
  return fold(s).replace(/[^a-z0-9+]/g, "");
}

export interface SearchKeys {
  /** Exact identifiers: "m31", "ngc224", "c14" … */
  ids: string[];
  /** Names: "andromedagalaxy" plus each word start ("galaxy"). */
  names: string[];
  words: string[];
  /** Constellation: "and", "andromeda". */
  con: string[];
}

const keyCache = new WeakMap<object, SearchKeys>();

export function searchKeys(o: CatalogObject): SearchKeys {
  let k = keyCache.get(o);
  if (k) return k;
  const ids = new Set<string>([norm(o.id)]);
  for (const d of o.designations ?? []) ids.add(norm(d));
  if (o.m) {
    ids.add(`m${o.m}`);
    ids.add(`messier${o.m}`);
  }
  if (o.c) {
    ids.add(`c${o.c}`);
    ids.add(`caldwell${o.c}`);
  }
  const words = fold(o.name)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1);
  k = {
    ids: [...ids].filter(Boolean),
    names: [norm(o.name)],
    words,
    con: o.con ? [norm(o.con), norm(constellationName(o.con))] : [],
  };
  keyCache.set(o, k);
  return k;
}

/**
 * Match rank for a normalised query (lower is better), or null for no match.
 * 0 exact id · 1 exact name · 2 id prefix · 3 name prefix · 4 word prefix · 5 constellation · 6 substring
 */
export function matchRank(o: CatalogObject, q: string): number | null {
  if (!q) return 0;
  const k = searchKeys(o);
  if (k.ids.includes(q)) return 0;
  if (k.names.includes(q)) return 1;
  // "m3" should list M3 first but also M30–M39; "ngc70" prefixes NGC 7000 etc.
  if (/\d$/.test(q) ? k.ids.some((id) => id.startsWith(q) && /^\d/.test(id.slice(q.length))) : k.ids.some((id) => id.startsWith(q))) return 2;
  // A bare number ("7000", "31") matches any catalog with that number.
  if (/^\d+$/.test(q) && k.ids.some((id) => /^[a-z]+\d+$/.test(id) && id.replace(/^[a-z]+/, "") === q)) return 2;
  if (k.names.some((n) => n.startsWith(q))) return 3;
  if (q.length >= 2 && k.words.some((w) => w.startsWith(q))) return 4;
  if (q.length >= 3 && k.con.some((c) => c === q || (q.length >= 4 && c.startsWith(q)))) return 5;
  // Substrings only for word-like queries ("chi persei" → "h & χ Persei"), never for designations ("c14").
  if (q.length >= 3 && !/^[a-z]{1,5}\d+$/.test(q) && (k.names.some((n) => n.includes(q)) || (q.length >= 5 && k.ids.some((id) => id.includes(q)))))
    return 6;
  return null;
}

/** A constellation the query names exactly ("cyg", "cygnus"), if any. */
export function constellationQuery(q: string): string | null {
  const n = norm(q);
  if (n.length < 3) return null;
  for (const [abbr, name] of Object.entries(CONSTELLATIONS)) if (norm(abbr) === n || norm(name) === n) return abbr;
  return null;
}

// ------------------------------------------------------------------------------------
// Filters ⇄ URL
// ------------------------------------------------------------------------------------

export type SortKey = "best" | "bright" | "high" | "transit" | "catalog";
export const SORTS: { id: SortKey; label: string }[] = [
  { id: "best", label: "Best tonight" },
  { id: "bright", label: "Brightest" },
  { id: "high", label: "Highest now" },
  { id: "transit", label: "Transit time" },
  { id: "catalog", label: "Catalog number" },
];

export const DIFFICULTY_LEVELS = ["easy", "moderate", "challenging", "very hard", "out of reach"] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];
export const DIFFICULTY_FILTERS: { id: string; label: string; max: DifficultyLevel | null }[] = [
  { id: "any", label: "Any difficulty", max: null },
  { id: "easy", label: "Easy only", max: "easy" },
  { id: "moderate", label: "Up to moderate", max: "moderate" },
  { id: "challenging", label: "Up to challenging", max: "challenging" },
  { id: "very-hard", label: "Up to very hard", max: "very hard" },
];

export interface ExploreFilters {
  q: string;
  visible: boolean; // only objects observable tonight
  showpiece: boolean;
  messier: boolean;
  caldwell: boolean;
  groups: string[]; // TYPE_GROUPS ids
  diff: string; // DIFFICULTY_FILTERS id
  con: string | null; // IAU abbreviation
  sort: SortKey;
}

export const DEFAULT_FILTERS: ExploreFilters = {
  q: "",
  visible: true,
  showpiece: false,
  messier: false,
  caldwell: false,
  groups: [],
  diff: "any",
  con: null,
  sort: "best",
};

const GROUP_IDS = new Set(TYPE_GROUPS.map((g) => g.id));

export function filtersFromParams(p: URLSearchParams): ExploreFilters {
  const list = (k: string) => (p.get(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const cat = list("cat");
  const sort = p.get("sort") as SortKey | null;
  const diff = p.get("diff");
  return {
    q: (p.get("q") ?? "").slice(0, 80),
    visible: p.get("vis") !== "all",
    showpiece: p.get("show") === "1",
    messier: cat.includes("m"),
    caldwell: cat.includes("c"),
    groups: list("type").filter((g) => GROUP_IDS.has(g)),
    diff: DIFFICULTY_FILTERS.some((d) => d.id === diff) ? diff! : "any",
    con: canonicalConstellation(p.get("con")),
    sort: SORTS.some((s) => s.id === sort) ? sort! : "best",
  };
}

export function paramsFromFilters(f: ExploreFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (!f.visible) p.set("vis", "all");
  if (f.showpiece) p.set("show", "1");
  const cat = [f.messier && "m", f.caldwell && "c"].filter(Boolean) as string[];
  if (cat.length) p.set("cat", cat.join(","));
  if (f.groups.length) p.set("type", f.groups.join(","));
  if (f.diff !== "any") p.set("diff", f.diff);
  if (f.con) p.set("con", f.con);
  if (f.sort !== "best") p.set("sort", f.sort);
  return p;
}

export function activeFilterCount(f: ExploreFilters): number {
  return (f.showpiece ? 1 : 0) + (f.messier ? 1 : 0) + (f.caldwell ? 1 : 0) + f.groups.length + (f.diff !== "any" ? 1 : 0) + (f.con ? 1 : 0);
}

/** Sort key for "Catalog number": Messier, then Caldwell, then NGC, IC, others. */
export function catalogOrder(o: CatalogObject): [number, number, string] {
  if (o.m) return [0, o.m, ""];
  if (o.c) return [1, o.c, ""];
  const all = [o.id, ...(o.designations ?? [])];
  for (const d of all) {
    const m = /^NGC\s*(\d+)/i.exec(d);
    if (m) return [2, Number(m[1]), d];
  }
  for (const d of all) {
    const m = /^IC\s*(\d+)/i.exec(d);
    if (m) return [3, Number(m[1]), d];
  }
  return [4, 0, o.name];
}
