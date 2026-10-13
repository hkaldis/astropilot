/**
 * The stories behind the objects — what makes each one remarkable, written from the Wikipedia articles and the
 * standard references — and the measured facts shown with them (distance, age, member stars). The text may link
 * glossary terms as [[slug|words]]. Served per object by GET /api/story/:id and included in the object pages
 * rendered for search engines.
 */

export interface StoryFact {
  title: string;
  text: string;
}

export interface ObjectStory {
  /** One line that sums up why it's special. */
  tagline: string;
  /** One to three short paragraphs. */
  story: string[];
  /** "Did you know?" cards. */
  facts: StoryFact[];
  discovered?: { by?: string; year?: number; note?: string };
}

export interface ObjectFacts {
  /** Distance in light-years. */
  d?: number;
  /** Where the distance comes from (see DISTANCE_SOURCE). */
  src?: string;
  /** Age in years (open clusters, from Gaia). */
  age?: number;
  /** Member stars Gaia has identified (open clusters). */
  members?: number;
}

export interface StoryResponse {
  story: ObjectStory | null;
  facts: ObjectFacts | null;
}

/** Where a distance comes from, for a footnote. */
export const DISTANCE_SOURCE: Record<string, string> = {
  gaia: "Gaia DR3 cluster census (Hunt & Reffert 2023)",
  harris: "Harris catalogue of globular clusters (2010)",
  lmc: "distance of the Large Magellanic Cloud (Pietrzyński et al. 2019)",
  smc: "distance of the Small Magellanic Cloud (Graczyk et al. 2020)",
  plx: "parallax (Gaia / Hipparcos, via SIMBAD)",
  cep: "Cepheid and red-giant-branch distances (via SIMBAD)",
  sbf: "surface-brightness-fluctuation distances (via SIMBAD)",
  lit: "published distance measurements (median, via SIMBAD)",
  z: "redshift and the Hubble constant",
  wiki: "Wikipedia",
};

/** "24,000 light-years", "2.5 million light-years". */
export function formatLightYears(ly: number): string {
  if (ly >= 1e9) return `${+(ly / 1e9).toPrecision(2)} billion light-years`;
  if (ly >= 1e6) return `${+(ly / 1e6).toPrecision(2)} million light-years`;
  if (ly < 20) return `${+ly.toFixed(1)} light-years`;
  return `${Math.round(ly).toLocaleString("en-US")} light-years`;
}

/** Real width from an angular size (arcminutes) and a distance (light-years). */
export function physicalSizeLy(arcmin: number, distLy: number): number {
  return distLy * (arcmin / 60) * (Math.PI / 180);
}
