/**
 * A picture of every object. Deep-sky objects: a Digitized Sky Survey photograph (DSS2 colour, via CDS
 * hips2fits), framed around the object, north up and east left like the sky chart and the eyepiece view.
 * The Moon, planets and their moons: a freely licensed image from Wikimedia Commons, credited in
 * data/bodyImages.json. The files are made by scripts/object-images.ts and served from /img/objects/.
 */
import bodyImages from "./data/bodyImages.json";

/** Bump when the images are regenerated, so browsers and the service worker fetch the new ones. */
export const OBJECT_IMAGE_VERSION = 1;
export const OBJECT_IMAGE_PX = 512;

export interface BodyImageCredit {
  /** Commons file page. */
  page: string;
  author: string;
  license: string;
  licenseUrl?: string;
  /** What it shows, for the caption ("Hubble Space Telescope", "Cassini"…). */
  what: string;
}

export const BODY_IMAGES = bodyImages as Record<string, BodyImageCredit>;

export const objectImageUrl = (id: string) => `/img/objects/${id.toLowerCase()}.webp?v=${OBJECT_IMAGE_VERSION}`;

/**
 * Whether a deep-sky object has a survey photograph. Not bright double stars: on the survey plates a
 * naked-eye star is one overexposed blob that swallows its companion (the eyepiece view shows the pair).
 */
export function hasSurveyPhoto(o: { type: string; mag?: number | null }): boolean {
  return o.type !== "double_star" || (o.mag ?? 0) >= 6;
}

/**
 * How wide the survey photograph is, in arcminutes: big enough to show the whole object with some sky
 * around it (its stars help to find it), never so tight that the survey's resolution runs out.
 */
export function surveyFieldArcmin(o: { type: string; size?: number[]; sep?: number }): number {
  if (o.type === "double_star") return Math.min(30, Math.max(8, ((o.sep ?? 0) / 60) * 10));
  const major = o.size?.[0];
  if (!major) return 15;
  return Math.min(720, Math.max(10, major * (major < 60 ? 1.8 : 1.4)));
}

/** "4.2°" / "25′" */
export function fieldText(arcmin: number): string {
  return arcmin >= 60 ? `${(arcmin / 60).toFixed(arcmin >= 600 ? 0 : 1)}°` : `${Math.round(arcmin)}′`;
}


export type ObjectPhoto =
  | { kind: "survey"; src: string; fovArcmin: number }
  | { kind: "body"; src: string; credit: BodyImageCredit };

/** The picture for an object page: a catalog object's survey photograph, or a planet's or moon's image. */
export function photoOf(id: string, dso?: { id: string; type: string; mag?: number | null; size?: number[]; sep?: number } | null): ObjectPhoto | null {
  if (dso) return hasSurveyPhoto(dso) ? { kind: "survey", src: objectImageUrl(dso.id), fovArcmin: surveyFieldArcmin(dso) } : null;
  const credit = BODY_IMAGES[id];
  return credit ? { kind: "body", src: objectImageUrl(id), credit } : null;
}

/** The survey's credit, as its makers ask for it. */
export const SURVEY_CREDIT = "Digitized Sky Survey (STScI; Caltech/Palomar and UK Schmidt/AAO plates), colour HiPS by CDS";

/** How the field compares with the full Moon: "3× the full Moon's width", "about a third of the full Moon's width". */
export function moonCompare(arcmin: number): string {
  const r = arcmin / 31;
  if (r >= 1.4) return `${r < 3 ? r.toFixed(1).replace(/\.0$/, "") : Math.round(r)}× the full Moon's width`;
  if (r >= 0.8) return "about the full Moon's width";
  const parts = Math.round(1 / r);
  return `about ${parts === 2 ? "half" : `a ${["", "", "", "third", "quarter", "fifth", "sixth"][parts] ?? `1/${parts}`}`} of the full Moon's width`;
}
