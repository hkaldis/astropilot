import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./auth";
import {
  insertTelescopeSchema,
  insertEyepieceSchema,
  insertBarlowSchema,
  insertFilterSchema,
  insertCameraSchema,
  insertAccessorySchema,
  insertFinderSchema,
  insertOpticalModifierSchema,
  insertLocationSchema,
  insertObservationSessionSchema,
  insertObservationSchema,
  insertObservationPhotoSchema,
  insertNightConditionsSchema,
  insertCelestialObjectSchema,
  userStats,
  type Telescope,
  type Eyepiece,
  type Barlow,
  type CelestialObject,
  type OpticalModifier,
} from "@shared/schema";
import { z } from "zod";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { generateAchievementShareImage } from "./shareImageGenerator";
import { getUncachableStripeClient } from "./stripeClient";

// ============================================================================
// GALILEO OBSERVATION ENGINE - Night Scoring System v2.0
// Multiplicative gate system with proper weighting for astronomical accuracy
// All scores normalized to 0-10 scale with perfect 10/10 achievable
// ============================================================================

type PowerClass = 'HIGH' | 'MID' | 'LOW';

interface NightContext {
  powerClass: PowerClass;
  cloudScore: number;      // 0-10 (normalized)
  seeingScore: number;     // 0-10 (normalized)
  jetScore: number;        // 0-10 (normalized)
  humidityScore: number;   // 0-10 (normalized, was penalty)
  moonScore: number;       // 0-10 (normalized, for DSOs)
  totalScore: number;      // 0-10
  planetScore: number;     // 0-10
  dsoScore: number;        // 0-10
}

// ============================================================================
// GATE CONDITIONS - These can block observation entirely
// ============================================================================

// Cloud Gate: Heavy clouds block all observation
// Returns multiplier: 0 = blocked, 0.2-0.5 = severely degraded, 1 = no gate
function calculateCloudGate(maxCloudPct: number): number {
  if (maxCloudPct >= 95) return 0;      // Complete overcast - impossible
  if (maxCloudPct >= 90) return 0.1;    // Nearly overcast - almost impossible
  if (maxCloudPct >= 80) return 0.3;    // Heavy clouds - severely limited
  if (maxCloudPct >= 70) return 0.5;    // Mostly cloudy - significantly degraded
  return 1;                              // No gate applied
}

// Humidity Gate: Fog/heavy dew blocks observation
// Returns multiplier: 0 = blocked, 0.3 = severely degraded, 1 = no gate
function calculateHumidityGate(humidityPct: number): number {
  if (humidityPct >= 98) return 0;      // Fog - impossible
  if (humidityPct >= 95) return 0.2;    // Near fog - almost impossible
  if (humidityPct >= 92) return 0.4;    // Heavy dew - severely limited
  return 1;                              // No gate applied
}

// Planet-specific cloud gate (more lenient - planets are bright)
function calculatePlanetCloudGate(maxCloudPct: number): number {
  if (maxCloudPct >= 98) return 0;      // Complete overcast
  if (maxCloudPct >= 95) return 0.2;    // Nearly overcast
  if (maxCloudPct >= 90) return 0.4;    // Heavy clouds - planets can peek through
  if (maxCloudPct >= 85) return 0.6;    // Mostly cloudy
  return 1;                              // No gate applied
}

// ============================================================================
// QUALITY SCORES - Normalized to 0-1 for weighted calculations
// ============================================================================

// Cloud Quality (0-1): Based on maximum cloud coverage
// Continuous scale with thresholds for intuitive breakpoints
function calculateCloudQuality(maxCloudPct: number): number {
  if (maxCloudPct <= 5) return 1.0;     // Crystal clear
  if (maxCloudPct <= 15) return 0.9;    // Excellent
  if (maxCloudPct <= 25) return 0.8;    // Very good
  if (maxCloudPct <= 35) return 0.7;    // Good
  if (maxCloudPct <= 45) return 0.6;    // Fair
  if (maxCloudPct <= 55) return 0.5;    // Moderate
  if (maxCloudPct <= 65) return 0.35;   // Below average
  if (maxCloudPct <= 75) return 0.2;    // Poor
  return 0.1;                            // Very poor (gate will apply)
}

// Seeing Quality (0-1): Based on arc second measurement (lower = better)
// Thresholds based on standard astronomical seeing scales
function calculateSeeingQuality(seeingArcsec: number): number {
  if (seeingArcsec <= 0.8) return 1.0;  // Exceptional (rare)
  if (seeingArcsec <= 1.0) return 0.95; // Excellent
  if (seeingArcsec <= 1.2) return 0.9;  // Very good
  if (seeingArcsec <= 1.5) return 0.8;  // Good
  if (seeingArcsec <= 1.8) return 0.7;  // Above average
  if (seeingArcsec <= 2.2) return 0.55; // Average
  if (seeingArcsec <= 2.8) return 0.4;  // Below average
  if (seeingArcsec <= 3.5) return 0.25; // Poor
  if (seeingArcsec <= 4.5) return 0.15; // Very poor
  return 0.05;                           // Terrible
}

// Jet Stream Quality (0-1): Based on jet stream index (1-100)
// Lower index = calmer upper atmosphere = better for high-power viewing
function calculateJetQuality(jetstreamIndex: number): number {
  if (jetstreamIndex <= 10) return 1.0;  // Exceptional calm
  if (jetstreamIndex <= 20) return 0.9;  // Excellent
  if (jetstreamIndex <= 30) return 0.8;  // Very good
  if (jetstreamIndex <= 40) return 0.7;  // Good
  if (jetstreamIndex <= 50) return 0.55; // Average
  if (jetstreamIndex <= 65) return 0.4;  // Below average
  if (jetstreamIndex <= 80) return 0.25; // Poor
  return 0.1;                             // Very poor
}

// Humidity Quality (0-1): Lower humidity is better (less dew, clearer air)
function calculateHumidityQuality(humidityPct: number): number {
  if (humidityPct <= 40) return 1.0;    // Excellent - crisp, dry
  if (humidityPct <= 50) return 0.95;   // Very good
  if (humidityPct <= 60) return 0.9;    // Good
  if (humidityPct <= 70) return 0.8;    // Above average
  if (humidityPct <= 80) return 0.6;    // Moderate - some dew risk
  if (humidityPct <= 85) return 0.45;   // Below average
  if (humidityPct <= 90) return 0.3;    // Poor - dew likely
  if (humidityPct <= 95) return 0.15;   // Very poor - heavy dew
  return 0.05;                           // Terrible (gate will apply)
}

// Moon Quality for DSOs (0-1): Lower illumination is better for faint objects
function calculateMoonQuality(moonIllumPct: number): number {
  if (moonIllumPct <= 5) return 1.0;    // New moon - perfect
  if (moonIllumPct <= 15) return 0.95;  // Thin crescent - excellent
  if (moonIllumPct <= 25) return 0.85;  // Crescent - very good
  if (moonIllumPct <= 40) return 0.7;   // Quarter - good for brighter DSOs
  if (moonIllumPct <= 55) return 0.5;   // Gibbous - moderate impact
  if (moonIllumPct <= 70) return 0.35;  // Large gibbous - significant impact
  if (moonIllumPct <= 85) return 0.2;   // Nearly full - poor for DSOs
  if (moonIllumPct <= 95) return 0.1;   // Full moon - very poor
  return 0.05;                           // Supermoon - terrible for DSOs
}

// Bortle Quality Bonus (0-1): Dark sites get a bonus for DSO viewing
function calculateBortleBonus(bortleScale: number): number {
  if (bortleScale <= 2) return 1.0;     // Excellent dark site
  if (bortleScale <= 3) return 0.85;    // Rural dark
  if (bortleScale <= 4) return 0.65;    // Rural/suburban transition
  if (bortleScale <= 5) return 0.45;    // Suburban
  if (bortleScale <= 6) return 0.3;     // Bright suburban
  if (bortleScale <= 7) return 0.15;    // Suburban/urban transition
  return 0.05;                           // Urban (8-9)
}

// ============================================================================
// POWER CLASS - Equipment magnification strategy
// ============================================================================

function calculatePowerClass(
  seeingArcsec: number,
  jetstreamIndex: number,
  maxCloudPct: number,
  humidityPct: number
): PowerClass {
  // LOW POWER: Any condition is poor OR gates are triggered
  if (seeingArcsec > 2.5 || jetstreamIndex > 50 || maxCloudPct > 60 || humidityPct > 90) {
    return 'LOW';
  }
  // HIGH POWER: All conditions are excellent
  if (seeingArcsec <= 1.2 && jetstreamIndex <= 25 && maxCloudPct <= 20 && humidityPct <= 70) {
    return 'HIGH';
  }
  // MID POWER: Everything else
  return 'MID';
}

// ============================================================================
// MAIN NIGHT SCORING ENGINE v2.0
// ============================================================================

function calculateNightScores(
  bortleScale: number,
  maxCloudPct: number = 50,
  seeing: number = 2.5,
  jetstream: number = 30,
  humidity: number = 60,
  moonIllumination: number = 50
): NightContext {
  
  // ========================================
  // STEP 1: Calculate Gate Multipliers
  // ========================================
  const cloudGate = calculateCloudGate(maxCloudPct);
  const humidityGate = calculateHumidityGate(humidity);
  const planetCloudGate = calculatePlanetCloudGate(maxCloudPct);
  
  // Master gate for general observation (both must pass)
  const masterGate = cloudGate * humidityGate;
  
  // Planet gate is more lenient on clouds
  const planetGate = planetCloudGate * humidityGate;
  
  // ========================================
  // STEP 2: Calculate Quality Scores (0-1)
  // ========================================
  const cloudQuality = calculateCloudQuality(maxCloudPct);
  const seeingQuality = calculateSeeingQuality(seeing);
  const jetQuality = calculateJetQuality(jetstream);
  const humidityQuality = calculateHumidityQuality(humidity);
  const moonQuality = calculateMoonQuality(moonIllumination);
  const bortleQuality = calculateBortleBonus(bortleScale);
  
  // ========================================
  // STEP 3: Calculate Power Class
  // ========================================
  const powerClass = calculatePowerClass(seeing, jetstream, maxCloudPct, humidity);
  
  // ========================================
  // STEP 4: Calculate Composite Scores (0-10)
  // ========================================
  
  // TOTAL SCORE: Overall observing conditions
  // Weights: Clouds 35%, Seeing 25%, Jet Stream 15%, Humidity 15%, Transparency bonus 10%
  // Gate multiplier applies to entire score
  const rawTotal = (cloudQuality * 0.35) + 
                   (seeingQuality * 0.25) + 
                   (jetQuality * 0.15) + 
                   (humidityQuality * 0.15) +
                   (Math.min(cloudQuality, humidityQuality) * 0.10); // Transparency
  const totalScore = Math.round(masterGate * rawTotal * 100) / 10; // 0-10 with 1 decimal
  
  // PLANET SCORE: Optimized for planetary observation
  // Planets need: stable air (seeing 50%, jet 30%) but tolerate clouds/moon better
  // Gate multiplier is more lenient for clouds
  const rawPlanet = (seeingQuality * 0.50) + 
                    (jetQuality * 0.30) + 
                    (humidityQuality * 0.15) +
                    (cloudQuality * 0.05);  // Slight cloud factor
  const planetScore = Math.round(planetGate * rawPlanet * 100) / 10;
  
  // DSO SCORE: Optimized for deep sky object observation
  // DSOs need: dark skies (moon 30%, bortle 20%), clear skies (clouds 25%), dry air (humidity 15%)
  // Seeing matters less for extended fuzzy objects
  const rawDso = (moonQuality * 0.30) + 
                 (bortleQuality * 0.20) + 
                 (cloudQuality * 0.25) + 
                 (humidityQuality * 0.15) +
                 (seeingQuality * 0.10);   // Less important for DSOs
  const dsoScore = Math.round(masterGate * rawDso * 100) / 10;

  // ========================================
  // STEP 5: Return normalized component scores (0-10)
  // ========================================
  return {
    powerClass,
    cloudScore: Math.round(cloudQuality * 100) / 10,
    seeingScore: Math.round(seeingQuality * 100) / 10,
    jetScore: Math.round(jetQuality * 100) / 10,
    humidityScore: Math.round(humidityQuality * 100) / 10,
    moonScore: Math.round(moonQuality * 100) / 10,
    totalScore: Math.max(0, Math.min(10, totalScore)),
    planetScore: Math.max(0, Math.min(10, planetScore)),
    dsoScore: Math.max(0, Math.min(10, dsoScore)),
  };
}

// ============================================================================
// OBSERVATION WINDOW CALCULATOR - Smart scheduling for watchlist items
// Generates continuous observation periods within astronomical twilight
// ============================================================================

interface ObservationWindowData {
  date: Date;
  startTime: Date;
  endTime: Date;
  qualityScore: number;
  peakAltitude: number;
  transitTime: Date | null;
  moonPhase: number;
  moonSeparation: number;
  moonInterference: string;
  durationMinutes: number;
  twilightSegment: 'evening' | 'midnight' | 'morning';
  astronomicalDusk: Date | null;
  astronomicalDawn: Date | null;
}

// Calculate astronomical twilight times (sun at -18°)
async function getAstronomicalTwilight(
  observer: any,
  date: Date,
  Astronomy: any
): Promise<{ dusk: Date | null; dawn: Date | null }> {
  const midnight = new Date(date);
  midnight.setHours(12, 0, 0, 0); // Start from noon to find evening dusk
  
  let dusk: Date | null = null;
  let dawn: Date | null = null;
  
  try {
    // Search for astronomical dusk (sun setting past -18°)
    const duskSearch = Astronomy.SearchAltitude(
      Astronomy.Body.Sun,
      observer,
      -1, // setting
      midnight,
      1, // search 1 day
      -18 // astronomical twilight angle
    );
    if (duskSearch) dusk = duskSearch.date;
    
    // Search for astronomical dawn (sun rising past -18°)
    const nextMorning = new Date(midnight.getTime() + 12 * 60 * 60 * 1000);
    const dawnSearch = Astronomy.SearchAltitude(
      Astronomy.Body.Sun,
      observer,
      +1, // rising
      nextMorning,
      1,
      -18
    );
    if (dawnSearch) dawn = dawnSearch.date;
  } catch (e) {
    // May not occur at high latitudes during polar day/night
  }
  
  return { dusk, dawn };
}

// Determine which twilight segment a time falls into
function getTwilightSegment(
  time: Date,
  dusk: Date,
  dawn: Date
): 'evening' | 'midnight' | 'morning' {
  const nightDuration = dawn.getTime() - dusk.getTime();
  const timeIntoNight = time.getTime() - dusk.getTime();
  const fraction = timeIntoNight / nightDuration;
  
  if (fraction < 0.33) return 'evening';
  if (fraction > 0.66) return 'morning';
  return 'midnight';
}

async function calculateObservationWindows(
  object: CelestialObject,
  latitude: number,
  longitude: number,
  days: number
): Promise<ObservationWindowData[]> {
  const windows: ObservationWindowData[] = [];
  const Astronomy = await import('astronomy-engine');
  const observer = new Astronomy.Observer(latitude, longitude, 0);
  const now = new Date();
  
  for (let d = 0; d < days; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);
    date.setHours(12, 0, 0, 0); // Start at noon to catch the evening
    
    // Calculate astronomical twilight times (sun at -18°)
    const twilight = await getAstronomicalTwilight(observer, date, Astronomy);
    
    if (!twilight.dusk || !twilight.dawn) continue;
    
    const astronomicalDusk = twilight.dusk;
    const astronomicalDawn = twilight.dawn;
    
    // Calculate moon phase and position at mid-darkness
    const midNight = new Date((astronomicalDusk.getTime() + astronomicalDawn.getTime()) / 2);
    const moonPhaseInfo = Astronomy.MoonPhase(midNight);
    const moonIllumination = (1 - Math.cos(moonPhaseInfo * Math.PI / 180)) / 2 * 100;
    
    // Get object's position (handle different object types)
    let objectRaDeg: number;
    let objectDecDeg: number;
    
    // For fixed objects (DSOs), use stored RA/Dec
    if (object.rightAscension !== null && object.declination !== null) {
      objectRaDeg = parseRaToDecimalDegrees(object.rightAscension);
      objectDecDeg = parseDecToDegrees(object.declination);
    } else if (object.category === 'planet') {
      // For planets, calculate current position
      const planetBody = getPlanetBody(object.catalogId);
      if (planetBody) {
        const equator = Astronomy.Equator(planetBody, midNight, observer, true, true);
        objectRaDeg = equator.ra * 15;
        objectDecDeg = equator.dec;
      } else {
        continue;
      }
    } else {
      continue;
    }
    
    // Calculate moon position and separation
    const moonEquator = Astronomy.Equator(Astronomy.Body.Moon, midNight, observer, true, true);
    const moonRaDeg = moonEquator.ra * 15;
    const moonDecDeg = moonEquator.dec;
    const moonSeparation = calculateAngularSeparation(
      objectRaDeg, objectDecDeg, moonRaDeg, moonDecDeg
    );
    
    // Determine moon interference level
    let moonInterference = 'none';
    if (moonIllumination > 30) {
      if (moonSeparation < 30) moonInterference = 'high';
      else if (moonSeparation < 60) moonInterference = 'moderate';
      else if (moonSeparation < 90) moonInterference = 'low';
    }
    
    // Sample positions WITHIN ASTRONOMICAL DARKNESS to find the observing window
    const darknessDuration = astronomicalDawn.getTime() - astronomicalDusk.getTime();
    const sampleIntervalMs = 10 * 60 * 1000; // 10-minute samples for precision
    const samples = Math.ceil(darknessDuration / sampleIntervalMs);
    
    let maxAltitude = -90;
    let transitTime: Date | null = null;
    let windowStart: Date | null = null;
    let windowEnd: Date | null = null;
    let inWindow = false;
    
    for (let s = 0; s <= samples; s++) {
      const sampleTime = new Date(astronomicalDusk.getTime() + s * sampleIntervalMs);
      
      // Don't sample past astronomical dawn
      if (sampleTime > astronomicalDawn) break;
      
      // Get object altitude at this time
      const horizon = Astronomy.Horizon(sampleTime, observer, objectRaDeg / 15, objectDecDeg, 'normal');
      const altitude = horizon.altitude;
      
      // Track maximum altitude during darkness
      if (altitude > maxAltitude) {
        maxAltitude = altitude;
        transitTime = sampleTime;
      }
      
      // Track continuous observing window (above 20° altitude within darkness)
      const isObservable = altitude >= 20;
      
      if (isObservable && !inWindow) {
        // Starting a new window
        windowStart = sampleTime;
        inWindow = true;
      } else if (!isObservable && inWindow) {
        // Ending current window
        windowEnd = new Date(sampleTime.getTime() - sampleIntervalMs);
        inWindow = false;
      }
    }
    
    // Close window if it extends to dawn
    if (inWindow && windowStart) {
      windowEnd = astronomicalDawn;
    }
    
    // Skip nights where object doesn't rise above 20° during darkness
    if (maxAltitude < 20 || !windowStart || !windowEnd) continue;
    
    // Calculate duration in minutes
    const durationMinutes = Math.round((windowEnd.getTime() - windowStart.getTime()) / (60 * 1000));
    
    // Determine twilight segment based on when peak altitude occurs
    const twilightSegment = getTwilightSegment(transitTime || windowStart, astronomicalDusk, astronomicalDawn);
    
    // Calculate quality score
    const altitudeFactor = Math.min(1, maxAltitude / 70) * 10;
    const transitProximity = 10;
    let moonPenalty = 10;
    if (moonIllumination > 30) {
      const illuminationPenalty = (moonIllumination - 30) / 70;
      const separationBonus = Math.min(1, moonSeparation / 120);
      moonPenalty = (1 - illuminationPenalty + separationBonus) / 2 * 10;
    }
    
    // Add duration bonus: longer windows are better (up to 4 hours)
    const durationBonus = Math.min(1, durationMinutes / 240) * 2; // Up to 2 points for 4+ hours
    
    const qualityScore = Math.round(
      (altitudeFactor * 0.35) + (transitProximity * 0.25) + (moonPenalty * 0.25) + (durationBonus * 0.15)
    );
    
    windows.push({
      date,
      startTime: windowStart,
      endTime: windowEnd,
      qualityScore: Math.max(0, Math.min(10, qualityScore)),
      peakAltitude: Math.round(maxAltitude * 10) / 10,
      transitTime,
      moonPhase: Math.round(moonIllumination),
      moonSeparation: Math.round(moonSeparation),
      moonInterference,
      durationMinutes,
      twilightSegment,
      astronomicalDusk,
      astronomicalDawn,
    });
  }
  
  return windows;
}

// Helper function to get planet body from catalog ID
function getPlanetBody(catalogId: string): any {
  const Astronomy = require('astronomy-engine');
  const planetMap: Record<string, any> = {
    'Mercury': Astronomy.Body.Mercury,
    'Venus': Astronomy.Body.Venus,
    'Mars': Astronomy.Body.Mars,
    'Jupiter': Astronomy.Body.Jupiter,
    'Saturn': Astronomy.Body.Saturn,
    'Uranus': Astronomy.Body.Uranus,
    'Neptune': Astronomy.Body.Neptune,
  };
  return planetMap[catalogId];
}

// Calculate angular separation between two celestial coordinates
function calculateAngularSeparation(
  ra1Deg: number, dec1Deg: number,
  ra2Deg: number, dec2Deg: number
): number {
  const toRad = Math.PI / 180;
  const ra1 = ra1Deg * toRad;
  const dec1 = dec1Deg * toRad;
  const ra2 = ra2Deg * toRad;
  const dec2 = dec2Deg * toRad;
  
  // Vincenty formula for angular separation
  const dRa = ra2 - ra1;
  const cosD = Math.sin(dec1) * Math.sin(dec2) + Math.cos(dec1) * Math.cos(dec2) * Math.cos(dRa);
  const separation = Math.acos(Math.max(-1, Math.min(1, cosD)));
  
  return separation * 180 / Math.PI; // Return in degrees
}

// Parse Right Ascension string to decimal degrees
function parseRaToDecimalDegrees(raStr: string): number {
  // Handle various RA formats: "HH MM SS", "HH:MM:SS", "HH.HH"
  const parts = raStr.trim().split(/[\s:]+/).map(s => parseFloat(s.replace(/[^\d.-]/g, '')));
  
  if (parts.length >= 3) {
    // Format: hours minutes seconds
    const hours = parts[0] + parts[1] / 60 + parts[2] / 3600;
    return hours * 15; // Convert hours to degrees
  } else if (parts.length === 2) {
    // Format: hours minutes
    const hours = parts[0] + parts[1] / 60;
    return hours * 15;
  } else if (parts.length === 1) {
    // Format: decimal hours
    return parts[0] * 15;
  }
  return 0;
}

// Parse Declination string to degrees
function parseDecToDegrees(decStr: string): number {
  // Handle various Dec formats: "+DD MM SS", "DD:MM:SS", "+DD.DD"
  const isNegative = decStr.includes('-');
  const parts = decStr.trim().split(/[\s:]+/).map(s => parseFloat(s.replace(/[^\d.]/g, '')));
  
  let degrees = 0;
  if (parts.length >= 3) {
    // Format: degrees arcminutes arcseconds
    degrees = parts[0] + parts[1] / 60 + parts[2] / 3600;
  } else if (parts.length === 2) {
    // Format: degrees arcminutes
    degrees = parts[0] + parts[1] / 60;
  } else if (parts.length === 1) {
    // Format: decimal degrees
    degrees = parts[0];
  }
  
  return isNegative ? -degrees : degrees;
}

// Optics Calculation Engine
function calculateOpticsParams(telescope: Telescope, eyepiece: Eyepiece, barlow?: Barlow) {
  const effectiveFocalLength = telescope.focalLength * (barlow?.factor || 1);
  const magnification = effectiveFocalLength / eyepiece.focalLength;
  const exitPupil = telescope.aperture / magnification;
  const trueFieldOfView = (eyepiece.apparentFov || 50) / magnification;
  
  // Calculate limiting magnitude (simplified formula)
  const limitingMagnitude = 2 + 5 * Math.log10(telescope.aperture);
  
  // Calculate max useful magnification
  const maxUsefulMag = telescope.aperture * 2;
  const minUsefulMag = telescope.aperture / 7;
  
  return {
    magnification: Math.round(magnification * 10) / 10,
    exitPupil: Math.round(exitPupil * 100) / 100,
    trueFieldOfView: Math.round(trueFieldOfView * 100) / 100,
    limitingMagnitude: Math.round(limitingMagnitude * 10) / 10,
    maxUsefulMag: Math.round(maxUsefulMag),
    minUsefulMag: Math.round(minUsefulMag * 10) / 10,
  };
}

// ============================================================================
// COMPREHENSIVE FILTER RECOMMENDATION ENGINE v2.0
// Astronomically-accurate filter recommendations for visual observation
// ============================================================================

// Extended filter types for comprehensive recommendations
type ExtendedFilterType = 
  | 'none' | 'uhc' | 'oiii' | 'h_beta' | 'h_alpha'
  | 'neodymium' | 'contrast_booster' | 'cls' | 'lps'
  | 'nd' | 'variable_polarizer' | 'fringe_killer' | 'semi_apo'
  | 'color_yellow' | 'color_red' | 'color_blue' | 'color_green' | 'color_violet';

// Filter recommendation with priority and context
interface FilterOption {
  type: ExtendedFilterType;
  priority: 'primary' | 'secondary' | 'optional' | 'situational';
  effectiveness: 1 | 2 | 3 | 4 | 5; // 1-5 stars
  reason: string;
  conditions?: string; // When this filter is especially useful
}

// Object-specific filter overrides for special cases
// These override the category-based defaults for objects with unique characteristics
const OBJECT_FILTER_OVERRIDES: Record<string, {
  filters: FilterOption[];
  avoidFilters?: ExtendedFilterType[];
  warning?: string;
}> = {
  // M1 Crab Nebula - Synchrotron radiation, NOT emission lines!
  'M1': {
    filters: [
      { type: 'none', priority: 'primary', effectiveness: 5, reason: 'Crab Nebula emits synchrotron radiation (continuous spectrum), not emission lines - filters reduce visibility' }
    ],
    avoidFilters: ['uhc', 'oiii', 'h_beta'],
    warning: 'Do NOT use narrowband filters - synchrotron radiation is broadband'
  },
  
  // M78 - Brightest reflection nebula (reflects starlight, not emission)
  'M78': {
    filters: [
      { type: 'none', priority: 'primary', effectiveness: 5, reason: 'Reflection nebula - reflects starlight (broadband). Narrowband filters will dim it significantly' },
      { type: 'cls', priority: 'situational', effectiveness: 2, reason: 'Only in heavy light pollution (Bortle 7+)', conditions: 'Bortle 7+' }
    ],
    avoidFilters: ['uhc', 'oiii', 'h_beta'],
    warning: 'Avoid narrowband filters - reflection nebulae need no filter'
  },
  
  // IC434 / Horsehead - Dark nebula against H-beta emission background
  'IC434': {
    filters: [
      { type: 'h_beta', priority: 'primary', effectiveness: 5, reason: 'Essential for Horsehead - the background emission nebula IC434 emits primarily in H-beta (486nm)' },
      { type: 'uhc', priority: 'secondary', effectiveness: 2, reason: 'Provides some improvement but H-beta is far superior' }
    ],
    avoidFilters: ['oiii'],
    warning: 'H-beta filter is THE filter for Horsehead Nebula. Requires 8"+ aperture and dark skies.'
  },
  
  // Veil Nebula Western - OIII dominant supernova remnant
  'NGC6960': {
    filters: [
      { type: 'oiii', priority: 'primary', effectiveness: 5, reason: 'OIII transforms the Veil - makes invisible filaments dramatically visible' },
      { type: 'uhc', priority: 'secondary', effectiveness: 4, reason: 'Good improvement, but OIII is significantly better' }
    ]
  },
  
  // Veil Nebula Eastern
  'NGC6992': {
    filters: [
      { type: 'oiii', priority: 'primary', effectiveness: 5, reason: 'OIII reveals stunning filamentary structure' },
      { type: 'uhc', priority: 'secondary', effectiveness: 4, reason: 'Good alternative if OIII unavailable' }
    ]
  },
  
  // IC443 Jellyfish Nebula - Faint SNR needs OIII
  'IC443': {
    filters: [
      { type: 'oiii', priority: 'primary', effectiveness: 5, reason: 'Essential for visual detection - extremely faint without filter' },
      { type: 'uhc', priority: 'secondary', effectiveness: 3, reason: 'Helps but OIII much better for this faint target' }
    ]
  },
  
  // M42 Orion Nebula - Very bright, filters optional
  'M42': {
    filters: [
      { type: 'uhc', priority: 'optional', effectiveness: 4, reason: 'Enhances contrast and detail in outer regions, but nebula is bright enough without filter' },
      { type: 'oiii', priority: 'optional', effectiveness: 3, reason: 'Shows different structures, useful for experienced observers' },
      { type: 'none', priority: 'primary', effectiveness: 4, reason: 'Very bright nebula - excellent views without filter, especially for beginners' }
    ]
  },
  
  // M43 De Mairan's Nebula (part of Orion complex)
  'M43': {
    filters: [
      { type: 'uhc', priority: 'optional', effectiveness: 4, reason: 'Helps separate from M42 and enhance detail' },
      { type: 'none', priority: 'primary', effectiveness: 4, reason: 'Visible without filter as part of Orion complex' }
    ]
  },
  
  // NGC7000 North America Nebula - OIII actually better than UHC
  'NGC7000': {
    filters: [
      { type: 'oiii', priority: 'primary', effectiveness: 5, reason: 'OIII often works better than UHC for this object' },
      { type: 'uhc', priority: 'secondary', effectiveness: 4, reason: 'Good alternative, shows slightly larger extent' }
    ]
  },
  
  // M20 Trifid - Mixed nebula (emission + reflection + dark)
  'M20': {
    filters: [
      { type: 'uhc', priority: 'optional', effectiveness: 3, reason: 'Enhances pink emission portion but dims blue reflection component' },
      { type: 'none', priority: 'primary', effectiveness: 4, reason: 'No filter shows all three components (emission, reflection, dark lanes)' }
    ],
    warning: 'Mixed nebula - filter helps emission portion but dims the reflection component'
  },
  
  // California Nebula - H-beta dominant
  'NGC1499': {
    filters: [
      { type: 'h_beta', priority: 'primary', effectiveness: 5, reason: 'H-beta dominant emission - essential for visual detection' },
      { type: 'uhc', priority: 'secondary', effectiveness: 3, reason: 'Helps somewhat but H-beta far superior' }
    ]
  },
  
  // Cocoon Nebula - H-beta helps
  'IC5146': {
    filters: [
      { type: 'h_beta', priority: 'primary', effectiveness: 4, reason: 'H-beta emission component responds well' },
      { type: 'uhc', priority: 'secondary', effectiveness: 3, reason: 'General nebula enhancement' }
    ]
  }
};

// Planet-specific filter recommendations
const PLANET_FILTER_RECOMMENDATIONS: Record<string, FilterOption[]> = {
  'Jupiter': [
    { type: 'neodymium', priority: 'primary', effectiveness: 5, reason: 'Enhances Great Red Spot and cloud belt colors dramatically' },
    { type: 'color_yellow', priority: 'secondary', effectiveness: 4, reason: '#12 Yellow - emphasizes cloud belts and zones' },
    { type: 'color_blue', priority: 'optional', effectiveness: 4, reason: '#80A Blue - enhances Great Red Spot contrast' },
    { type: 'contrast_booster', priority: 'optional', effectiveness: 5, reason: 'Maximum contrast for cloud detail', conditions: 'Good seeing' }
  ],
  'Saturn': [
    { type: 'neodymium', priority: 'primary', effectiveness: 4, reason: 'Enhances ring contrast and subtle cloud banding' },
    { type: 'color_yellow', priority: 'secondary', effectiveness: 4, reason: '#12 Yellow - cloud belt enhancement' },
    { type: 'color_blue', priority: 'optional', effectiveness: 3, reason: '#80A Blue - improves ring/globe contrast' }
  ],
  'Mars': [
    { type: 'neodymium', priority: 'primary', effectiveness: 5, reason: 'Dramatically improves surface feature contrast' },
    { type: 'color_red', priority: 'secondary', effectiveness: 4, reason: '#25 Red - enhances dark surface markings (needs 4"+ aperture)' },
    { type: 'color_blue', priority: 'optional', effectiveness: 3, reason: '#80A Blue - highlights polar caps and clouds' },
    { type: 'color_green', priority: 'optional', effectiveness: 3, reason: '#58 Green - polar cap enhancement' }
  ],
  'Venus': [
    { type: 'color_blue', priority: 'primary', effectiveness: 3, reason: '#80A Blue - subtle cloud pattern enhancement' },
    { type: 'color_violet', priority: 'optional', effectiveness: 3, reason: '#47 Violet - cloud structure (challenging)', conditions: 'Excellent seeing' },
    { type: 'neodymium', priority: 'optional', effectiveness: 2, reason: 'Mild glare reduction' }
  ],
  'Mercury': [
    { type: 'color_red', priority: 'primary', effectiveness: 3, reason: '#23A Light Red - helps with daylight/twilight observation', conditions: 'Twilight observation' },
    { type: 'neodymium', priority: 'optional', effectiveness: 2, reason: 'Glare reduction during bright conditions' }
  ],
  'Uranus': [
    { type: 'none', priority: 'primary', effectiveness: 4, reason: 'Small disc - filters reduce already limited light' }
  ],
  'Neptune': [
    { type: 'none', priority: 'primary', effectiveness: 4, reason: 'Very small disc - maximize light gathering' }
  ]
};

// Moon filter recommendations based on phase/brightness
function getMoonFilterRecommendations(illumination?: number): FilterOption[] {
  const bright = illumination !== undefined && illumination > 70;
  const moderate = illumination !== undefined && illumination > 30 && illumination <= 70;
  
  if (bright) {
    return [
      { type: 'nd', priority: 'primary', effectiveness: 5, reason: 'ND filter reduces glare for comfortable full/gibbous Moon viewing' },
      { type: 'variable_polarizer', priority: 'primary', effectiveness: 5, reason: 'Variable polarizer - adjustable brightness reduction' },
      { type: 'neodymium', priority: 'secondary', effectiveness: 4, reason: 'Enhances crater and surface detail contrast' },
      { type: 'color_yellow', priority: 'optional', effectiveness: 3, reason: '#8 Light Yellow - reduces glare, enhances features' }
    ];
  } else if (moderate) {
    return [
      { type: 'neodymium', priority: 'primary', effectiveness: 4, reason: 'Enhances surface detail without excessive dimming' },
      { type: 'nd', priority: 'optional', effectiveness: 3, reason: 'ND filter optional - may help with glare' },
      { type: 'none', priority: 'optional', effectiveness: 4, reason: 'Quarter phases often comfortable without filter' }
    ];
  } else {
    return [
      { type: 'none', priority: 'primary', effectiveness: 5, reason: 'Crescent Moon - no filter needed, maximize light for earthshine' },
      { type: 'neodymium', priority: 'optional', effectiveness: 3, reason: 'Can enhance terminator detail' }
    ];
  }
}

// Enhanced category rules with comprehensive filter logic
interface CategoryRules {
  exitPupilMin: number;
  exitPupilMax: number;
  idealExitPupil: number;  // Size-aware ideal for scoring
  allowHighPower: boolean;
  filterRecommendation: 'never' | 'always' | 'recommended' | 'optional' | 'situational';
  primaryFilter: ExtendedFilterType;
  secondaryFilter?: ExtendedFilterType;
  avoidFilters?: ExtendedFilterType[];
}

// Parse angular size from string format (e.g., "178'x63'" -> 178)
function parseAngularSize(size: string | null | undefined): number | null {
  if (!size) return null;
  
  const match = size.match(/(\d+(?:\.\d+)?)\s*['′]?\s*(?:x\s*\d+(?:\.\d+)?\s*['′]?)?/i);
  if (match) {
    return parseFloat(match[1]);
  }
  
  const degMatch = size.match(/(\d+(?:\.\d+)?)\s*[°]/);
  if (degMatch) {
    return parseFloat(degMatch[1]) * 60;
  }
  
  return null;
}

function getCategoryRules(category: string, seeingScore: number, objectAngularSize?: number): CategoryRules {
  let baseRules: CategoryRules;
  
  switch (category) {
    case 'planet':
      baseRules = { 
        exitPupilMin: 0.5, exitPupilMax: 1.2, idealExitPupil: 0.8, allowHighPower: true, 
        filterRecommendation: 'optional', primaryFilter: 'neodymium', secondaryFilter: 'contrast_booster'
      };
      break;
    case 'moon':
      baseRules = { 
        exitPupilMin: 0.5, exitPupilMax: 2.0, idealExitPupil: 1.0, allowHighPower: true, 
        filterRecommendation: 'recommended', primaryFilter: 'nd', secondaryFilter: 'neodymium'
      };
      break;
    case 'planetary_nebula':
      baseRules = { 
        exitPupilMin: 1.0, exitPupilMax: 2.0, idealExitPupil: 1.2, allowHighPower: seeingScore >= 2, 
        filterRecommendation: 'always', primaryFilter: 'oiii', secondaryFilter: 'uhc'
      };
      break;
    case 'globular_cluster':
      baseRules = { 
        exitPupilMin: 1.0, exitPupilMax: 2.0, idealExitPupil: 1.5, allowHighPower: seeingScore >= 2, 
        filterRecommendation: 'never', primaryFilter: 'none',
        avoidFilters: ['uhc', 'oiii', 'h_beta']
      };
      break;
    case 'galaxy':
      baseRules = { 
        exitPupilMin: 2.0, exitPupilMax: 5.0, idealExitPupil: 3.0, allowHighPower: false, 
        filterRecommendation: 'situational', primaryFilter: 'none', secondaryFilter: 'cls',
        avoidFilters: ['uhc', 'oiii', 'h_beta']
      };
      break;
    case 'nebula':
    case 'emission_nebula':
      baseRules = { 
        exitPupilMin: 3.0, exitPupilMax: 5.0, idealExitPupil: 4.0, allowHighPower: false, 
        filterRecommendation: 'always', primaryFilter: 'uhc', secondaryFilter: 'oiii'
      };
      break;
    case 'reflection_nebula':
      baseRules = { 
        exitPupilMin: 3.0, exitPupilMax: 5.0, idealExitPupil: 4.0, allowHighPower: false, 
        filterRecommendation: 'never', primaryFilter: 'none',
        avoidFilters: ['uhc', 'oiii', 'h_beta']
      };
      break;
    case 'dark_nebula':
      baseRules = { 
        exitPupilMin: 3.0, exitPupilMax: 5.0, idealExitPupil: 4.0, allowHighPower: false, 
        filterRecommendation: 'situational', primaryFilter: 'h_beta', secondaryFilter: 'uhc'
      };
      break;
    case 'mixed_nebula':
      baseRules = { 
        exitPupilMin: 3.0, exitPupilMax: 5.0, idealExitPupil: 4.0, allowHighPower: false, 
        filterRecommendation: 'optional', primaryFilter: 'uhc', secondaryFilter: 'none'
      };
      break;
    case 'open_cluster':
      baseRules = { 
        exitPupilMin: 3.0, exitPupilMax: 5.0, idealExitPupil: 4.0, allowHighPower: false, 
        filterRecommendation: 'never', primaryFilter: 'none',
        avoidFilters: ['uhc', 'oiii', 'h_beta']
      };
      break;
    case 'supernova_remnant':
      baseRules = { 
        exitPupilMin: 3.0, exitPupilMax: 5.0, idealExitPupil: 4.0, allowHighPower: false, 
        filterRecommendation: 'always', primaryFilter: 'oiii', secondaryFilter: 'uhc'
      };
      break;
    case 'double_star':
      baseRules = { 
        exitPupilMin: 0.5, exitPupilMax: 1.5, idealExitPupil: 1.0, allowHighPower: true, 
        filterRecommendation: 'never', primaryFilter: 'none',
        avoidFilters: ['uhc', 'oiii']
      };
      break;
    case 'asterism':
      baseRules = { 
        exitPupilMin: 3.0, exitPupilMax: 5.0, idealExitPupil: 4.0, allowHighPower: false, 
        filterRecommendation: 'never', primaryFilter: 'none'
      };
      break;
    default:
      baseRules = { 
        exitPupilMin: 2.0, exitPupilMax: 4.0, idealExitPupil: 3.0, allowHighPower: false, 
        filterRecommendation: 'never', primaryFilter: 'none'
      };
  }
  
  // Size-aware adjustment for extended objects (>30 arcminutes)
  // For large extended objects, both the max AND ideal exit pupil shift toward higher values
  // This ensures richest-field setups (like 30mm wide-angle eyepieces) score well for big targets
  if (objectAngularSize && objectAngularSize > 30 && !baseRules.allowHighPower) {
    const sizeMultiplier = Math.min(1.6, 1 + (objectAngularSize - 30) / 200);
    const isLargeExtended = objectAngularSize > 60;
    
    // For truly large objects (>60'), ideal shifts toward 5-6mm for maximum surface brightness
    // For medium objects (30-60'), ideal shifts moderately
    const adjustedMax = Math.min(baseRules.exitPupilMax * sizeMultiplier, isLargeExtended ? 7.0 : 6.5);
    const adjustedIdeal = isLargeExtended 
      ? Math.min(adjustedMax * 0.85, baseRules.idealExitPupil * sizeMultiplier * 1.2)  // Shift toward upper range
      : Math.min(adjustedMax * 0.75, baseRules.idealExitPupil * sizeMultiplier);
    
    return {
      ...baseRules,
      exitPupilMin: baseRules.exitPupilMin,
      exitPupilMax: adjustedMax,
      idealExitPupil: adjustedIdeal,
    };
  }
  
  return baseRules;
}

// Comprehensive Filter Recommendation Engine
interface FilterRecommendation {
  useFilter: boolean;
  filterType: ExtendedFilterType;
  reason: string;
  // Enhanced fields for comprehensive recommendations
  primaryFilter?: FilterOption;
  secondaryFilter?: FilterOption;
  optionalFilters?: FilterOption[];
  avoidFilters?: ExtendedFilterType[];
  warning?: string;
  allRecommendations?: FilterOption[];
}

// Get filter name for display
function getFilterDisplayName(filterType: ExtendedFilterType): string {
  const names: Record<ExtendedFilterType, string> = {
    'none': 'No filter',
    'uhc': 'UHC (Ultra High Contrast)',
    'oiii': 'OIII (Oxygen-III)',
    'h_beta': 'H-beta',
    'h_alpha': 'H-alpha',
    'neodymium': 'Neodymium (Moon & Skyglow)',
    'contrast_booster': 'Contrast Booster',
    'cls': 'CLS (City Light Suppression)',
    'lps': 'LPS (Light Pollution Suppression)',
    'nd': 'ND (Neutral Density)',
    'variable_polarizer': 'Variable Polarizer',
    'fringe_killer': 'Fringe Killer',
    'semi_apo': 'Semi-APO',
    'color_yellow': 'Yellow (#12)',
    'color_red': 'Red (#25)',
    'color_blue': 'Blue (#80A)',
    'color_green': 'Green (#58)',
    'color_violet': 'Violet (#47)'
  };
  return names[filterType] || filterType;
}

function recommendFilter(
  category: string, 
  seeingScore: number, 
  catalogId?: string,
  objectName?: string,
  bortle?: number,
  moonIllumination?: number
): FilterRecommendation {
  // Check for object-specific overrides first
  if (catalogId && OBJECT_FILTER_OVERRIDES[catalogId]) {
    const override = OBJECT_FILTER_OVERRIDES[catalogId];
    const primary = override.filters.find(f => f.priority === 'primary') || override.filters[0];
    const secondary = override.filters.find(f => f.priority === 'secondary');
    const optional = override.filters.filter(f => f.priority === 'optional' || f.priority === 'situational');
    
    return {
      useFilter: primary.type !== 'none',
      filterType: primary.type,
      reason: primary.reason,
      primaryFilter: primary,
      secondaryFilter: secondary,
      optionalFilters: optional,
      avoidFilters: override.avoidFilters,
      warning: override.warning,
      allRecommendations: override.filters
    };
  }
  
  // Planet-specific recommendations
  if (category === 'planet' && objectName) {
    const planetName = objectName.split(' ')[0]; // Get first word (planet name)
    const planetFilters = PLANET_FILTER_RECOMMENDATIONS[planetName];
    if (planetFilters) {
      const primary = planetFilters.find(f => f.priority === 'primary') || planetFilters[0];
      const secondary = planetFilters.find(f => f.priority === 'secondary');
      const optional = planetFilters.filter(f => f.priority === 'optional');
      
      return {
        useFilter: primary.type !== 'none',
        filterType: primary.type,
        reason: primary.reason,
        primaryFilter: primary,
        secondaryFilter: secondary,
        optionalFilters: optional,
        allRecommendations: planetFilters
      };
    }
  }
  
  // Moon-specific recommendations
  if (category === 'moon') {
    const moonFilters = getMoonFilterRecommendations(moonIllumination);
    const primary = moonFilters.find(f => f.priority === 'primary') || moonFilters[0];
    const secondary = moonFilters.find(f => f.priority === 'secondary');
    const optional = moonFilters.filter(f => f.priority === 'optional');
    
    return {
      useFilter: primary.type !== 'none',
      filterType: primary.type,
      reason: primary.reason,
      primaryFilter: primary,
      secondaryFilter: secondary,
      optionalFilters: optional,
      allRecommendations: moonFilters
    };
  }
  
  // Use category-based rules
  const rules = getCategoryRules(category, seeingScore);
  
  // Build filter recommendations based on category
  const allRecs: FilterOption[] = [];
  
  // Primary filter
  const primaryReason = getPrimaryFilterReason(category, rules.primaryFilter);
  allRecs.push({
    type: rules.primaryFilter,
    priority: 'primary',
    effectiveness: getFilterEffectiveness(rules.primaryFilter, category),
    reason: primaryReason
  });
  
  // Secondary filter if exists
  if (rules.secondaryFilter) {
    allRecs.push({
      type: rules.secondaryFilter,
      priority: 'secondary',
      effectiveness: getFilterEffectiveness(rules.secondaryFilter, category) - 1 as 1|2|3|4|5,
      reason: getSecondaryFilterReason(category, rules.secondaryFilter)
    });
  }
  
  // Add light pollution filter for galaxies in poor skies
  if (category === 'galaxy' && bortle && bortle >= 6) {
    allRecs.push({
      type: 'cls',
      priority: 'situational',
      effectiveness: 2,
      reason: 'CLS filter may help slightly in light-polluted skies (Bortle 6+)',
      conditions: 'Bortle 6+'
    });
  }
  
  const primary = allRecs.find(f => f.priority === 'primary') || allRecs[0];
  const secondary = allRecs.find(f => f.priority === 'secondary');
  const optional = allRecs.filter(f => f.priority === 'optional' || f.priority === 'situational');
  
  return {
    useFilter: primary.type !== 'none' && rules.filterRecommendation !== 'never',
    filterType: primary.type,
    reason: primary.reason,
    primaryFilter: primary,
    secondaryFilter: secondary,
    optionalFilters: optional.length > 0 ? optional : undefined,
    avoidFilters: rules.avoidFilters,
    allRecommendations: allRecs
  };
}

function getPrimaryFilterReason(category: string, filterType: ExtendedFilterType): string {
  if (filterType === 'none') {
    switch (category) {
      case 'reflection_nebula':
        return 'Reflection nebulae shine by reflecting starlight - narrowband filters will dim them significantly';
      case 'galaxy':
        return 'Galaxies emit broadband light - narrowband filters dim them too much';
      case 'globular_cluster':
      case 'open_cluster':
        return 'Star clusters need no filter - filters dim the stars';
      case 'double_star':
        return 'No filter preserves natural star colors for color contrast doubles';
      default:
        return 'No filter needed for optimal viewing';
    }
  }
  
  switch (filterType) {
    case 'oiii':
      if (category === 'planetary_nebula') {
        return 'OIII filter strongly recommended - planetary nebulae emit ~90% of light in OIII lines (496/501nm)';
      }
      if (category === 'supernova_remnant') {
        return 'OIII filter dramatically enhances supernova remnant visibility';
      }
      return 'OIII filter provides maximum contrast enhancement';
    case 'uhc':
      return 'UHC filter recommended - passes both OIII and H-beta emission lines for good contrast';
    case 'h_beta':
      return 'H-beta filter required - this object emits primarily in the H-beta line (486nm)';
    case 'neodymium':
      return 'Neodymium filter enhances colors and reduces skyglow for planetary observation';
    case 'nd':
      return 'ND filter reduces brightness for comfortable viewing';
    default:
      return `${getFilterDisplayName(filterType)} recommended for this object`;
  }
}

function getSecondaryFilterReason(category: string, filterType: ExtendedFilterType): string {
  switch (filterType) {
    case 'uhc':
      return 'UHC is a good alternative if OIII unavailable - shows slightly larger extent';
    case 'oiii':
      return 'OIII provides maximum contrast but shows smaller area than UHC';
    case 'cls':
      return 'CLS broadband filter may help in light-polluted conditions';
    case 'neodymium':
      return 'Neodymium enhances contrast and reduces glare';
    case 'none':
      return 'Unfiltered view also works well and shows natural appearance';
    default:
      return `${getFilterDisplayName(filterType)} can be used as an alternative`;
  }
}

function getFilterEffectiveness(filterType: ExtendedFilterType, category: string): 1|2|3|4|5 {
  // Return effectiveness rating based on filter type and object category
  if (filterType === 'none') {
    // No filter is effective for: reflection nebulae, galaxies, clusters
    if (['reflection_nebula', 'galaxy', 'globular_cluster', 'open_cluster', 'double_star'].includes(category)) {
      return 5;
    }
    return 3;
  }
  
  if (filterType === 'oiii') {
    if (['planetary_nebula', 'supernova_remnant'].includes(category)) return 5;
    if (category === 'emission_nebula') return 4;
    return 2;
  }
  
  if (filterType === 'uhc') {
    if (['emission_nebula', 'nebula'].includes(category)) return 5;
    if (['planetary_nebula', 'supernova_remnant'].includes(category)) return 4;
    return 3;
  }
  
  if (filterType === 'h_beta') {
    if (category === 'dark_nebula') return 5;
    return 2;
  }
  
  if (filterType === 'neodymium') {
    if (category === 'planet') return 5;
    if (category === 'moon') return 4;
    return 2;
  }
  
  if (filterType === 'nd' || filterType === 'variable_polarizer') {
    if (category === 'moon') return 5;
    return 1;
  }
  
  return 3;
}

// Smart Eyepiece Recommendation Engine with Power Class
interface EyepieceRecommendation {
  eyepiece: Eyepiece;
  barlow?: Barlow;
  magnification: number;
  exitPupil: number;
  reason: string;
}

function recommendEyepiece(
  telescope: Telescope,
  eyepieces: Eyepiece[],
  barlows: Barlow[],
  targetObject: CelestialObject,
  powerClass: PowerClass = 'MID',
  nightContext?: NightContext
): EyepieceRecommendation | null {
  if (eyepieces.length === 0) return null;
  
  const seeingScore = nightContext?.seeingScore ?? 2;
  // Parse object's angular size for size-aware exit pupil adjustments
  const objectAngularSize = parseAngularSize(targetObject.size) ?? undefined;
  const rules = getCategoryRules(targetObject.category, seeingScore, objectAngularSize);
  
  // Adjust exit pupil targets based on power class
  let targetExitPupilMin = rules.exitPupilMin;
  let targetExitPupilMax = rules.exitPupilMax;
  let useBarlowPreference = false;
  
  switch (powerClass) {
    case 'HIGH':
      // Use higher magnification (smaller exit pupil) when conditions allow
      if (rules.allowHighPower) {
        targetExitPupilMax = Math.min(targetExitPupilMax, 1.5);
        useBarlowPreference = true;
      }
      break;
    case 'LOW':
      // Use lower magnification (larger exit pupil) in poor conditions
      targetExitPupilMin = Math.max(targetExitPupilMin, 3.0);
      useBarlowPreference = false;
      break;
    case 'MID':
    default:
      // Use middle of the range
      break;
  }
  
  // Use size-aware ideal from rules (not midpoint) for proper scoring of large extended objects
  const idealExitPupil = rules.idealExitPupil;
  
  // Find best eyepiece/barlow combination
  let bestCombo: { eyepiece: Eyepiece; barlow?: Barlow; score: number; mag: number; exitPupil: number; reason: string } | null = null;
  
  for (const eyepiece of eyepieces) {
    // Without barlow
    const mag1 = telescope.focalLength / eyepiece.focalLength;
    const exitPupil1 = telescope.aperture / mag1;
    
    // Check if within acceptable exit pupil range
    const inRange1 = exitPupil1 >= targetExitPupilMin * 0.8 && exitPupil1 <= targetExitPupilMax * 1.2;
    let score1 = inRange1 ? 100 : 50;
    score1 -= Math.abs(exitPupil1 - idealExitPupil) * 10;
    
    if (!bestCombo || score1 > bestCombo.score) {
      bestCombo = {
        eyepiece,
        score: score1,
        mag: mag1,
        exitPupil: exitPupil1,
        reason: `${Math.round(mag1)}x (${exitPupil1.toFixed(1)}mm exit pupil) - ${powerClass} power mode`,
      };
    }
    
    // With barlow (only if allowed by power class or object type)
    if (rules.allowHighPower || powerClass === 'HIGH') {
      for (const barlow of barlows) {
        const mag2 = (telescope.focalLength * barlow.factor) / eyepiece.focalLength;
        const exitPupil2 = telescope.aperture / mag2;
        
        const inRange2 = exitPupil2 >= targetExitPupilMin * 0.8 && exitPupil2 <= targetExitPupilMax * 1.2;
        let score2 = inRange2 ? 100 : 50;
        score2 -= Math.abs(exitPupil2 - idealExitPupil) * 10;
        
        // Bonus for barlow if preferred
        if (useBarlowPreference && inRange2) score2 += 5;
        
        if (score2 > bestCombo.score) {
          bestCombo = {
            eyepiece,
            barlow,
            score: score2,
            mag: mag2,
            exitPupil: exitPupil2,
            reason: `${Math.round(mag2)}x with ${barlow.factor}x barlow (${exitPupil2.toFixed(1)}mm exit pupil) - optimal for ${powerClass} power`,
          };
        }
      }
    }
  }
  
  if (bestCombo) {
    return {
      eyepiece: bestCombo.eyepiece,
      barlow: bestCombo.barlow,
      magnification: Math.round(bestCombo.mag * 10) / 10,
      exitPupil: Math.round(bestCombo.exitPupil * 100) / 100,
      reason: bestCombo.reason,
    };
  }
  
  return null;
}

// ============================================================================
// IMAGING RECOMMENDATION ENGINE - Per spec thresholds
// ============================================================================

type ImagingFeasibility = 'yes' | 'borderline' | 'no';
type CameraType = 'astrocam' | 'smartphone' | 'dslr' | 'either';

interface ImagingSettings {
  exposureRange: string;
  gainOrIso: string;
  frames?: string;
  notes: string;
}

interface ImagingRecommendation {
  feasibility: ImagingFeasibility;
  preferredCamera: CameraType;
  fallbackCamera?: CameraType;
  settings: ImagingSettings;
  reason: string;
}

function getImagingFeasibility(
  category: string,
  planetScore: number,
  dsoScore: number,
  bortle: number
): { feasibility: ImagingFeasibility; reason: string } {
  switch (category) {
    case 'planet':
    case 'moon':
      // Planet Imaging: PlanetScore ≥3 → Yes, =2 → Borderline, <2 → No
      if (planetScore >= 3) return { feasibility: 'yes', reason: 'Excellent conditions for planetary imaging' };
      if (planetScore === 2) return { feasibility: 'borderline', reason: 'Marginal conditions - imaging possible but results may vary' };
      return { feasibility: 'no', reason: 'Poor conditions - not recommended for imaging' };
      
    case 'nebula':
    case 'emission_nebula':
    case 'mixed_nebula':
    case 'planetary_nebula':
    case 'supernova_remnant':
      // Bright Nebula Imaging: DsoScore ≥4 → Yes, =3 → Borderline, <3 → No
      if (dsoScore >= 4) return { feasibility: 'yes', reason: 'Good conditions for nebula imaging' };
      if (dsoScore >= 3) return { feasibility: 'borderline', reason: 'Possible but requires longer exposures' };
      return { feasibility: 'no', reason: 'Too much interference for nebula imaging' };
      
    case 'reflection_nebula':
      // Reflection nebulae need dark skies like galaxies (broadband light)
      if (bortle <= 5 && dsoScore >= 4) return { feasibility: 'yes', reason: 'Dark skies for reflection nebula imaging' };
      if (bortle <= 5 && dsoScore >= 3) return { feasibility: 'borderline', reason: 'Possible with longer exposures' };
      return { feasibility: 'no', reason: 'Reflection nebulae need dark skies (Bortle ≤5)' };
      
    case 'dark_nebula':
      // Dark nebulae require very dark skies and are imaged against emission backgrounds
      if (bortle <= 4 && dsoScore >= 4) return { feasibility: 'yes', reason: 'Very dark skies ideal for dark nebula imaging' };
      if (bortle <= 5 && dsoScore >= 3) return { feasibility: 'borderline', reason: 'Marginal conditions - may need H-alpha filter' };
      return { feasibility: 'no', reason: 'Dark nebulae require very dark skies (Bortle ≤4)' };
      
    case 'galaxy':
      // Galaxy Imaging: Bortle ≤5 AND DsoScore ≥4 → Yes, else No
      if (bortle <= 5 && dsoScore >= 4) return { feasibility: 'yes', reason: 'Dark skies and good conditions for galaxy imaging' };
      if (bortle <= 5 && dsoScore >= 3) return { feasibility: 'borderline', reason: 'Possible with longer exposures' };
      return { feasibility: 'no', reason: 'Requires darker skies (Bortle ≤5) and better conditions' };
      
    case 'open_cluster':
    case 'globular_cluster':
    case 'asterism':
      // Cluster/Asterism Imaging: Always possible - bright stars
      return { feasibility: 'yes', reason: 'Star groups are relatively easy to image in most conditions' };
      
    case 'double_star':
      if (planetScore >= 2) return { feasibility: 'yes', reason: 'Good seeing for double star imaging' };
      return { feasibility: 'borderline', reason: 'Poor seeing may blur close doubles' };
      
    case 'comet':
      // Comets are special - depend on comet brightness and sky conditions
      if (dsoScore >= 3) return { feasibility: 'yes', reason: 'Good conditions for comet imaging - capture tail details' };
      return { feasibility: 'borderline', reason: 'Imaging possible but tail may be washed out' };
      
    case 'meteor_shower':
      // Meteor showers need clear, dark skies - no telescope needed
      if (bortle <= 5 && dsoScore >= 4) return { feasibility: 'yes', reason: 'Dark skies ideal for meteor photography' };
      if (bortle <= 6 && dsoScore >= 3) return { feasibility: 'borderline', reason: 'Some meteors visible but fainter ones may be lost' };
      return { feasibility: 'no', reason: 'Light pollution will obscure all but brightest meteors' };
      
    default:
      if (dsoScore >= 3) return { feasibility: 'borderline', reason: 'Imaging may be possible with appropriate settings' };
      return { feasibility: 'no', reason: 'Not recommended for imaging' };
  }
}

function getImagingSettings(category: string, cameraType: CameraType): ImagingSettings {
  switch (category) {
    case 'planet':
    case 'moon':
      if (cameraType === 'astrocam') {
        return {
          exposureRange: '1-10ms',
          gainOrIso: 'Medium gain',
          frames: '2000-10000 frames',
          notes: 'Use video mode, stack best 10-30% of frames'
        };
      } else {
        return {
          exposureRange: '1/500s - 1/100s',
          gainOrIso: 'ISO 100-400',
          notes: 'Use burst mode, manual focus on limb'
        };
      }
      
    case 'nebula':
    case 'emission_nebula':
    case 'mixed_nebula':
      if (cameraType === 'astrocam') {
        return {
          exposureRange: '5-30s',
          gainOrIso: 'High gain',
          frames: '50-200 frames',
          notes: 'Stack multiple exposures, use UHC filter'
        };
      } else {
        return {
          exposureRange: '1-4s',
          gainOrIso: 'ISO 3200-6400',
          frames: '200-600 frames',
          notes: 'Use tracking mount, stack exposures'
        };
      }
      
    case 'reflection_nebula':
      // Reflection nebulae reflect starlight - no narrowband filters
      if (cameraType === 'astrocam') {
        return {
          exposureRange: '10-60s',
          gainOrIso: 'Medium-high gain',
          frames: '100-300 frames',
          notes: 'No narrowband filters - reflection nebulae show continuum light'
        };
      } else {
        return {
          exposureRange: '2-4s',
          gainOrIso: 'ISO 3200-6400',
          frames: '200-500 frames',
          notes: 'Like galaxies - broadband light, no narrowband filters'
        };
      }
      
    case 'dark_nebula':
      // Dark nebulae are silhouettes against emission/reflection backgrounds
      return {
        exposureRange: '30-120s',
        gainOrIso: cameraType === 'astrocam' ? 'High gain' : 'ISO 3200-6400',
        frames: '50-150 frames',
        notes: 'H-alpha filter recommended - images silhouette against emission background'
      };
      
    case 'planetary_nebula':
      return {
        exposureRange: '2-10s',
        gainOrIso: cameraType === 'astrocam' ? 'Medium-high gain' : 'ISO 1600-3200',
        frames: '100-300 frames',
        notes: 'Small targets - use higher magnification'
      };
      
    case 'supernova_remnant':
      return {
        exposureRange: '10-60s',
        gainOrIso: 'High gain/ISO',
        frames: '100+ frames',
        notes: 'Requires UHC/OIII filter and dark skies'
      };
      
    case 'galaxy':
      if (cameraType === 'astrocam') {
        return {
          exposureRange: '10-60s',
          gainOrIso: 'Medium-high gain',
          frames: '100-300 frames',
          notes: 'Long total integration time needed'
        };
      } else {
        return {
          exposureRange: '2-4s',
          gainOrIso: 'ISO 3200-6400',
          frames: '200-500 frames',
          notes: 'Challenging - astrocam strongly preferred'
        };
      }
      
    case 'globular_cluster':
      return {
        exposureRange: '0.5-2s',
        gainOrIso: cameraType === 'astrocam' ? 'Medium gain' : 'ISO 1600-3200',
        frames: '50-150 frames',
        notes: 'Avoid overexposing core'
      };
      
    case 'open_cluster':
    case 'asterism':
      return {
        exposureRange: '1-5s',
        gainOrIso: cameraType === 'astrocam' ? 'Medium gain' : 'ISO 800-1600',
        frames: '30-100 frames',
        notes: 'Wide field often preferred'
      };
      
    case 'double_star':
      return {
        exposureRange: '1-100ms',
        gainOrIso: 'Low-medium gain/ISO',
        notes: 'Short exposures to freeze seeing'
      };
      
    case 'comet':
      // Comets need special treatment - track comet or stars
      if (cameraType === 'astrocam') {
        return {
          exposureRange: '30-120s',
          gainOrIso: 'Medium-high gain',
          frames: '20-100 frames',
          notes: 'Track on comet for sharp nucleus, or stars for sharp starfield'
        };
      } else {
        return {
          exposureRange: '5-30s',
          gainOrIso: 'ISO 1600-3200',
          frames: '50-200 frames',
          notes: 'Widefield lens recommended to capture tail'
        };
      }
      
    case 'meteor_shower':
      // Meteors need very different approach - wide angle, no telescope
      return {
        exposureRange: '15-30s',
        gainOrIso: 'ISO 3200-6400',
        frames: 'Continuous shooting',
        notes: 'Use wide-angle lens on tripod, NOT telescope. Point at radiant.'
      };
      
    default:
      return {
        exposureRange: '1-10s',
        gainOrIso: 'ISO 1600-3200',
        notes: 'Experiment with settings'
      };
  }
}

function recommendImaging(
  category: string,
  nightContext: NightContext,
  bortle: number
): ImagingRecommendation {
  const { feasibility, reason } = getImagingFeasibility(
    category,
    nightContext.planetScore,
    nightContext.dsoScore,
    bortle
  );
  
  // Camera selection per object type
  let preferredCamera: CameraType;
  let fallbackCamera: CameraType | undefined;
  
  switch (category) {
    case 'planet':
    case 'moon':
      preferredCamera = 'astrocam';
      fallbackCamera = 'smartphone';
      break;
    case 'galaxy':
    case 'reflection_nebula':
    case 'dark_nebula':
      preferredCamera = 'astrocam';
      fallbackCamera = undefined; // AstroCam only - faint broadband targets
      break;
    case 'nebula':
    case 'emission_nebula':
    case 'mixed_nebula':
    case 'planetary_nebula':
    case 'supernova_remnant':
      preferredCamera = 'astrocam';
      fallbackCamera = 'dslr';
      break;
    case 'open_cluster':
    case 'globular_cluster':
    case 'asterism':
      preferredCamera = 'either';
      break;
    case 'double_star':
      preferredCamera = 'astrocam';
      fallbackCamera = 'smartphone';
      break;
    case 'comet':
      preferredCamera = 'dslr'; // Widefield preferred for tails
      fallbackCamera = 'astrocam';
      break;
    case 'meteor_shower':
      preferredCamera = 'dslr'; // Wide angle lens required, not through telescope
      fallbackCamera = 'smartphone';
      break;
    default:
      preferredCamera = 'either';
  }
  
  const settings = getImagingSettings(category, preferredCamera === 'either' ? 'astrocam' : preferredCamera);
  
  return {
    feasibility,
    preferredCamera,
    fallbackCamera,
    settings,
    reason,
  };
}

// ============================================================================
// COMPLETE OBSERVATION RECOMMENDATION - Combines all engines
// ============================================================================

interface CompleteRecommendation {
  nightContext: NightContext;
  eyepiece: EyepieceRecommendation | null;
  filter: FilterRecommendation;
  imaging: ImagingRecommendation;
}

function getCompleteRecommendation(
  telescope: Telescope | null,
  eyepieces: Eyepiece[],
  barlows: Barlow[],
  targetObject: CelestialObject,
  nightContext: NightContext,
  bortle: number,
  moonIllumination?: number
): CompleteRecommendation {
  const eyepiece = telescope
    ? recommendEyepiece(telescope, eyepieces, barlows, targetObject, nightContext.powerClass, nightContext)
    : null;
  
  const filter = recommendFilter(
    targetObject.category, 
    nightContext.seeingScore,
    targetObject.catalogId,
    targetObject.name,
    bortle,
    moonIllumination
  );
  const imaging = recommendImaging(targetObject.category, nightContext, bortle);
  
  return {
    nightContext,
    eyepiece,
    filter,
    imaging,
  };
}

export async function registerRoutes(
  server: Server,
  app: Express
): Promise<void> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Dashboard endpoint
  app.get('/api/dashboard', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      
      const [telescopesList, locationsList, sessionsList, objectsList] = await Promise.all([
        storage.getTelescopes(userId),
        storage.getLocations(userId),
        storage.getSessions(userId),
        storage.getObjects(),
      ]);

      // Get suggested objects (hot objects or random selection)
      const suggestedObjects = objectsList.filter(o => o.isHot).slice(0, 6);

      // Get recent sessions with observation counts
      const recentSessions = sessionsList.slice(0, 5).map(s => ({
        ...s,
        observationCount: s.observations?.length ?? 0,
      }));

      // Calculate tonight's score based on default/first location
      // Simulated moon phase (would come from astronomical API in production)
      const currentDate = new Date();
      const moonPhase = (Math.sin(currentDate.getDate() / 29.5 * Math.PI * 2) + 1) / 2;
      
      // Use first location's Bortle scale or default to 5
      const defaultBortle = locationsList.length > 0 ? locationsList[0].bortle : 5;
      const tonightScore = calculateNightScores(defaultBortle, moonPhase);

      res.json({
        telescopes: telescopesList,
        locations: locationsList,
        recentSessions,
        suggestedObjects: suggestedObjects.length > 0 ? suggestedObjects : objectsList.slice(0, 6),
        tonightScore,
        moonPhase: Math.round(moonPhase * 100),
      });
    } catch (error) {
      console.error("Error fetching dashboard:", error);
      res.status(500).json({ message: "Failed to fetch dashboard data" });
    }
  });

  // Night Score endpoint
  app.get('/api/score', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const locationId = req.query.locationId ? parseInt(req.query.locationId) : null;
      
      const locationsList = await storage.getLocations(userId);
      
      // Simulated moon phase
      const currentDate = new Date();
      const moonPhase = (Math.sin(currentDate.getDate() / 29.5 * Math.PI * 2) + 1) / 2;
      
      // Use specified location or first available
      let bortleScale = 5;
      if (locationId) {
        const location = locationsList.find(l => l.id === locationId);
        if (location) bortleScale = location.bortle;
      } else if (locationsList.length > 0) {
        bortleScale = locationsList[0].bortle;
      }
      
      const scores = calculateNightScores(bortleScale, moonPhase);
      
      res.json({
        ...scores,
        moonPhase: Math.round(moonPhase * 100),
        bortleScale,
      });
    } catch (error) {
      console.error("Error calculating score:", error);
      res.status(500).json({ message: "Failed to calculate score" });
    }
  });

  // Optics calculation endpoint
  app.post('/api/optics/calculate', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const { telescopeId, eyepieceId, barlowId } = req.body;
      
      const telescopesList = await storage.getTelescopes(userId);
      const eyepiecesList = await storage.getEyepieces(userId);
      const barlowsList = await storage.getBarlows(userId);
      
      const telescope = telescopesList.find(t => t.id === telescopeId);
      const eyepiece = eyepiecesList.find(e => e.id === eyepieceId);
      const barlow = barlowId ? barlowsList.find(b => b.id === barlowId) : undefined;
      
      if (!telescope || !eyepiece) {
        return res.status(400).json({ message: "Telescope and eyepiece required" });
      }
      
      const result = calculateOpticsParams(telescope, eyepiece, barlow);
      res.json(result);
    } catch (error) {
      console.error("Error calculating optics:", error);
      res.status(500).json({ message: "Failed to calculate optics" });
    }
  });

  // Wizard recommendations endpoint
  app.get('/api/wizard/recommendations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const telescopeId = req.query.telescopeId ? parseInt(req.query.telescopeId) : null;
      const locationId = req.query.locationId ? parseInt(req.query.locationId) : null;
      const category = req.query.category || null;
      
      const [telescopesList, eyepiecesList, barlowsList, locationsList, objectsList] = await Promise.all([
        storage.getTelescopes(userId),
        storage.getEyepieces(userId),
        storage.getBarlows(userId),
        storage.getLocations(userId),
        storage.getObjects(),
      ]);
      
      // Get selected telescope or first available
      const telescope = telescopeId 
        ? telescopesList.find(t => t.id === telescopeId)
        : telescopesList[0];
      
      // Get location for scoring
      const location = locationId
        ? locationsList.find(l => l.id === locationId)
        : locationsList[0];
      
      // Filter objects by category if specified
      let filteredObjects = objectsList;
      if (category) {
        filteredObjects = objectsList.filter(o => o.category === category);
      }
      
      // Calculate tonight's score
      const currentDate = new Date();
      const moonPhase = (Math.sin(currentDate.getDate() / 29.5 * Math.PI * 2) + 1) / 2;
      const bortleScale = location?.bortle || 5;
      const scores = calculateNightScores(bortleScale, moonPhase);
      
      // Sort objects by difficulty and visibility
      const recommendations = filteredObjects
        .filter(obj => {
          // Filter based on moon interference
          if (moonPhase > 0.5 && obj.moonInterference && obj.moonInterference > 3) {
            return false;
          }
          return true;
        })
        .map(obj => {
          const recommendation = telescope && eyepiecesList.length > 0
            ? recommendEyepiece(telescope, eyepiecesList, barlowsList, obj)
            : null;
          
          return {
            object: obj,
            recommendation,
            score: obj.isHot ? 100 : (obj.difficulty === 'easy' ? 80 : obj.difficulty === 'moderate' ? 60 : 40),
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      
      res.json({
        recommendations,
        scores,
        moonPhase: Math.round(moonPhase * 100),
        telescope,
        location,
      });
    } catch (error) {
      console.error("Error getting wizard recommendations:", error);
      res.status(500).json({ message: "Failed to get recommendations" });
    }
  });

  // Equipment endpoints
  app.get('/api/equipment', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      
      const [telescopesList, eyepiecesList, barlowsList, filtersList, camerasList, accessoriesList] = await Promise.all([
        storage.getTelescopes(userId),
        storage.getEyepieces(userId),
        storage.getBarlows(userId),
        storage.getFilters(userId),
        storage.getCameras(userId),
        storage.getAccessories(userId),
      ]);

      res.json({
        telescopes: telescopesList,
        eyepieces: eyepiecesList,
        barlows: barlowsList,
        filters: filtersList,
        cameras: camerasList,
        accessories: accessoriesList,
      });
    } catch (error) {
      console.error("Error fetching equipment:", error);
      res.status(500).json({ message: "Failed to fetch equipment" });
    }
  });

  // Individual equipment GET endpoints
  app.get('/api/eyepieces', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const eyepieces = await storage.getEyepieces(userId);
      res.json(eyepieces);
    } catch (error) {
      console.error("Error fetching eyepieces:", error);
      res.status(500).json({ message: "Failed to fetch eyepieces" });
    }
  });

  app.get('/api/barlows', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const barlows = await storage.getBarlows(userId);
      res.json(barlows);
    } catch (error) {
      console.error("Error fetching barlows:", error);
      res.status(500).json({ message: "Failed to fetch barlows" });
    }
  });

  app.get('/api/filters', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const filters = await storage.getFilters(userId);
      res.json(filters);
    } catch (error) {
      console.error("Error fetching filters:", error);
      res.status(500).json({ message: "Failed to fetch filters" });
    }
  });

  app.get('/api/cameras', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const cameras = await storage.getCameras(userId);
      res.json(cameras);
    } catch (error) {
      console.error("Error fetching cameras:", error);
      res.status(500).json({ message: "Failed to fetch cameras" });
    }
  });

  // Telescopes
  app.post('/api/telescopes', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const data = insertTelescopeSchema.parse({ ...req.body, userId });
      const telescope = await storage.createTelescope(data);
      res.json(telescope);
    } catch (error) {
      console.error("Error creating telescope:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create telescope" });
      }
    }
  });

  app.patch('/api/telescopes/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      const data = insertTelescopeSchema.partial().parse(req.body);
      const telescope = await storage.updateTelescope(id, userId, data);
      res.json(telescope);
    } catch (error) {
      console.error("Error updating telescope:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update telescope" });
      }
    }
  });

  app.get('/api/telescopes/:id/usage', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const count = await storage.countObservationsUsingTelescope(id);
      res.json({ count });
    } catch (error) {
      console.error("Error counting telescope usage:", error);
      res.status(500).json({ message: "Failed to count telescope usage" });
    }
  });

  app.delete('/api/telescopes/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      const force = req.query.force === 'true';
      
      // Check if telescope is used in observations
      const usageCount = await storage.countObservationsUsingTelescope(id);
      if (usageCount > 0 && !force) {
        return res.status(409).json({ 
          message: `This telescope is used in ${usageCount} observation(s). Delete anyway?`,
          usageCount,
          requiresConfirmation: true 
        });
      }
      
      // If force=true or no usage, nullify references and delete
      if (usageCount > 0) {
        await storage.nullifyTelescopeInObservations(id);
      }
      await storage.deleteTelescope(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting telescope:", error);
      res.status(500).json({ message: "Failed to delete telescope" });
    }
  });

  // User Preferences (favorites)
  app.get('/api/user/preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const preferences = await storage.getUserPreferences(userId);
      res.json(preferences);
    } catch (error) {
      console.error("Error fetching user preferences:", error);
      res.status(500).json({ message: "Failed to fetch preferences" });
    }
  });

  const updateUserPreferencesSchema = z.object({
    favoriteTelescopeId: z.number().int().positive().nullable().optional(),
    favoriteLocationId: z.number().int().positive().nullable().optional(),
  });

  app.patch('/api/user/preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const data = updateUserPreferencesSchema.parse(req.body);
      
      if (data.favoriteTelescopeId !== undefined) {
        await storage.setFavoriteTelescope(userId, data.favoriteTelescopeId);
      }
      if (data.favoriteLocationId !== undefined) {
        await storage.setFavoriteLocation(userId, data.favoriteLocationId);
      }
      
      const preferences = await storage.getUserPreferences(userId);
      res.json(preferences);
    } catch (error) {
      console.error("Error updating user preferences:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update preferences" });
      }
    }
  });

  // Eyepieces
  app.post('/api/eyepieces', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const data = insertEyepieceSchema.parse({ ...req.body, userId });
      const eyepiece = await storage.createEyepiece(data);
      res.json(eyepiece);
    } catch (error) {
      console.error("Error creating eyepiece:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create eyepiece" });
      }
    }
  });

  app.patch('/api/eyepieces/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      const data = insertEyepieceSchema.partial().parse(req.body);
      const eyepiece = await storage.updateEyepiece(id, userId, data);
      res.json(eyepiece);
    } catch (error) {
      console.error("Error updating eyepiece:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update eyepiece" });
      }
    }
  });

  app.get('/api/eyepieces/:id/usage', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const count = await storage.countObservationsUsingEyepiece(id);
      res.json({ count });
    } catch (error) {
      console.error("Error counting eyepiece usage:", error);
      res.status(500).json({ message: "Failed to count eyepiece usage" });
    }
  });

  app.delete('/api/eyepieces/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      const force = req.query.force === 'true';
      
      const usageCount = await storage.countObservationsUsingEyepiece(id);
      if (usageCount > 0 && !force) {
        return res.status(409).json({ 
          message: `This eyepiece is used in ${usageCount} observation(s). Delete anyway?`,
          usageCount,
          requiresConfirmation: true 
        });
      }
      
      if (usageCount > 0) {
        await storage.nullifyEyepieceInObservations(id);
      }
      await storage.deleteEyepiece(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting eyepiece:", error);
      res.status(500).json({ message: "Failed to delete eyepiece" });
    }
  });

  // Barlows
  app.post('/api/barlows', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const data = insertBarlowSchema.parse({ ...req.body, userId });
      const barlow = await storage.createBarlow(data);
      res.json(barlow);
    } catch (error) {
      console.error("Error creating barlow:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create barlow" });
      }
    }
  });

  app.patch('/api/barlows/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      const data = insertBarlowSchema.partial().parse(req.body);
      const barlow = await storage.updateBarlow(id, userId, data);
      res.json(barlow);
    } catch (error) {
      console.error("Error updating barlow:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update barlow" });
      }
    }
  });

  app.get('/api/barlows/:id/usage', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const count = await storage.countObservationsUsingBarlow(id);
      res.json({ count });
    } catch (error) {
      console.error("Error counting barlow usage:", error);
      res.status(500).json({ message: "Failed to count barlow usage" });
    }
  });

  app.delete('/api/barlows/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      const force = req.query.force === 'true';
      
      const usageCount = await storage.countObservationsUsingBarlow(id);
      if (usageCount > 0 && !force) {
        return res.status(409).json({ 
          message: `This barlow is used in ${usageCount} observation(s). Delete anyway?`,
          usageCount,
          requiresConfirmation: true 
        });
      }
      
      if (usageCount > 0) {
        await storage.nullifyBarlowInObservations(id);
      }
      await storage.deleteBarlow(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting barlow:", error);
      res.status(500).json({ message: "Failed to delete barlow" });
    }
  });

  // Filters
  app.post('/api/filters', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const data = insertFilterSchema.parse({ ...req.body, userId });
      const filter = await storage.createFilter(data);
      res.json(filter);
    } catch (error) {
      console.error("Error creating filter:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create filter" });
      }
    }
  });

  app.patch('/api/filters/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      const data = insertFilterSchema.partial().parse(req.body);
      const filter = await storage.updateFilter(id, userId, data);
      res.json(filter);
    } catch (error) {
      console.error("Error updating filter:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update filter" });
      }
    }
  });

  app.get('/api/filters/:id/usage', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const count = await storage.countObservationsUsingFilter(id);
      res.json({ count });
    } catch (error) {
      console.error("Error counting filter usage:", error);
      res.status(500).json({ message: "Failed to count filter usage" });
    }
  });

  app.delete('/api/filters/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      const force = req.query.force === 'true';
      
      const usageCount = await storage.countObservationsUsingFilter(id);
      if (usageCount > 0 && !force) {
        return res.status(409).json({ 
          message: `This filter is used in ${usageCount} observation(s). Delete anyway?`,
          usageCount,
          requiresConfirmation: true 
        });
      }
      
      if (usageCount > 0) {
        await storage.nullifyFilterInObservations(id);
      }
      await storage.deleteFilter(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting filter:", error);
      res.status(500).json({ message: "Failed to delete filter" });
    }
  });

  // Cameras
  app.post('/api/cameras', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const data = insertCameraSchema.parse({ ...req.body, userId });
      const camera = await storage.createCamera(data);
      res.json(camera);
    } catch (error) {
      console.error("Error creating camera:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create camera" });
      }
    }
  });

  app.patch('/api/cameras/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      const data = insertCameraSchema.partial().parse(req.body);
      const camera = await storage.updateCamera(id, userId, data);
      res.json(camera);
    } catch (error) {
      console.error("Error updating camera:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update camera" });
      }
    }
  });

  app.get('/api/cameras/:id/usage', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const count = await storage.countObservationsUsingCamera(id);
      res.json({ count });
    } catch (error) {
      console.error("Error counting camera usage:", error);
      res.status(500).json({ message: "Failed to count camera usage" });
    }
  });

  app.delete('/api/cameras/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      const force = req.query.force === 'true';
      
      const usageCount = await storage.countObservationsUsingCamera(id);
      if (usageCount > 0 && !force) {
        return res.status(409).json({ 
          message: `This camera is used in ${usageCount} observation(s). Delete anyway?`,
          usageCount,
          requiresConfirmation: true 
        });
      }
      
      if (usageCount > 0) {
        await storage.nullifyCameraInObservations(id);
      }
      await storage.deleteCamera(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting camera:", error);
      res.status(500).json({ message: "Failed to delete camera" });
    }
  });

  // Accessories
  app.get('/api/accessories', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const accessoriesList = await storage.getAccessories(userId);
      res.json(accessoriesList);
    } catch (error) {
      console.error("Error fetching accessories:", error);
      res.status(500).json({ message: "Failed to fetch accessories" });
    }
  });

  app.post('/api/accessories', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const data = insertAccessorySchema.parse({ ...req.body, userId });
      const accessory = await storage.createAccessory(data);
      res.json(accessory);
    } catch (error) {
      console.error("Error creating accessory:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create accessory" });
      }
    }
  });

  app.patch('/api/accessories/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      const data = insertAccessorySchema.partial().parse(req.body);
      const accessory = await storage.updateAccessory(id, userId, data);
      res.json(accessory);
    } catch (error) {
      console.error("Error updating accessory:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update accessory" });
      }
    }
  });

  app.delete('/api/accessories/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      await storage.deleteAccessory(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting accessory:", error);
      res.status(500).json({ message: "Failed to delete accessory" });
    }
  });

  // Finders
  app.get('/api/finders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const findersList = await storage.getFinders(userId);
      res.json(findersList);
    } catch (error) {
      console.error("Error fetching finders:", error);
      res.status(500).json({ message: "Failed to fetch finders" });
    }
  });

  app.post('/api/finders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const data = insertFinderSchema.parse({ ...req.body, userId });
      const finder = await storage.createFinder(data);
      res.json(finder);
    } catch (error) {
      console.error("Error creating finder:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create finder" });
      }
    }
  });

  app.patch('/api/finders/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      const data = insertFinderSchema.partial().parse(req.body);
      const finder = await storage.updateFinder(id, userId, data);
      res.json(finder);
    } catch (error) {
      console.error("Error updating finder:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update finder" });
      }
    }
  });

  app.get('/api/finders/:id/usage', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const count = await storage.countObservationsUsingFinder(id);
      res.json({ count });
    } catch (error) {
      console.error("Error counting finder usage:", error);
      res.status(500).json({ message: "Failed to count finder usage" });
    }
  });

  app.delete('/api/finders/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      const force = req.query.force === 'true';
      
      const usageCount = await storage.countObservationsUsingFinder(id);
      if (usageCount > 0 && !force) {
        return res.status(409).json({ 
          message: `This finder is used in ${usageCount} observation(s). Delete anyway?`,
          usageCount,
          requiresConfirmation: true 
        });
      }
      
      if (usageCount > 0) {
        await storage.nullifyFinderInObservations(id);
      }
      await storage.deleteFinder(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting finder:", error);
      res.status(500).json({ message: "Failed to delete finder" });
    }
  });

  // Optical Modifiers (Focal Reducers & Coma Correctors)
  app.get('/api/optical-modifiers', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const modifiersList = await storage.getOpticalModifiers(userId);
      res.json(modifiersList);
    } catch (error) {
      console.error("Error fetching optical modifiers:", error);
      res.status(500).json({ message: "Failed to fetch optical modifiers" });
    }
  });

  app.post('/api/optical-modifiers', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const data = insertOpticalModifierSchema.parse({ ...req.body, userId });
      const modifier = await storage.createOpticalModifier(data);
      res.json(modifier);
    } catch (error) {
      console.error("Error creating optical modifier:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create optical modifier" });
      }
    }
  });

  app.patch('/api/optical-modifiers/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      const data = insertOpticalModifierSchema.partial().parse(req.body);
      const modifier = await storage.updateOpticalModifier(id, userId, data);
      res.json(modifier);
    } catch (error) {
      console.error("Error updating optical modifier:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update optical modifier" });
      }
    }
  });

  app.get('/api/optical-modifiers/:id/usage', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const count = await storage.countObservationsUsingOpticalModifier(id);
      res.json({ count });
    } catch (error) {
      console.error("Error counting optical modifier usage:", error);
      res.status(500).json({ message: "Failed to count optical modifier usage" });
    }
  });

  app.delete('/api/optical-modifiers/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      const force = req.query.force === 'true';
      
      const usageCount = await storage.countObservationsUsingOpticalModifier(id);
      if (usageCount > 0 && !force) {
        return res.status(409).json({ 
          message: `This optical modifier is used in ${usageCount} observation(s). Delete anyway?`,
          usageCount,
          requiresConfirmation: true 
        });
      }
      
      if (usageCount > 0) {
        await storage.nullifyOpticalModifierInObservations(id);
      }
      await storage.deleteOpticalModifier(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting optical modifier:", error);
      res.status(500).json({ message: "Failed to delete optical modifier" });
    }
  });

  // Locations
  app.get('/api/locations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const locationsList = await storage.getLocations(userId);
      res.json(locationsList);
    } catch (error) {
      console.error("Error fetching locations:", error);
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  app.post('/api/locations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const data = insertLocationSchema.parse({ ...req.body, userId });
      const location = await storage.createLocation(data);
      res.json(location);
    } catch (error) {
      console.error("Error creating location:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create location" });
      }
    }
  });

  app.patch('/api/locations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      const data = insertLocationSchema.partial().parse({ ...req.body, userId });
      const location = await storage.updateLocation(id, userId, data);
      res.json(location);
    } catch (error) {
      console.error("Error updating location:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update location" });
      }
    }
  });

  app.delete('/api/locations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      await storage.deleteLocation(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting location:", error);
      res.status(500).json({ message: "Failed to delete location" });
    }
  });

  // Celestial Objects
  app.get('/api/objects', async (req, res) => {
    try {
      const objectsList = await storage.getObjects();
      res.json(objectsList);
    } catch (error) {
      console.error("Error fetching objects:", error);
      res.status(500).json({ message: "Failed to fetch objects" });
    }
  });

  // Get objects for authenticated user (includes their custom objects)
  app.get('/api/objects/for-user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const objectsList = await storage.getObjectsForUser(userId);
      res.json(objectsList);
    } catch (error) {
      console.error("Error fetching objects for user:", error);
      res.status(500).json({ message: "Failed to fetch objects" });
    }
  });

  // Create custom celestial object
  app.post('/api/custom-objects', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      
      // Minimal validation - only name, catalogId, and category are required
      const { name, catalogId, category, ...optionalFields } = req.body;
      
      if (!name || !catalogId || !category) {
        return res.status(400).json({ 
          message: "Name, catalog ID, and category are required" 
        });
      }

      const data = insertCelestialObjectSchema.parse({
        userId,
        catalogId,
        name,
        category,
        ...optionalFields
      });

      const object = await storage.createObject(data);
      res.status(201).json(object);
    } catch (error) {
      console.error("Error creating custom object:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create custom object" });
      }
    }
  });

  // Delete custom celestial object
  app.delete('/api/custom-objects/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      await storage.deleteCustomObject(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting custom object:", error);
      res.status(500).json({ message: "Failed to delete custom object" });
    }
  });

  // Equipment recommendation for a specific object
  app.get('/api/objects/:objectId/recommendations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const objectId = parseInt(req.params.objectId);
      const locationId = req.query.locationId ? parseInt(req.query.locationId as string) : undefined;
      const telescopeId = req.query.telescopeId ? parseInt(req.query.telescopeId as string) : undefined;

      // Get the object
      const objectsList = await storage.getObjects();
      const targetObject = objectsList.find(o => o.id === objectId);
      if (!targetObject) {
        return res.status(404).json({ message: "Object not found" });
      }

      // Get user's equipment and preferences
      const [telescopes, eyepieces, barlows, filters, locations, userPrefs] = await Promise.all([
        storage.getTelescopes(userId),
        storage.getEyepieces(userId),
        storage.getBarlows(userId),
        storage.getFilters(userId),
        storage.getLocations(userId),
        storage.getUserPreferences(userId),
      ]);

      // Determine location (use specified or favorite/first)
      let location = locationId 
        ? locations.find(l => l.id === locationId)
        : locations.find(l => l.isFavorite) || locations[0];
      
      const bortle = location?.bortle || 5;

      // Get tonight's conditions if logged
      let nightContext: NightContext;
      let hasConditionsLogged = false;
      
      try {
        const today = new Date();
        const conditions = await storage.getTonightConditions(userId, today, location?.id);
        
        if (conditions) {
          hasConditionsLogged = true;
          const maxCloudPct = Math.max(
            conditions.lowCloudPct ?? 0,
            conditions.midCloudPct ?? 0,
            conditions.highCloudPct ?? 0
          );
          
          // Calculate fresh scores from stored conditions using v2.0 engine
          nightContext = calculateNightScores(
            bortle,
            maxCloudPct,
            conditions.seeingArcsec ?? 2,
            conditions.jetStreamIndex ?? 50,
            conditions.humidity ?? 60,
            conditions.moonIllumination ?? 50
          );
        } else {
          // Use default mid conditions when not logged
          nightContext = calculateNightScores(bortle, 50, 2.5, 30, 60, 50);
        }
      } catch {
        // Use default conditions
        nightContext = calculateNightScores(bortle, 50, 2.5, 30, 60, 50);
      }

      // Determine telescope to use: specified > favorite > first (latest added)
      let telescope = null;
      if (telescopeId) {
        telescope = telescopes.find(t => t.id === telescopeId) || null;
      }
      if (!telescope && userPrefs?.favoriteTelescopeId) {
        telescope = telescopes.find(t => t.id === userPrefs.favoriteTelescopeId) || null;
      }
      if (!telescope) {
        telescope = telescopes[0] || null;
      }

      // Get moon illumination from conditions if logged
      let moonIllumination: number | undefined;
      try {
        const today = new Date();
        const conditions = await storage.getTonightConditions(userId, today, location?.id);
        moonIllumination = conditions?.moonIllumination ?? undefined;
      } catch {
        // Use undefined if conditions not available
      }

      // Get complete recommendations
      const recommendation = getCompleteRecommendation(
        telescope,
        eyepieces,
        barlows,
        targetObject,
        nightContext,
        bortle,
        moonIllumination
      );

      // Find matching user filter if one is recommended
      let matchingFilter: typeof filters[0] | null = null;
      if (recommendation.filter.useFilter && recommendation.filter.filterType !== 'none') {
        matchingFilter = filters.find(f => 
          f.type.toLowerCase().includes(recommendation.filter.filterType.toLowerCase()) ||
          recommendation.filter.filterType.toLowerCase().includes(f.type.toLowerCase())
        ) || null;
      }

      res.json({
        objectId,
        objectName: targetObject.name,
        objectCategory: targetObject.category,
        objectSeparation: targetObject.separation ?? null,
        hasConditionsLogged,
        nightContext: {
          powerClass: nightContext.powerClass,
          totalScore: nightContext.totalScore,
          planetScore: nightContext.planetScore,
          dsoScore: nightContext.dsoScore,
        },
        telescope: telescope ? {
          id: telescope.id,
          name: telescope.name,
          aperture: telescope.aperture,
          focalLength: telescope.focalLength,
          type: telescope.type,
          obstructionRatio: telescope.obstructionRatio ?? null,
        } : null,
        eyepiece: recommendation.eyepiece ? {
          id: recommendation.eyepiece.eyepiece.id,
          name: recommendation.eyepiece.eyepiece.name,
          focalLength: recommendation.eyepiece.eyepiece.focalLength,
          apparentFov: recommendation.eyepiece.eyepiece.apparentFov,
          barlow: recommendation.eyepiece.barlow ? {
            id: recommendation.eyepiece.barlow.id,
            name: recommendation.eyepiece.barlow.name,
            factor: recommendation.eyepiece.barlow.factor,
          } : null,
          magnification: recommendation.eyepiece.magnification,
          exitPupil: recommendation.eyepiece.exitPupil,
          reason: recommendation.eyepiece.reason,
        } : null,
        filter: {
          useFilter: recommendation.filter.useFilter,
          filterType: recommendation.filter.filterType,
          reason: recommendation.filter.reason,
          userFilter: matchingFilter ? {
            id: matchingFilter.id,
            name: matchingFilter.name,
            type: matchingFilter.type,
          } : null,
          primaryFilter: recommendation.filter.primaryFilter,
          secondaryFilter: recommendation.filter.secondaryFilter,
          optionalFilters: recommendation.filter.optionalFilters,
          avoidFilters: recommendation.filter.avoidFilters,
          warning: recommendation.filter.warning,
          allRecommendations: recommendation.filter.allRecommendations,
        },
        imaging: {
          feasibility: recommendation.imaging.feasibility,
          preferredCamera: recommendation.imaging.preferredCamera,
          fallbackCamera: recommendation.imaging.fallbackCamera,
          settings: recommendation.imaging.settings,
          reason: recommendation.imaging.reason,
        },
        location: location ? {
          id: location.id,
          name: location.name,
          bortle: location.bortle,
        } : null,
        moonIllumination: moonIllumination ?? null,
      });
    } catch (error) {
      console.error("Error fetching object recommendations:", error);
      res.status(500).json({ message: "Failed to fetch recommendations" });
    }
  });

  // Catalog-based equipment recommendation (for ephemeris bodies like planets/moon)
  // Alias mapping for ephemeris body names to database catalogIds
  const EPHEMERIS_CATALOG_ALIASES: Record<string, string> = {
    'Moon': 'Luna',
    'Sun': 'Sol',  // Not in database but handle gracefully
  };

  app.get('/api/objects/by-catalog/:catalogId/recommendations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      let catalogId = req.params.catalogId;
      const locationId = req.query.locationId ? parseInt(req.query.locationId as string) : undefined;
      const telescopeId = req.query.telescopeId ? parseInt(req.query.telescopeId as string) : undefined;
      const moonIlluminationParam = req.query.moonIllumination ? parseFloat(req.query.moonIllumination as string) : undefined;

      // Apply alias mapping for ephemeris bodies
      if (EPHEMERIS_CATALOG_ALIASES[catalogId]) {
        catalogId = EPHEMERIS_CATALOG_ALIASES[catalogId];
      }

      // Get the object by catalog ID
      const objectsList = await storage.getObjects();
      const targetObject = objectsList.find(o => o.catalogId === catalogId);
      if (!targetObject) {
        return res.status(404).json({ message: `Object with catalogId '${catalogId}' not found` });
      }

      // Get user's equipment and preferences
      const [telescopes, eyepieces, barlows, filters, locations, userPrefs] = await Promise.all([
        storage.getTelescopes(userId),
        storage.getEyepieces(userId),
        storage.getBarlows(userId),
        storage.getFilters(userId),
        storage.getLocations(userId),
        storage.getUserPreferences(userId),
      ]);

      // Determine location (use specified or favorite/first)
      let location = locationId 
        ? locations.find(l => l.id === locationId)
        : locations.find(l => l.isFavorite) || locations[0];
      
      const bortle = location?.bortle || 5;

      // Get tonight's conditions if logged
      let nightContext: NightContext;
      let hasConditionsLogged = false;
      
      try {
        const today = new Date();
        const conditions = await storage.getTonightConditions(userId, today, location?.id);
        
        if (conditions) {
          hasConditionsLogged = true;
          const maxCloudPct = Math.max(
            conditions.lowCloudPct ?? 0,
            conditions.midCloudPct ?? 0,
            conditions.highCloudPct ?? 0
          );
          
          nightContext = calculateNightScores(
            bortle,
            maxCloudPct,
            conditions.seeingArcsec ?? 2,
            conditions.jetStreamIndex ?? 50,
            conditions.humidity ?? 60,
            conditions.moonIllumination ?? 50
          );
        } else {
          nightContext = calculateNightScores(bortle, 50, 2.5, 30, 60, 50);
        }
      } catch {
        nightContext = calculateNightScores(bortle, 50, 2.5, 30, 60, 50);
      }

      // Determine telescope to use: specified > favorite > first (latest added)
      let telescope = null;
      if (telescopeId) {
        telescope = telescopes.find(t => t.id === telescopeId) || null;
      }
      if (!telescope && userPrefs?.favoriteTelescopeId) {
        telescope = telescopes.find(t => t.id === userPrefs.favoriteTelescopeId) || null;
      }
      if (!telescope) {
        telescope = telescopes[0] || null;
      }

      // Get moon illumination from conditions or query param
      let moonIllumination: number | undefined = moonIlluminationParam;
      if (moonIllumination === undefined) {
        try {
          const today = new Date();
          const conditions = await storage.getTonightConditions(userId, today, location?.id);
          moonIllumination = conditions?.moonIllumination ?? undefined;
        } catch {
          // Use undefined if conditions not available
        }
      }

      // Get complete recommendations
      const recommendation = getCompleteRecommendation(
        telescope,
        eyepieces,
        barlows,
        targetObject,
        nightContext,
        bortle,
        moonIllumination
      );

      // Find matching user filter
      let matchingFilter: typeof filters[0] | null = null;
      if (recommendation.filter.useFilter && recommendation.filter.filterType !== 'none') {
        matchingFilter = filters.find(f => 
          f.type.toLowerCase().includes(recommendation.filter.filterType.toLowerCase()) ||
          recommendation.filter.filterType.toLowerCase().includes(f.type.toLowerCase())
        ) || null;
      }

      res.json({
        objectId: targetObject.id,
        catalogId: targetObject.catalogId,
        objectName: targetObject.name,
        objectCategory: targetObject.category,
        objectSeparation: targetObject.separation ?? null,
        hasConditionsLogged,
        nightContext: {
          powerClass: nightContext.powerClass,
          totalScore: nightContext.totalScore,
          planetScore: nightContext.planetScore,
          dsoScore: nightContext.dsoScore,
        },
        telescope: telescope ? {
          id: telescope.id,
          name: telescope.name,
          aperture: telescope.aperture,
          focalLength: telescope.focalLength,
          type: telescope.type,
          obstructionRatio: telescope.obstructionRatio ?? null,
        } : null,
        eyepiece: recommendation.eyepiece ? {
          id: recommendation.eyepiece.eyepiece.id,
          name: recommendation.eyepiece.eyepiece.name,
          focalLength: recommendation.eyepiece.eyepiece.focalLength,
          apparentFov: recommendation.eyepiece.eyepiece.apparentFov,
          barlow: recommendation.eyepiece.barlow ? {
            id: recommendation.eyepiece.barlow.id,
            name: recommendation.eyepiece.barlow.name,
            factor: recommendation.eyepiece.barlow.factor,
          } : null,
          magnification: recommendation.eyepiece.magnification,
          exitPupil: recommendation.eyepiece.exitPupil,
          reason: recommendation.eyepiece.reason,
        } : null,
        filter: {
          useFilter: recommendation.filter.useFilter,
          filterType: recommendation.filter.filterType,
          reason: recommendation.filter.reason,
          userFilter: matchingFilter ? {
            id: matchingFilter.id,
            name: matchingFilter.name,
            type: matchingFilter.type,
          } : null,
          primaryFilter: recommendation.filter.primaryFilter,
          secondaryFilter: recommendation.filter.secondaryFilter,
          optionalFilters: recommendation.filter.optionalFilters,
          avoidFilters: recommendation.filter.avoidFilters,
          warning: recommendation.filter.warning,
          allRecommendations: recommendation.filter.allRecommendations,
        },
        imaging: {
          feasibility: recommendation.imaging.feasibility,
          preferredCamera: recommendation.imaging.preferredCamera,
          fallbackCamera: recommendation.imaging.fallbackCamera,
          settings: recommendation.imaging.settings,
          reason: recommendation.imaging.reason,
        },
        location: location ? {
          id: location.id,
          name: location.name,
          bortle: location.bortle,
        } : null,
        moonIllumination: moonIllumination ?? null,
      });
    } catch (error) {
      console.error("Error fetching catalog-based recommendations:", error);
      res.status(500).json({ message: "Failed to fetch recommendations" });
    }
  });

  // Observation Sessions
  app.get('/api/sessions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const sessionsList = await storage.getSessions(userId);
      res.json(sessionsList);
    } catch (error) {
      console.error("Error fetching sessions:", error);
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  app.post('/api/sessions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      
      // Convert date string to Date object and ensure integer types
      const rawData = { 
        ...req.body, 
        userId,
        date: req.body.date ? new Date(req.body.date) : new Date(),
        bortle: req.body.bortle != null ? Math.floor(Number(req.body.bortle)) : undefined,
        lowCloudPct: req.body.lowCloudPct != null ? Math.floor(Number(req.body.lowCloudPct)) : undefined,
        midCloudPct: req.body.midCloudPct != null ? Math.floor(Number(req.body.midCloudPct)) : undefined,
        highCloudPct: req.body.highCloudPct != null ? Math.floor(Number(req.body.highCloudPct)) : undefined,
        seeing: req.body.seeing != null ? Math.floor(Number(req.body.seeing)) : undefined,
        jetstream: req.body.jetstream != null ? Math.floor(Number(req.body.jetstream)) : undefined,
        humidity: req.body.humidity != null ? Math.floor(Number(req.body.humidity)) : undefined,
        moonIllumination: req.body.moonIllumination != null ? Math.floor(Number(req.body.moonIllumination)) : undefined,
      };
      
      // Calculate max cloud coverage from three layers
      const maxCloudPct = Math.max(
        rawData.lowCloudPct ?? 0,
        rawData.midCloudPct ?? 0,
        rawData.highCloudPct ?? 0
      );
      
      // Calculate scores using actual condition values
      const scores = calculateNightScores(
        rawData.bortle || 5,
        maxCloudPct,
        rawData.seeing ?? 1.5,
        rawData.jetstream ?? 1,
        rawData.humidity ?? 60,
        (rawData.moonIllumination ?? 50) / 100  // Convert percentage to 0-1 scale
      );
      
      const data = insertObservationSessionSchema.parse({
        ...rawData,
        totalScore: scores.totalScore,
        planetScore: scores.planetScore,
        dsoScore: scores.dsoScore,
      });
      
      const session = await storage.createSession(data);
      res.json(session);
    } catch (error) {
      console.error("Error creating session:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create session" });
      }
    }
  });

  app.delete('/api/sessions/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      await storage.deleteSession(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting session:", error);
      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to delete session" });
      }
    }
  });

  // Observations
  app.post('/api/observations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const data = insertObservationSchema.parse(req.body);
      const observation = await storage.createObservation(data);
      
      // Update gamification stats
      try {
        // Increment total observations
        await storage.incrementUserStat(userId, 'totalObservations', 1);
        
        // Get the object to determine category
        const object = await storage.getObject(observation.objectId);
        if (object) {
          // Increment category-specific stats
          switch (object.category) {
            case 'galaxy':
              await storage.incrementUserStat(userId, 'galaxiesObserved', 1);
              break;
            case 'nebula':
            case 'planetary_nebula':
            case 'reflection_nebula':
            case 'dark_nebula':
            case 'supernova_remnant':
              await storage.incrementUserStat(userId, 'nebulaeObserved', 1);
              break;
            case 'globular_cluster':
            case 'open_cluster':
              await storage.incrementUserStat(userId, 'clustersObserved', 1);
              break;
            case 'double_star':
              await storage.incrementUserStat(userId, 'doubleStarsObserved', 1);
              break;
            case 'planet':
              await storage.incrementUserStat(userId, 'planetsObserved', 1);
              break;
          }
          
          // Track Messier observations
          if (object.catalogId.startsWith('M') && /^M\d+$/.test(object.catalogId)) {
            try {
              await storage.trackMessierObservation(userId, observation.objectId, observation.sessionId);
            } catch (e) {
              // Ignore if not a valid Messier object
            }
          }
          
          // Track NGC observations
          if (object.catalogId.startsWith('NGC')) {
            await storage.incrementUserStat(userId, 'ngcObjectsObserved', 1);
          }
        }
        
        // Check if imaging was done
        if (observation.imagingDone) {
          await storage.incrementUserStat(userId, 'totalPhotos', 1);
        }
      } catch (statError) {
        console.error("Error updating gamification stats:", statError);
        // Don't fail the observation creation if stats update fails
      }
      
      res.json(observation);
    } catch (error) {
      console.error("Error creating observation:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create observation" });
      }
    }
  });

  // Night Conditions - Log and evaluate tonight's conditions independently
  app.get('/api/night-conditions/tonight', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const locationId = req.query.locationId ? parseInt(req.query.locationId as string) : undefined;
      const today = new Date();
      
      const conditions = await storage.getTonightConditions(userId, today, locationId);
      
      if (!conditions) {
        return res.status(404).json({ message: "No conditions logged for tonight" });
      }
      
      res.json(conditions);
    } catch (error) {
      console.error("Error fetching tonight's conditions:", error);
      res.status(500).json({ message: "Failed to fetch conditions" });
    }
  });

  app.post('/api/night-conditions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const rawData = { ...req.body, userId, observingDate: new Date() };
      
      // Calculate max cloud coverage from three layers
      const maxCloudPct = Math.max(
        rawData.lowCloudPct ?? 0,
        rawData.midCloudPct ?? 0,
        rawData.highCloudPct ?? 0
      );
      
      // Calculate scores using the night scoring engine
      const scores = calculateNightScores(
        rawData.bortle || 5,
        maxCloudPct,
        rawData.seeingArcsec ?? 1.5,
        rawData.jetStreamIndex ?? 30,
        rawData.humidity ?? 60,
        rawData.moonIllumination ?? 50
      );
      
      // Parse and add computed scores
      const data = insertNightConditionsSchema.parse({
        ...rawData,
        totalScore: scores.totalScore,
        planetScore: scores.planetScore,
        dsoScore: scores.dsoScore,
        powerClass: scores.powerClass,
        source: 'manual',
      });
      
      const conditions = await storage.upsertNightConditions(data);
      res.json(conditions);
    } catch (error) {
      console.error("Error saving night conditions:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to save conditions" });
      }
    }
  });

  app.delete('/api/night-conditions/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      await storage.deleteNightConditions(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting night conditions:", error);
      res.status(500).json({ message: "Failed to delete conditions" });
    }
  });

  // Weather API endpoint (using Open-Meteo - free, no API key required)
  app.get('/api/weather', isAuthenticated, async (req: any, res) => {
    try {
      const latitude = parseFloat(req.query.latitude as string);
      const longitude = parseFloat(req.query.longitude as string);
      
      if (isNaN(latitude) || isNaN(longitude)) {
        return res.status(400).json({ message: "Valid latitude and longitude required" });
      }
      
      // Fetch weather data from Open-Meteo API
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,precipitation&hourly=cloud_cover,visibility,temperature_2m,weather_code&daily=sunrise,sunset,weather_code,precipitation_probability_max&timezone=auto&forecast_days=3`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Weather API request failed");
      }
      
      const data = await response.json();
      
      // Calculate seeing estimate based on weather conditions
      // Factors: cloud cover, humidity, wind speed
      const cloudCover = data.current?.cloud_cover ?? 50;
      const humidity = data.current?.relative_humidity_2m ?? 50;
      const windSpeed = data.current?.wind_speed_10m ?? 10;
      
      // Seeing scale 1-5 (5 is best)
      let seeingEstimate = 5;
      if (cloudCover > 80) seeingEstimate -= 3;
      else if (cloudCover > 50) seeingEstimate -= 2;
      else if (cloudCover > 20) seeingEstimate -= 1;
      
      if (humidity > 90) seeingEstimate -= 1;
      if (windSpeed > 30) seeingEstimate -= 1;
      else if (windSpeed > 15) seeingEstimate -= 0.5;
      
      seeingEstimate = Math.max(1, Math.min(5, Math.round(seeingEstimate)));
      
      // Transparency estimate (1-5 scale)
      let transparencyEstimate = 5;
      if (humidity > 80) transparencyEstimate -= 2;
      else if (humidity > 60) transparencyEstimate -= 1;
      if (data.current?.precipitation > 0) transparencyEstimate -= 2;
      
      transparencyEstimate = Math.max(1, Math.min(5, Math.round(transparencyEstimate)));
      
      // Find tonight's observing windows (low cloud cover periods)
      const hourlyTimes = data.hourly?.time || [];
      const hourlyCloudCover = data.hourly?.cloud_cover || [];
      const timezone = data.timezone || 'UTC';
      const now = new Date();
      
      // Get hours for the next 24 hours where cloud cover is low
      // Note: Open-Meteo returns times in local timezone format (YYYY-MM-DDTHH:mm)
      // We need to compare them correctly by treating them as local times
      const goodHours = hourlyTimes
        .map((time: string, i: number) => ({
          time,
          cloudCover: hourlyCloudCover[i],
        }))
        .filter((h: { time: string; cloudCover: number }) => {
          // Parse the time string (local time) and compare to current time
          const hourTime = new Date(h.time + ':00'); // Add seconds for proper parsing
          const hourDiff = (hourTime.getTime() - now.getTime()) / (1000 * 60 * 60);
          return hourDiff >= -1 && hourDiff <= 24 && h.cloudCover < 30;
        })
        .map((h: { time: string; cloudCover: number }) => h.time);
      
      res.json({
        current: {
          temperature: data.current?.temperature_2m,
          humidity: data.current?.relative_humidity_2m,
          cloudCover: data.current?.cloud_cover,
          windSpeed: data.current?.wind_speed_10m,
          windDirection: data.current?.wind_direction_10m,
          weatherCode: data.current?.weather_code,
          precipitation: data.current?.precipitation,
        },
        estimates: {
          seeing: seeingEstimate,
          transparency: transparencyEstimate,
        },
        daily: data.daily?.time?.map((day: string, i: number) => ({
          date: day,
          sunrise: data.daily?.sunrise?.[i],
          sunset: data.daily?.sunset?.[i],
          weatherCode: data.daily?.weather_code?.[i],
          precipitationProbability: data.daily?.precipitation_probability_max?.[i],
        })) || [],
        goodObservingHours: goodHours,
        hourly: hourlyTimes.slice(0, 48).map((time: string, i: number) => ({
          time,
          cloudCover: hourlyCloudCover[i],
          temperature: data.hourly?.temperature_2m?.[i],
          visibility: data.hourly?.visibility?.[i],
        })),
      });
    } catch (error) {
      console.error("Error fetching weather:", error);
      res.status(500).json({ message: "Failed to fetch weather data" });
    }
  });

  // ============================================================================
  // EPHEMERIS API - Real-time planetary positions using astronomy-engine
  // ============================================================================
  
  app.get('/api/ephemeris', isAuthenticated, async (req: any, res) => {
    try {
      const latitude = parseFloat(req.query.latitude as string);
      const longitude = parseFloat(req.query.longitude as string);
      
      if (isNaN(latitude) || isNaN(longitude)) {
        return res.status(400).json({ message: "Valid latitude and longitude required" });
      }
      
      // Dynamic import of astronomy-engine (ESM module)
      const Astronomy = await import('astronomy-engine');
      
      const now = new Date();
      const observer = new Astronomy.Observer(latitude, longitude, 0);
      
      // Solar system bodies to calculate
      const bodies = [
        { id: 'Sun', body: Astronomy.Body.Sun, catalogId: 'Sun', name: 'The Sun', category: 'star' as const },
        { id: 'Moon', body: Astronomy.Body.Moon, catalogId: 'Luna', name: 'The Moon', category: 'moon' as const },
        { id: 'Mercury', body: Astronomy.Body.Mercury, catalogId: 'Mercury', name: 'Mercury', category: 'planet' as const },
        { id: 'Venus', body: Astronomy.Body.Venus, catalogId: 'Venus', name: 'Venus', category: 'planet' as const },
        { id: 'Mars', body: Astronomy.Body.Mars, catalogId: 'Mars', name: 'Mars', category: 'planet' as const },
        { id: 'Jupiter', body: Astronomy.Body.Jupiter, catalogId: 'Jupiter', name: 'Jupiter', category: 'planet' as const },
        { id: 'Saturn', body: Astronomy.Body.Saturn, catalogId: 'Saturn', name: 'Saturn', category: 'planet' as const },
        { id: 'Uranus', body: Astronomy.Body.Uranus, catalogId: 'Uranus', name: 'Uranus', category: 'planet' as const },
        { id: 'Neptune', body: Astronomy.Body.Neptune, catalogId: 'Neptune', name: 'Neptune', category: 'planet' as const },
      ];
      
      const ephemerisData = [];
      
      for (const { id, body, catalogId, name, category } of bodies) {
        try {
          // Get equatorial coordinates (RA/Dec)
          const equator = Astronomy.Equator(body, now, observer, true, true);
          
          // Get horizontal coordinates (Alt/Az)
          const horizon = Astronomy.Horizon(now, observer, equator.ra, equator.dec, 'normal');
          
          // Calculate rise and set times for the next 24 hours
          let riseTime = null;
          let setTime = null;
          let transitTime = null;
          
          try {
            // Search for next rise
            const rise = Astronomy.SearchRiseSet(body, observer, +1, now, 1);
            if (rise) riseTime = rise.date.toISOString();
            
            // Search for next set
            const set = Astronomy.SearchRiseSet(body, observer, -1, now, 1);
            if (set) setTime = set.date.toISOString();
            
            // Search for next transit (highest point)
            const transit = Astronomy.SearchHourAngle(body, observer, 0, now, +1);
            if (transit) transitTime = transit.time.date.toISOString();
          } catch (e) {
            // Some bodies may not rise/set at certain latitudes
          }
          
          // Convert RA from hours to "XXh YYm" format
          const raHours = Math.floor(equator.ra);
          const raMinutes = Math.round((equator.ra - raHours) * 60);
          const rightAscension = `${raHours.toString().padStart(2, '0')}h ${raMinutes.toString().padStart(2, '0')}m`;
          
          // Convert Dec to "+/-XX° YY'" format
          const decDegrees = Math.abs(Math.floor(equator.dec));
          const decMinutes = Math.round((Math.abs(equator.dec) - decDegrees) * 60);
          const decSign = equator.dec >= 0 ? '+' : '-';
          const declination = `${decSign}${decDegrees.toString().padStart(2, '0')}° ${decMinutes.toString().padStart(2, '0')}'`;
          
          // Get elongation from Sun (for planets)
          let elongation = null;
          if (body !== Astronomy.Body.Sun) {
            try {
              const elong = Astronomy.Elongation(body, now);
              elongation = elong.elongation;
            } catch (e) {}
          }
          
          // Get Moon phase info
          let moonPhase = null;
          let moonIllumination = null;
          if (body === Astronomy.Body.Moon) {
            const phase = Astronomy.MoonPhase(now);
            moonPhase = phase;
            const illum = Astronomy.Illumination(body, now);
            moonIllumination = illum.phase_fraction * 100;
          }
          
          // Get constellation from RA/Dec
          let constellation = 'Unknown';
          try {
            const constel = Astronomy.Constellation(equator.ra, equator.dec);
            constellation = constel.name;
          } catch (e) {
            // Fallback if constellation lookup fails
          }
          
          ephemerisData.push({
            catalogId,
            name,
            category,
            rightAscension,
            declination,
            raDecimal: equator.ra,
            decDecimal: equator.dec,
            altitude: horizon.altitude,
            azimuth: horizon.azimuth,
            riseTime,
            setTime,
            transitTime,
            elongation,
            moonPhase,
            moonIllumination,
            isAboveHorizon: horizon.altitude > 0,
            constellation,
          });
        } catch (bodyError) {
          console.error(`Error calculating ephemeris for ${id}:`, bodyError);
        }
      }
      
      // Import astronomy service for twilight calculation
      const astronomyService = await import('./astronomy');
      const twilight = await astronomyService.calculateTwilightTimes(latitude, longitude, now);
      
      res.json({
        timestamp: now.toISOString(),
        observer: { latitude, longitude },
        bodies: ephemerisData,
        observationWindow: {
          astronomicalDusk: twilight.astronomicalDusk,
          astronomicalDawn: twilight.astronomicalDawn,
          nauticalDusk: twilight.nauticalDusk,
          nauticalDawn: twilight.nauticalDawn,
          civilDusk: twilight.civilDusk,
          civilDawn: twilight.civilDawn,
          sunset: twilight.sunset,
          sunrise: twilight.sunrise,
        },
      });
    } catch (error) {
      console.error("Error calculating ephemeris:", error);
      res.status(500).json({ message: "Failed to calculate ephemeris data" });
    }
  });

  // ============================================================================
  // ASTRONOMY SERVICE ROUTES - Tonight Summary, Events, Visibility
  // ============================================================================
  
  // Import astronomy service functions
  const astronomyService = await import('./astronomy');
  
  // Get tonight's observation summary (twilight, moon, window, events)
  app.get('/api/astronomy/tonight', isAuthenticated, async (req: any, res) => {
    try {
      const latitude = parseFloat(req.query.latitude as string);
      const longitude = parseFloat(req.query.longitude as string);
      
      if (isNaN(latitude) || isNaN(longitude)) {
        return res.status(400).json({ message: "Valid latitude and longitude required" });
      }
      
      const summary = await astronomyService.getTonightSummary(latitude, longitude);
      res.json(summary);
    } catch (error) {
      console.error("Error calculating tonight summary:", error);
      res.status(500).json({ message: "Failed to calculate tonight's summary" });
    }
  });
  
  // Get twilight times for a location
  app.get('/api/astronomy/twilight', isAuthenticated, async (req: any, res) => {
    try {
      const latitude = parseFloat(req.query.latitude as string);
      const longitude = parseFloat(req.query.longitude as string);
      
      if (isNaN(latitude) || isNaN(longitude)) {
        return res.status(400).json({ message: "Valid latitude and longitude required" });
      }
      
      const twilight = await astronomyService.calculateTwilightTimes(latitude, longitude);
      res.json(twilight);
    } catch (error) {
      console.error("Error calculating twilight:", error);
      res.status(500).json({ message: "Failed to calculate twilight times" });
    }
  });
  
  // Get moon data for a location
  app.get('/api/astronomy/moon', isAuthenticated, async (req: any, res) => {
    try {
      const latitude = parseFloat(req.query.latitude as string);
      const longitude = parseFloat(req.query.longitude as string);
      
      if (isNaN(latitude) || isNaN(longitude)) {
        return res.status(400).json({ message: "Valid latitude and longitude required" });
      }
      
      const moon = await astronomyService.calculateMoonData(latitude, longitude);
      res.json(moon);
    } catch (error) {
      console.error("Error calculating moon data:", error);
      res.status(500).json({ message: "Failed to calculate moon data" });
    }
  });
  
  // Get observation window for a location
  app.get('/api/astronomy/window', isAuthenticated, async (req: any, res) => {
    try {
      const latitude = parseFloat(req.query.latitude as string);
      const longitude = parseFloat(req.query.longitude as string);
      
      if (isNaN(latitude) || isNaN(longitude)) {
        return res.status(400).json({ message: "Valid latitude and longitude required" });
      }
      
      const window = await astronomyService.calculateObservationWindow(latitude, longitude);
      res.json(window);
    } catch (error) {
      console.error("Error calculating observation window:", error);
      res.status(500).json({ message: "Failed to calculate observation window" });
    }
  });
  
  // Get upcoming celestial events
  app.get('/api/astronomy/events', isAuthenticated, async (req: any, res) => {
    try {
      const latitude = parseFloat(req.query.latitude as string) || 0;
      const longitude = parseFloat(req.query.longitude as string) || 0;
      const days = parseInt(req.query.days as string) || 30;
      
      const events = await astronomyService.calculateUpcomingEvents(latitude, longitude, days);
      res.json(events);
    } catch (error) {
      console.error("Error calculating events:", error);
      res.status(500).json({ message: "Failed to calculate upcoming events" });
    }
  });
  
  // Get object visibility with altitude curve
  app.get('/api/astronomy/visibility/:catalogId', isAuthenticated, async (req: any, res) => {
    try {
      const { catalogId } = req.params;
      const latitude = parseFloat(req.query.latitude as string);
      const longitude = parseFloat(req.query.longitude as string);
      const ra = parseFloat(req.query.ra as string);
      const dec = parseFloat(req.query.dec as string);
      const name = req.query.name as string || catalogId;
      
      if (isNaN(latitude) || isNaN(longitude) || isNaN(ra) || isNaN(dec)) {
        return res.status(400).json({ message: "Valid latitude, longitude, ra, and dec required" });
      }
      
      const visibility = await astronomyService.calculateObjectVisibility(
        catalogId, name, ra, dec, latitude, longitude
      );
      res.json(visibility);
    } catch (error) {
      console.error("Error calculating object visibility:", error);
      res.status(500).json({ message: "Failed to calculate object visibility" });
    }
  });
  
  // Get altitude curve for an object
  app.get('/api/astronomy/altitude-curve', isAuthenticated, async (req: any, res) => {
    try {
      const latitude = parseFloat(req.query.latitude as string);
      const longitude = parseFloat(req.query.longitude as string);
      const ra = parseFloat(req.query.ra as string);
      const dec = parseFloat(req.query.dec as string);
      
      if (isNaN(latitude) || isNaN(longitude) || isNaN(ra) || isNaN(dec)) {
        return res.status(400).json({ message: "Valid latitude, longitude, ra, and dec required" });
      }
      
      const curve = await astronomyService.calculateAltitudeCurve(ra, dec, latitude, longitude);
      res.json(curve);
    } catch (error) {
      console.error("Error calculating altitude curve:", error);
      res.status(500).json({ message: "Failed to calculate altitude curve" });
    }
  });

  // ============================================================================
  // RECOMMENDATIONS - Dynamic "Best for Tonight" Objects
  // ============================================================================

  // Get tonight's recommended objects with scoring
  app.get('/api/recommendations/tonight', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const locationId = req.query.locationId ? parseInt(req.query.locationId as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const excludeObserved = req.query.excludeObserved === 'true';
      const categories = req.query.categories ? (req.query.categories as string).split(',') : undefined;
      const minScore = req.query.minScore ? parseInt(req.query.minScore as string) : 0;

      // Get user's data
      const [locations, telescopes, eyepieces, objects, sessions] = await Promise.all([
        storage.getLocations(userId),
        storage.getTelescopes(userId),
        storage.getEyepieces(userId),
        storage.getObjects(),
        storage.getSessions(userId),
      ]);

      // Find the location to use
      let location = locationId 
        ? locations.find(l => l.id === locationId)
        : locations.find(l => l.isFavorite) || locations[0];

      if (!location || location.latitude === null || location.longitude === null) {
        return res.status(400).json({ 
          message: "No location with coordinates available. Add a location with coordinates to get recommendations." 
        });
      }

      // Get tonight's conditions if logged
      const nightConditions = await storage.getTonightConditions(userId, new Date());

      // Build recommendation context
      const context = await astronomyService.buildRecommendationContext(
        location.latitude,
        location.longitude,
        telescopes.map(t => ({ aperture: t.aperture, focalLength: t.focalLength })),
        eyepieces.map(e => ({ focalLength: e.focalLength })),
        nightConditions ? {
          totalScore: nightConditions.totalScore ?? undefined,
          planetScore: nightConditions.planetScore ?? undefined,
          dsoScore: nightConditions.dsoScore ?? undefined,
          powerClass: nightConditions.powerClass ?? undefined,
        } : null
      );

      // Build observation history map from all sessions
      const observationHistory: Map<number, { lastObserved: Date | null; count: number }> = new Map();
      
      for (const session of sessions) {
        if (session.observations) {
          for (const obs of session.observations) {
            const existing = observationHistory.get(obs.objectId);
            const obsDate = session.date ? new Date(session.date) : null;
            
            if (existing) {
              existing.count++;
              if (obsDate && (!existing.lastObserved || obsDate > existing.lastObserved)) {
                existing.lastObserved = obsDate;
              }
            } else {
              observationHistory.set(obs.objectId, {
                lastObserved: obsDate,
                count: 1,
              });
            }
          }
        }
      }

      // Filter objects by category if specified
      let filteredObjects = objects;
      if (categories && categories.length > 0) {
        filteredObjects = objects.filter(o => categories.includes(o.category));
      }

      // Calculate recommendations for all objects
      const recommendations: Array<{
        object: typeof objects[0];
        score: Awaited<ReturnType<typeof astronomyService.calculateObjectRecommendation>>;
      }> = [];

      // Process objects in parallel batches for efficiency
      const batchSize = 20;
      for (let i = 0; i < filteredObjects.length; i += batchSize) {
        const batch = filteredObjects.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (obj) => {
            const history = observationHistory.get(obj.id) || { lastObserved: null, count: 0 };
            
            // Skip if excludeObserved and already observed
            if (excludeObserved && history.count > 0) {
              return null;
            }

            const score = await astronomyService.calculateObjectRecommendation(
              {
                id: obj.id,
                catalogId: obj.catalogId,
                name: obj.name,
                category: obj.category,
                rightAscension: obj.rightAscension,
                declination: obj.declination,
                magnitude: obj.magnitude,
                bestMonths: obj.bestMonths,
                moonInterference: obj.moonInterference,
                difficulty: obj.difficulty,
              },
              context,
              history
            );

            // Filter by minimum score
            if (score.totalScore < minScore) {
              return null;
            }

            return { object: obj, score };
          })
        );

        recommendations.push(...batchResults.filter((r): r is NonNullable<typeof r> => r !== null));
      }

      // Sort by total score descending
      recommendations.sort((a, b) => b.score.totalScore - a.score.totalScore);

      // Take top N
      const topRecommendations = recommendations.slice(0, limit);

      // Format response
      const response = topRecommendations.map(({ object, score }) => ({
        objectId: object.id,
        catalogId: object.catalogId,
        name: object.name,
        category: object.category,
        magnitude: object.magnitude,
        constellation: object.constellation,
        difficulty: object.difficulty,
        description: object.description,
        isWow: object.isHot ?? false,
        isHot: object.isHot ?? false,
        
        // Scores
        totalScore: score.totalScore,
        visibilityScore: score.visibilityScore,
        moonScore: score.moonScore,
        conditionsScore: score.conditionsScore,
        equipmentScore: score.equipmentScore,
        freshnessScore: score.freshnessScore,
        seasonalScore: score.seasonalScore,
        
        // Visibility details
        maxAltitude: score.visibility?.maxAltitude ?? null,
        transitTime: score.visibility?.transitTime ?? null,
        darknessOverlapMinutes: score.visibility?.darknessOverlapMinutes ?? 0,
        
        // Moon impact
        moonSeparation: score.visibility?.moonSeparation ?? null,
        moonInterference: score.visibility?.moonInterference ?? 'none',
        
        // Equipment match
        equipmentMatch: score.equipmentScore >= 80 ? 'excellent' : 
                        score.equipmentScore >= 60 ? 'good' :
                        score.equipmentScore >= 40 ? 'fair' : 'poor',
        
        // Observation history
        lastObserved: observationHistory.get(object.id)?.lastObserved?.toISOString() ?? null,
        observationCount: observationHistory.get(object.id)?.count ?? 0,
        
        // Rationale
        rationale: score.rationale,
      }));

      res.json({
        recommendations: response,
        context: {
          location: {
            id: location.id,
            name: location.name,
            latitude: location.latitude,
            longitude: location.longitude,
            bortle: location.bortle,
          },
          moonIllumination: Math.round(context.moonIllumination),
          hasConditionsLogged: nightConditions !== null,
          conditionsScore: context.totalScore !== null ? Math.round(context.totalScore * 10) : null,
          powerClass: context.powerClass,
          currentMonth: context.currentMonth,
        },
        totalObjectsEvaluated: filteredObjects.length,
        totalRecommendations: recommendations.length,
      });
    } catch (error) {
      console.error("Error calculating recommendations:", error);
      res.status(500).json({ message: "Failed to calculate recommendations" });
    }
  });

  // ============================================================================
  // OBJECT STORAGE ROUTES - Photo Upload
  // ============================================================================

  // Serve uploaded objects (user's photos)
  app.get("/objects/:objectPath(*)", isAuthenticated, async (req: any, res) => {
    const userId = (req.user as any)?.id;
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: userId,
        requestedPermission: ObjectPermission.READ,
      });
      if (!canAccess) {
        return res.sendStatus(401);
      }
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error checking object access:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Get presigned URL for uploading a photo
  app.post("/api/objects/upload", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const objectStorageService = new ObjectStorageService();
      // Pass userId to store photos in user-specific folder
      const uploadURL = await objectStorageService.getObjectEntityUploadURL(userId);
      res.json({ uploadURL });
    } catch (error: any) {
      console.error("Error generating upload URL:", error);
      // If Object Storage isn't configured, return a helpful message
      if (error.message?.includes("PRIVATE_OBJECT_DIR not set")) {
        res.status(503).json({ 
          message: "Photo upload not available. Object Storage needs to be configured.",
          configured: false
        });
      } else {
        res.status(500).json({ message: "Failed to generate upload URL" });
      }
    }
  });

  // ============================================================================
  // OBSERVATION PHOTOS ROUTES
  // ============================================================================

  // Get photos for an observation
  app.get('/api/observations/:id/photos', isAuthenticated, async (req: any, res) => {
    try {
      const observationId = parseInt(req.params.id);
      const photos = await storage.getObservationPhotos(observationId);
      res.json(photos);
    } catch (error) {
      console.error("Error fetching photos:", error);
      res.status(500).json({ message: "Failed to fetch photos" });
    }
  });

  // Get all photos for user (gallery view)
  app.get('/api/photos', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const photos = await storage.getUserPhotosWithDetails(userId);
      res.json(photos);
    } catch (error) {
      console.error("Error fetching user photos:", error);
      res.status(500).json({ message: "Failed to fetch photos" });
    }
  });

  // Add a photo to an observation
  app.post('/api/observations/:id/photos', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const observationId = parseInt(req.params.id);
      
      let imageUrl = req.body.imageUrl;
      
      // If it's a full URL, try to normalize it and set ACL
      if (imageUrl.startsWith("https://")) {
        try {
          const objectStorageService = new ObjectStorageService();
          imageUrl = await objectStorageService.trySetObjectEntityAclPolicy(
            imageUrl,
            {
              owner: userId,
              visibility: "private", // User's photos are private by default
            }
          );
        } catch (aclError: any) {
          // If Object Storage isn't configured, store the raw URL but log warning
          if (aclError.message?.includes("PRIVATE_OBJECT_DIR not set")) {
            console.warn("Object Storage not configured, storing raw URL");
          } else {
            throw aclError;
          }
        }
      }

      const data = insertObservationPhotoSchema.parse({
        ...req.body,
        observationId,
        imageUrl,
      });
      
      const photo = await storage.createObservationPhoto(data);
      
      // Increment totalPhotos stat for gamification
      await storage.incrementUserStat(userId, 'totalPhotos', 1);
      
      // Check if this is the first photo (imagingDone not yet set)
      const observation = await storage.getObservation(observationId);
      if (observation && !observation.imagingDone) {
        // Set imagingDone to true only if not already set
        await storage.updateObservation(observationId, { imagingDone: true });
      }
      
      res.json(photo);
    } catch (error) {
      console.error("Error adding photo:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to add photo" });
      }
    }
  });

  // Delete a photo
  app.delete('/api/observations/:observationId/photos/:id', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteObservationPhoto(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting photo:", error);
      res.status(500).json({ message: "Failed to delete photo" });
    }
  });

  // Update observation (for editing used equipment after the fact)
  const updateObservationSchema = insertObservationSchema.partial();
  
  app.patch('/api/observations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const data = updateObservationSchema.parse(req.body);
      const observation = await storage.updateObservation(id, data);
      res.json(observation);
    } catch (error) {
      console.error("Error updating observation:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update observation" });
      }
    }
  });

  // Delete observation
  app.delete('/api/observations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      const sessionId = parseInt(req.query.sessionId as string);
      
      if (!sessionId) {
        return res.status(400).json({ message: "Session ID is required" });
      }
      
      await storage.deleteObservation(id, sessionId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting observation:", error);
      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Failed to delete observation" });
      }
    }
  });

  // ============================================================================
  // WATCHLIST ROUTES - Smart observation scheduling
  // ============================================================================

  // Get watchlist items
  app.get('/api/watchlist', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const status = req.query.status as 'planned' | 'observed' | 'dismissed' | undefined;
      const items = await storage.getWatchlistItems(userId, status);
      res.json(items);
    } catch (error) {
      console.error("Error fetching watchlist:", error);
      res.status(500).json({ message: "Failed to fetch watchlist" });
    }
  });

  // Check if object is in watchlist
  app.get('/api/watchlist/check/:objectId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const objectId = parseInt(req.params.objectId);
      const isInWatchlist = await storage.isObjectInWatchlist(userId, objectId);
      res.json({ isInWatchlist });
    } catch (error) {
      console.error("Error checking watchlist:", error);
      res.status(500).json({ message: "Failed to check watchlist" });
    }
  });

  // Add to watchlist
  app.post('/api/watchlist', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const { objectId, priority, notes } = req.body;
      
      // Check if already in watchlist
      const existing = await storage.isObjectInWatchlist(userId, objectId);
      if (existing) {
        return res.status(400).json({ message: "Object is already in your watchlist" });
      }
      
      const item = await storage.createWatchlistItem({
        userId,
        objectId,
        priority: priority || 'medium',
        notes,
        status: 'planned',
      });
      
      res.json(item);
    } catch (error) {
      console.error("Error adding to watchlist:", error);
      res.status(500).json({ message: "Failed to add to watchlist" });
    }
  });

  // Update watchlist item
  app.patch('/api/watchlist/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      const { priority, notes, status, observationId } = req.body;
      
      const item = await storage.updateWatchlistItem(id, userId, {
        priority,
        notes,
        status,
        observationId,
      });
      
      res.json(item);
    } catch (error) {
      console.error("Error updating watchlist item:", error);
      res.status(500).json({ message: "Failed to update watchlist item" });
    }
  });

  // Remove from watchlist
  app.delete('/api/watchlist/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      await storage.deleteWatchlistItem(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing from watchlist:", error);
      res.status(500).json({ message: "Failed to remove from watchlist" });
    }
  });

  // Get observation windows for watchlist item
  app.get('/api/watchlist/:id/windows', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      
      // Verify ownership
      const item = await storage.getWatchlistItem(id, userId);
      if (!item) {
        return res.status(404).json({ message: "Watchlist item not found" });
      }
      
      const windows = await storage.getWatchlistWindows(id);
      res.json(windows);
    } catch (error) {
      console.error("Error fetching windows:", error);
      res.status(500).json({ message: "Failed to fetch observation windows" });
    }
  });

  // Calculate observation windows for a watchlist item (next 30 days)
  app.post('/api/watchlist/:id/calculate-windows', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      const { locationId } = req.body;
      
      if (!locationId) {
        return res.status(400).json({ message: "Location ID is required" });
      }
      
      // Verify ownership
      const item = await storage.getWatchlistItem(id, userId);
      if (!item) {
        return res.status(404).json({ message: "Watchlist item not found" });
      }
      
      // Get the object details
      const obj = await storage.getObject(item.objectId);
      if (!obj) {
        return res.status(404).json({ message: "Celestial object not found" });
      }
      
      // Get location
      const locations = await storage.getLocations(userId);
      const location = locations.find(l => l.id === locationId);
      if (!location) {
        return res.status(404).json({ message: "Location not found" });
      }
      
      // Calculate windows for next 30 days
      const windowsData = await calculateObservationWindows(
        obj,
        location.latitude!,
        location.longitude!,
        30
      );
      
      // Delete old windows and create new ones
      await storage.deleteWatchlistWindowsForItem(id);
      
      const windows = await storage.createWatchlistWindows(
        windowsData.map((w: ObservationWindowData) => ({
          watchlistItemId: id,
          locationId,
          windowDate: w.date,
          startTime: w.startTime,
          endTime: w.endTime,
          qualityScore: w.qualityScore,
          peakAltitude: w.peakAltitude,
          transitTime: w.transitTime,
          moonPhase: w.moonPhase,
          moonSeparation: w.moonSeparation,
          moonInterference: w.moonInterference,
          durationMinutes: w.durationMinutes,
          twilightSegment: w.twilightSegment,
          astronomicalDusk: w.astronomicalDusk,
          astronomicalDawn: w.astronomicalDawn,
        }))
      );
      
      res.json(windows);
    } catch (error) {
      console.error("Error calculating windows:", error);
      res.status(500).json({ message: "Failed to calculate observation windows" });
    }
  });

  // ============================================================================
  // GAMIFICATION ROUTES - Badges, Achievements, and Progress
  // ============================================================================

  // Get all available badges
  app.get('/api/badges', isAuthenticated, async (_req: any, res) => {
    try {
      const allBadges = await storage.getAllBadges();
      res.json(allBadges);
    } catch (error) {
      console.error("Error fetching badges:", error);
      res.status(500).json({ message: "Failed to fetch badges" });
    }
  });

  // Get user's earned badges
  app.get('/api/user/badges', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const userBadges = await storage.getUserBadges(userId);
      res.json(userBadges);
    } catch (error) {
      console.error("Error fetching user badges:", error);
      res.status(500).json({ message: "Failed to fetch user badges" });
    }
  });

  // Get user's stats
  app.get('/api/user/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      let stats = await storage.getUserStats(userId);
      
      // Create default stats if none exist
      if (!stats) {
        stats = await storage.upsertUserStats({ userId });
      }
      
      res.json(stats);
    } catch (error) {
      console.error("Error fetching user stats:", error);
      res.status(500).json({ message: "Failed to fetch user stats" });
    }
  });

  // Get user's Messier progress
  app.get('/api/user/messier-progress', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const progress = await storage.getMessierProgress(userId);
      const completionCount = await storage.getMessierCompletionCount(userId);
      
      res.json({
        observedObjects: progress,
        completionCount,
        totalMessier: 110,
        percentComplete: Math.round((completionCount / 110) * 100),
      });
    } catch (error) {
      console.error("Error fetching Messier progress:", error);
      res.status(500).json({ message: "Failed to fetch Messier progress" });
    }
  });

  // Get comprehensive achievements summary
  app.get('/api/user/achievements', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      
      // Get all data in parallel
      const [allBadges, userBadges, stats, messierProgress] = await Promise.all([
        storage.getAllBadges(),
        storage.getUserBadges(userId),
        storage.getUserStats(userId),
        storage.getMessierCompletionCount(userId),
      ]);
      
      const earnedBadgeIds = new Set(userBadges.map(ub => ub.badgeId));
      
      // Categorize badges
      const earnedBadges = userBadges.map(ub => ({
        ...ub.badge,
        earnedAt: ub.earnedAt,
      }));
      
      const availableBadges = allBadges.filter(b => 
        !earnedBadgeIds.has(b.id) && !b.isSecret
      );
      
      const secretBadges = allBadges.filter(b => 
        !earnedBadgeIds.has(b.id) && b.isSecret
      );
      
      // Calculate total points
      const totalPoints = earnedBadges.reduce((sum, b) => sum + (b.points || 0), 0);
      
      res.json({
        earnedBadges,
        availableBadges,
        secretBadgesCount: secretBadges.length,
        totalPoints,
        stats: stats || { totalObservations: 0, messierObjectsObserved: 0 },
        messier: {
          observed: messierProgress,
          total: 110,
          percentComplete: Math.round((messierProgress / 110) * 100),
          certificateEarned: messierProgress >= 110,
        },
      });
    } catch (error) {
      console.error("Error fetching achievements:", error);
      res.status(500).json({ message: "Failed to fetch achievements" });
    }
  });

  // Check and award badges based on current stats (called after observations)
  app.post('/api/user/check-badges', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const newBadges: any[] = [];
      
      // Get current stats and all badges
      const [stats, allBadges, existingBadges] = await Promise.all([
        storage.getUserStats(userId),
        storage.getAllBadges(),
        storage.getUserBadges(userId),
      ]);
      
      const earnedBadgeIds = new Set(existingBadges.map(ub => ub.badgeId));
      
      for (const badge of allBadges) {
        // Skip if already earned
        if (earnedBadgeIds.has(badge.id)) continue;
        
        const req = badge.requirement as any;
        let earned = false;
        
        // Check different badge types
        switch (req.type) {
          case 'observation_count':
            earned = (stats?.totalObservations || 0) >= req.count;
            break;
          case 'messier':
            const messierCount = await storage.getMessierCompletionCount(userId);
            earned = messierCount >= req.count;
            break;
          case 'photos':
            earned = (stats?.totalPhotos || 0) >= req.count;
            break;
          case 'galaxies':
            earned = (stats?.galaxiesObserved || 0) >= req.count;
            break;
          case 'nebulae':
            earned = (stats?.nebulaeObserved || 0) >= req.count;
            break;
          case 'clusters':
            earned = (stats?.clustersObserved || 0) >= req.count;
            break;
          case 'double_stars':
            earned = (stats?.doubleStarsObserved || 0) >= req.count;
            break;
          case 'streak':
            earned = (stats?.currentStreak || 0) >= req.days;
            break;
          // Celestial event badges
          case 'conjunctions':
            earned = ((stats as any)?.conjunctionsObserved || 0) >= req.count;
            break;
          case 'oppositions':
            earned = ((stats as any)?.oppositionsObserved || 0) >= req.count;
            break;
          case 'meteor_showers':
            earned = ((stats as any)?.meteorShowersObserved || 0) >= req.count;
            break;
          case 'eclipses':
            earned = ((stats as any)?.eclipsesObserved || 0) >= req.count;
            break;
          case 'rare_events':
            earned = ((stats as any)?.rareEventsObserved || 0) >= req.count;
            break;
          case 'total_events':
            const totalEvents = ((stats as any)?.conjunctionsObserved || 0) +
                                ((stats as any)?.oppositionsObserved || 0) +
                                ((stats as any)?.meteorShowersObserved || 0) +
                                ((stats as any)?.eclipsesObserved || 0) +
                                ((stats as any)?.rareEventsObserved || 0);
            earned = totalEvents >= req.count;
            break;
          
          // "First" category badges
          case 'first_nebula':
            earned = (stats?.nebulaeObserved || 0) >= 1;
            break;
          case 'first_galaxy':
            earned = (stats?.galaxiesObserved || 0) >= 1;
            break;
          case 'first_cluster':
            earned = (stats?.clustersObserved || 0) >= 1;
            break;
          case 'first_double_star':
            earned = (stats?.doubleStarsObserved || 0) >= 1;
            break;
          case 'first_planetary_nebula':
            // Planetary nebulae count as nebulae in stats, but we need to track separately
            // For now, check if any planetary nebula was observed via observations
            const userObservations = await storage.getUserObservations(userId);
            const hasObservedPlanetaryNebula = userObservations.some(obs => {
              const obj = (obs as any).object;
              return obj && obj.category === 'planetary_nebula';
            });
            earned = hasObservedPlanetaryNebula;
            break;
          case 'first_planet':
            earned = (stats?.planetsObserved || 0) >= 1;
            break;
          case 'first_moon':
            // Check if user has observed the Moon
            const moonObs = await storage.getUserObservations(userId);
            const hasObservedMoon = moonObs.some(obs => {
              const obj = (obs as any).object;
              return obj && obj.category === 'moon';
            });
            earned = hasObservedMoon;
            break;
          case 'first_supernova_remnant':
            const snrObs = await storage.getUserObservations(userId);
            const hasObservedSNR = snrObs.some(obs => {
              const obj = (obs as any).object;
              return obj && obj.category === 'supernova_remnant';
            });
            earned = hasObservedSNR;
            break;
          
          // "Cosmic Collector" - observe all major categories
          case 'all_categories':
            const hasPlanet = (stats?.planetsObserved || 0) >= 1;
            const hasGalaxy = (stats?.galaxiesObserved || 0) >= 1;
            const hasNebula = (stats?.nebulaeObserved || 0) >= 1;
            const hasCluster = (stats?.clustersObserved || 0) >= 1;
            const hasDoubleStar = (stats?.doubleStarsObserved || 0) >= 1;
            // For moon, check observations
            const allObs = await storage.getUserObservations(userId);
            const hasMoon = allObs.some(obs => {
              const obj = (obs as any).object;
              return obj && obj.category === 'moon';
            });
            const hasPlanetaryNebula = allObs.some(obs => {
              const obj = (obs as any).object;
              return obj && obj.category === 'planetary_nebula';
            });
            earned = hasPlanet && hasGalaxy && hasNebula && hasCluster && hasDoubleStar && hasMoon && hasPlanetaryNebula;
            break;
        }
        
        if (earned) {
          const awarded = await storage.awardBadge({
            userId,
            badgeId: badge.id,
            progress: stats,
          });
          
          // Add points to user stats
          if (badge.points) {
            await storage.incrementUserStat(userId, 'totalPoints', badge.points);
          }
          
          newBadges.push({ ...badge, earnedAt: awarded.earnedAt });
        }
      }
      
      // Check for level up by comparing XP before and after
      // Accept optional previousXP from client (XP before observation was saved)
      const clientPreviousXP = req.body.previousXP;
      let levelUp = null;
      
      // Get current stats to calculate level changes
      const updatedStats = await storage.getUserStats(userId);
      const newXP = updatedStats?.totalPoints || 0;
      
      // Calculate previous XP based on available data:
      // - If client provided previousXP, use it (most accurate)
      // - If badges were earned, we can calculate previous XP from badge XP
      // - If neither, skip level-up detection to avoid false positives
      const badgeXPGained = newBadges.reduce((sum, b) => sum + (b.points || 0), 0);
      
      // Determine if we can reliably check for level-up
      const canCheckLevelUp = clientPreviousXP !== null && clientPreviousXP !== undefined;
      const previousXP = canCheckLevelUp ? clientPreviousXP : (newXP - badgeXPGained);
      
      // Calculate levels using shared leveling logic
      const getLevelFromXP = (xp: number) => {
        const levels = [
          { level: 1, minXP: 0 },
          { level: 2, minXP: 50 },
          { level: 3, minXP: 150 },
          { level: 4, minXP: 300 },
          { level: 5, minXP: 500 },
          { level: 6, minXP: 750 },
          { level: 7, minXP: 1050 },
          { level: 8, minXP: 1400 },
          { level: 9, minXP: 1800 },
          { level: 10, minXP: 2300 },
          { level: 11, minXP: 2900 },
          { level: 12, minXP: 3600 },
          { level: 13, minXP: 4400 },
          { level: 14, minXP: 5300 },
          { level: 15, minXP: 6300 },
          { level: 16, minXP: 7500 },
          { level: 17, minXP: 8900 },
          { level: 18, minXP: 10500 },
          { level: 19, minXP: 12300 },
          { level: 20, minXP: 14300 },
        ];
        const titles = [
          "Novice Stargazer", "Curious Observer", "Night Sky Explorer", "Cosmic Wanderer", "Telescope Apprentice",
          "Starfield Navigator", "Deep Sky Hunter", "Nebula Seeker", "Galaxy Voyager", "Celestial Cartographer",
          "Astrophotographer", "Observatory Keeper", "Constellation Master", "Messier Champion", "Deep Space Pioneer",
          "Cosmic Sage", "Star Whisperer", "Galactic Scholar", "Celestial Virtuoso", "Master Astronomer"
        ];
        let currentLevel = 1;
        for (const l of levels) {
          if (xp >= l.minXP) currentLevel = l.level;
          else break;
        }
        return { level: currentLevel, title: titles[currentLevel - 1] };
      };
      
      // Only check for level-up if we have reliable previous XP data:
      // 1. Client provided previousXP (most accurate for observation + badge XP)
      // 2. Badges were earned (we can calculate previous XP from badge XP alone)
      const shouldCheckLevelUp = canCheckLevelUp || newBadges.length > 0;
      
      if (shouldCheckLevelUp) {
        const oldLevel = getLevelFromXP(previousXP);
        const newLevel = getLevelFromXP(newXP);
        
        if (newLevel.level > oldLevel.level) {
          levelUp = {
            previousLevel: oldLevel.level,
            level: newLevel.level,
            title: newLevel.title,
          };
        }
      }
      
      res.json({ newBadges, levelUp });
    } catch (error) {
      console.error("Error checking badges:", error);
      res.status(500).json({ message: "Failed to check badges" });
    }
  });

  // Log celestial event observation (manual)
  app.post('/api/user/log-event', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const { eventType } = req.body;
      
      // Map event type to stat field
      const eventFieldMap: Record<string, keyof typeof userStats.$inferSelect> = {
        'conjunction': 'conjunctionsObserved',
        'opposition': 'oppositionsObserved',
        'meteor_shower': 'meteorShowersObserved',
        'eclipse': 'eclipsesObserved',
        'rare_event': 'rareEventsObserved',
      };
      
      const field = eventFieldMap[eventType];
      if (!field) {
        return res.status(400).json({ message: "Invalid event type" });
      }
      
      // Increment the event counter
      await storage.incrementUserStat(userId, field as any, 1);
      
      // Check for new badges
      const [stats, allBadges, existingBadges] = await Promise.all([
        storage.getUserStats(userId),
        storage.getAllBadges(),
        storage.getUserBadges(userId),
      ]);
      
      res.json({ 
        success: true, 
        eventType, 
        stats,
        message: `${eventType.replace('_', ' ')} observation logged!` 
      });
    } catch (error) {
      console.error("Error logging event:", error);
      res.status(500).json({ message: "Failed to log event" });
    }
  });

  // Reset achievements - recalculate stats and Messier progress from observation history
  app.post('/api/user/reset-achievements', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      
      // Recalculate Messier progress first (clears stale records)
      await storage.recalculateMessierProgress(userId);
      
      // Recalculate user stats from observations
      const updatedStats = await storage.recalculateUserStats(userId);
      
      // Get updated Messier progress
      const messierCount = await storage.getMessierCompletionCount(userId);
      
      res.json({ 
        success: true, 
        stats: updatedStats,
        messierProgress: {
          count: messierCount,
          total: 110,
          percentComplete: Math.round((messierCount / 110) * 100),
        },
        message: 'Statistics and Messier progress recalculated from observation history. Badges preserved.'
      });
    } catch (error) {
      console.error("Error resetting achievements:", error);
      res.status(500).json({ message: "Failed to reset achievements" });
    }
  });

  // Generate achievement share image
  app.post('/api/user/share-image', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const user = req.user as any;
      const { format = 'landscape' } = req.body;
      
      // Import the leveling utilities
      const { getLevelInfo, getXPForBadgeTier } = await import("@shared/leveling");
      
      // Fetch user achievements data
      const [stats, userBadges, messierCount] = await Promise.all([
        storage.getUserStats(userId),
        storage.getUserBadges(userId),
        storage.getMessierCompletionCount(userId),
      ]);

      // Get all badges to match with user badges
      const allBadges = await storage.getAllBadges();
      const badgeMap = new Map(allBadges.map(b => [b.id, b]));
      
      // Build earned badges with full details
      const earnedBadges = userBadges.map(ub => {
        const badge = badgeMap.get(ub.badgeId);
        return badge ? { ...badge, earnedAt: ub.earnedAt } : null;
      }).filter(Boolean) as Array<{ name: string; tier: string; points: number; earnedAt: Date | null }>;

      // Get highlighted badges (special/gold first, then silver, then bronze)
      const sortedBadges = [...earnedBadges].sort((a, b) => {
        const tierOrder: Record<string, number> = { special: 0, gold: 1, silver: 2, bronze: 3 };
        return (tierOrder[a.tier] ?? 4) - (tierOrder[b.tier] ?? 4);
      });
      const highlightedBadges = sortedBadges.slice(0, 3).map(b => ({
        name: b.name,
        tier: b.tier,
      }));

      // Build proud stats - only include actual achievements
      const proudStats: string[] = [];
      if ((stats?.planetsObserved || 0) >= 5) {
        proudStats.push(`${stats?.planetsObserved} planets explored`);
      }
      if ((stats?.galaxiesObserved || 0) >= 5) {
        proudStats.push(`${stats?.galaxiesObserved} distant galaxies observed`);
      }
      if ((stats?.nebulaeObserved || 0) >= 5) {
        proudStats.push(`${stats?.nebulaeObserved} nebulae captured`);
      }
      if ((stats?.totalPhotos || 0) >= 10) {
        proudStats.push(`${stats?.totalPhotos} astrophotos taken`);
      }
      if ((stats?.longestStreak || 0) >= 5) {
        proudStats.push(`${stats?.longestStreak}-night observing streak`);
      }

      // Calculate total XP from badges using tier-based XP system
      const totalXP = earnedBadges.reduce((sum, b) => {
        // Use the badge's points if available, otherwise calculate from tier
        const xp = b.points > 0 ? b.points : getXPForBadgeTier(b.tier);
        return sum + xp;
      }, 0);
      
      // Use the proper leveling system
      const levelInfo = getLevelInfo(totalXP);

      const imageBuffer = await generateAchievementShareImage({
        username: user.firstName || user.email?.split('@')[0] || 'Astronomer',
        level: levelInfo.level,
        title: levelInfo.title,
        totalXP: levelInfo.currentXP,
        badgeCount: earnedBadges.length,
        messierCount,
        totalObservations: stats?.totalObservations || 0,
        highlightedBadges,
        proudStats: proudStats.slice(0, 2), // Max 2 stats
      }, format === 'square' ? 'square' : 'landscape');

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', 'inline; filename="astropilot-achievements.png"');
      res.setHeader('Cache-Control', 'private, max-age=60'); // Cache for 1 minute
      res.send(imageBuffer);
    } catch (error) {
      console.error("Error generating share image:", error);
      res.status(500).json({ message: "Failed to generate share image" });
    }
  });

  // Detect active celestial events for current time
  app.get('/api/events/active', async (req, res) => {
    try {
      const date = req.query.date ? new Date(req.query.date as string) : new Date();
      const observedObject = req.query.object as string | undefined;
      
      const { detectActiveEvents } = await import('./astronomy');
      const events = await detectActiveEvents(date, observedObject);
      
      res.json(events);
    } catch (error) {
      console.error("Error detecting active events:", error);
      res.status(500).json({ message: "Failed to detect events" });
    }
  });

  // Get user event stats
  app.get('/api/user/event-stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const stats = await storage.getUserStats(userId);
      
      res.json({
        conjunctionsObserved: (stats as any)?.conjunctionsObserved || 0,
        oppositionsObserved: (stats as any)?.oppositionsObserved || 0,
        meteorShowersObserved: (stats as any)?.meteorShowersObserved || 0,
        eclipsesObserved: (stats as any)?.eclipsesObserved || 0,
        rareEventsObserved: (stats as any)?.rareEventsObserved || 0,
        totalEvents: ((stats as any)?.conjunctionsObserved || 0) +
                     ((stats as any)?.oppositionsObserved || 0) +
                     ((stats as any)?.meteorShowersObserved || 0) +
                     ((stats as any)?.eclipsesObserved || 0) +
                     ((stats as any)?.rareEventsObserved || 0),
      });
    } catch (error) {
      console.error("Error fetching event stats:", error);
      res.status(500).json({ message: "Failed to fetch event stats" });
    }
  });

  // ============================================================================
  // NASA API ENDPOINTS
  // ============================================================================

  // Get Astronomy Picture of the Day
  app.get('/api/nasa/apod', async (req, res) => {
    try {
      const { getAPOD } = await import('./nasa');
      const apod = await getAPOD();
      
      if (!apod) {
        res.status(503).json({ message: "Unable to fetch APOD at this time" });
        return;
      }
      
      res.json(apod);
    } catch (error) {
      console.error("Error fetching APOD:", error);
      res.status(500).json({ message: "Failed to fetch APOD" });
    }
  });

  // Get Space Weather Summary (DONKI)
  app.get('/api/nasa/space-weather', async (req, res) => {
    try {
      const { getSpaceWeather } = await import('./nasa');
      const weather = await getSpaceWeather();
      
      res.json(weather);
    } catch (error) {
      console.error("Error fetching space weather:", error);
      res.status(500).json({ message: "Failed to fetch space weather" });
    }
  });

  // ============================================================================
  // ISS TRACKING API ENDPOINTS
  // ============================================================================

  // Get ISS position and pass predictions
  app.get('/api/iss', async (req, res) => {
    try {
      const { getISSTrackingData } = await import('./iss');
      
      const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
      const lon = req.query.lon ? parseFloat(req.query.lon as string) : undefined;
      
      const issData = await getISSTrackingData(lat, lon);
      res.json(issData);
    } catch (error) {
      console.error("Error fetching ISS data:", error);
      res.status(500).json({ message: "Failed to fetch ISS tracking data" });
    }
  });

  // ============================================================================
  // DONATION / BUY ME A BEER ENDPOINTS
  // ============================================================================

  // Get donation products (prices)
  app.get('/api/donations/products', async (req, res) => {
    try {
      const stripe = await getUncachableStripeClient();
      const prices = await stripe.prices.list({
        active: true,
        expand: ['data.product'],
        lookup_keys: ['donation_5', 'donation_10', 'donation_50'],
      });
      
      const products = prices.data
        .filter(price => {
          const product = price.product as any;
          return product && product.active && product.metadata?.type === 'donation';
        })
        .map(price => {
          const product = price.product as any;
          return {
            id: price.id,
            productId: product.id,
            name: product.name,
            description: product.description,
            amount: price.unit_amount,
            currency: price.currency,
            metadata: product.metadata,
          };
        })
        .sort((a, b) => (a.amount || 0) - (b.amount || 0));
      
      res.json({ products });
    } catch (error) {
      console.error("Error fetching donation products:", error);
      res.status(500).json({ message: "Failed to fetch donation options" });
    }
  });

  // Create donation checkout session
  app.post('/api/donations/checkout', async (req, res) => {
    try {
      const { priceId } = req.body;
      
      if (!priceId) {
        return res.status(400).json({ message: "Price ID required" });
      }
      
      const stripe = await getUncachableStripeClient();
      
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0] || req.get('host')}`;
      
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'payment',
        success_url: `${baseUrl}/donation/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: 'https://astropilot.space',
        metadata: {
          type: 'donation',
        },
      });
      
      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  // Verify donation success
  app.get('/api/donations/verify/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const stripe = await getUncachableStripeClient();
      
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      
      res.json({
        success: session.payment_status === 'paid',
        amount: session.amount_total,
        currency: session.currency,
      });
    } catch (error) {
      console.error("Error verifying donation:", error);
      res.status(500).json({ message: "Failed to verify donation" });
    }
  });

}
