/**
 * Announces newly earned achievements (after logging an observation, or on any page once the journal
 * stats refresh). Remembers per user and device what has been announced, so history isn't replayed;
 * the first time it runs it posts a single summary instead.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useJournalStats } from "@/features/journal/api";
import { TIER_STYLE } from "./Medal";
import { earnedTimeline, goalText } from "./model";

const KEY = (uid: string) => `ap.achievements.v2.${uid}`;

export function AchievementWatcher() {
  const { user } = useAuth();
  const stats = useJournalStats();
  const [, navigate] = useLocation();
  const fams = stats.data?.achievements;
  useEffect(() => {
    if (!user || !fams) return;
    const earned = earnedTimeline(fams);
    let prev: Set<string> | null = null;
    try {
      const raw = localStorage.getItem(KEY(user.id));
      if (raw) prev = new Set(JSON.parse(raw) as string[]);
      localStorage.setItem(KEY(user.id), JSON.stringify(earned.map((e) => e.tier.id)));
    } catch {
      return; // storage unavailable: stay quiet rather than repeating toasts
    }
    const view = (
      <ToastAction altText="View achievements" onClick={() => navigate("/achievements")}>
        View
      </ToastAction>
    );
    if (!prev) {
      if (earned.length > 1) toast({ title: `You've earned ${earned.length} achievements`, description: "From everything in your journal so far.", action: view });
      return;
    }
    const fresh = earned.filter((e) => !prev!.has(e.tier.id));
    if (!fresh.length) return;
    // One toast per family, for its highest new level.
    const top = new Map<string, (typeof fresh)[number]>();
    for (const e of fresh.reverse()) top.set(e.family.id, e);
    const list = Array.from(top.values());
    for (const { family, tier } of list.slice(0, 2))
      toast({
        title: `${TIER_STYLE[tier.tier].label} · ${family.title}`,
        description: `Achievement unlocked: ${tier.label ?? goalText(family, tier)}.`,
        action: view,
      });
    if (list.length > 2) toast({ title: `+${list.length - 2} more achievements`, description: "See them all on the achievements page.", action: view });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, fams]);
  return null;
}
