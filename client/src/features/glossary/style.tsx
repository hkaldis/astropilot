import { CalendarClock, CloudSun, Compass, Lightbulb, Orbit, Sparkles, Star, Tag, Telescope, type LucideIcon } from "lucide-react";
import type { GlossaryCategory } from "@shared/glossary";

/** Each category's icon and accent colour (dot, chip and icon tint), readable in light and dark themes. */
export const CATEGORY_STYLE: Record<GlossaryCategory, { icon: LucideIcon; dot: string; tint: string }> = {
  "deep-sky": { icon: Sparkles, dot: "bg-violet-400", tint: "bg-violet-500/10 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300" },
  stars: { icon: Star, dot: "bg-amber-400", tint: "bg-amber-500/10 text-amber-700 dark:bg-amber-300/15 dark:text-amber-200" },
  "solar-system": { icon: Orbit, dot: "bg-orange-400", tint: "bg-orange-500/10 text-orange-700 dark:bg-orange-300/15 dark:text-orange-200" },
  events: { icon: CalendarClock, dot: "bg-rose-400", tint: "bg-rose-500/10 text-rose-700 dark:bg-rose-300/15 dark:text-rose-200" },
  sky: { icon: Compass, dot: "bg-sky-400", tint: "bg-sky-500/10 text-sky-700 dark:bg-sky-300/15 dark:text-sky-200" },
  brightness: { icon: Lightbulb, dot: "bg-yellow-400", tint: "bg-yellow-500/10 text-yellow-700 dark:bg-yellow-200/15 dark:text-yellow-100" },
  conditions: { icon: CloudSun, dot: "bg-cyan-400", tint: "bg-cyan-500/10 text-cyan-700 dark:bg-cyan-300/15 dark:text-cyan-200" },
  optics: { icon: Telescope, dot: "bg-emerald-400", tint: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-300/15 dark:text-emerald-200" },
  names: { icon: Tag, dot: "bg-slate-400", tint: "bg-slate-500/10 text-slate-700 dark:bg-slate-300/15 dark:text-slate-200" },
  astropilot: { icon: Sparkles, dot: "bg-primary", tint: "bg-primary/10 text-primary" },
};
