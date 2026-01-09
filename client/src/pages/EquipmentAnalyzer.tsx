import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Telescope, Eye, Maximize2, GitCompare, Plus, X, Info, Check, AlertTriangle, Star, Moon, Sparkles, Target, CircleDot, Lightbulb, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
// Note: This analyzer uses full aperture for max/min mag calculations (2× aperture, aperture/7)
// and full aperture for exit pupil (aperture/magnification), consistent with the v2.0 recommendation engine.
// Effective aperture (accounting for central obstruction) is used only for resolution limits (Dawes limit)
import type { Telescope as TelescopeType, Eyepiece, Barlow, Filter, OpticalModifier } from "@shared/schema";
import { Focus } from "lucide-react";

interface EquipmentData {
  telescopes: TelescopeType[];
  eyepieces: Eyepiece[];
  barlows: Barlow[];
  filters: Filter[];
}

interface ComparisonItem {
  id: string;
  eyepiece: Eyepiece;
  barlow: Barlow | null;
}

type ObservingContext = "general" | "planets" | "moon" | "dso" | "widefield";

interface ScoreBreakdown {
  exitPupil: number;
  magnification: number;
  fieldOfView: number;
  total: number;
  maxPossible: number;
}

interface CalculatedOptics {
  id: string;
  eyepiece: Eyepiece;
  barlow: Barlow | null;
  magnification: number;
  exitPupil: number;
  trueFov: number | null;
  maxUsableMag: number;
  minUsableMag: number;
  quality: "excellent" | "good" | "acceptable" | "poor";
  score: number;
  scoreBreakdown: ScoreBreakdown;
  bestFor: ObservingContext[];
  warnings: string[];
}

interface CategoryScoreConfig {
  exitPupilMin: number;
  exitPupilMax: number;
  exitPupilIdeal: number;
  magRatioMin: number;
  magRatioMax: number;
  magRatioIdeal: number;
  wideFieldBonus: boolean;
  label: string;
}

// Exit pupil ranges aligned with v2.0 recommendation engine for consistency
// Broader categories allow slightly wider ranges than object-specific categories
const CATEGORY_CONFIGS: Record<ObservingContext, CategoryScoreConfig> = {
  planets: {
    exitPupilMin: 0.5,
    exitPupilMax: 1.5,   // Aligned with v2.0 (was 2.5)
    exitPupilIdeal: 0.8, // Aligned with v2.0 (was 1.1)
    magRatioMin: 0.35,
    magRatioMax: 0.7,
    magRatioIdeal: 0.47,
    wideFieldBonus: false,
    label: "Planets",
  },
  moon: {
    exitPupilMin: 0.5,
    exitPupilMax: 2.0,   // Aligned with v2.0 (was 5.0)
    exitPupilIdeal: 1.0, // Aligned with v2.0 (was 2.5)
    magRatioMin: 0.15,
    magRatioMax: 0.65,
    magRatioIdeal: 0.35,
    wideFieldBonus: false,
    label: "Moon",
  },
  dso: {
    // DSO covers galaxies (2-5mm), globulars (1-2.5mm), nebulae (3-5mm)
    // Using a range that accommodates all DSO types
    exitPupilMin: 1.5,
    exitPupilMax: 5.0,   // Slightly narrowed (was 6.0)
    exitPupilIdeal: 3.0, // Aligned with v2.0 galaxy ideal (was 3.5)
    magRatioMin: 0.15,
    magRatioMax: 0.55,
    magRatioIdeal: 0.35,
    wideFieldBonus: false,
    label: "Deep Sky Objects",
  },
  widefield: {
    // Wide field for open clusters, large nebulae, asterisms
    exitPupilMin: 3.0,
    exitPupilMax: 6.0,   // Slightly narrowed (was 7.0) - 7mm exceeds dark-adapted pupil
    exitPupilIdeal: 4.5, // Slightly adjusted (was 5.0)
    magRatioMin: 0.08,
    magRatioMax: 0.35,
    magRatioIdeal: 0.2,
    wideFieldBonus: true,
    label: "Wide Field",
  },
  general: {
    exitPupilMin: 1.0,
    exitPupilMax: 5.0,   // Slightly narrowed (was 6.0)
    exitPupilIdeal: 2.5, // Slightly adjusted (was 3.0)
    magRatioMin: 0.15,
    magRatioMax: 0.6,
    magRatioIdeal: 0.4,
    wideFieldBonus: false,
    label: "General",
  },
};

function calculateContextScore(
  exitPupil: number,
  magnification: number,
  maxUsableMag: number,
  trueFov: number | null,
  apparentFov: number | null,
  context: ObservingContext
): ScoreBreakdown {
  const config = CATEGORY_CONFIGS[context];
  const magRatio = magnification / maxUsableMag;
  
  let exitPupilScore = 0;
  if (exitPupil >= config.exitPupilMin && exitPupil <= config.exitPupilMax) {
    const delta = Math.abs(exitPupil - config.exitPupilIdeal);
    const range = (config.exitPupilMax - config.exitPupilMin) / 2;
    exitPupilScore = Math.round(40 * Math.exp(-(delta * delta) / (range * range)));
  } else if (exitPupil < config.exitPupilMin) {
    const deficit = (config.exitPupilMin - exitPupil) / config.exitPupilMin;
    exitPupilScore = Math.max(0, Math.round(20 * (1 - deficit)));
  } else {
    const excess = (exitPupil - config.exitPupilMax) / config.exitPupilMax;
    exitPupilScore = Math.max(0, Math.round(20 * (1 - excess)));
  }
  
  let magnificationScore = 0;
  if (magRatio >= config.magRatioMin && magRatio <= config.magRatioMax) {
    const delta = Math.abs(magRatio - config.magRatioIdeal);
    const range = (config.magRatioMax - config.magRatioMin) / 2;
    magnificationScore = Math.round(40 * Math.exp(-(delta * delta) / (range * range)));
  } else if (magRatio < config.magRatioMin) {
    const deficit = (config.magRatioMin - magRatio) / config.magRatioMin;
    magnificationScore = Math.max(0, Math.round(15 * (1 - deficit)));
  } else if (magRatio > 1.0) {
    magnificationScore = 0;
  } else {
    const excess = (magRatio - config.magRatioMax) / (1.0 - config.magRatioMax);
    magnificationScore = Math.max(0, Math.round(20 * (1 - excess)));
  }
  
  let fieldOfViewScore = 0;
  const maxFovPoints = config.wideFieldBonus ? 20 : 10;
  
  if (trueFov !== null && apparentFov !== null) {
    if (config.wideFieldBonus) {
      if (apparentFov >= 70 && trueFov >= 2.0) fieldOfViewScore = 20;
      else if (apparentFov >= 60 && trueFov >= 1.5) fieldOfViewScore = 15;
      else if (apparentFov >= 50 && trueFov >= 1.0) fieldOfViewScore = 10;
      else if (apparentFov >= 40) fieldOfViewScore = 5;
    } else {
      if (apparentFov >= 60) fieldOfViewScore = 10;
      else if (apparentFov >= 50) fieldOfViewScore = 7;
      else if (apparentFov >= 40) fieldOfViewScore = 4;
    }
  }
  
  const total = exitPupilScore + magnificationScore + fieldOfViewScore;
  const maxPossible = 40 + 40 + maxFovPoints;
  
  return {
    exitPupil: exitPupilScore,
    magnification: magnificationScore,
    fieldOfView: fieldOfViewScore,
    total,
    maxPossible,
  };
}

function determineQuality(score: number, maxPossible: number): "excellent" | "good" | "acceptable" | "poor" {
  const percentage = (score / maxPossible) * 100;
  if (percentage >= 80) return "excellent";
  if (percentage >= 60) return "good";
  if (percentage >= 40) return "acceptable";
  return "poor";
}

function determineBestFor(
  exitPupil: number,
  magnification: number,
  maxUsableMag: number,
  trueFov: number | null,
  apparentFov: number | null
): ObservingContext[] {
  const contexts: ObservingContext[] = ["planets", "moon", "dso", "widefield"];
  const scores = contexts.map(ctx => ({
    context: ctx,
    score: calculateContextScore(exitPupil, magnification, maxUsableMag, trueFov, apparentFov, ctx),
  }));
  
  scores.sort((a, b) => (b.score.total / b.score.maxPossible) - (a.score.total / a.score.maxPossible));
  
  const bestFor: ObservingContext[] = [];
  const topPercentage = scores[0].score.total / scores[0].score.maxPossible;
  
  for (const { context, score } of scores) {
    const percentage = score.total / score.maxPossible;
    if (percentage >= 0.6 && percentage >= topPercentage - 0.15) {
      bestFor.push(context);
    }
  }
  
  return bestFor.length > 0 ? bestFor : [scores[0].context];
}

function calculateOptics(
  telescope: TelescopeType,
  eyepiece: Eyepiece,
  barlow: Barlow | null,
  context: ObservingContext = "general",
  modifier: OpticalModifier | null = null
): Omit<CalculatedOptics, "id" | "eyepiece" | "barlow"> {
  const barlowFactor = barlow?.factor ?? 1;
  const modifierFactor = modifier?.factor ?? 1;
  
  // Apply optical modifier to telescope focal length first
  const telescopeEffectiveFL = telescope.focalLength * modifierFactor;
  const effectiveFRatio = (telescope.focalLength / telescope.aperture) * modifierFactor;
  
  // Then apply eyepiece and barlow
  const eyepieceEffectiveFL = eyepiece.focalLength / barlowFactor;
  
  // Use full aperture for exit pupil (standard formula: aperture / magnification)
  // This matches the v2.0 recommendation engine and other modules
  const magnification = telescopeEffectiveFL / eyepiece.focalLength * barlowFactor;
  const exitPupil = telescope.aperture / magnification;
  
  const trueFov = eyepiece.apparentFov 
    ? eyepiece.apparentFov / magnification 
    : null;
  
  // Use full aperture for max/min magnification limits (standard: 2× aperture)
  const maxUsableMag = telescope.aperture * 2;
  const minUsableMag = telescope.aperture / 7;
  
  const warnings: string[] = [];
  
  if (magnification > maxUsableMag) {
    warnings.push("Exceeds maximum useful magnification");
  } else if (magnification > maxUsableMag * 0.85) {
    warnings.push("Near maximum useful magnification");
  }
  
  if (magnification < minUsableMag) {
    warnings.push("Below minimum useful magnification - light is wasted");
  }
  
  if (exitPupil > 7) {
    warnings.push("Exit pupil larger than human eye can use (>7mm)");
  } else if (exitPupil < 0.5) {
    warnings.push("Very small exit pupil - image will be dim");
  }
  
  const scoreBreakdown = calculateContextScore(
    exitPupil, 
    magnification, 
    maxUsableMag, 
    trueFov, 
    eyepiece.apparentFov ?? null,
    context
  );
  
  const quality = determineQuality(scoreBreakdown.total, scoreBreakdown.maxPossible);
  const bestFor = determineBestFor(exitPupil, magnification, maxUsableMag, trueFov, eyepiece.apparentFov ?? null);
  
  return {
    magnification,
    exitPupil,
    trueFov,
    maxUsableMag,
    minUsableMag,
    quality,
    score: scoreBreakdown.total,
    scoreBreakdown,
    bestFor,
    warnings,
  };
}

function QualityBadge({ quality, score, maxScore }: { quality: CalculatedOptics["quality"]; score?: number; maxScore?: number }) {
  const variants = {
    excellent: "bg-chart-2/20 text-chart-2 border-chart-2/30",
    good: "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30",
    acceptable: "bg-chart-5/20 text-chart-5 border-chart-5/30",
    poor: "bg-destructive/20 text-destructive border-destructive/30",
  };
  
  return (
    <div className="flex items-center gap-2">
      {score !== undefined && maxScore !== undefined && (
        <span className="text-xs text-muted-foreground font-mono">{score}/{maxScore}</span>
      )}
      <Badge variant="outline" className={cn("capitalize font-medium", variants[quality])}>
        {quality}
      </Badge>
    </div>
  );
}

function BestForBadges({ bestFor }: { bestFor: ObservingContext[] }) {
  const icons: Record<ObservingContext, { icon: typeof Star; color: string; label: string }> = {
    planets: { icon: Star, color: "text-amber-500", label: "Planets" },
    moon: { icon: Moon, color: "text-slate-400", label: "Moon" },
    dso: { icon: Sparkles, color: "text-purple-500", label: "DSO" },
    widefield: { icon: Maximize2, color: "text-cyan-500", label: "Wide Field" },
    general: { icon: Eye, color: "text-muted-foreground", label: "General" },
  };
  
  return (
    <div className="flex flex-wrap gap-1">
      {bestFor.map(ctx => {
        const { icon: Icon, color, label } = icons[ctx];
        return (
          <Badge key={ctx} variant="outline" className="text-xs gap-1 py-0.5">
            <Icon className={cn("w-3 h-3", color)} />
            {label}
          </Badge>
        );
      })}
    </div>
  );
}

interface ObjectSuitability {
  planets: { score: number; bestSetup: string | null; note?: string };
  moon: { score: number; bestSetup: string | null; note?: string };
  globulars: { score: number; bestSetup: string | null; note?: string };
  galaxies: { score: number; bestSetup: string | null; note?: string };
  nebulae: { score: number; bestSetup: string | null; note?: string };
  openClusters: { score: number; bestSetup: string | null; note?: string };
}

interface MagnificationGap {
  range: string;
  covered: boolean;
  purpose: string;
}

type SuitabilityCategory = "planets" | "moon" | "globulars" | "galaxies" | "nebulae" | "openClusters";

interface SuitabilityCategoryConfig {
  context: ObservingContext;
  filterType: 'nebula' | 'lp' | 'contrast' | 'moon' | null;
}

const SUITABILITY_CATEGORY_MAPPING: Record<SuitabilityCategory, SuitabilityCategoryConfig> = {
  planets: { context: "planets", filterType: "contrast" },
  moon: { context: "moon", filterType: "moon" },
  globulars: { context: "dso", filterType: "lp" },
  galaxies: { context: "dso", filterType: "lp" },
  nebulae: { context: "dso", filterType: "nebula" },
  openClusters: { context: "widefield", filterType: "lp" },
};

function analyzeEquipmentSuitability(
  telescope: TelescopeType,
  eyepieces: Eyepiece[],
  barlows: Barlow[],
  filters: Filter[]
): { suitability: ObjectSuitability; gaps: MagnificationGap[]; allCombos: CalculatedOptics[] } {
  // Use full aperture for magnification limits (standard: 2× aperture)
  const maxUsableMag = telescope.aperture * 2;
  const allCombos: CalculatedOptics[] = [];
  
  for (const eyepiece of eyepieces) {
    const withoutBarlow = {
      id: `${eyepiece.id}-none`,
      eyepiece,
      barlow: null,
      ...calculateOptics(telescope, eyepiece, null, "general"),
    };
    allCombos.push(withoutBarlow);
    
    for (const barlow of barlows) {
      const withBarlow = {
        id: `${eyepiece.id}-${barlow.id}`,
        eyepiece,
        barlow,
        ...calculateOptics(telescope, eyepiece, barlow, "general"),
      };
      allCombos.push(withBarlow);
    }
  }
  
  const nebulaFilters = filters.filter(f => 
    f.type === 'uhc' || f.type === 'oiii' || f.type === 'h_alpha' || f.type === 'h_beta'
  );
  const lpFilters = filters.filter(f => f.type === 'cls' || f.type === 'lps');
  const contrastFilters = filters.filter(f => f.type === 'neodymium' || f.type === 'contrast_booster');
  const moonFilters = filters.filter(f => f.type === 'nd');
  
  const evaluateCategory = (category: SuitabilityCategory): { score: number; bestSetup: string | null; note?: string } => {
    const config = SUITABILITY_CATEGORY_MAPPING[category];
    
    const scored = allCombos.map(combo => {
      const contextScore = calculateContextScore(
        combo.exitPupil,
        combo.magnification,
        maxUsableMag,
        combo.trueFov,
        combo.eyepiece.apparentFov ?? null,
        config.context
      );
      return { combo, score: contextScore.total, maxPossible: contextScore.maxPossible };
    });
    
    scored.sort((a, b) => b.score - a.score);
    if (scored.length === 0 || scored[0].score === 0) return { score: 0, bestSetup: null };
    
    const best = scored[0];
    const setupName = best.combo.barlow 
      ? `${best.combo.eyepiece.name} + ${best.combo.barlow.name}` 
      : best.combo.eyepiece.name;
    
    let percentage = Math.round((best.score / best.maxPossible) * 100);
    let note: string | undefined;
    
    if (config.filterType === 'nebula' && nebulaFilters.length > 0) {
      percentage = Math.min(100, percentage + 8);
      note = `Enhanced with ${nebulaFilters.map(f => f.name).join(', ')}`;
    } else if (config.filterType === 'lp' && (nebulaFilters.length > 0 || lpFilters.length > 0)) {
      const relevantFilters = nebulaFilters.length > 0 ? nebulaFilters : lpFilters;
      percentage = Math.min(100, percentage + 5);
      note = `Better contrast with ${relevantFilters.map(f => f.name).join(', ')}`;
    } else if (config.filterType === 'moon' && moonFilters.length > 0) {
      percentage = Math.min(100, percentage + 5);
      note = `Glare reduced with ${moonFilters.map(f => f.name).join(', ')}`;
    } else if (config.filterType === 'contrast' && contrastFilters.length > 0) {
      percentage = Math.min(100, percentage + 5);
      note = `Enhanced detail with ${contrastFilters.map(f => f.name).join(', ')}`;
    }
    
    return { 
      score: percentage, 
      bestSetup: `${setupName} (${best.combo.magnification.toFixed(0)}x)`,
      note
    };
  };
  
  const suitability: ObjectSuitability = {
    planets: evaluateCategory("planets"),
    moon: evaluateCategory("moon"),
    globulars: evaluateCategory("globulars"),
    galaxies: evaluateCategory("galaxies"),
    nebulae: evaluateCategory("nebulae"),
    openClusters: evaluateCategory("openClusters"),
  };
  
  // Use full aperture for magnification limits (standard: 2× aperture)
  const maxMag = telescope.aperture * 2;
  const minMag = telescope.aperture / 7;
  
  const magRanges = [
    { min: minMag, max: maxMag * 0.25, range: "Low (finder views)", purpose: "Wide field, finding objects" },
    { min: maxMag * 0.25, max: maxMag * 0.5, range: "Medium-Low", purpose: "Large DSOs, open clusters" },
    { min: maxMag * 0.5, max: maxMag * 0.75, range: "Medium-High", purpose: "Galaxies, globulars" },
    { min: maxMag * 0.75, max: maxMag, range: "High", purpose: "Planets, Moon detail" },
  ];
  
  const gaps: MagnificationGap[] = magRanges.map(r => ({
    range: `${r.min.toFixed(0)}x - ${r.max.toFixed(0)}x`,
    covered: allCombos.some(c => {
      const inRange = c.magnification >= r.min && c.magnification <= r.max;
      const usable = c.magnification <= maxMag && c.exitPupil >= 0.5;
      return inRange && usable;
    }),
    purpose: r.purpose,
  }));
  
  return { suitability, gaps, allCombos };
}

interface CategoryRequirements {
  exitPupilRange: string;
  idealExitPupil: string;
  magPreference: string;
  filterHelp: string;
  keyFactors: string[];
}

// Display requirements aligned with CATEGORY_CONFIGS and v2.0 engine
const CATEGORY_REQUIREMENTS: Record<string, CategoryRequirements> = {
  planets: {
    exitPupilRange: "0.5-1.5mm",
    idealExitPupil: "~0.8mm",
    magPreference: "High magnification (35-70% of max useful)",
    filterHelp: "Contrast/color filters can add +5%",
    keyFactors: [
      "Exit pupil quality (40% max) - closer to ideal = higher",
      "Magnification appropriateness (40% max) - optimal range rewards",
      "Eyepiece field of view (10% max) - wider is better",
      "Filter bonus (+5% if you have contrast filters)",
    ],
  },
  moon: {
    exitPupilRange: "0.5-2mm",
    idealExitPupil: "~1mm",
    magPreference: "Flexible - 15% to 65% of max useful",
    filterHelp: "ND (moon) filter can add +5%",
    keyFactors: [
      "Exit pupil quality (40% max) - closer to ideal = higher",
      "Magnification appropriateness (40% max) - very flexible",
      "Eyepiece field of view (10% max) - wider is better",
      "Filter bonus (+5% if you have ND filter)",
    ],
  },
  globulars: {
    exitPupilRange: "1.5-5mm",
    idealExitPupil: "~3mm",
    magPreference: "Medium mag (15-55% of max useful)",
    filterHelp: "Light pollution filter can add +5%",
    keyFactors: [
      "Exit pupil quality (40% max) - closer to ideal = higher",
      "Magnification appropriateness (40% max) - medium range",
      "Eyepiece field of view (10% max) - wider is better",
      "Filter bonus (+5% if you have LP filter)",
    ],
  },
  galaxies: {
    exitPupilRange: "2-5mm",
    idealExitPupil: "~3mm",
    magPreference: "Medium mag for surface brightness",
    filterHelp: "Light pollution filter can add +5%",
    keyFactors: [
      "Exit pupil quality (40% max) - closer to ideal = higher",
      "Magnification appropriateness (40% max) - medium range",
      "Eyepiece field of view (10% max) - wider is better",
      "Filter bonus (+5% if you have LP filter)",
    ],
  },
  nebulae: {
    exitPupilRange: "3-5mm",
    idealExitPupil: "~4mm",
    magPreference: "Medium-low mag for contrast",
    filterHelp: "UHC/OIII filters dramatically improve view (+8%)",
    keyFactors: [
      "Exit pupil quality (40% max) - closer to ideal = higher",
      "Magnification appropriateness (40% max) - medium range",
      "Eyepiece field of view (10% max) - wider is better",
      "Filter bonus (+8% if you have nebula filter)",
    ],
  },
  openClusters: {
    exitPupilRange: "3-6mm",
    idealExitPupil: "~4.5mm",
    magPreference: "Low mag with wide field (8-35% of max)",
    filterHelp: "Light pollution filter can add +5%",
    keyFactors: [
      "Exit pupil quality (40% max) - closer to ideal = higher",
      "Magnification appropriateness (40% max) - low power",
      "Wide field of view (20% max) - critical for clusters",
      "Filter bonus (+5% if you have LP filter)",
    ],
  },
};

function getRatingTier(score: number): { label: string; color: string; next: { label: string; threshold: number } | null } {
  if (score >= 85) {
    return { label: "Excellent", color: "text-chart-2", next: null };
  } else if (score >= 65) {
    return { label: "Very Good", color: "text-blue-600 dark:text-blue-400", next: { label: "Excellent", threshold: 85 } };
  } else if (score >= 50) {
    return { label: "Good", color: "text-chart-4", next: { label: "Very Good", threshold: 65 } };
  } else {
    return { label: "Limited", color: "text-chart-5", next: { label: "Good", threshold: 50 } };
  }
}

function getImprovementTips(key: string, score: number, telescope: TelescopeType): string[] {
  const tips: string[] = [];
  const req = CATEGORY_REQUIREMENTS[key];
  if (!req) return tips;
  
  const tier = getRatingTier(score);
  if (!tier.next) return ["You have optimal equipment for this category"];
  
  const pointsNeeded = tier.next.threshold - score;
  
  if (key === "planets" || key === "moon") {
    tips.push(`Need ${pointsNeeded} more points to reach ${tier.next.label}`);
    if (score < 65) {
      tips.push(`Add a shorter focal length eyepiece (5-8mm) for higher magnification`);
      tips.push(`A quality 2x Barlow can double your options`);
    }
  } else if (key === "nebulae") {
    tips.push(`Need ${pointsNeeded} more points to reach ${tier.next.label}`);
    tips.push(`Add a UHC or OIII filter for +6-8 points`);
    if (score < 50) {
      tips.push(`Consider a longer focal length eyepiece (20-30mm) for wider exit pupils`);
    }
  } else if (key === "openClusters") {
    tips.push(`Need ${pointsNeeded} more points to reach ${tier.next.label}`);
    tips.push(`A wide-field eyepiece (70°+ AFOV) improves cluster viewing`);
  } else if (key === "galaxies" || key === "globulars") {
    tips.push(`Need ${pointsNeeded} more points to reach ${tier.next.label}`);
    if (score < 50) {
      tips.push(`Add medium focal length eyepiece (12-20mm) for optimal exit pupils`);
    }
    tips.push(`Light pollution filter can add a few points`);
  }
  
  return tips;
}

function ObjectSuitabilityCard({ 
  suitability, 
  telescope 
}: { 
  suitability: ObjectSuitability; 
  telescope: TelescopeType;
}) {
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  
  const items = [
    { key: "planets", label: "Planets", icon: Star, color: "text-amber-500", data: suitability.planets },
    { key: "moon", label: "Moon", icon: Moon, color: "text-slate-400", data: suitability.moon },
    { key: "globulars", label: "Globular Clusters", icon: CircleDot, color: "text-blue-500", data: suitability.globulars },
    { key: "galaxies", label: "Galaxies", icon: Target, color: "text-purple-500", data: suitability.galaxies },
    { key: "nebulae", label: "Nebulae", icon: Sparkles, color: "text-pink-500", data: suitability.nebulae },
    { key: "openClusters", label: "Open Clusters", icon: Sparkles, color: "text-cyan-500", data: suitability.openClusters },
  ];
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Target className="w-5 h-5" />
          Object Type Suitability
        </CardTitle>
        <CardDescription>
          How well your equipment covers different observation targets. Click any category for details.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map(({ key, label, icon: Icon, color, data }) => {
          const isExpanded = expandedItem === key;
          const tier = getRatingTier(data.score);
          const req = CATEGORY_REQUIREMENTS[key];
          const tips = getImprovementTips(key, data.score, telescope);
          
          return (
            <div key={key} className="space-y-1">
              <button
                type="button"
                className="w-full text-left"
                onClick={() => setExpandedItem(isExpanded ? null : key)}
                data-testid={`button-expand-${key}`}
              >
                <div className="flex items-center justify-between hover-elevate rounded-md p-1.5 -mx-1.5">
                  <div className="flex items-center gap-2">
                    <Icon className={cn("w-4 h-4", color)} />
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{data.score}/100</span>
                    {data.score > 0 ? (
                      <Badge variant="outline" className={cn("text-xs", tier.color)}>
                        {tier.label}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-destructive">No coverage</Badge>
                    )}
                    <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                  </div>
                </div>
              </button>
              <Progress value={data.score} className="h-2" />
              {data.bestSetup && (
                <p className="text-xs text-muted-foreground">Best: {data.bestSetup}</p>
              )}
              {data.note && (
                <p className="text-xs text-chart-2">{data.note}</p>
              )}
              
              {isExpanded && req && (
                <div className="mt-2 p-3 rounded-md bg-muted/50 border space-y-3 text-xs">
                  <div>
                    <h5 className="font-medium mb-1">How This Rating Is Calculated</h5>
                    <p className="text-muted-foreground mb-2">
                      Your score of <span className="font-medium text-foreground">{data.score}/100</span> is based on how well your best eyepiece/barlow combination meets the optical requirements for {label.toLowerCase()}.
                    </p>
                    <div className="space-y-1">
                      <p className="text-muted-foreground"><span className="font-medium text-foreground">Exit Pupil Range:</span> {req.exitPupilRange} (ideal: {req.idealExitPupil})</p>
                      <p className="text-muted-foreground"><span className="font-medium text-foreground">Magnification:</span> {req.magPreference}</p>
                      <p className="text-muted-foreground"><span className="font-medium text-foreground">Filter Help:</span> {req.filterHelp}</p>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h5 className="font-medium mb-1">Scoring Factors</h5>
                    <ul className="text-muted-foreground space-y-0.5">
                      {req.keyFactors.map((factor, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-muted-foreground/70">•</span>
                          {factor}
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h5 className="font-medium mb-1">Rating Tiers</h5>
                    <div className="grid grid-cols-4 gap-1 text-center">
                      <div className={cn("p-1 rounded", data.score >= 85 ? "bg-chart-2/20" : "bg-muted")}>
                        <div className="text-chart-2 font-medium">Excellent</div>
                        <div className="text-muted-foreground">85+</div>
                      </div>
                      <div className={cn("p-1 rounded", data.score >= 65 && data.score < 85 ? "bg-blue-500/20" : "bg-muted")}>
                        <div className="text-blue-600 dark:text-blue-400 font-medium">Very Good</div>
                        <div className="text-muted-foreground">65-84</div>
                      </div>
                      <div className={cn("p-1 rounded", data.score >= 50 && data.score < 65 ? "bg-chart-4/20" : "bg-muted")}>
                        <div className="text-chart-4 font-medium">Good</div>
                        <div className="text-muted-foreground">50-64</div>
                      </div>
                      <div className={cn("p-1 rounded", data.score < 50 ? "bg-chart-5/20" : "bg-muted")}>
                        <div className="text-chart-5 font-medium">Limited</div>
                        <div className="text-muted-foreground">&lt;50</div>
                      </div>
                    </div>
                  </div>
                  
                  {tips.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <h5 className="font-medium mb-1 flex items-center gap-1.5">
                          <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                          {tier.next ? `To Reach ${tier.next.label}` : "Status"}
                        </h5>
                        <ul className="text-muted-foreground space-y-0.5">
                          {tips.map((tip, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <span className="text-muted-foreground/70">•</span>
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function GapAnalysisCard({ 
  gaps, 
  telescope,
  eyepieces,
  barlows
}: { 
  gaps: MagnificationGap[]; 
  telescope: TelescopeType;
  eyepieces: Eyepiece[];
  barlows: Barlow[];
}) {
  const coveredCount = gaps.filter(g => g.covered).length;
  const coveragePercent = (coveredCount / gaps.length) * 100;
  
  const suggestions: string[] = [];
  
  const hasLowMag = gaps[0]?.covered;
  const hasHighMag = gaps[3]?.covered;
  
  if (!hasLowMag) {
    const suggestedFL = Math.round(telescope.focalLength / (telescope.aperture / 6));
    suggestions.push(`Consider a ~${suggestedFL}mm eyepiece for wider fields`);
  }
  
  if (!hasHighMag) {
    const hasBarlow = barlows.length > 0;
    if (hasBarlow) {
      suggestions.push("Use your barlow with shorter eyepieces for high power");
    } else {
      suggestions.push("A 2x barlow would extend your magnification range");
    }
  }
  
  if (eyepieces.length < 3) {
    suggestions.push("Consider adding more eyepieces for versatility");
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Lightbulb className="w-5 h-5" />
          Magnification Coverage
        </CardTitle>
        <CardDescription>
          Analysis of your magnification range with {telescope.name}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>Overall Coverage</span>
            <span className="font-medium">{coveragePercent.toFixed(0)}%</span>
          </div>
          <Progress value={coveragePercent} className="h-3" />
        </div>
        
        <Separator />
        
        <div className="space-y-2">
          {gaps.map((gap, i) => (
            <div key={i} className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                {gap.covered ? (
                  <Check className="w-4 h-4 text-chart-2" />
                ) : (
                  <X className="w-4 h-4 text-muted-foreground" />
                )}
                <div>
                  <span className="text-sm font-medium">{gap.range}</span>
                  <p className="text-xs text-muted-foreground">{gap.purpose}</p>
                </div>
              </div>
              <Badge variant={gap.covered ? "default" : "outline"} className="text-xs">
                {gap.covered ? "Covered" : "Gap"}
              </Badge>
            </div>
          ))}
        </div>
        
        {suggestions.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                Suggestions
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                {suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-muted-foreground">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreBreakdownDisplay({ breakdown, context }: { breakdown: ScoreBreakdown; context: ObservingContext }) {
  const config = CATEGORY_CONFIGS[context];
  const maxFov = config.wideFieldBonus ? 20 : 10;
  
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Exit Pupil</span>
        <div className="flex items-center gap-2">
          <Progress value={(breakdown.exitPupil / 40) * 100} className="w-16 h-1.5" />
          <span className="font-mono w-8 text-right">{breakdown.exitPupil}/40</span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Magnification</span>
        <div className="flex items-center gap-2">
          <Progress value={(breakdown.magnification / 40) * 100} className="w-16 h-1.5" />
          <span className="font-mono w-8 text-right">{breakdown.magnification}/40</span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Field of View</span>
        <div className="flex items-center gap-2">
          <Progress value={(breakdown.fieldOfView / maxFov) * 100} className="w-16 h-1.5" />
          <span className="font-mono w-8 text-right">{breakdown.fieldOfView}/{maxFov}</span>
        </div>
      </div>
    </div>
  );
}

function ComparisonCard({ 
  item, 
  telescope,
  context,
  onRemove 
}: { 
  item: CalculatedOptics; 
  telescope: TelescopeType;
  context: ObservingContext;
  onRemove: () => void;
}) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  
  // Use full aperture for max mag (standard: 2× aperture)
  const maxUsableMag = telescope.aperture * 2;
  
  const contextScore = useMemo(() => {
    return calculateContextScore(
      item.exitPupil,
      item.magnification,
      maxUsableMag,
      item.trueFov,
      item.eyepiece.apparentFov ?? null,
      context
    );
  }, [item, maxUsableMag, context]);
  
  const contextQuality = determineQuality(contextScore.total, contextScore.maxPossible);
  const percentage = Math.round((contextScore.total / contextScore.maxPossible) * 100);
  
  return (
    <Card className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-6 w-6"
        onClick={onRemove}
        data-testid={`button-remove-comparison-${item.id}`}
      >
        <X className="w-3 h-3" />
      </Button>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Eye className="w-4 h-4" />
          {item.eyepiece.name}
        </CardTitle>
        {item.barlow && (
          <CardDescription className="flex items-center gap-1">
            <Maximize2 className="w-3 h-3" />
            with {item.barlow.name} ({item.barlow.factor}x)
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Score</span>
          <QualityBadge quality={contextQuality} score={percentage} maxScore={100} />
        </div>
        
        <button
          type="button"
          className="w-full text-left"
          onClick={() => setShowBreakdown(!showBreakdown)}
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground hover-elevate rounded p-1 -m-1">
            <span>Score Breakdown</span>
            <ChevronDown className={cn("w-3 h-3 transition-transform", showBreakdown && "rotate-180")} />
          </div>
        </button>
        
        {showBreakdown && (
          <ScoreBreakdownDisplay breakdown={contextScore} context={context} />
        )}
        
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Best for:</span>
          <BestForBadges bestFor={item.bestFor} />
        </div>
        
        <Separator />
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Magnification</span>
            <span className="font-mono font-semibold">{item.magnification.toFixed(0)}x</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Exit Pupil</span>
            <span className="font-mono">{item.exitPupil.toFixed(1)}mm</span>
          </div>
          {item.trueFov && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">True FOV</span>
              <span className="font-mono">{item.trueFov.toFixed(2)}°</span>
            </div>
          )}
        </div>
        
        {item.warnings.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1">
              {item.warnings.map((warning, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-chart-5">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  {warning}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function EquipmentAnalyzer() {
  const [selectedTelescopeId, setSelectedTelescopeId] = useState<string>("");
  const [selectedEyepieceId, setSelectedEyepieceId] = useState<string>("");
  const [selectedBarlowId, setSelectedBarlowId] = useState<string>("none");
  const [selectedModifierId, setSelectedModifierId] = useState<string>("none");
  const [comparisons, setComparisons] = useState<ComparisonItem[]>([]);
  const [comparisonContext, setComparisonContext] = useState<ObservingContext>("general");

  const { user } = useAuth();

  const { data: equipment, isLoading } = useQuery<EquipmentData>({
    queryKey: ["/api/equipment"],
    enabled: !!user,
  });

  const { data: opticalModifiers } = useQuery<OpticalModifier[]>({
    queryKey: ["/api/optical-modifiers"],
    enabled: !!user,
  });

  const selectedModifier = useMemo(() => {
    if (!opticalModifiers || selectedModifierId === "none") return null;
    return opticalModifiers.find(m => m.id.toString() === selectedModifierId) ?? null;
  }, [opticalModifiers, selectedModifierId]);

  const selectedTelescope = useMemo(() => {
    if (!equipment || !selectedTelescopeId) return null;
    return equipment.telescopes.find(t => t.id.toString() === selectedTelescopeId) ?? null;
  }, [equipment, selectedTelescopeId]);

  const calculatedComparisons = useMemo(() => {
    if (!selectedTelescope) return [];
    
    return comparisons.map((item): CalculatedOptics => ({
      id: item.id,
      eyepiece: item.eyepiece,
      barlow: item.barlow,
      ...calculateOptics(selectedTelescope, item.eyepiece, item.barlow, comparisonContext, selectedModifier),
    }));
  }, [selectedTelescope, comparisons, comparisonContext, selectedModifier]);

  const equipmentAnalysis = useMemo(() => {
    if (!selectedTelescope || !equipment) return null;
    return analyzeEquipmentSuitability(
      selectedTelescope, 
      equipment.eyepieces, 
      equipment.barlows,
      equipment.filters || []
    );
  }, [selectedTelescope, equipment]);

  const addComparison = () => {
    if (!selectedEyepieceId || !equipment) return;
    
    const eyepiece = equipment.eyepieces.find(e => e.id.toString() === selectedEyepieceId);
    if (!eyepiece) return;
    
    const barlow = selectedBarlowId !== "none" 
      ? equipment.barlows.find(b => b.id.toString() === selectedBarlowId) ?? null
      : null;
    
    const id = `${eyepiece.id}-${barlow?.id ?? 'none'}-${Date.now()}`;
    
    setComparisons(prev => [...prev, { id, eyepiece, barlow }]);
    setSelectedEyepieceId("");
    setSelectedBarlowId("none");
  };

  const addAllCombinations = () => {
    if (!equipment) return;
    
    const newComparisons: ComparisonItem[] = [];
    
    // Add all eyepieces without barlow
    for (const eyepiece of equipment.eyepieces) {
      // Use deterministic unique ID per combination
      const id = `${eyepiece.id}-none`;
      // Check if this combination already exists
      if (!comparisons.some(c => c.eyepiece.id === eyepiece.id && c.barlow === null)) {
        newComparisons.push({ id, eyepiece, barlow: null });
      }
    }
    
    // Add all eyepiece + barlow combinations (if barlows exist)
    if (equipment.barlows && equipment.barlows.length > 0) {
      for (const eyepiece of equipment.eyepieces) {
        for (const barlow of equipment.barlows) {
          // Use deterministic unique ID per combination
          const id = `${eyepiece.id}-${barlow.id}`;
          // Check if this combination already exists
          if (!comparisons.some(c => c.eyepiece.id === eyepiece.id && c.barlow?.id === barlow.id)) {
            newComparisons.push({ id, eyepiece, barlow });
          }
        }
      }
    }
    
    setComparisons(prev => [...prev, ...newComparisons]);
  };

  const removeComparison = (id: string) => {
    setComparisons(prev => prev.filter(c => c.id !== id));
  };

  const clearAll = () => {
    setComparisons([]);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const hasEquipment = equipment && 
    equipment.telescopes.length > 0 && 
    equipment.eyepieces.length > 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Equipment Analyzer</h1>
          <p className="text-muted-foreground">Analyze your optics, compare combinations, and discover optimal setups</p>
        </div>
        {comparisons.length > 0 && (
          <Button variant="outline" onClick={clearAll} data-testid="button-clear-comparisons">
            <X className="w-4 h-4 mr-2" />
            Clear All
          </Button>
        )}
      </div>

      {!hasEquipment ? (
        <Card>
          <CardContent className="py-16 text-center">
            <GitCompare className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">Add equipment first</h3>
            <p className="text-muted-foreground max-w-md mx-auto mb-4">
              You need at least one telescope and one eyepiece to use the comparison tool.
            </p>
            <Button asChild>
              <a href="/equipment" data-testid="link-go-to-equipment">Go to Equipment</a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Telescope className="w-5 h-5" />
                Select Telescope
              </CardTitle>
              <CardDescription>Choose a telescope to calculate optics for all comparisons</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={selectedTelescopeId} onValueChange={setSelectedTelescopeId}>
                <SelectTrigger className="w-full max-w-md" data-testid="select-telescope-compare">
                  <SelectValue placeholder="Select a telescope" />
                </SelectTrigger>
                <SelectContent>
                  {equipment.telescopes.map((t) => (
                    <SelectItem key={t.id} value={t.id.toString()}>
                      {t.name} ({t.aperture}mm f/{(t.focalLength / t.aperture).toFixed(1)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {selectedTelescope && (
                <div className="mt-4 p-3 rounded-md bg-muted/50 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="text-muted-foreground">Aperture:</span>
                    <span className="font-mono">{selectedTelescope.aperture}mm</span>
                    <span className="text-muted-foreground">Focal Length:</span>
                    <span className="font-mono">{selectedModifier 
                      ? `${(selectedTelescope.focalLength * selectedModifier.factor).toFixed(0)}mm` 
                      : `${selectedTelescope.focalLength}mm`}
                    </span>
                    <span className="text-muted-foreground">f/ratio:</span>
                    <span className="font-mono">{selectedModifier 
                      ? ((selectedTelescope.focalLength / selectedTelescope.aperture) * selectedModifier.factor).toFixed(1)
                      : (selectedTelescope.focalLength / selectedTelescope.aperture).toFixed(1)}
                    </span>
                    {selectedTelescope.obstructionRatio && selectedTelescope.obstructionRatio > 0 && (
                      <>
                        <span className="text-muted-foreground">Obstruction:</span>
                        <span className="font-mono">{selectedTelescope.obstructionRatio}%</span>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="text-muted-foreground">Max Useful Mag:</span>
                    <span className="font-mono">{(selectedTelescope.aperture * 2).toFixed(0)}×</span>
                    <span className="text-muted-foreground">Min Useful Mag:</span>
                    <span className="font-mono">{(selectedTelescope.aperture / 7).toFixed(0)}×</span>
                    <span className="text-xs text-muted-foreground/70">(2× and ÷7 aperture)</span>
                    {selectedModifier && (
                      <Badge variant="outline" className="ml-2 gap-1">
                        <Focus className="w-3 h-3" />
                        {selectedModifier.factor}× {selectedModifier.type === 'focal_reducer' ? 'Reducer' : 'Corrector'}
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {opticalModifiers && opticalModifiers.length > 0 && (
                <div className="mt-4">
                  <label className="text-sm font-medium mb-2 block">Optical Modifier (optional)</label>
                  <Select value={selectedModifierId} onValueChange={setSelectedModifierId}>
                    <SelectTrigger className="w-full max-w-md" data-testid="select-modifier-compare">
                      <SelectValue placeholder="No modifier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Modifier</SelectItem>
                      {opticalModifiers.map((m) => (
                        <SelectItem key={m.id} value={m.id.toString()}>
                          {m.name} ({m.factor}× {m.type === 'focal_reducer' ? 'Reducer' : 'Corrector'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedModifier && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {selectedModifier.type === 'focal_reducer' 
                        ? `Reduces effective focal length to ${Math.round(selectedModifier.factor * 100)}% for wider field of view and faster imaging`
                        : 'Corrects coma aberration for sharper stars at the field edges'}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {selectedTelescope && equipmentAnalysis && (
            <div className="grid lg:grid-cols-2 gap-6">
              <ObjectSuitabilityCard 
                suitability={equipmentAnalysis.suitability} 
                telescope={selectedTelescope} 
              />
              <GapAnalysisCard 
                gaps={equipmentAnalysis.gaps} 
                telescope={selectedTelescope}
                eyepieces={equipment.eyepieces}
                barlows={equipment.barlows}
              />
            </div>
          )}

          {selectedTelescope && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Plus className="w-5 h-5" />
                  Compare Specific Combinations
                </CardTitle>
                <CardDescription>Select an eyepiece and optional barlow to compare</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4 items-end">
                  <div className="space-y-2 flex-1 min-w-[200px]">
                    <label className="text-sm font-medium">Eyepiece</label>
                    <Select value={selectedEyepieceId} onValueChange={setSelectedEyepieceId}>
                      <SelectTrigger data-testid="select-eyepiece-compare">
                        <SelectValue placeholder="Select eyepiece" />
                      </SelectTrigger>
                      <SelectContent>
                        {equipment.eyepieces.map((e) => (
                          <SelectItem key={e.id} value={e.id.toString()}>
                            {e.name} ({e.focalLength}mm{e.apparentFov ? `, ${e.apparentFov}°` : ""})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2 flex-1 min-w-[200px]">
                    <label className="text-sm font-medium">Barlow (optional)</label>
                    <Select value={selectedBarlowId} onValueChange={setSelectedBarlowId}>
                      <SelectTrigger data-testid="select-barlow-compare">
                        <SelectValue placeholder="No barlow" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Barlow</SelectItem>
                        {equipment.barlows.map((b) => (
                          <SelectItem key={b.id} value={b.id.toString()}>
                            {b.name} ({b.factor}x)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <Button 
                    onClick={addComparison} 
                    disabled={!selectedEyepieceId}
                    data-testid="button-add-comparison"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add to Compare
                  </Button>
                  
                  <Button 
                    variant="outline"
                    onClick={addAllCombinations}
                    data-testid="button-add-all-combinations"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Quick Add All
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  "Quick Add All" adds all eyepiece and barlow combinations at once for easy comparison
                </p>
              </CardContent>
            </Card>
          )}

          {calculatedComparisons.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Compare for:</span>
                </div>
                <Select value={comparisonContext} onValueChange={(v) => setComparisonContext(v as ObservingContext)}>
                  <SelectTrigger className="w-[200px]" data-testid="select-comparison-context">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General Observing</SelectItem>
                    <SelectItem value="planets">Planets</SelectItem>
                    <SelectItem value="moon">Moon</SelectItem>
                    <SelectItem value="dso">Deep Sky Objects</SelectItem>
                    <SelectItem value="widefield">Wide Field / Clusters</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">
                  Scores are calculated based on your selected observing target
                </span>
              </div>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {calculatedComparisons.map((item) => (
                  <ComparisonCard
                    key={item.id}
                    item={item}
                    telescope={selectedTelescope!}
                    context={comparisonContext}
                    onRemove={() => removeComparison(item.id)}
                  />
                ))}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Comparison Table</CardTitle>
                  <CardDescription>Side-by-side view of all combinations (scored for {CATEGORY_CONFIGS[comparisonContext].label})</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Eyepiece</TableHead>
                          <TableHead>Barlow</TableHead>
                          <TableHead className="text-right">Mag</TableHead>
                          <TableHead className="text-right">Exit Pupil</TableHead>
                          <TableHead className="text-right">True FOV</TableHead>
                          <TableHead className="text-right">Score</TableHead>
                          <TableHead>Best For</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {calculatedComparisons
                          .map(item => {
                            // Use full aperture for max mag (standard: 2× aperture)
                            const maxUsableMag = selectedTelescope!.aperture * 2;
                            const contextScore = calculateContextScore(
                              item.exitPupil,
                              item.magnification,
                              maxUsableMag,
                              item.trueFov,
                              item.eyepiece.apparentFov ?? null,
                              comparisonContext
                            );
                            return { ...item, contextScore, percentage: Math.round((contextScore.total / contextScore.maxPossible) * 100) };
                          })
                          .sort((a, b) => b.percentage - a.percentage)
                          .map((item) => {
                            const quality = determineQuality(item.contextScore.total, item.contextScore.maxPossible);
                            return (
                              <TableRow key={item.id} data-testid={`row-comparison-${item.id}`}>
                                <TableCell className="font-medium">{item.eyepiece.name}</TableCell>
                                <TableCell className="text-muted-foreground">
                                  {item.barlow ? `${item.barlow.name} (${item.barlow.factor}x)` : "—"}
                                </TableCell>
                                <TableCell className="text-right font-mono">{item.magnification.toFixed(0)}x</TableCell>
                                <TableCell className="text-right font-mono">{item.exitPupil.toFixed(1)}mm</TableCell>
                                <TableCell className="text-right font-mono">
                                  {item.trueFov ? `${item.trueFov.toFixed(2)}°` : "—"}
                                </TableCell>
                                <TableCell className="text-right">
                                  <QualityBadge quality={quality} score={item.percentage} maxScore={100} />
                                </TableCell>
                                <TableCell>
                                  <BestForBadges bestFor={item.bestFor} />
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Info className="w-5 h-5" />
                    Understanding the Results
                  </CardTitle>
                </CardHeader>
                <CardContent className="prose prose-sm max-w-none dark:prose-invert">
                  <div className="grid md:grid-cols-2 gap-6 text-sm">
                    <div>
                      <h4 className="font-semibold mb-2">Context-Aware Scoring</h4>
                      <p className="text-muted-foreground">
                        Scores change based on your observing target. Planets need high magnification and small exit pupils, 
                        while wide field viewing needs low power and wide fields of view.
                      </p>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Score Breakdown</h4>
                      <p className="text-muted-foreground">
                        Each score is built from: Exit Pupil (40%), Magnification (40%), and Field of View (10-20%). 
                        Click "Score Breakdown" on any card to see details.
                      </p>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Best For Labels</h4>
                      <p className="text-muted-foreground">
                        Each combination shows what it's best suited for. A 5mm eyepiece might be "Best for Planets" 
                        while a 32mm is "Best for Wide Field".
                      </p>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Quality Ratings</h4>
                      <p className="text-muted-foreground">
                        Excellent (80%+), Good (60-79%), Acceptable (40-59%), Poor (&lt;40%). 
                        These thresholds are consistent across all object types.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : selectedTelescope ? (
            <Card>
              <CardContent className="py-16 text-center">
                <GitCompare className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-2">No combinations added</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Add eyepiece and barlow combinations above to compare their optical properties.
                </p>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
