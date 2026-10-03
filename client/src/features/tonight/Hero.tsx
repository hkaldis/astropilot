import type { NightForecast } from "@shared/forecast";
import type { NightInfo } from "@shared/astro";
import { formatTime, formatDuration, formatNightDate } from "@shared/astro";
import { ScoreDial, Skel } from "@/components/common/Page";
import { MoonGlyph } from "@/components/common/Glyphs";
import { QUALITY_TEXT, qualityOf } from "@/lib/objects";
import { cn } from "@/lib/utils";

const VERDICT_WORD: Record<string, string> = {
  excellent: "An excellent night",
  good: "A good night",
  fair: "A mixed night",
  poor: "A poor night",
  bad: "Not worth setting up",
};

function darknessLabel(n: NightInfo) {
  switch (n.darkness) {
    case "astronomical":
      return "Full darkness";
    case "nautical":
      return "No full darkness (nautical twilight all night)";
    case "civil":
      return "Bright twilight all night";
    default:
      return n.sunNeverSets ? "Midnight sun — the Sun doesn't set" : "No darkness";
  }
}

export function TonightHero({
  night,
  forecast,
  loading,
  isTonight,
  siteName,
  tz,
  hour12,
  now,
}: {
  night: NightInfo;
  forecast: NightForecast | null;
  loading: boolean;
  isTonight: boolean;
  siteName: string;
  tz?: string;
  hour12?: boolean;
  now: number;
}) {
  const fmt = (t: number | null) => formatTime(t, { tz, hour12 });
  const score = forecast?.hasData ? forecast.score : null;
  const q = qualityOf(score ?? 0);
  const inDark = night.darkStart && night.darkEnd && now >= night.darkStart && now <= night.darkEnd;
  const when = isTonight ? (inDark ? "Right now" : now > (night.darkEnd ?? 0) ? "Last night" : "Tonight") : formatNightDate(night.date, "long");
  const moon = night.moon;

  return (
    <section className="relative overflow-hidden rounded-2xl border bg-card">
      <Starfield />
      <div className="relative grid gap-6 p-5 sm:p-7 md:grid-cols-[1fr_auto] md:items-center">
        <div className="min-w-0">
          <div className="eyebrow">
            {when} · {formatNightDate(night.date)} · {siteName}
          </div>
          {loading ? (
            <Skel className="mt-3 h-12 w-72" />
          ) : forecast?.hasData ? (
            <h1 className={cn("mt-2 font-display text-[2.4rem] leading-[1.02] tracking-tight sm:text-[3.1rem]", QUALITY_TEXT[q.key])}>
              {VERDICT_WORD[forecast.verdict] ?? q.label}
            </h1>
          ) : (
            <h1 className="mt-2 font-display text-[2.4rem] leading-[1.02] tracking-tight sm:text-[3.1rem]">{darknessLabel(night)}</h1>
          )}
          <p className="mt-2 max-w-xl text-[0.95rem] text-foreground/90">
            {forecast?.hasData ? forecast.headline : loading ? "" : "No weather forecast for this date yet — here's what the sky itself offers."}
          </p>
          {forecast?.details?.length ? (
            <ul className="mt-3 flex max-w-xl flex-col gap-1 text-sm text-muted-foreground">
              {forecast.details.map((d, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                  {d}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {score !== null && (
          <div className="flex items-center gap-5 md:flex-col md:items-end md:gap-3">
            <ScoreDial score={score} size={120} label="of 100" />
            <div className="flex gap-4 text-xs md:text-right">
              <div>
                <div className="eyebrow">Deep sky</div>
                <div className={cn("num mt-0.5 text-base font-medium", QUALITY_TEXT[qualityOf(forecast!.dsoScore).key])}>{Math.round(forecast!.dsoScore)}</div>
              </div>
              <div>
                <div className="eyebrow">Planets</div>
                <div className={cn("num mt-0.5 text-base font-medium", QUALITY_TEXT[qualityOf(forecast!.planetScore).key])}>{Math.round(forecast!.planetScore)}</div>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="relative grid grid-cols-2 border-t sm:grid-cols-4">
        <Fact label="Darkness" value={night.darkStart ? `${fmt(night.darkStart)} – ${fmt(night.darkEnd)}` : "—"} sub={night.darkStart ? `${formatDuration(night.darkHours)} ${night.darkness === "astronomical" ? "of full dark" : night.darkness + " twilight"}` : darknessLabel(night)} />
        <Fact
          label="Moon"
          value={
            <span className="flex items-center gap-2">
              <MoonGlyph elongation={moon.elongation} size={20} />
              {Math.round(moon.illumination * 100)}%
            </span>
          }
          sub={`${moon.phaseName}${moon.rise && moon.rise < night.nextNoon ? ` · rises ${fmt(moon.rise)}` : ""}${moon.set && moon.set < night.nextNoon ? ` · sets ${fmt(moon.set)}` : ""}`}
        />
        <Fact
          label="Moon-free dark"
          value={formatDuration(night.moonFreeHours)}
          sub={night.moonFreeWindows.length ? night.moonFreeWindows.map(([a, b]) => `${fmt(a)}–${fmt(b)}`).join(", ") : night.darkHours ? "Moon up all night" : "—"}
        />
        <Fact
          label="Best window"
          value={forecast?.bestWindow ? `${fmt(forecast.bestWindow.start)} – ${fmt(forecast.bestWindow.end)}` : "—"}
          sub={forecast?.hasData ? `${formatDuration(forecast.clearDarkHours)} clear & dark` : "Needs forecast"}
        />
      </div>
    </section>
  );
}

function Fact({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="min-w-0 border-b border-r p-4 last:border-r-0 sm:border-b-0 [&:nth-child(2)]:border-r-0 sm:[&:nth-child(2)]:border-r">
      <div className="eyebrow">{label}</div>
      <div className="num mt-1 text-[1.05rem] font-medium">{value}</div>
      {sub && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Deterministic faint starfield behind the hero. */
function Starfield() {
  const stars = Array.from({ length: 70 }, (_, i) => {
    const r = Math.sin(i * 91.7) * 10000;
    const s = Math.sin(i * 47.3) * 10000;
    return { x: (r - Math.floor(r)) * 100, y: (s - Math.floor(s)) * 100, o: 0.15 + ((i * 37) % 10) / 22, r: i % 9 === 0 ? 1.3 : 0.7 };
  });
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <radialGradient id="hero-glow" cx="85%" cy="0%" r="70%">
          <stop offset="0" style={{ stopColor: "hsl(var(--primary))", stopOpacity: 0.10 }} />
          <stop offset="1" style={{ stopColor: "hsl(var(--primary))", stopOpacity: 0 }} />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#hero-glow)" />
      {stars.map((st, i) => (
        <circle key={i} cx={`${st.x}%`} cy={`${st.y}%`} r={st.r} fill="hsl(var(--foreground))" opacity={st.o * 0.6} />
      ))}
    </svg>
  );
}
