/**
 * Astronomy Service Layer
 * 
 * Provides reusable astronomy calculations using the astronomy-engine library.
 * Used across multiple features: Dashboard widgets, Visibility Calculator,
 * Observation Wizard, and Night Conditions scoring.
 */

// Types for astronomy data
export interface TwilightTimes {
  civilDawn: string | null;
  nauticalDawn: string | null;
  astronomicalDawn: string | null;
  sunrise: string | null;
  sunset: string | null;
  civilDusk: string | null;
  nauticalDusk: string | null;
  astronomicalDusk: string | null;
}

export interface MoonData {
  phase: number;
  illumination: number;
  phaseName: string;
  riseTime: string | null;
  setTime: string | null;
  transitTime: string | null;
  altitude: number;
  azimuth: number;
  isAboveHorizon: boolean;
}

export interface ObservationWindow {
  start: string;
  end: string;
  durationHours: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  moonFreeHours: number;
  description: string;
}

export interface CelestialEvent {
  type: 'conjunction' | 'opposition' | 'elongation' | 'lunar_phase' | 'meteor_shower';
  name: string;
  date: string;
  description: string;
  bodies?: string[];
  magnitude?: number;
}

export interface AltitudePoint {
  time: string;
  altitude: number;
  azimuth: number;
  isAboveHorizon: boolean;
}

export interface ObjectVisibility {
  catalogId: string;
  name: string;
  riseTime: string | null;
  setTime: string | null;
  transitTime: string | null;
  transitAltitude: number | null;
  bestViewingStart: string | null;
  bestViewingEnd: string | null;
  currentAltitude: number;
  currentAzimuth: number;
  isVisible: boolean;
  altitudeCurve: AltitudePoint[];
  moonSeparation: number | null;
  moonInterference: 'none' | 'low' | 'moderate' | 'high';
}

export interface TonightSummary {
  twilight: TwilightTimes;
  moon: MoonData;
  observationWindow: ObservationWindow;
  upcomingEvents: CelestialEvent[];
  planetVisibility: {
    name: string;
    isVisible: boolean;
    bestTime: string | null;
    altitude: number;
  }[];
}

/**
 * Get phase name from moon phase angle (0-360 degrees)
 */
function getMoonPhaseName(phase: number): string {
  if (phase < 22.5 || phase >= 337.5) return 'New Moon';
  if (phase < 67.5) return 'Waxing Crescent';
  if (phase < 112.5) return 'First Quarter';
  if (phase < 157.5) return 'Waxing Gibbous';
  if (phase < 202.5) return 'Full Moon';
  if (phase < 247.5) return 'Waning Gibbous';
  if (phase < 292.5) return 'Last Quarter';
  return 'Waning Crescent';
}

/**
 * Calculate twilight times for a given location and date
 */
export async function calculateTwilightTimes(
  latitude: number,
  longitude: number,
  date: Date = new Date()
): Promise<TwilightTimes> {
  const Astronomy = await import('astronomy-engine');
  const observer = new Astronomy.Observer(latitude, longitude, 0);
  
  // Start from midnight of the given date
  const midnight = new Date(date);
  midnight.setHours(0, 0, 0, 0);
  
  const result: TwilightTimes = {
    civilDawn: null,
    nauticalDawn: null,
    astronomicalDawn: null,
    sunrise: null,
    sunset: null,
    civilDusk: null,
    nauticalDusk: null,
    astronomicalDusk: null,
  };
  
  try {
    // Search for sunrise and sunset
    const sunriseResult = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, +1, midnight, 1);
    const sunsetResult = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, -1, midnight, 1);
    
    if (sunriseResult) result.sunrise = sunriseResult.date.toISOString();
    if (sunsetResult) result.sunset = sunsetResult.date.toISOString();
    
    // Calculate twilight times using altitude angles
    // Civil twilight: Sun at -6°
    // Nautical twilight: Sun at -12°
    // Astronomical twilight: Sun at -18°
    
    const twilightAngles = [
      { angle: -6, dawnKey: 'civilDawn' as const, duskKey: 'civilDusk' as const },
      { angle: -12, dawnKey: 'nauticalDawn' as const, duskKey: 'nauticalDusk' as const },
      { angle: -18, dawnKey: 'astronomicalDawn' as const, duskKey: 'astronomicalDusk' as const },
    ];
    
    for (const { angle, dawnKey, duskKey } of twilightAngles) {
      try {
        // Search for when sun crosses the altitude threshold
        const dawnSearch = Astronomy.SearchAltitude(
          Astronomy.Body.Sun,
          observer,
          +1, // rising
          midnight,
          1, // search 1 day
          angle
        );
        
        const duskSearch = Astronomy.SearchAltitude(
          Astronomy.Body.Sun,
          observer,
          -1, // setting
          midnight,
          1,
          angle
        );
        
        if (dawnSearch) result[dawnKey] = dawnSearch.date.toISOString();
        if (duskSearch) result[duskKey] = duskSearch.date.toISOString();
      } catch (e) {
        // May not occur at high latitudes during summer/winter
      }
    }
  } catch (error) {
    console.error('Error calculating twilight times:', error);
  }
  
  return result;
}

/**
 * Calculate moon data for a given location and time
 */
export async function calculateMoonData(
  latitude: number,
  longitude: number,
  date: Date = new Date()
): Promise<MoonData> {
  const Astronomy = await import('astronomy-engine');
  const observer = new Astronomy.Observer(latitude, longitude, 0);
  
  // Get moon phase (0-360 degrees)
  const phase = Astronomy.MoonPhase(date);
  
  // Get illumination
  const illum = Astronomy.Illumination(Astronomy.Body.Moon, date);
  const illumination = illum.phase_fraction * 100;
  
  // Get position
  const equator = Astronomy.Equator(Astronomy.Body.Moon, date, observer, true, true);
  const horizon = Astronomy.Horizon(date, observer, equator.ra, equator.dec, 'normal');
  
  // Get rise/set/transit times
  let riseTime = null;
  let setTime = null;
  let transitTime = null;
  
  try {
    const rise = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, +1, date, 1);
    if (rise) riseTime = rise.date.toISOString();
    
    const set = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, -1, date, 1);
    if (set) setTime = set.date.toISOString();
    
    const transit = Astronomy.SearchHourAngle(Astronomy.Body.Moon, observer, 0, date, +1);
    if (transit) transitTime = transit.time.date.toISOString();
  } catch (e) {
    // May not rise/set at extreme latitudes
  }
  
  return {
    phase,
    illumination,
    phaseName: getMoonPhaseName(phase),
    riseTime,
    setTime,
    transitTime,
    altitude: horizon.altitude,
    azimuth: horizon.azimuth,
    isAboveHorizon: horizon.altitude > 0,
  };
}

/**
 * Calculate the optimal observation window for DSO viewing
 * This is the time between astronomical twilight end and moonrise (or dawn)
 */
export async function calculateObservationWindow(
  latitude: number,
  longitude: number,
  date: Date = new Date()
): Promise<ObservationWindow> {
  const twilight = await calculateTwilightTimes(latitude, longitude, date);
  const moon = await calculateMoonData(latitude, longitude, date);
  
  // Default observation window
  let start = twilight.astronomicalDusk;
  let end = twilight.astronomicalDawn;
  
  // If no astronomical twilight (polar regions), use nautical
  if (!start) start = twilight.nauticalDusk;
  if (!end) end = twilight.nauticalDawn;
  
  // If still no twilight, use civil
  if (!start) start = twilight.civilDusk;
  if (!end) end = twilight.civilDawn;
  
  // Calculate moon-free hours
  let moonFreeHours = 0;
  let windowStart = start ? new Date(start) : null;
  let windowEnd = end ? new Date(end) : null;
  
  // Adjust for moon interference
  if (windowStart && windowEnd && moon.illumination > 30) {
    const moonRise = moon.riseTime ? new Date(moon.riseTime) : null;
    const moonSet = moon.setTime ? new Date(moon.setTime) : null;
    
    // If moon rises during observation window, end window at moonrise
    if (moonRise && moonRise > windowStart && moonRise < windowEnd) {
      windowEnd = moonRise;
    }
    
    // If moon sets during observation window, start window at moonset
    if (moonSet && moonSet > windowStart && moonSet < windowEnd) {
      windowStart = moonSet;
    }
  }
  
  // Calculate duration
  let durationHours = 0;
  if (windowStart && windowEnd) {
    durationHours = (windowEnd.getTime() - windowStart.getTime()) / (1000 * 60 * 60);
    if (durationHours < 0) durationHours += 24; // Crosses midnight
    moonFreeHours = durationHours;
  }
  
  // Determine quality based on duration and moon
  let quality: ObservationWindow['quality'] = 'poor';
  if (durationHours >= 6 && moon.illumination < 30) quality = 'excellent';
  else if (durationHours >= 4 && moon.illumination < 50) quality = 'good';
  else if (durationHours >= 2) quality = 'fair';
  
  // Generate description
  let description = '';
  if (durationHours === 0) {
    description = 'No suitable observation window tonight';
  } else if (moon.illumination < 30) {
    description = `${durationHours.toFixed(1)} hours of dark sky viewing`;
  } else if (moon.illumination < 70) {
    description = `${durationHours.toFixed(1)} hours, moderate moon interference`;
  } else {
    description = `${durationHours.toFixed(1)} hours, bright moon limits DSO viewing`;
  }
  
  return {
    start: windowStart?.toISOString() || '',
    end: windowEnd?.toISOString() || '',
    durationHours,
    quality,
    moonFreeHours,
    description,
  };
}

/**
 * Calculate upcoming celestial events for the next N days
 */
export async function calculateUpcomingEvents(
  latitude: number,
  longitude: number,
  days: number = 30
): Promise<CelestialEvent[]> {
  const Astronomy = await import('astronomy-engine');
  const events: CelestialEvent[] = [];
  const now = new Date();
  const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  
  // Lunar phases
  const lunarPhases = [
    { quarter: 0, name: 'New Moon' },
    { quarter: 1, name: 'First Quarter' },
    { quarter: 2, name: 'Full Moon' },
    { quarter: 3, name: 'Last Quarter' },
  ];
  
  for (const { quarter, name } of lunarPhases) {
    try {
      let searchDate = now;
      while (searchDate < endDate) {
        const moonQuarter = Astronomy.SearchMoonQuarter(searchDate);
        if (moonQuarter && moonQuarter.quarter === quarter) {
          const eventDate = moonQuarter.time.date;
          if (eventDate > now && eventDate < endDate) {
            events.push({
              type: 'lunar_phase',
              name,
              date: eventDate.toISOString(),
              description: `${name} - ${name === 'Full Moon' ? 'Bright sky, good for planets' : name === 'New Moon' ? 'Dark sky, ideal for DSOs' : 'Partial moon phase'}`,
            });
          }
          searchDate = new Date(moonQuarter.time.date.getTime() + 2 * 24 * 60 * 60 * 1000);
        } else if (moonQuarter) {
          searchDate = new Date(moonQuarter.time.date.getTime() + 2 * 24 * 60 * 60 * 1000);
        } else {
          break;
        }
      }
    } catch (e) {
      // Continue on error
    }
  }
  
  // Planet elongations and oppositions
  const planets = [
    { body: Astronomy.Body.Mercury, name: 'Mercury' },
    { body: Astronomy.Body.Venus, name: 'Venus' },
    { body: Astronomy.Body.Mars, name: 'Mars' },
    { body: Astronomy.Body.Jupiter, name: 'Jupiter' },
    { body: Astronomy.Body.Saturn, name: 'Saturn' },
  ];
  
  for (const { body, name } of planets) {
    try {
      // Search for maximum elongation (Mercury and Venus only)
      if (body === Astronomy.Body.Mercury || body === Astronomy.Body.Venus) {
        let searchDate = now;
        for (let i = 0; i < 4; i++) { // Check next few elongations
          const elong = Astronomy.SearchMaxElongation(body, searchDate);
          if (elong && elong.time.date > now && elong.time.date < endDate) {
            const visibility = String(elong.visibility).toLowerCase().includes('evening') ? 'evening' : 'morning';
            events.push({
              type: 'elongation',
              name: `${name} Greatest Elongation`,
              date: elong.time.date.toISOString(),
              description: `${name} at ${elong.elongation.toFixed(1)}° from Sun (${visibility} sky)`,
              bodies: [name],
              magnitude: elong.elongation,
            });
            searchDate = new Date(elong.time.date.getTime() + 30 * 24 * 60 * 60 * 1000);
          } else {
            break;
          }
        }
      }
      
      // Search for opposition (Mars, Jupiter, Saturn only)
      if (body === Astronomy.Body.Mars || body === Astronomy.Body.Jupiter || body === Astronomy.Body.Saturn) {
        const opposition = Astronomy.SearchRelativeLongitude(body, 180, now);
        if (opposition && opposition.date > now && opposition.date < endDate) {
          events.push({
            type: 'opposition',
            name: `${name} Opposition`,
            date: opposition.date.toISOString(),
            description: `${name} opposite the Sun - brightest and best viewing`,
            bodies: [name],
          });
        }
      }
    } catch (e) {
      // Continue on error
    }
  }
  
  // Meteor showers (hardcoded major showers)
  const meteorShowers = [
    { name: 'Quadrantids', peak: { month: 1, day: 3 }, rate: 120 },
    { name: 'Lyrids', peak: { month: 4, day: 22 }, rate: 20 },
    { name: 'Eta Aquariids', peak: { month: 5, day: 6 }, rate: 50 },
    { name: 'Perseids', peak: { month: 8, day: 12 }, rate: 100 },
    { name: 'Orionids', peak: { month: 10, day: 21 }, rate: 20 },
    { name: 'Leonids', peak: { month: 11, day: 17 }, rate: 15 },
    { name: 'Geminids', peak: { month: 12, day: 14 }, rate: 150 },
    { name: 'Ursids', peak: { month: 12, day: 22 }, rate: 10 },
  ];
  
  for (const shower of meteorShowers) {
    const peakDate = new Date(now.getFullYear(), shower.peak.month - 1, shower.peak.day);
    if (peakDate < now) {
      peakDate.setFullYear(peakDate.getFullYear() + 1);
    }
    if (peakDate < endDate) {
      events.push({
        type: 'meteor_shower',
        name: `${shower.name} Meteor Shower Peak`,
        date: peakDate.toISOString(),
        description: `Up to ${shower.rate} meteors/hour at peak`,
        magnitude: shower.rate,
      });
    }
  }
  
  // Sort events by date
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  return events;
}

/**
 * Detected events for a given observation date
 */
export interface DetectedEvents {
  isConjunction: boolean;
  isOpposition: boolean;
  isMeteorShower: boolean;
  isEclipse: boolean;
  isRareEvent: boolean;
  events: CelestialEvent[];
}

/**
 * Check if a given observation date falls within active celestial events
 * Returns information about what events are active on that date
 */
export async function detectActiveEvents(
  observationDate: Date = new Date(),
  observedObject?: string // Optional: the object being observed (e.g., "Jupiter", "M31")
): Promise<DetectedEvents> {
  const Astronomy = await import('astronomy-engine');
  
  const detected: DetectedEvents = {
    isConjunction: false,
    isOpposition: false,
    isMeteorShower: false,
    isEclipse: false,
    isRareEvent: false,
    events: [],
  };
  
  const dayMs = 24 * 60 * 60 * 1000;
  
  // Check meteor showers (within 3 days of peak)
  const meteorShowers = [
    { name: 'Quadrantids', peak: { month: 1, day: 3 }, rate: 120 },
    { name: 'Lyrids', peak: { month: 4, day: 22 }, rate: 20 },
    { name: 'Eta Aquariids', peak: { month: 5, day: 6 }, rate: 50 },
    { name: 'Perseids', peak: { month: 8, day: 12 }, rate: 100 },
    { name: 'Orionids', peak: { month: 10, day: 21 }, rate: 20 },
    { name: 'Leonids', peak: { month: 11, day: 17 }, rate: 15 },
    { name: 'Geminids', peak: { month: 12, day: 14 }, rate: 150 },
    { name: 'Ursids', peak: { month: 12, day: 22 }, rate: 10 },
  ];
  
  for (const shower of meteorShowers) {
    const peakDate = new Date(observationDate.getFullYear(), shower.peak.month - 1, shower.peak.day);
    const daysDiff = Math.abs(observationDate.getTime() - peakDate.getTime()) / dayMs;
    
    if (daysDiff <= 3) { // Within 3 days of peak
      detected.isMeteorShower = true;
      detected.events.push({
        type: 'meteor_shower',
        name: `${shower.name} Meteor Shower`,
        date: peakDate.toISOString(),
        description: `Observing during ${shower.name} meteor shower period`,
        magnitude: shower.rate,
      });
    }
  }
  
  // Check for oppositions (outer planets only, within 14 days window)
  const outerPlanets = [
    { body: Astronomy.Body.Mars, name: 'Mars' },
    { body: Astronomy.Body.Jupiter, name: 'Jupiter' },
    { body: Astronomy.Body.Saturn, name: 'Saturn' },
    { body: Astronomy.Body.Uranus, name: 'Uranus' },
    { body: Astronomy.Body.Neptune, name: 'Neptune' },
  ];
  
  for (const { body, name } of outerPlanets) {
    try {
      // Check if observed object matches this planet
      const isObservingThisPlanet = observedObject && 
        observedObject.toLowerCase() === name.toLowerCase();
      
      // Search for opposition around the observation date
      const searchStart = new Date(observationDate.getTime() - 30 * dayMs);
      const opposition = Astronomy.SearchRelativeLongitude(body, 180, searchStart);
      
      if (opposition) {
        const daysDiff = Math.abs(observationDate.getTime() - opposition.date.getTime()) / dayMs;
        
        // Within 14 days of opposition, or observing that specific planet
        if (daysDiff <= 14 && isObservingThisPlanet) {
          detected.isOpposition = true;
          detected.events.push({
            type: 'opposition',
            name: `${name} Opposition`,
            date: opposition.date.toISOString(),
            description: `${name} at opposition - best viewing conditions`,
            bodies: [name],
          });
        }
      }
    } catch (e) {
      // Continue on error
    }
  }
  
  // Check for conjunctions (planets within 5° of each other or within 5° of Moon)
  const planets = [
    { body: Astronomy.Body.Mercury, name: 'Mercury' },
    { body: Astronomy.Body.Venus, name: 'Venus' },
    { body: Astronomy.Body.Mars, name: 'Mars' },
    { body: Astronomy.Body.Jupiter, name: 'Jupiter' },
    { body: Astronomy.Body.Saturn, name: 'Saturn' },
  ];
  
  try {
    // Get positions of all planets at observation time
    const positions: { name: string; ra: number; dec: number }[] = [];
    
    for (const { body, name } of planets) {
      // Using null observer for geocentric coordinates (TypeScript requires cast)
      const equ = Astronomy.Equator(body, observationDate, null as unknown as Astronomy.Observer, true, true);
      positions.push({ name, ra: equ.ra, dec: equ.dec });
    }
    
    // Add Moon position
    const moonEqu = Astronomy.Equator(Astronomy.Body.Moon, observationDate, null as unknown as Astronomy.Observer, true, true);
    positions.push({ name: 'Moon', ra: moonEqu.ra, dec: moonEqu.dec });
    
    // Check for close conjunctions (within 5°)
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const p1 = positions[i];
        const p2 = positions[j];
        
        // Calculate angular separation
        const dRa = (p2.ra - p1.ra) * 15; // Convert hours to degrees
        const dDec = p2.dec - p1.dec;
        const separation = Math.sqrt(dRa * dRa * Math.cos(p1.dec * Math.PI / 180) ** 2 + dDec * dDec);
        
        if (separation <= 5) {
          // Check if we're observing one of these objects
          const isObservingPair = observedObject && 
            (observedObject.toLowerCase() === p1.name.toLowerCase() || 
             observedObject.toLowerCase() === p2.name.toLowerCase());
          
          if (isObservingPair) {
            detected.isConjunction = true;
            detected.events.push({
              type: 'conjunction',
              name: `${p1.name}-${p2.name} Conjunction`,
              date: observationDate.toISOString(),
              description: `${p1.name} and ${p2.name} within ${separation.toFixed(1)}° of each other`,
              bodies: [p1.name, p2.name],
              magnitude: separation,
            });
          }
        }
      }
    }
  } catch (e) {
    // Continue on error
  }
  
  // Note: Eclipse detection would require more complex calculations
  // For now, we can add lunar/solar eclipse dates manually or via API
  
  return detected;
}

/**
 * Calculate altitude curve for an object throughout the night
 */
export async function calculateAltitudeCurve(
  ra: number, // Right ascension in hours
  dec: number, // Declination in degrees
  latitude: number,
  longitude: number,
  date: Date = new Date()
): Promise<AltitudePoint[]> {
  const Astronomy = await import('astronomy-engine');
  const observer = new Astronomy.Observer(latitude, longitude, 0);
  
  const points: AltitudePoint[] = [];
  
  // Get twilight times to determine night period
  const twilight = await calculateTwilightTimes(latitude, longitude, date);
  
  // Start from sunset and go until sunrise (or 12 hours if no sunset)
  let startTime = twilight.sunset ? new Date(twilight.sunset) : new Date(date);
  startTime.setHours(18, 0, 0, 0); // Default to 6 PM
  
  let endTime = twilight.sunrise ? new Date(twilight.sunrise) : new Date(date);
  if (endTime <= startTime) {
    endTime.setDate(endTime.getDate() + 1);
  }
  endTime.setHours(6, 0, 0, 0); // Default to 6 AM next day
  
  // Calculate altitude every 15 minutes
  const interval = 15 * 60 * 1000; // 15 minutes in ms
  let currentTime = startTime;
  
  while (currentTime <= endTime) {
    const horizon = Astronomy.Horizon(currentTime, observer, ra, dec, 'normal');
    
    points.push({
      time: currentTime.toISOString(),
      altitude: horizon.altitude,
      azimuth: horizon.azimuth,
      isAboveHorizon: horizon.altitude > 0,
    });
    
    currentTime = new Date(currentTime.getTime() + interval);
  }
  
  return points;
}

/**
 * Calculate the angular separation between two celestial objects
 */
export async function calculateAngularSeparation(
  ra1: number, dec1: number,
  ra2: number, dec2: number
): Promise<number> {
  // Convert RA from hours to degrees
  const ra1Deg = ra1 * 15;
  const ra2Deg = ra2 * 15;
  
  // Convert to radians
  const ra1Rad = ra1Deg * Math.PI / 180;
  const ra2Rad = ra2Deg * Math.PI / 180;
  const dec1Rad = dec1 * Math.PI / 180;
  const dec2Rad = dec2 * Math.PI / 180;
  
  // Spherical law of cosines
  const cosAngle = Math.sin(dec1Rad) * Math.sin(dec2Rad) +
                   Math.cos(dec1Rad) * Math.cos(dec2Rad) * Math.cos(ra1Rad - ra2Rad);
  
  // Clamp to valid range to avoid NaN from acos
  const clampedCos = Math.max(-1, Math.min(1, cosAngle));
  const angle = Math.acos(clampedCos) * 180 / Math.PI;
  
  return angle;
}

/**
 * Calculate object visibility including moon interference
 */
export async function calculateObjectVisibility(
  catalogId: string,
  name: string,
  ra: number, // Right ascension in hours
  dec: number, // Declination in degrees
  latitude: number,
  longitude: number,
  date: Date = new Date()
): Promise<ObjectVisibility> {
  const Astronomy = await import('astronomy-engine');
  const observer = new Astronomy.Observer(latitude, longitude, 0);
  
  // Current position
  const horizon = Astronomy.Horizon(date, observer, ra, dec, 'normal');
  
  // Get altitude curve
  const altitudeCurve = await calculateAltitudeCurve(ra, dec, latitude, longitude, date);
  
  // Find transit (highest altitude)
  let transitAltitude: number | null = null;
  let transitTime: string | null = null;
  let maxAlt = -90;
  
  for (const point of altitudeCurve) {
    if (point.altitude > maxAlt) {
      maxAlt = point.altitude;
      transitAltitude = point.altitude;
      transitTime = point.time;
    }
  }
  
  // Find rise and set times (when altitude crosses 0)
  let riseTime: string | null = null;
  let setTime: string | null = null;
  
  for (let i = 1; i < altitudeCurve.length; i++) {
    const prev = altitudeCurve[i - 1];
    const curr = altitudeCurve[i];
    
    // Rising
    if (prev.altitude <= 0 && curr.altitude > 0 && !riseTime) {
      riseTime = curr.time;
    }
    
    // Setting
    if (prev.altitude > 0 && curr.altitude <= 0 && !setTime) {
      setTime = curr.time;
    }
  }
  
  // Calculate best viewing window (when above 30° altitude)
  let bestViewingStart: string | null = null;
  let bestViewingEnd: string | null = null;
  
  for (let i = 0; i < altitudeCurve.length; i++) {
    const point = altitudeCurve[i];
    if (point.altitude >= 30 && !bestViewingStart) {
      bestViewingStart = point.time;
    }
    if (point.altitude >= 30) {
      bestViewingEnd = point.time;
    }
  }
  
  // Calculate moon separation
  const moonData = await calculateMoonData(latitude, longitude, date);
  const moonEquator = Astronomy.Equator(Astronomy.Body.Moon, date, observer, true, true);
  const moonSeparation = await calculateAngularSeparation(ra, dec, moonEquator.ra, moonEquator.dec);
  
  // Determine moon interference level
  let moonInterference: ObjectVisibility['moonInterference'] = 'none';
  if (moonData.illumination > 30) {
    if (moonSeparation < 30) moonInterference = 'high';
    else if (moonSeparation < 60) moonInterference = 'moderate';
    else if (moonSeparation < 90) moonInterference = 'low';
  }
  
  return {
    catalogId,
    name,
    riseTime,
    setTime,
    transitTime,
    transitAltitude,
    bestViewingStart,
    bestViewingEnd,
    currentAltitude: horizon.altitude,
    currentAzimuth: horizon.azimuth,
    isVisible: horizon.altitude > 0,
    altitudeCurve,
    moonSeparation,
    moonInterference,
  };
}

/**
 * Get complete tonight summary for dashboard
 */
export async function getTonightSummary(
  latitude: number,
  longitude: number,
  date: Date = new Date()
): Promise<TonightSummary> {
  const [twilight, moon, observationWindow, upcomingEvents] = await Promise.all([
    calculateTwilightTimes(latitude, longitude, date),
    calculateMoonData(latitude, longitude, date),
    calculateObservationWindow(latitude, longitude, date),
    calculateUpcomingEvents(latitude, longitude, 14), // Next 2 weeks
  ]);
  
  // Calculate planet visibility
  const Astronomy = await import('astronomy-engine');
  const observer = new Astronomy.Observer(latitude, longitude, 0);
  
  const planets = [
    { body: Astronomy.Body.Mercury, name: 'Mercury' },
    { body: Astronomy.Body.Venus, name: 'Venus' },
    { body: Astronomy.Body.Mars, name: 'Mars' },
    { body: Astronomy.Body.Jupiter, name: 'Jupiter' },
    { body: Astronomy.Body.Saturn, name: 'Saturn' },
  ];
  
  const planetVisibility = await Promise.all(
    planets.map(async ({ body, name }) => {
      const equator = Astronomy.Equator(body, date, observer, true, true);
      const horizon = Astronomy.Horizon(date, observer, equator.ra, equator.dec, 'normal');
      
      let bestTime: string | null = null;
      try {
        const transit = Astronomy.SearchHourAngle(body, observer, 0, date, +1);
        if (transit) bestTime = transit.time.date.toISOString();
      } catch (e) {}
      
      return {
        name,
        isVisible: horizon.altitude > 10, // Above 10° is reasonably visible
        bestTime,
        altitude: horizon.altitude,
      };
    })
  );
  
  return {
    twilight,
    moon,
    observationWindow,
    upcomingEvents: upcomingEvents.slice(0, 5), // Top 5 events
    planetVisibility,
  };
}

/**
 * Parse RA string (e.g., "05h 34m") to hours (decimal)
 */
export function parseRA(ra: string | null | undefined): number | null {
  if (!ra) return null;
  
  // Try format: "05h 34m" or "05h34m"
  const match = ra.match(/(\d+)h\s*(\d+)?m?/i);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    return hours + minutes / 60;
  }
  
  // Try format: "05:34" or "5.567"
  const colonMatch = ra.match(/(\d+):(\d+)/);
  if (colonMatch) {
    return parseInt(colonMatch[1], 10) + parseInt(colonMatch[2], 10) / 60;
  }
  
  // Try plain number
  const num = parseFloat(ra);
  return isNaN(num) ? null : num;
}

/**
 * Parse Dec string (e.g., "+22° 01'" or "-05° 30'") to degrees (decimal)
 */
export function parseDec(dec: string | null | undefined): number | null {
  if (!dec) return null;
  
  // Try format: "+22° 01'" or "22°01'" or "-05° 30'"
  const match = dec.match(/([+-]?\d+)[°]\s*(\d+)?['\u2032]?/);
  if (match) {
    const degrees = parseInt(match[1], 10);
    const arcminutes = match[2] ? parseInt(match[2], 10) : 0;
    const sign = degrees >= 0 ? 1 : -1;
    return degrees + sign * arcminutes / 60;
  }
  
  // Try format: "+22:01" or plain number
  const colonMatch = dec.match(/([+-]?\d+):(\d+)/);
  if (colonMatch) {
    const degrees = parseInt(colonMatch[1], 10);
    const sign = degrees >= 0 ? 1 : -1;
    return degrees + sign * parseInt(colonMatch[2], 10) / 60;
  }
  
  // Try plain number
  const num = parseFloat(dec);
  return isNaN(num) ? null : num;
}

/**
 * Get the current month abbreviation
 */
export function getCurrentMonthAbbr(): string {
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  return months[new Date().getMonth()];
}

/**
 * Calculate visibility score for an object (0-100)
 * Based on max altitude and overlap with astronomical darkness
 */
export interface QuickVisibilityResult {
  maxAltitude: number;
  transitTime: string | null;
  riseTime: string | null;
  setTime: string | null;
  isVisibleTonight: boolean;
  darknessOverlapMinutes: number;
  moonSeparation: number;
  moonInterference: 'none' | 'low' | 'moderate' | 'high';
}

/**
 * Calculate quick visibility data for an object without full altitude curve
 * More efficient for batch processing
 */
export async function calculateQuickVisibility(
  ra: number,
  dec: number,
  latitude: number,
  longitude: number,
  astronomicalDusk: Date | null,
  astronomicalDawn: Date | null,
  moonRA: number,
  moonDec: number,
  moonIllumination: number,
  date: Date = new Date()
): Promise<QuickVisibilityResult> {
  const Astronomy = await import('astronomy-engine');
  const observer = new Astronomy.Observer(latitude, longitude, 0);
  
  // Properly handle overnight spans
  // Astronomical dusk is evening (e.g., 9 PM), dawn is next morning (e.g., 5 AM)
  let nightStart: Date;
  let nightEnd: Date;
  
  if (astronomicalDusk && astronomicalDawn) {
    nightStart = new Date(astronomicalDusk);
    nightEnd = new Date(astronomicalDawn);
    // If dawn appears to be before dusk, it's the next day
    if (nightEnd <= nightStart) {
      nightEnd.setDate(nightEnd.getDate() + 1);
    }
  } else {
    // Fallback: assume 7 PM to 5 AM next day
    nightStart = new Date(date);
    nightStart.setHours(19, 0, 0, 0);
    nightEnd = new Date(date);
    nightEnd.setDate(nightEnd.getDate() + 1);
    nightEnd.setHours(5, 0, 0, 0);
  }
  
  // Track max altitude during darkness separately for better scoring
  let maxAltitude = -90;
  let maxAltitudeDuringDarkness = -90;
  let transitTime: string | null = null;
  let transitTimeDuringDarkness: string | null = null;
  
  // Sample every hour through the night for better accuracy
  const sampleIntervalMs = 60 * 60 * 1000; // 1 hour
  let darknessOverlapMinutes = 0;
  let isAboveHorizonDuringDarkness = false;
  
  for (let t = new Date(nightStart); t <= nightEnd; t = new Date(t.getTime() + sampleIntervalMs)) {
    const horizon = Astronomy.Horizon(t, observer, ra, dec, 'normal');
    
    // Track overall max altitude
    if (horizon.altitude > maxAltitude) {
      maxAltitude = horizon.altitude;
      transitTime = t.toISOString();
    }
    
    // Check if above horizon during darkness (already within loop bounds)
    if (horizon.altitude > 0) {
      isAboveHorizonDuringDarkness = true;
      darknessOverlapMinutes += 60; // 1-hour sampling interval
      
      // Track max altitude during darkness specifically
      if (horizon.altitude > maxAltitudeDuringDarkness) {
        maxAltitudeDuringDarkness = horizon.altitude;
        transitTimeDuringDarkness = t.toISOString();
      }
    }
  }
  
  // Use dark-time max altitude if available, otherwise use overall
  const effectiveMaxAltitude = maxAltitudeDuringDarkness > -90 ? maxAltitudeDuringDarkness : maxAltitude;
  const effectiveTransitTime = transitTimeDuringDarkness || transitTime;
  
  // Calculate moon separation
  const moonSeparation = await calculateAngularSeparation(ra, dec, moonRA, moonDec);
  
  // Determine moon interference
  let moonInterference: QuickVisibilityResult['moonInterference'] = 'none';
  if (moonIllumination > 30) {
    if (moonSeparation < 30) moonInterference = 'high';
    else if (moonSeparation < 60) moonInterference = 'moderate';
    else if (moonSeparation < 90) moonInterference = 'low';
  }
  
  return {
    maxAltitude: effectiveMaxAltitude,
    transitTime: effectiveTransitTime,
    riseTime: null,
    setTime: null,
    isVisibleTonight: effectiveMaxAltitude > 10 && isAboveHorizonDuringDarkness,
    darknessOverlapMinutes: Math.min(darknessOverlapMinutes, 600), // Cap at 10 hours
    moonSeparation,
    moonInterference,
  };
}

/**
 * Batch context for recommendation calculations
 * Pre-computed data reused across all objects
 */
export interface RecommendationContext {
  latitude: number;
  longitude: number;
  date: Date;
  astronomicalDusk: Date | null;
  astronomicalDawn: Date | null;
  moonRA: number;
  moonDec: number;
  moonIllumination: number;
  currentMonth: string;
  // User's equipment capabilities
  maxMagnification: number;
  minMagnification: number;
  largestAperture: number;
  // Tonight's conditions (if logged)
  totalScore: number | null;
  planetScore: number | null;
  dsoScore: number | null;
  powerClass: 'HIGH' | 'MID' | 'LOW' | null;
}

/**
 * Build recommendation context from location and conditions data
 */
export async function buildRecommendationContext(
  latitude: number,
  longitude: number,
  telescopes: { aperture: number; focalLength: number }[],
  eyepieces: { focalLength: number }[],
  nightConditions: { totalScore?: number; planetScore?: number; dsoScore?: number; powerClass?: string } | null,
  date: Date = new Date()
): Promise<RecommendationContext> {
  const Astronomy = await import('astronomy-engine');
  const observer = new Astronomy.Observer(latitude, longitude, 0);
  
  // Get twilight times
  const twilight = await calculateTwilightTimes(latitude, longitude, date);
  
  // Get moon data
  const moonEquator = Astronomy.Equator(Astronomy.Body.Moon, date, observer, true, true);
  const moonIllum = Astronomy.Illumination(Astronomy.Body.Moon, date);
  
  // Calculate equipment capabilities
  let maxMagnification = 100; // Default
  let minMagnification = 20;
  let largestAperture = 100; // mm
  
  if (telescopes.length > 0 && eyepieces.length > 0) {
    for (const scope of telescopes) {
      if (scope.aperture > largestAperture) {
        largestAperture = scope.aperture;
      }
      for (const ep of eyepieces) {
        const mag = scope.focalLength / ep.focalLength;
        if (mag > maxMagnification) maxMagnification = mag;
        if (mag < minMagnification) minMagnification = mag;
      }
    }
  }
  
  return {
    latitude,
    longitude,
    date,
    astronomicalDusk: twilight.astronomicalDusk ? new Date(twilight.astronomicalDusk) : null,
    astronomicalDawn: twilight.astronomicalDawn ? new Date(twilight.astronomicalDawn) : null,
    moonRA: moonEquator.ra,
    moonDec: moonEquator.dec,
    moonIllumination: moonIllum.phase_fraction * 100,
    currentMonth: getCurrentMonthAbbr(),
    maxMagnification,
    minMagnification,
    largestAperture,
    totalScore: nightConditions?.totalScore ?? null,
    planetScore: nightConditions?.planetScore ?? null,
    dsoScore: nightConditions?.dsoScore ?? null,
    powerClass: (nightConditions?.powerClass as 'HIGH' | 'MID' | 'LOW') ?? null,
  };
}

/**
 * Score weights for recommendation algorithm
 */
const SCORE_WEIGHTS = {
  visibility: 0.30,    // 30% - How well can you see it tonight
  moon: 0.15,          // 15% - Moon interference
  conditions: 0.20,    // 20% - Match with logged conditions
  equipment: 0.15,     // 15% - Equipment suitability
  freshness: 0.10,     // 10% - Not recently observed
  seasonal: 0.10,      // 10% - Best month match
};

/**
 * Calculate recommendation score for a single object
 */
export async function calculateObjectRecommendation(
  object: {
    id: number;
    catalogId: string;
    name: string;
    category: string;
    rightAscension: string | null;
    declination: string | null;
    magnitude: number | null;
    bestMonths: string[] | null;
    moonInterference: number | null;
    difficulty: string | null;
  },
  context: RecommendationContext,
  observationHistory: { lastObserved: Date | null; count: number }
): Promise<{
  totalScore: number;
  visibilityScore: number;
  moonScore: number;
  conditionsScore: number;
  equipmentScore: number;
  freshnessScore: number;
  seasonalScore: number;
  visibility: QuickVisibilityResult | null;
  rationale: string[];
}> {
  const rationale: string[] = [];
  
  // Parse coordinates
  const ra = parseRA(object.rightAscension);
  const dec = parseDec(object.declination);
  
  // Default scores
  let visibilityScore = 0;
  let moonScore = 100; // Assume no interference by default
  let conditionsScore = 50; // Neutral if no conditions logged
  let equipmentScore = 50; // Neutral if no equipment match data
  let freshnessScore = 100; // Full score if never observed
  let seasonalScore = 50; // Neutral if no seasonal data
  
  let visibility: QuickVisibilityResult | null = null;
  
  // === VISIBILITY SCORE ===
  // Planets always get visibility calculated dynamically
  const isPlanet = object.category === 'planet' || object.category === 'moon';
  
  if (ra !== null && dec !== null) {
    visibility = await calculateQuickVisibility(
      ra, dec,
      context.latitude, context.longitude,
      context.astronomicalDusk, context.astronomicalDawn,
      context.moonRA, context.moonDec, context.moonIllumination,
      context.date
    );
    
    // Score based on max altitude (0° = 0 points, 90° = 100 points)
    // Objects below 20° get heavily penalized
    if (visibility.maxAltitude <= 0) {
      visibilityScore = 0;
      rationale.push('Not visible from your location tonight');
    } else if (visibility.maxAltitude < 20) {
      visibilityScore = visibility.maxAltitude * 2;
      rationale.push(`Low altitude (${visibility.maxAltitude.toFixed(0)}°) - challenging viewing`);
    } else if (visibility.maxAltitude < 40) {
      visibilityScore = 40 + (visibility.maxAltitude - 20);
      rationale.push(`Good altitude (${visibility.maxAltitude.toFixed(0)}°)`);
    } else {
      visibilityScore = 60 + (visibility.maxAltitude - 40);
      if (visibilityScore > 100) visibilityScore = 100;
      rationale.push(`Excellent altitude (${visibility.maxAltitude.toFixed(0)}°)`);
    }
    
    // Bonus for darkness overlap
    if (visibility.darknessOverlapMinutes > 240) {
      visibilityScore = Math.min(100, visibilityScore + 10);
      rationale.push('Visible for most of the night');
    }
    
    // === MOON SCORE ===
    moonScore = calculateMoonImpactScore(
      visibility.moonSeparation,
      context.moonIllumination,
      object.moonInterference ?? 2,
      isPlanet
    );
    
    if (visibility.moonInterference === 'high') {
      rationale.push('High moon interference - consider waiting for darker skies');
    } else if (visibility.moonInterference === 'none' && !isPlanet) {
      rationale.push('Moon-free sky - great for deep sky viewing');
    }
  } else if (isPlanet) {
    // For planets without stored coordinates, calculate dynamically
    visibilityScore = 70; // Assume reasonable visibility for planets
    rationale.push('Planet - check ephemeris for exact position');
  }
  
  // === CONDITIONS SCORE ===
  // Note: context scores are on 0-10 scale, we need to convert to 0-100 for UI
  if (context.totalScore !== null) {
    if (isPlanet) {
      // Planets prefer stable seeing (planet score is 0-5, so multiply by 20)
      const rawScore = context.planetScore ?? context.totalScore;
      conditionsScore = Math.min(100, rawScore * 10);
      if (conditionsScore >= 70) {
        rationale.push('Tonight\'s conditions favor planetary viewing');
      }
    } else {
      // DSOs prefer dark skies (DSO score is 0-7, so multiply by ~14, or use totalScore * 10)
      const rawScore = context.dsoScore ?? context.totalScore;
      conditionsScore = Math.min(100, rawScore * 10);
      if (conditionsScore >= 70) {
        rationale.push('Tonight\'s conditions favor deep sky objects');
      }
    }
  }
  
  // === EQUIPMENT SCORE ===
  if (object.magnitude !== null) {
    equipmentScore = calculateEquipmentScore(
      object.magnitude,
      context.largestAperture,
      context.maxMagnification,
      object.difficulty ?? 'moderate'
    );
    
    if (equipmentScore >= 80) {
      rationale.push('Well-suited to your equipment');
    } else if (equipmentScore < 40) {
      rationale.push('May be challenging with your current equipment');
    }
  }
  
  // === FRESHNESS SCORE ===
  if (observationHistory.count > 0 && observationHistory.lastObserved) {
    const daysSinceObserved = (Date.now() - observationHistory.lastObserved.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceObserved < 7) {
      freshnessScore = 20; // Recently observed
      rationale.push('Observed recently - try something new?');
    } else if (daysSinceObserved < 30) {
      freshnessScore = 50;
    } else if (daysSinceObserved < 90) {
      freshnessScore = 75;
    } else {
      freshnessScore = 90; // Long time since observed
      rationale.push('Haven\'t observed in a while');
    }
  } else {
    freshnessScore = 100;
    if (observationHistory.count === 0) {
      rationale.push('Never observed - a new target!');
    }
  }
  
  // === SEASONAL SCORE ===
  if (object.bestMonths && object.bestMonths.length > 0) {
    if (object.bestMonths.includes(context.currentMonth)) {
      seasonalScore = 100;
      rationale.push('Peak season for this object');
    } else {
      // Check if we're within 1 month of a best month
      const monthIndex = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const currentIdx = monthIndex.indexOf(context.currentMonth);
      
      let nearBestMonth = false;
      for (const best of object.bestMonths) {
        const bestIdx = monthIndex.indexOf(best);
        const diff = Math.min(
          Math.abs(currentIdx - bestIdx),
          12 - Math.abs(currentIdx - bestIdx)
        );
        if (diff === 1) {
          nearBestMonth = true;
          seasonalScore = 70;
          break;
        }
      }
      
      if (!nearBestMonth) {
        seasonalScore = 30;
      }
    }
  } else {
    seasonalScore = 70; // No seasonal data, assume reasonable
  }
  
  // === CALCULATE TOTAL SCORE ===
  const totalScore = Math.round(
    visibilityScore * SCORE_WEIGHTS.visibility +
    moonScore * SCORE_WEIGHTS.moon +
    conditionsScore * SCORE_WEIGHTS.conditions +
    equipmentScore * SCORE_WEIGHTS.equipment +
    freshnessScore * SCORE_WEIGHTS.freshness +
    seasonalScore * SCORE_WEIGHTS.seasonal
  );
  
  return {
    totalScore,
    visibilityScore: Math.round(visibilityScore),
    moonScore: Math.round(moonScore),
    conditionsScore: Math.round(conditionsScore),
    equipmentScore: Math.round(equipmentScore),
    freshnessScore: Math.round(freshnessScore),
    seasonalScore: Math.round(seasonalScore),
    visibility,
    rationale,
  };
}

/**
 * Calculate moon impact score (0-100, higher = less interference)
 */
function calculateMoonImpactScore(
  separation: number,
  illumination: number,
  objectSensitivity: number, // 0-5 scale from schema
  isPlanet: boolean
): number {
  // Planets are less affected by moon
  if (isPlanet) {
    return 90; // Minimal penalty for planets
  }
  
  // Low illumination = low impact
  if (illumination < 20) {
    return 100;
  }
  
  // Calculate base score from separation
  let score = 100;
  
  if (separation < 30) {
    score = 30;
  } else if (separation < 60) {
    score = 50 + (separation - 30);
  } else if (separation < 90) {
    score = 70 + (separation - 60) * 0.5;
  } else {
    score = 90;
  }
  
  // Adjust for illumination
  const illumPenalty = (illumination / 100) * 20;
  score -= illumPenalty;
  
  // Adjust for object sensitivity
  const sensitivityPenalty = (objectSensitivity / 5) * 15;
  score -= sensitivityPenalty;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate equipment suitability score (0-100)
 */
function calculateEquipmentScore(
  magnitude: number,
  apertureSize: number, // mm
  maxMagnification: number,
  difficulty: string
): number {
  // Limiting magnitude based on aperture (approximate formula)
  // Limiting mag ≈ 2 + 5 * log10(aperture_mm)
  const limitingMag = 2 + 5 * Math.log10(apertureSize);
  
  // If object is too faint for the aperture
  if (magnitude > limitingMag) {
    const diff = magnitude - limitingMag;
    if (diff > 3) return 10; // Very difficult
    if (diff > 2) return 30;
    if (diff > 1) return 50;
    return 70;
  }
  
  // Object is within capabilities
  let score = 85;
  
  // Bonus for bright objects
  if (magnitude < 6) {
    score = 100;
  } else if (magnitude < 8) {
    score = 95;
  }
  
  // Penalty for difficult objects
  if (difficulty === 'difficult') {
    score -= 15;
  } else if (difficulty === 'easy') {
    score += 5;
  }
  
  return Math.min(100, Math.max(0, score));
}

/**
 * Calculate altitude-based equipment adjustment factor
 * Lower altitudes require more magnification compensation due to atmospheric effects
 */
export function getAltitudeEquipmentFactor(altitude: number): {
  magnificationAdjustment: number;
  seeingPenalty: number;
  recommendation: string;
} {
  if (altitude >= 60) {
    return {
      magnificationAdjustment: 1.0,
      seeingPenalty: 0,
      recommendation: 'Excellent altitude - use full magnification',
    };
  } else if (altitude >= 40) {
    return {
      magnificationAdjustment: 0.9,
      seeingPenalty: 0.5,
      recommendation: 'Good altitude - slight seeing effects possible',
    };
  } else if (altitude >= 25) {
    return {
      magnificationAdjustment: 0.75,
      seeingPenalty: 1,
      recommendation: 'Moderate altitude - reduce magnification for better views',
    };
  } else if (altitude >= 15) {
    return {
      magnificationAdjustment: 0.6,
      seeingPenalty: 2,
      recommendation: 'Low altitude - significant atmospheric distortion, use low power',
    };
  } else {
    return {
      magnificationAdjustment: 0.5,
      seeingPenalty: 3,
      recommendation: 'Very low altitude - wait for object to rise higher if possible',
    };
  }
}
