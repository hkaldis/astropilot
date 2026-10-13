/**
 * Physical facts about the Solar System bodies in the app, for size and mass comparisons: mean radius, mass,
 * surface gravity, rotation, orbital period and typical temperature (NASA planetary fact sheets; moon masses from
 * the JPL satellite physical parameters).
 */

export interface BodyPhysics {
  /** Mean radius, km. */
  radiusKm: number;
  /** Mass, kg. */
  massKg: number;
  /** Surface gravity (or at the 1-bar level for the giants), m/s². */
  gravity?: number;
  /** Mean density, g/cm³. */
  density?: number;
  /** Sidereal rotation, hours; negative when it spins backwards. */
  rotationH?: number;
  /** Length of a day — sunrise to sunrise — in hours. */
  solarDayH?: number;
  /** Time to go round the Sun (planets), or its planet (moons), in days. */
  orbitDays?: number;
  /** Typical temperature, °C (the giants at the 1-bar cloud level), or a range. */
  tempC?: number | [number, number];
  /** Escape velocity, km/s. */
  escapeKms?: number;
}

export const EARTH: BodyPhysics = { radiusKm: 6371, massKg: 5.972e24, gravity: 9.81, density: 5.514, rotationH: 23.934, solarDayH: 24, orbitDays: 365.256, tempC: 15, escapeKms: 11.19 };
export const SUN = { radiusKm: 695_700, massKg: 1.989e30 };
/** Neptune's distance from the Sun, AU — the edge of the planets. */
export const NEPTUNE_AU = 30.07;
export const AU_KM = 149_597_870.7;
export const LY_KM = 9.4607e12;
export const AU_PER_LY = 63_241.1;

export const BODY_PHYSICS: Record<string, BodyPhysics> = {
  moon: { radiusKm: 1737.4, massKg: 7.346e22, gravity: 1.62, density: 3.344, rotationH: 655.7, solarDayH: 708.7, orbitDays: 27.32, tempC: [-173, 127], escapeKms: 2.38 },
  mercury: { radiusKm: 2439.7, massKg: 3.301e23, gravity: 3.7, density: 5.429, rotationH: 1407.6, solarDayH: 4222.6, orbitDays: 88.0, tempC: [-173, 427], escapeKms: 4.25 },
  venus: { radiusKm: 6051.8, massKg: 4.867e24, gravity: 8.87, density: 5.243, rotationH: -5832.5, solarDayH: 2802, orbitDays: 224.7, tempC: 464, escapeKms: 10.36 },
  mars: { radiusKm: 3389.5, massKg: 6.417e23, gravity: 3.71, density: 3.934, rotationH: 24.623, solarDayH: 24.66, orbitDays: 687.0, tempC: -65, escapeKms: 5.03 },
  jupiter: { radiusKm: 69_911, massKg: 1.898e27, gravity: 24.79, density: 1.326, rotationH: 9.925, solarDayH: 9.926, orbitDays: 4332.6, tempC: -110, escapeKms: 59.5 },
  saturn: { radiusKm: 58_232, massKg: 5.683e26, gravity: 10.44, density: 0.687, rotationH: 10.656, solarDayH: 10.656, orbitDays: 10_759, tempC: -140, escapeKms: 35.5 },
  uranus: { radiusKm: 25_362, massKg: 8.681e25, gravity: 8.87, density: 1.27, rotationH: -17.24, solarDayH: 17.24, orbitDays: 30_687, tempC: -195, escapeKms: 21.3 },
  neptune: { radiusKm: 24_622, massKg: 1.024e26, gravity: 11.15, density: 1.638, rotationH: 16.11, solarDayH: 16.11, orbitDays: 60_190, tempC: -200, escapeKms: 23.5 },
  // The planets' moons (radius from the app's moon list, masses from JPL).
  io: { radiusKm: 1821.6, massKg: 8.932e22 },
  europa: { radiusKm: 1560.8, massKg: 4.8e22 },
  ganymede: { radiusKm: 2634.1, massKg: 1.4819e23 },
  callisto: { radiusKm: 2410.3, massKg: 1.0759e23 },
  mimas: { radiusKm: 198.2, massKg: 3.75e19 },
  enceladus: { radiusKm: 252.1, massKg: 1.08e20 },
  tethys: { radiusKm: 531.1, massKg: 6.17e20 },
  dione: { radiusKm: 561.4, massKg: 1.095e21 },
  rhea: { radiusKm: 763.8, massKg: 2.307e21 },
  titan: { radiusKm: 2574.7, massKg: 1.3452e23 },
  hyperion: { radiusKm: 135, massKg: 5.6e18 },
  iapetus: { radiusKm: 734.5, massKg: 1.806e21 },
  phobos: { radiusKm: 11.27, massKg: 1.066e16 },
  deimos: { radiusKm: 6.2, massKg: 1.476e15 },
  miranda: { radiusKm: 235.8, massKg: 6.4e19 },
  ariel: { radiusKm: 578.9, massKg: 1.251e21 },
  umbriel: { radiusKm: 584.7, massKg: 1.275e21 },
  titania: { radiusKm: 788.9, massKg: 3.4e21 },
  oberon: { radiusKm: 761.4, massKg: 3.076e21 },
  triton: { radiusKm: 1353.4, massKg: 2.139e22 },
};

const G = 6.674e-11;

/** Surface gravity (m/s²) from mass and radius, for bodies without a listed value. */
export function gravityOf(b: BodyPhysics): number {
  return b.gravity ?? (G * b.massKg) / (b.radiusKm * 1000) ** 2;
}

/** Escape velocity (m/s). */
export function escapeOf(b: BodyPhysics): number {
  return b.escapeKms !== undefined ? b.escapeKms * 1000 : Math.sqrt((2 * G * b.massKg) / (b.radiusKm * 1000));
}
