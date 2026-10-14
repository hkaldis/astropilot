import { useMemo } from "react";
import { Hourglass } from "lucide-react";
import { lookback, milestones, niceYears } from "@shared/lookback";
import { formatLightYears } from "@shared/stories";
import { theName } from "@shared/scale";
import { cn } from "@/lib/utils";

const MIN_AGO = 1;

/** Where `ago` years sits along a log scale from `maxAgo` (left) to now (right), as a fraction. */
const pos = (ago: number, maxAgo: number) => 1 - Math.log(Math.max(ago, MIN_AGO) / MIN_AGO) / Math.log(maxAgo / MIN_AGO);

/**
 * Light from the past: when the light reaching your eye tonight set off, pinned to a moment in history, and a
 * log-scale timeline from deep time to now with the light racing towards you.
 */
export function TimeMachine({ name, ly, source }: { name: string; ly: number; source?: string }) {
  const now = new Date().getFullYear();
  const lb = useMemo(() => lookback(ly, now), [ly, now]);
  const maxAgo = Math.max(1e8, ly * 3);
  const marks = milestones(now).filter((m) => m.ago < maxAgo);
  const x = pos(ly, maxAgo);
  const travelled = niceYears(ly);

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-[radial-gradient(120%_140%_at_0%_0%,hsl(var(--primary)/0.14),transparent_55%),linear-gradient(180deg,#070b16,#05070c)] p-5 text-white sm:p-6">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-300/90">
        <Hourglass className="h-3.5 w-3.5" /> Light from the past
      </div>
      <p className="mt-2 font-display text-[1.65rem] leading-tight tracking-tight sm:text-[2rem]">
        The light you’ll see set off <span className="text-sky-200">{lb.when}</span>
      </p>
      <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-white/75">
        …{lb.moment}. It has been crossing space for {travelled} {ly < 1.5 ? "year" : "years"} to reach your eye — you see {theName(name)} as it was then, not as it is now.
      </p>

      {/* The timeline: deep time on the left, tonight on the right. */}
      <div className="relative mt-7 h-[4.5rem] select-none" aria-hidden="true">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-white/10 via-white/25 to-white/40" />
        {marks.map((m, i) => {
          const mx = pos(m.ago, maxAgo);
          const up = i % 2 === 0;
          return (
            <div key={m.label} className="absolute top-1/2" style={{ left: `${mx * 100}%` }}>
              <div className="h-2 w-px -translate-y-1/2 bg-white/35" />
              <div
                className={cn(
                  "absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] leading-none text-white/45",
                  up ? "bottom-3" : "top-2",
                  // Phones: every other milestone keeps its label, so they don't collide.
                  (m.label === "First humans" || m.label === "Galileo’s telescope") && "hidden sm:block",
                  // The object's own marker sits here: its label would be hidden under the glow.
                  Math.abs(mx - x) < 0.05 && "hidden",
                  mx < 0.08 && "translate-x-[-15%]",
                  mx > 0.92 && "translate-x-[-85%]",
                )}
              >
                {m.label}
              </div>
            </div>
          );
        })}
        {/* The light's path from the object to you. */}
        <div className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-gradient-to-r from-sky-300/70 via-sky-200/40 to-amber-200/60" style={{ left: `${x * 100}%`, right: 0 }} />
        <span className="photon absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_3px_rgba(186,230,253,0.8)]" style={{ "--from": `${x * 100}%` } as React.CSSProperties} />
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${x * 100}%` }}>
          <span className="block h-3.5 w-3.5 rounded-full bg-sky-300 shadow-[0_0_14px_4px_rgba(125,211,252,0.6)]" />
        </div>
        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2">
          <span className="block h-3 w-3 rounded-full bg-amber-200 shadow-[0_0_12px_3px_rgba(253,230,138,0.55)]" />
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-white/55">
        <span>{niceYears(maxAgo)} years ago</span>
        <span>You, tonight</span>
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-white/40">
        {formatLightYears(ly)} away{source ? ` · ${source}` : ""}. Light covers one light-year in a year.
      </p>
    </div>
  );
}

/** The Moon and planets: light minutes or seconds, with the clock time it set off. */
export function LightNow({ name, distanceAu, tz, hour12 }: { name: string; distanceAu: number; tz?: string; hour12?: boolean }) {
  const seconds = distanceAu * 499.005;
  const left = new Date(Date.now() - seconds * 1000);
  const clock = left.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: seconds < 120 ? "2-digit" : undefined, timeZone: tz, hour12 });
  const span = seconds < 120 ? `${seconds.toFixed(seconds < 10 ? 2 : 0)} seconds` : seconds < 7200 ? `${Math.round(seconds / 60)} minutes` : `${(seconds / 3600).toFixed(1)} hours`;
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-[radial-gradient(120%_140%_at_0%_0%,hsl(var(--primary)/0.14),transparent_55%),linear-gradient(180deg,#070b16,#05070c)] p-5 text-white sm:p-6">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-300/90">
        <Hourglass className="h-3.5 w-3.5" /> Light from the past
      </div>
      <p className="mt-2 font-display text-[1.65rem] leading-tight tracking-tight sm:text-[2rem]">
        The light you see left {name} <span className="text-sky-200">{span} ago</span>
      </p>
      <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-white/75">
        Sunlight bounced off {name} at {clock}, crossed{" "}
        {distanceAu < 0.01
          ? `${Math.round(distanceAu * 149_597_870.7).toLocaleString("en-US")} km`
          : distanceAu * 149.6 >= 1000
            ? `${(distanceAu * 0.1496).toFixed(2)} billion km`
            : `${Math.round(distanceAu * 149.6).toLocaleString("en-US")} million km`} of space and only now reaches your
        eye.
      </p>
    </div>
  );
}
