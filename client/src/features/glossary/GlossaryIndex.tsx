import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { ArrowRight, Check, CloudMoon, Compass, Orbit, Search, Sparkles, Telescope, Trophy, X, type LucideIcon } from "lucide-react";
import {
  GLOSSARY,
  GLOSSARY_BY_SLUG,
  GLOSSARY_CATEGORIES,
  GLOSSARY_PATHS,
  plainText,
  searchGlossary,
  sortKey,
  suggestGlossary,
  wordOfTheNight,
  type GlossaryCategory,
  type GlossaryPath,
  type GlossaryTerm,
} from "@shared/glossary";
import { PageHeader, Skel, usePageTitle } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CATEGORY_STYLE } from "./style";
import { useSeenTerms } from "./progress";
import { useExamplePhoto } from "./photos";

const Quiz = lazy(() => import("./Quiz"));

const PATH_ICON: Record<string, LucideIcon> = { "first-night": Compass, telescope: Telescope, forecast: CloudMoon, "faint-fuzzies": Sparkles, "moon-planets": Orbit };

/** Terms you can picture get a small photograph of an object that shows them. */
const PICTURED: GlossaryCategory[] = ["deep-sky", "stars", "solar-system"];

function Thumb({ id, className }: { id: string; className?: string }) {
  const photo = useExamplePhoto(id);
  if (!photo) return null;
  return (
    <span className={cn("block shrink-0 overflow-hidden rounded-lg bg-black", className)}>
      <img src={photo.src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
    </span>
  );
}

function TermCard({ t, seen }: { t: GlossaryTerm; seen: boolean }) {
  const st = CATEGORY_STYLE[t.category];
  const thumb = PICTURED.includes(t.category) ? t.examples?.[0] : undefined;
  return (
    <Link
      href={`/glossary/${t.slug}`}
      className="group flex h-full gap-3 rounded-xl border bg-card px-4 py-3.5 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:border-primary/60"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold leading-snug group-hover:text-primary">{t.term}</span>
          {t.widget && (
            <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary" title="Has something to try">
              <Sparkles className="h-3 w-3" /> Try it
            </span>
          )}
        </div>
        {t.aliases && t.aliases.length > 0 && <div className="-mt-1 truncate text-xs text-muted-foreground">also {t.aliases.slice(0, 3).join(", ")}</div>}
        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{plainText(t.short)}</p>
        <div className="mt-auto flex items-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
          <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} />
          {GLOSSARY_CATEGORIES.find((c) => c.id === t.category)!.label}
          {seen && (
            <span className="ml-auto inline-flex items-center gap-0.5 text-q-excellent/90" title="You've read this one">
              <Check className="h-3 w-3" /> read
            </span>
          )}
        </div>
      </div>
      {thumb && <Thumb id={thumb} className="h-16 w-16 self-center opacity-90 transition-opacity group-hover:opacity-100" />}
    </Link>
  );
}

/** A ring that fills as you read: how much of the glossary you've explored. */
function ProgressRing({ seen, total }: { seen: number; total: number }) {
  const f = total ? seen / total : 0;
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5" aria-label={`You've read ${seen} of ${total} terms`}>
      <svg viewBox="0 0 48 48" className="h-11 w-11 -rotate-90" aria-hidden="true">
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="4" className="stroke-muted" />
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-primary transition-[stroke-dashoffset] duration-700" strokeDasharray={c} strokeDashoffset={c * (1 - f)} />
      </svg>
      <div className="leading-tight">
        <div className="num text-lg font-semibold">
          {seen}
          <span className="text-sm font-normal text-muted-foreground"> / {total}</span>
        </div>
        <div className="text-xs text-muted-foreground">{seen === total ? "every term read!" : "terms explored"}</div>
      </div>
    </div>
  );
}

function WordOfTheNight({ seen }: { seen: Set<string> }) {
  const t = useMemo(() => wordOfTheNight(), []);
  const st = CATEGORY_STYLE[t.category];
  const thumb = t.examples?.[0];
  return (
    <Link
      href={`/glossary/${t.slug}`}
      className="group relative flex items-stretch gap-4 overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/15 via-card to-card p-5 transition-colors hover:border-primary/40 sm:p-6"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="eyebrow flex items-center gap-1.5 text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Word of the night
        </div>
        <div className="font-display text-[1.9rem] leading-tight tracking-tight group-hover:text-primary sm:text-[2.2rem]">{t.term}</div>
        {t.say && <div className="-mt-1 text-sm text-muted-foreground">say “{t.say}”</div>}
        <p className="max-w-xl text-[0.95rem] leading-relaxed text-foreground/85">{plainText(t.short)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1 font-medium text-primary">
            {seen.has(t.slug) ? "Read it again" : t.widget ? "Read it — and try it" : "Read more"} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs", st.tint)}>
            <st.icon className="h-3 w-3" /> {GLOSSARY_CATEGORIES.find((c) => c.id === t.category)!.label}
          </span>
        </div>
      </div>
      {thumb ? (
        <Thumb id={thumb} className="hidden h-auto w-36 self-stretch rounded-xl sm:block" />
      ) : (
        <st.icon className="pointer-events-none absolute -right-4 -top-4 hidden h-40 w-40 text-primary/[0.07] sm:block" aria-hidden="true" />
      )}
    </Link>
  );
}

function PathCard({ p, seen }: { p: GlossaryPath; seen: Set<string> }) {
  const Icon = PATH_ICON[p.id] ?? Compass;
  const done = p.slugs.filter((s) => seen.has(s)).length;
  const next = p.slugs.find((s) => !seen.has(s)) ?? p.slugs[0];
  const complete = done === p.slugs.length;
  return (
    <Link href={`/glossary/${next}?path=${p.id}`} className="group flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40">
      <div className="flex items-start gap-3">
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", complete ? "bg-q-excellent/15 text-q-excellent" : "bg-primary/10 text-primary")}>
          {complete ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
        </span>
        <span className="min-w-0">
          <span className="block font-semibold leading-snug group-hover:text-primary">{p.title}</span>
          <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{p.blurb}</span>
        </span>
      </div>
      <div className="mt-auto flex items-center gap-3">
        {/* One segment per term, filled once read. */}
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {p.slugs.map((s) => (
            <span key={s} className={cn("h-1.5 flex-1 rounded-full", seen.has(s) ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
        <span className="num shrink-0 text-xs text-muted-foreground">
          {done}/{p.slugs.length}
        </span>
      </div>
      <span className="-mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary">
        {complete ? "Review" : done ? `Continue: ${GLOSSARY_BY_SLUG[next].term}` : "Start"} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

export function GlossaryIndex() {
  usePageTitle("Glossary");
  const [, navigate] = useLocation();
  const params = new URLSearchParams(useSearch());
  const [q, setQ] = useState(params.get("q") ?? "");
  const [cat, setCat] = useState<GlossaryCategory | "all">((params.get("c") as GlossaryCategory) ?? "all");
  const [quiz, setQuiz] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const seen = useSeenTerms();

  // "/" jumps to the search box, as on most reference sites.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && !/input|textarea|select/i.test(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Keep the search and category in the address, so a filtered view can be shared or come back to.
  useEffect(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (cat !== "all") p.set("c", cat);
    const qs = p.toString();
    const next = `/glossary${qs ? `?${qs}` : ""}`;
    if (next !== `${location.pathname}${location.search}`) history.replaceState(history.state, "", next);
  }, [q, cat]);

  const searching = q.trim().length > 0;
  const results = useMemo(() => searchGlossary(q).filter((t) => cat === "all" || t.category === cat), [q, cat]);
  const suggestions = useMemo(() => (searching && !results.length ? suggestGlossary(q) : []), [q, searching, results.length]);
  const counts = useMemo(() => Object.fromEntries(GLOSSARY_CATEGORIES.map((c) => [c.id, GLOSSARY.filter((t) => t.category === c.id).length])), []);
  const groups = useMemo(() => {
    const m = new Map<string, GlossaryTerm[]>();
    for (const t of results) {
      const L = sortKey(t.term)[0].toUpperCase();
      if (!m.has(L)) m.set(L, []);
      m.get(L)!.push(t);
    }
    return [...m];
  }, [results]);
  const widgets = GLOSSARY.filter((t) => t.widget).length;
  const seenCount = GLOSSARY.filter((t) => seen.has(t.slug)).length;

  // Enter opens the best match; the down arrow moves into the results.
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") setQ("");
    else if (e.key === "Enter" && searching) {
      const top = results[0] ?? suggestions[0];
      if (top) navigate(`/glossary/${top.slug}`);
    } else if (e.key === "ArrowDown" && searching) {
      e.preventDefault();
      resultsRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Learn"
        title="Glossary"
        description={`${GLOSSARY.length} words stargazers use, explained in plain language — with ${widgets} things to try, from the magnitude scale to splitting a double star.`}
        actions={seenCount > 0 ? <ProgressRing seen={seenCount} total={GLOSSARY.length} /> : undefined}
      />

      <div className="flex flex-col gap-3">
        <label className="relative block">
          <span className="sr-only">Search the glossary</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Search: double star, exit pupil, Bortle…"
            className="h-12 w-full rounded-xl border bg-card pl-12 pr-12 text-base outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            enterKeyHint="search"
            autoComplete="off"
            aria-describedby="glossary-count"
          />
          {q ? (
            <button type="button" onClick={() => setQ("")} className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-accent" aria-label="Clear the search">
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 rounded border px-1.5 text-xs text-muted-foreground sm:block">/</kbd>
          )}
        </label>

        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" role="radiogroup" aria-label="Category">
          {[{ id: "all" as const, label: "All", n: GLOSSARY.length }, ...GLOSSARY_CATEGORIES.map((c) => ({ id: c.id, label: c.label, n: counts[c.id] }))].map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={cat === c.id}
              onClick={() => setCat(c.id)}
              className={cn(
                "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
                cat === c.id ? "border-primary/50 bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {c.id !== "all" && <span className={cn("h-1.5 w-1.5 rounded-full", CATEGORY_STYLE[c.id].dot)} />}
              {c.label}
              <span className="num text-xs opacity-60">{c.n}</span>
            </button>
          ))}
        </div>
        {cat !== "all" && <p className="text-sm text-muted-foreground">{GLOSSARY_CATEGORIES.find((c) => c.id === cat)!.blurb}</p>}
        <p id="glossary-count" className="sr-only" aria-live="polite">
          {results.length} {results.length === 1 ? "term" : "terms"}
        </p>
      </div>

      {!searching && cat === "all" && (
        <>
          <WordOfTheNight seen={seen} />
          <section className="flex flex-col gap-3" aria-labelledby="paths">
            <div>
              <h2 id="paths" className="text-[1.05rem] font-semibold tracking-tight">
                Learn step by step
              </h2>
              <p className="text-sm text-muted-foreground">Short guided tours — each word builds on the one before. Your progress is kept on this device.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {GLOSSARY_PATHS.map((p) => (
                <PathCard key={p.id} p={p} seen={seen} />
              ))}
              <div className={cn("flex flex-col justify-between gap-3 rounded-xl border bg-gradient-to-br from-gold/10 via-card to-card p-4", quiz && "sm:col-span-2 sm:p-5 lg:col-span-3")}>
                {quiz ? (
                  <Suspense fallback={<Skel className="h-56 w-full" />}>
                    <Quiz onClose={() => setQuiz(false)} />
                  </Suspense>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold">
                        <Trophy className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block font-semibold">Test yourself</span>
                        <span className="mt-0.5 block text-sm text-muted-foreground">Eight quick questions — some with photos. Different every time.</span>
                      </span>
                    </div>
                    <Button onClick={() => setQuiz(true)} variant="outline" className="w-full">
                      Start the quiz <ArrowRight />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </section>
        </>
      )}

      {searching ? (
        <section ref={resultsRef} className="flex flex-col gap-3" aria-label="Search results">
          <p className="text-sm text-muted-foreground">
            {results.length ? `${results.length} ${results.length === 1 ? "term" : "terms"} for “${q.trim()}”` : `Nothing matches “${q.trim()}”.`}
            {results.length > 0 && <span className="hidden sm:inline"> — press Enter to open the first.</span>}
          </p>
          {results.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {results.map((t) => (
                <TermCard key={t.slug} t={t} seen={seen.has(t.slug)} />
              ))}
            </div>
          ) : suggestions.length ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm">Did you mean…</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {suggestions.map((t) => (
                  <TermCard key={t.slug} t={t} seen={seen.has(t.slug)} />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="text-muted-foreground">Try</span>
              {["galaxy", "magnitude", "seeing", "eyepiece"].map((s) => (
                <button key={s} type="button" className="link" onClick={() => setQ(GLOSSARY_BY_SLUG[s].term)}>
                  {GLOSSARY_BY_SLUG[s].term}
                </button>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="flex flex-col gap-4" aria-label="All terms, A to Z">
          {/* One scrolling row on phones, wrapped on wider screens. */}
          <nav className="scrollbar-none -my-1 flex gap-1 overflow-x-auto py-1 sm:flex-wrap sm:overflow-visible" aria-label="Jump to a letter">
            {groups.map(([L]) => (
              <a key={L} href={`#letter-${L}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-md border text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground sm:h-8 sm:w-8">
                {L}
              </a>
            ))}
          </nav>
          {groups.map(([L, terms]) => (
            <div key={L} id={`letter-${L}`} className="scroll-mt-20 flex flex-col gap-3">
              <h2 className="font-display text-2xl text-primary/80">{L}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {terms.map((t) => (
                  <TermCard key={t.slug} t={t} seen={seen.has(t.slug)} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
