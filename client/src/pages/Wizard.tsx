import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ScoreDisplay, VisibilityRating, InteractiveStarRating } from "@/components/ScoreDisplay";
import { ObjectCard } from "@/components/ObjectCard";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { format, isValid } from "date-fns";

// Helper to safely format dates - returns fallback if date is invalid
const safeFormat = (date: Date | string | null | undefined, formatStr: string, fallback: string = "--:--"): string => {
  if (!date) return fallback;
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return isValid(dateObj) ? format(dateObj, formatStr) : fallback;
};
import {
  MapPin,
  Cloud,
  Eye,
  Wind,
  Droplets,
  Moon,
  ChevronLeft,
  ChevronRight,
  Check,
  Telescope,
  Wand2,
  Camera,
  Star,
  Search,
  Filter as FilterIcon,
  Info,
  ImagePlus,
  X,
  Loader2,
  Plus,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  AlertTriangle,
  Clock,
  Sparkles,
  Globe2,
  CloudSun,
  HelpCircle,
  ChevronDown,
  Layers,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { calculateNightWindowAltitudes, NightWindowAltitudes, getAltitudeQuality } from "@/lib/astronomy";
import { getCategoryExitPupilRules, getSuitabilityBadgeStyles, getSuitabilityBadgeLabel, calculateEyepieceSuitability as calculateBaseSuitability, type SuitabilityLevel, type SuitabilityScore as BaseSuitabilityScore } from "@/lib/eyepieceSuitability";
import { 
  calculateEnhancedSuitability, 
  parseAngularSize,
  type EnhancedSuitabilityScore,
  type TelescopeSpecs,
  type EyepieceSpecs,
  type ObjectSpecs,
  type EnvironmentSpecs,
  type BarlowSpecs,
  type OpticalModifierSpecs,
  getSuitabilityBadgeStyles as getEnhancedBadgeStyles,
  getSuitabilityBadgeLabel as getEnhancedBadgeLabel,
} from "@/lib/equipmentRecommendation";
import { EquipmentRecommendationModal } from "@/components/EquipmentRecommendationModal";
import type { Location, CelestialObject, Telescope as TelescopeType, Eyepiece, Barlow, Filter as FilterType, Camera as CameraType, SuggestedEquipment, WatchlistItem, OpticalModifier } from "@shared/schema";
import { Bookmark, BookmarkCheck } from "lucide-react";

type ConditionsQuality = "excellent" | "good" | "fair" | "poor" | "very_poor";

function getConditionsQuality(score: number): ConditionsQuality {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "fair";
  if (score >= 20) return "poor";
  return "very_poor";
}

function getConditionsConfig(quality: ConditionsQuality) {
  const configs = {
    excellent: {
      label: "Excellent",
      shortLabel: "Exc",
      bg: "bg-chart-2/15",
      border: "border-chart-2/40",
      text: "text-chart-2",
      description: "Perfect conditions for observing",
    },
    good: {
      label: "Good",
      shortLabel: "Good",
      bg: "bg-chart-4/15",
      border: "border-chart-4/40",
      text: "text-chart-4",
      description: "Favorable conditions",
    },
    fair: {
      label: "Fair",
      shortLabel: "Fair",
      bg: "bg-chart-5/15",
      border: "border-chart-5/40",
      text: "text-chart-5",
      description: "Acceptable viewing conditions",
    },
    poor: {
      label: "Poor",
      shortLabel: "Poor",
      bg: "bg-orange-500/15",
      border: "border-orange-500/40",
      text: "text-orange-500",
      description: "Challenging conditions",
    },
    very_poor: {
      label: "Very Poor",
      shortLabel: "V.Poor",
      bg: "bg-destructive/15",
      border: "border-destructive/40",
      text: "text-destructive",
      description: "Not recommended for observing",
    },
  };
  return configs[quality];
}

function ConditionsQualityBadge({ score, compact = false }: { score: number; compact?: boolean }) {
  const quality = getConditionsQuality(score);
  const config = getConditionsConfig(quality);
  
  return (
    <Badge 
      variant="outline" 
      className={cn(
        "text-[10px] py-0 shrink-0",
        config.bg,
        config.border,
        config.text
      )}
    >
      <CloudSun className="w-3 h-3 mr-0.5" />
      {compact ? config.shortLabel : config.label}
    </Badge>
  );
}

interface TonightData {
  location: { latitude: number; longitude: number };
  twilight: {
    civilDusk: string;
    nauticalDusk: string;
    astronomicalDusk: string;
    astronomicalDawn: string;
    nauticalDawn: string;
    civilDawn: string;
  };
  observationWindow: {
    start: string;
    end: string;
    quality: "excellent" | "good" | "fair" | "poor";
    durationHours: number;
  };
  moon: {
    phase: number;
    phaseName: string;
    illumination: number;
    riseTime: string | null;
    setTime: string | null;
    isUp: boolean;
    altitude: number;
    moonlessHours: number;
  };
}

interface ObjectVisibility {
  altitude: number;
  azimuth: number;
  isAboveHorizon: boolean;
  riseTime?: Date;
  setTime?: Date;
  transitTime?: Date;
  maxAltitude: number;
  moonDistance?: number;
  nightWindowData?: NightWindowAltitudes;
  conditionsScore?: number | null;
  hasGoodPosition?: boolean;
}

interface Equipment {
  telescopes: TelescopeType[];
  eyepieces: Eyepiece[];
  barlows: Barlow[];
  filters: FilterType[];
  cameras: CameraType[];
}

const steps = [
  { id: 1, title: "Location", description: "Select your observing site" },
  { id: 2, title: "Conditions", description: "Enter current conditions" },
  { id: 3, title: "Object", description: "Choose what to observe" },
  { id: 4, title: "Recommendations", description: "Review equipment suggestions" },
  { id: 5, title: "Save", description: "Log your observation" },
];

const conditionSchema = z.object({
  lowCloudPct: z.number().min(0).max(100),
  midCloudPct: z.number().min(0).max(100),
  highCloudPct: z.number().min(0).max(100),
  seeing: z.number().min(0.5).max(4),
  jetstream: z.number().min(0).max(100),
  humidity: z.number().min(0).max(100),
  moonIllumination: z.number().min(0).max(100),
});

// ============================================================================
// GALILEO OBSERVATION ENGINE - Night Scoring v2.0 (Client-side mirror of backend)
// Multiplicative gate system with proper weighting for astronomical accuracy
// All scores normalized to 0-10 scale with perfect 10/10 achievable
// ============================================================================

type PowerClass = 'HIGH' | 'MID' | 'LOW';

interface NightContext {
  powerClass: PowerClass;
  cloudScore: number;      // 0-1 (quality)
  seeingScore: number;     // 0-1 (quality)
  jetScore: number;        // 0-1 (quality)
  humidityScore: number;   // 0-1 (quality)
  moonScore: number;       // 0-1 (quality)
  totalScore: number;      // 0-10
  planetScore: number;     // 0-10
  dsoScore: number;        // 0-10
}

// CloudQuality (0-1): Based on maximum cloud coverage across all layers
// Exactly mirrors server/routes.ts calculateCloudQuality
function calcCloudQuality(maxCloudPct: number): number {
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

// SeeingQuality (0-1): Based on arc second measurement (lower = better)
// Exactly mirrors server/routes.ts calculateSeeingQuality
function calcSeeingQuality(seeingArcsec: number): number {
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

// JetQuality (0-1): Based on jet stream index (1-100, lower = calmer)
// Exactly mirrors server/routes.ts calculateJetQuality
function calcJetQuality(jetstreamIndex: number): number {
  if (jetstreamIndex <= 10) return 1.0;  // Exceptional calm
  if (jetstreamIndex <= 20) return 0.9;  // Excellent
  if (jetstreamIndex <= 30) return 0.8;  // Very good
  if (jetstreamIndex <= 40) return 0.7;  // Good
  if (jetstreamIndex <= 50) return 0.55; // Average
  if (jetstreamIndex <= 65) return 0.4;  // Below average
  if (jetstreamIndex <= 80) return 0.25; // Poor
  return 0.1;                             // Very poor
}

// HumidityQuality (0-1): Lower humidity = better transparency
// Exactly mirrors server/routes.ts calculateHumidityQuality
function calcHumidityQuality(humidityPct: number): number {
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

// MoonQuality (0-1): Moon impact on deep sky objects
// Exactly mirrors server/routes.ts calculateMoonQuality
function calcMoonQuality(moonIllumPct: number, moonAltitude?: number, moonIsUp?: boolean): number {
  if (moonIsUp === false || (moonAltitude !== undefined && moonAltitude < 0)) {
    return 1.0; // Moon below horizon - no impact
  }
  
  let quality: number;
  if (moonIllumPct <= 5) quality = 1.0;    // New moon - perfect
  else if (moonIllumPct <= 15) quality = 0.95;  // Thin crescent - excellent
  else if (moonIllumPct <= 25) quality = 0.85;  // Crescent - very good
  else if (moonIllumPct <= 40) quality = 0.7;   // Quarter - good for brighter DSOs
  else if (moonIllumPct <= 55) quality = 0.5;   // Gibbous - moderate impact
  else if (moonIllumPct <= 70) quality = 0.35;  // Large gibbous - significant impact
  else if (moonIllumPct <= 85) quality = 0.2;   // Nearly full - poor for DSOs
  else if (moonIllumPct <= 95) quality = 0.1;   // Full moon - very poor
  else quality = 0.05;                           // Supermoon - terrible for DSOs
  
  // Low moon altitude reduces impact slightly
  if (moonAltitude !== undefined && moonAltitude >= 0 && moonAltitude < 30) {
    quality = Math.min(1, quality + 0.1);
  }
  
  return quality;
}

// BortleBonus (0-1): Dark site bonus for DSOs
// Exactly mirrors server/routes.ts calculateBortleBonus
function calcBortleBonus(bortle: number): number {
  if (bortle <= 2) return 1.0;     // Excellent dark site
  if (bortle <= 3) return 0.85;    // Rural dark
  if (bortle <= 4) return 0.65;    // Rural/suburban transition
  if (bortle <= 5) return 0.45;    // Suburban
  if (bortle <= 6) return 0.3;     // Bright suburban
  if (bortle <= 7) return 0.15;    // Suburban/urban transition
  return 0.05;                      // Urban (8-9)
}

// Gate Multipliers - Exactly mirrors server/routes.ts
// Cloud Gate: Heavy clouds block all observation
function calcCloudGate(maxCloudPct: number): number {
  if (maxCloudPct >= 95) return 0;      // Complete overcast - impossible
  if (maxCloudPct >= 90) return 0.1;    // Nearly overcast - almost impossible
  if (maxCloudPct >= 80) return 0.3;    // Heavy clouds - severely limited
  if (maxCloudPct >= 70) return 0.5;    // Mostly cloudy - significantly degraded
  return 1;                              // No gate applied
}

// Humidity Gate: Fog/heavy dew blocks observation
function calcHumidityGate(humidityPct: number): number {
  if (humidityPct >= 98) return 0;      // Fog - impossible
  if (humidityPct >= 95) return 0.2;    // Near fog - almost impossible
  if (humidityPct >= 92) return 0.4;    // Heavy dew - severely limited
  return 1;                              // No gate applied
}

// Planet-specific cloud gate (more lenient - planets are bright)
function calcPlanetCloudGate(maxCloudPct: number): number {
  if (maxCloudPct >= 98) return 0;      // Complete overcast
  if (maxCloudPct >= 95) return 0.2;    // Nearly overcast
  if (maxCloudPct >= 90) return 0.4;    // Heavy clouds - planets can peek through
  if (maxCloudPct >= 85) return 0.6;    // Mostly cloudy
  return 1;                              // No gate applied
}

// Night Power Class: Determines equipment magnification strategy
function calcPowerClass(
  seeingArcsec: number,
  jetstreamIndex: number,
  maxCloudPct: number,
  humidityPct: number
): PowerClass {
  // LOW POWER: Any condition is poor
  if (seeingArcsec > 2.5 || jetstreamIndex > 50 || maxCloudPct > 60 || humidityPct > 90) {
    return 'LOW';
  }
  // HIGH POWER: All conditions are excellent
  if (seeingArcsec <= 1.5 && jetstreamIndex <= 25 && maxCloudPct <= 25 && humidityPct <= 60) {
    return 'HIGH';
  }
  // MID POWER: Everything else
  return 'MID';
}

interface MoonContext {
  altitude?: number;
  isUp?: boolean;
}

function calculateScores(
  conditions: z.infer<typeof conditionSchema>, 
  bortle: number,
  moonContext?: MoonContext
): NightContext {
  const maxCloudPct = Math.max(conditions.lowCloudPct, conditions.midCloudPct, conditions.highCloudPct);
  
  // ========================================
  // STEP 1: Calculate Gate Multipliers (exactly mirrors server/routes.ts)
  // ========================================
  const cloudGate = calcCloudGate(maxCloudPct);
  const humidityGate = calcHumidityGate(conditions.humidity);
  const planetCloudGate = calcPlanetCloudGate(maxCloudPct);
  
  // Master gate for general observation (both must pass)
  const masterGate = cloudGate * humidityGate;
  
  // Planet gate is more lenient on clouds
  const planetGate = planetCloudGate * humidityGate;
  
  // ========================================
  // STEP 2: Calculate Quality Scores (0-1)
  // ========================================
  const cloudQuality = calcCloudQuality(maxCloudPct);
  const seeingQuality = calcSeeingQuality(conditions.seeing);
  const jetQuality = calcJetQuality(conditions.jetstream);
  const humidityQuality = calcHumidityQuality(conditions.humidity);
  const moonQuality = calcMoonQuality(
    conditions.moonIllumination, 
    moonContext?.altitude, 
    moonContext?.isUp
  );
  const bortleQuality = calcBortleBonus(bortle);
  
  // ========================================
  // STEP 3: Calculate Power Class
  // ========================================
  const powerClass = calcPowerClass(conditions.seeing, conditions.jetstream, maxCloudPct, conditions.humidity);
  
  // ========================================
  // STEP 4: Calculate Composite Scores (0-10)
  // ========================================
  
  // TOTAL SCORE: Overall observing conditions
  // Weights: Clouds 35%, Seeing 25%, Jet Stream 15%, Humidity 15%, Transparency bonus 10%
  const rawTotal = (cloudQuality * 0.35) + 
                   (seeingQuality * 0.25) + 
                   (jetQuality * 0.15) + 
                   (humidityQuality * 0.15) +
                   (Math.min(cloudQuality, humidityQuality) * 0.10); // Transparency
  const totalScore = Math.round(masterGate * rawTotal * 100) / 10;
  
  // PLANET SCORE: Optimized for planetary observation
  // Planets need: stable air (seeing 50%, jet 30%) but tolerate clouds/moon better
  const rawPlanet = (seeingQuality * 0.50) + 
                    (jetQuality * 0.30) + 
                    (humidityQuality * 0.15) +
                    (cloudQuality * 0.05);
  const planetScore = Math.round(planetGate * rawPlanet * 100) / 10;
  
  // DSO SCORE: Optimized for deep sky object observation
  // DSOs need: dark skies (moon 30%, bortle 20%), clear skies (clouds 25%), dry air (humidity 15%)
  const rawDso = (moonQuality * 0.30) + 
                 (bortleQuality * 0.20) + 
                 (cloudQuality * 0.25) + 
                 (humidityQuality * 0.15) +
                 (seeingQuality * 0.10);
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

// Enhanced Filter Recommendation System
// Supports all 23 filter types from schema with astronomically-accurate guidance
// Schema types: none, uhc, oiii, h_beta, h_alpha, neodymium, contrast_booster, cls, lps, nd,
//               variable_polarizer, fringe_killer, semi_apo, color_yellow, color_red, color_blue,
//               color_green, color_orange, color_violet, light_pollution, moon, color
interface FilterRec {
  recommendation: 'always' | 'optional' | 'never' | 'avoid';
  filterType: 'uhc' | 'oiii' | 'h_alpha' | 'h_beta' | 'neodymium' | 'nd' | 'cls' | 'lps' | 
              'color_red' | 'color_blue' | 'color_green' | 'color_orange' | 'color_yellow' | 
              'color_violet' | 'contrast_booster' | 'variable_polarizer' | 'light_pollution' |
              'moon' | 'fringe_killer' | 'semi_apo' | 'color' | 'none';
  matchedFilter: FilterType | null;
  hasMatchingFilter: boolean;
  reason: string;
  warning?: string;
  secondaryFilters?: string[];
  avoidFilters?: string[];
}

function getFilterRecommendation(
  objectCategory: string,
  userFilters: FilterType[] = []
): FilterRec {
  // Determine recommended filter type based on object category
  let recommendation: 'always' | 'optional' | 'never' | 'avoid';
  let filterType: FilterRec['filterType'];
  let baseReason: string;
  let secondaryFilters: string[] | undefined;
  let avoidFilters: string[] | undefined;
  
  switch (objectCategory) {
    // Emission nebulae - narrowband essential
    case 'nebula':
    case 'emission_nebula':
      recommendation = 'always';
      filterType = 'uhc';
      baseReason = 'UHC filter essential - significantly enhances nebula contrast by isolating emission lines';
      secondaryFilters = ['oiii', 'h_alpha', 'h_beta'];
      break;
      
    case 'supernova_remnant':
      recommendation = 'always';
      filterType = 'oiii';
      baseReason = 'OIII filter essential - supernova remnants emit strongly in OIII line';
      secondaryFilters = ['uhc', 'h_beta'];
      break;
      
    case 'planetary_nebula':
      recommendation = 'optional';
      filterType = 'oiii';
      baseReason = 'OIII filter enhances contrast - planetary nebulae emit strongly in OIII';
      secondaryFilters = ['uhc'];
      break;
      
    // Reflection nebulae - AVOID narrowband filters!
    case 'reflection_nebula':
      recommendation = 'avoid';
      filterType = 'none';
      baseReason = 'NO narrowband filters - reflection nebulae emit broadband light. Filters will dim the view.';
      avoidFilters = ['uhc', 'oiii', 'h_alpha', 'h_beta'];
      break;
      
    case 'dark_nebula':
      recommendation = 'optional';
      filterType = 'lps';
      baseReason = 'Light pollution filter can improve contrast against background sky';
      secondaryFilters = ['cls'];
      break;
      
    case 'mixed_nebula':
      recommendation = 'optional';
      filterType = 'uhc';
      baseReason = 'UHC filter may help emission components, but try unfiltered first';
      secondaryFilters = ['oiii', 'light_pollution'];
      break;
      
    // Planets - color and contrast filters
    case 'planet':
      recommendation = 'optional';
      filterType = 'neodymium';
      baseReason = 'Neodymium/contrast filters can enhance planetary detail';
      secondaryFilters = ['contrast_booster', 'color_red', 'color_blue', 'color_green', 'color_orange'];
      avoidFilters = ['uhc', 'oiii', 'h_alpha', 'h_beta'];
      break;
      
    // Moon - ND filter essential for comfort
    case 'moon':
      recommendation = 'optional';
      filterType = 'nd';
      baseReason = 'Neutral density filter reduces glare for comfortable viewing';
      secondaryFilters = ['variable_polarizer', 'color_green', 'color_yellow'];
      avoidFilters = ['uhc', 'oiii', 'h_alpha', 'h_beta'];
      break;
      
    // Galaxies - broadband objects, LP helps
    case 'galaxy':
      recommendation = 'optional';
      filterType = 'lps';
      baseReason = 'Light pollution filter can improve contrast from light-polluted sites';
      secondaryFilters = ['cls', 'light_pollution'];
      avoidFilters = ['uhc', 'oiii', 'h_alpha', 'h_beta'];
      break;
      
    // Star clusters - generally no filter
    case 'open_cluster':
    case 'asterism':
      recommendation = 'never';
      filterType = 'none';
      baseReason = 'No filter needed - star clusters show best colors unfiltered';
      avoidFilters = ['uhc', 'oiii', 'h_alpha', 'h_beta'];
      break;
      
    case 'globular_cluster':
      recommendation = 'optional';
      filterType = 'lps';
      baseReason = 'Light pollution filter may help from urban sites';
      secondaryFilters = ['cls'];
      avoidFilters = ['uhc', 'oiii', 'h_alpha', 'h_beta'];
      break;
      
    // Double stars - pure point sources
    case 'double_star':
      recommendation = 'never';
      filterType = 'none';
      baseReason = 'No filter needed for point sources - observe unfiltered';
      break;
      
    // Transient objects
    case 'comet':
      recommendation = 'optional';
      filterType = 'lps';
      baseReason = 'Light pollution filter may help separate comet from sky glow';
      secondaryFilters = ['cls', 'uhc'];
      break;
      
    case 'meteor_shower':
      recommendation = 'never';
      filterType = 'none';
      baseReason = 'Meteor showers observed naked eye or with binoculars - no filter needed';
      break;
      
    default:
      recommendation = 'never';
      filterType = 'none';
      baseReason = 'No specific filter recommendation for this object type';
  }
  
  // If no filter needed or should avoid filters, return early
  if (filterType === 'none') {
    return {
      recommendation,
      filterType,
      matchedFilter: null,
      hasMatchingFilter: true,
      reason: baseReason,
      avoidFilters,
    };
  }
  
  // Try to find matching filter from user inventory
  // Priority: exact type match, then secondary/fallback types
  // Covers all 23 schema filter types for maximum equipment matching
  const fallbackTypes: Record<string, string[]> = {
    // Narrowband filters (emission line)
    'uhc': ['uhc', 'oiii', 'light_pollution', 'cls', 'lps'],
    'oiii': ['oiii', 'uhc'],
    'h_alpha': ['h_alpha'],
    'h_beta': ['h_beta', 'oiii'],
    
    // Light pollution / contrast filters
    'lps': ['lps', 'cls', 'light_pollution'],
    'cls': ['cls', 'lps', 'light_pollution'],
    'light_pollution': ['light_pollution', 'cls', 'lps'],
    'neodymium': ['neodymium', 'contrast_booster'],
    'contrast_booster': ['contrast_booster', 'neodymium'],
    
    // Neutral density / moon filters
    'nd': ['nd', 'moon', 'variable_polarizer'],
    'moon': ['moon', 'nd', 'variable_polarizer'],
    'variable_polarizer': ['variable_polarizer', 'nd', 'moon'],
    
    // Chromatic aberration correction filters
    'fringe_killer': ['fringe_killer', 'semi_apo'],
    'semi_apo': ['semi_apo', 'fringe_killer'],
    
    // Color filters (planetary observation)
    'color': ['color', 'color_red', 'color_blue', 'color_green', 'color_orange', 'color_yellow', 'color_violet'],
    'color_red': ['color_red', 'color_orange', 'color'],
    'color_blue': ['color_blue', 'color_violet', 'color'],
    'color_green': ['color_green', 'color_yellow', 'color'],
    'color_orange': ['color_orange', 'color_red', 'color'],
    'color_yellow': ['color_yellow', 'color_orange', 'color_green', 'color'],
    'color_violet': ['color_violet', 'color_blue', 'color'],
  };
  
  const typesToCheck = fallbackTypes[filterType] || [filterType];
  let matchedFilter: FilterType | null = null;
  
  for (const type of typesToCheck) {
    const found = userFilters.find(f => f.type === type);
    if (found) {
      matchedFilter = found;
      break;
    }
  }
  
  const hasMatchingFilter = matchedFilter !== null;
  let warning: string | undefined;
  let reason = baseReason;
  
  if (matchedFilter) {
    reason = `${baseReason}. Using your ${matchedFilter.name}`;
  } else if (recommendation === 'always') {
    warning = `You don't have a ${filterType.toUpperCase().replace('_', ' ')} filter. Consider adding one to your equipment for better views.`;
  } else if (recommendation === 'optional') {
    warning = `A ${filterType.toUpperCase().replace('_', ' ')} filter would help, but you can observe without one.`;
  }
  
  return {
    recommendation,
    filterType,
    matchedFilter,
    hasMatchingFilter,
    reason,
    warning,
    secondaryFilters,
    avoidFilters,
  };
}

// Eyepiece suitability score with barlow penalty (wraps shared utility)
interface SuitabilityScore extends BaseSuitabilityScore {}

function calculateEyepieceSuitabilityWithBarlow(
  exitPupil: number,
  objectCategory: string,
  needsBarlow: boolean,
  hasBarlowAvailable: boolean,
  seeingScore?: number,
  objectAngularSize?: number
): SuitabilityScore {
  const baseSuitability = calculateBaseSuitability(exitPupil, objectCategory, seeingScore, objectAngularSize);
  
  if (!needsBarlow || hasBarlowAvailable) {
    return baseSuitability;
  }
  
  const penalizedScore = Math.max(20, baseSuitability.score - 30);
  
  let level: SuitabilityLevel;
  if (penalizedScore >= 85) {
    level = 'excellent';
  } else if (penalizedScore >= 65) {
    level = 'good';
  } else if (penalizedScore >= 40) {
    level = 'fair';
  } else {
    level = 'poor';
  }
  
  const reason = level !== baseSuitability.level 
    ? `${baseSuitability.reason} (downgraded: barlow needed but unavailable)`
    : baseSuitability.reason;
  
  return { level, score: penalizedScore, reason };
}

function getEyepieceRecommendation(
  telescope: TelescopeType | null,
  eyepieces: Eyepiece[],
  barlows: Barlow[],
  objectCategory: string,
  nightContext: NightContext,
  objectAltitude?: number,
  objectAngularSize?: number
): { eyepiece: Eyepiece | null; barlow: Barlow | null; magnification: number; exitPupil: number; reason: string; altitudeWarning?: string; suitability?: SuitabilityScore } {
  if (!telescope || eyepieces.length === 0) {
    return { eyepiece: null, barlow: null, magnification: 0, exitPupil: 0, reason: "No telescope or eyepieces available" };
  }

  const rules = getCategoryExitPupilRules(objectCategory, nightContext.seeingScore, objectAngularSize);
  let targetExitPupil: { min: number; max: number };
  let useBarlowPreference = false;
  let reason: string;
  let altitudeWarning: string | undefined;

  // Altitude-based adjustment factors
  // At low altitudes, atmospheric interference increases, reducing effective seeing
  let altitudeAdjustment = 1.0;
  if (objectAltitude !== undefined) {
    if (objectAltitude < 15) {
      // Very low altitude - significant atmospheric extinction and turbulence
      altitudeAdjustment = 1.8; // Increase exit pupil target by 80%
      altitudeWarning = `Object at ${objectAltitude.toFixed(0)}° - heavy atmospheric interference, using lower power`;
    } else if (objectAltitude < 30) {
      // Low altitude - moderate atmospheric effects
      altitudeAdjustment = 1.4; // Increase exit pupil target by 40%
      altitudeWarning = `Object at ${objectAltitude.toFixed(0)}° - atmospheric effects present, moderating power`;
    } else if (objectAltitude < 45) {
      // Moderate altitude - slight adjustment
      altitudeAdjustment = 1.15;
    }
    // Above 45° - no adjustment needed
  }

  // Adjust target based on power class
  switch (nightContext.powerClass) {
    case 'HIGH':
      if (rules.allowHighPower && altitudeAdjustment <= 1.4) {
        // Only use high power if altitude is sufficient
        targetExitPupil = { 
          min: rules.min * altitudeAdjustment, 
          max: Math.min(rules.max, 1.5) * altitudeAdjustment 
        };
        useBarlowPreference = altitudeAdjustment === 1.0;
        reason = altitudeAdjustment > 1 
          ? `HIGH power mode adjusted for ${objectAltitude?.toFixed(0)}° altitude`
          : `HIGH power mode - excellent seeing for maximum detail`;
      } else {
        targetExitPupil = { min: rules.min * altitudeAdjustment, max: rules.max * altitudeAdjustment };
        reason = altitudeAdjustment > 1.4
          ? `Lower power recommended due to low altitude (${objectAltitude?.toFixed(0)}°)`
          : `${objectCategory.replace('_', ' ')} benefits from wider field even in good conditions`;
      }
      break;
    case 'LOW':
      targetExitPupil = { 
        min: Math.max(rules.min, 3.0) * altitudeAdjustment, 
        max: Math.max(rules.max, 4.0) * altitudeAdjustment 
      };
      reason = `LOW power mode - conditions favor lower magnification`;
      break;
    case 'MID':
    default:
      targetExitPupil = { min: rules.min * altitudeAdjustment, max: rules.max * altitudeAdjustment };
      reason = altitudeAdjustment > 1
        ? `MID power adjusted for ${objectAltitude?.toFixed(0)}° altitude`
        : `MID power mode - balanced magnification for current conditions`;
  }

  let bestCombo: { eyepiece: Eyepiece; barlow: Barlow | null; exitPupil: number; mag: number } | null = null;
  let bestScore = Infinity;

  const combos: { eyepiece: Eyepiece; barlow: Barlow | null }[] = [];
  
  for (const ep of eyepieces) {
    combos.push({ eyepiece: ep, barlow: null });
    for (const b of barlows) {
      combos.push({ eyepiece: ep, barlow: b });
    }
  }

  for (const { eyepiece, barlow } of combos) {
    const factor = barlow?.factor ?? 1;
    const mag = (telescope.focalLength / eyepiece.focalLength) * factor;
    const exitPupil = telescope.aperture / mag;
    
    const midTarget = (targetExitPupil.min + targetExitPupil.max) / 2;
    const score = Math.abs(exitPupil - midTarget);
    
    if (exitPupil >= targetExitPupil.min * 0.8 && exitPupil <= targetExitPupil.max * 1.2) {
      if (score < bestScore) {
        bestScore = score;
        bestCombo = { eyepiece, barlow, exitPupil, mag };
      }
    }
  }

  if (!bestCombo) {
    const ep = eyepieces[0];
    const mag = telescope.focalLength / ep.focalLength;
    const exitPupil = telescope.aperture / mag;
    // Calculate suitability for the fallback option - check if a barlow would help
    const rules = getCategoryExitPupilRules(objectCategory, nightContext.seeingScore, objectAngularSize);
    const needsBarlow = rules.allowHighPower && exitPupil > rules.max;
    const suitability = calculateEyepieceSuitabilityWithBarlow(exitPupil, objectCategory, needsBarlow, barlows.length > 0, nightContext.seeingScore, objectAngularSize);
    return {
      eyepiece: ep,
      barlow: null,
      magnification: Math.round(mag),
      exitPupil: Math.round(exitPupil * 10) / 10,
      reason: "Best available option with current equipment",
      altitudeWarning,
      suitability,
    };
  }

  // Calculate suitability for the best combo
  const suitability = calculateEyepieceSuitabilityWithBarlow(
    bestCombo.exitPupil,
    objectCategory,
    bestCombo.barlow !== null,
    barlows.length > 0,
    nightContext.seeingScore,
    objectAngularSize
  );

  return {
    eyepiece: bestCombo.eyepiece,
    barlow: bestCombo.barlow,
    magnification: Math.round(bestCombo.mag),
    exitPupil: Math.round(bestCombo.exitPupil * 10) / 10,
    reason,
    altitudeWarning,
    suitability,
  };
}

// Imaging recommendation with spec thresholds
interface ImagingSettings {
  exposureRange: string;
  gainOrIso: string;
  frames?: string;
  notes: string;
}

interface ImagingRec {
  feasibility: "yes" | "borderline" | "no";
  preferredCamera: 'astrocam' | 'smartphone' | 'dslr' | 'either';
  fallbackCamera?: 'astrocam' | 'smartphone' | 'dslr';
  settings: ImagingSettings;
  reason: string;
}

function getImagingSettings(category: string, cameraType: string): ImagingSettings {
  switch (category) {
    case 'planet':
    case 'moon':
      if (cameraType === 'astrocam') {
        return { exposureRange: '1-10ms', gainOrIso: 'Medium gain', frames: '2000-10000 frames', notes: 'Use video mode, stack best 10-30% of frames' };
      }
      return { exposureRange: '1/500s - 1/100s', gainOrIso: 'ISO 100-400', notes: 'Use burst mode, manual focus on limb' };
    case 'nebula':
    case 'emission_nebula':
    case 'mixed_nebula':
      if (cameraType === 'astrocam') {
        return { exposureRange: '5-30s', gainOrIso: 'High gain', frames: '50-200 frames', notes: 'Stack multiple exposures, use UHC filter' };
      }
      return { exposureRange: '1-4s', gainOrIso: 'ISO 3200-6400', frames: '200-600 frames', notes: 'Use tracking mount, stack exposures' };
    case 'reflection_nebula':
      if (cameraType === 'astrocam') {
        return { exposureRange: '10-60s', gainOrIso: 'Medium-high gain', frames: '100-300 frames', notes: 'No narrowband filters - reflection nebulae show continuum light' };
      }
      return { exposureRange: '2-4s', gainOrIso: 'ISO 3200-6400', frames: '200-500 frames', notes: 'Like galaxies - broadband light, no narrowband filters' };
    case 'dark_nebula':
      return { exposureRange: '30-120s', gainOrIso: cameraType === 'astrocam' ? 'High gain' : 'ISO 3200-6400', frames: '50-150 frames', notes: 'H-alpha filter recommended - images silhouette against emission background' };
    case 'planetary_nebula':
      return { exposureRange: '2-10s', gainOrIso: cameraType === 'astrocam' ? 'Medium-high gain' : 'ISO 1600-3200', frames: '100-300 frames', notes: 'Small targets - use higher magnification' };
    case 'supernova_remnant':
      return { exposureRange: '10-60s', gainOrIso: 'High gain/ISO', frames: '100+ frames', notes: 'Requires UHC/OIII filter and dark skies' };
    case 'galaxy':
      if (cameraType === 'astrocam') {
        return { exposureRange: '10-60s', gainOrIso: 'Medium-high gain', frames: '100-300 frames', notes: 'Long total integration time needed' };
      }
      return { exposureRange: '2-4s', gainOrIso: 'ISO 3200-6400', frames: '200-500 frames', notes: 'Challenging - astrocam strongly preferred' };
    case 'globular_cluster':
      return { exposureRange: '0.5-2s', gainOrIso: cameraType === 'astrocam' ? 'Medium gain' : 'ISO 1600-3200', frames: '50-150 frames', notes: 'Avoid overexposing core' };
    case 'open_cluster':
    case 'asterism':
      return { exposureRange: '1-5s', gainOrIso: cameraType === 'astrocam' ? 'Medium gain' : 'ISO 800-1600', frames: '30-100 frames', notes: 'Wide field often preferred' };
    case 'double_star':
      return { exposureRange: '1-100ms', gainOrIso: 'Low-medium gain/ISO', notes: 'Short exposures to freeze seeing' };
    case 'comet':
      if (cameraType === 'astrocam') {
        return { exposureRange: '30-120s', gainOrIso: 'Medium-high gain', frames: '20-100 frames', notes: 'Track on comet for sharp nucleus, or stars for sharp starfield' };
      }
      return { exposureRange: '5-30s', gainOrIso: 'ISO 1600-3200', frames: '50-200 frames', notes: 'Widefield lens recommended to capture tail' };
    case 'meteor_shower':
      return { exposureRange: '15-30s', gainOrIso: 'ISO 3200-6400', frames: 'Continuous shooting', notes: 'Use wide-angle lens on tripod, NOT telescope. Point at radiant.' };
    default:
      return { exposureRange: '1-10s', gainOrIso: 'ISO 1600-3200', notes: 'Experiment with settings' };
  }
}

function getImagingRecommendation(
  objectCategory: string,
  nightContext: NightContext,
  bortle: number
): ImagingRec {
  let feasibility: "yes" | "borderline" | "no" = "no";
  let reason = "";
  let preferredCamera: 'astrocam' | 'smartphone' | 'dslr' | 'either' = 'either';
  let fallbackCamera: 'astrocam' | 'smartphone' | 'dslr' | undefined = undefined;
  
  const { planetScore, dsoScore } = nightContext;

  // Imaging feasibility thresholds - exactly mirrors server/routes.ts
  switch (objectCategory) {
    case 'planet':
    case 'moon':
      // Planet Imaging: PlanetScore ≥3 → Yes, =2 → Borderline, <2 → No
      if (planetScore >= 3) { feasibility = 'yes'; reason = 'Excellent conditions for planetary imaging'; }
      else if (planetScore >= 2) { feasibility = 'borderline'; reason = 'Marginal conditions - imaging possible but results may vary'; }
      else { feasibility = 'no'; reason = 'Poor conditions - not recommended for imaging'; }
      preferredCamera = 'astrocam';
      fallbackCamera = 'smartphone';
      break;
      
    case 'nebula':
    case 'emission_nebula':
    case 'mixed_nebula':
    case 'planetary_nebula':
    case 'supernova_remnant':
      // Bright Nebula Imaging: DsoScore ≥4 → Yes, ≥3 → Borderline, <3 → No
      if (dsoScore >= 4) { feasibility = 'yes'; reason = 'Good conditions for nebula imaging'; }
      else if (dsoScore >= 3) { feasibility = 'borderline'; reason = 'Possible but requires longer exposures'; }
      else { feasibility = 'no'; reason = 'Too much interference for nebula imaging'; }
      preferredCamera = 'astrocam';
      fallbackCamera = 'dslr';
      break;
      
    case 'reflection_nebula':
      // Reflection nebulae need dark skies like galaxies (broadband light)
      if (bortle <= 5 && dsoScore >= 4) { feasibility = 'yes'; reason = 'Dark skies for reflection nebula imaging'; }
      else if (bortle <= 5 && dsoScore >= 3) { feasibility = 'borderline'; reason = 'Possible with longer exposures'; }
      else { feasibility = 'no'; reason = 'Reflection nebulae need dark skies (Bortle ≤5)'; }
      preferredCamera = 'astrocam';
      // No fallback - faint broadband targets
      break;
      
    case 'dark_nebula':
      // Dark nebulae require very dark skies
      if (bortle <= 4 && dsoScore >= 4) { feasibility = 'yes'; reason = 'Very dark skies ideal for dark nebula imaging'; }
      else if (bortle <= 5 && dsoScore >= 3) { feasibility = 'borderline'; reason = 'Marginal conditions - may need H-alpha filter'; }
      else { feasibility = 'no'; reason = 'Dark nebulae require very dark skies (Bortle ≤4)'; }
      preferredCamera = 'astrocam';
      // No fallback - faint broadband targets
      break;
      
    case 'galaxy':
      // Galaxy Imaging: Bortle ≤5 AND DsoScore ≥4 → Yes, else considerations
      if (bortle <= 5 && dsoScore >= 4) { feasibility = 'yes'; reason = 'Dark skies and good conditions for galaxy imaging'; }
      else if (bortle <= 5 && dsoScore >= 3) { feasibility = 'borderline'; reason = 'Possible with longer exposures'; }
      else { feasibility = 'no'; reason = 'Requires darker skies (Bortle ≤5) and better conditions'; }
      preferredCamera = 'astrocam';
      // No fallback for galaxies - astrocam only
      break;
      
    case 'open_cluster':
    case 'globular_cluster':
    case 'asterism':
      // Clusters/Asterisms are relatively easy
      feasibility = 'yes';
      reason = 'Star groups are relatively easy to image in most conditions';
      preferredCamera = 'either';
      break;
      
    case 'double_star':
      if (planetScore >= 2) { feasibility = 'yes'; reason = 'Good seeing for double star imaging'; }
      else { feasibility = 'borderline'; reason = 'Poor seeing may blur close doubles'; }
      preferredCamera = 'astrocam';
      fallbackCamera = 'smartphone';
      break;
      
    case 'comet':
      // Comets depend on sky conditions
      if (dsoScore >= 3) { feasibility = 'yes'; reason = 'Good conditions for comet imaging - capture tail details'; }
      else { feasibility = 'borderline'; reason = 'Imaging possible but tail may be washed out'; }
      preferredCamera = 'dslr'; // Widefield preferred for tails
      fallbackCamera = 'astrocam';
      break;
      
    case 'meteor_shower':
      // Meteor showers need clear, dark skies - no telescope needed
      if (bortle <= 5 && dsoScore >= 4) { feasibility = 'yes'; reason = 'Dark skies ideal for meteor photography'; }
      else if (bortle <= 6 && dsoScore >= 3) { feasibility = 'borderline'; reason = 'Some meteors visible but fainter ones may be lost'; }
      else { feasibility = 'no'; reason = 'Light pollution will obscure all but brightest meteors'; }
      preferredCamera = 'dslr'; // Wide angle lens required
      fallbackCamera = 'smartphone';
      break;
      
    default:
      if (dsoScore >= 3) { feasibility = 'borderline'; reason = 'Imaging may be possible with appropriate settings'; }
      else { feasibility = 'no'; reason = 'Not recommended for imaging'; }
      preferredCamera = 'either';
  }
  
  const settings = getImagingSettings(objectCategory, preferredCamera === 'either' ? 'astrocam' : preferredCamera);
  
  return { feasibility, preferredCamera, fallbackCamera, settings, reason };
}

function getVisibilityRating(
  objectCategory: string,
  difficulty: string | null,
  dsoScore: number,
  planetScore: number,
  bortle: number,
  moonIllumination: number
): { rating: 1 | 2 | 3 | 4 | 5; reason: string } {
  const isPlanet = ["planet", "moon"].includes(objectCategory);
  
  // v2.0: All scores are 0-10 scale
  let baseRating: number;
  if (isPlanet) {
    baseRating = planetScore >= 8 ? 5 : planetScore >= 6 ? 4 : planetScore >= 4 ? 3 : planetScore >= 2 ? 2 : 1;
  } else {
    baseRating = dsoScore >= 8 ? 5 : dsoScore >= 6 ? 4 : dsoScore >= 4 ? 3 : dsoScore >= 2 ? 2 : 1;
  }

  if (difficulty === "difficult" || difficulty === "expert") {
    baseRating = Math.max(1, baseRating - 1);
  }

  if (!isPlanet && moonIllumination > 70) {
    baseRating = Math.max(1, baseRating - 1);
  }

  if (bortle >= 7 && ["galaxy", "nebula"].includes(objectCategory)) {
    baseRating = Math.max(1, baseRating - 1);
  }

  const rating = Math.min(5, Math.max(1, Math.round(baseRating))) as 1 | 2 | 3 | 4 | 5;

  let reason = "";
  if (rating >= 4) {
    reason = "Conditions are favorable for this object";
  } else if (rating === 3) {
    reason = "Acceptable viewing, some details may be difficult";
  } else if (rating === 2) {
    reason = "Challenging conditions, basic features only";
  } else {
    reason = "Not recommended - consider waiting for better conditions";
  }

  return { rating, reason };
}

// Type for pending observation before session is saved
interface PendingObservation {
  id: string; // Temporary ID for UI purposes
  object: CelestialObject;
  telescope: TelescopeType;
  eyepiece: Eyepiece | null;
  barlow: Barlow | null;
  filter: FilterType | null;
  camera: CameraType | null;
  magnification: number | null;
  exitPupil: number | null;
  visibilityRating: number | null;
  imagingDone: boolean;
  suggestedEquipment: SuggestedEquipment | null;
  notes: string;
  photos: PendingPhoto[];
}

interface PendingPhoto {
  id: string;
  imageUrl: string;
  previewUrl?: string;
}

export default function Wizard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [selectedObject, setSelectedObject] = useState<CelestialObject | null>(null);
  const [selectedTelescope, setSelectedTelescope] = useState<TelescopeType | null>(null);
  const [objectSearch, setObjectSearch] = useState("");
  const [notes, setNotes] = useState("");
  
  // Ref to track XP before saving observation (for level-up detection)
  const previousXPRef = useRef<number | null>(null);
  
  // Step 3 filters (matching Sky Tonight)
  const [filterWow, setFilterWow] = useState(false);
  const [filterWellPositioned, setFilterWellPositioned] = useState(false);
  const [filterConditions, setFilterConditions] = useState<Set<ConditionsQuality>>(new Set());
  const [filterCategories, setFilterCategories] = useState<Set<string>>(new Set());
  const [filterWatchlist, setFilterWatchlist] = useState(false);
  
  // Track whether the user has completed Step 2 (conditions input)
  const [conditionsStepCompleted, setConditionsStepCompleted] = useState(false);
  const [sortBy, setSortBy] = useState<"altitude" | "name" | "magnitude">("altitude");
  
  // Observable hours toggle (matching Sky Tonight) - defaults to ON
  const [useObservableHours, setUseObservableHours] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('wizard-observable-hours');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });
  
  useEffect(() => {
    localStorage.setItem('wizard-observable-hours', String(useObservableHours));
  }, [useObservableHours]);
  
  // Multi-object session: list of observations to save together
  const [pendingObservations, setPendingObservations] = useState<PendingObservation[]>([]);
  
  // Pending photos state - photos uploaded during wizard, saved after observation is created
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [storageConfigured, setStorageConfigured] = useState<boolean | null>(null);
  
  // Used equipment state (what the observer actually used, may differ from suggested)
  const [usedEyepiece, setUsedEyepiece] = useState<Eyepiece | null>(null);
  const [usedBarlow, setUsedBarlow] = useState<Barlow | null>(null);
  const [usedFilter, setUsedFilter] = useState<FilterType | null>(null);
  const [usedCamera, setUsedCamera] = useState<CameraType | null>(null);
  const [manualVisibilityRating, setManualVisibilityRating] = useState<number | null>(null);
  const [useSuggested, setUseSuggested] = useState(true);
  
  // Enhanced equipment recommendation modal state
  const [showEquipmentDetailsModal, setShowEquipmentDetailsModal] = useState(false);
  
  // Optical modifier state for v2.0 unified calculations
  const [selectedModifierId, setSelectedModifierId] = useState<number | null>(null);

  const conditionsForm = useForm<z.infer<typeof conditionSchema>>({
    resolver: zodResolver(conditionSchema),
    defaultValues: { lowCloudPct: 20, midCloudPct: 30, highCloudPct: 40, seeing: 2.5, jetstream: 30, humidity: 50, moonIllumination: 25 },
  });

  const conditions = conditionsForm.watch();

  const { data: locations, isLoading: locationsLoading } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
    enabled: !!user,
  });

  // Fetch tonight's pre-saved conditions (per-user per-night, not per-location)
  const { data: tonightConditions } = useQuery<{
    lowCloudPct?: number;
    midCloudPct?: number;
    highCloudPct?: number;
    seeingArcsec?: number;
    jetStreamIndex?: number;
    humidity?: number;
    moonIllumination?: number;
  } | null>({
    queryKey: ['/api/night-conditions/tonight'],
    queryFn: async () => {
      const res = await fetch('/api/night-conditions/tonight', { credentials: 'include' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch conditions');
      return res.json();
    },
    enabled: !!user && !!selectedLocation,
    retry: false,
  });

  // Pre-populate form with tonight's saved conditions when available
  const [conditionsPreloaded, setConditionsPreloaded] = useState(false);
  
  // Check if Object Storage is configured when entering Step 5
  useEffect(() => {
    if (currentStep === 5 && storageConfigured === null) {
      apiRequest("POST", "/api/objects/upload")
        .then((res) => {
          if (res.ok) {
            setStorageConfigured(true);
          } else if (res.status === 503) {
            setStorageConfigured(false);
          } else {
            setStorageConfigured(true);
          }
        })
        .catch(() => {
          setStorageConfigured(false);
        });
    }
  }, [currentStep, storageConfigured]);

  useEffect(() => {
    if (tonightConditions && selectedLocation && !conditionsPreloaded) {
      conditionsForm.reset({
        lowCloudPct: tonightConditions.lowCloudPct ?? 20,
        midCloudPct: tonightConditions.midCloudPct ?? 20,
        highCloudPct: tonightConditions.highCloudPct ?? 20,
        seeing: tonightConditions.seeingArcsec ?? 2.5,
        jetstream: tonightConditions.jetStreamIndex ?? 30,
        humidity: tonightConditions.humidity ?? 50,
        moonIllumination: tonightConditions.moonIllumination ?? 25,
      });
      setConditionsPreloaded(true);
    }
  }, [tonightConditions, selectedLocation, conditionsPreloaded, conditionsForm]);
  
  // Derive conditions data for filtering
  // Consider conditions as "logged" if:
  // 1. We have persisted conditions from the API, OR
  // 2. User completed Step 2 in this wizard session (clicked Next from Step 2)
  const hasConditionsLogged = tonightConditions != null || conditionsStepCompleted;

  const { data: objects, isLoading: objectsLoading } = useQuery<CelestialObject[]>({
    queryKey: ["/api/objects"],
    enabled: !!user,
  });

  const { data: equipment, isLoading: equipmentLoading } = useQuery<Equipment>({
    queryKey: ["/api/equipment"],
    enabled: !!user,
  });

  // Fetch optical modifiers for v2.0 unified calculations
  const { data: opticalModifiers } = useQuery<OpticalModifier[]>({
    queryKey: ['/api/equipment/optical-modifiers'],
    enabled: !!user,
  });
  
  // Selected optical modifier for enhanced suitability calculations
  const selectedModifier: OpticalModifierSpecs | null = useMemo(() => {
    if (!selectedModifierId || !opticalModifiers) return null;
    const mod = opticalModifiers.find(m => m.id === selectedModifierId);
    if (!mod) return null;
    return { factor: Number(mod.factor), type: mod.type };
  }, [selectedModifierId, opticalModifiers]);

  // Fetch user's watchlist for filtering
  const { data: watchlistItems, isLoading: watchlistLoading } = useQuery<WatchlistItem[]>({
    queryKey: ["/api/watchlist"],
    enabled: !!user,
  });

  // Create a set of object IDs in watchlist for fast lookup - always returns a set (never undefined)
  const watchlistObjectIds = useMemo(() => {
    if (!watchlistItems || watchlistLoading) return new Set<number>();
    return new Set(watchlistItems.filter(item => item.status === 'planned').map(item => item.objectId));
  }, [watchlistItems, watchlistLoading]);
  
  // Track if watchlist data is ready for filtering
  const watchlistReady = !watchlistLoading && watchlistItems !== undefined;

  // Fetch tonight's astronomical data for visibility windows
  const { data: tonightAstro } = useQuery<TonightData>({
    queryKey: ["/api/astronomy/tonight", selectedLocation?.latitude, selectedLocation?.longitude],
    enabled: !!user && !!selectedLocation?.latitude && !!selectedLocation?.longitude,
    queryFn: async () => {
      const res = await fetch(`/api/astronomy/tonight?latitude=${selectedLocation!.latitude}&longitude=${selectedLocation!.longitude}`);
      if (!res.ok) throw new Error("Failed to fetch tonight data");
      return res.json();
    },
    staleTime: 300000, // 5 minutes
  });

  // Fetch ephemeris data for planets/moon
  interface EphemerisBody {
    catalogId: string;
    name: string;
    altitude: number;
    azimuth: number;
    riseTime: string | null;
    setTime: string | null;
    transitTime: string | null;
    isAboveHorizon: boolean;
  }
  interface EphemerisResponse {
    bodies: EphemerisBody[];
  }
  
  const { data: ephemerisData } = useQuery<EphemerisResponse>({
    queryKey: ["/api/ephemeris", selectedLocation?.latitude, selectedLocation?.longitude],
    enabled: !!user && !!selectedLocation?.latitude && !!selectedLocation?.longitude,
    queryFn: async () => {
      const res = await fetch(`/api/ephemeris?latitude=${selectedLocation!.latitude}&longitude=${selectedLocation!.longitude}`);
      if (!res.ok) throw new Error("Failed to fetch ephemeris");
      return res.json();
    },
    staleTime: 300000, // 5 minutes
  });

  // Server-side equipment recommendations for selected object (full filter data)
  interface ServerEquipmentRec {
    objectId: number;
    objectName: string;
    objectCategory: string;
    filter: {
      useFilter: boolean;
      filterType: string;
      reason: string;
      userFilter: { id: number; name: string; type: string } | null;
      primaryFilter?: { type: string; reason: string } | string;
      secondaryFilter?: { type: string; reason: string } | string;
      optionalFilters?: Array<{ type: string; reason: string } | string>;
      avoidFilters?: string[];
      warning?: string;
      allRecommendations?: Array<{ type: string; reason: string }>;
    };
    imaging: {
      feasibility: 'yes' | 'borderline' | 'no';
      preferredCamera: string;
      fallbackCamera?: string;
      settings: { exposureRange: string; gainOrIso: string; frames?: string; notes: string };
      reason: string;
    };
  }

  const { data: serverEquipmentRec, isLoading: serverEquipmentRecLoading } = useQuery<ServerEquipmentRec>({
    queryKey: ['/api/objects', selectedObject?.id, 'recommendations'],
    enabled: !!user && !!selectedObject?.id,
    queryFn: async () => {
      const res = await fetch(`/api/objects/${selectedObject!.id}/recommendations`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch recommendations');
      return res.json();
    },
    staleTime: 30000,
    refetchOnMount: 'always',
  });

  // Calculate visibility for each object at the selected location
  const objectVisibilityMap = useMemo(() => {
    if (!selectedLocation?.latitude || !selectedLocation?.longitude || !objects) {
      return new Map<number, ObjectVisibility>();
    }

    const now = new Date();
    const lat = selectedLocation.latitude * Math.PI / 180;
    const map = new Map<number, ObjectVisibility>();

    // Parse RA/Dec helper - handles various formats:
    // RA: "05h 35m", "05h 35m 17s", "05:35:17", "05 35 17", "5.588" (decimal hours)
    // Dec: "-05° 23'", "+41° 16' 09\"", "-05:23:00", "-5.383" (decimal degrees)
    const parseRaDec = (ra: string | null, dec: string | null): { ra: number; dec: number } | null => {
      if (!ra || !dec) return null;
      
      // Normalize by removing h, m, s, °, ', " and replacing with spaces
      const normalizeCoord = (str: string): number[] => {
        // Strip units and split on any non-digit/non-decimal separators
        const cleaned = str.replace(/[hms°'"]/gi, ' ').trim();
        // Extract all numbers (including decimals and negatives)
        const nums = cleaned.match(/[+-]?\d+(?:\.\d+)?/g);
        if (!nums || nums.length === 0) return [];
        return nums.map(n => parseFloat(n));
      };
      
      // Parse RA
      const raParts = normalizeCoord(ra);
      if (raParts.length === 0) return null;
      
      let raHours: number;
      if (raParts.length === 1) {
        // Decimal hours already
        raHours = raParts[0];
      } else {
        // HMS format: hours, minutes, optional seconds
        raHours = Math.abs(raParts[0]) + (raParts[1] || 0) / 60 + (raParts[2] || 0) / 3600;
      }
      const raDeg = raHours * 15; // Convert hours to degrees
      
      // Parse Dec
      const decSign = dec.trim().startsWith('-') ? -1 : 1;
      const decParts = normalizeCoord(dec);
      if (decParts.length === 0) return null;
      
      let decDeg: number;
      if (decParts.length === 1) {
        // Decimal degrees already
        decDeg = decParts[0];
      } else {
        // DMS format: degrees, arcminutes, optional arcseconds
        decDeg = decSign * (Math.abs(decParts[0]) + (decParts[1] || 0) / 60 + (decParts[2] || 0) / 3600);
      }
      
      return { ra: raDeg, dec: decDeg };
    };

    // Calculate Local Sidereal Time (approximate)
    const jd = now.getTime() / 86400000 + 2440587.5;
    const t = (jd - 2451545.0) / 36525;
    const gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + t * t * (0.000387933 - t / 38710000);
    const lst = ((gmst + selectedLocation.longitude) % 360 + 360) % 360;

    for (const obj of objects) {
      // Skip planets/moon - they use ephemeris
      if (['planet', 'moon'].includes(obj.category)) continue;
      
      const coords = parseRaDec(obj.rightAscension, obj.declination);
      if (!coords) continue;

      const dec = coords.dec * Math.PI / 180;
      const ha = ((lst - coords.ra + 360) % 360) * Math.PI / 180;
      
      // Calculate altitude and azimuth
      const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha);
      const altitude = Math.asin(sinAlt) * 180 / Math.PI;
      
      // Calculate max altitude (when object transits)
      const maxAlt = 90 - Math.abs(selectedLocation.latitude - coords.dec);

      // Estimate rise/set times (simplified)
      const cosHa0 = -Math.tan(lat) * Math.tan(dec);
      let riseTime: Date | undefined;
      let setTime: Date | undefined;
      
      if (cosHa0 >= -1 && cosHa0 <= 1) {
        const ha0 = Math.acos(cosHa0) * 180 / Math.PI;
        const hoursToRise = ((coords.ra - lst + ha0 + 360) % 360) / 15;
        const hoursToSet = ((coords.ra - lst - ha0 + 360) % 360) / 15;
        riseTime = new Date(now.getTime() + hoursToRise * 3600000);
        setTime = new Date(now.getTime() + hoursToSet * 3600000);
      }

      // Calculate transit time
      const hoursToTransit = ((coords.ra - lst + 360) % 360) / 15;
      const transitTime = new Date(now.getTime() + hoursToTransit * 3600000);

      // Calculate night window altitudes if we have twilight data
      let nightWindowData: NightWindowAltitudes | undefined;
      if (tonightAstro?.twilight?.astronomicalDusk && tonightAstro?.twilight?.astronomicalDawn && obj.rightAscension && obj.declination) {
        const nightWindowStart = new Date(tonightAstro.twilight.astronomicalDusk);
        const nightWindowEnd = new Date(tonightAstro.twilight.astronomicalDawn);
        nightWindowData = calculateNightWindowAltitudes(
          obj.rightAscension,
          obj.declination,
          selectedLocation.latitude,
          selectedLocation.longitude,
          nightWindowStart,
          nightWindowEnd,
          25, // wellPositionedThreshold
          transitTime,
          maxAlt
        );
      }
      
      // Determine if object is "well positioned" (above 25° during night window or current)
      const effectiveAltitude = nightWindowData?.nightMaxAltitude ?? altitude;
      const hasGoodPosition = effectiveAltitude >= 25;
      
      map.set(obj.id, {
        altitude,
        azimuth: 0, // Simplified
        isAboveHorizon: altitude > 0,
        riseTime,
        setTime,
        transitTime,
        maxAltitude: maxAlt,
        nightWindowData,
        hasGoodPosition,
      });
    }

    // Add ephemeris data for planets/moon
    if (ephemerisData?.bodies && objects) {
      for (const obj of objects) {
        if (!['planet', 'moon'].includes(obj.category)) continue;
        
        // Find matching ephemeris body by catalog ID
        const ephBody = ephemerisData.bodies.find(b => b.catalogId === obj.catalogId);
        if (ephBody) {
          // For planets, use current altitude since they move relatively fast
          const hasGoodPosition = ephBody.altitude >= 25;
          
          map.set(obj.id, {
            altitude: ephBody.altitude,
            azimuth: ephBody.azimuth,
            isAboveHorizon: ephBody.isAboveHorizon,
            riseTime: ephBody.riseTime ? new Date(ephBody.riseTime) : undefined,
            setTime: ephBody.setTime ? new Date(ephBody.setTime) : undefined,
            transitTime: ephBody.transitTime ? new Date(ephBody.transitTime) : undefined,
            maxAltitude: 90, // Planets can reach near-zenith
            hasGoodPosition,
          });
        }
      }
    }

    return map;
  }, [selectedLocation, objects, ephemerisData, tonightAstro]);

  // Check for moon interference with selected object
  const moonInterference = useMemo(() => {
    if (!selectedObject || !tonightAstro?.moon) return null;
    
    const { illumination, isUp, altitude } = tonightAstro.moon;
    const objVis = objectVisibilityMap.get(selectedObject.id);
    
    // Deep sky objects are sensitive to moon
    const isDSO = ['galaxy', 'nebula', 'emission_nebula', 'planetary_nebula', 'supernova_remnant', 
                   'open_cluster', 'globular_cluster'].includes(selectedObject.category);
    
    if (!isDSO) return null;
    
    if (illumination > 70 && isUp && altitude > 20) {
      return {
        level: 'high' as const,
        message: `Bright moon (${illumination}%) at ${altitude.toFixed(0)}° will significantly impact DSO viewing`,
        advice: 'Consider observing during moonless hours or waiting for moon to set'
      };
    }
    
    if (illumination > 40 && isUp && altitude > 10) {
      return {
        level: 'medium' as const,
        message: `Moon (${illumination}%) may reduce contrast for faint DSOs`,
        advice: 'Use narrowband filters or wait for moon to set'
      };
    }
    
    if (tonightAstro.moon.moonlessHours > 0) {
      return {
        level: 'low' as const,
        message: `${tonightAstro.moon.moonlessHours.toFixed(1)} moonless hours available tonight`,
        advice: 'Best window for deep sky observing'
      };
    }
    
    return null;
  }, [selectedObject, tonightAstro, objectVisibilityMap]);

  // Build moon context from tonight's astronomical data
  const currentMoonContext: MoonContext | undefined = tonightAstro?.moon
    ? { altitude: tonightAstro.moon.altitude, isUp: tonightAstro.moon.isUp }
    : undefined;

  const nightContext = selectedLocation 
    ? calculateScores(conditions, selectedLocation.bortle, currentMoonContext)
    : {
        powerClass: 'MID' as PowerClass,
        cloudScore: 0,
        seeingScore: 0,
        jetScore: 0,
        humidityScore: 0,
        moonScore: 0,
        totalScore: 0,
        planetScore: 0,
        dsoScore: 0,
      };

  // Legacy scores reference for backward compatibility
  const scores = nightContext;

  // Get current altitude for selected object
  const selectedObjectAltitude = selectedObject 
    ? objectVisibilityMap.get(selectedObject.id)?.altitude 
    : undefined;

  // Parse object angular size for size-aware eyepiece recommendations
  const selectedObjectAngularSize = selectedObject?.size 
    ? parseAngularSize(selectedObject.size) 
    : undefined;

  const eyepieceRec = selectedTelescope && selectedObject
    ? getEyepieceRecommendation(
        selectedTelescope,
        equipment?.eyepieces ?? [],
        equipment?.barlows ?? [],
        selectedObject.category,
        nightContext,
        selectedObjectAltitude,
        selectedObjectAngularSize ?? undefined
      )
    : null;

  // Calculate enhanced suitability using the v2.0 physics-based engine
  const enhancedSuitability: EnhancedSuitabilityScore | null = useMemo(() => {
    if (!selectedTelescope || !selectedObject || !eyepieceRec?.eyepiece) return null;
    
    const telescopeSpecs: TelescopeSpecs = {
      aperture: selectedTelescope.aperture,
      focalLength: selectedTelescope.focalLength,
      type: selectedTelescope.type || undefined,
      obstructionRatio: selectedTelescope.obstructionRatio ?? undefined,
    };
    
    const eyepieceSpecs: EyepieceSpecs = {
      focalLength: eyepieceRec.eyepiece.focalLength,
      apparentFov: eyepieceRec.eyepiece.apparentFov ?? undefined,
    };
    
    const objectSpecs: ObjectSpecs = {
      category: selectedObject.category,
      magnitude: selectedObject.magnitude,
      angularSize: selectedObject.size,
      separation: selectedObject.separation,
    };
    
    const environmentSpecs: EnvironmentSpecs = {
      bortle: selectedLocation?.bortle,
      seeingScore: nightContext.seeingScore,
      moonIllumination: conditions.moonIllumination,
    };
    
    const barlowSpecs: BarlowSpecs | undefined = eyepieceRec.barlow 
      ? { factor: eyepieceRec.barlow.factor }
      : undefined;
    
    return calculateEnhancedSuitability(
      telescopeSpecs,
      eyepieceSpecs,
      objectSpecs,
      environmentSpecs,
      barlowSpecs,
      selectedModifier ?? undefined
    );
  }, [selectedTelescope, selectedObject, eyepieceRec, selectedLocation, nightContext, conditions.moonIllumination, selectedModifier]);

  const filterRec = selectedObject
    ? getFilterRecommendation(selectedObject.category, equipment?.filters ?? [])
    : null;

  const imagingRec = selectedObject
    ? getImagingRecommendation(
        selectedObject.category,
        nightContext,
        selectedLocation?.bortle ?? 5
      )
    : null;

  const visibility = selectedObject
    ? getVisibilityRating(
        selectedObject.category,
        selectedObject.difficulty,
        scores.dsoScore,
        scores.planetScore,
        selectedLocation?.bortle ?? 5,
        conditions.moonIllumination
      )
    : null;

  // Get effective altitude for an object based on observable hours mode
  const getEffectiveAltitude = (objId: number): number => {
    const vis = objectVisibilityMap.get(objId);
    if (!vis) return -90;
    
    if (useObservableHours && vis.nightWindowData) {
      return vis.nightWindowData.nightMaxAltitude;
    }
    return vis.altitude;
  };

  // Compute conditions score for each object (based on category)
  const getObjectConditionsScore = (obj: CelestialObject): number | null => {
    if (!hasConditionsLogged || !nightContext) return null;
    
    // Use appropriate score based on category
    if (['planet', 'moon'].includes(obj.category)) {
      return nightContext.planetScore * 10; // Convert 0-10 to 0-100
    } else {
      return nightContext.dsoScore * 10;
    }
  };
  
  const filteredObjects = useMemo(() => {
    if (!objects) return [];
    
    let result = objects.filter((obj) => {
      // Search filter
      if (objectSearch !== "" && 
          !obj.name.toLowerCase().includes(objectSearch.toLowerCase()) &&
          !obj.catalogId.toLowerCase().includes(objectSearch.toLowerCase())) {
        return false;
      }
      
      // Wow filter - show only "hot" objects
      if (filterWow && !obj.isHot) return false;
      
      // Well positioned filter - above 25° altitude (uses effective altitude based on observable hours mode)
      if (filterWellPositioned) {
        const vis = objectVisibilityMap.get(obj.id);
        if (!vis) return false;
        
        // Use night window max altitude or current altitude based on observable hours mode
        const effectiveAlt = useObservableHours && vis.nightWindowData 
          ? vis.nightWindowData.nightMaxAltitude 
          : vis.altitude;
        if (effectiveAlt < 25) return false;
      }
      
      // Conditions filter - filter by conditions quality
      if (filterConditions.size > 0) {
        const condScore = getObjectConditionsScore(obj);
        if (condScore === null) return false;
        const quality = getConditionsQuality(condScore);
        if (!filterConditions.has(quality)) return false;
      }
      
      // Category filter
      if (filterCategories.size > 0) {
        if (!filterCategories.has(obj.category)) return false;
      }
      
      // Watchlist filter - show only objects in user's watchlist
      // Only apply filter when watchlist data is ready
      if (filterWatchlist && watchlistReady) {
        if (!watchlistObjectIds.has(obj.id)) return false;
      }
      
      return true;
    });
    
    // Sort
    result.sort((a, b) => {
      if (sortBy === "altitude") {
        const altA = getEffectiveAltitude(a.id);
        const altB = getEffectiveAltitude(b.id);
        return altB - altA;
      } else if (sortBy === "magnitude") {
        return (a.magnitude ?? 99) - (b.magnitude ?? 99);
      } else {
        return a.name.localeCompare(b.name);
      }
    });
    
    return result.slice(0, 24);  // Show more objects
  }, [objects, objectSearch, filterWow, filterWellPositioned, filterConditions, filterCategories, filterWatchlist, watchlistObjectIds, watchlistReady, sortBy, objectVisibilityMap, useObservableHours, hasConditionsLogged, nightContext]);

  // Auto-select first telescope when entering Step 4 if only one is available
  useEffect(() => {
    if (currentStep === 4 && !selectedTelescope && equipment?.telescopes?.length) {
      // Auto-select first telescope (or only telescope if just one)
      setSelectedTelescope(equipment.telescopes[0]);
    }
  }, [currentStep, selectedTelescope, equipment?.telescopes]);

  // Initialize used equipment from suggested when we reach step 4
  useEffect(() => {
    if (currentStep === 4 && useSuggested) {
      if (eyepieceRec?.eyepiece) setUsedEyepiece(eyepieceRec.eyepiece);
      if (eyepieceRec?.barlow) setUsedBarlow(eyepieceRec.barlow);
      else setUsedBarlow(null);
      // Use matched filter from recommendation if available
      if (filterRec?.matchedFilter) {
        setUsedFilter(filterRec.matchedFilter);
      } else {
        setUsedFilter(null);
      }
    }
  }, [currentStep, eyepieceRec, filterRec, useSuggested]);

  // Build suggested equipment object for storage
  const suggestedEquipment: SuggestedEquipment | null = selectedTelescope && eyepieceRec ? {
    telescopeId: selectedTelescope.id,
    telescopeName: selectedTelescope.name,
    eyepiece: eyepieceRec.eyepiece ? {
      id: eyepieceRec.eyepiece.id,
      name: eyepieceRec.eyepiece.name,
      focalLength: eyepieceRec.eyepiece.focalLength,
      reason: eyepieceRec.reason ?? "Best match for conditions"
    } : undefined,
    barlow: eyepieceRec.barlow ? {
      id: eyepieceRec.barlow.id,
      name: eyepieceRec.barlow.name,
      factor: eyepieceRec.barlow.factor,
      reason: "Used with eyepiece for optimal magnification"
    } : undefined,
    filter: filterRec ? {
      id: filterRec.matchedFilter?.id,
      name: filterRec.matchedFilter?.name,
      type: filterRec.filterType,
      status: filterRec.recommendation === 'always' ? 'required' : filterRec.recommendation === 'optional' ? 'optional' : 'not_recommended',
      recommendation: filterRec.recommendation,
      reason: filterRec.reason
    } : undefined,
    imaging: imagingRec ? {
      feasibility: imagingRec.feasibility,
      preferredCamera: imagingRec.preferredCamera,
      settings: imagingRec.settings ? {
        exposureRange: imagingRec.settings.exposureRange,
        isoGain: imagingRec.settings.gainOrIso,
        frameCount: imagingRec.settings.frames ?? "",
        notes: imagingRec.settings.notes
      } : undefined,
      reason: imagingRec.reason
    } : undefined,
    magnification: eyepieceRec.magnification,
    exitPupil: eyepieceRec.exitPupil,
    powerClass: nightContext.powerClass
  } : null;

  // Build current observation data from state
  const buildCurrentObservation = (): PendingObservation | null => {
    if (!selectedObject || !selectedTelescope) return null;
    
    let actualMag = eyepieceRec?.magnification ?? null;
    let actualExitPupil = eyepieceRec?.exitPupil ?? null;
    if (usedEyepiece && selectedTelescope) {
      const barlowFactor = usedBarlow?.factor ?? 1;
      actualMag = (selectedTelescope.focalLength / usedEyepiece.focalLength) * barlowFactor;
      actualExitPupil = selectedTelescope.aperture / actualMag;
    }
    
    return {
      id: `pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      object: selectedObject,
      telescope: selectedTelescope,
      eyepiece: usedEyepiece ?? eyepieceRec?.eyepiece ?? null,
      barlow: usedBarlow ?? eyepieceRec?.barlow ?? null,
      filter: usedFilter,
      camera: usedCamera,
      magnification: actualMag,
      exitPupil: actualExitPupil,
      visibilityRating: manualVisibilityRating ?? visibility?.rating ?? null,
      imagingDone: usedCamera !== null,
      suggestedEquipment,
      notes,
      photos: [...pendingPhotos],
    };
  };
  
  // Add current observation to pending list and reset for next object
  const addAnotherObject = () => {
    if (!selectedObject) {
      toast({ title: "No object selected", description: "Please select an object first.", variant: "destructive" });
      return;
    }
    if (!selectedTelescope) {
      toast({ title: "No telescope selected", description: "Please select a telescope first.", variant: "destructive" });
      return;
    }
    
    const currentObs = buildCurrentObservation();
    if (!currentObs) {
      toast({ title: "Unable to add observation", description: "Missing required data.", variant: "destructive" });
      return;
    }
    
    setPendingObservations(prev => [...prev, currentObs]);
    // Reset object-specific state for next observation
    setSelectedObject(null);
    setObjectSearch("");
    setNotes("");
    setUsedEyepiece(null);
    setUsedBarlow(null);
    setUsedFilter(null);
    setUsedCamera(null);
    setManualVisibilityRating(null);
    setUseSuggested(true);
    setPendingPhotos([]);
    // Go back to step 3 (object selection)
    setCurrentStep(3);
    toast({ title: "Object added! Select another object." });
  };
  
  // Remove a pending observation
  const removePendingObservation = (obsId: string) => {
    setPendingObservations(prev => prev.filter(o => o.id !== obsId));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Create session first
      const sessionResponse = await apiRequest("POST", "/api/sessions", {
        locationId: selectedLocation?.id,
        date: new Date().toISOString(),
        bortle: selectedLocation?.bortle,
        lowCloudPct: conditions.lowCloudPct,
        midCloudPct: conditions.midCloudPct,
        highCloudPct: conditions.highCloudPct,
        seeing: conditions.seeing,
        jetstream: conditions.jetstream,
        humidity: conditions.humidity,
        moonIllumination: conditions.moonIllumination,
        totalScore: scores.totalScore,
        planetScore: scores.planetScore,
        dsoScore: scores.dsoScore,
        notes: "", // Session notes are separate from observation notes
      });
      
      const session = await sessionResponse.json();

      // Collect all observations to save (pending + current if any)
      const allObservations: PendingObservation[] = [...pendingObservations];
      const currentObs = buildCurrentObservation();
      if (currentObs) {
        allObservations.push(currentObs);
      }

      // Save all observations
      for (const obs of allObservations) {
        const observationResponse = await apiRequest("POST", "/api/observations", {
          sessionId: session.id,
          objectId: obs.object.id,
          telescopeId: obs.telescope.id,
          eyepieceId: obs.eyepiece?.id,
          barlowId: obs.barlow?.id,
          filterId: obs.filter?.id,
          cameraId: obs.camera?.id,
          magnification: obs.magnification,
          exitPupil: obs.exitPupil,
          visibilityRating: obs.visibilityRating,
          imagingDone: obs.imagingDone,
          suggestedEquipment: obs.suggestedEquipment,
          notes: obs.notes,
        });

        const savedObservation = await observationResponse.json();

        // Save photos for this observation
        if (obs.photos.length > 0) {
          await Promise.all(
            obs.photos.map((photo) =>
              apiRequest("POST", `/api/observations/${savedObservation.id}/photos`, {
                imageUrl: photo.imageUrl,
              })
            )
          );
        }
      }

      // After saving all observations, update watchlist items that were observed
      // Copy watchlistItems at the start to avoid closure issues
      const currentWatchlist = watchlistItems ?? [];
      for (const obs of allObservations) {
        const watchlistItem = currentWatchlist.find(
          item => item.objectId === obs.object.id && item.status === 'planned'
        );
        if (watchlistItem) {
          try {
            await apiRequest("PATCH", `/api/watchlist/${watchlistItem.id}`, {
              status: 'observed'
            });
          } catch (e) {
            // Don't fail the save if watchlist update fails
            console.warn('Failed to update watchlist item:', e);
          }
        }
      }

      return session;
    },
    onSuccess: async () => {
      // Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/achievements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/messier-progress"] });
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      
      const totalObjects = pendingObservations.length + (selectedObject ? 1 : 0);
      const observationMessage = totalObjects > 1 
        ? `Session saved with ${totalObjects} observations!` 
        : "Observation logged successfully!";
      
      // Show observation toast first
      toast({ title: observationMessage });
      
      // Check for new badges and level ups, then show sequential toasts
      try {
        const badgeResponse = await apiRequest("POST", "/api/user/check-badges", {
          previousXP: previousXPRef.current
        });
        const { newBadges, levelUp } = await badgeResponse.json();
        
        // Use setTimeout to sequence badge and level toasts
        let delay = 800;
        
        if (newBadges && newBadges.length > 0) {
          for (const badge of newBadges) {
            setTimeout(() => {
              toast({
                title: `Badge Earned: ${badge.name}!`,
                description: badge.description,
                variant: "badge" as any,
              });
            }, delay);
            delay += 800;
          }
        }
        
        // Show level up toast last
        if (levelUp) {
          setTimeout(() => {
            toast({
              title: `Level Up! You're now Level ${levelUp.level}!`,
              description: `You've become a ${levelUp.title}!`,
              variant: "levelUp" as any,
              duration: 6000,
            });
          }, delay);
        }
      } catch (e) {
        // Ignore badge check errors
      }
      
      navigate("/sessions");
    },
    onError: () => {
      toast({ title: "Failed to save session", variant: "destructive" });
    },
  });

  const canProceed = () => {
    switch (currentStep) {
      case 1: return selectedLocation !== null;
      case 2: return true;
      case 3: return selectedObject !== null;
      case 4: return true;
      case 5: return true;
      default: return false;
    }
  };

  const handleNext = () => {
    if (currentStep < 5 && canProceed()) {
      // Track when user completes Step 2 (conditions input)
      if (currentStep === 2) {
        setConditionsStepCompleted(true);
      }
      setCurrentStep(currentStep + 1);
    }
    // Note: Saving is now handled by explicit button clicks in Step 5
  };
  
  // Handle finishing the session (save all)
  const handleFinishSession = async () => {
    // Get current XP before saving to detect level-ups
    // Try cached query data first (most reliable), then fall back to fetch
    // If we can't get the data, leave as null - server will skip level-up detection
    const cachedAchievements = queryClient.getQueryData(["/api/user/achievements"]) as any;
    
    if (cachedAchievements?.stats?.totalPoints !== undefined) {
      previousXPRef.current = cachedAchievements.stats.totalPoints;
    } else {
      // Fall back to fresh fetch if no cached data
      try {
        const achievementsResponse = await fetch("/api/user/achievements", {
          credentials: "include"
        });
        if (achievementsResponse.ok) {
          const achievements = await achievementsResponse.json();
          previousXPRef.current = achievements?.stats?.totalPoints ?? null;
        } else {
          previousXPRef.current = null; // Server will skip level-up detection
        }
      } catch (e) {
        // Server will skip level-up detection if previousXP is null
        previousXPRef.current = null;
      }
    }
    saveMutation.mutate();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Observation Wizard</h1>
          <p className="text-muted-foreground">Log a new observation with smart recommendations</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={cn(
                "flex-1 flex flex-col items-center",
                index > 0 && "border-l border-border"
              )}
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                  step.id < currentStep
                    ? "bg-primary text-primary-foreground"
                    : step.id === currentStep
                    ? "bg-primary/20 text-primary border-2 border-primary"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {step.id < currentStep ? <Check className="w-4 h-4" /> : step.id}
              </div>
              <span className="text-xs text-center mt-1 hidden sm:block">{step.title}</span>
            </div>
          ))}
        </div>
        <Progress value={(currentStep / 5) * 100} className="h-1" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{steps[currentStep - 1].title}</CardTitle>
          <CardDescription>{steps[currentStep - 1].description}</CardDescription>
        </CardHeader>
        <CardContent>
          {currentStep === 1 && (
            <div className="space-y-4">
              {locationsLoading ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
                </div>
              ) : locations?.length ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {locations.map((loc) => (
                    <Card
                      key={loc.id}
                      className={cn(
                        "cursor-pointer hover-elevate",
                        selectedLocation?.id === loc.id && "ring-2 ring-primary"
                      )}
                      onClick={() => setSelectedLocation(loc)}
                      data-testid={`card-select-location-${loc.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <MapPin className="w-5 h-5 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{loc.name}</p>
                            <p className="text-sm text-muted-foreground">
                              Bortle {loc.bortle}
                            </p>
                          </div>
                          {selectedLocation?.id === loc.id && (
                            <Check className="w-5 h-5 text-primary" />
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <MapPin className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">No locations added yet</p>
                  <Button variant="outline" className="mt-4" onClick={() => navigate("/locations")}>
                    Add a Location
                  </Button>
                </div>
              )}
            </div>
          )}

          {currentStep === 2 && (
            <Form {...conditionsForm}>
              <form className="space-y-6">
                {conditionsPreloaded && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 text-sm" data-testid="conditions-preloaded-notice">
                    <Info className="w-4 h-4 text-primary shrink-0" />
                    <span>
                      Conditions pre-filled from tonight's logged conditions. Validate with{" "}
                      <a 
                        href="https://www.meteoblue.com/en/weather/outdoorsports/seeing/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline hover:no-underline"
                        data-testid="link-meteoblue-wizard"
                      >
                        Meteoblue
                      </a>.
                    </span>
                  </div>
                )}
                <FormField
                  control={conditionsForm.control}
                  name="lowCloudPct"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Cloud className="w-4 h-4" />
                        Low Clouds (0-6k ft)
                      </FormLabel>
                      <FormControl>
                        <div className="space-y-2">
                          <Slider
                            min={0}
                            max={100}
                            step={5}
                            value={[field.value]}
                            onValueChange={(v) => field.onChange(v[0])}
                            data-testid="slider-low-clouds"
                          />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Clear</span>
                            <span className="font-mono">{field.value}%</span>
                            <span>Overcast</span>
                          </div>
                        </div>
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={conditionsForm.control}
                  name="midCloudPct"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Cloud className="w-4 h-4" />
                        Mid Clouds (6-20k ft)
                      </FormLabel>
                      <FormControl>
                        <div className="space-y-2">
                          <Slider
                            min={0}
                            max={100}
                            step={5}
                            value={[field.value]}
                            onValueChange={(v) => field.onChange(v[0])}
                            data-testid="slider-mid-clouds"
                          />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Clear</span>
                            <span className="font-mono">{field.value}%</span>
                            <span>Overcast</span>
                          </div>
                        </div>
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={conditionsForm.control}
                  name="highCloudPct"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Cloud className="w-4 h-4" />
                        High Clouds (20k+ ft)
                      </FormLabel>
                      <FormControl>
                        <div className="space-y-2">
                          <Slider
                            min={0}
                            max={100}
                            step={5}
                            value={[field.value]}
                            onValueChange={(v) => field.onChange(v[0])}
                            data-testid="slider-high-clouds"
                          />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Clear</span>
                            <span className="font-mono">{field.value}%</span>
                            <span>Overcast</span>
                          </div>
                        </div>
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="grid md:grid-cols-2 gap-6">
                  <FormField
                    control={conditionsForm.control}
                    name="seeing"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Eye className="w-4 h-4" />
                          Seeing (Arcseconds)
                        </FormLabel>
                        <FormControl>
                          <div className="space-y-2">
                            <Slider
                              min={0.5}
                              max={4}
                              step={0.1}
                              value={[field.value]}
                              onValueChange={(v) => field.onChange(v[0])}
                              data-testid="slider-seeing"
                            />
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Excellent (0.5″)</span>
                              <span className="font-mono">{field.value.toFixed(1)}″</span>
                              <span>Poor (4.0″)</span>
                            </div>
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={conditionsForm.control}
                    name="jetstream"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Wind className="w-4 h-4" />
                          Jetstream Index (0-100)
                        </FormLabel>
                        <FormControl>
                          <div className="space-y-2">
                            <Slider
                              min={0}
                              max={100}
                              step={1}
                              value={[field.value]}
                              onValueChange={(v) => field.onChange(v[0])}
                              data-testid="slider-jetstream"
                            />
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Calm (0)</span>
                              <span className="font-mono">{field.value}</span>
                              <span>Strong (100)</span>
                            </div>
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={conditionsForm.control}
                    name="humidity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Droplets className="w-4 h-4" />
                          Humidity
                        </FormLabel>
                        <FormControl>
                          <div className="space-y-2">
                            <Slider
                              min={0}
                              max={100}
                              step={5}
                              value={[field.value]}
                              onValueChange={(v) => field.onChange(v[0])}
                              data-testid="slider-humidity"
                            />
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Dry</span>
                              <span className="font-mono">{field.value}%</span>
                              <span>Humid</span>
                            </div>
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={conditionsForm.control}
                    name="moonIllumination"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel className="flex items-center gap-2">
                          <Moon className="w-4 h-4" />
                          Moon Illumination
                        </FormLabel>
                        <FormControl>
                          <div className="space-y-2">
                            <Slider
                              min={0}
                              max={100}
                              step={5}
                              value={[field.value]}
                              onValueChange={(v) => field.onChange(v[0])}
                              data-testid="slider-moon"
                            />
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>New Moon</span>
                              <span className="font-mono">{field.value}%</span>
                              <span>Full Moon</span>
                            </div>
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-4">Calculated Scores</p>
                  <div className="flex justify-center gap-8">
                    <ScoreDisplay score={scores.totalScore} maxScore={10} label="Total" size="md" />
                    <ScoreDisplay score={scores.planetScore} maxScore={10} label="Planet" size="sm" />
                    <ScoreDisplay score={scores.dsoScore} maxScore={10} label="DSO" size="sm" />
                  </div>
                </div>
              </form>
            </Form>
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              {/* Search and Filters Row - matching Sky Tonight */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search objects..."
                    value={objectSearch}
                    onChange={(e) => setObjectSearch(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-wizard-objects"
                  />
                </div>
                
                <Separator orientation="vertical" className="h-6 hidden sm:block" />
                
                {/* Filter Buttons - matching Sky Tonight */}
                <Button
                  variant={filterWow ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterWow(!filterWow)}
                  className={cn(
                    "gap-1.5",
                    filterWow && "bg-chart-4 hover:bg-chart-4/90"
                  )}
                  data-testid="button-filter-wow-wizard"
                >
                  <Sparkles className="w-4 h-4" />
                  Wow
                </Button>
                
                <Button
                  variant={filterWellPositioned ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterWellPositioned(!filterWellPositioned)}
                  className={cn(
                    "gap-1.5",
                    filterWellPositioned && "bg-chart-2 hover:bg-chart-2/90"
                  )}
                  data-testid="button-filter-well-positioned-wizard"
                >
                  <Eye className="w-4 h-4" />
                  Well Positioned
                </Button>
                
                {/* Watch List Filter - only show when watchlist is loaded and has items */}
                {watchlistReady && watchlistObjectIds.size > 0 && (
                  <Button
                    variant={filterWatchlist ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterWatchlist(!filterWatchlist)}
                    className={cn(
                      "gap-1.5",
                      filterWatchlist && "bg-primary hover:bg-primary/90"
                    )}
                    data-testid="button-filter-watchlist-wizard"
                  >
                    {filterWatchlist ? (
                      <BookmarkCheck className="w-4 h-4" />
                    ) : (
                      <Bookmark className="w-4 h-4" />
                    )}
                    Watch List
                    <Badge variant="secondary" className="ml-1 text-xs py-0 px-1.5 bg-background/20">
                      {watchlistObjectIds.size}
                    </Badge>
                  </Button>
                )}
                
                {/* Conditions Filter - Multi-select Popover */}
                {hasConditionsLogged && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant={filterConditions.size > 0 ? "default" : "outline"}
                        size="sm"
                        className={cn(
                          "gap-1.5",
                          filterConditions.size > 0 && "bg-chart-5 hover:bg-chart-5/90"
                        )}
                        data-testid="button-filter-conditions-wizard"
                      >
                        <CloudSun className="w-4 h-4" />
                        Conditions
                        {filterConditions.size > 0 && (
                          <Badge variant="secondary" className="ml-1 text-xs py-0 px-1.5">
                            {filterConditions.size}
                          </Badge>
                        )}
                        <ChevronDown className="w-3 h-3 ml-0.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-60 p-3" align="start">
                      <div className="space-y-2">
                        <p className="text-sm font-medium mb-2">Filter by Conditions Quality</p>
                        {(["excellent", "good", "fair", "poor", "very_poor"] as ConditionsQuality[]).map((quality) => {
                          const config = getConditionsConfig(quality);
                          const isChecked = filterConditions.has(quality);
                          return (
                            <label
                              key={quality}
                              className="flex items-center gap-2 cursor-pointer py-1"
                            >
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={(checked) => {
                                  const next = new Set(filterConditions);
                                  if (checked) {
                                    next.add(quality);
                                  } else {
                                    next.delete(quality);
                                  }
                                  setFilterConditions(next);
                                }}
                              />
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-xs",
                                  config.bg,
                                  config.border,
                                  config.text
                                )}
                              >
                                {config.label}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {quality === "excellent" && "80-100%"}
                                {quality === "good" && "60-79%"}
                                {quality === "fair" && "40-59%"}
                                {quality === "poor" && "20-39%"}
                                {quality === "very_poor" && "0-19%"}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                
                {/* Category Filter */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={filterCategories.size > 0 ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "gap-1.5",
                        filterCategories.size > 0 && "bg-accent hover:bg-accent/90"
                      )}
                      data-testid="button-filter-category-wizard"
                    >
                      <Layers className="w-4 h-4" />
                      <span className="hidden sm:inline">Type</span>
                      {filterCategories.size > 0 && (
                        <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] bg-background/20">
                          {filterCategories.size}
                        </Badge>
                      )}
                      <ChevronDown className="w-3 h-3 ml-0.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-3" align="start">
                    <div className="space-y-3">
                      <div className="font-medium text-sm">Filter by Object Type</div>
                      <div className="space-y-1 max-h-[300px] overflow-y-auto">
                        {[
                          { group: "Solar System", items: [
                            { value: "planet", label: "Planets" },
                            { value: "moon", label: "Moon" },
                          ]},
                          { group: "Nebulae", items: [
                            { value: "nebula", label: "Nebulae" },
                            { value: "emission_nebula", label: "Emission Nebulae" },
                            { value: "planetary_nebula", label: "Planetary Nebulae" },
                            { value: "reflection_nebula", label: "Reflection Nebulae" },
                            { value: "dark_nebula", label: "Dark Nebulae" },
                            { value: "supernova_remnant", label: "Supernova Remnants" },
                          ]},
                          { group: "Galaxies & Clusters", items: [
                            { value: "galaxy", label: "Galaxies" },
                            { value: "open_cluster", label: "Open Clusters" },
                            { value: "globular_cluster", label: "Globular Clusters" },
                          ]},
                          { group: "Stars", items: [
                            { value: "double_star", label: "Double Stars" },
                          ]},
                          { group: "Transients", items: [
                            { value: "comet", label: "Comets" },
                            { value: "meteor_shower", label: "Meteor Showers" },
                          ]},
                        ].map(({ group, items }) => (
                          <div key={group} className="py-1">
                            <div className="text-xs font-medium text-muted-foreground mb-1 px-2">{group}</div>
                            {items.map(({ value, label }) => {
                              const isChecked = filterCategories.has(value);
                              return (
                                <label
                                  key={value}
                                  className={cn(
                                    "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover-elevate",
                                    isChecked && "bg-accent/50"
                                  )}
                                >
                                  <Checkbox
                                    checked={isChecked}
                                    onCheckedChange={(checked) => {
                                      const newSet = new Set(filterCategories);
                                      if (checked) {
                                        newSet.add(value);
                                      } else {
                                        newSet.delete(value);
                                      }
                                      setFilterCategories(newSet);
                                    }}
                                    data-testid={`checkbox-category-${value}`}
                                  />
                                  <span className="text-sm">{label}</span>
                                </label>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                      {filterCategories.size > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setFilterCategories(new Set())}
                          className="w-full text-muted-foreground"
                        >
                          Clear selection
                        </Button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                
                {/* Observable Hours Toggle */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 border rounded-md px-2 py-1.5">
                      <Switch
                        checked={useObservableHours}
                        onCheckedChange={setUseObservableHours}
                        className="scale-75"
                        data-testid="switch-observable-hours"
                      />
                      <span className="text-xs font-medium">Obs Window</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs max-w-[200px]">
                      When ON, altitudes show the maximum during tonight's dark window.
                      When OFF, altitudes show current real-time positions.
                    </p>
                  </TooltipContent>
                </Tooltip>
                
                {/* Sort Icon Button */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8" data-testid="button-sort-wizard">
                      <ArrowUpDown className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-44 p-2" align="end">
                    <div className="space-y-1">
                      <button
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm rounded-md hover-elevate",
                          sortBy === "altitude" && "bg-accent"
                        )}
                        onClick={() => setSortBy("altitude")}
                      >
                        By Altitude
                      </button>
                      <button
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm rounded-md hover-elevate",
                          sortBy === "magnitude" && "bg-accent"
                        )}
                        onClick={() => setSortBy("magnitude")}
                      >
                        By Brightness
                      </button>
                      <button
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm rounded-md hover-elevate",
                          sortBy === "name" && "bg-accent"
                        )}
                        onClick={() => setSortBy("name")}
                      >
                        By Name
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
                
                {/* Help Icon */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <HelpCircle className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-4" align="end">
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm">Filter Guide</h4>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-start gap-2">
                          <Sparkles className="w-3.5 h-3.5 text-chart-4 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-medium">Wow:</span> Shows impressive, must-see targets
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <Eye className="w-3.5 h-3.5 text-chart-2 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-medium">Well Positioned:</span> Objects above 25° altitude
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <CloudSun className="w-3.5 h-3.5 text-chart-5 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-medium">Conditions:</span> Filter by weather quality (requires Tonight's Conditions to be logged)
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <div>
                            <span className="font-medium">Type:</span> Filter by object category (planets, nebulae, galaxies, etc.)
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <Bookmark className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                          <div>
                            <span className="font-medium">Watch List:</span> Shows only objects you've saved to your watch list
                          </div>
                        </div>
                      </div>
                      {hasConditionsLogged && (
                        <>
                          <Separator />
                          <div className="space-y-1.5">
                            <p className="text-xs font-medium">Conditions Quality Legend:</p>
                            {(["excellent", "good", "fair", "poor", "very_poor"] as ConditionsQuality[]).map((q) => {
                              const c = getConditionsConfig(q);
                              return (
                                <div key={q} className="flex items-center gap-2 text-xs">
                                  <Badge variant="outline" className={cn("text-[10px] py-0", c.bg, c.border, c.text)}>
                                    {c.label}
                                  </Badge>
                                  <span className="text-muted-foreground">{c.description}</span>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                
                {(filterWow || filterWellPositioned || filterConditions.size > 0 || filterCategories.size > 0 || filterWatchlist) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFilterWow(false);
                      setFilterWellPositioned(false);
                      setFilterConditions(new Set());
                      setFilterCategories(new Set());
                      setFilterWatchlist(false);
                    }}
                    className="text-muted-foreground"
                    data-testid="button-clear-filters-wizard"
                  >
                    Clear
                  </Button>
                )}
              </div>

              {/* Tonight Info Bar */}
              {tonightAstro && (
                <div className="p-3 rounded-lg bg-muted/30 flex flex-wrap items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span>Observation Window: </span>
                    <span className="font-mono">
                      {tonightAstro.observationWindow.start && tonightAstro.observationWindow.end
                        ? `${safeFormat(tonightAstro.observationWindow.start, "HH:mm")} - ${safeFormat(tonightAstro.observationWindow.end, "HH:mm")}`
                        : "Not available"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Moon className="w-4 h-4 text-muted-foreground" />
                    <span>{tonightAstro.moon.phaseName} ({Math.round(tonightAstro.moon.illumination)}%)</span>
                    {tonightAstro.moon.moonlessHours > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {tonightAstro.moon.moonlessHours.toFixed(1)}h moonless
                      </Badge>
                    )}
                  </div>
                  {hasConditionsLogged && nightContext && (
                    <ConditionsQualityBadge score={nightContext.totalScore * 10} />
                  )}
                  <Badge variant="outline" className="text-xs">
                    {filteredObjects.length} objects
                  </Badge>
                </div>
              )}
              
              {/* Warning when conditions not logged */}
              {!hasConditionsLogged && (
                <div className="p-3 rounded-lg bg-chart-5/10 border border-chart-5/30 flex items-center gap-2 text-sm">
                  <AlertTriangle className="w-4 h-4 text-chart-5 shrink-0" />
                  <span className="text-chart-5">
                    Tonight's conditions haven't been logged yet. Log conditions in Step 2 to enable conditions-based filtering and quality badges.
                  </span>
                </div>
              )}

              {/* Objects Grid */}
              {objectsLoading ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-32" />)}
                </div>
              ) : filteredObjects.length > 0 ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto pr-1">
                  {filteredObjects.map((obj) => {
                    const vis = objectVisibilityMap.get(obj.id);
                    const isPlanet = ['planet', 'moon'].includes(obj.category);
                    const isWow = obj.isHot;
                    
                    // Get conditions score for this object
                    const objCondScore = getObjectConditionsScore(obj);
                    
                    // Helper to get altitude color class
                    const getAltColor = (alt: number) => 
                      alt >= 40 ? "text-chart-2" :
                      alt >= 20 ? "text-chart-4" :
                      alt > 0 ? "text-chart-5" :
                      "text-muted-foreground";
                    
                    return (
                      <Card
                        key={obj.id}
                        className={cn(
                          "cursor-pointer hover-elevate transition-all",
                          selectedObject?.id === obj.id && "ring-2 ring-primary",
                          vis && !vis.isAboveHorizon && !vis.nightWindowData?.nightWellPositioned && "opacity-60"
                        )}
                        onClick={() => setSelectedObject(obj)}
                        data-testid={`card-select-object-${obj.catalogId}`}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                {isWow && (
                                  <Sparkles className="w-3.5 h-3.5 text-chart-4 shrink-0" />
                                )}
                                {watchlistReady && watchlistObjectIds.has(obj.id) && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Bookmark className="w-3.5 h-3.5 text-primary shrink-0 fill-primary" />
                                    </TooltipTrigger>
                                    <TooltipContent>On your watch list</TooltipContent>
                                  </Tooltip>
                                )}
                                <span className="font-mono text-xs text-muted-foreground">{obj.catalogId}</span>
                              </div>
                              <p className="font-medium text-sm truncate">{obj.name}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* Conditions quality badge */}
                              {objCondScore !== null && hasConditionsLogged && (
                                <ConditionsQualityBadge score={objCondScore} compact />
                              )}
                              {selectedObject?.id === obj.id && (
                                <Check className="w-4 h-4 text-primary" />
                              )}
                            </div>
                          </div>
                          
                          {/* Three altitude values row */}
                          {vis && (
                            <div className="flex items-center gap-2 mb-2 text-[10px] font-mono" data-testid={`altitude-metrics-${obj.catalogId}`}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-0.5">
                                    <span className="text-muted-foreground uppercase">Now</span>
                                    <span className={getAltColor(vis.altitude)}>
                                      {vis.altitude > 0 ? "+" : ""}{vis.altitude.toFixed(0)}°
                                    </span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>Current altitude right now</TooltipContent>
                              </Tooltip>
                              <span className="text-muted-foreground/40">|</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-0.5">
                                    <span className="text-muted-foreground uppercase">Transit</span>
                                    <span className={getAltColor(vis.maxAltitude)}>
                                      {vis.maxAltitude.toFixed(0)}°
                                    </span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Maximum altitude at transit</p>
                                  {vis.transitTime && isValid(vis.transitTime) && (
                                    <p className="text-muted-foreground">at {safeFormat(vis.transitTime, "HH:mm")}</p>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                              {vis.nightWindowData && (
                                <>
                                  <span className="text-muted-foreground/40">|</span>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex items-center gap-0.5">
                                        <Moon className="w-2.5 h-2.5 text-muted-foreground" />
                                        <span className={getAltColor(vis.nightWindowData.nightMaxAltitude)}>
                                          {vis.nightWindowData.nightMaxAltitude.toFixed(0)}°
                                        </span>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Max altitude during night window</p>
                                      {vis.nightWindowData.nightBestTime && (
                                        <p className="text-muted-foreground">at {safeFormat(vis.nightWindowData.nightBestTime, "HH:mm")}</p>
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                </>
                              )}
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="outline" className="text-[10px] capitalize py-0">
                              {obj.category.replace(/_/g, " ")}
                            </Badge>
                            {obj.magnitude && (
                              <Badge variant="secondary" className="text-[10px] py-0">
                                mag {obj.magnitude}
                              </Badge>
                            )}
                            {isPlanet && (
                              <Badge className="text-[10px] py-0 bg-chart-4/20 text-chart-4 border-chart-4/30">
                                Live
                              </Badge>
                            )}
                            {vis && !vis.isAboveHorizon && vis.riseTime && isValid(vis.riseTime) && (
                              <Badge variant="outline" className="text-[10px] py-0">
                                Rises {safeFormat(vis.riseTime, "HH:mm")}
                              </Badge>
                            )}
                          </div>
                          {obj.constellation && (
                            <p className="text-[10px] text-muted-foreground mt-1.5 truncate">
                              {obj.constellation}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Star className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground mb-2">
                    {(filterWow || filterWellPositioned || filterWatchlist || filterConditions.size > 0 || filterCategories.size > 0) 
                      ? filterWatchlist && watchlistObjectIds.size === 0
                        ? "Your watch list is empty"
                        : "No objects match your filters"
                      : "No objects found"}
                  </p>
                  {(filterWow || filterWellPositioned || filterWatchlist || filterConditions.size > 0 || filterCategories.size > 0) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setFilterWow(false);
                        setFilterWellPositioned(false);
                        setFilterWatchlist(false);
                        setFilterConditions(new Set());
                        setFilterCategories(new Set());
                      }}
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-6">
              {selectedObject && visibility && (
                <div className="p-4 rounded-lg bg-muted/30 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h3 className="font-medium">Viewing {selectedObject.name}</h3>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={nightContext.powerClass === 'HIGH' ? 'default' : nightContext.powerClass === 'MID' ? 'secondary' : 'outline'}
                        data-testid="badge-power-class"
                      >
                        {nightContext.powerClass} Power
                      </Badge>
                      <Badge className="capitalize">{selectedObject.category.replace("_", " ")}</Badge>
                    </div>
                  </div>
                  <VisibilityRating rating={visibility.rating} reason={visibility.reason} />
                  
                  {moonInterference && (
                    <div className={cn(
                      "flex items-start gap-3 p-3 rounded-lg",
                      moonInterference.level === 'high' && "bg-destructive/10 border border-destructive/30",
                      moonInterference.level === 'medium' && "bg-chart-5/10 border border-chart-5/30",
                      moonInterference.level === 'low' && "bg-chart-2/10 border border-chart-2/30"
                    )} data-testid="moon-interference-warning">
                      <AlertTriangle className={cn(
                        "w-5 h-5 mt-0.5",
                        moonInterference.level === 'high' && "text-destructive",
                        moonInterference.level === 'medium' && "text-chart-5",
                        moonInterference.level === 'low' && "text-chart-2"
                      )} />
                      <div>
                        <p className="font-medium text-sm">{moonInterference.message}</p>
                        <p className="text-sm text-muted-foreground mt-1">{moonInterference.advice}</p>
                      </div>
                    </div>
                  )}

                  {objectVisibilityMap.get(selectedObject.id) && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      <div className="p-2 rounded-md bg-background/50">
                        <span className="text-muted-foreground block text-xs">Current Alt</span>
                        <span className="font-mono font-medium">
                          {objectVisibilityMap.get(selectedObject.id)!.altitude.toFixed(1)}°
                        </span>
                      </div>
                      <div className="p-2 rounded-md bg-background/50">
                        <span className="text-muted-foreground block text-xs">Max Alt</span>
                        <span className="font-mono font-medium">
                          {objectVisibilityMap.get(selectedObject.id)!.maxAltitude.toFixed(1)}°
                        </span>
                      </div>
                      {objectVisibilityMap.get(selectedObject.id)!.transitTime && isValid(objectVisibilityMap.get(selectedObject.id)!.transitTime!) && (
                        <div className="p-2 rounded-md bg-background/50">
                          <span className="text-muted-foreground block text-xs">Transit</span>
                          <span className="font-mono font-medium">
                            {safeFormat(objectVisibilityMap.get(selectedObject.id)!.transitTime!, "HH:mm")}
                          </span>
                        </div>
                      )}
                      {objectVisibilityMap.get(selectedObject.id)!.setTime && isValid(objectVisibilityMap.get(selectedObject.id)!.setTime!) && (
                        <div className="p-2 rounded-md bg-background/50">
                          <span className="text-muted-foreground block text-xs">Sets</span>
                          <span className="font-mono font-medium">
                            {safeFormat(objectVisibilityMap.get(selectedObject.id)!.setTime!, "HH:mm")}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Select Telescope</h4>
                {equipmentLoading ? (
                  <Skeleton className="h-16" />
                ) : equipment?.telescopes?.length ? (
                  <div className="grid md:grid-cols-2 gap-3">
                    {equipment.telescopes.map((t) => (
                      <Card
                        key={t.id}
                        className={cn(
                          "cursor-pointer hover-elevate",
                          selectedTelescope?.id === t.id && "ring-2 ring-primary"
                        )}
                        onClick={() => setSelectedTelescope(t)}
                        data-testid={`card-select-telescope-${t.id}`}
                      >
                        <CardContent className="p-3 flex items-center gap-3">
                          <Telescope className="w-5 h-5 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{t.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {t.aperture}mm f/{(t.focalLength / t.aperture).toFixed(1)}
                            </p>
                          </div>
                          {selectedTelescope?.id === t.id && <Check className="w-4 h-4 text-primary" />}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No telescopes available</p>
                )}
              </div>

              {opticalModifiers && opticalModifiers.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    Optical Modifier
                  </h4>
                  <Select 
                    value={selectedModifierId?.toString() ?? "none"} 
                    onValueChange={(v) => setSelectedModifierId(v === "none" ? null : parseInt(v))}
                  >
                    <SelectTrigger className="w-full md:w-64" data-testid="select-optical-modifier">
                      <SelectValue placeholder="No Modifier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Modifier</SelectItem>
                      {opticalModifiers.map((mod) => (
                        <SelectItem key={mod.id} value={mod.id.toString()}>
                          {mod.name} ({mod.factor}x)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Focal reducers and coma correctors modify telescope optics
                  </p>
                </div>
              )}

              {eyepieceRec && eyepieceRec.eyepiece && (
                <div className="p-4 rounded-lg border space-y-3" data-testid="eyepiece-recommendation">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wand2 className="w-4 h-4 text-primary" />
                      <h4 className="font-medium">Your Eyepiece</h4>
                    </div>
                    <div className="flex items-center gap-2">
                      {enhancedSuitability ? (
                        <>
                          <Badge 
                            variant="outline"
                            className={cn("text-xs", getEnhancedBadgeStyles(enhancedSuitability.level))}
                            data-testid="badge-eyepiece-suitability"
                          >
                            {getEnhancedBadgeLabel(enhancedSuitability.level)} ({enhancedSuitability.score}%)
                          </Badge>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setShowEquipmentDetailsModal(true)}
                                data-testid="button-equipment-info"
                              >
                                <Info className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>View detailed calculation breakdown</TooltipContent>
                          </Tooltip>
                        </>
                      ) : eyepieceRec.suitability && (
                        <Badge 
                          variant="outline"
                          className={cn("text-xs", getSuitabilityBadgeStyles(eyepieceRec.suitability.level))}
                          data-testid="badge-eyepiece-suitability"
                        >
                          {getSuitabilityBadgeLabel(eyepieceRec.suitability.level)}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {eyepieceRec.altitudeWarning && (
                    <div className="flex items-start gap-2 p-2 rounded-md bg-chart-5/10 border border-chart-5/30 text-sm">
                      <ArrowDown className="w-4 h-4 mt-0.5 text-chart-5" />
                      <span className="text-chart-5">{eyepieceRec.altitudeWarning}</span>
                    </div>
                  )}
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Eyepiece:</span>
                      <span className="ml-2 font-medium">{eyepieceRec.eyepiece.name}</span>
                    </div>
                    {eyepieceRec.barlow && (
                      <div>
                        <span className="text-muted-foreground">Barlow:</span>
                        <span className="ml-2 font-medium">{eyepieceRec.barlow.name}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Magnification:</span>
                      <span className="ml-2 font-mono font-medium">{eyepieceRec.magnification}x</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Exit Pupil:</span>
                      <span className="ml-2 font-mono font-medium">{eyepieceRec.exitPupil}mm</span>
                    </div>
                  </div>
                  {enhancedSuitability && (
                    <p className="text-sm text-muted-foreground">{enhancedSuitability.summary}</p>
                  )}
                  {!enhancedSuitability && eyepieceRec.suitability && eyepieceRec.suitability.level !== 'excellent' && (
                    <p className="text-xs text-muted-foreground italic">{eyepieceRec.suitability.reason}</p>
                  )}
                </div>
              )}

              {(serverEquipmentRec?.filter || filterRec) && (
                <div className="p-4 rounded-lg border space-y-3" data-testid="filter-recommendation">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FilterIcon className="w-4 h-4 text-primary" />
                      <h4 className="font-medium">Filter Recommendation</h4>
                    </div>
                    <div className="flex items-center gap-2">
                      {(serverEquipmentRec?.filter?.userFilter || filterRec?.matchedFilter) && (
                        <Badge variant="outline" className="text-xs" data-testid="badge-filter-matched">
                          <Check className="w-3 h-3 mr-1" />
                          {serverEquipmentRec?.filter?.userFilter?.name || filterRec?.matchedFilter?.name}
                        </Badge>
                      )}
                      {serverEquipmentRec?.filter?.useFilter && (
                        <Badge variant="outline" className="text-xs bg-chart-4/10 border-chart-4/30 text-chart-4">
                          Suggested
                        </Badge>
                      )}
                      {!serverEquipmentRec?.filter && filterRec && (
                        <Badge 
                          variant={filterRec.recommendation === 'always' ? 'default' : filterRec.recommendation === 'optional' ? 'secondary' : 'outline'}
                          data-testid="badge-filter"
                        >
                          {filterRec.recommendation === 'always' 
                            ? `${filterRec.filterType.toUpperCase()} Required` 
                            : filterRec.recommendation === 'optional'
                            ? `${filterRec.filterType.toUpperCase()} Optional`
                            : 'No Filter'}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {serverEquipmentRecLoading ? (
                    <Skeleton className="h-16 w-full" />
                  ) : serverEquipmentRec?.filter ? (
                    <div className="space-y-2">
                      {serverEquipmentRec.filter.useFilter ? (
                        <>
                          {(() => {
                            const primaryType = typeof serverEquipmentRec.filter.primaryFilter === 'object' 
                              ? serverEquipmentRec.filter.primaryFilter?.type 
                              : serverEquipmentRec.filter.primaryFilter || serverEquipmentRec.filter.filterType;
                            
                            return primaryType && primaryType !== 'none' && (
                              <div className="p-3 rounded-md bg-chart-4/5 border border-chart-4/20">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="default" className="text-xs bg-chart-4 text-chart-4-foreground">
                                      Primary
                                    </Badge>
                                    <span className="font-medium text-sm">
                                      {primaryType.toUpperCase()} Filter
                                    </span>
                                  </div>
                                  {serverEquipmentRec.filter.userFilter && serverEquipmentRec.filter.userFilter.type.toLowerCase().includes(primaryType.toLowerCase()) && (
                                    <Badge variant="secondary" className="text-xs">
                                      You have this
                                    </Badge>
                                  )}
                                </div>
                                {serverEquipmentRec.filter.userFilter && serverEquipmentRec.filter.userFilter.type.toLowerCase().includes(primaryType.toLowerCase()) && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Use: {serverEquipmentRec.filter.userFilter.name}
                                  </p>
                                )}
                              </div>
                            );
                          })()}
                          
                          {(() => {
                            const secondaryType = typeof serverEquipmentRec.filter.secondaryFilter === 'object' 
                              ? serverEquipmentRec.filter.secondaryFilter?.type 
                              : serverEquipmentRec.filter.secondaryFilter;
                            
                            return secondaryType && (
                              <div className="p-3 rounded-md bg-muted/30 border border-muted-foreground/10">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    Alternative
                                  </Badge>
                                  <span className="font-medium text-sm">
                                    {secondaryType.toUpperCase()} Filter
                                  </span>
                                </div>
                              </div>
                            );
                          })()}

                          {serverEquipmentRec.filter.optionalFilters && serverEquipmentRec.filter.optionalFilters.length > 0 && (
                            <div className="text-xs text-muted-foreground">
                              <span className="font-medium">Also helpful: </span>
                              {serverEquipmentRec.filter.optionalFilters.map((f: any) => 
                                typeof f === 'object' ? f.type.toUpperCase() : f.toUpperCase()
                              ).join(', ')}
                            </div>
                          )}

                          {serverEquipmentRec.filter.avoidFilters && serverEquipmentRec.filter.avoidFilters.length > 0 && (
                            <div className="text-xs text-destructive">
                              <span className="font-medium">Avoid: </span>
                              {serverEquipmentRec.filter.avoidFilters.map((f: string) => f.toUpperCase()).join(', ')}
                            </div>
                          )}

                          <p className="text-xs text-muted-foreground">{serverEquipmentRec.filter.reason}</p>
                        </>
                      ) : (
                        <>
                          <div className="p-3 rounded-md bg-muted/30 border border-muted-foreground/10">
                            <div className="flex items-center gap-2">
                              <Eye className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium text-sm">No Filter Needed</span>
                            </div>
                          </div>
                          
                          {serverEquipmentRec.filter.secondaryFilter && (() => {
                            const secondaryType = typeof serverEquipmentRec.filter.secondaryFilter === 'object' 
                              ? serverEquipmentRec.filter.secondaryFilter?.type 
                              : serverEquipmentRec.filter.secondaryFilter;
                            
                            return secondaryType && secondaryType !== 'none' && (
                              <div className="p-3 rounded-md bg-muted/20 border border-muted-foreground/10">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    Optional
                                  </Badge>
                                  <span className="font-medium text-sm">
                                    {secondaryType.toUpperCase()} Filter
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Can enhance detail and reduce glare
                                </p>
                              </div>
                            );
                          })()}

                          {serverEquipmentRec.filter.optionalFilters && serverEquipmentRec.filter.optionalFilters.length > 0 && (
                            <div className="text-xs text-muted-foreground">
                              <span className="font-medium">Also helpful: </span>
                              {serverEquipmentRec.filter.optionalFilters.map((f: any) => 
                                typeof f === 'object' ? f.type.toUpperCase() : f.toUpperCase()
                              ).join(', ')}
                            </div>
                          )}

                          {serverEquipmentRec.filter.avoidFilters && serverEquipmentRec.filter.avoidFilters.length > 0 && (
                            <div className="text-xs text-destructive">
                              <span className="font-medium">Avoid: </span>
                              {serverEquipmentRec.filter.avoidFilters.map((f: string) => f.toUpperCase()).join(', ')}
                            </div>
                          )}

                          <p className="text-xs text-muted-foreground">{serverEquipmentRec.filter.reason}</p>
                        </>
                      )}
                    </div>
                  ) : filterRec && (
                    <>
                      <p className="text-sm text-muted-foreground">{filterRec.reason}</p>
                      {filterRec.warning && (
                        <div className="flex items-start gap-2 p-2 rounded-md bg-chart-5/10 border border-chart-5/30 text-sm" data-testid="filter-warning">
                          <AlertTriangle className="w-4 h-4 mt-0.5 text-chart-5 shrink-0" />
                          <span className="text-chart-5">{filterRec.warning}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {imagingRec && (
                <div className="p-4 rounded-lg border space-y-3" data-testid="imaging-recommendation">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Camera className="w-4 h-4 text-primary" />
                      <h4 className="font-medium">Imaging Recommendation</h4>
                    </div>
                    <Badge variant={
                      imagingRec.feasibility === "yes" ? "default" :
                      imagingRec.feasibility === "borderline" ? "secondary" : "outline"
                    }>
                      {imagingRec.feasibility === "yes" ? "Recommended" :
                       imagingRec.feasibility === "borderline" ? "Borderline" : "Not Recommended"}
                    </Badge>
                  </div>
                  <div className="text-sm space-y-1">
                    <div>
                      <span className="text-muted-foreground">Camera:</span>
                      <span className="ml-2 font-medium capitalize">
                        {imagingRec.preferredCamera === 'either' ? 'Any camera' : imagingRec.preferredCamera}
                        {imagingRec.fallbackCamera && ` (or ${imagingRec.fallbackCamera})`}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Exposure:</span>
                      <span className="ml-2 font-mono">{imagingRec.settings.exposureRange}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Gain/ISO:</span>
                      <span className="ml-2">{imagingRec.settings.gainOrIso}</span>
                    </div>
                    {imagingRec.settings.frames && (
                      <div>
                        <span className="text-muted-foreground">Frames:</span>
                        <span className="ml-2">{imagingRec.settings.frames}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Notes:</span>
                      <span className="ml-2 text-xs">{imagingRec.settings.notes}</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{imagingRec.reason}</p>
                </div>
              )}
            </div>
          )}

          {currentStep === 5 && (
            <div className="space-y-6">
              {/* Pending Observations - Objects already added to this session */}
              {pendingObservations.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium flex items-center gap-2">
                      <Star className="w-4 h-4 text-primary" />
                      Objects in this Session ({pendingObservations.length})
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {pendingObservations.map((obs) => (
                      <div 
                        key={obs.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border"
                        data-testid={`pending-observation-${obs.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <Badge variant="secondary" className="font-mono text-xs">
                            {obs.object.catalogId}
                          </Badge>
                          <span className="font-medium">{obs.object.name}</span>
                          {obs.magnification && (
                            <span className="text-xs text-muted-foreground font-mono">
                              {Math.round(obs.magnification)}x
                            </span>
                          )}
                          {obs.imagingDone && (
                            <Badge className="text-xs bg-emerald-500/20 text-emerald-600">
                              <Camera className="w-3 h-3 mr-1" />
                              Imaged
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removePendingObservation(obs.id)}
                          data-testid={`button-remove-pending-${obs.id}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="border-t pt-4">
                    <h4 className="font-medium text-sm text-muted-foreground mb-3">Adding: {selectedObject?.name}</h4>
                  </div>
                </div>
              )}

              {/* Current Object Summary */}
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <h4 className="font-medium">Location</h4>
                  <p className="text-muted-foreground">{selectedLocation?.name} (Bortle {selectedLocation?.bortle})</p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">Current Object</h4>
                  <p className="text-muted-foreground">{selectedObject?.catalogId} - {selectedObject?.name}</p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">Scores</h4>
                  <p className="font-mono text-muted-foreground">
                    Total: {scores.totalScore.toFixed(1)} | Planet: {scores.planetScore.toFixed(1)} | DSO: {scores.dsoScore.toFixed(1)}
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">Suggested Equipment</h4>
                  <p className="text-muted-foreground text-xs">
                    {selectedTelescope?.name ?? "None"} + {eyepieceRec?.eyepiece?.name ?? "None"}
                    {eyepieceRec?.barlow ? ` + ${eyepieceRec.barlow.name}` : ""}
                    {filterRec?.matchedFilter ? ` + ${filterRec.matchedFilter.name}` : filterRec?.recommendation !== 'never' ? ` + ${filterRec?.filterType?.toUpperCase()} (not owned)` : ""}
                  </p>
                </div>
              </div>

              {/* Used Equipment Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium flex items-center gap-2">
                    <Telescope className="w-4 h-4" />
                    Equipment Actually Used
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setUseSuggested(!useSuggested);
                      if (!useSuggested && eyepieceRec) {
                        setUsedEyepiece(eyepieceRec.eyepiece ?? null);
                        setUsedBarlow(eyepieceRec.barlow ?? null);
                        if (filterRec?.matchedFilter) {
                          setUsedFilter(filterRec.matchedFilter);
                        } else {
                          setUsedFilter(null);
                        }
                      }
                    }}
                    data-testid="button-toggle-suggested"
                  >
                    {useSuggested ? "Customize" : "Use Suggested"}
                  </Button>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {/* Eyepiece selector */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Eyepiece</label>
                    <Select
                      value={usedEyepiece?.id?.toString() ?? "none"}
                      onValueChange={(val) => {
                        if (val === "none") setUsedEyepiece(null);
                        else setUsedEyepiece(equipment?.eyepieces?.find(e => e.id === parseInt(val)) ?? null);
                        setUseSuggested(false);
                      }}
                    >
                      <SelectTrigger data-testid="select-used-eyepiece">
                        <SelectValue placeholder="Select eyepiece" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {equipment?.eyepieces?.map((ep) => (
                          <SelectItem key={ep.id} value={ep.id.toString()}>
                            {ep.name} ({ep.focalLength}mm)
                            {eyepieceRec?.eyepiece?.id === ep.id && " ★"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Barlow selector */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Barlow</label>
                    <Select
                      value={usedBarlow?.id?.toString() ?? "none"}
                      onValueChange={(val) => {
                        if (val === "none") setUsedBarlow(null);
                        else setUsedBarlow(equipment?.barlows?.find(b => b.id === parseInt(val)) ?? null);
                        setUseSuggested(false);
                      }}
                    >
                      <SelectTrigger data-testid="select-used-barlow">
                        <SelectValue placeholder="Select barlow" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {equipment?.barlows?.map((bl) => (
                          <SelectItem key={bl.id} value={bl.id.toString()}>
                            {bl.name} ({bl.factor}x)
                            {eyepieceRec?.barlow?.id === bl.id && " ★"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Filter selector */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Filter</label>
                    <Select
                      value={usedFilter?.id?.toString() ?? "none"}
                      onValueChange={(val) => {
                        if (val === "none") setUsedFilter(null);
                        else setUsedFilter(equipment?.filters?.find(f => f.id === parseInt(val)) ?? null);
                        setUseSuggested(false);
                      }}
                    >
                      <SelectTrigger data-testid="select-used-filter">
                        <SelectValue placeholder="Select filter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Filter</SelectItem>
                        {equipment?.filters?.map((fl) => (
                          <SelectItem key={fl.id} value={fl.id.toString()}>
                            {fl.name} ({fl.type?.toUpperCase()})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Camera selector */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Camera (if imaging)</label>
                    <Select
                      value={usedCamera?.id?.toString() ?? "none"}
                      onValueChange={(val) => {
                        if (val === "none") setUsedCamera(null);
                        else setUsedCamera(equipment?.cameras?.find(c => c.id === parseInt(val)) ?? null);
                        setUseSuggested(false);
                      }}
                    >
                      <SelectTrigger data-testid="select-used-camera">
                        <SelectValue placeholder="Select camera" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (Visual only)</SelectItem>
                        {equipment?.cameras?.map((cam) => (
                          <SelectItem key={cam.id} value={cam.id.toString()}>
                            {cam.name} ({cam.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Show computed values for used equipment */}
                {usedEyepiece && selectedTelescope && (
                  <div className="p-3 rounded-lg bg-muted/50 text-sm">
                    <div className="flex flex-wrap gap-4">
                      <div>
                        <span className="text-muted-foreground">Magnification:</span>
                        <span className="ml-2 font-mono">
                          {((selectedTelescope.focalLength / usedEyepiece.focalLength) * (usedBarlow?.factor ?? 1)).toFixed(0)}x
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Exit Pupil:</span>
                        <span className="ml-2 font-mono">
                          {(selectedTelescope.aperture / ((selectedTelescope.focalLength / usedEyepiece.focalLength) * (usedBarlow?.factor ?? 1))).toFixed(1)}mm
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Visibility Rating */}
              <InteractiveStarRating
                value={manualVisibilityRating ?? visibility?.rating ?? null}
                onChange={(rating) => setManualVisibilityRating(rating)}
                label="Your Visibility Rating"
              />

              <div className="space-y-2">
                <label className="text-sm font-medium">Notes (optional)</label>
                <Textarea
                  placeholder="Any observations or notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  data-testid="input-observation-notes"
                />
              </div>

              {/* Photo Upload Section */}
              <div className="space-y-3 pt-4 border-t">
                <label className="text-sm font-medium">Photos (optional)</label>
                {storageConfigured === null ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking storage...
                  </div>
                ) : storageConfigured === false ? (
                  <p className="text-sm text-muted-foreground">
                    Photo uploads are not available. Storage needs to be configured.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {/* Pending Photos Grid */}
                    {pendingPhotos.length > 0 && (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {pendingPhotos.map((photo) => (
                          <div key={photo.id} className="relative group aspect-square rounded-lg overflow-hidden bg-muted">
                            <img 
                              src={photo.previewUrl || photo.imageUrl} 
                              alt="Observation photo" 
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => setPendingPhotos(prev => prev.filter(p => p.id !== photo.id))}
                              className="absolute top-1 right-1 p-1 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                              data-testid={`button-remove-photo-${photo.id}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Upload Button */}
                    <ObjectUploader
                      maxNumberOfFiles={5}
                      maxFileSize={10485760}
                      onGetUploadParameters={async () => {
                        const response = await apiRequest("POST", "/api/objects/upload");
                        const data = await response.json();
                        return { method: "PUT" as const, url: data.uploadURL };
                      }}
                      onComplete={(result) => {
                        if (result.successful && result.successful.length > 0) {
                          const newPhotos = result.successful.map((file) => ({
                            id: crypto.randomUUID(),
                            imageUrl: file.uploadURL || "",
                            previewUrl: file.preview as string | undefined,
                          }));
                          setPendingPhotos(prev => [...prev, ...newPhotos]);
                          toast({
                            title: "Photo uploaded",
                            description: `${result.successful.length} photo(s) ready to save with observation`,
                          });
                        }
                      }}
                      buttonVariant="outline"
                      disabled={isUploadingPhoto}
                    >
                      <ImagePlus className="w-4 h-4 mr-2" />
                      Add Photos
                    </ObjectUploader>
                    
                    {pendingPhotos.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {pendingPhotos.length} photo(s) will be saved with your observation
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col md:flex-row md:justify-between gap-2 md:gap-0">
        <Button
          variant="outline"
          onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
          disabled={currentStep === 1}
          data-testid="button-wizard-back"
          className="md:w-auto w-full"
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        
        {currentStep === 5 ? (
          <div className="flex flex-col md:flex-row gap-2 md:gap-2 w-full md:w-auto md:ml-auto">
            <Button
              variant="outline"
              onClick={addAnotherObject}
              disabled={!canProceed() || saveMutation.isPending}
              data-testid="button-add-another-object"
              className="md:w-auto w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Another Object
            </Button>
            <Button
              onClick={handleFinishSession}
              disabled={!canProceed() || saveMutation.isPending}
              data-testid="button-finish-session"
              className="md:w-auto w-full"
            >
              {saveMutation.isPending ? (
                "Saving..."
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  {pendingObservations.length > 0 
                    ? `Finish Session (${pendingObservations.length + 1} objects)`
                    : "Save Observation"
                  }
                </>
              )}
            </Button>
          </div>
        ) : (
          <Button
            onClick={handleNext}
            disabled={!canProceed()}
            data-testid="button-wizard-next"
            className="md:w-auto w-full"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>

      {/* Equipment Recommendation Details Modal */}
      {enhancedSuitability && selectedTelescope && selectedObject && eyepieceRec?.eyepiece && (
        <EquipmentRecommendationModal
          open={showEquipmentDetailsModal}
          onOpenChange={setShowEquipmentDetailsModal}
          suitability={enhancedSuitability}
          objectName={selectedObject.name}
          objectCategory={selectedObject.category}
          telescopeName={selectedTelescope.name}
          telescopeType={selectedTelescope.type ?? undefined}
          eyepieceName={eyepieceRec.eyepiece.name}
          barlowName={eyepieceRec.barlow?.name}
        />
      )}
    </div>
  );
}
