import { useState } from "react";
import { Link } from "wouter";
import { Telescope, X } from "lucide-react";
import { useActiveScope, SCOPE_PRESETS } from "@/hooks/useScope";
import { useAuth } from "@/hooks/useAuth";
import { store } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CHOICES = ["eye", "bino", "r80", "n130", "dob8", "dob10", "dob12"];

/** One-time question for people without saved gear: what they observe with changes every recommendation. */
export function ScopePrompt() {
  const scope = useActiveScope();
  const { user } = useAuth();
  const [done, setDone] = useState(() => store.get("ap.scopePromptDone", false));
  if (done || scope.source !== "preset" || scope.isLoading) return null;
  const finish = () => {
    setDone(true);
    store.set("ap.scopePromptDone", true);
  };
  return (
    <div className="rounded-xl border bg-surface-2/40 px-4 py-3">
      <div className="flex items-start gap-3">
        <Telescope className="mt-0.5 hidden h-5 w-5 shrink-0 text-primary sm:block" />
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="font-medium">What do you observe with?</span>{" "}
            <span className="text-muted-foreground">Targets, difficulty and eyepiece advice are worked out for it.</span>
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Instrument">
            {CHOICES.map((id) => {
              const p = SCOPE_PRESETS.find((x) => x.id === id)!;
              const active = scope.presetId === id;
              return (
                <button
                  key={id}
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    scope.setPreset(id);
                    finish();
                  }}
                  className={cn("rounded-full border px-3 py-1 text-xs transition-colors", active ? "border-primary/50 bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
                >
                  {p.name}
                </button>
              );
            })}
            {user && (
              <Button asChild variant="link" size="sm" className="h-auto px-1 text-xs">
                <Link href="/gear">or add your own gear</Link>
              </Button>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Keep the 8-inch Dobsonian" onClick={finish}>
          <X />
        </Button>
      </div>
    </div>
  );
}
