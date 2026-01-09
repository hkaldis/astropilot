export type SuitabilityLevel = 'excellent' | 'good' | 'fair' | 'poor';

export interface TelescopeSpecs {
  aperture: number;       // mm
  focalLength: number;    // mm
  type?: string;          // Reflector, Refractor, Catadioptric
  obstructionRatio?: number; // 0-100, percentage of aperture blocked (reflectors)
}

export interface EyepieceSpecs {
  focalLength: number;    // mm
  apparentFov?: number;   // degrees (default 50° if not specified)
  id?: string | number;   // Optional unique identifier for deduplication
  name?: string;          // Optional name for composite key fallback
}

export interface BarlowSpecs {
  factor: number;         // 2x, 3x, etc.
}

export interface OpticalModifierSpecs {
  factor: number;         // e.g., 0.63 for focal reducer, 1.0 for coma corrector
  type: 'focal_reducer' | 'coma_corrector';
  name?: string;
}

export interface ObjectSpecs {
  category: string;
  magnitude?: number | null;
  angularSize?: string | null;  // e.g., "22' x 5'" or "0.5'"
  separation?: number | null;   // arcseconds for double stars
}

export interface EnvironmentSpecs {
  bortle?: number;              // 1-9
  seeingScore?: number;         // 0-10 (from conditions)
  moonIllumination?: number;    // 0-100 %
  moonSeparation?: number;      // degrees from object
}

export interface CalculationDetails {
  magnification: number;
  exitPupil: number;
  trueFov: number;              // arcminutes
  
  maxTheoreticMag: number;      // 2 × aperture
  minUsefulMag: number;         // aperture / 7
  seeingLimitedMag: number;     // Based on seeing conditions
  effectiveAperture: number;    // Accounting for obstruction
  
  // Effective values (after modifier is applied)
  effectiveFocalLength: number; // Telescope FL × modifier factor
  effectiveFRatio: number;      // f/ratio × modifier factor
  modifierApplied?: {
    name: string;
    factor: number;
    type: 'focal_reducer' | 'coma_corrector';
  };
  barlowApplied?: {
    factor: number;
  };
  
  objectAngularSize?: number;   // arcminutes (parsed)
  objectFitsInFov: boolean;
  fovCoverage: number;          // % of FOV used by object
  
  violations: CalculationViolation[];
  bonuses: CalculationBonus[];
  penalties: CalculationPenalty[];
  
  categoryOptimalExitPupil: { min: number; max: number };
  exitPupilMatch: 'optimal' | 'acceptable' | 'suboptimal' | 'poor';
}

export interface CalculationViolation {
  type: 'max_magnification' | 'min_magnification' | 'seeing_limit' | 'object_too_large' | 'exit_pupil_too_large' | 'double_star_insufficient_mag';
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  limit: number;
}

export interface CalculationBonus {
  type: 'optimal_exit_pupil' | 'good_fov_coverage' | 'dark_sky' | 'low_moon' | 'good_seeing' | 'double_star_well_resolved';
  points: number;
  message: string;
}

export interface CalculationPenalty {
  type: 'exit_pupil_mismatch' | 'fov_mismatch' | 'light_pollution' | 'moon_interference' | 'poor_seeing' | 'magnification_issue';
  points: number;
  message: string;
}

export interface EnhancedSuitabilityScore {
  level: SuitabilityLevel;
  score: number;              // 0-100
  summary: string;
  details: CalculationDetails;
}

const SEEING_MAG_LIMITS: Record<number, number> = {
  10: 400,  // Exceptional seeing
  9: 350,
  8: 300,
  7: 250,
  6: 200,
  5: 175,
  4: 150,
  3: 125,
  2: 100,
  1: 80,
  0: 60,   // Terrible seeing
};

interface CategoryExitPupilBase {
  min: number;
  max: number;
  ideal: number;
  description: string;
  allowHighPower: boolean;
  seeingAdjustable: boolean;
}

// Surface brightness classes for compact objects that can benefit from high power
// Compact galaxies like M32, bright Seyferts, and edge-on spirals benefit from higher magnification
// Small planetary nebulae like Blue Snowball (NGC 7662) need high power despite being nebulae
type SurfaceBrightnessClass = 'high' | 'medium' | 'low' | 'very_low';

// Size thresholds for compact vs extended objects (arcminutes)
const COMPACT_SIZE_THRESHOLD = 5;    // Objects <5' are compact - can use higher power
const MEDIUM_SIZE_THRESHOLD = 15;    // Objects 5-15' are medium - flexible power range
const EXTENDED_SIZE_THRESHOLD = 30;  // Objects >30' are extended - need lower power

const CATEGORY_EXIT_PUPIL_BASE: Record<string, CategoryExitPupilBase> = {
  // High-power targets - seeing-adjustable
  planet: { min: 0.5, max: 1.5, ideal: 0.8, description: 'High power needed to see detail', allowHighPower: true, seeingAdjustable: true },
  moon: { min: 0.5, max: 2.0, ideal: 1.0, description: 'High power for surface detail', allowHighPower: true, seeingAdjustable: true },
  
  // Compact DSO targets - can use high power if seeing allows
  planetary_nebula: { min: 0.5, max: 2.5, ideal: 1.0, description: 'Small bright nebulae benefit from high power', allowHighPower: true, seeingAdjustable: true },
  globular_cluster: { min: 0.8, max: 3.0, ideal: 1.5, description: 'Medium-high power to resolve stars', allowHighPower: true, seeingAdjustable: true },
  double_star: { min: 0.5, max: 2.0, ideal: 1.0, description: 'High power to split components', allowHighPower: true, seeingAdjustable: true },
  
  // Galaxies - now with expanded range to allow high power for compact/bright galaxies
  galaxy: { min: 1.0, max: 5.0, ideal: 2.5, description: 'Flexible power depending on galaxy size/brightness', allowHighPower: true, seeingAdjustable: true },
  
  // Nebulae - base ranges, extended objects get adjustments
  nebula: { min: 2.0, max: 5.0, ideal: 3.5, description: 'Wide field for extended objects', allowHighPower: false, seeingAdjustable: false },
  emission_nebula: { min: 2.0, max: 5.0, ideal: 3.5, description: 'Wide field for extended objects', allowHighPower: false, seeingAdjustable: false },
  reflection_nebula: { min: 2.0, max: 5.0, ideal: 3.5, description: 'Wide field for extended objects', allowHighPower: false, seeingAdjustable: false },
  dark_nebula: { min: 4.0, max: 6.0, ideal: 5.0, description: 'Very wide field needed', allowHighPower: false, seeingAdjustable: false },
  mixed_nebula: { min: 2.0, max: 5.0, ideal: 3.5, description: 'Wide field for extended objects', allowHighPower: false, seeingAdjustable: false },
  supernova_remnant: { min: 2.0, max: 5.0, ideal: 3.5, description: 'Extended objects need wide field', allowHighPower: false, seeingAdjustable: false },
  
  // Star clusters and asterisms
  open_cluster: { min: 2.5, max: 5.0, ideal: 3.5, description: 'Wide field to frame cluster', allowHighPower: false, seeingAdjustable: false },
  asterism: { min: 2.5, max: 5.0, ideal: 3.5, description: 'Wide field for star patterns', allowHighPower: false, seeingAdjustable: false },
  
  // Transient objects - special handling
  comet: { min: 2.0, max: 6.0, ideal: 4.0, description: 'Variable - wider field for tail, higher power for nucleus', allowHighPower: true, seeingAdjustable: false },
  meteor_shower: { min: 5.0, max: 7.0, ideal: 6.5, description: 'Widest field possible - naked eye or binoculars preferred', allowHighPower: false, seeingAdjustable: false },
};

// Estimate surface brightness class based on magnitude and angular size
function estimateSurfaceBrightness(magnitude?: number | null, angularSizeArcmin?: number | null): SurfaceBrightnessClass {
  if (!magnitude || !angularSizeArcmin || angularSizeArcmin <= 0) return 'medium';
  
  // Surface brightness = magnitude + 2.5 * log10(area in sq arcmin)
  // Higher values = fainter surface brightness
  const area = Math.PI * Math.pow(angularSizeArcmin / 2, 2);
  const surfaceBrightness = magnitude + 2.5 * Math.log10(area);
  
  // Classifications (lower = brighter surface)
  if (surfaceBrightness < 12) return 'high';      // Very bright (M42 core, M32)
  if (surfaceBrightness < 14) return 'medium';    // Average brightness
  if (surfaceBrightness < 16) return 'low';       // Faint (typical galaxy)
  return 'very_low';                               // Very faint (LSB galaxies)
}

// Get size classification for an object
function getSizeClass(angularSizeArcmin?: number | null): 'compact' | 'medium' | 'extended' | 'very_extended' | 'unknown' {
  if (!angularSizeArcmin || angularSizeArcmin <= 0) return 'unknown';
  if (angularSizeArcmin < COMPACT_SIZE_THRESHOLD) return 'compact';
  if (angularSizeArcmin < MEDIUM_SIZE_THRESHOLD) return 'medium';
  if (angularSizeArcmin < EXTENDED_SIZE_THRESHOLD) return 'extended';
  return 'very_extended';
}

function getSeeingAdjustment(seeingScore?: number): number {
  const seeing = seeingScore ?? 5;
  if (seeing >= 7) return 0.8;
  if (seeing >= 4) return 1.0;
  return 1.2;
}

export interface ExitPupilRange {
  min: number;
  max: number;
  ideal: number;
  description: string;
  allowHighPower: boolean;
}

export function getUnifiedExitPupilRange(
  category: string, 
  seeingScore?: number,
  objectAngularSize?: number,  // arcminutes - for size-aware adjustments
  magnitude?: number | null,   // for surface brightness estimation
  bortle?: number              // for light pollution adjustments
): ExitPupilRange {
  const base = CATEGORY_EXIT_PUPIL_BASE[category] || { 
    min: 2.0, max: 4.0, ideal: 3.0, 
    description: 'General purpose viewing', 
    allowHighPower: false, 
    seeingAdjustable: false 
  };
  
  let adjustedBase = { ...base };
  const sizeClass = getSizeClass(objectAngularSize);
  const surfaceBrightness = estimateSurfaceBrightness(magnitude, objectAngularSize);
  
  // Size and surface brightness aware adjustments
  // Compact, high surface brightness objects benefit from higher power
  // Extended, low surface brightness objects need lower power
  
  if (category === 'galaxy') {
    // Galaxies are highly variable - adjust based on size and brightness
    if (sizeClass === 'compact' && surfaceBrightness === 'high') {
      // Compact bright galaxies like M32 - can use high power
      adjustedBase = {
        ...base,
        min: 0.8,
        max: 2.5,
        ideal: 1.5,
        description: 'Compact bright galaxy - higher power reveals detail',
        allowHighPower: true,
      };
    } else if (sizeClass === 'compact' || sizeClass === 'medium') {
      // Small to medium galaxies - moderate power range
      adjustedBase = {
        ...base,
        min: 1.0,
        max: 3.5,
        ideal: 2.0,
        description: 'Moderate galaxy size - balanced power for detail and brightness',
      };
    } else if (sizeClass === 'very_extended') {
      // Very large galaxies like M31 - need wide field
      adjustedBase = {
        ...base,
        min: 3.0,
        max: 6.5,
        ideal: 5.0,
        description: 'Large galaxy - wide field preserves context and surface brightness',
      };
    }
    // Extended galaxies use default base settings
  }
  
  if (category === 'planetary_nebula') {
    // Planetary nebulae vary greatly in size
    if (sizeClass === 'compact') {
      // Tiny planetaries like Blue Snowball - need very high power
      adjustedBase = {
        ...base,
        min: 0.5,
        max: 1.5,
        ideal: 0.8,
        description: 'Compact planetary - high power to see disk/detail',
      };
    } else if (sizeClass === 'extended' || sizeClass === 'very_extended') {
      // Large planetaries like Helix need lower power
      adjustedBase = {
        ...base,
        min: 2.0,
        max: 4.0,
        ideal: 3.0,
        description: 'Extended planetary nebula - moderate power',
      };
    }
  }
  
  if (category === 'comet') {
    // Comets vary greatly - dim comets need low power, bright comets with detail can use more
    if (surfaceBrightness === 'high') {
      adjustedBase = {
        ...base,
        min: 1.5,
        max: 4.0,
        ideal: 2.5,
        description: 'Bright comet - can use higher power for nucleus/jets detail',
      };
    }
    // For extended/faint comets, use default wide-field settings
  }
  
  // Size-aware exit pupil adjustments for extended objects (nebulae, clusters)
  // Higher thresholds get more generous exit pupil allowances
  if (objectAngularSize && objectAngularSize > EXTENDED_SIZE_THRESHOLD && !adjustedBase.allowHighPower) {
    const sizeMultiplier = Math.min(1.6, 1 + (objectAngularSize - 30) / 200);
    const isVeryLarge = objectAngularSize > 60;
    
    adjustedBase = {
      ...adjustedBase,
      min: adjustedBase.min,
      max: Math.min(adjustedBase.max * sizeMultiplier, isVeryLarge ? 7.0 : 6.5),
      ideal: Math.min(adjustedBase.max * sizeMultiplier * 0.85, adjustedBase.ideal * sizeMultiplier),
      description: isVeryLarge 
        ? 'Large extended object - maximize surface brightness with wide field'
        : 'Extended object benefits from wider field of view',
    };
  }
  
  // Bortle adjustment: under heavy light pollution, higher magnification helps
  // by darkening sky background, making faint objects more visible
  if (bortle && bortle >= 7 && !['meteor_shower', 'dark_nebula'].includes(category)) {
    // In light-polluted skies, pushing magnification helps contrast
    // Reduce max exit pupil to encourage higher power
    const lpMultiplier = bortle >= 8 ? 0.75 : 0.85;
    const newMax = Math.max(adjustedBase.min + 0.5, adjustedBase.max * lpMultiplier);
    const newIdeal = Math.min(newMax - 0.3, Math.max(adjustedBase.min + 0.2, adjustedBase.ideal * lpMultiplier));
    adjustedBase = {
      ...adjustedBase,
      max: newMax,
      ideal: Math.min(Math.max(newIdeal, adjustedBase.min), newMax), // Ensure min ≤ ideal ≤ max
      description: adjustedBase.description + ' (adjusted for light pollution)',
    };
  }
  
  // Seeing adjustments for high-power targets
  if (adjustedBase.seeingAdjustable && seeingScore !== undefined) {
    const adj = getSeeingAdjustment(seeingScore);
    return {
      min: adjustedBase.min * adj,
      max: adjustedBase.max * adj,
      ideal: adjustedBase.ideal * adj,
      description: adjustedBase.description,
      allowHighPower: adjustedBase.allowHighPower,
    };
  }
  
  return {
    min: adjustedBase.min,
    max: adjustedBase.max,
    ideal: adjustedBase.ideal,
    description: adjustedBase.description,
    allowHighPower: adjustedBase.allowHighPower,
  };
}

export function parseAngularSize(size: string | null | undefined): number | null {
  if (!size) return null;
  
  const match = size.match(/(\d+(?:\.\d+)?)\s*[''′]?\s*(?:x\s*\d+(?:\.\d+)?\s*[''′]?)?/i);
  if (match) {
    return parseFloat(match[1]);
  }
  
  const degMatch = size.match(/(\d+(?:\.\d+)?)\s*[°]/);
  if (degMatch) {
    return parseFloat(degMatch[1]) * 60;
  }
  
  return null;
}

export function calculateEffectiveAperture(aperture: number, obstructionRatio?: number): number {
  if (!obstructionRatio || obstructionRatio <= 0) return aperture;
  const ratio = obstructionRatio / 100;
  const obstructedDiameter = aperture * ratio;
  const obstructedArea = Math.PI * Math.pow(obstructedDiameter / 2, 2);
  const totalArea = Math.PI * Math.pow(aperture / 2, 2);
  const effectiveArea = totalArea - obstructedArea;
  return Math.sqrt(effectiveArea / Math.PI) * 2;
}

function getSeeingLimitedMagnification(seeingScore?: number): number {
  const score = seeingScore ?? 5;
  const clampedScore = Math.max(0, Math.min(10, Math.round(score)));
  return SEEING_MAG_LIMITS[clampedScore] || 175;
}

function getCategoryExitPupilRange(
  category: string, 
  seeingScore?: number, 
  objectAngularSize?: number,
  magnitude?: number | null,
  bortle?: number
): { min: number; max: number; ideal: number; description: string; allowHighPower: boolean } {
  const range = getUnifiedExitPupilRange(category, seeingScore, objectAngularSize, magnitude, bortle);
  return { min: range.min, max: range.max, ideal: range.ideal, description: range.description, allowHighPower: range.allowHighPower };
}

// Heuristics for objects without angular size data
// Returns estimated size category and suggested handling
function getDefaultAngularSizeHeuristic(category: string, magnitude?: number | null): { 
  estimatedSize: number | null;
  description: string;
  trustLevel: 'high' | 'medium' | 'low';
} {
  // Default sizes based on category averages (size in arcmin, null means N/A)
  const categoryDefaults: Record<string, { size: number | null; trust: 'high' | 'medium' | 'low'; desc: string }> = {
    planet: { size: 0.5, trust: 'medium', desc: 'Planets vary from 3" to 50" - using minimum' },
    moon: { size: 1800, trust: 'high', desc: 'Moon is ~30 degrees' },
    planetary_nebula: { size: 1, trust: 'medium', desc: 'Most planetaries are under 2 arcmin' },
    globular_cluster: { size: 10, trust: 'medium', desc: 'Average globular is 5-15 arcmin' },
    double_star: { size: 0, trust: 'high', desc: 'Double stars are point sources' },
    galaxy: { size: 5, trust: 'low', desc: 'Galaxies vary widely - assuming medium size' },
    emission_nebula: { size: 30, trust: 'low', desc: 'Nebulae vary widely - assuming medium' },
    reflection_nebula: { size: 15, trust: 'low', desc: 'Reflection nebulae are often smaller' },
    dark_nebula: { size: 60, trust: 'low', desc: 'Dark nebulae are typically large' },
    supernova_remnant: { size: 30, trust: 'low', desc: 'SNR vary widely' },
    open_cluster: { size: 20, trust: 'medium', desc: 'Average open cluster is 15-30 arcmin' },
    asterism: { size: 30, trust: 'low', desc: 'Asterisms vary widely' },
    comet: { size: 10, trust: 'low', desc: 'Comet size varies with activity' },
    meteor_shower: { size: null, trust: 'high', desc: 'Meteor showers cover entire sky - FOV not relevant' },
  };
  
  const defaultInfo = categoryDefaults[category];
  if (defaultInfo) {
    return { 
      estimatedSize: defaultInfo.size, 
      description: defaultInfo.desc, 
      trustLevel: defaultInfo.trust 
    };
  }
  
  // Unknown category - use generic size based on magnitude
  if (magnitude && magnitude < 6) {
    return { estimatedSize: 15, description: 'Bright object - assuming medium size', trustLevel: 'low' };
  }
  return { estimatedSize: 5, description: 'Unknown object type - assuming compact', trustLevel: 'low' };
}

function getExitPupilMatch(exitPupil: number, range: { min: number; max: number; ideal: number }): 'optimal' | 'acceptable' | 'suboptimal' | 'poor' {
  const idealDiff = Math.abs(exitPupil - range.ideal);
  const idealRange = (range.max - range.min) * 0.25;
  
  if (exitPupil >= range.min && exitPupil <= range.max) {
    if (idealDiff <= idealRange) return 'optimal';
    return 'acceptable';
  }
  
  const deviation = exitPupil < range.min 
    ? (range.min - exitPupil) / range.min
    : (exitPupil - range.max) / range.max;
  
  if (deviation < 0.3) return 'suboptimal';
  return 'poor';
}

export function calculateEnhancedSuitability(
  telescope: TelescopeSpecs,
  eyepiece: EyepieceSpecs,
  object: ObjectSpecs,
  environment: EnvironmentSpecs = {},
  barlow?: BarlowSpecs,
  opticalModifier?: OpticalModifierSpecs
): EnhancedSuitabilityScore {
  const barlowFactor = barlow?.factor || 1;
  const modifierFactor = opticalModifier?.factor || 1;
  const apparentFov = eyepiece.apparentFov || 50;
  
  // Calculate effective telescope specs with optical modifier applied
  // Focal reducer (e.g., 0.63x) reduces focal length and f/ratio
  // Coma corrector (typically 1.0x) doesn't change focal length but improves image quality
  const telescopeEffectiveFL = telescope.focalLength * modifierFactor;
  const fRatio = telescope.focalLength / telescope.aperture;
  const telescopeEffectiveFRatio = fRatio * modifierFactor;
  
  // Eyepiece effective focal length with barlow
  const eyepieceEffectiveFL = eyepiece.focalLength / barlowFactor;
  
  // Final magnification uses modified telescope FL
  const magnification = telescopeEffectiveFL / eyepiece.focalLength * barlowFactor;
  const exitPupil = eyepieceEffectiveFL / telescopeEffectiveFRatio;
  const trueFovDegrees = apparentFov / magnification;
  const trueFovArcmin = trueFovDegrees * 60;
  
  const effectiveAperture = calculateEffectiveAperture(telescope.aperture, telescope.obstructionRatio);
  const maxTheoreticMag = 2 * telescope.aperture;
  const minUsefulMag = telescope.aperture / 7;
  const seeingLimitedMag = getSeeingLimitedMagnification(environment.seeingScore);
  
  // Parse angular size or use heuristic if missing
  let objectAngularSize = parseAngularSize(object.angularSize);
  let usedSizeHeuristic = false;
  
  // If no angular size provided, use category-based heuristic (but note reduced confidence)
  if (!objectAngularSize) {
    const heuristic = getDefaultAngularSizeHeuristic(object.category, object.magnitude);
    if (heuristic.estimatedSize !== null) {
      objectAngularSize = heuristic.estimatedSize;
      usedSizeHeuristic = true;
    }
  }
  
  const objectFitsInFov = objectAngularSize ? trueFovArcmin >= objectAngularSize : true;
  const fovCoverage = objectAngularSize ? (objectAngularSize / trueFovArcmin) * 100 : 0;
  
  // Pass angular size, magnitude, and bortle to get size/brightness-aware exit pupil ranges
  const categoryRange = getCategoryExitPupilRange(
    object.category, 
    environment.seeingScore, 
    objectAngularSize ?? undefined,
    object.magnitude,
    environment.bortle
  );
  const exitPupilMatch = getExitPupilMatch(exitPupil, categoryRange);
  
  const violations: CalculationViolation[] = [];
  const bonuses: CalculationBonus[] = [];
  const penalties: CalculationPenalty[] = [];
  
  if (magnification > maxTheoreticMag) {
    violations.push({
      type: 'max_magnification',
      severity: 'critical',
      message: `Exceeds telescope's maximum useful magnification (${Math.round(maxTheoreticMag)}×)`,
      value: magnification,
      limit: maxTheoreticMag,
    });
  }
  
  if (magnification > seeingLimitedMag && environment.seeingScore !== undefined) {
    violations.push({
      type: 'seeing_limit',
      severity: 'warning',
      message: `Exceeds seeing-limited maximum (${Math.round(seeingLimitedMag)}× for current conditions)`,
      value: magnification,
      limit: seeingLimitedMag,
    });
  }
  
  if (magnification < minUsefulMag && exitPupil > 7) {
    violations.push({
      type: 'exit_pupil_too_large',
      severity: 'warning',
      message: `Exit pupil exceeds eye's dark-adapted limit (~7mm) - wasting light`,
      value: exitPupil,
      limit: 7,
    });
  }
  
  if (objectAngularSize && !objectFitsInFov) {
    violations.push({
      type: 'object_too_large',
      severity: 'warning',
      message: `Object (${objectAngularSize.toFixed(0)}') exceeds field of view (${trueFovArcmin.toFixed(0)}')`,
      value: objectAngularSize,
      limit: trueFovArcmin,
    });
  }
  
  if (exitPupilMatch === 'optimal') {
    bonuses.push({
      type: 'optimal_exit_pupil',
      points: 15,
      message: `Optimal exit pupil for ${object.category.replace(/_/g, ' ')}s`,
    });
  } else if (exitPupilMatch === 'acceptable') {
    bonuses.push({
      type: 'optimal_exit_pupil',
      points: 8,
      message: `Good exit pupil range for ${object.category.replace(/_/g, ' ')}s`,
    });
  }
  
  if (objectAngularSize && fovCoverage >= 15 && fovCoverage <= 70) {
    bonuses.push({
      type: 'good_fov_coverage',
      points: 10,
      message: `Object nicely framed in field of view (${fovCoverage.toFixed(0)}% coverage)`,
    });
  }
  
  // Bonus for extended objects that benefit from lower power / wider field
  // For objects >30' angular size, reward setups that maximize exit pupil and FOV
  if (objectAngularSize && objectAngularSize > 30 && !categoryRange.allowHighPower) {
    const isLargeExtended = objectAngularSize > 60;
    const maxGoodExitPupil = isLargeExtended ? 7.0 : 6.5;
    
    // Reward appropriate exit pupil for extended object viewing
    if (exitPupil >= 3.5 && exitPupil <= maxGoodExitPupil) {
      const points = isLargeExtended ? 10 : 8;
      bonuses.push({
        type: 'good_fov_coverage',
        points,
        message: `Good exit pupil (${exitPupil.toFixed(1)}mm) for ${isLargeExtended ? 'large ' : ''}extended object - maximizes surface brightness`,
      });
    }
    
    // Additional bonus if FOV is large enough to show substantial portion of object
    if (trueFovArcmin > objectAngularSize * 0.5) {
      bonuses.push({
        type: 'good_fov_coverage',
        points: 5,
        message: `Wide field shows substantial portion of this ${isLargeExtended ? 'large ' : ''}object`,
      });
    }
  }
  
  if (environment.bortle && environment.bortle <= 4) {
    bonuses.push({
      type: 'dark_sky',
      points: 5,
      message: `Dark sky location enhances visibility`,
    });
  }
  
  if (environment.moonIllumination !== undefined && environment.moonIllumination < 30) {
    bonuses.push({
      type: 'low_moon',
      points: 5,
      message: `Low moon interference`,
    });
  }
  
  if (environment.seeingScore !== undefined && environment.seeingScore >= 7) {
    bonuses.push({
      type: 'good_seeing',
      points: 5,
      message: `Excellent seeing conditions support high magnification`,
    });
  }
  
  // Ultra-small exit pupil penalty
  // Exit pupils below 0.5mm cause severe image degradation due to diffraction
  // Even with perfect seeing, this is rarely beneficial
  if (exitPupil < 0.5) {
    const severity = exitPupil < 0.3 ? 'critical' : 'warning';
    const penaltyPoints = exitPupil < 0.3 ? 40 : 25;
    violations.push({
      type: 'exit_pupil_too_large', // Reusing type, but message indicates too small
      severity,
      message: `Exit pupil too small (${exitPupil.toFixed(2)}mm) - diffraction limits image quality`,
      value: exitPupil,
      limit: 0.5,
    });
    penalties.push({
      type: 'magnification_issue',
      points: penaltyPoints,
      message: exitPupil < 0.3 
        ? 'Extreme overmagnification - image will be dim and blurry' 
        : 'High overmagnification - consider removing barlow or using longer eyepiece',
    });
  }
  
  // Double star minimum magnification calculation
  // Formula: minMag ≈ 120/separation (arcseconds) for comfortable splitting
  // Enhanced handling: prevent false "good" ratings for unsplittable doubles
  if (object.category === 'double_star' && object.separation && object.separation > 0) {
    const dawesLimit = 116 / effectiveAperture; // Telescope's resolution limit in arcseconds (uses effective aperture)
    const minMagToSplit = 120 / object.separation; // Minimum mag to comfortably split
    const optimalMagToSplit = 180 / object.separation; // Optimal magnification for clear split
    const canResolve = dawesLimit <= object.separation;
    
    if (!canResolve) {
      // Telescope can't physically resolve this double star - critical failure
      violations.push({
        type: 'double_star_insufficient_mag',
        severity: 'critical',
        message: `Star separation (${object.separation.toFixed(1)}") is below telescope's Dawes limit (${dawesLimit.toFixed(1)}")`,
        value: object.separation,
        limit: dawesLimit,
      });
    } else if (magnification < minMagToSplit) {
      // Magnification too low to comfortably split - significant issue
      const shortfall = ((minMagToSplit - magnification) / minMagToSplit) * 100;
      const severity = shortfall > 50 ? 'critical' : 'warning';
      violations.push({
        type: 'double_star_insufficient_mag',
        severity,
        message: `Magnification too low to split double (need ${Math.round(minMagToSplit)}×, have ${Math.round(magnification)}×)${shortfall > 30 ? ' - consider adding a Barlow' : ''}`,
        value: magnification,
        limit: minMagToSplit,
      });
      // Add penalty proportional to shortfall
      if (shortfall > 30) {
        penalties.push({
          type: 'magnification_issue',
          points: Math.min(25, Math.round(shortfall * 0.5)),
          message: `Need ${Math.round(minMagToSplit / magnification)}× more power to split this double - Barlow recommended`,
        });
      }
    } else if (magnification >= optimalMagToSplit) {
      // Well above minimum - excellent for clear splitting
      bonuses.push({
        type: 'double_star_well_resolved',
        points: 12,
        message: `Excellent magnification (${Math.round(magnification)}×) for cleanly resolving this ${object.separation.toFixed(1)}" double`,
      });
    } else if (magnification >= minMagToSplit * 1.2) {
      // Above minimum, good but not optimal
      bonuses.push({
        type: 'double_star_well_resolved',
        points: 8,
        message: `Good magnification for splitting this double (optimal would be ${Math.round(optimalMagToSplit)}×)`,
      });
    }
    // If exactly at minimum (1.0-1.2×), no bonus or penalty - just "adequate"
  }
  
  // Meteor shower special handling
  // Meteor showers are best observed with naked eye or binoculars - telescopes are not ideal
  if (object.category === 'meteor_shower') {
    penalties.push({
      type: 'fov_mismatch',
      points: 20,
      message: 'Meteor showers are best viewed with naked eye or binoculars - telescope FOV is too narrow',
    });
    // No further FOV checks needed
  }
  
  // Comet special handling - check if tail would fit
  if (object.category === 'comet' && objectAngularSize && objectAngularSize > 30) {
    // Large comets with significant tails need wide field
    if (trueFovArcmin < objectAngularSize * 0.5) {
      penalties.push({
        type: 'fov_mismatch',
        points: 15,
        message: 'Comet tail extends beyond field of view - lower power recommended for full view',
      });
    }
  }
  
  if (exitPupilMatch === 'suboptimal') {
    const direction = exitPupil < categoryRange.min ? 'higher magnification' : 'lower magnification';
    penalties.push({
      type: 'exit_pupil_mismatch',
      points: 15,
      message: `Exit pupil outside optimal range - consider ${direction}`,
    });
  } else if (exitPupilMatch === 'poor') {
    const direction = exitPupil < categoryRange.min ? 'much higher magnification' : 'much lower magnification';
    penalties.push({
      type: 'exit_pupil_mismatch',
      points: 30,
      message: `Exit pupil far from optimal range - needs ${direction}`,
    });
  }
  
  // Scaled FOV penalty for extended objects - larger objects exceeding FOV need proportionally lower power
  // Enhanced with escalating penalties for extreme cases
  // Skip for meteor showers (already handled) and point sources
  if (objectAngularSize && fovCoverage > 100 && object.category !== 'meteor_shower' && object.category !== 'double_star') {
    let fovPenalty: number;
    let penaltyMessage: string;
    let severity: 'warning' | 'critical' = 'warning';
    
    // Scale down penalties when using heuristic sizes (less confident data)
    const heuristicScale = usedSizeHeuristic ? 0.5 : 1.0;
    const heuristicNote = usedSizeHeuristic ? ' (estimated size)' : '';
    
    if (fovCoverage > 400) {
      // Object is more than 4× the FOV - essentially unobservable as intended
      fovPenalty = Math.round(50 * heuristicScale);
      // Only critical if using real size data
      severity = usedSizeHeuristic ? 'warning' : 'critical';
      penaltyMessage = `Object (${objectAngularSize.toFixed(0)}') vastly exceeds FOV (${trueFovArcmin.toFixed(0)}') - much lower power required${heuristicNote}`;
    } else if (fovCoverage > 300) {
      // Object is 3-4× the FOV - nearly impossible to appreciate
      fovPenalty = Math.round(40 * heuristicScale);
      penaltyMessage = `Object (${objectAngularSize.toFixed(0)}') far too large for FOV (${trueFovArcmin.toFixed(0)}') - significantly lower power needed${heuristicNote}`;
    } else if (fovCoverage > 200) {
      // Object is 2-3× the FOV - severe limitation
      fovPenalty = Math.round(30 * heuristicScale);
      penaltyMessage = `Object (${objectAngularSize.toFixed(0)}') far exceeds FOV (${trueFovArcmin.toFixed(0)}') - needs lower magnification${heuristicNote}`;
    } else if (fovCoverage > 150) {
      // Object is 1.5-2× the FOV - significant penalty
      fovPenalty = Math.round(20 * heuristicScale);
      penaltyMessage = `Object (${objectAngularSize.toFixed(0)}') exceeds FOV significantly - consider lower power${heuristicNote}`;
    } else {
      // Object is 1-1.5× the FOV - moderate penalty
      fovPenalty = Math.round(10 * heuristicScale);
      penaltyMessage = `Object slightly exceeds field of view${heuristicNote}`;
    }
    
    // Only add critical violations for confirmed (non-heuristic) size data
    if (fovCoverage > 300 && !usedSizeHeuristic) {
      violations.push({
        type: 'object_too_large',
        severity,
        message: penaltyMessage,
        value: objectAngularSize,
        limit: trueFovArcmin,
      });
    }
    
    penalties.push({
      type: 'fov_mismatch',
      points: fovPenalty,
      message: penaltyMessage,
    });
  } else if (objectAngularSize && fovCoverage < 5 && !['planet', 'planetary_nebula', 'double_star', 'globular_cluster'].includes(object.category)) {
    // Object appears very small - but this is OK for point-like objects
    // Also scale if heuristic
    const smallPenalty = usedSizeHeuristic ? 5 : 10;
    penalties.push({
      type: 'fov_mismatch',
      points: smallPenalty,
      message: `Object appears very small in field - consider lower power for context${usedSizeHeuristic ? ' (estimated size)' : ''}`,
    });
  }
  
  if (environment.bortle && environment.bortle >= 7) {
    const penalty = object.category === 'galaxy' || object.category.includes('nebula') ? 15 : 5;
    penalties.push({
      type: 'light_pollution',
      points: penalty,
      message: `Light pollution (Bortle ${environment.bortle}) affects visibility`,
    });
  }
  
  if (environment.moonIllumination !== undefined && environment.moonIllumination > 60) {
    const affectedCategories = ['galaxy', 'nebula', 'emission_nebula', 'reflection_nebula', 'dark_nebula', 'supernova_remnant'];
    if (affectedCategories.includes(object.category)) {
      penalties.push({
        type: 'moon_interference',
        points: 15,
        message: `Bright moon (${environment.moonIllumination}%) reduces contrast for this object type`,
      });
    }
  }
  
  if (environment.seeingScore !== undefined && environment.seeingScore <= 3 && ['planet', 'double_star', 'planetary_nebula', 'globular_cluster'].includes(object.category)) {
    penalties.push({
      type: 'poor_seeing',
      points: 15,
      message: `Poor seeing limits detail for this high-power target`,
    });
  }
  
  let baseScore = 60;
  
  bonuses.forEach(b => baseScore += b.points);
  penalties.forEach(p => baseScore -= p.points);
  
  violations.forEach(v => {
    if (v.severity === 'critical') {
      baseScore -= 30;
    } else {
      baseScore -= 15;
    }
  });
  
  const score = Math.max(0, Math.min(100, Math.round(baseScore)));
  
  let level: SuitabilityLevel;
  if (score >= 80) level = 'excellent';
  else if (score >= 60) level = 'good';
  else if (score >= 40) level = 'fair';
  else level = 'poor';
  
  if (violations.some(v => v.severity === 'critical')) {
    level = level === 'excellent' ? 'good' : level === 'good' ? 'fair' : 'poor';
  }
  
  let summary: string;
  if (violations.length > 0) {
    summary = violations[0].message;
  } else if (bonuses.length > 0 && penalties.length === 0) {
    summary = bonuses[0].message;
  } else if (penalties.length > 0) {
    summary = penalties[0].message;
  } else {
    summary = `Reasonable setup for ${object.category.replace(/_/g, ' ')}`;
  }
  
  return {
    level,
    score,
    summary,
    details: {
      magnification,
      exitPupil,
      trueFov: trueFovArcmin, // Always in arcminutes for consistency
      maxTheoreticMag,
      minUsefulMag,
      seeingLimitedMag,
      effectiveAperture,
      effectiveFocalLength: telescopeEffectiveFL,
      effectiveFRatio: telescopeEffectiveFRatio,
      modifierApplied: opticalModifier ? {
        name: opticalModifier.name || `${opticalModifier.factor}× ${opticalModifier.type.replace('_', ' ')}`,
        factor: opticalModifier.factor,
        type: opticalModifier.type,
      } : undefined,
      barlowApplied: barlow ? { factor: barlow.factor } : undefined,
      objectAngularSize: objectAngularSize ?? undefined,
      objectFitsInFov,
      fovCoverage,
      violations,
      bonuses,
      penalties,
      categoryOptimalExitPupil: { min: categoryRange.min, max: categoryRange.max },
      exitPupilMatch,
    },
  };
}

export function getRecommendationExplanation(score: EnhancedSuitabilityScore): string[] {
  const explanations: string[] = [];
  const d = score.details;
  
  explanations.push(`**Optical Setup**: ${d.magnification.toFixed(0)}× magnification, ${d.exitPupil.toFixed(1)}mm exit pupil, ${d.trueFov.toFixed(1)}' field of view`);
  
  explanations.push(`**Telescope Limits**: Max useful mag ${Math.round(d.maxTheoreticMag)}×, Min useful mag ${Math.round(d.minUsefulMag)}×`);
  
  if (d.seeingLimitedMag < d.maxTheoreticMag) {
    explanations.push(`**Seeing Limit**: Current conditions limit practical magnification to ~${Math.round(d.seeingLimitedMag)}×`);
  }
  
  explanations.push(`**Exit Pupil Range**: Optimal for this object type is ${d.categoryOptimalExitPupil.min.toFixed(1)}-${d.categoryOptimalExitPupil.max.toFixed(1)}mm (yours: ${d.exitPupil.toFixed(1)}mm = ${d.exitPupilMatch})`);
  
  if (d.objectAngularSize) {
    explanations.push(`**Object Size**: ${d.objectAngularSize.toFixed(1)}' angular diameter, ${d.objectFitsInFov ? 'fits in' : 'exceeds'} your ${d.trueFov.toFixed(1)}' field of view`);
  }
  
  if (d.violations.length > 0) {
    explanations.push(`**Issues**: ` + d.violations.map(v => v.message).join('; '));
  }
  
  if (d.bonuses.length > 0) {
    explanations.push(`**Advantages**: ` + d.bonuses.map(b => b.message).join('; '));
  }
  
  if (d.penalties.length > 0) {
    explanations.push(`**Considerations**: ` + d.penalties.map(p => p.message).join('; '));
  }
  
  return explanations;
}

export function getSuitabilityBadgeStyles(level: SuitabilityLevel): string {
  switch (level) {
    case 'excellent':
      return "bg-chart-2/10 border-chart-2/30 text-chart-2";
    case 'good':
      return "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400";
    case 'fair':
      return "bg-chart-5/10 border-chart-5/30 text-chart-5";
    case 'poor':
      return "bg-destructive/10 border-destructive/30 text-destructive";
  }
}

export function getSuitabilityBadgeLabel(level: SuitabilityLevel): string {
  switch (level) {
    case 'excellent':
      return 'Excellent Match';
    case 'good':
      return 'Good Match';
    case 'fair':
      return 'Fair Match';
    case 'poor':
      return 'Poor Match';
  }
}

export { getUnifiedExitPupilRange as getCategoryExitPupilRules };

// ============================================================================
// UNIFIED OPTICS CALCULATION ENGINE
// Quick calculations for optical properties with modifier support
// ============================================================================

export interface QuickOpticsResult {
  magnification: number;
  exitPupil: number;
  trueFovDegrees: number;
  trueFovArcmin: number;
  effectiveFocalLength: number;
  effectiveFRatio: number;
  eyepieceEffectiveFL: number;
}

/**
 * Calculate optical properties for a telescope/eyepiece/barlow/modifier combination
 * This is a quick utility function for displaying stats without full suitability analysis
 */
export function calculateQuickOptics(
  telescope: TelescopeSpecs,
  eyepiece: EyepieceSpecs,
  barlow?: BarlowSpecs,
  opticalModifier?: OpticalModifierSpecs
): QuickOpticsResult {
  const barlowFactor = barlow?.factor || 1;
  const modifierFactor = opticalModifier?.factor || 1;
  const apparentFov = eyepiece.apparentFov || 50;
  
  // Effective telescope values with modifier
  const effectiveFocalLength = telescope.focalLength * modifierFactor;
  const fRatio = telescope.focalLength / telescope.aperture;
  const effectiveFRatio = fRatio * modifierFactor;
  
  // Effective eyepiece focal length with barlow
  const eyepieceEffectiveFL = eyepiece.focalLength / barlowFactor;
  
  // Final magnification
  const magnification = effectiveFocalLength / eyepiece.focalLength * barlowFactor;
  const exitPupil = eyepieceEffectiveFL / effectiveFRatio;
  const trueFovDegrees = apparentFov / magnification;
  const trueFovArcmin = trueFovDegrees * 60;
  
  return {
    magnification,
    exitPupil,
    trueFovDegrees,
    trueFovArcmin,
    effectiveFocalLength,
    effectiveFRatio,
    eyepieceEffectiveFL,
  };
}

/**
 * Format optical modifier description for display
 */
export function formatModifierDescription(modifier: OpticalModifierSpecs): string {
  const factorText = modifier.factor < 1 
    ? `${modifier.factor}×` 
    : modifier.factor > 1 
      ? `${modifier.factor}×`
      : '1×';
      
  switch (modifier.type) {
    case 'focal_reducer':
      return `${factorText} Focal Reducer (reduces FL to ${Math.round(modifier.factor * 100)}%)`;
    case 'coma_corrector':
      return modifier.factor === 1 
        ? 'Coma Corrector (corrects field curvature)' 
        : `${factorText} Coma Corrector (with ${Math.round(modifier.factor * 100)}% FL factor)`;
    default:
      return `${factorText} Optical Modifier`;
  }
}

// ============================================================================
// EYEPIECE CANDIDATE RANKING SYSTEM
// Scores all eyepiece/barlow combinations and returns ranked candidates
// ============================================================================

export interface EyepieceCandidate {
  eyepiece: EyepieceSpecs;
  barlow: BarlowSpecs | null;
  opticalModifier?: OpticalModifierSpecs;
  magnification: number;
  exitPupil: number;
  trueFovArcmin: number;
  score: number;
  level: SuitabilityLevel;
  reason: string;
  advantages: string[];
  issues: string[];
  eyepieceIndex?: number; // Index in original array for stable deduplication
}

export interface RankedCandidates {
  best: EyepieceCandidate | null;
  alternates: EyepieceCandidate[];
  allCandidates: EyepieceCandidate[];
  bestForHighPower: EyepieceCandidate | null;
  bestForWidefield: EyepieceCandidate | null;
}

export interface RankingContext {
  seeingScore?: number;
  bortle?: number;
  moonIllumination?: number;
  objectAltitude?: number;
  powerPreference?: 'HIGH' | 'MID' | 'LOW';
}

export function rankEyepieceCandidates(
  telescope: TelescopeSpecs,
  eyepieces: EyepieceSpecs[],
  barlows: BarlowSpecs[],
  object: ObjectSpecs,
  environment: RankingContext,
  opticalModifier?: OpticalModifierSpecs
): RankedCandidates {
  if (!telescope || eyepieces.length === 0) {
    return {
      best: null,
      alternates: [],
      allCandidates: [],
      bestForHighPower: null,
      bestForWidefield: null,
    };
  }

  const allCandidates: EyepieceCandidate[] = [];
  const modifierFactor = opticalModifier?.factor || 1;
  const effectiveFocalLength = telescope.focalLength * modifierFactor;
  const fRatio = telescope.focalLength / telescope.aperture;
  const effectiveFRatio = fRatio * modifierFactor;

  // Build all eyepiece/barlow combinations with index tracking
  // Index ensures unique keys even for eyepieces with identical specs
  const combos: { eyepiece: EyepieceSpecs; barlow: BarlowSpecs | null; epIndex: number }[] = [];
  eyepieces.forEach((ep, index) => {
    combos.push({ eyepiece: ep, barlow: null, epIndex: index });
    for (const b of barlows) {
      combos.push({ eyepiece: ep, barlow: b, epIndex: index });
    }
  });

  // Convert environment to full EnvironmentSpecs for suitability calculation
  const envData: EnvironmentSpecs = {
    seeingScore: environment.seeingScore ?? 5,
    bortle: environment.bortle ?? 5,
    moonIllumination: environment.moonIllumination,
  };

  for (const { eyepiece, barlow, epIndex } of combos) {
    const barlowFactor = barlow?.factor ?? 1;
    const eyepieceEffectiveFL = eyepiece.focalLength / barlowFactor;
    const magnification = effectiveFocalLength / eyepiece.focalLength * barlowFactor;
    const exitPupil = eyepieceEffectiveFL / effectiveFRatio;
    const apparentFov = eyepiece.apparentFov ?? 50;
    const trueFovArcmin = (apparentFov / magnification) * 60;

    // Use the full suitability calculation
    const suitability = calculateEnhancedSuitability(
      telescope,
      eyepiece,
      object,
      envData,
      barlow ?? undefined,
      opticalModifier
    );

    const advantages: string[] = suitability.details.bonuses.map(b => b.message);
    const issues: string[] = [
      ...suitability.details.violations.map(v => v.message),
      ...suitability.details.penalties.map(p => p.message),
    ];

    // Build reason string
    let reason: string;
    if (suitability.level === 'excellent') {
      reason = `Ideal setup - ${exitPupil.toFixed(1)}mm exit pupil, ${trueFovArcmin.toFixed(1)}' FOV`;
    } else if (suitability.level === 'good') {
      reason = `Good match at ${magnification.toFixed(0)}× (${exitPupil.toFixed(1)}mm exit pupil)`;
    } else if (suitability.level === 'fair') {
      reason = issues[0] || `Usable at ${magnification.toFixed(0)}×`;
    } else {
      reason = issues[0] || 'Not recommended for this target';
    }

    allCandidates.push({
      eyepiece,
      barlow,
      opticalModifier,
      magnification,
      exitPupil,
      trueFovArcmin,
      score: suitability.score,
      level: suitability.level,
      reason,
      advantages,
      issues,
      eyepieceIndex: epIndex,
    });
  }

  // Sort by score (highest first)
  allCandidates.sort((a, b) => b.score - a.score);

  // Get best overall
  const best = allCandidates.length > 0 ? allCandidates[0] : null;

  // Get alternates (next 2-3 best options that are meaningfully different)
  const alternates: EyepieceCandidate[] = [];
  // Track used eyepieces by unique key to handle users with multiple eyepieces
  // of the same focal length (e.g., 24mm Panoptic and 24mm Hyperion)
  // Priority: id > eyepieceIndex > name+focalLength+apparentFov
  const getCandidateKey = (candidate: EyepieceCandidate): string => {
    const ep = candidate.eyepiece;
    if (ep.id !== undefined) return `id:${ep.id}`;
    // Use eyepieceIndex for stable deduplication when no id is available
    if (candidate.eyepieceIndex !== undefined) return `idx:${candidate.eyepieceIndex}`;
    // Fallback composite key
    const name = ep.name || 'ep';
    const afov = ep.apparentFov ?? 'na';
    return `${name}-${ep.focalLength}-${afov}`;
  };
  const usedEyepieceKeys = new Set<string>();
  if (best) {
    usedEyepieceKeys.add(getCandidateKey(best));
  }

  for (const candidate of allCandidates) {
    if (alternates.length >= 3) break;
    if (candidate === best) continue;
    
    // Only include if it's a different eyepiece or significantly different magnification
    const candidateKey = getCandidateKey(candidate);
    const isDifferentEyepiece = !usedEyepieceKeys.has(candidateKey);
    const isDifferentMag = best && Math.abs(candidate.magnification - best.magnification) > 20;
    
    if (isDifferentEyepiece || isDifferentMag) {
      // Relaxed threshold: include options down to score 35 (fair-ish)
      // This ensures penalized but viable combos still appear as alternatives
      if (candidate.score >= 35) {
        alternates.push(candidate);
        usedEyepieceKeys.add(candidateKey);
      }
    }
  }

  // Find best for high power (smallest exit pupil that's still usable)
  // Relaxed threshold to catch penalized but viable high-power options
  const highPowerCandidates = allCandidates
    .filter(c => c.exitPupil <= 2.0 && c.score >= 30)
    .sort((a, b) => {
      // Primary: prefer higher scores
      if (Math.abs(b.score - a.score) > 10) return b.score - a.score;
      // Secondary: prefer smaller exit pupil for high power
      return a.exitPupil - b.exitPupil;
    });
  const bestForHighPower = highPowerCandidates.length > 0 ? highPowerCandidates[0] : null;

  // Find best for wide field (largest true FOV that's still usable)
  const widefieldCandidates = allCandidates
    .filter(c => c.exitPupil >= 3.0 && c.score >= 30)
    .sort((a, b) => {
      // Primary: prefer higher scores
      if (Math.abs(b.score - a.score) > 10) return b.score - a.score;
      // Secondary: prefer larger FOV for wide field
      return b.trueFovArcmin - a.trueFovArcmin;
    });
  const bestForWidefield = widefieldCandidates.length > 0 ? widefieldCandidates[0] : null;

  return {
    best,
    alternates,
    allCandidates,
    bestForHighPower,
    bestForWidefield,
  };
}
