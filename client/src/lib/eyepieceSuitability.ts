import { getUnifiedExitPupilRange, type ExitPupilRange } from './equipmentRecommendation';

export type SuitabilityLevel = 'excellent' | 'good' | 'fair' | 'poor';

export interface SuitabilityScore {
  level: SuitabilityLevel;
  score: number;
  reason: string;
}

export interface ExitPupilRules {
  min: number;
  max: number;
  allowHighPower: boolean;
}

export function getCategoryExitPupilRules(
  category: string, 
  seeingScore?: number,
  objectAngularSize?: number,
  magnitude?: number | null,
  bortle?: number
): ExitPupilRules {
  const range = getUnifiedExitPupilRange(category, seeingScore, objectAngularSize, magnitude, bortle);
  return {
    min: range.min,
    max: range.max,
    allowHighPower: range.allowHighPower,
  };
}

export function calculateEyepieceSuitability(
  exitPupil: number,
  objectCategory: string,
  seeingScore?: number,
  objectAngularSize?: number,
  magnitude?: number | null,
  bortle?: number
): SuitabilityScore {
  const rules = getCategoryExitPupilRules(objectCategory, seeingScore, objectAngularSize, magnitude, bortle);
  const idealMin = rules.min;
  const idealMax = rules.max;
  
  let deviation = 0;
  if (exitPupil < idealMin) {
    deviation = (idealMin - exitPupil) / idealMin;
  } else if (exitPupil > idealMax) {
    deviation = (exitPupil - idealMax) / idealMax;
  }
  
  let score = Math.max(0, Math.min(100, 100 - (deviation * 100)));
  
  let level: SuitabilityLevel;
  let reason: string;
  
  const categoryLabel = objectCategory.replace(/_/g, ' ');
  
  if (score >= 85) {
    level = 'excellent';
    reason = exitPupil >= idealMin && exitPupil <= idealMax
      ? `Ideal exit pupil range for ${categoryLabel}`
      : `Very close to ideal for ${categoryLabel}`;
  } else if (score >= 65) {
    level = 'good';
    reason = exitPupil < idealMin
      ? `Slightly higher power than ideal for ${categoryLabel}`
      : `Slightly lower power than ideal for ${categoryLabel}`;
  } else if (score >= 40) {
    level = 'fair';
    reason = exitPupil < idealMin
      ? `Higher power than recommended - consider longer focal length eyepiece`
      : `Lower power than ideal - ${rules.allowHighPower ? 'a Barlow would help' : 'usable but not optimal'}`;
  } else {
    level = 'poor';
    reason = exitPupil < idealMin
      ? `Too much magnification for ${categoryLabel} - need longer focal length eyepiece`
      : `Not enough magnification for ${categoryLabel} - ${rules.allowHighPower ? 'need a Barlow or shorter focal length eyepiece' : 'limited by object type'}`;
  }
  
  return { level, score: Math.round(score), reason };
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
