import { useMemo, useState } from "react";
import { Link } from "wouter";
import { X } from "lucide-react";
import { HOUR_MS, formatTime, sqmForBortle, type NightFrames, type NightInfo } from "@shared/astro";
import type { ObservingSite } from "@shared/api";
import { useSite, siteTz } from "@/hooks/useSite";
import { useAuth } from "@/hooks/useAuth";
import { usePrefs } from "@/hooks/usePrefs";
import { useNow } from "@/hooks/useNow";
import { store } from "@/lib/storage";
import { Section, Skel, usePageTitle } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { useForecast, useNightContext } from "@/features/tonight/useTonight";
import { TonightHero } from "@/features/tonight/Hero";
import { NightStrip } from "@/features/tonight/NightStrip";
import { Outlook } from "@/features/tonight/Outlook";
import { BestTargets } from "@/features/tonight/BestTargets";
import { PlanetsTonight, MoonPanel } from "@/features/tonight/SkyBodies";
import { EventsList, IssPasses, AuroraNote } from "@/features/tonight/Extras";
import { Welcome } from "@/features/tonight/Welcome";
import { GuestSiteBar } from "@/features/tonight/GuestSiteBar";
import { ScopePrompt } from "@/features/tonight/ScopePrompt";
import { CometStrip } from "@/features/comets/CometStrip";

/** Comets in reach that night (renders nothing when there are none). */
function TonightComets({ site, night, frames, minAlt, tz, hour12 }: { site: ObservingSite; night: NightInfo; frames: NightFrames; minAlt: number; tz?: string; hour12: boolean }) {
  const sqm = site.sqm ?? sqmForBortle(site.bortle);
  const ctx = useMemo(() => ({ night, frames, sqm, minAlt, tz, hour12 }), [night, frames, sqm, minAlt, tz, hour12]);
  return <CometStrip ctx={ctx} />;
}

function GuestBanner() {
  const [hidden, setHidden] = useState(() => store.get("ap.hideGuestBanner", false));
  if (hidden) return null;
  return (
    <div className="flex animate-rise items-center gap-3 rounded-xl border border-primary/25 bg-primary/[0.06] px-4 py-3 text-sm">
      <p className="min-w-0 flex-1">
        <span className="font-medium">Make it yours.</span>{" "}
        <span className="text-muted-foreground">A free account saves your locations, telescope and eyepieces for exact advice, and keeps your observing log.</span>
      </p>
      <Button asChild size="sm">
        <Link href="/register">Sign up</Link>
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Dismiss"
        onClick={() => {
          setHidden(true);
          store.set("ap.hideGuestBanner", true);
        }}
      >
        <X />
      </Button>
    </div>
  );
}

export default function TonightPage() {
  usePageTitle("Tonight");
  const { site, isLoading: siteLoading } = useSite();
  const { user } = useAuth();
  const { prefs, hour12 } = usePrefs();
  const now = useNow();
  // The night picked in the week strip (null: the current night).
  const [picked, setPicked] = useState<string | null>(null);
  const fq = useForecast(site, prefs);
  const ctx = useNightContext(site, picked, now, fq.data);
  const tz = siteTz(site);

  const hours = useMemo(() => {
    if (!ctx || !fq.data) return [];
    const start = (ctx.night.sunset ?? ctx.night.noon) - 2 * HOUR_MS;
    const end = (ctx.night.sunrise ?? ctx.night.nextNoon) + 2 * HOUR_MS;
    return fq.data.hours.filter((h) => h.t >= start && h.t <= end);
  }, [ctx?.date, fq.data]);

  if (siteLoading) return <Skel className="h-72 w-full" />;
  if (!site) return <Welcome />;
  if (!ctx) return <Skel className="h-72 w-full" />;

  const nights = fq.data?.nights ?? [];
  const noDark = ctx.night.darkness === "none";

  return (
    <div className="flex flex-col gap-8">
      {!user && <GuestBanner />}
      {site.key === "guest" && <GuestSiteBar site={site} />}
      <TonightHero
        night={ctx.night}
        frames={ctx.frames}
        forecast={ctx.forecast}
        loading={fq.isLoading}
        isTonight={ctx.isTonight}
        siteName={site.name}
        tz={tz}
        hour12={hour12}
        now={now}
        southern={site.lat < 0}
      />

      {nights.length > 0 && (
        <Section title="This week" description="Tap a night to plan it.">
          <Outlook nights={nights} tonight={ctx.tonight} selected={ctx.date} onSelect={(d) => setPicked(d === ctx.tonight ? null : d)} southern={site.lat < 0} />
        </Section>
      )}
      {fq.isError && <p className="text-sm text-muted-foreground">The weather forecast is unavailable right now — sky and Moon times below are still exact.</p>}

      <Section title="Hour by hour" description="Clouds, steadiness of the air (seeing), clarity (transparency), the Moon and the resulting deep-sky score.">
        <div className="panel p-3 sm:p-4">
          <NightStrip night={ctx.night} frames={ctx.frames} hours={hours} tz={tz} hour12={hour12} now={now} units={prefs.units} bestWindow={ctx.forecast?.bestWindow ?? null} />
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Section
          title={ctx.isTonight ? "Best targets tonight" : "Best targets that night"}
          action={
            <Link href="/explore" className="link text-sm">
              Explore all
            </Link>
          }
        >
          {!noDark && <ScopePrompt />}
          <BestTargets site={site} night={ctx.night} frames={ctx.frames} tz={tz} hour12={hour12} isTonight={ctx.isTonight} />
        </Section>
        <div className="flex flex-col gap-8">
          <Section title="Moon">
            <MoonPanel night={ctx.night} frames={ctx.frames} site={site} tz={tz} hour12={hour12} now={now} isTonight={ctx.isTonight} />
          </Section>
          <Section title="Planets">
            <PlanetsTonight night={ctx.night} site={site} tz={tz} hour12={hour12} isTonight={ctx.isTonight} now={now} />
          </Section>
          {!noDark && <TonightComets site={site} night={ctx.night} frames={ctx.frames} minAlt={prefs.minAltitude ?? 20} tz={tz} hour12={hour12} />}
          <Section title="Coming up">
            <EventsList site={site} now={now} tz={tz} hour12={hour12} />
          </Section>
          <Section title="Space stations">
            <IssPasses site={site} tz={tz} hour12={hour12} until={ctx.night.nextNoon} />
          </Section>
          <Section title="Aurora">
            <AuroraNote site={site} />
          </Section>
        </div>
      </div>
      {fq.data && (
        <div className="flex flex-col gap-1 text-2xs text-muted-foreground">
          <p>
            Forecast: {fq.data.sources.join(" · ")}. Sky positions: astronomy-engine (VSOP87/ELP). Updated {formatTime(fq.data.generatedAt, { tz, hour12 })}.
          </p>
          {fq.data.attribution && fq.data.attribution.length > 0 && (
            <p>
              {fq.data.attribution.map((a, i) => (
                <span key={a.url}>
                  {i > 0 && " · "}
                  <a href={a.url} target="_blank" rel="noreferrer" className="link">
                    {a.text}
                  </a>
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
