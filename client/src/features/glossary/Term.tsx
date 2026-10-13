import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import type { GlossaryTerm } from "@shared/glossary";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// The glossary text is loaded the first time someone opens a definition, not with every page.
let loaded: Promise<typeof import("@shared/glossary")> | null = null;
const loadGlossary = () => (loaded ??= import("@shared/glossary"));

/**
 * A word with its glossary definition one tap (or hover) away: a dotted underline that opens a small card
 * with the meaning and a link to the full entry. `link` makes the word itself go to the entry (for text
 * inside the glossary, where browsing between terms is the point).
 */
export function Term({ slug, children, className, link = false }: { slug: string; children?: ReactNode; className?: string; link?: boolean }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState<GlossaryTerm | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!open || term) return;
    loadGlossary().then((g) => setTerm(g.GLOSSARY_BY_SLUG[slug] ?? null));
  }, [open, term, slug]);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  // Mice get a preview on hover; touch opens on tap (there is no hover).
  const hover = {
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      clearTimeout(hoverTimer.current);
      hoverTimer.current = setTimeout(() => setOpen(true), 350);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      clearTimeout(hoverTimer.current);
      hoverTimer.current = setTimeout(() => setOpen(false), 250);
    },
  };
  const underline = "cursor-help underline decoration-dotted decoration-muted-foreground/60 underline-offset-[3px] hover:decoration-primary focus-visible:rounded-sm";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {link ? (
          <Link href={`/glossary/${slug}`} className={cn("link", className)} {...hover}>
            {children}
          </Link>
        ) : (
          <button type="button" className={cn(underline, "text-inherit [text-transform:inherit]", className)} {...hover} aria-label={typeof children === "string" ? `${children}: what it means` : undefined}>
            {children}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-3.5"
        side="top"
        collisionPadding={12}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerEnter={() => clearTimeout(hoverTimer.current)}
        onPointerLeave={hover.onPointerLeave}
      >
        {term ? (
          <div className="flex flex-col gap-1.5 text-left normal-case tracking-normal">
            <div className="text-sm font-semibold">{term.term}</div>
            <p className="text-sm leading-relaxed text-muted-foreground">{plain(term.short)}</p>
            <Link href={`/glossary/${term.slug}`} className="link mt-0.5 inline-flex items-center gap-1 text-sm font-medium" onClick={() => setOpen(false)}>
              {term.widget ? "Explain it — and try it" : "Read more"} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2" aria-busy="true">
            <div className="skeleton h-4 w-28 rounded" />
            <div className="skeleton h-3 w-full rounded" />
            <div className="skeleton h-3 w-4/5 rounded" />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

const plain = (s: string) => s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, slug: string, label?: string) => label ?? slug.replace(/-/g, " "));
