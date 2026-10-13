import { Suspense, useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { ArrowLeft, ArrowRight, Check, Link2, Lightbulb, PartyPopper, Search, Share2, Sparkles } from "lucide-react";
import { GLOSSARY_BY_SLUG, GLOSSARY_CATEGORIES, GLOSSARY_PATH_BY_ID, GLOSSARY_SORTED, plainText, searchGlossary, suggestGlossary, type GlossaryPath } from "@shared/glossary";
import { MOON_BY_ID, PLANET_BY_ID } from "@shared/astro";
import { photoOf } from "@shared/objectImages";
import { TYPE_LABEL } from "@/lib/objects";
import { findObject, useCatalog } from "@/hooks/useCatalog";
import { EmptyState, Skel, usePageTitle } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/common/Glyphs";
import { cn } from "@/lib/utils";
import { RichText } from "./RichText";
import { Term } from "./Term";
import { WIDGETS, WIDGET_TITLE } from "./widgets";
import { CATEGORY_STYLE } from "./style";
import { markSeen, useSeenTerms } from "./progress";

function BackLink() {
  return (
    <Link href="/glossary" className="inline-flex min-h-[2.5rem] items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Glossary
    </Link>
  );
}

/** An object that shows the term in the sky: its photograph, name and kind, linking to its page. */
function Example({ id }: { id: string }) {
  const { byId } = useCatalog();
  const dso = findObject(byId, id);
  const planet = (PLANET_BY_ID as Record<string, { name: string } | undefined>)[id];
  const moon = (MOON_BY_ID as Record<string, { name: string; parent: string } | undefined>)[id];
  const name = dso?.name ?? planet?.name ?? moon?.name ?? id;
  const kind = dso ? (TYPE_LABEL[dso.type] ?? dso.type) : planet ? (id === "moon" ? "Our Moon" : "Planet") : moon ? `Moon of ${PLANET_BY_ID[moon.parent as keyof typeof PLANET_BY_ID]?.name}` : "";
  const photo = photoOf(id, dso ?? null);
  return (
    <Link href={`/object/${encodeURIComponent(id)}`} className="group flex flex-col gap-2 rounded-xl border bg-card p-2 transition-colors hover:border-primary/40">
      <div className="aspect-square overflow-hidden rounded-lg bg-black">
        {photo ? <img src={photo.src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="skeleton h-full w-full" />}
      </div>
      <div className="px-1 pb-1">
        <div className="truncate text-sm font-medium group-hover:text-primary">{name}</div>
        <div className="truncate text-xs text-muted-foreground">{kind}</div>
      </div>
    </Link>
  );
}

/** Copy or share the term's address. */
function ShareButton({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = location.href.split("?")[0];
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) await navigator.share({ title, text, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      /* cancelled */
    }
  };
  return (
    <Button variant="ghost" size="sm" onClick={share} className="text-muted-foreground" aria-live="polite">
      {copied ? <Check /> : typeof navigator !== "undefined" && "share" in navigator ? <Share2 /> : <Link2 />}
      {copied ? "Link copied" : "Share"}
    </Button>
  );
}

/** Where you are in a guided path, with a dot per step. */
function PathBar({ path, slug }: { path: GlossaryPath; slug: string }) {
  const seen = useSeenTerms();
  const i = path.slugs.indexOf(slug);
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <Link href="/glossary#paths" className="min-w-0 truncate font-medium hover:text-primary">
          {path.title}
        </Link>
        <span className="num shrink-0 text-xs text-muted-foreground">
          {i + 1} of {path.slugs.length}
        </span>
      </div>
      <div className="flex gap-1">
        {path.slugs.map((s, k) => (
          <Link
            key={s}
            href={`/glossary/${s}?path=${path.id}`}
            title={GLOSSARY_BY_SLUG[s].term}
            aria-label={`${k + 1}. ${GLOSSARY_BY_SLUG[s].term}`}
            aria-current={s === slug ? "step" : undefined}
            className={cn("h-1.5 flex-1 rounded-full transition-colors", s === slug ? "bg-primary" : seen.has(s) ? "bg-primary/45" : "bg-muted hover:bg-muted-foreground/30")}
          />
        ))}
      </div>
    </div>
  );
}

/** The end of a path: a small celebration when every step is read, else the steps still to read. */
function PathDone({ path }: { path: GlossaryPath }) {
  const seen = useSeenTerms();
  const unread = path.slugs.filter((s) => !seen.has(s));
  if (unread.length)
    return (
      <div className="mt-10 rounded-2xl border bg-card p-5">
        <div className="font-semibold">Last step of “{path.title}”</div>
        <p className="mt-1 text-sm text-muted-foreground">
          {path.slugs.length - unread.length} of {path.slugs.length} read. Still to read:{" "}
          {unread.map((s, i) => (
            <span key={s}>
              {i > 0 && ", "}
              <Link href={`/glossary/${s}?path=${path.id}`} className="link">
                {GLOSSARY_BY_SLUG[s].term}
              </Link>
            </span>
          ))}
          .
        </p>
      </div>
    );
  return (
    <div className="relative mt-10 overflow-hidden rounded-2xl border border-q-excellent/30 bg-q-excellent/[0.06] p-5 text-center">
      <div className="confetti" aria-hidden="true">
        {Array.from({ length: 14 }, (_, k) => (
          <span key={k} style={{ "--i": k } as React.CSSProperties} />
        ))}
      </div>
      <PartyPopper className="mx-auto h-7 w-7 text-q-excellent" />
      <div className="mt-2 font-display text-2xl">Path complete</div>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        You've worked through “{path.title}”. Pick another path, or put it to use under tonight's sky.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/glossary#paths">More paths</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Tonight's sky</Link>
        </Button>
      </div>
    </div>
  );
}

export function TermView({ slug }: { slug: string }) {
  const t = GLOSSARY_BY_SLUG[slug];
  const pathId = new URLSearchParams(useSearch()).get("path");
  const path = pathId && GLOSSARY_PATH_BY_ID[pathId]?.slugs.includes(slug) ? GLOSSARY_PATH_BY_ID[pathId] : null;
  usePageTitle(t ? `${t.term} — glossary` : "Glossary");
  useEffect(() => {
    window.scrollTo({ top: 0 });
    if (GLOSSARY_BY_SLUG[slug]) markSeen(slug);
  }, [slug]);
  // Previous and next: along the path when following one, else alphabetical.
  const [prev, next] = useMemo(() => {
    if (path) {
      const i = path.slugs.indexOf(slug);
      return [i > 0 ? GLOSSARY_BY_SLUG[path.slugs[i - 1]] : null, i < path.slugs.length - 1 ? GLOSSARY_BY_SLUG[path.slugs[i + 1]] : null];
    }
    const i = GLOSSARY_SORTED.findIndex((x) => x.slug === slug);
    return [GLOSSARY_SORTED[(i - 1 + GLOSSARY_SORTED.length) % GLOSSARY_SORTED.length], GLOSSARY_SORTED[(i + 1) % GLOSSARY_SORTED.length]];
  }, [slug, path]);
  const q = path ? `?path=${path.id}` : "";

  if (!t) {
    const words = slug.replace(/-/g, " ");
    const found = searchGlossary(words).slice(0, 6);
    const close = found.length ? found : suggestGlossary(words, 6);
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <EmptyState
          icon={<Search className="h-5 w-5" />}
          title="That word isn't in the glossary"
          description={close.length ? "Perhaps one of these?" : "Search the glossary for it instead."}
          action={
            <div className="flex flex-col items-center gap-4">
              {close.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2">
                  {close.map((c) => (
                    <Link key={c.slug} href={`/glossary/${c.slug}`} className="inline-flex h-9 items-center rounded-full border px-3 text-sm hover:bg-accent">
                      {c.term}
                    </Link>
                  ))}
                </div>
              )}
              <Button asChild variant="outline">
                <Link href={`/glossary?q=${encodeURIComponent(slug.replace(/-/g, " "))}`}>
                  <Search /> Search the glossary
                </Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const cat = GLOSSARY_CATEGORIES.find((c) => c.id === t.category)!;
  const st = CATEGORY_STYLE[t.category];
  const Icon = st.icon;
  const Widget = t.widget ? WIDGETS[t.widget] : null;

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col">
      <div className="flex items-center justify-between gap-2">
        <BackLink />
        <ShareButton title={`${t.term} — AstroPilot glossary`} text={plainText(t.short)} />
      </div>
      {path && <PathBar path={path} slug={slug} />}
      <header className="mt-3 flex animate-rise flex-col gap-3">
        <Link href={`/glossary?c=${t.category}`} className={cn("inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", st.tint)}>
          <Icon className="h-3.5 w-3.5" /> {cat.label}
        </Link>
        <h1 className="font-display text-[2.4rem] leading-[1.05] tracking-tight sm:text-[3rem]">{t.term}</h1>
        {(t.say || (t.aliases && t.aliases.length > 0)) && (
          <p className="-mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {t.say && (
              <span>
                <span className="eyebrow mr-1.5 text-[10px]">Say it</span>
                {t.say}
              </span>
            )}
            {t.aliases && t.aliases.length > 0 && <span>Also: {t.aliases.join(" · ")}</span>}
          </p>
        )}
        <p className="text-lg leading-relaxed text-foreground/90">
          <RichText text={t.short} />
        </p>
      </header>

      {Widget && (
        <section className="mt-7 rounded-2xl border bg-card p-4 sm:p-5" aria-labelledby="try-it">
          <h2 id="try-it" className="mb-4 flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Try it
            </span>
            <span className="text-[1.05rem] font-semibold tracking-tight">{WIDGET_TITLE[t.widget!]}</span>
          </h2>
          <Suspense fallback={<Skel className="h-72 w-full" />}>
            <Widget />
          </Suspense>
        </section>
      )}

      <div className="mt-7 flex flex-col gap-4 text-[0.98rem] leading-relaxed">
        {t.body.map((p, i) => (
          <p key={i}>
            <RichText text={p} />
          </p>
        ))}
      </div>

      {(t.tip || t.inApp) && (
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          {t.tip && (
            <div className="flex gap-3 rounded-xl border border-gold/30 bg-gold/[0.06] p-4">
              <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
              <div className="text-sm leading-relaxed">
                <div className="eyebrow mb-1">At the eyepiece</div>
                <RichText text={t.tip} />
              </div>
            </div>
          )}
          {t.inApp && (
            <div className="flex gap-3 rounded-xl border border-primary/25 bg-primary/[0.05] p-4">
              <Logo withText={false} className="mt-0.5 shrink-0 [&_svg]:h-5 [&_svg]:w-5" />
              <div className="text-sm leading-relaxed">
                <div className="eyebrow mb-1">In AstroPilot</div>
                <RichText text={t.inApp} />
              </div>
            </div>
          )}
        </div>
      )}

      {t.examples && t.examples.length > 0 && (
        <section className="mt-9 flex flex-col gap-3" aria-labelledby="examples">
          <h2 id="examples" className="text-[1.05rem] font-semibold tracking-tight">
            See it in the sky
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {t.examples.map((id) => (
              <Example key={id} id={id} />
            ))}
          </div>
        </section>
      )}

      {t.related && t.related.length > 0 && (
        <section className="mt-9 flex flex-col gap-3" aria-labelledby="related">
          <h2 id="related" className="text-[1.05rem] font-semibold tracking-tight">
            Related
          </h2>
          <div className="flex flex-wrap gap-2">
            {t.related.map((r) => {
              const rt = GLOSSARY_BY_SLUG[r];
              return (
                <Term key={r} slug={r} link className="inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm no-underline hover:border-primary/40 hover:bg-accent">
                  <span className={cn("h-1.5 w-1.5 rounded-full", CATEGORY_STYLE[rt.category].dot)} />
                  {rt.term}
                </Term>
              );
            })}
          </div>
        </section>
      )}

      {path && !next && <PathDone path={path} />}
      <nav className={cn("mt-10 grid grid-cols-2 gap-3 border-t pt-6", path && !next && "mt-6")} aria-label={path ? `${path.title}: more steps` : "More terms"}>
        {prev ? (
          <Link href={`/glossary/${prev.slug}${q}`} className="group flex flex-col gap-0.5 rounded-xl border p-3 hover:border-primary/40">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> Previous
            </span>
            <span className="truncate font-medium group-hover:text-primary">{prev.term}</span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link
            href={`/glossary/${next.slug}${q}`}
            className={cn("group flex flex-col items-end gap-0.5 rounded-xl border p-3 text-right hover:border-primary/40", path && "border-primary/40 bg-primary/[0.06]")}
          >
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {path ? "Next step" : "Next"} <ArrowRight className="h-3.5 w-3.5" />
            </span>
            <span className="truncate font-medium group-hover:text-primary">{next.term}</span>
          </Link>
        )}
      </nav>
      <p className="mt-6 text-center text-xs text-muted-foreground">{plainText(cat.blurb)}</p>
    </article>
  );
}
