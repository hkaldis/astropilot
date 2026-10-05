import type { Confidence, NightForecast } from "@shared/forecast";
import type { NightFrames, NightInfo } from "@shared/astro";
import { formatTime, formatDuration, formatNightDate } from "@shared/astro";
import { ScoreDial, Skel } from "@/components/common/Page";
import { MoonGlyph } from "@/components/common/Glyphs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { QUALITY_TEXT, qualityOf } from "@/lib/objects";
import { cn } from "@/lib/utils";
import { stagger } from "@/lib/motion";
import { moonEventsText, nightClock } from "./useTonight";

const VERDICT_WORD: Record<string, string> = {
  excellent: "An excellent night",
  good: "A good night",
  fair: "A mixed night",
  poor: "A poor night",
  bad: "Not worth setting up",
};

// Darkness is named after the night's darkest part: a "nautical" night has the Sun between −12° and
// −18° (astronomical twilight) at best, a "civil" one between −6° and −12° (nautical twilight).
function darknessLabel(n: NightInfo) {
  switch (n.darkness) {
    case "astronomical":
      return "Full darkness";
    case "nautical":
      return n.astroDusk && n.astroDawn && n.astroDawn > n.astroDusk ? "Only a brief spell of full darkness" : "No full darkness (astronomical twilight all night)";
    case "civil":
      return "No real darkness (nautical twilight all night)";
    default:
      return n.sunNeverSets ? "Midnight sun — the Sun doesn't set" : "Twilight all night — the Sun barely sets";
  }
}

const TWILIGHT_OF: Record<string, string> = { astronomical: "of full dark", nautical: "of astronomical twilight", civil: "of nautical twilight" };

const CONFIDENCE: Record<Confidence, { label: string; tone: string }> = {
  high: { label: "Models agree", tone: "text-muted-foreground" },
  medium: { label: "Some disagreement", tone: "text-q-fair" },
  low: { label: "Models disagree", tone: "text-q-poor" },
};

/** How far the independent weather models back up the forecast, with their reason on hover. */
function ConfidenceChip({ level, reason }: { level: Confidence; reason?: string }) {
  const c = CONFIDENCE[level];
  const chip = (
    <span
      tabIndex={reason ? 0 : undefined}
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs", reason && "cursor-help", c.tone)}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden="true" />
      {c.label}
      {reason && <span className="sr-only">: {reason}</span>}
    </span>
  );
  if (!reason) return chip;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{reason}</TooltipContent>
    </Tooltip>
  );
}

export function TonightHero({
  night,
  frames,
  forecast,
  loading,
  isTonight,
  siteName,
  tz,
  hour12,
  now,
  southern = false,
}: {
  night: NightInfo;
  frames: NightFrames;
  forecast: NightForecast | null;
  loading: boolean;
  isTonight: boolean;
  siteName: string;
  tz?: string;
  hour12?: boolean;
  now: number;
  southern?: boolean;
}) {
  const fmt = (t: number | null) => formatTime(t, { tz, hour12 });
  const score = forecast?.hasData ? forecast.score : null;
  const q = qualityOf(score ?? 0);
  const inDark = night.darkStart && night.darkEnd && now >= night.darkStart && now <= night.darkEnd;
  // The current night lasts until sunrise: it is "Tonight" here as in the week strip and the sections below.
  const when = isTonight ? (inDark ? "Right now" : "Tonight") : formatNightDate(night.date, "long");
  const moon = night.moon;
  const moonPct = Math.round(moon.illumination * 100);
  const moonWhen = moonEventsText(night, frames, nightClock(night, isTonight, now, tz, hour12));

  return (
    <section className="relative overflow-hidden rounded-2xl border bg-card">
      <Starfield />
      <div className="relative grid gap-6 p-5 sm:p-7 md:grid-cols-[1fr_auto] md:items-center">
        <div className="min-w-0">
          <div className="eyebrow">{isTonight ? `${when} · ${formatNightDate(night.date)} · ${siteName}` : `${when} · ${siteName}`}</div>
          {/* The verdict and its story rise in when they arrive, and again for each night picked. */}
          {loading ? (
            <Skel className="mt-3 h-12 w-72" />
          ) : forecast?.hasData ? (
            <h1 key={`${night.date}-${forecast.verdict}`} className={cn("mt-2 animate-rise font-display text-[2.4rem] leading-[1.02] tracking-tight sm:text-[3.1rem]", QUALITY_TEXT[q.key])}>
              {VERDICT_WORD[forecast.verdict] ?? q.label}
            </h1>
          ) : (
            <h1 key={`${night.date}-dark`} className="mt-2 animate-rise font-display text-[2.4rem] leading-[1.02] tracking-tight sm:text-[3.1rem]">
              {darknessLabel(night)}
            </h1>
          )}
          <p key={`${night.date}-h`} className="mt-2 max-w-xl animate-rise text-[0.95rem] text-foreground/90" style={stagger(1, 90)}>
            {forecast?.hasData ? forecast.headline : loading ? "" : "No weather forecast for this date yet — here's what the sky itself offers."}
          </p>
          {forecast?.hasData && forecast.confidence && (
            <div className="mt-2.5">
              <ConfidenceChip level={forecast.confidence} reason={forecast.confidenceReason} />
            </div>
          )}
          {forecast?.details?.length ? (
            <ul key={`${night.date}-details`} className="mt-3 flex max-w-xl flex-col gap-1 text-sm text-muted-foreground">
              {forecast.details.map((d, i) => (
                <li key={i} className="flex animate-rise gap-2" style={stagger(i + 2, 70)}>
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
      <div key={night.date} className="relative grid animate-fade grid-cols-2 border-t sm:grid-cols-4">
        <Fact
          label="Darkness"
          value={night.darkStart ? `${fmt(night.darkStart)} – ${fmt(night.darkEnd)}` : "—"}
          sub={night.darkStart ? `${formatDuration(night.darkHours)} ${TWILIGHT_OF[night.darkness] ?? ""}`.trim() : darknessLabel(night)}
        />
        <Fact
          label="Moon"
          value={
            <span className="flex items-center gap-2" title={`${moonPct}% lit at ${fmt(night.solarMidnight)}, the middle of the night`}>
              <MoonGlyph elongation={moon.elongation} size={20} southern={southern} />
              {moonPct}%
              <span className="font-sans text-2xs font-normal text-muted-foreground">at midnight</span>
            </span>
          }
          sub={`${moon.phaseName} · ${moonWhen}`}
        />
        <Fact
          label="Moon-free dark"
          value={night.darkHours ? formatDuration(night.moonFreeHours) : "—"}
          sub={night.moonFreeWindows.length ? night.moonFreeWindows.map(([a, b]) => `${fmt(a)}–${fmt(b)}`).join(", ") : night.darkHours ? "Moon up all night" : "No dark sky"}
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

/** Deterministic faint starfield behind the hero: a few stars twinkle, and very rarely a meteor. */
function Starfield() {
  const stars = Array.from({ length: 70 }, (_, i) => {
    const r = Math.sin(i * 91.7) * 10000;
    const s = Math.sin(i * 47.3) * 10000;
    return { x: (r - Math.floor(r)) * 100, y: (s - Math.floor(s)) * 100, o: 0.15 + ((i * 37) % 10) / 22, r: i % 9 === 0 ? 1.3 : 0.7 };
  });
  return (
    <>
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <radialGradient id="hero-glow" cx="85%" cy="0%" r="70%">
            <stop offset="0" style={{ stopColor: "hsl(var(--primary))", stopOpacity: 0.10 }} />
            <stop offset="1" style={{ stopColor: "hsl(var(--primary))", stopOpacity: 0 }} />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#hero-glow)" />
        {stars.map((st, i) =>
          i % 6 === 0 ? (
            <g key={i} opacity={st.o * 0.75}>
              <circle
                cx={`${st.x}%`}
                cy={`${st.y}%`}
                r={st.r + 0.2}
                fill="hsl(var(--foreground))"
                className="animate-twinkle"
                style={{ animationDuration: `${2.6 + (i % 5) * 0.7}s`, animationDelay: `${-((i * 0.83) % 4)}s` }}
              />
            </g>
          ) : (
            <circle key={i} cx={`${st.x}%`} cy={`${st.y}%`} r={st.r} fill="hsl(var(--foreground))" opacity={st.o * 0.6} />
          ),
        )}
      </svg>
      <span className="meteor left-[58%] top-[16%]" aria-hidden="true" />
    </>
  );
}
