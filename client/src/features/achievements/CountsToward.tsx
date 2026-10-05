/** On an object page: which achievement programs it counts towards, and whether it's in your log. */
import { Link } from "wouter";
import { Check } from "lucide-react";
import { FAMILY_BY_ID } from "@shared/achievements";
import { useAuth } from "@/hooks/useAuth";
import { useJournalStats } from "@/features/journal/api";
import { familiesFor } from "./model";

/** Collections and catch-all feats are too broad to be worth a chip; keep the lists people work through. */
const SHOWN = new Set(["messier", "caldwell", "showpieces", "solar", "moons", "doubles", "winter", "spring", "summer", "autumn", "southern", "tight-double", "faint"]);

export function CountsToward({ obj }: { obj: { id: string; type: string; m?: number; c?: number; showpiece?: boolean; con?: string; mag?: number; sep?: number; dec?: number } }) {
  const { user } = useAuth();
  const stats = useJournalStats();
  const ids = familiesFor(obj).filter((id) => SHOWN.has(id));
  const logged = !!stats.data?.observedRefs.some((r) => r.toUpperCase() === obj.id.toUpperCase());
  if (!ids.length && !(user && logged)) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {user && stats.data && (
        <span className={logged ? "inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-foreground" : "rounded-full border border-dashed px-2.5 py-1 text-muted-foreground"}>
          {logged ? (
            <>
              <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> In your log
            </>
          ) : (
            "New for you"
          )}
        </span>
      )}
      {ids.length > 0 && <span className="text-muted-foreground">Counts toward</span>}
      {ids.map((id) => (
        <Link key={id} href="/achievements" className="rounded-full border px-2.5 py-1 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
          {FAMILY_BY_ID.get(id)!.title}
        </Link>
      ))}
    </div>
  );
}
