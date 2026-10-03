import { useState } from "react";
import { Link } from "wouter";
import { Check, ChevronDown, Telescope } from "lucide-react";
import { BORTLE, formatTime } from "@shared/astro";
import type { useActiveScope } from "@/hooks/useScope";
import { SCOPE_PRESETS } from "@/hooks/useScope";
import { useAuth } from "@/hooks/useAuth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NightContext } from "./sky";

export type ActiveScopeState = ReturnType<typeof useActiveScope>;

/** "8″ Dobsonian" / "10×50 binoculars" / "Naked eye" with the aperture when it's a user's own scope. */
export function scopeLabel(s: ActiveScopeState): string {
  return s.scope.name;
}

export function skyLabel(ctx: NightContext): string {
  return ctx.sqmMeasured ? `SQM ${ctx.sqm.toFixed(2)}` : `Bortle ${ctx.bortle}`;
}

/** Popover to switch the instrument everything is ranked for. */
export function ScopeSwitcher({ scope, className }: { scope: ActiveScopeState; className?: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const own = user ? scope.telescopes : [];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex min-h-[2.25rem] items-center gap-1.5 rounded-full border bg-surface-2/60 px-3 py-1 text-sm font-medium transition-colors hover:bg-accent",
            className,
          )}
          aria-label={`Instrument: ${scope.scope.name}. Change instrument`}
        >
          <Telescope className="h-3.5 w-3.5 text-primary" />
          <span className="max-w-[14rem] truncate">{scope.scope.name}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,20rem)] p-2">
        {own.length > 0 ? (
          <>
            <div className="eyebrow px-2 pb-1 pt-1">Your telescopes</div>
            {own.map((t) => (
              <button
                key={t.id}
                type="button"
                className={cn("flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-accent", t.id === scope.telescopeId && "bg-accent")}
                onClick={() => {
                  scope.setTelescope(t.id);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{t.name}</span>
                  <span className="num block text-xs text-muted-foreground">
                    {t.aperture} mm · f/{(t.focalLength / t.aperture).toFixed(1)}
                  </span>
                </span>
                {t.id === scope.telescopeId && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
            <Button asChild variant="ghost" size="sm" className="mt-1 w-full justify-start text-muted-foreground">
              <Link href="/gear">Manage my gear</Link>
            </Button>
          </>
        ) : (
          <>
            <div className="eyebrow px-2 pb-1 pt-1">Rank for</div>
            {SCOPE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={cn("flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-accent", p.id === scope.presetId && "bg-accent")}
                onClick={() => {
                  scope.setPreset(p.id);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="num block text-xs text-muted-foreground">
                    {p.kind === "eye" ? "7 mm dark-adapted pupil" : `${p.aperture} mm aperture`}
                  </span>
                </span>
                {p.id === scope.presetId && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
            <p className="px-2 pb-1 pt-2 text-2xs text-muted-foreground">
              {user ? (
                <>
                  Add your telescope and eyepieces under{" "}
                  <Link href="/gear" className="link">
                    My gear
                  </Link>{" "}
                  for exact eyepiece advice.
                </>
              ) : (
                <>
                  <Link href="/register" className="link">
                    Sign up
                  </Link>{" "}
                  to save your own telescope and eyepieces.
                </>
              )}
            </p>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** "Ranked for: 8″ Dobsonian · Bortle 5 · Athens" plus tonight's darkness and Moon in one line. */
export function InstrumentBar({ scope, ctx, className }: { scope: ActiveScopeState; ctx: NightContext | null; className?: string }) {
  const tf = { tz: ctx?.tz, hour12: ctx?.hour12 };
  const night = ctx?.night;
  const b = ctx ? BORTLE[Math.min(9, Math.max(1, Math.round(ctx.bortle)))] : null;
  return (
    <div className={cn("flex flex-col gap-2 border-y py-3 text-sm sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-muted-foreground">Ranked for</span>
        <ScopeSwitcher scope={scope} />
        {ctx && b && (
          <>
            <span className="text-muted-foreground" aria-hidden="true">
              ·
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="num cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-4" tabIndex={0}>
                  {skyLabel(ctx)}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <div className="font-medium">{b.label}</div>
                <div className="text-muted-foreground">{b.description}</div>
                <div className="num mt-1 text-muted-foreground">Zenith sky {ctx.sqm.toFixed(2)} mag/arcsec²{ctx.sqmMeasured ? " (measured)" : " (typical for this Bortle class)"}</div>
              </TooltipContent>
            </Tooltip>
            <span className="hidden text-muted-foreground sm:inline" aria-hidden="true">
              ·
            </span>
            <span className="hidden max-w-[12rem] truncate sm:inline">{ctx.site.name}</span>
          </>
        )}
      </div>
      {night && (
        <div className="text-xs text-muted-foreground">
          {night.darkStart && night.darkEnd ? (
            <>
              {night.darkness === "astronomical" ? "Dark" : night.darkness === "nautical" ? "Darkest (nautical twilight)" : "Brightest twilight only"}{" "}
              <span className="num text-foreground">
                {formatTime(night.darkStart, tf)}–{formatTime(night.darkEnd, tf)}
              </span>
            </>
          ) : (
            "No darkness tonight"
          )}
          <span aria-hidden="true"> · </span>
          Moon <span className="num text-foreground">{Math.round(night.moon.illumination * 100)}%</span>
          {night.darkHours > 0 &&
            (night.moonFreeHours >= night.darkHours - 0.25 ? (
              <>, down all night</>
            ) : night.moonFreeHours <= 0.25 ? (
              <>, up all night</>
            ) : (
              <>
                , <span className="num text-foreground">{night.moonFreeHours.toFixed(1)} h</span> moon-free
              </>
            ))}
        </div>
      )}
    </div>
  );
}
