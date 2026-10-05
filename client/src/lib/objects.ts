/** Display metadata for object types, quality levels and Bortle classes. */

export const TYPE_LABEL: Record<string, string> = {
  galaxy: "Galaxy",
  galaxy_group: "Galaxy group",
  open_cluster: "Open cluster",
  globular_cluster: "Globular cluster",
  cluster_nebula: "Cluster + nebula",
  planetary_nebula: "Planetary nebula",
  emission_nebula: "Emission nebula",
  reflection_nebula: "Reflection nebula",
  dark_nebula: "Dark nebula",
  supernova_remnant: "Supernova remnant",
  double_star: "Double star",
  asterism: "Asterism",
  star_cloud: "Star cloud",
  planet: "Planet",
  moon: "Moon",
  satellite: "Planetary moon",
};

export const TYPE_PLURAL: Record<string, string> = {
  galaxy: "Galaxies",
  galaxy_group: "Galaxy groups",
  open_cluster: "Open clusters",
  globular_cluster: "Globular clusters",
  cluster_nebula: "Clusters with nebulae",
  planetary_nebula: "Planetary nebulae",
  emission_nebula: "Emission nebulae",
  reflection_nebula: "Reflection nebulae",
  dark_nebula: "Dark nebulae",
  supernova_remnant: "Supernova remnants",
  double_star: "Double stars",
  asterism: "Asterisms",
  star_cloud: "Star clouds",
  planet: "Planets",
  moon: "Moon",
  satellite: "Planetary moons",
};

/** Broad groups used for filters. */
export const TYPE_GROUPS: { id: string; label: string; types: string[] }[] = [
  { id: "galaxies", label: "Galaxies", types: ["galaxy", "galaxy_group"] },
  { id: "nebulae", label: "Nebulae", types: ["emission_nebula", "reflection_nebula", "dark_nebula", "cluster_nebula", "supernova_remnant"] },
  { id: "planetaries", label: "Planetary nebulae", types: ["planetary_nebula"] },
  { id: "globulars", label: "Globular clusters", types: ["globular_cluster"] },
  { id: "clusters", label: "Open clusters", types: ["open_cluster", "asterism", "star_cloud"] },
  { id: "doubles", label: "Double stars", types: ["double_star"] },
];

export type QualityKey = "excellent" | "good" | "fair" | "poor" | "bad";

export function qualityOf(score: number | null | undefined): { key: QualityKey; label: string } {
  const s = score ?? 0;
  if (s >= 80) return { key: "excellent", label: "Excellent" };
  if (s >= 62) return { key: "good", label: "Good" };
  if (s >= 42) return { key: "fair", label: "Fair" };
  if (s >= 22) return { key: "poor", label: "Poor" };
  return { key: "bad", label: "Not worth it" };
}

export const QUALITY_TEXT: Record<QualityKey, string> = {
  excellent: "text-q-excellent",
  good: "text-q-good",
  fair: "text-q-fair",
  poor: "text-q-poor",
  bad: "text-q-bad",
};
export const QUALITY_BG: Record<QualityKey, string> = {
  excellent: "bg-q-excellent",
  good: "bg-q-good",
  fair: "bg-q-fair",
  poor: "bg-q-poor",
  bad: "bg-q-bad",
};

export const DIFFICULTY_TONE: Record<string, QualityKey> = {
  easy: "excellent",
  moderate: "good",
  challenging: "fair",
  "very hard": "poor",
  "out of reach": "bad",
};

export function objectDesignation(o: { id: string; m?: number; c?: number; designations?: string[] }) {
  if (o.m) return `M ${o.m}`;
  const d = o.designations?.find((x) => /^(NGC|IC) /.test(x));
  if (d) return d;
  if (o.c) return `C ${o.c}`;
  return o.designations?.[0] ?? o.id;
}
