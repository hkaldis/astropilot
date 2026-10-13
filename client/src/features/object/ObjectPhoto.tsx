import { useCallback, useState } from "react";
import { Maximize2 } from "lucide-react";
import { Lightbox } from "@/components/common/Lightbox";
import { SURVEY_CREDIT, fieldText, moonCompare, photoOf } from "@shared/objectImages";
import { cn } from "@/lib/utils";
import type { Subject } from "./model";

/** Photo credit for a planet's or moon's image: author and licence, linking to the file on Wikimedia Commons. */
function BodyCredit({ author, license, page }: { author: string; license: string; page: string }) {
  return (
    <a href={page} target="_blank" rel="noreferrer" className="hover:text-foreground">
      Image: {author || "Wikimedia Commons"} · {license}
    </a>
  );
}

/**
 * What the object looks like. Deep-sky objects: a sky-survey photograph, to scale and the right way up,
 * with an honest word on how much less the eye sees. The Moon, planets and their moons: a spacecraft or
 * telescope image, with what a telescope shows instead.
 */
export function ObjectPhoto({ subject, className }: { subject: Subject; className?: string }) {
  const photo = photoOf(subject.id, subject.kind === "deep" ? subject.obj : null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [full, setFull] = useState(false);
  const closeFull = useCallback(() => setFull(false), []);
  if (!photo || failed) return null;

  let caption: React.ReactNode;
  if (photo.kind === "survey") {
    const cluster = subject.type === "open_cluster" || subject.type === "globular_cluster" || subject.type === "asterism" || subject.type === "star_cloud";
    caption = (
      <>
        Sky-survey photograph, {fieldText(photo.fovArcmin)} across — {moonCompare(photo.fovArcmin)}. North up, east left.{" "}
        {cluster
          ? "A long exposure: by eye you see fewer and fainter stars."
          : "A long exposure: by eye it looks fainter and mostly grey, and the brightest part shows first."}{" "}
        <span className="opacity-80">{SURVEY_CREDIT}.</span>
      </>
    );
  } else {
    const c = photo.credit;
    const what =
      subject.id === "moon" ? "Photographed through a telescope" : subject.kind === "deep" ? (c.what ? `${c.what} image` : "Photograph") : `${c.what || "Spacecraft"} image`;
    const scope =
      subject.kind === "deep"
        ? " The eyepiece view below shows how far apart the stars look at your magnification."
        : subject.kind === "satellite"
        ? ` In a telescope ${subject.name} is a star-like point next to ${subject.parent.name}.`
        : subject.id === "moon"
          ? " Binoculars show the large dark plains; a small telescope, craters along the shadow line."
          : ` In a telescope ${subject.name} is a small disk — the eyepiece view below shows how big tonight.`;
    caption = (
      <>
        {what}.{scope} <BodyCredit author={c.author} license={c.license} page={c.page} />
      </>
    );
  }

  const alt = photo.kind === "survey" ? `${subject.name}: sky-survey photograph, north up` : `${subject.name}`;
  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <button
        type="button"
        onClick={() => setFull(true)}
        disabled={!loaded}
        className="group relative block aspect-square cursor-zoom-in overflow-hidden rounded-2xl border bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`View the picture of ${subject.name} full screen`}
      >
        {!loaded && <div className="skeleton absolute inset-0" aria-hidden="true" />}
        <img
          src={photo.src}
          alt={alt}
          width={512}
          height={512}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn("h-full w-full object-contain transition-opacity duration-500", loaded ? "opacity-100" : "opacity-0")}
        />
        {photo.kind === "survey" && loaded && (
          <>
            <span className="absolute left-1/2 top-1.5 -translate-x-1/2 text-[10px] font-semibold text-white/75 [text-shadow:0_1px_2px_#000]">N</span>
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-white/75 [text-shadow:0_1px_2px_#000]">E</span>
            <span className="num absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/85">{fieldText(photo.fovArcmin)}</span>
          </>
        )}
        {loaded && (
          <span className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white/90 backdrop-blur-sm transition-transform group-hover:scale-110" aria-hidden="true">
            <Maximize2 className="h-4 w-4" />
          </span>
        )}
      </button>
      <figcaption className="text-2xs leading-relaxed text-muted-foreground">{caption}</figcaption>
      <Lightbox open={full} onClose={closeFull} title={subject.name} caption={caption}>
        <div className="relative inline-block max-h-full max-w-full">
          <img src={photo.src} alt={alt} draggable={false} className="block max-h-[calc(100dvh-9rem)] w-auto max-w-full object-contain" />
          {photo.kind === "survey" && (
            <>
              <span className="absolute left-1/2 top-2 -translate-x-1/2 text-xs font-semibold text-white/80 [text-shadow:0_1px_2px_#000]">N</span>
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-white/80 [text-shadow:0_1px_2px_#000]">E</span>
            </>
          )}
        </div>
      </Lightbox>
    </figure>
  );
}
