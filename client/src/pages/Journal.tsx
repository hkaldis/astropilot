import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { BookOpen, ChevronRight, Download, Loader2, Plus, Sparkles } from "lucide-react";
import type { ApiLocation, ApiSession, JournalStats } from "@shared/api";
import { ErrorState, PageHeader, Section, SignInPrompt, Skel, usePageTitle } from "@/components/common/Page";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useSite } from "@/hooks/useSite";
import { usePrefs } from "@/hooks/usePrefs";
import { useCatalog } from "@/hooks/useCatalog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { EXPORT_URL, useCreateSession, useJournalSessions, useJournalStats } from "@/features/journal/api";
import { ResponsiveModal } from "@/features/journal/controls";
import { CatalogGrid, MonthBars, SolarSystemChips, TypeBars } from "@/features/journal/progress";
import { AchievementsGrid, achievementSummary } from "@/features/journal/achievements";
import { SessionForm, sessionValues, toSessionInput } from "@/features/journal/SessionForm";
import { SEEING_LABEL, TRANSPARENCY_LABEL, formatTime, monthLabel, nightLabel, nightWeekday, placeOf, sessionNight, sessionTitle } from "@/features/journal/format";

export default function JournalPage() {
  usePageTitle("Journal");
  const { user, isLoading } = useAuth();
  if (isLoading) return <JournalSkeleton />;
  if (!user) return <SignedOut />;
  return <SignedInJournal />;
}

function SignedInJournal() {
  const sessions = useJournalSessions();
  const stats = useJournalStats();
  const { locations } = useSite();

  if (sessions.isLoading || stats.isLoading) return <JournalSkeleton />;
  if (sessions.error || stats.error)
    return (
      <div className="flex flex-col gap-8">
        <JournalHeader canExport={false} />
        <ErrorState
          message={(sessions.error ?? stats.error)?.message}
          onRetry={() => {
            void sessions.refetch();
            void stats.refetch();
          }}
        />
      </div>
    );

  const list = sessions.data ?? [];
  const s = stats.data!;
  if (!list.length) return <EmptyJournal />;

  // The server counts sessions without an end time as 1.5 h (or the span of their observations, if longer).
  const estimatedSessions = list.filter((x) => !x.endDate || Date.parse(x.endDate) <= Date.parse(x.date)).length;

  return (
    <div className="flex flex-col gap-10">
      <JournalHeader canExport={s.observations > 0} />
      <StatsStrip stats={s} estimatedSessions={estimatedSessions} />
      <ProgressSection stats={s} />
      <Section title="Sessions" description="Every night you've logged, newest first.">
        <SessionList sessions={list} locations={locations} />
      </Section>
    </div>
  );
}

function JournalHeader({ canExport }: { canExport: boolean }) {
  return (
    <PageHeader
      eyebrow="Observing log"
      title="Journal"
      description="Every night, object and view you've logged — and how far you've come."
      actions={
        <>
          {canExport && (
            <Button asChild variant="outline">
              <a href={EXPORT_URL} download>
                <Download /> Export CSV
              </a>
            </Button>
          )}
          <NewSessionButton />
        </>
      }
    />
  );
}

function StatsStrip({ stats, estimatedSessions }: { stats: JournalStats; estimatedSessions: number }) {
  const hours = stats.hoursObserved;
  const hoursText = `${estimatedSessions > 0 ? "≈" : ""}${hours < 10 ? hours.toFixed(1) : Math.round(hours)}`;
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
      {[
        { label: "Sessions", value: stats.sessions, sub: stats.firstSession ? `since ${new Date(stats.firstSession).getFullYear()}` : null },
        { label: "Objects", value: stats.uniqueObjects, sub: `${stats.observations} observation${stats.observations === 1 ? "" : "s"}` },
        {
          label: "Hours",
          value:
            estimatedSessions > 0 ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help underline decoration-muted-foreground/50 decoration-dotted decoration-1 underline-offset-[6px]" tabIndex={0}>
                    {hoursText}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  An estimate: {estimatedSessions === 1 ? "a session" : `${estimatedSessions} sessions`} without an end time {estimatedSessions === 1 ? "counts" : "count"} as
                  1.5 h, or as long as {estimatedSessions === 1 ? "its" : "their"} observations span if that's longer. Add an end time to a session for exact hours.
                </TooltipContent>
              </Tooltip>
            ) : (
              hoursText
            ),
          sub: estimatedSessions > 0 ? "under the sky, estimated" : "under the sky",
        },
        { label: "Best streak", value: stats.longestStreakNights, sub: `night${stats.longestStreakNights === 1 ? "" : "s"} in a row` },
      ].map((x) => (
        <div key={x.label} className="bg-background px-4 py-4 sm:px-5">
          <dt className="eyebrow">{x.label}</dt>
          <dd className="num mt-1.5 text-[1.6rem] font-medium leading-none">{x.value}</dd>
          {x.sub && <dd className="mt-1 text-xs text-muted-foreground">{x.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

function ProgressSection({ stats }: { stats: JournalStats }) {
  const { objects } = useCatalog();
  return (
    <>
      <Section title="Progress" description="Tap any number to open the object.">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1.15fr] lg:gap-10">
          <CatalogGrid title="Messier" prefix="M" total={110} seen={stats.messierSeen} objects={objects} field="m" />
          <CatalogGrid title="Caldwell" prefix="C" total={109} seen={stats.caldwellSeen} objects={objects} field="c" />
          <div className="flex flex-col gap-3 md:col-span-2 lg:col-span-1">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium">Solar System</h3>
              <span className="num text-sm">
                {stats.planetsSeen.length + (stats.observedRefs.includes("moon") ? 1 : 0)}
                <span className="text-muted-foreground"> / 8</span>
              </span>
            </div>
            <SolarSystemChips planetsSeen={stats.planetsSeen} moonSeen={stats.observedRefs.includes("moon")} />
          </div>
        </div>
      </Section>
      <div className="grid gap-10 border-t pt-8 lg:grid-cols-2">
        <Section title="By type" description="Different objects you've seen.">
          <TypeBars byType={stats.byType} />
        </Section>
        <Section title="Activity" description="Observations per month, last 12 months.">
          <MonthBars perMonth={stats.perMonth} />
        </Section>
      </div>
      {stats.achievements?.length ? <AchievementsSection stats={stats} /> : null}
    </>
  );
}

function AchievementsSection({ stats }: { stats: JournalStats }) {
  const { earned, total, latest } = achievementSummary(stats.achievements);
  return (
    <div className="border-t pt-8">
      <Section
        title="Achievements"
        description={
          latest
            ? `${earned} of ${total} earned, all from what you've logged. Latest: ${latest.title}, ${latest.tier}.`
            : `${total} to earn, all from what you log — nothing to game.`
        }
      >
        <AchievementsGrid achievements={stats.achievements} />
      </Section>
    </div>
  );
}

function SessionList({ sessions, locations }: { sessions: ApiSession[]; locations: ApiLocation[] }) {
  const { hour12 } = usePrefs();
  const groups = useMemo(() => {
    const out: { month: string; items: { s: ApiSession; night: string }[] }[] = [];
    for (const s of sessions) {
      const night = sessionNight(s, locations);
      const month = night.slice(0, 7);
      const g = out[out.length - 1];
      if (g && g.month === month) g.items.push({ s, night });
      else out.push({ month, items: [{ s, night }] });
    }
    return out;
  }, [sessions, locations]);

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <div key={g.month} className="flex flex-col">
          <h3 className="eyebrow sticky top-14 z-10 -mx-1 bg-background/90 px-1 py-2 backdrop-blur">{monthLabel(g.month)}</h3>
          <ul className="flex flex-col divide-y divide-border/70 border-y border-border/70">
            {g.items.map(({ s, night }) => (
              <li key={s.id}>
                <SessionRow s={s} night={night} locations={locations} hour12={hour12} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SessionRow({ s, night, locations, hour12 }: { s: ApiSession; night: string; locations: ApiLocation[]; hour12: boolean }) {
  const { tz } = placeOf(s, locations);
  const [, d] = night.split("-").slice(1);
  const weekday = nightWeekday(night);
  const c = s.conditions ?? {};
  const start = formatTime(Date.parse(s.date), { tz, hour12 });
  const end = s.endDate ? formatTime(Date.parse(s.endDate), { tz, hour12 }) : null;
  return (
    <Link href={`/journal/${s.id}`} className="group flex items-center gap-4 rounded-md px-1 py-3.5 transition-colors hover:bg-accent/40 focus-visible:bg-accent/40">
      <div className="w-11 shrink-0 text-center" aria-hidden="true">
        <div className="text-2xs uppercase tracking-[0.12em] text-muted-foreground">{weekday}</div>
        <div className="num text-[1.45rem] leading-tight">{Number(d)}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 font-medium leading-snug">
          <span className="sr-only">{nightLabel(night, "long")}: </span>
          {sessionTitle(s)}
        </div>
        <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {[s.title && s.locationName, `Bortle ${s.bortle}`, end ? `${start}–${end}` : start].filter(Boolean).join(" · ")}
        </div>
        {(c.seeing || c.transparency || c.moonIllumination != null) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {c.seeing ? <Badge variant="outline">Seeing {SEEING_LABEL[c.seeing].toLowerCase()}</Badge> : null}
            {c.transparency ? <Badge variant="outline">Transparency {TRANSPARENCY_LABEL[c.transparency].toLowerCase()}</Badge> : null}
            {c.moonIllumination != null ? <Badge variant="outline">Moon {Math.round(c.moonIllumination * 100)}%</Badge> : null}
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div className="num text-lg leading-tight">{s.observationCount}</div>
        <div className="text-2xs text-muted-foreground">{s.observationCount === 1 ? "observation" : "observations"}</div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}

/* ---------------------------------------- New session ---------------------------------------- */

export function NewSessionButton({ label = "New session", variant = "default" }: { label?: string; variant?: ButtonProps["variant"] }) {
  const [open, setOpen] = useState(false);
  const [instance, setInstance] = useState(0);
  return (
    <>
      <Button
        variant={variant}
        onClick={() => {
          setInstance((n) => n + 1);
          setOpen(true);
        }}
      >
        <Plus /> {label}
      </Button>
      {instance > 0 && <NewSessionModal key={instance} open={open} onOpenChange={setOpen} />}
    </>
  );
}

function NewSessionModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { site, locations } = useSite();
  const { prefs } = usePrefs();
  const imperial = prefs.units === "imperial";
  const create = useCreateSession();
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const initial = useMemo(() => sessionValues(null, { locationId: site?.locationId ?? null, imperial }), [site?.locationId, imperial]);
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(o) => !create.isPending && onOpenChange(o)}
      title="New session"
      description="A night (or part of one) at one place. Add what you observed next."
      footer={
        <div className="flex gap-2 sm:justify-end">
          <Button variant="outline" size="lg" className="flex-1 sm:flex-none" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="new-session" size="lg" className="flex-[2] sm:flex-none" disabled={create.isPending}>
            {create.isPending && <Loader2 className="animate-spin" />}
            Create session
          </Button>
        </div>
      }
    >
      <SessionForm
        formId="new-session"
        initial={initial}
        locations={locations}
        imperial={imperial}
        error={error}
        onSubmit={(v) => {
          const input = toSessionInput(v, imperial);
          if (typeof input === "string") return setError(input);
          setError(null);
          create.mutate(input, {
            onSuccess: (s) => {
              onOpenChange(false);
              toast({ title: "Session created", description: "Now add what you observed." });
              navigate(`/journal/${s.id}`);
            },
            onError: (e: any) => setError(e.message),
          });
        }}
      />
    </ResponsiveModal>
  );
}

/* ---------------------------------------- Empty & signed-out ---------------------------------------- */

function EmptyJournal() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader eyebrow="Observing log" title="Journal" />
      <section className="grid items-center gap-10 rounded-2xl border bg-card px-5 py-8 sm:px-10 sm:py-12 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-5">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
            <BookOpen className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="font-display text-[2rem] leading-[1.1] tracking-tight sm:text-[2.4rem]">Every night under the sky, remembered.</h2>
          <p className="max-w-prose text-[0.95rem] text-muted-foreground">
            Find something worth seeing, then tap <span className="font-medium text-foreground">Log observation</span> at the eyepiece. AstroPilot fills in the time, place and
            the telescope and eyepiece you used — you add how it looked. Your journal grows into your Messier and Caldwell progress, planets, hours and streaks.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="lg">
              <Link href="/">
                <Sparkles /> Find tonight's targets
              </Link>
            </Button>
            <NewSessionButton label="Log a past session" variant="outline" />
          </div>
        </div>
        <JournalPreview />
      </section>
    </div>
  );
}

function SignedOut() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader eyebrow="Observing log" title="Journal" description="Your personal record of everything you've seen." />
      <div className="grid items-start gap-10 lg:grid-cols-[1fr_1fr]">
        <SignInPrompt
          title="Keep an observing journal"
          description="Log what you see in a few taps at the eyepiece. AstroPilot remembers the time, place and equipment, tracks your Messier and Caldwell progress, and keeps every night's conditions, notes and photos."
        />
        <JournalPreview />
      </div>
    </div>
  );
}

/** A static, decorative taste of a journal (signed-out and empty states). */
function JournalPreview() {
  const seen = new Set([1, 3, 8, 13, 15, 16, 17, 20, 22, 27, 31, 32, 33, 35, 36, 37, 38, 42, 44, 45, 51, 57, 63, 64, 81, 82, 92, 97, 101, 104]);
  return (
    <figure className="flex flex-col gap-5 rounded-xl border bg-background/60 p-5" aria-label="Preview of a journal">
      <div className="grid grid-cols-3 gap-4" aria-hidden="true">
        {[
          ["Sessions", "24"],
          ["Objects", "61"],
          ["Hours", "48"],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="eyebrow">{k}</div>
            <div className="num mt-1 text-xl">{v}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2" aria-hidden="true">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">Messier</span>
          <span className="num">
            {seen.size}
            <span className="text-muted-foreground"> / 110</span>
          </span>
        </div>
        <div className="grid grid-cols-10 gap-[3px]">
          {Array.from({ length: 110 }, (_, i) => i + 1).map((n) => (
            <span
              key={n}
              className={cn(
                "num grid aspect-square place-items-center rounded-[4px] text-[0.55rem]",
                seen.has(n) ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground/60",
              )}
            >
              {n}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="text-xs text-muted-foreground">Example journal — yours fills in as you observe.</figcaption>
    </figure>
  );
}

function JournalSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading your journal">
      <Skel className="h-12 w-48" />
      <Skel className="h-24 w-full" />
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        <Skel className="h-72" />
        <Skel className="h-72" />
        <Skel className="h-72" />
      </div>
      <Skel className="h-40 w-full" />
    </div>
  );
}
