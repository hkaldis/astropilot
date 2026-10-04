import { useMemo, useState } from "react";
import { Link } from "wouter";
import { X } from "lucide-react";
import { HOUR_MS } from "@shared/astro";
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

function GuestBanner() {
  const [hidden, setHidden] = useState(() => store.get("ap.hideGuestBanner", false));
  if (hidden) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/[0.06] px-4 py-3 text-sm">
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
  const [offset, setOffset] = useState(0);
  const fq = useForecast(site);
  const ctx = useNightContext(site, offset, now, fq.data);
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

  return (
    <div className="flex flex-col gap-8">
      {!user && <GuestBanner />}
      {site.key === "guest" && <GuestSiteBar site={site} />}
      <TonightHero night={ctx.night} forecast={ctx.forecast} loading={fq.isLoading} isTonight={ctx.isTonight} siteName={site.name} tz={tz} hour12={hour12} now={now} southern={site.lat < 0} />

      {nights.length > 0 && (
        <Section title="This week" description="Tap a night to plan it.">
          <Outlook nights={nights} selected={offset} onSelect={setOffset} southern={site.lat < 0} />
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
          <BestTargets site={site} frames={ctx.frames} tz={tz} hour12={hour12} />
        </Section>
        <div className="flex flex-col gap-8">
          <Section title="Moon">
            <MoonPanel night={ctx.night} site={site} tz={tz} hour12={hour12} now={now} />
          </Section>
          <Section title="Planets">
            <PlanetsTonight night={ctx.night} site={site} tz={tz} hour12={hour12} />
          </Section>
          <Section title="Coming up">
            <EventsList site={site} now={now} tz={tz} hour12={hour12} />
          </Section>
          <Section title="Space station">
            <IssPasses site={site} tz={tz} hour12={hour12} until={ctx.night.nextNoon} />
          </Section>
          <Section title="Aurora">
            <AuroraNote site={site} />
          </Section>
        </div>
      </div>
      {fq.data && (
        <p className="text-2xs text-muted-foreground">
          Forecast: {fq.data.sources.join(" · ")}. Sky positions: astronomy-engine (VSOP87/ELP). Updated {new Date(fq.data.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.
        </p>
      )}
    </div>
  );
}
