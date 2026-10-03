/** Small building blocks for the journal: responsive modal, star rating, 1–5 scale, star display. */
import { useEffect, useState, type ReactNode } from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { ChevronDown, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { RATING_LABEL } from "./format";

const DESKTOP_QUERY = "(min-width: 768px)";

export function useIsDesktop() {
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

/** A centred dialog on desktop, a bottom sheet on phones. `footer` stays pinned below the scroll area. */
export function ResponsiveModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const desktop = useIsDesktop();
  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn("flex max-h-[min(92dvh,860px)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:rounded-xl", className)}>
          <DialogHeader className="px-6 pb-4 pt-6 text-left">
            <DialogTitle className="pr-8 text-[1.15rem]">{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">{children}</div>
          {footer && <div className="border-t bg-card/40 px-6 py-4">{footer}</div>}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent className={cn("max-h-[94dvh]", className)}>
        <DrawerHeader className="px-4 pb-3 pt-3 text-left">
          <DrawerTitle className="text-[1.1rem]">{title}</DrawerTitle>
          {description ? <DrawerDescription>{description}</DrawerDescription> : <DrawerDescription className="sr-only">{title}</DrawerDescription>}
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <div className="border-t bg-background px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3">{footer}</div>}
      </DrawerContent>
    </Drawer>
  );
}

/** 1–5 star "how it looked" input. Tap the current value again to clear it. */
export function StarRatingInput({ value, onChange, id }: { value: number | null; onChange: (v: number | null) => void; id?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div className="flex flex-col gap-1.5">
      <ToggleGroupPrimitive.Root
        id={id}
        type="single"
        value={value ? String(value) : ""}
        onValueChange={(v) => onChange(v ? Number(v) : null)}
        className="flex items-center gap-1"
        aria-label="How it looked, 1 to 5 stars"
        onMouseLeave={() => setHover(null)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <ToggleGroupPrimitive.Item
            key={n}
            value={String(n)}
            aria-label={`${n} star${n > 1 ? "s" : ""} — ${RATING_LABEL[n]}`}
            onMouseEnter={() => setHover(n)}
            className="grid h-11 w-11 place-items-center rounded-lg transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Star className={cn("h-7 w-7 transition-colors", n <= shown ? "fill-gold text-gold" : "text-muted-foreground/50")} strokeWidth={1.6} />
          </ToggleGroupPrimitive.Item>
        ))}
      </ToggleGroupPrimitive.Root>
      <div className="h-4 text-xs text-muted-foreground" aria-live="polite">
        {shown ? RATING_LABEL[shown] : "Optional — tap a star"}
      </div>
    </div>
  );
}

/** A labelled 1–5 segmented control (seeing, transparency). */
export function ScaleInput({
  label,
  value,
  onChange,
  labels,
  hints,
  id,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  labels: readonly string[];
  hints: readonly string[];
  id: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span id={`${id}-label`} className="text-sm font-medium">
          {label}
        </span>
        <span className="text-xs text-muted-foreground">{value ? labels[value] : "Optional"}</span>
      </div>
      <ToggleGroupPrimitive.Root
        type="single"
        value={value ? String(value) : ""}
        onValueChange={(v) => onChange(v ? Number(v) : null)}
        aria-labelledby={`${id}-label`}
        className="grid grid-cols-5 gap-1 rounded-lg border bg-surface-2/50 p-1"
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <ToggleGroupPrimitive.Item
            key={n}
            value={String(n)}
            aria-label={`${n} — ${labels[n]}`}
            className={cn(
              "num h-10 rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "text-muted-foreground hover:bg-accent hover:text-foreground",
              "data-[state=on]:bg-primary data-[state=on]:font-semibold data-[state=on]:text-primary-foreground",
            )}
          >
            {n}
          </ToggleGroupPrimitive.Item>
        ))}
      </ToggleGroupPrimitive.Root>
      <div className="min-h-4 text-xs text-muted-foreground">{value ? hints[value] : `1 ${labels[1].toLowerCase()} · 5 ${labels[5].toLowerCase()}`}</div>
    </div>
  );
}

/** Read-only star rating. */
export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} role="img" aria-label={`${value} of 5 stars — ${RATING_LABEL[value] ?? ""}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn("h-3.5 w-3.5", n <= value ? "fill-gold text-gold" : "text-muted-foreground/40")} strokeWidth={1.6} aria-hidden="true" />
      ))}
    </span>
  );
}

/** Native select styled like our inputs — best picker on phones, fully accessible. */
export function NativeSelect({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn("relative", className)}>
      <select
        {...props}
        className="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 pr-9 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 md:text-sm"
      />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    </div>
  );
}
