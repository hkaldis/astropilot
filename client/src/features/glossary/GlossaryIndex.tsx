import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearch } from "wouter";
import { ArrowRight, Search, Sparkles, Trophy, X } from "lucide-react";
import { GLOSSARY, GLOSSARY_BY_SLUG, GLOSSARY_CATEGORIES, plainText, searchGlossary, sortKey, type GlossaryCategory, type GlossaryTerm } from "@shared/glossary";
import { PageHeader, Skel, usePageTitle } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CATEGORY_STYLE } from "./style";

const Quiz = lazy(() => import("./Quiz"));

/** A first path through the glossary: the ideas everything else builds on. */
const START_HERE = ["magnitude", "deep-sky-object", "seeing", "exit-pupil", "bortle-scale", "double-star"];

function TermCard({ t, compact }: { t: GlossaryTerm; compact?: boolean }) {
  const st = CATEGORY_STYLE[t.category];
  return (
    <Link
      href={`/glossary/${t.slug}`}
      className="group flex h-full flex-col gap-1.5 rounded-xl border bg-card px-4 py-3.5 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:border-primary/60"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold leading-snug group-hover:text-primary">{t.term}</span>
        {t.widget && (
          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary" title="Has something to try">
            <Sparkles className="h-3 w-3" /> Try it
          </span>
        )}
      </div>
      {!compact && t.aliases && t.aliases.length > 0 && <div className="-mt-1 truncate text-xs text-muted-foreground">also {t.aliases.slice(0, 3).join(", ")}</div>}
      <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{plainText(t.short)}</p>
      <div className="mt-auto flex items-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
        <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} />
        {GLOSSARY_CATEGORIES.find((c) => c.id === t.category)!.label}
      </div>
    </Link>
  );
}

export function GlossaryIndex() {
  usePageTitle("Glossary");
  const params = new URLSearchParams(useSearch());
  const [q, setQ] = useState(params.get("q") ?? "");
  const [cat, setCat] = useState<GlossaryCategory | "all">((params.get("c") as GlossaryCategory) ?? "all");
  const [quiz, setQuiz] = useState(false);
  const input = useRef<HTMLInputElement>(null);

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

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Learn"
        title="Glossary"
        description={`${GLOSSARY.length} words stargazers use, explained in plain language — with ${widgets} things to try, from the magnitude scale to splitting a double star.`}
      />

      <div className="flex flex-col gap-3">
        <label className="relative block">
          <span className="sr-only">Search the glossary</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQ("")}
            placeholder="Search: double star, exit pupil, Bortle…"
            className="h-12 w-full rounded-xl border bg-card pl-12 pr-12 text-base outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            enterKeyHint="search"
            autoComplete="off"
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
        <p className="sr-only" aria-live="polite">
          {results.length} {results.length === 1 ? "term" : "terms"}
        </p>
      </div>

      {!searching && cat === "all" && (
        <section className="flex flex-col gap-3" aria-labelledby="start-here">
          <h2 id="start-here" className="text-[1.05rem] font-semibold tracking-tight">
            Start here
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {START_HERE.map((s) => {
              const t = GLOSSARY_BY_SLUG[s];
              const st = CATEGORY_STYLE[t.category];
              const Icon = st.icon;
              return (
                <Link key={s} href={`/glossary/${s}`} className="group flex gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40">
                  <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", st.tint)}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-semibold group-hover:text-primary">
                      {t.term}
                      {t.widget && <Sparkles className="h-3.5 w-3.5 text-primary" aria-label="has something to try" />}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{plainText(t.short)}</span>
                  </span>
                </Link>
              );
            })}
          </div>
          <div className="mt-2 rounded-xl border bg-gradient-to-br from-primary/10 via-card to-card p-4 sm:p-5">
            {quiz ? (
              <Suspense fallback={<Skel className="h-56 w-full" />}>
                <Quiz onClose={() => setQuiz(false)} />
              </Suspense>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold">
                    <Trophy className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="font-semibold">Test yourself</div>
                    <p className="text-sm text-muted-foreground">Eight quick questions — read a definition, pick the word. Different every time.</p>
                  </div>
                </div>
                <Button onClick={() => setQuiz(true)} className="shrink-0">
                  Start the quiz <ArrowRight />
                </Button>
              </div>
            )}
          </div>
        </section>
      )}

      {searching ? (
        <section className="flex flex-col gap-3" aria-label="Search results">
          <p className="text-sm text-muted-foreground">
            {results.length ? `${results.length} ${results.length === 1 ? "term" : "terms"} for “${q.trim()}”` : `Nothing matches “${q.trim()}”.`}
          </p>
          {results.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {results.map((t) => (
                <TermCard key={t.slug} t={t} />
              ))}
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
                  <TermCard key={t.slug} t={t} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
