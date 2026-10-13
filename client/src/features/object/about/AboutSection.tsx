import { CalendarClock, Eye, Flame, Sparkles, Telescope, Thermometer, Waypoints, type LucideIcon } from "lucide-react";
import { niceYears } from "@shared/lookback";
import { DISTANCE_SOURCE, type ObjectFacts, type ObjectStory } from "@shared/stories";
import type { CatalogObject } from "@shared/data/types";
import { Skel } from "@/components/common/Page";
import { cn } from "@/lib/utils";
import type { Subject } from "../model";
import { StoryText } from "./StoryText";
import { LightNow, TimeMachine } from "./TimeMachine";
import { GalaxyMap } from "./GalaxyMap";
import { HowBig } from "./HowBig";
import { catalogScale, earthMoonScale, planetScale, satelliteScale, type ScaleStory } from "@shared/scale";
import { GENERATED_DESC, useStory } from "./useStory";
import { bvTemperature } from "@shared/starColor";


function Tile({ icon: Icon, value, label, className }: { icon: LucideIcon; value: React.ReactNode; label: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-start gap-3 rounded-xl border bg-card px-3.5 py-3", className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary/80" />
      <div className="min-w-0">
        <div className="num text-[1.05rem] font-semibold leading-tight">{value}</div>
        <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function Tiles({ obj, facts, story }: { obj: CatalogObject | null; facts: ObjectFacts | null; story: ObjectStory | null }) {
  const tiles: React.ReactNode[] = [];
  const d = facts?.d;
  if (d) {
    const big = d >= 1e6;
    tiles.push(<Tile key="d" icon={Waypoints} value={big ? `${niceYears(d)}` : niceYears(d)} label={big ? "light-years away" : d < 1.5 ? "light-year away" : "light-years away"} />);
  }
  // Size, mass and contents are in "How big is it?"; these are the other quick facts.
  if (obj?.type === "star") {
    const teff = facts?.teff ?? (obj.bv !== undefined ? Math.round(bvTemperature(obj.bv) / 100) * 100 : null);
    if (teff) tiles.push(<Tile key="t" icon={Thermometer} value={`${Math.round(teff).toLocaleString("en-US")} K`} label="at the surface (the Sun: 5,800 K)" />);
  }
  if (facts?.age && obj?.type !== "open_cluster" && obj?.type !== "cluster_nebula")
    tiles.push(<Tile key="age" icon={obj?.type === "star" ? Flame : CalendarClock} value={niceYears(facts.age)} label="years old" />);
  const disc = story?.discovered;
  if (disc && (disc.by || disc.note)) {
    tiles.push(
      <Tile
        key="disc"
        icon={Telescope}
        className="col-span-2 sm:col-span-1"
        value={<span className="font-sans text-[0.95rem]">{disc.by ?? disc.note}</span>}
        label={disc.by ? (disc.year ? `discovered it in ${disc.year}${disc.note ? ` · ${disc.note}` : ""}` : disc.note ?? "discovered it") : disc.year ? `first recorded in ${disc.year}` : "first seen"}
      />,
    );
  }
  if (!tiles.length) return null;
  return <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">{tiles}</div>;
}

function Facts({ facts }: { facts: ObjectStory["facts"] }) {
  if (!facts.length) return null;
  return (
    <div className="flex flex-col gap-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-gold" /> Did you know?
        {facts.length > 1 && <span className="ml-auto text-xs font-normal text-muted-foreground sm:hidden">swipe →</span>}
      </h3>
      {/* Phones: cards to swipe through; wider screens: a grid. */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0">
        {facts.map((f, i) => (
          <div
            key={i}
            className="w-[82%] shrink-0 animate-rise snap-center rounded-xl border bg-gradient-to-br from-gold/[0.07] via-card to-card p-4 sm:w-auto"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <div className="font-semibold leading-snug">{f.title}</div>
            <p className="mt-1 text-sm leading-relaxed text-foreground/80">
              <StoryText text={f.text} />
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The "How big is it?" comparisons for any subject, from the catalog and the measured facts. */
function scaleFor(subject: Subject, facts: ObjectFacts | null): ScaleStory | null {
  if (subject.kind === "body") return subject.id === "moon" ? earthMoonScale() : planetScale(subject.id);
  if (subject.kind === "satellite") return satelliteScale(subject.id, subject.name, subject.parent.name);
  return catalogScale(subject.obj, subject.name, facts);
}

/** The story's one-line hook, under the object's name, with a jump to the full story. */
export function StoryHook({ id }: { id: string }) {
  const { data } = useStory(id);
  const tagline = data?.story?.tagline;
  if (!tagline) return null;
  return (
    <a href="#about" className="group mt-2.5 block max-w-xl animate-fade text-[0.95rem] leading-snug text-foreground/75 hover:text-foreground">
      {tagline} <span className="whitespace-nowrap text-sm font-medium text-primary group-hover:underline">Read its story ↓</span>
    </a>
  );
}

/**
 * About an object: its story and what makes it remarkable, the measured facts, when the light you see set off,
 * and where it is in (or beyond) our galaxy.
 */
export function AboutSection({
  subject,
  bodyDistanceAu,
  tz,
  hour12,
  eyepieceNote,
}: {
  subject: Subject;
  /** Planets and moons: tonight's distance, for the light-time line. */
  bodyDistanceAu?: number | null;
  tz?: string;
  hour12?: boolean;
  /** Extra text for planets and moons (how to find or observe it). */
  eyepieceNote?: React.ReactNode;
}) {
  const { data, isLoading } = useStory(subject.id);
  const story = data?.story ?? null;
  const facts = data?.facts ?? null;
  const obj = subject.kind === "deep" ? subject.obj : null;
  const fallback = subject.kind === "deep" ? subject.obj.desc : subject.meta.blurb;
  // What it looks like through a telescope, shown under the story: the catalog's curated note, or a planet's tips.
  const seen = obj ? (obj.desc && !GENERATED_DESC.test(obj.desc) ? obj.desc : null) : subject.kind === "body" ? subject.meta.blurb : null;
  const scale = isLoading ? null : scaleFor(subject, facts);

  if (isLoading)
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skel className="h-7 w-4/5" />
        <Skel className="h-24 w-full" />
        <Skel className="h-40 w-full" />
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      {story ? (
        <div className="flex flex-col gap-3">
          <p className="font-display text-[1.45rem] leading-snug tracking-tight text-foreground sm:text-[1.6rem]">{story.tagline}</p>
          {story.story.map((p, i) => (
            <p key={i} className="max-w-[68ch] text-[0.98rem] leading-relaxed text-foreground/90">
              <StoryText text={p} />
            </p>
          ))}
        </div>
      ) : (
        fallback && <p className="max-w-[68ch] text-[0.98rem] leading-relaxed">{fallback}</p>
      )}

      <Tiles obj={obj} facts={facts} story={story} />

      {scale && <HowBig s={scale} />}

      {obj && facts?.d ? (
        <div className="grid gap-4">
          <TimeMachine name={subject.name} ly={facts.d} source={facts.src ? DISTANCE_SOURCE[facts.src] : undefined} />
          <GalaxyMap id={obj.id} name={subject.name} type={obj.type} ra={obj.ra} dec={obj.dec} d={facts.d} src={facts.src} />
        </div>
      ) : bodyDistanceAu ? (
        <LightNow name={subject.name} distanceAu={bodyDistanceAu} tz={tz} hour12={hour12} />
      ) : null}

      {story && <Facts facts={story.facts} />}

      {(story && seen) || eyepieceNote ? (
        <div className="flex gap-3 rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
          <Eye className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="text-sm leading-relaxed">
            <div className="eyebrow mb-1">At the eyepiece</div>
            {story && seen ? <p>{seen}</p> : null}
            {eyepieceNote}
          </div>
        </div>
      ) : null}
    </div>
  );
}
