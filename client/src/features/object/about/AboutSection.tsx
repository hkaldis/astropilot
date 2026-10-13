import { CalendarClock, Eye, Flame, Ruler, Sparkles, Sun, Telescope, Thermometer, Users, Waypoints, Weight } from "lucide-react";
import { niceYears } from "@shared/lookback";
import { DISTANCE_SOURCE, physicalSizeLy, type ObjectFacts, type ObjectStory } from "@shared/stories";
import type { CatalogObject } from "@shared/data/types";
import { Skel } from "@/components/common/Page";
import { cn } from "@/lib/utils";
import type { Subject } from "../model";
import { StoryText } from "./StoryText";
import { LightNow, TimeMachine } from "./TimeMachine";
import { GalaxyMap } from "./GalaxyMap";
import { GENERATED_DESC, useStory } from "./useStory";
import { bvTemperature } from "@shared/starColor";

const MILKY_WAY_LY = 100_000;

function Tile({ icon: Icon, value, label, className }: { icon: typeof Ruler; value: React.ReactNode; label: React.ReactNode; className?: string }) {
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

/** "2.4", "40", "1,200", "0.15" — a multiple of the Sun's value. */
function times(x: number) {
  if (x < 1) return x.toFixed(x < 0.1 ? 3 : 2).replace(/0+$/, "");
  if (x < 10) return x.toFixed(1).replace(/\.0$/, "");
  if (x < 100) return String(Math.round(x));
  if (x < 1000) return String(Math.round(x / 10) * 10);
  return niceYears(x);
}

function sizeWords(ly: number) {
  return ly < 10 ? ly.toFixed(1) : niceYears(ly);
}

function Tiles({ obj, facts, story }: { obj: CatalogObject | null; facts: ObjectFacts | null; story: ObjectStory | null }) {
  const tiles: React.ReactNode[] = [];
  const d = facts?.d;
  if (d) {
    const big = d >= 1e6;
    tiles.push(<Tile key="d" icon={Waypoints} value={big ? `${niceYears(d)}` : niceYears(d)} label={big ? "light-years away" : d < 1.5 ? "light-year away" : "light-years away"} />);
  }
  const major = obj?.size?.[0];
  if (d && major && obj && obj.type !== "double_star" && obj.type !== "asterism") {
    const w = physicalSizeLy(major, d);
    const mw = obj.type === "galaxy" ? w / MILKY_WAY_LY : null;
    const vsMw = mw === null ? null : mw > 0.8 && mw < 1.25 ? "about as wide as the Milky Way" : mw >= 1.25 ? `${mw.toFixed(1)}× the Milky Way’s width` : mw >= 0.1 ? `${Math.round(mw * 100)}% of the Milky Way’s width` : "a dwarf next to the Milky Way";
    tiles.push(<Tile key="w" icon={Ruler} value={sizeWords(w)} label={<>light-years across{vsMw ? <span className="block">{vsMw}</span> : null}</>} />);
  }
  if (obj?.type === "star") {
    // A star's own size, power, heat and weight, against the Sun's.
    const r = facts?.r;
    if (r) {
      const reach = r > 1118 ? "past Jupiter’s orbit" : r > 327 ? "past Mars’s orbit" : r > 215 ? "past Earth’s orbit" : r > 160 ? "almost to Earth’s orbit" : null;
      tiles.push(<Tile key="r" icon={Ruler} value={`${times(r)}×`} label={<>the Sun’s width{reach ? <span className="block">in the Sun’s place, it would reach {reach}</span> : null}</>} />);
    }
    if (facts?.lum) tiles.push(<Tile key="l" icon={Sun} value={`${times(facts.lum)}×`} label={facts.lum < 1 ? "the Sun’s light (fainter than the Sun)" : "the Sun’s light"} />);
    const teff = facts?.teff ?? (obj.bv !== undefined ? Math.round(bvTemperature(obj.bv) / 100) * 100 : null);
    if (teff) tiles.push(<Tile key="t" icon={Thermometer} value={`${Math.round(teff).toLocaleString("en-US")} K`} label={`at the surface (the Sun: 5,800 K)`} />);
    if (facts?.mass) tiles.push(<Tile key="m" icon={Weight} value={`${times(facts.mass)}×`} label="the Sun’s mass" />);
  }
  if (facts?.age) tiles.push(<Tile key="age" icon={obj?.type === "star" ? Flame : CalendarClock} value={niceYears(facts.age)} label="years old" />);
  if (facts?.members) tiles.push(<Tile key="n" icon={Users} value={facts.members.toLocaleString("en-US")} label="member stars found by Gaia" />);
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
