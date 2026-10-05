/** Achievements: medals per family (computed on the server from the journal) and unlock notifications. */
import { useEffect, useMemo, type ReactNode } from "react";
import { CalendarDays, CalendarRange, Compass, Flame, Gem, Navigation, Sparkles, Timer } from "lucide-react";
import type { Achievement, AchievementTier } from "@shared/api";
import { TypeGlyph, PlanetGlyph } from "@/components/common/Glyphs";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useJournalStats } from "./api";

const TIER: Record<AchievementTier, { label: string; color: string }> = {
  bronze: { label: "Bronze", color: "#c58a5a" },
  silver: { label: "Silver", color: "#b9c3cd" },
  gold: { label: "Gold", color: "#e3bd57" },
  platinum: { label: "Platinum", color: "#9fe0ea" },
};

function familyIcon(family: string): ReactNode {
  const c = "h-[1.15rem] w-[1.15rem]";
  switch (family) {
    case "first-light":
      return <Sparkles className={c} />;
    case "objects":
      return <Compass className={c} />;
    case "messier":
      return <span className="font-display text-[0.95rem] font-semibold leading-none">M</span>;
    case "caldwell":
      return <span className="font-display text-[0.95rem] font-semibold leading-none">C</span>;
    case "planets":
      return <PlanetGlyph id="saturn" className="h-6 w-6" />;
    case "galaxies":
      return <TypeGlyph type="galaxy" className={c} />;
    case "nebulae":
      return <TypeGlyph type="emission_nebula" className={c} />;
    case "globulars":
      return <TypeGlyph type="globular_cluster" className={c} />;
    case "doubles":
      return <TypeGlyph type="double_star" className={c} />;
    case "showpieces":
      return <Gem className={c} />;
    case "marathon":
      return <Timer className={c} />;
    case "nights":
      return <CalendarDays className={c} />;
    case "streak":
      return <Flame className={c} />;
    case "southern":
      return <Navigation className={cn(c, "rotate-180")} />;
    case "seasons":
      return <CalendarRange className={c} />;
    default:
      return <Sparkles className={c} />;
  }
}

interface FamilyView {
  family: string;
  title: string;
  tiers: Achievement[];
  best: Achievement | null; // highest earned
  next: Achievement | null; // next to earn
}

function groupByFamily(list: Achievement[]): FamilyView[] {
  const map = new Map<string, Achievement[]>();
  for (const a of list) {
    const arr = map.get(a.family);
    if (arr) arr.push(a);
    else map.set(a.family, [a]);
  }
  return Array.from(map.values()).map((tiers) => {
    const earned = tiers.filter((t) => t.earned);
    return {
      family: tiers[0].family,
      title: tiers[0].title,
      tiers,
      best: earned[earned.length - 1] ?? null,
      next: tiers.find((t) => !t.earned) ?? null,
    };
  });
}

function Medal({ tier, family }: { tier: AchievementTier | null; family: string }) {
  const color = tier ? TIER[tier].color : null;
  return (
    <div
      className={cn("relative grid h-11 w-11 shrink-0 place-items-center rounded-full", color ? "text-foreground" : "border border-dashed border-border text-muted-foreground/70")}
      style={color ? { background: `radial-gradient(circle at 35% 30%, ${color}55, ${color}1f 60%, transparent 72%)`, boxShadow: `inset 0 0 0 1.5px ${color}` } : undefined}
      aria-hidden="true"
    >
      <span className={cn("grid place-items-center", !color && "opacity-60 grayscale")}>{familyIcon(family)}</span>
    </div>
  );
}

function AchievementCard({ f }: { f: FamilyView }) {
  const target = f.next ?? f.best!;
  const pct = Math.round((target.progress / target.goal) * 100);
  const done = !f.next;
  return (
    <li className={cn("flex gap-3.5 rounded-xl border px-4 py-3.5", f.best ? "bg-card" : "bg-transparent")}>
      <Medal tier={f.best?.tier ?? null} family={f.family} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate text-sm font-medium">{f.title}</h3>
          {f.best && (
            <span className="shrink-0 text-2xs font-medium uppercase tracking-[0.12em]" style={{ color: TIER[f.best.tier].color }}>
              {TIER[f.best.tier].label}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {done ? (
            <>
              {f.best!.description} ·{" "}
              {f.best!.earnedNight
                ? new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${f.best!.earnedNight}T12:00:00Z`))
                : new Date(f.best!.earnedAt!).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
            </>
          ) : (
            target.description
          )}
        </p>
        {!done && (
          <div className="mt-2 flex items-center gap-2.5">
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={target.goal}
              aria-valuenow={target.progress}
              aria-label={`${f.title}: ${target.progress} of ${target.goal}`}
            >
              <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${Math.max(pct, target.progress ? 3 : 0)}%` }} />
            </div>
            <span className="num shrink-0 text-2xs text-muted-foreground">
              {target.progress} / {target.goal}
            </span>
          </div>
        )}
        {f.tiers.length > 1 && (
          <div className="mt-2 flex gap-1" aria-label={`${f.tiers.filter((t) => t.earned).length} of ${f.tiers.length} tiers earned`}>
            {f.tiers.map((t) => (
              <span
                key={t.id}
                title={`${TIER[t.tier].label}: ${t.description}${t.earned ? " ✓" : ""}`}
                className="h-1.5 w-4 rounded-full"
                style={{ background: t.earned ? TIER[t.tier].color : "hsl(var(--muted))" }}
              />
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

export function AchievementsGrid({ achievements }: { achievements: Achievement[] }) {
  const families = useMemo(() => groupByFamily(achievements), [achievements]);
  return (
    <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {families.map((f) => (
        <AchievementCard key={f.family} f={f} />
      ))}
    </ul>
  );
}

export function achievementSummary(achievements: Achievement[]) {
  const earned = achievements.filter((a) => a.earned);
  const latest = earned.reduce<Achievement | null>((a, b) => (!a || (b.earnedAt ?? "") > (a.earnedAt ?? "") ? b : a), null);
  return { earned: earned.length, total: achievements.length, latest };
}

/**
 * Toasts newly earned achievements. Remembers what this device has already announced per user, so
 * history isn't replayed; the first time it runs it posts one summary toast instead.
 */
export function AchievementWatcher() {
  const { user } = useAuth();
  const stats = useJournalStats();
  const data = stats.data?.achievements;
  useEffect(() => {
    if (!user || !data) return;
    const key = `ap.achievements.${user.id}`;
    const earned = data.filter((a) => a.earned);
    let prev: Set<string> | null = null;
    try {
      const raw = localStorage.getItem(key);
      if (raw) prev = new Set(JSON.parse(raw) as string[]);
    } catch {
      return; // storage unavailable: stay quiet rather than repeating toasts
    }
    try {
      localStorage.setItem(key, JSON.stringify(earned.map((a) => a.id)));
    } catch {
      return;
    }
    if (!prev) {
      if (earned.length > 1)
        toast({ title: `You've earned ${earned.length} achievements`, description: "From the observations in your journal so far — see them in the Journal." });
      return;
    }
    const fresh = earned.filter((a) => !prev!.has(a.id));
    if (!fresh.length) return;
    // One toast per family, for its highest new tier.
    const top = new Map<string, Achievement>();
    for (const a of fresh) top.set(a.family, a);
    const list = Array.from(top.values());
    for (const a of list.slice(0, 2)) toast({ title: `Achievement unlocked · ${a.title}`, description: `${TIER[a.tier].label} — ${a.description}.` });
    if (list.length > 2) toast({ title: `+${list.length - 2} more achievements`, description: "See them in your Journal." });
  }, [user, data]);
  return null;
}
