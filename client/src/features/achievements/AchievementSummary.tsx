/** Compact achievements card for the Journal: rank, latest medals and the next goal. */
import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import type { JournalStats } from "@shared/api";
import { Medal, RankEmblem, TIER_STYLE } from "./Medal";
import { earnedCount, earnedTimeline, tierCount, toNext, useUpNext, bestTier } from "./model";

export function AchievementSummary({ stats }: { stats: JournalStats }) {
  const { rank } = stats;
  const frac = rank.next ? (rank.objects - rank.from) / (rank.next.at - rank.from) : 1;
  const latest = earnedTimeline(stats.achievements).slice(0, 5);
  const { items } = useUpNext(stats.achievements, stats.observedRefs, 1);
  const up = items[0];
  return (
    <Link
      href="/achievements"
      className="group grid gap-4 rounded-2xl border bg-card/60 p-4 transition-colors hover:bg-accent/40 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-5"
      aria-label={`Achievements: level ${rank.level}, ${rank.title}. ${earnedCount(stats.achievements)} earned.`}
    >
      <div className="flex items-center gap-4">
        <RankEmblem level={rank.level} progress={frac} size={72} />
        <div className="min-w-0">
          <div className="eyebrow">Level {rank.level}</div>
          <div className="font-display text-[1.35rem] leading-tight">{rank.title}</div>
          <div className="text-xs text-muted-foreground">
            <span className="num">{earnedCount(stats.achievements)}</span> of <span className="num">{tierCount(stats.achievements)}</span> achievements
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        {latest.length > 0 && (
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {latest.map(({ family, tier }) => (
              <Medal key={tier.id} family={family.id} tier={tier.tier} size={34} title={`${family.title} · ${TIER_STYLE[tier.tier].label}`} />
            ))}
          </div>
        )}
        {up && (
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <Medal family={up.family.id} tier={bestTier(up.family)?.tier ?? null} progress={toNext(up.family)} nextTier={up.next.tier} size={30} />
            <span className="min-w-0 truncate">
              <span className="text-muted-foreground">Up next: </span>
              <span className="font-medium">{up.family.title}</span>
              <span className="text-muted-foreground">
                {" "}
                — {up.remaining} more for {TIER_STYLE[up.next.tier].label.toLowerCase()}
                {up.suggestions.length ? `; try ${up.suggestions.map((s) => s.name).slice(0, 2).join(" or ")} tonight` : ""}
              </span>
            </span>
          </div>
        )}
      </div>
      <span className="hidden items-center gap-1 text-sm text-muted-foreground group-hover:text-foreground sm:inline-flex">
        All achievements <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </Link>
  );
}
