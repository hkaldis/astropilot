/** Optics helpers for the object page: targets, field shapes, Galilean moons, planet notes. */
import { A, MOON_BY_ID, galileanPositions, maxElongation, type BodyState, type FilterAdvice, type MoonPos, type NightInfo, type TargetLike } from "@shared/astro";
import type { CatalogObject } from "@shared/data/types";
import type { FieldShape } from "./FieldView";
import type { Subject, Tonight } from "./model";

export type OpticsTarget = TargetLike & { id?: string; name?: string };

export function opticsTarget(subject: Subject, tonight: Tonight): { target: OpticsTarget; sizeArcmin?: number } {
  if (subject.kind === "deep") return { target: subject.obj };
  const st = tonight.body!.state;
  if (subject.kind === "satellite") {
    // Frame the planet and the moon together: high power, but a field wide enough for both.
    const sep = tonight.satellite?.sep ?? maxElongation(subject.meta, st.distanceAu);
    return { target: { id: subject.id, name: subject.name, type: "satellite", mag: tonight.satellite?.mag ?? subject.meta.mag }, sizeArcmin: (2.4 * sep + st.diameter) / 60 };
  }
  return { target: { id: subject.id, name: subject.name, type: subject.type, mag: st.mag }, sizeArcmin: st.diameter / 60 };
}

/** True when the lit side of a planet/Moon faces west (it's east of the Sun: an evening object). */
export function litWest(subject: Subject, ms: number, night: NightInfo): boolean {
  if (subject.kind === "deep") return true;
  if (subject.kind === "body" && subject.id === "moon") return night.moon.elongation < 180;
  const body = subject.kind === "satellite" ? subject.parent.body : subject.meta.body;
  const lon = A.PairLongitude(body, A.Body.Sun, new Date(ms));
  return lon < 180;
}

/** Moons for the field view, named, with the page's own moon highlighted. */
function fieldMoons(positions: MoonPos[] | null, highlight?: string) {
  return positions?.map((p) => ({ name: MOON_BY_ID[p.id].name, dx: p.dx, dy: p.dy, hidden: p.occulted || p.eclipse === "total", highlight: p.id === highlight }));
}

export function fieldShape(subject: Subject, tonight: Tonight, night: NightInfo, at: number, moonsAt?: ((t: number) => MoonPos[] | null) | null): FieldShape {
  if (subject.kind !== "deep") {
    // A moon's page shows its planet, with every moon placed and this one marked.
    const st = tonight.body!.state;
    const planetId = subject.kind === "satellite" ? subject.parent.id : subject.id;
    const positions = moonsAt ? moonsAt(at) : planetId === "jupiter" ? galileanPositions(at) : null;
    return {
      kind: "disk",
      diameterArcsec: st.diameter,
      illumination: subject.kind === "body" && subject.id === "moon" ? night.moon.illumination : st.illumination,
      litWest: litWest(subject, at, night),
      ringTilt: planetId === "saturn" ? st.ringTilt : undefined,
      moons: fieldMoons(positions, subject.kind === "satellite" ? subject.id : undefined),
    };
  }
  const o: CatalogObject = subject.obj;
  if (!o.size || !o.size[0]) return { kind: "point" };
  const pa = o.type !== "double_star" ? (o as CatalogObject & { pa?: number }).pa : undefined;
  return { kind: "extended", type: o.type, major: o.size[0], minor: o.size[1] ?? o.size[0], pa: pa ?? null };
}

function phaseWord(f: number) {
  if (f < 0.08) return "a thin crescent";
  if (f < 0.42) return "a crescent";
  if (f < 0.58) return "half-lit";
  if (f < 0.95) return "gibbous";
  return "nearly full";
}

/** Filter advice for one planet (the generic planet advice covers Jupiter and Mars in one breath). Null for the Moon. */
export function planetFilterAdvice(id: string): FilterAdvice | null {
  switch (id) {
    case "mercury":
      return { best: "color", label: "Red or orange filter (optional)", why: "A red (#25) or orange (#21) filter darkens the bright twilight sky around Mercury and makes its tiny phase easier to hold." };
    case "venus":
      return { best: "color", label: "Violet or dark blue filter (optional)", why: "A violet (#47) or dark blue (#38A) filter cuts the glare and can show faint cloud shadings; observing in twilight helps as much." };
    case "mars":
      return { best: "color", label: "Orange or red filter (optional)", why: "Orange or red (#21/#23A) sharpens the dark surface markings and the polar cap; light blue (#80A) shows clouds and limb haze." };
    case "jupiter":
      return { best: "color", label: "Light blue filter (optional)", why: "Light blue (#80A) lifts the contrast of the red-brown belts and the Great Red Spot; a pale yellow (#8) can help the blue-grey festoons." };
    case "saturn":
      return { best: "color", label: "Yellow filter (optional)", why: "A light yellow (#8) or yellow-green (#11) filter can lift the cloud belts and the Cassini Division a little; most nights it's fine without." };
    case "uranus":
    case "neptune":
      return { best: "none", label: "No filter", why: "The disk is tiny and faint — magnification and steady air matter far more than any filter." };
    default:
      return null;
  }
}

/** What to look for on a planet tonight (plain sentences). */
export function planetNotes(id: string, st: BodyState, night: NightInfo): string[] {
  const pct = Math.round(st.illumination * 100);
  const d = st.diameter;
  switch (id) {
    case "moon": {
      const m = night.moon;
      const nearFull = m.illumination > 0.9;
      return [
        `${m.phaseName}, ${Math.round(m.illumination * 100)}% lit, ${m.ageDays.toFixed(1)} days old.`,
        nearFull
          ? "Near full the Moon looks flat and glaring — rays from Tycho and Copernicus are the highlight. A Moon filter or high power tames the glare."
          : "The terminator (the line between day and night) is where craters and mountains throw long shadows — scan along it at 100× or more.",
      ];
    }
    case "mercury":
      return [`${pct}% lit, ${d.toFixed(1)}″ across — at 100×+ you may glimpse its phase.`, "Catch it low in bright twilight with a clear horizon; never sweep for it while the Sun is up."];
    case "venus":
      return [`${phaseWord(st.illumination)} (${pct}% lit), ${d.toFixed(0)}″ across.`, "Observe in twilight rather than full darkness to cut the glare; the phase is obvious at 50×."];
    case "mars":
      return [
        `${d.toFixed(1)}″ disk, ${pct}% lit.`,
        d < 8
          ? "Small this time around: surface markings are hard to see — the disk grows large only near opposition."
          : d < 14
            ? "Polar cap and dark markings show at 150×+ when the air is steady."
            : "Large and detailed: polar cap, dark plains and clouds at 150–250×.",
      ];
    case "jupiter":
      return [
        `${d.toFixed(0)}″ disk — two dark equatorial belts show at 50×; festoons and the Great Red Spot need 150×+ and steady air.`,
        "The four Galilean moons change position nightly — the Moons section shows where they are, hour by hour, and when their shadows cross the disk.",
      ];
    case "saturn": {
      const tilt = Math.abs(st.ringTilt ?? 0);
      return [
        tilt < 4
          ? `The rings are nearly edge-on (${tilt.toFixed(1)}°): a thin line through the globe — a rare sight.`
          : tilt < 12
            ? `The rings are narrowly open (${tilt.toFixed(1)}°); the shadow of the globe on the rings shows at 150×.`
            : `The rings are well open (${tilt.toFixed(1)}°) — look for the Cassini Division at 100×+.`,
        "Titan (mag 8.3) is visible in any telescope; Rhea, Tethys and Dione need a 100 mm (4-inch) scope or larger — the Moons section shows where each one is tonight.",
      ];
    }
    case "uranus":
      return [`A tiny blue-green disk ${d.toFixed(1)}″ across at 150×+.`, "Its brightest moons (Titania, Oberon, mag 14) need a large scope and dark sky."];
    case "neptune":
      return [`A ${d.toFixed(1)}″ bluish disk at 200×+.`, "Triton (mag 13.5) is within reach of an 8″ scope on a steady night."];
    default:
      return [];
  }
}

/** What to look for, and how, when the target is one of a planet's moons (plain sentences). */
export function moonNotes(subject: Extract<Subject, { kind: "satellite" }>, tonight: Tonight): string[] {
  const parent = subject.parent.name;
  const id = subject.id;
  const notes: string[] = [];
  if (id === "io" || id === "europa" || id === "ganymede" || id === "callisto")
    notes.push(
      `Any binoculars show it as a star beside ${parent}; a telescope at 100×+ shows it as a tiny disk, and its shadow as a black dot when it crosses the planet.`,
      "The Moons section lists tonight's transits, shadow transits, eclipses and occultations — tap one to see it.",
    );
  else if (id === "titan") notes.push("A small telescope shows it as an 8th-magnitude star; larger scopes hint at its orange colour.", "It circles Saturn every 16 days, from about 3′ east to 3′ west.");
  else if (id === "iapetus") notes.push(`Look for it when it's west of ${parent}: it shows its bright side and is about two magnitudes brighter than in the east.`);
  else if (id === "phobos" || id === "deimos")
    notes.push(
      `Only near opposition, with a large scope at 300×+. Put ${parent} just outside the field (or behind an occulting bar) so its glare doesn't swamp the moon.`,
      `Catch it near its greatest distance from ${parent}.`,
    );
  else if (subject.parent.id === "uranus" || id === "triton")
    notes.push(`Needs a dark, steady night and high power (200×+). Sketch the field around ${parent} and look again an hour later: the moon moves with the planet, background stars don't.`);
  else notes.push(`Use high power to darken the background and shrink ${parent}'s glare; it's easiest near its greatest distance from the planet.`);
  if (tonight.detect && "needsMm" in tonight.detect && tonight.detect.needsMm) notes.push(`From this sky it takes roughly a ${tonight.detect.needsMm} mm telescope.`);
  return notes;
}
