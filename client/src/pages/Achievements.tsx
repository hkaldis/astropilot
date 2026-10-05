import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Check, Lock, Sparkles } from "lucide-react";
import { FAMILY_BY_ID, familyMembers } from "@shared/achievements";
import type { AchievementFamily, AchievementTierResult, JournalStats } from "@shared/api";
import { formatTime } from "@shared/astro";
import { CountUp, ErrorState, PageHeader, Section, SignInPrompt, Skel, usePageTitle } from "@/components/common/Page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useCatalog } from "@/hooks/useCatalog";
import { usePrefs } from "@/hooks/usePrefs";
import { useSite, siteTz } from "@/hooks/useSite";
import { DIFFICULTY_TONE } from "@/lib/objects";
import { cn } from "@/lib/utils";
import { stagger, useInView } from "@/lib/motion";
import { useJournalStats } from "@/features/journal/api";
import { ResponsiveModal } from "@/features/journal/controls";
import { Medal, RankEmblem, TIER_STYLE } from "@/features/achievements/Medal";
import { GROUPS, bestTier, earnedCount, earnedTimeline, goalText, nextTier, tierCount, toNext, useUpNext, type UpNext } from "@/features/achievements/model";

/** Families earned by time or habit, where "the object that did it" means nothing. */
const TIME_BASED = new Set(["night-owl", "nights", "months", "clear-spell", "seasons", "field-notes", "photographer"]);

const nightText = (night: string | null, at: string | null) =>
  night
    ? new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${night}T12:00:00Z`))
    : at
      ? new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
      : "";

export default function AchievementsPage() {
  usePageTitle("Achievements");
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageSkeleton />;
  if (!user) return <SignedOut />;
  return <SignedIn />;
}

function SignedIn() {
  const stats = useJournalStats();
  const [open, setOpen] = useState<string | null>(null);
  if (stats.isLoading) return <PageSkeleton />;
  if (stats.error || !stats.data)
    return (
      <div className="flex flex-col gap-8">
        <Header />
        <ErrorState message={stats.error?.message} onRetry={() => void stats.refetch()} />
      </div>
    );
  const s = stats.data;
  const fams = s.achievements;
  const openFamily = open ? fams.find((f) => f.id === open) ?? null : null;
  return (
    <div className="flex flex-col gap-10">
      <Header />
      <RankHero stats={s} />
      <UpNextSection stats={s} onOpen={setOpen} />
      {GROUPS.map((g) => (
        <FamilyGroup key={g.id} title={g.title} blurb={g.blurb} fams={fams.filter((f) => f.group === g.id)} onOpen={setOpen} />
      ))}
      <Timeline fams={fams} />
      <FamilyDetail family={openFamily} stats={s} onOpenChange={(o) => !o && setOpen(null)} />
    </div>
  );
}

/** One group of achievement cards; they deal in, medals sweeping and glinting, as the group scrolls into view. */
function FamilyGroup({ title, blurb, fams, onOpen }: { title: string; blurb: string; fams: AchievementFamily[]; onOpen: (id: string) => void }) {
  const [ref, inView] = useInView<HTMLUListElement>();
  return (
    <Section title={title} description={blurb}>
      <ul ref={ref} data-inview={inView} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {fams.map((f, i) => (
          <li key={f.id} className="play-on-view animate-rise" style={stagger(i, 40, 12)}>
            <FamilyCard f={f} onOpen={() => onOpen(f.id)} delay={Math.min(i, 12) * 40} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Header() {
  return (
    <PageHeader
      eyebrow="Observing log"
      title="Achievements"
      description="Observing programs, feats and habits — all earned from what you log, including everything already in your journal."
      actions={
        <Button asChild variant="outline">
          <Link href="/journal">Journal</Link>
        </Button>
      }
    />
  );
}

function RankHero({ stats }: { stats: JournalStats }) {
  const { rank } = stats;
  const span = rank.next ? rank.next.at - rank.from : 1;
  const frac = rank.next ? (rank.objects - rank.from) / span : 1;
  const latest = earnedTimeline(stats.achievements).slice(0, 4);
  const earned = earnedCount(stats.achievements);
  const total = tierCount(stats.achievements);
  return (
    <section className="grid animate-rise gap-6 rounded-2xl border bg-card/60 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" aria-label="Your observer rank">
      <div className="flex items-center gap-5">
        <RankEmblem level={rank.level} progress={frac} size={104} />
        <div className="min-w-0">
          <div className="eyebrow">Level {rank.level}</div>
          <div className="font-display text-[1.9rem] leading-tight tracking-tight">{rank.title}</div>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="num text-foreground">
              <CountUp value={rank.objects} />
            </span>{" "}
            different objects seen
            {rank.next ? (
              <>
                {" "}
                · <span className="num text-foreground">{rank.next.at - rank.objects}</span> more to {rank.next.title}
              </>
            ) : (
              " · the top rank"
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span className="num">{earned}</span> of <span className="num">{total}</span> achievements earned
          </p>
        </div>
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-2">
        <div className="eyebrow">Latest</div>
        {latest.length === 0 ? (
          <p className="text-sm text-muted-foreground">Log your first observation to earn First Light.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {latest.map(({ family, tier }, i) => (
              <li key={tier.id} className="flex animate-rise items-center gap-2.5 text-sm" style={stagger(i + 2, 70)}>
                <Medal family={family.id} tier={tier.tier} size={30} delay={300 + i * 70} />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{family.title}</span>
                  <span className="text-muted-foreground"> · {tier.label ?? goalText(family, tier)}</span>
                </span>
                <span className="num shrink-0 text-2xs text-muted-foreground">{nightText(tier.earnedNight, tier.earnedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function UpNextSection({ stats, onOpen }: { stats: JournalStats; onOpen: (id: string) => void }) {
  const { items, ready } = useUpNext(stats.achievements, stats.observedRefs);
  const { site } = useSite();
  const { hour12 } = usePrefs();
  const tz = siteTz(site);
  return (
    <Section title="Up next" description={site ? `Closest to their next level — with targets that are well placed tonight from ${site.name}.` : "Closest to their next level."}>
      {!ready ? (
        <div className="grid gap-3 md:grid-cols-3">
          <Skel className="h-36" />
          <Skel className="h-36" />
          <Skel className="h-36" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">You've earned everything there is. Clear skies!</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-3">
          {items.map((u, i) => (
            <li key={u.family.id} className="animate-rise" style={stagger(i, 80)}>
              <UpNextCard u={u} onOpen={() => onOpen(u.family.id)} tz={tz} hour12={hour12} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function UpNextCard({ u, onOpen, tz, hour12 }: { u: UpNext; onOpen: () => void; tz?: string; hour12: boolean }) {
  const best = bestTier(u.family);
  const style = TIER_STYLE[u.next.tier];
  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border bg-card px-4 py-3.5">
      <button onClick={onOpen} className="flex items-center gap-3 text-left">
        <Medal family={u.family.id} tier={best?.tier ?? null} progress={toNext(u.family)} nextTier={u.next.tier} size={48} />
        <div className="min-w-0">
          <div className="truncate font-medium">{u.family.title}</div>
          <div className="text-xs text-muted-foreground">
            <span className="num text-foreground">{u.remaining}</span> more for{" "}
            <span className="font-medium" style={{ color: style.color }}>
              {style.label}
            </span>
            {u.next.label ? ` — ${u.next.label}` : ""}
          </div>
        </div>
      </button>
      {u.suggestions.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <div className="eyebrow">Try tonight</div>
          <ul className="flex flex-col gap-1">
            {u.suggestions.map((s) => (
              <li key={s.id}>
                <Link href={`/object/${s.id}`} className="group flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-accent/60">
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  {s.bestTime !== null && <span className="num text-2xs text-muted-foreground">best {formatTime(s.bestTime, { tz, hour12 })}</span>}
                  <Badge variant={DIFFICULTY_TONE[s.difficulty]} className="capitalize">
                    {s.difficulty}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        u.hint && <p className="text-xs text-muted-foreground">{u.hint}</p>
      )}
    </div>
  );
}

function FamilyCard({ f, onOpen, delay = 0 }: { f: AchievementFamily; onOpen: () => void; delay?: number }) {
  const best = bestTier(f);
  const next = nextTier(f);
  const target = next ?? best!;
  return (
    <button
      onClick={onOpen}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-xl border px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        best ? "bg-card" : "bg-transparent",
      )}
    >
      <Medal family={f.id} tier={best?.tier ?? null} progress={toNext(f)} nextTier={next?.tier ?? null} size={48} delay={delay} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium">{f.title}</span>
          {best && (
            <span className="shrink-0 text-2xs font-semibold uppercase tracking-[0.12em]" style={{ color: TIER_STYLE[best.tier].color }}>
              {TIER_STYLE[best.tier].label}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          {next ? (
            <span className="truncate">
              <span className="num text-foreground">{f.progress}</span> / <span className="num">{next.goal}</span> {next.label ? `· ${next.label}` : `for ${TIER_STYLE[next.tier].label.toLowerCase()}`}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Check className="h-3.5 w-3.5" aria-hidden="true" /> Complete
              {target.label ? ` · ${target.label}` : f.tiers.length > 1 ? ` · ${goalText(f, target)}` : ""}
            </span>
          )}
        </div>
        {f.tiers.length > 1 && (
          <div className="mt-1.5 flex gap-1" aria-hidden="true">
            {f.tiers.map((t, k) => (
              <span key={t.id} className="h-1 w-5 overflow-hidden rounded-full bg-muted">
                {t.earned && (
                  <span className="play-on-view block h-full origin-left animate-grow-x rounded-full" style={{ background: TIER_STYLE[t.tier].color, animationDelay: `${delay + 250 + k * 90}ms` }} />
                )}
              </span>
            ))}
          </div>
        )}
        <span className="sr-only">
          {f.tiers.filter((t) => t.earned).length} of {f.tiers.length} levels earned
        </span>
      </div>
    </button>
  );
}

function FamilyDetail({ family, stats, onOpenChange }: { family: AchievementFamily | null; stats: JournalStats; onOpenChange: (o: boolean) => void }) {
  return (
    <ResponsiveModal open={!!family} onOpenChange={onOpenChange} title={family?.title ?? ""} description={family?.blurb}>
      {family && <FamilyDetailBody f={family} stats={stats} />}
    </ResponsiveModal>
  );
}

function FamilyDetailBody({ f, stats }: { f: AchievementFamily; stats: JournalStats }) {
  const def = FAMILY_BY_ID.get(f.id);
  const { objects } = useCatalog();
  const seen = useMemo(() => new Set(stats.observedRefs.map((r) => r.toUpperCase())), [stats.observedRefs]);
  const members = useMemo(() => (def?.member ? familyMembers(def, objects) : []), [def, objects]);
  const solar = def?.solar ?? [];
  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-col gap-2">
        {f.tiers.map((t, i) => (
          <TierRow key={t.id} f={f} t={t} i={i} />
        ))}
      </ol>
      {f.hint && <p className="rounded-lg bg-surface-2/60 px-3 py-2 text-xs text-muted-foreground">{f.hint}</p>}
      {(members.length > 0 || solar.length > 0) && f.id !== "constellations" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-medium">Checklist</h3>
            <span className="num text-xs text-muted-foreground">
              {f.progress} / {f.total ?? members.length}
            </span>
          </div>
          {solar.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {solar.map((id) => (
                <ChecklistChip key={id} id={id} name={id.charAt(0).toUpperCase() + id.slice(1)} done={seen.has(id.toUpperCase())} />
              ))}
            </ul>
          ) : members.length > 60 ? (
            <ul className="grid grid-cols-8 gap-[3px] sm:grid-cols-10">
              {members
                .slice()
                .sort((a, b) => (a.m ?? a.c ?? 999) - (b.m ?? b.c ?? 999) || a.name.localeCompare(b.name))
                .map((o, k) => {
                  const done = seen.has(o.id.toUpperCase());
                  const label = f.id === "messier" ? String(o.m) : f.id === "caldwell" ? String(o.c) : o.name.replace(/^(NGC|IC) ?/, "");
                  return (
                    <li key={o.id}>
                      <Link
                        href={`/object/${o.id}`}
                        title={`${o.name} — ${done ? "observed" : "not yet"}`}
                        className={cn(
                          "num grid aspect-square place-items-center overflow-hidden rounded-[5px] text-[0.58rem] leading-none",
                          done ? "animate-ignite bg-primary font-semibold text-primary-foreground" : "border border-border text-muted-foreground/80 hover:border-primary/50",
                        )}
                        style={done ? { animationDelay: `${200 + k * 6}ms` } : undefined}
                      >
                        {label.length > 4 ? label.slice(0, 4) : label}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {members.map((o) => (
                <ChecklistChip key={o.id} id={o.id} name={o.name} done={seen.has(o.id.toUpperCase())} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function TierRow({ f, t, i }: { f: AchievementFamily; t: AchievementTierResult; i: number }) {
  const style = TIER_STYLE[t.tier];
  return (
    <li className="flex animate-rise items-center gap-3" style={stagger(i, 70)}>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border" style={t.earned ? { borderColor: style.color, background: `${style.color}26` } : undefined}>
        {t.earned ? (
          <Check className="h-3.5 w-3.5 animate-pop" style={{ color: style.color, animationDelay: `${150 + i * 70}ms` }} />
        ) : (
          <Lock className="h-3 w-3 text-muted-foreground" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm">
          <span className="font-medium" style={t.earned ? { color: style.color } : undefined}>
            {style.label}
          </span>
          <span className="text-muted-foreground"> · {goalText(f, t)}</span>
          {t.label && <span className="text-muted-foreground"> — {t.label}</span>}
        </div>
        {t.earned ? (
          <div className="text-2xs text-muted-foreground">
            Earned {nightText(t.earnedNight, t.earnedAt)}
            {t.via?.sessionId ? (
              <>
                {" "}
                ·{" "}
                <Link href={`/journal/${t.via.sessionId}`} className="link">
                  {t.via.ref && !TIME_BASED.has(f.id) ? `with ${t.via.ref}` : "that night"}
                </Link>
              </>
            ) : null}
          </div>
        ) : (
          <div className="num text-2xs text-muted-foreground">
            {f.progress} / {t.goal}
          </div>
        )}
      </div>
    </li>
  );
}

function ChecklistChip({ id, name, done }: { id: string; name: string; done: boolean }) {
  return (
    <li>
      <Link
        href={`/object/${id}`}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
          done ? "border-primary/40 bg-primary/10 text-foreground" : "border-dashed text-muted-foreground hover:border-solid hover:text-foreground",
        )}
      >
        {done ? <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> : <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" aria-hidden="true" />}
        {name}
        <span className="sr-only">{done ? "(observed)" : "(not yet)"}</span>
      </Link>
    </li>
  );
}

function Timeline({ fams }: { fams: AchievementFamily[] }) {
  const items = earnedTimeline(fams);
  const [all, setAll] = useState(false);
  const [ref, inView] = useInView<HTMLOListElement>();
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, 12);
  return (
    <Section title="Your achievements" description="Everything you've earned, newest first.">
      <ol ref={ref} data-inview={inView} className="flex flex-col divide-y divide-border/70 rounded-xl border">
        {shown.map(({ family, tier }, i) => (
          <li key={tier.id} className="play-on-view flex animate-fade items-center gap-3 px-3 py-2.5 sm:px-4" style={stagger(i, 45, 12)}>
            <Medal family={family.id} tier={tier.tier} size={34} delay={Math.min(i, 12) * 45} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">
                <span className="font-medium">{family.title}</span> <span style={{ color: TIER_STYLE[tier.tier].color }}>· {TIER_STYLE[tier.tier].label}</span>
              </div>
              <div className="truncate text-2xs text-muted-foreground">{tier.label ?? goalText(family, tier)}</div>
            </div>
            <div className="shrink-0 text-right text-2xs text-muted-foreground">
              <div className="num">{nightText(tier.earnedNight, tier.earnedAt)}</div>
              {tier.via?.sessionId ? (
                <Link href={`/journal/${tier.via.sessionId}`} className="link">
                  {tier.via.ref && !TIME_BASED.has(family.id) ? tier.via.ref : "that night"}
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {items.length > 12 && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setAll((a) => !a)}>
          {all ? "Show fewer" : `Show all ${items.length}`}
        </Button>
      )}
    </Section>
  );
}

function SignedOut() {
  return (
    <div className="flex flex-col gap-10">
      <Header />
      <div className="grid items-start gap-10 lg:grid-cols-[1fr_1fr]">
        <SignInPrompt
          title="Earn achievements as you observe"
          description="Work through the Messier and Caldwell programs, seasonal showpiece lists and the Solar System; catch oppositions and eclipses; build an observing habit. Every achievement comes from your observing log."
        />
        <div className="flex flex-col gap-3 rounded-xl border bg-background/60 p-5" aria-hidden="true">
          <div className="flex items-center gap-4">
            <RankEmblem level={4} progress={0.6} size={72} />
            <div>
              <div className="eyebrow">Level 4</div>
              <div className="font-display text-xl">Explorer</div>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {(["messier", "solar", "summer", "lunar-cycle", "months"] as const).map((id, i) => (
              <Medal key={id} family={id} tier={(["gold", "silver", "gold", "bronze", null] as const)[i]} size={48} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            <Sparkles className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
            Example — yours fill in from your journal.
          </p>
        </div>
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading achievements">
      <Skel className="h-12 w-56" />
      <Skel className="h-36 w-full" />
      <div className="grid gap-3 md:grid-cols-3">
        <Skel className="h-36" />
        <Skel className="h-36" />
        <Skel className="h-36" />
      </div>
      <Skel className="h-64 w-full" />
    </div>
  );
}

