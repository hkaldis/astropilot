/** Optics helpers for the object page: targets, field shapes, Galilean moons, planet notes. */
import { A, type BodyState, type NightInfo, type TargetLike } from "@shared/astro";
import type { CatalogObject } from "@shared/data/types";
import type { FieldShape } from "./FieldView";
import type { Subject, Tonight } from "./model";

export type OpticsTarget = TargetLike & { id?: string; name?: string };

export function opticsTarget(subject: Subject, tonight: Tonight): { target: OpticsTarget; sizeArcmin?: number } {
  if (subject.kind === "deep") return { target: subject.obj };
  const st = tonight.body!.state;
  return { target: { id: subject.id, name: subject.name, type: subject.type, mag: st.mag }, sizeArcmin: st.diameter / 60 };
}

/** True when the lit side of a planet/Moon faces west (it's east of the Sun: an evening object). */
export function litWest(subject: Subject, ms: number, night: NightInfo): boolean {
  if (subject.kind !== "body") return true;
  if (subject.id === "moon") return night.moon.elongation < 180;
  const lon = A.PairLongitude(subject.meta.body, A.Body.Sun, new Date(ms));
  return lon < 180;
}

const AU_LIGHT_DAYS = 0.0057755183;

/** Galilean moon offsets from Jupiter in arcseconds (dx east, dy north), light-time corrected. */
export function galileanMoons(ms: number): { name: string; dx: number; dy: number; hidden: boolean }[] {
  const date = new Date(ms);
  const j = A.GeoVector(A.Body.Jupiter, date, true);
  const dist = Math.hypot(j.x, j.y, j.z);
  const u = [j.x / dist, j.y / dist, j.z / dist];
  // East = pole × line of sight; north = line of sight × east.
  let e = [-u[1], u[0], 0];
  const en = Math.hypot(e[0], e[1]) || 1;
  e = [e[0] / en, e[1] / en, 0];
  const n = [u[1] * e[2] - u[2] * e[1], u[2] * e[0] - u[0] * e[2], u[0] * e[1] - u[1] * e[0]];
  const moons = A.JupiterMoons(new Date(ms - dist * AU_LIGHT_DAYS * 86_400_000));
  const RAD = 206_264.806;
  const jupRadiusArcsec = (71_492 / (dist * 149_597_870.7)) * RAD;
  return (
    [
      ["Io", moons.io],
      ["Europa", moons.europa],
      ["Ganymede", moons.ganymede],
      ["Callisto", moons.callisto],
    ] as const
  ).map(([name, m]) => {
    const dx = ((m.x * e[0] + m.y * e[1] + m.z * e[2]) / dist) * RAD;
    const dy = ((m.x * n[0] + m.y * n[1] + m.z * n[2]) / dist) * RAD;
    const behind = m.x * u[0] + m.y * u[1] + m.z * u[2] > 0;
    return { name, dx, dy, hidden: behind && Math.hypot(dx, dy) < jupRadiusArcsec };
  });
}

export function fieldShape(subject: Subject, tonight: Tonight, night: NightInfo, at: number): FieldShape {
  if (subject.kind === "body") {
    const st = tonight.body!.state;
    return {
      kind: "disk",
      diameterArcsec: st.diameter,
      illumination: subject.id === "moon" ? night.moon.illumination : st.illumination,
      litWest: litWest(subject, at, night),
      ringTilt: subject.id === "saturn" ? st.ringTilt : undefined,
      moons: subject.id === "jupiter" ? galileanMoons(at) : undefined,
    };
  }
  const o: CatalogObject = subject.obj;
  if (!o.size || !o.size[0]) return { kind: "point" };
  const pa = o.type !== "double_star" ? (o as CatalogObject & { pa?: number }).pa : undefined;
  return { kind: "extended", type: o.type, major: o.size[0], minor: o.size[1] ?? o.size[0], pa: pa ?? null };
}

export function binocularSpec(name: string): { magnification: number; aperture: number; fieldDeg: number } {
  const m = /(\d+(?:\.\d+)?)\s*[×x]\s*(\d+)/.exec(name);
  const mag = m ? Number(m[1]) : 10;
  return { magnification: mag, aperture: m ? Number(m[2]) : 50, fieldDeg: 65 / mag };
}

function phaseWord(f: number) {
  if (f < 0.08) return "a thin crescent";
  if (f < 0.42) return "a crescent";
  if (f < 0.58) return "half-lit";
  if (f < 0.95) return "gibbous";
  return "nearly full";
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
        "The four Galilean moons change position nightly — the field view shows where they are tonight.",
      ];
    case "saturn": {
      const tilt = Math.abs(st.ringTilt ?? 0);
      return [
        tilt < 4
          ? `The rings are nearly edge-on (${tilt.toFixed(1)}°): a thin line through the globe — a rare sight.`
          : tilt < 12
            ? `The rings are narrowly open (${tilt.toFixed(1)}°); the shadow of the globe on the rings shows at 150×.`
            : `The rings are well open (${tilt.toFixed(1)}°) — look for the Cassini Division at 100×+.`,
        "Titan (mag 8.3) is visible in any telescope; Rhea, Tethys and Dione need a 100 mm (4-inch) scope or larger.",
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
