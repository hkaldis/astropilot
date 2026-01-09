export interface EquatorialCoords {
  ra: number;
  dec: number;
}

export interface HorizontalCoords {
  altitude: number;
  azimuth: number;
}

export interface VisibilityWindow {
  riseTime: Date | null;
  transitTime: Date | null;
  setTime: Date | null;
  maxAltitude: number;
  isCircumpolar: boolean;
  neverRises: boolean;
  currentAltitude: number;
  currentAzimuth: number;
}

/**
 * Parse Right Ascension string to degrees
 * Supports formats:
 * - "05h 34m" or "05h34m" (hours/minutes)
 * - "05h 34m 12s" or "05h34m12s" (hours/minutes/seconds)
 * - "05:34" or "05:34:12" (colon-separated, assumed hours)
 * - "83.63°" or "83.63d" (explicit degrees)
 * - "5.567" (decimal hours if <= 24, otherwise degrees)
 * Returns RA in degrees (0-360)
 */
function parseRightAscension(ra: string): number {
  if (!ra || typeof ra !== 'string') return 0;
  
  // Try format: "05h 34m 12s" or "05h 34m" or "05h34m12s" or "05h34m"
  const hmsMatch = ra.match(/(\d+)h\s*(\d+)?m?\s*(\d+(?:\.\d+)?)?s?/i);
  if (hmsMatch) {
    const hours = parseInt(hmsMatch[1], 10);
    const minutes = hmsMatch[2] ? parseInt(hmsMatch[2], 10) : 0;
    const seconds = hmsMatch[3] ? parseFloat(hmsMatch[3]) : 0;
    return (hours + minutes / 60 + seconds / 3600) * 15;
  }
  
  // Try format with explicit degree marker: "83.63°" or "83.63d" or "83.63deg"
  const degMatch = ra.match(/(-?[\d.]+)\s*[°d]/i);
  if (degMatch) {
    const degrees = parseFloat(degMatch[1]);
    // Flag invalid values
    if (degrees < 0 || degrees > 360) {
      console.warn(`Invalid RA value: ${degrees}° out of range [0, 360]`);
      return NaN;
    }
    return degrees;
  }
  
  // Try format: "05:34:12" or "05:34" (colon-separated, assumed hours)
  const colonMatch = ra.match(/(\d+):(\d+)(?::(\d+(?:\.\d+)?))?/);
  if (colonMatch) {
    const hours = parseInt(colonMatch[1], 10);
    const minutes = parseInt(colonMatch[2], 10);
    const seconds = colonMatch[3] ? parseFloat(colonMatch[3]) : 0;
    return (hours + minutes / 60 + seconds / 3600) * 15;
  }
  
  // Try plain number
  const num = parseFloat(ra);
  if (!isNaN(num)) {
    // If value > 24, it's likely already in degrees
    // RA in hours is 0-24, RA in degrees is 0-360
    if (num > 24) {
      // Flag invalid values > 360 as errors (bad catalog data)
      if (num > 360) {
        console.warn(`Invalid RA value: ${num} exceeds 360°`);
        return NaN;
      }
      // Already in degrees
      return num;
    }
    // Negative values are invalid
    if (num < 0) {
      console.warn(`Invalid RA value: ${num} is negative`);
      return NaN;
    }
    // Assume decimal hours, convert to degrees
    return num * 15;
  }
  
  return 0;
}

/**
 * Parse Declination string to degrees
 * Supports formats:
 * - "+22° 01'" or "+22°01'" (degrees/arcminutes with degree symbol)
 * - "-20d 00m" (degrees/arcminutes with d/m notation)
 * - "-05° 30' 15\"" (degrees/arcminutes/arcseconds)
 * - "+22:01" or "+22:01:15" (colon-separated)
 * - "22.5" or "-5.5" (decimal degrees)
 * - Plain number (assumed to be decimal degrees)
 * Returns Dec in degrees (-90 to +90)
 */
function parseDeclination(dec: string): number {
  if (!dec || typeof dec !== 'string') return 0;
  
  // Try format: "+22° 01' 15\"" or "+22° 01'" or "22°01'" with various quote styles
  // Also handles "d" for degree marker (e.g., "-20d 00m")
  const dmsMatch = dec.match(/([+-]?\d+)[°d]\s*(\d+)?['\u2032m]?\s*(\d+(?:\.\d+)?)?["\u2033s]?/i);
  if (dmsMatch) {
    const degrees = parseInt(dmsMatch[1], 10);
    const arcminutes = dmsMatch[2] ? parseInt(dmsMatch[2], 10) : 0;
    const arcseconds = dmsMatch[3] ? parseFloat(dmsMatch[3]) : 0;
    const sign = dec.trim().startsWith('-') || degrees < 0 ? -1 : 1;
    const absDegrees = Math.abs(degrees);
    const result = sign * (absDegrees + arcminutes / 60 + arcseconds / 3600);
    // Validate range
    if (result < -90 || result > 90) {
      console.warn(`Invalid declination value: ${result}° out of range [-90, +90]`);
      return NaN;
    }
    return result;
  }
  
  // Try format: "+22:01:15" or "+22:01" or "22:01" (colon-separated)
  const colonMatch = dec.match(/([+-]?\d+):(\d+)(?::(\d+(?:\.\d+)?))?/);
  if (colonMatch) {
    const degrees = parseInt(colonMatch[1], 10);
    const arcminutes = parseInt(colonMatch[2], 10);
    const arcseconds = colonMatch[3] ? parseFloat(colonMatch[3]) : 0;
    const sign = dec.trim().startsWith('-') || degrees < 0 ? -1 : 1;
    const absDegrees = Math.abs(degrees);
    const result = sign * (absDegrees + arcminutes / 60 + arcseconds / 3600);
    // Validate range
    if (result < -90 || result > 90) {
      console.warn(`Invalid declination value: ${result}° out of range [-90, +90]`);
      return NaN;
    }
    return result;
  }
  
  // Try plain number (decimal degrees)
  const num = parseFloat(dec);
  if (!isNaN(num)) {
    // Validate range
    if (num < -90 || num > 90) {
      console.warn(`Invalid declination value: ${num}° out of range [-90, +90]`);
      return NaN;
    }
    return num;
  }
  
  return 0;
}

function toRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}

function toDegrees(radians: number): number {
  return radians * 180 / Math.PI;
}

/**
 * Calculate angular separation between two celestial objects in degrees
 * Uses the spherical law of cosines
 */
export function calculateAngularSeparation(
  ra1: number,  // degrees
  dec1: number, // degrees
  ra2: number,  // degrees
  dec2: number  // degrees
): number {
  const ra1Rad = toRadians(ra1);
  const dec1Rad = toRadians(dec1);
  const ra2Rad = toRadians(ra2);
  const dec2Rad = toRadians(dec2);
  
  const cosSep = Math.sin(dec1Rad) * Math.sin(dec2Rad) +
                 Math.cos(dec1Rad) * Math.cos(dec2Rad) * Math.cos(ra1Rad - ra2Rad);
  
  // Clamp to valid range for acos
  const clampedCos = Math.max(-1, Math.min(1, cosSep));
  return toDegrees(Math.acos(clampedCos));
}

/**
 * Calculate moon separation from an object given object's RA/Dec strings and moon's RA/Dec in degrees
 */
export function calculateMoonSeparationFromStrings(
  objectRA: string,
  objectDec: string,
  moonRA: number,  // degrees
  moonDec: number  // degrees
): number | null {
  const ra = parseRightAscension(objectRA);
  const dec = parseDeclination(objectDec);
  if (isNaN(ra) || isNaN(dec)) return null;
  return calculateAngularSeparation(ra, dec, moonRA, moonDec);
}

function getJulianDate(date: Date): number {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate() + 
    (date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600) / 24;
  
  let y = year;
  let m = month;
  if (month <= 2) {
    y--;
    m += 12;
  }
  
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
}

function getLocalSiderealTime(date: Date, longitude: number): number {
  const jd = getJulianDate(date);
  const t = (jd - 2451545.0) / 36525;
  
  let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545) + 
             0.000387933 * t * t - t * t * t / 38710000;
  
  gmst = gmst % 360;
  if (gmst < 0) gmst += 360;
  
  let lst = gmst + longitude;
  lst = lst % 360;
  if (lst < 0) lst += 360;
  
  return lst;
}

function equatorialToHorizontal(
  ra: number,
  dec: number,
  latitude: number,
  lst: number
): HorizontalCoords {
  const ha = lst - ra;
  const haRad = toRadians(ha);
  const decRad = toRadians(dec);
  const latRad = toRadians(latitude);
  
  const sinAlt = Math.sin(decRad) * Math.sin(latRad) + 
                 Math.cos(decRad) * Math.cos(latRad) * Math.cos(haRad);
  const altitude = toDegrees(Math.asin(sinAlt));
  
  const cosAz = (Math.sin(decRad) - Math.sin(latRad) * sinAlt) / 
                (Math.cos(latRad) * Math.cos(toRadians(altitude)));
  let azimuth = toDegrees(Math.acos(Math.max(-1, Math.min(1, cosAz))));
  
  if (Math.sin(haRad) > 0) {
    azimuth = 360 - azimuth;
  }
  
  return { altitude, azimuth };
}

function findRiseSetTimes(
  ra: number,
  dec: number,
  latitude: number,
  longitude: number,
  date: Date,
  horizonAltitude: number = 0
): { riseTime: Date | null; transitTime: Date | null; setTime: Date | null } {
  const decRad = toRadians(dec);
  const latRad = toRadians(latitude);
  const h0Rad = toRadians(horizonAltitude);
  
  const cosH0 = (Math.sin(h0Rad) - Math.sin(latRad) * Math.sin(decRad)) / 
                (Math.cos(latRad) * Math.cos(decRad));
  
  // cosH0 > 1 means object never rises (too far south/north for observer)
  if (cosH0 > 1) return { riseTime: null, transitTime: null, setTime: null };
  
  // cosH0 < -1 means object is circumpolar (always above horizon)
  // Still calculate transit time using proper fractional hour handling
  if (cosH0 < -1) {
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const lst = getLocalSiderealTime(startOfDay, longitude);
    const ha = ra - lst;
    let transitHours = ha / 15;
    if (transitHours < 0) transitHours += 24;
    if (transitHours > 24) transitHours -= 24;
    
    // Use milliseconds to preserve fractional hours accurately
    const transitTime = new Date(startOfDay.getTime() + transitHours * 3600 * 1000);
    
    return { riseTime: null, transitTime, setTime: null };
  }
  
  const H0 = toDegrees(Math.acos(cosH0));
  
  const startOfDay = new Date(date);
  startOfDay.setUTCHours(0, 0, 0, 0);
  
  const lst0 = getLocalSiderealTime(startOfDay, longitude);
  
  let transitLst = ra;
  let transitHours = (transitLst - lst0) / 15;
  if (transitHours < 0) transitHours += 24;
  if (transitHours > 24) transitHours -= 24;
  
  let riseHours = transitHours - H0 / 15;
  let setHours = transitHours + H0 / 15;
  
  if (riseHours < 0) riseHours += 24;
  if (setHours > 24) setHours -= 24;
  
  // Use milliseconds to preserve fractional hours accurately
  const startMs = startOfDay.getTime();
  const transitTime = new Date(startMs + transitHours * 3600 * 1000);
  const riseTime = new Date(startMs + riseHours * 3600 * 1000);
  const setTime = new Date(startMs + setHours * 3600 * 1000);
  
  return { riseTime, transitTime, setTime };
}

export function calculateVisibility(
  raString: string,
  decString: string,
  latitude: number,
  longitude: number,
  date: Date = new Date()
): VisibilityWindow {
  const ra = parseRightAscension(raString);
  const dec = parseDeclination(decString);
  
  const lst = getLocalSiderealTime(date, longitude);
  const { altitude: currentAltitude, azimuth: currentAzimuth } = 
    equatorialToHorizontal(ra, dec, latitude, lst);
  
  const decRad = toRadians(dec);
  const latRad = toRadians(latitude);
  
  const isCircumpolar = dec > 90 - Math.abs(latitude) && latitude > 0 ||
                        dec < -90 + Math.abs(latitude) && latitude < 0;
  
  const neverRises = dec < -90 + Math.abs(latitude) && latitude > 0 ||
                     dec > 90 - Math.abs(latitude) && latitude < 0;
  
  const maxAltitude = 90 - Math.abs(latitude - dec);
  
  const times = findRiseSetTimes(ra, dec, latitude, longitude, date, -0.5667);
  
  return {
    riseTime: times.riseTime,
    transitTime: times.transitTime,
    setTime: times.setTime,
    maxAltitude,
    isCircumpolar,
    neverRises,
    currentAltitude,
    currentAzimuth,
  };
}

export function getAltitudeQuality(altitude: number): {
  quality: "excellent" | "good" | "fair" | "poor" | "below_horizon";
  description: string;
} {
  if (altitude < 0) {
    return { quality: "below_horizon", description: "Below horizon" };
  }
  if (altitude >= 60) {
    return { quality: "excellent", description: "Excellent viewing - near zenith" };
  }
  if (altitude >= 40) {
    return { quality: "good", description: "Good viewing conditions" };
  }
  if (altitude >= 20) {
    return { quality: "fair", description: "Fair - some atmospheric distortion" };
  }
  return { quality: "poor", description: "Poor - heavy atmospheric distortion" };
}

export function formatCoordinates(ra: string, dec: string): {
  raFormatted: string;
  decFormatted: string;
} {
  return {
    raFormatted: ra,
    decFormatted: dec,
  };
}

export function getCardinalDirection(azimuth: number): string {
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", 
                     "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const index = Math.round(azimuth / 22.5) % 16;
  return directions[index];
}

export function getAltitudeAtTime(
  raString: string,
  decString: string,
  latitude: number,
  longitude: number,
  targetTime: Date
): number {
  const ra = parseRightAscension(raString);
  const dec = parseDeclination(decString);
  const lst = getLocalSiderealTime(targetTime, longitude);
  const { altitude } = equatorialToHorizontal(ra, dec, latitude, lst);
  return altitude;
}

export interface NightWindowAltitudes {
  nightMaxAltitude: number;
  nightBestTime: Date | null;
  nightWellPositioned: boolean;
  sampleCount: number;
}

export function calculateNightWindowAltitudes(
  raString: string,
  decString: string,
  latitude: number,
  longitude: number,
  windowStart: Date,
  windowEnd: Date,
  wellPositionedThreshold: number = 25,
  transitTime?: Date | null,
  transitAltitude?: number
): NightWindowAltitudes {
  const samples: { time: Date; altitude: number }[] = [];
  
  // Create mutable copies for the window bounds
  const start = new Date(windowStart);
  const end = new Date(windowEnd);
  
  // Handle overnight windows: if end appears before start, it's the next day
  if (end < start) {
    end.setDate(end.getDate() + 1);
  }
  
  const startMs = start.getTime();
  const endMs = end.getTime();
  
  // Check if transit time falls within the night window - if so, include it as a sample
  // This ensures we don't miss the true peak due to 30-minute sampling gaps
  if (transitTime && transitAltitude !== undefined) {
    const transitMs = transitTime.getTime();
    
    // Check if transit is directly within window
    let isInWindow = transitMs >= startMs && transitMs <= endMs;
    let finalTransitTime = transitTime;
    
    // If not in window, try normalizing for overnight scenarios
    if (!isInWindow) {
      // Try transit + 24 hours (for early morning transits the next day)
      const nextDayTransitMs = transitMs + 24 * 60 * 60 * 1000;
      if (nextDayTransitMs >= startMs && nextDayTransitMs <= endMs) {
        isInWindow = true;
        finalTransitTime = new Date(nextDayTransitMs);
      }
      
      // Try transit - 24 hours (for late night transits from the previous day)
      if (!isInWindow) {
        const prevDayTransitMs = transitMs - 24 * 60 * 60 * 1000;
        if (prevDayTransitMs >= startMs && prevDayTransitMs <= endMs) {
          isInWindow = true;
          finalTransitTime = new Date(prevDayTransitMs);
        }
      }
    }
    
    if (isInWindow) {
      samples.push({ time: new Date(finalTransitTime), altitude: transitAltitude });
    }
  }
  
  // Sample the window at 30-minute intervals
  let current = new Date(start);
  
  while (current <= end) {
    const altitude = getAltitudeAtTime(raString, decString, latitude, longitude, current);
    samples.push({ time: new Date(current), altitude });
    current = new Date(current.getTime() + 30 * 60 * 1000);
  }
  
  if (samples.length === 0) {
    return {
      nightMaxAltitude: -90,
      nightBestTime: null,
      nightWellPositioned: false,
      sampleCount: 0,
    };
  }
  
  let maxSample = samples[0];
  for (const sample of samples) {
    if (sample.altitude > maxSample.altitude) {
      maxSample = sample;
    }
  }
  
  const isWellPositioned = samples.some(s => s.altitude >= wellPositionedThreshold);
  
  return {
    nightMaxAltitude: maxSample.altitude,
    nightBestTime: maxSample.time,
    nightWellPositioned: isWellPositioned,
    sampleCount: samples.length,
  };
}

export type MoonInterferenceLevel = 'none' | 'low' | 'moderate' | 'high';

export interface MoonInterferenceData {
  level: MoonInterferenceLevel;
  score: number;
  separation: number | null;
  illumination: number;
  message: string;
}

export function getMoonInterferenceLevelConfig(level: MoonInterferenceLevel) {
  const configs = {
    none: {
      label: "None",
      shortLabel: "None",
      bg: "bg-chart-2/15",
      border: "border-chart-2/40",
      text: "text-chart-2",
      icon: "moon-off",
      description: "No moon interference - ideal for DSOs",
    },
    low: {
      label: "Low",
      shortLabel: "Low",
      bg: "bg-chart-4/15",
      border: "border-chart-4/40",
      text: "text-chart-4",
      icon: "moon",
      description: "Minimal moon interference",
    },
    moderate: {
      label: "Moderate",
      shortLabel: "Mod",
      bg: "bg-chart-5/15",
      border: "border-chart-5/40",
      text: "text-chart-5",
      icon: "moon",
      description: "Some moon interference - DSOs may be washed out",
    },
    high: {
      label: "High",
      shortLabel: "High",
      bg: "bg-destructive/15",
      border: "border-destructive/40",
      text: "text-destructive",
      icon: "moon",
      description: "Strong moon interference - focus on planets/bright objects",
    },
  };
  return configs[level];
}

/**
 * Calculate moon interference level for an object
 * Uses the same threshold-based logic as the server for consistency:
 * - Illumination <= 30%: no interference (dark moon)
 * - Moon below horizon: no interference
 * - Planets/Moon: no interference (they're unaffected)
 * - Otherwise: based on angular separation from moon
 */
export function calculateMoonInterference(
  moonIllumination: number,
  moonSeparation: number | null,
  moonAltitude?: number,
  isPlanetOrMoon: boolean = false
): MoonInterferenceData {
  // Dark moon (new moon or thin crescent) - no interference
  if (moonIllumination <= 30) {
    return {
      level: 'none',
      score: 0,
      separation: moonSeparation,
      illumination: moonIllumination,
      message: moonIllumination < 15 
        ? 'Dark sky - no moon interference' 
        : 'Moon dim enough - minimal interference',
    };
  }
  
  // Moon below horizon - no interference
  if (moonAltitude !== undefined && moonAltitude < 0) {
    return {
      level: 'none',
      score: 0,
      separation: moonSeparation,
      illumination: moonIllumination,
      message: 'Moon below horizon',
    };
  }
  
  // Planets and the Moon itself are unaffected by moonlight
  if (isPlanetOrMoon) {
    return {
      level: 'none',
      score: 0,
      separation: moonSeparation,
      illumination: moonIllumination,
      message: 'Planets unaffected by moonlight',
    };
  }
  
  // Determine interference level based on separation (matching server logic)
  // Server uses: separation < 30° = high, < 60° = moderate, < 90° = low
  let level: MoonInterferenceLevel;
  let message: string;
  let score: number;
  
  if (moonSeparation !== null) {
    // We have separation data - use separation-based thresholds
    if (moonSeparation < 30) {
      level = 'high';
      score = 0.9;
      message = `Moon only ${moonSeparation.toFixed(0)}° away at ${moonIllumination.toFixed(0)}% - consider waiting`;
    } else if (moonSeparation < 60) {
      level = 'moderate';
      score = 0.5;
      message = `Moon ${moonSeparation.toFixed(0)}° away, ${moonIllumination.toFixed(0)}% illuminated - expect reduced contrast`;
    } else if (moonSeparation < 90) {
      level = 'low';
      score = 0.25;
      message = `Moon ${moonSeparation.toFixed(0)}° away, ${moonIllumination.toFixed(0)}% illuminated`;
    } else {
      level = 'none';
      score = 0.1;
      message = `Moon ${moonSeparation.toFixed(0)}° away - minimal impact`;
    }
  } else {
    // No separation data - match server behavior which returns 'none' 
    // when separation cannot be calculated (the if block with moonSeparation < X fails)
    // This ensures consistency between client and server calculations
    level = 'none';
    score = 0.1;
    message = moonIllumination > 60 
      ? `Moon ${moonIllumination.toFixed(0)}% illuminated (separation unknown)`
      : 'Separation unknown - unable to assess moon impact';
  }
  
  return {
    level,
    score,
    separation: moonSeparation,
    illumination: moonIllumination,
    message,
  };
}
