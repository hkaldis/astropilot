import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useSearch, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Slider } from "@/components/ui/slider";
import { AltitudeChart } from "@/components/AltitudeChart";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { 
  Sunrise, 
  Sunset, 
  Clock, 
  Compass, 
  MapPin, 
  Star, 
  ArrowUp,
  ArrowLeft,
  ArrowUpDown,
  Search,
  Moon,
  Sun as SunIcon,
  Info,
  Eye,
  AlertTriangle,
  CheckCircle,
  CheckCircle2,
  XCircle,
  Plus,
  Globe2,
  Sparkles,
  Target,
  Play,
  Pause,
  RotateCcw,
  ChevronDown,
  CloudSun,
  HelpCircle,
  Telescope,
  Circle,
  Filter as FilterIcon,
  Camera,
  Zap,
  Settings2,
  Layers,
  CalendarDays,
} from "lucide-react";
import { format, addHours, setHours, setMinutes, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { calculateVisibility, getAltitudeQuality, getCardinalDirection, calculateNightWindowAltitudes, VisibilityWindow, NightWindowAltitudes, calculateMoonInterference, getMoonInterferenceLevelConfig, MoonInterferenceLevel, MoonInterferenceData, calculateMoonSeparationFromStrings, calculateAngularSeparation } from "@/lib/astronomy";
import { getSuitabilityBadgeStyles, getSuitabilityBadgeLabel } from "@/lib/eyepieceSuitability";
import { calculateEnhancedSuitability, EnhancedSuitabilityScore, parseAngularSize, OpticalModifierSpecs } from "@/lib/equipmentRecommendation";
import { EquipmentRecommendationModal } from "@/components/EquipmentRecommendationModal";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { CelestialObject, Location, WatchlistItem } from "@shared/schema";

interface TonightRecommendation {
  objectId: number;
  catalogId: string;
  name: string;
  category: string;
  magnitude: number | null;
  constellation: string | null;
  difficulty: string | null;
  description: string | null;
  isWow: boolean;
  isHot: boolean;
  totalScore: number;
  visibilityScore: number;
  moonScore: number;
  conditionsScore: number;
  equipmentScore: number;
  freshnessScore: number;
  seasonalScore: number;
  maxAltitude: number | null;
  transitTime: string | null;
  moonInterference: 'none' | 'low' | 'moderate' | 'high';
  moonSeparation: number | null;
}

interface TonightRecommendationsResponse {
  recommendations: TonightRecommendation[];
  context: {
    location: { id: number; name: string; latitude: number; longitude: number; bortle: number };
    moonIllumination: number;
    hasConditionsLogged: boolean;
    conditionsScore: number;
    powerClass: string;
    currentMonth: string;
  };
  totalObjectsEvaluated: number;
  totalRecommendations: number;
}

interface EphemerisBody {
  catalogId: string;
  name: string;
  category: "planet" | "moon" | "star";
  rightAscension: string;
  declination: string;
  raDecimal: number;
  decDecimal: number;
  altitude: number;
  azimuth: number;
  riseTime: string | null;
  setTime: string | null;
  transitTime: string | null;
  elongation: number | null;
  moonPhase: number | null;
  moonIllumination: number | null;
  isAboveHorizon: boolean;
  constellation: string;
}

interface ObservationWindow {
  astronomicalDusk: string | null;
  astronomicalDawn: string | null;
  nauticalDusk: string | null;
  nauticalDawn: string | null;
  civilDusk: string | null;
  civilDawn: string | null;
  sunset: string | null;
  sunrise: string | null;
}

interface EphemerisResponse {
  timestamp: string;
  observer: { latitude: number; longitude: number };
  bodies: EphemerisBody[];
  observationWindow: ObservationWindow;
}

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

function MoonInterferenceBadge({ 
  interference, 
  compact = false 
}: { 
  interference: MoonInterferenceData; 
  compact?: boolean 
}) {
  const config = getMoonInterferenceLevelConfig(interference.level);
  
  if (interference.level === 'none' && compact) {
    return null;
  }
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge 
          variant="outline" 
          className={cn(
            "text-[10px] py-0 shrink-0 cursor-help",
            config.bg,
            config.border,
            config.text
          )}
        >
          <Moon className="w-3 h-3 mr-0.5" />
          {compact ? config.shortLabel : config.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-medium">{config.description}</p>
        <p className="text-xs text-muted-foreground mt-1">{interference.message}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function AltitudeIndicator({ altitude }: { altitude: number }) {
  const { quality, description } = getAltitudeQuality(altitude);
  
  const colors = {
    excellent: "bg-chart-2",
    good: "bg-chart-4",
    fair: "bg-chart-5",
    poor: "bg-destructive",
    below_horizon: "bg-muted",
  };
  
  const normalizedAlt = Math.max(0, Math.min(90, altitude));
  const percentage = (normalizedAlt / 90) * 100;
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Altitude</span>
        <span className="font-mono">{altitude.toFixed(1)}°</span>
      </div>
      <Progress value={percentage} className="h-2" />
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function CompassDisplay({ azimuth }: { azimuth: number }) {
  const direction = getCardinalDirection(azimuth);
  
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-2 border-muted flex items-center justify-center">
          <div 
            className="w-1 h-6 bg-primary rounded-full origin-bottom"
            style={{ 
              transform: `rotate(${azimuth}deg) translateY(-25%)`,
              transformOrigin: 'center bottom'
            }}
          />
        </div>
        <span className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 text-[10px] font-medium">N</span>
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1 text-[10px] text-muted-foreground">S</span>
        <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 text-[10px] text-muted-foreground">W</span>
        <span className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 text-[10px] text-muted-foreground">E</span>
      </div>
      <div>
        <div className="font-mono text-lg">{azimuth.toFixed(1)}°</div>
        <div className="text-sm text-muted-foreground">{direction}</div>
      </div>
    </div>
  );
}

function getBortleVisibilityComment(
  object: CelestialObject, 
  bortle: number
): { status: "excellent" | "good" | "challenging" | "difficult"; message: string } {
  const magnitude = object.magnitude;
  const category = object.category;
  
  if (!magnitude) {
    return { status: "good", message: "Visibility depends on conditions" };
  }

  if (category === "planet" || category === "moon") {
    return { 
      status: "excellent", 
      message: `Bright object (mag ${magnitude}) - easily visible from any location` 
    };
  }

  if (category === "double_star") {
    if (magnitude < 4) {
      return { status: "excellent", message: `Bright double star - excellent from Bortle ${bortle}` };
    }
    return { status: "good", message: `Double star visibility depends on separation and seeing conditions` };
  }

  const limitingMagnitudes: Record<number, number> = {
    1: 7.6, 2: 7.1, 3: 6.6, 4: 6.2, 5: 5.6, 6: 5.1, 7: 4.6, 8: 4.1, 9: 4.0
  };

  const dsoBonus: Record<string, number> = {
    globular_cluster: 1.5,
    open_cluster: 1.0,
    planetary_nebula: 0.5,
    galaxy: -0.5,
    nebula: -0.5,
    emission_nebula: -1.0,
    supernova_remnant: -1.5,
  };

  const limitingMag = limitingMagnitudes[bortle] || 5.0;
  const bonus = dsoBonus[category] || 0;
  const effectiveMag = magnitude - bonus;
  const margin = limitingMag - effectiveMag;

  if (margin >= 2) {
    return { 
      status: "excellent", 
      message: `Excellent visibility from Bortle ${bortle} - this ${category.replace("_", " ")} is ${Math.abs(magnitude - limitingMag).toFixed(1)} magnitudes brighter than your sky limit` 
    };
  } else if (margin >= 0.5) {
    return { 
      status: "good", 
      message: `Good visibility from Bortle ${bortle} - comfortably within your limiting magnitude (${limitingMag.toFixed(1)})` 
    };
  } else if (margin >= -0.5) {
    return { 
      status: "challenging", 
      message: `Challenging from Bortle ${bortle} - near your limiting magnitude. Use averted vision and allow eyes to dark-adapt` 
    };
  } else {
    const darkSkyNeeded = Object.entries(limitingMagnitudes)
      .find(([_, lm]) => lm >= effectiveMag + 0.5);
    
    return { 
      status: "difficult", 
      message: `Difficult from Bortle ${bortle} - object (mag ${magnitude}) exceeds your limiting magnitude (${limitingMag.toFixed(1)}).${
        darkSkyNeeded ? ` Consider a Bortle ${darkSkyNeeded[0]} or darker site.` : ""
      }` 
    };
  }
}

function BortleVisibilityCard({ object, bortle }: { object: CelestialObject; bortle: number }) {
  const { status, message } = getBortleVisibilityComment(object, bortle);
  
  const config = {
    excellent: { 
      icon: CheckCircle, 
      bg: "bg-chart-2/10", 
      border: "border-chart-2/30", 
      text: "text-chart-2",
      label: "Excellent Visibility"
    },
    good: { 
      icon: Eye, 
      bg: "bg-chart-4/10", 
      border: "border-chart-4/30", 
      text: "text-chart-4",
      label: "Good Visibility"
    },
    challenging: { 
      icon: AlertTriangle, 
      bg: "bg-chart-5/10", 
      border: "border-chart-5/30", 
      text: "text-chart-5",
      label: "Challenging"
    },
    difficult: { 
      icon: XCircle, 
      bg: "bg-destructive/10", 
      border: "border-destructive/30", 
      text: "text-destructive",
      label: "Difficult"
    },
  };
  
  const { icon: Icon, bg, border, text, label } = config[status];
  
  return (
    <div className={cn("p-3 rounded-md border", bg, border)}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn("w-4 h-4", text)} />
        <span className={cn("text-sm font-medium", text)}>{label} at Bortle {bortle}</span>
      </div>
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

interface EquipmentRecommendation {
  objectId: number;
  objectName: string;
  objectCategory: string;
  hasConditionsLogged: boolean;
  nightContext: {
    powerClass: string;
    totalScore: number;
    planetScore: number;
    dsoScore: number;
  };
  telescope: {
    id: number;
    name: string;
    aperture: number;
    focalLength: number;
    type?: string;
  } | null;
  eyepiece: {
    id: number;
    name: string;
    focalLength: number;
    apparentFov?: number | null;
    barlow: {
      id: number;
      name: string;
      factor: number;
    } | null;
    magnification: number;
    exitPupil: number;
    reason: string;
  } | null;
  filter: {
    useFilter: boolean;
    filterType: string;
    reason: string;
    userFilter: {
      id: number;
      name: string;
      type: string;
    } | null;
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
    settings: {
      exposureRange: string;
      gainOrIso: string;
      frames?: string;
      notes: string;
    };
    reason: string;
  };
  location: {
    id: number;
    name: string;
    bortle: number;
  } | null;
  moonIllumination?: number | null;
}

function EquipmentRecommendationsSection({ objectId, catalogId, moonIllumination, objectSize, telescopeId, opticalModifier }: { 
  objectId?: number; 
  catalogId?: string;
  moonIllumination?: number;
  objectSize?: string | null;
  telescopeId?: string;
  opticalModifier?: OpticalModifierSpecs | null;
}) {
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [enhancedSuitability, setEnhancedSuitability] = useState<EnhancedSuitabilityScore | null>(null);
  
  const { data, isLoading, error } = useQuery<EquipmentRecommendation>({
    queryKey: catalogId 
      ? ['/api/objects/by-catalog', catalogId, 'recommendations', moonIllumination, telescopeId]
      : ['/api/objects', objectId, 'recommendations', telescopeId],
    queryFn: async () => {
      let url: string;
      const params = new URLSearchParams();
      
      if (catalogId) {
        url = `/api/objects/by-catalog/${encodeURIComponent(catalogId)}/recommendations`;
        if (moonIllumination !== undefined) {
          params.set('moonIllumination', moonIllumination.toString());
        }
      } else {
        url = `/api/objects/${objectId}/recommendations`;
      }
      
      if (telescopeId) {
        params.set('telescopeId', telescopeId);
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const res = await fetch(url, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to fetch recommendations');
      }
      return res.json();
    },
    enabled: !!(objectId || catalogId),
    staleTime: 30000,
    refetchOnMount: 'always',
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-3 rounded-md bg-muted/50 text-center text-sm text-muted-foreground">
        <p>Unable to load equipment recommendations</p>
      </div>
    );
  }

  if (!data.telescope && !data.eyepiece) {
    return (
      <div className="p-4 rounded-md bg-muted/50 border border-muted">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-full bg-primary/10 shrink-0">
            <Telescope className="w-4 h-4 text-primary" />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">No equipment registered</p>
            <p className="text-xs text-muted-foreground">
              Add your telescope and eyepieces to get personalized magnification, 
              exit pupil, and field of view calculations for this object.
            </p>
            <Button variant="outline" size="sm" asChild className="mt-2">
              <Link href="/equipment" data-testid="link-add-equipment-visibility">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add Equipment
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const powerClassColors: Record<string, string> = {
    HIGH: 'text-emerald-600 dark:text-emerald-400',
    MID: 'text-blue-600 dark:text-blue-400',
    LOW: 'text-amber-600 dark:text-amber-400',
  };

  const imagingFeasibilityConfig = {
    yes: { bg: 'bg-chart-2/10', border: 'border-chart-2/30', text: 'text-chart-2', label: 'Good for Imaging' },
    borderline: { bg: 'bg-chart-5/10', border: 'border-chart-5/30', text: 'text-chart-5', label: 'Marginal' },
    no: { bg: 'bg-destructive/10', border: 'border-destructive/30', text: 'text-destructive', label: 'Not Recommended' },
  };

  const imagingConfig = imagingFeasibilityConfig[data.imaging.feasibility];

  const conditionsScore = data.hasConditionsLogged ? data.nightContext.totalScore / 10 : undefined;
  const isExcellentConditions = conditionsScore !== undefined && conditionsScore >= 7;
  const isPoorConditions = conditionsScore !== undefined && conditionsScore <= 3;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
        <Badge variant="outline" className={cn("text-xs", powerClassColors[data.nightContext.powerClass])}>
          {data.nightContext.powerClass} Power
        </Badge>
        {data.hasConditionsLogged ? (
          <span>Based on tonight's conditions</span>
        ) : (
          <span>Default conditions (log tonight's for accuracy)</span>
        )}
      </div>

      {isExcellentConditions && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-chart-2/10 border border-chart-2/30 text-chart-2 text-xs">
          <Sparkles className="w-3.5 h-3.5" />
          <span className="font-medium">Great conditions tonight!</span>
          <span className="text-chart-2/80">Make the most of excellent seeing.</span>
        </div>
      )}

      {isPoorConditions && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-chart-5/10 border border-chart-5/30 text-chart-5 text-xs">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span className="font-medium">Challenging conditions.</span>
          <span className="text-chart-5/80">Lower magnifications recommended.</span>
        </div>
      )}

      <Accordion type="multiple" className="w-full" defaultValue={["eyepiece"]}>
        <AccordionItem value="eyepiece" className="border-b-0">
          <AccordionTrigger className="py-2 text-sm hover:no-underline" data-testid="accordion-eyepiece-visibility">
            <div className="flex items-center gap-2 flex-1">
              <Circle className="w-4 h-4" />
              <span>Your Eyepiece</span>
              {data.eyepiece && data.telescope && (() => {
                const suitability = calculateEnhancedSuitability(
                  { aperture: data.telescope.aperture, focalLength: data.telescope.focalLength },
                  { focalLength: data.eyepiece.focalLength, apparentFov: data.eyepiece.apparentFov ?? undefined },
                  { category: data.objectCategory, angularSize: objectSize },
                  { 
                    seeingScore: data.hasConditionsLogged ? data.nightContext.totalScore / 10 : undefined,
                    bortle: data.location?.bortle,
                    moonIllumination: data.moonIllumination ?? moonIllumination ?? undefined,
                  },
                  data.eyepiece.barlow ? { factor: data.eyepiece.barlow.factor } : undefined,
                  opticalModifier ?? undefined
                );
                return (
                  <Badge 
                    variant="outline"
                    className={cn("text-xs ml-auto mr-2", getSuitabilityBadgeStyles(suitability.level))}
                    data-testid="badge-eyepiece-suitability-visibility"
                  >
                    {getSuitabilityBadgeLabel(suitability.level)} ({suitability.score}%)
                  </Badge>
                );
              })()}
            </div>
          </AccordionTrigger>
          <AccordionContent>
            {data.eyepiece && data.telescope ? (
              <div className="space-y-2 pt-1">
                <div className="p-3 rounded-md bg-primary/5 border border-primary/20">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{data.eyepiece.name}</span>
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-xs">
                        {data.eyepiece.magnification}x
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          const suitability = calculateEnhancedSuitability(
                            { aperture: data.telescope!.aperture, focalLength: data.telescope!.focalLength },
                            { focalLength: data.eyepiece!.focalLength, apparentFov: data.eyepiece!.apparentFov ?? undefined },
                            { category: data.objectCategory, angularSize: objectSize },
                            { 
                              seeingScore: data.hasConditionsLogged ? data.nightContext.totalScore / 10 : undefined,
                              bortle: data.location?.bortle,
                              moonIllumination: data.moonIllumination ?? moonIllumination ?? undefined,
                            },
                            data.eyepiece!.barlow ? { factor: data.eyepiece!.barlow.factor } : undefined,
                            opticalModifier ?? undefined
                          );
                          setEnhancedSuitability(suitability);
                          setShowInfoModal(true);
                        }}
                        data-testid="button-eyepiece-info-visibility"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {data.eyepiece.barlow && (
                    <p className="text-xs text-muted-foreground mt-1">
                      + {data.eyepiece.barlow.name} ({data.eyepiece.barlow.factor}x)
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>Exit Pupil: {data.eyepiece.exitPupil.toFixed(1)}mm</span>
                    {(() => {
                      const suitability = calculateEnhancedSuitability(
                        { aperture: data.telescope!.aperture, focalLength: data.telescope!.focalLength },
                        { focalLength: data.eyepiece!.focalLength, apparentFov: data.eyepiece!.apparentFov ?? undefined },
                        { category: data.objectCategory, angularSize: objectSize },
                        { 
                          seeingScore: data.hasConditionsLogged ? data.nightContext.totalScore / 10 : undefined,
                          bortle: data.location?.bortle,
                          moonIllumination: data.moonIllumination ?? moonIllumination ?? undefined,
                        },
                        data.eyepiece!.barlow ? { factor: data.eyepiece!.barlow.factor } : undefined,
                        opticalModifier ?? undefined
                      );
                      return (
                        <span>FOV: {suitability.details.trueFov.toFixed(0)}'</span>
                      );
                    })()}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{data.eyepiece.reason}</p>
                {(() => {
                  const suitability = calculateEnhancedSuitability(
                    { aperture: data.telescope!.aperture, focalLength: data.telescope!.focalLength },
                    { focalLength: data.eyepiece!.focalLength, apparentFov: data.eyepiece!.apparentFov ?? undefined },
                    { category: data.objectCategory, angularSize: objectSize },
                    { 
                      seeingScore: data.hasConditionsLogged ? data.nightContext.totalScore / 10 : undefined,
                      bortle: data.location?.bortle,
                      moonIllumination: data.moonIllumination ?? moonIllumination ?? undefined,
                    },
                    data.eyepiece!.barlow ? { factor: data.eyepiece!.barlow.factor } : undefined,
                    opticalModifier ?? undefined
                  );
                  return suitability.level !== 'excellent' && (
                    <p className="text-xs text-muted-foreground italic">{suitability.summary}</p>
                  );
                })()}
              </div>
            ) : data.eyepiece ? (
              <div className="space-y-2 pt-1">
                <div className="p-3 rounded-md bg-primary/5 border border-primary/20">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{data.eyepiece.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {data.eyepiece.magnification}x
                    </Badge>
                  </div>
                  {data.eyepiece.barlow && (
                    <p className="text-xs text-muted-foreground mt-1">
                      + {data.eyepiece.barlow.name} ({data.eyepiece.barlow.factor}x)
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>Exit Pupil: {data.eyepiece.exitPupil.toFixed(1)}mm</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{data.eyepiece.reason}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No eyepiece recommendation available</p>
            )}
          </AccordionContent>
        </AccordionItem>
        
        {/* Equipment Recommendation Modal */}
        {enhancedSuitability && data.eyepiece && data.telescope && (
          <EquipmentRecommendationModal
            open={showInfoModal}
            onOpenChange={setShowInfoModal}
            objectName={data.objectName}
            objectCategory={data.objectCategory}
            telescopeName={data.telescope.name}
            telescopeType={data.telescope.type}
            eyepieceName={data.eyepiece.name}
            barlowName={data.eyepiece.barlow?.name}
            suitability={enhancedSuitability}
          />
        )}

        <AccordionItem value="filter" className="border-b-0">
          <AccordionTrigger className="py-2 text-sm hover:no-underline" data-testid="accordion-filter-visibility">
            <div className="flex items-center gap-2">
              <FilterIcon className="w-4 h-4" />
              <span>Filter Recommendation</span>
              {data.filter.useFilter && (
                <Badge variant="outline" className="text-xs bg-chart-4/10 border-chart-4/30 text-chart-4">
                  Suggested
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2 pt-1">
              {data.filter.useFilter ? (
                <>
                  {(() => {
                    const primaryType = typeof data.filter.primaryFilter === 'object' 
                      ? data.filter.primaryFilter?.type 
                      : data.filter.primaryFilter || data.filter.filterType;
                    
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
                          {data.filter.userFilter && data.filter.userFilter.type.toLowerCase().includes(primaryType.toLowerCase()) && (
                            <Badge variant="secondary" className="text-xs">
                              You have this
                            </Badge>
                          )}
                        </div>
                        {data.filter.userFilter && data.filter.userFilter.type.toLowerCase().includes(primaryType.toLowerCase()) ? (
                          <p className="text-xs text-muted-foreground mt-1">
                            Use: {data.filter.userFilter.name}
                          </p>
                        ) : (
                          <div className="flex items-center justify-between mt-2">
                            <p className="text-xs text-chart-5">
                              You don't have a {primaryType.toUpperCase()} filter
                            </p>
                            <Button variant="outline" size="sm" asChild className="h-6 text-xs">
                              <Link href="/equipment" data-testid="link-add-filter-visibility">
                                <Plus className="w-3 h-3 mr-1" />
                                Add Filter
                              </Link>
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  
                  {(() => {
                    const secondaryType = typeof data.filter.secondaryFilter === 'object' 
                      ? data.filter.secondaryFilter?.type 
                      : data.filter.secondaryFilter;
                    
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

                  {data.filter.optionalFilters && data.filter.optionalFilters.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Also helpful: </span>
                      {data.filter.optionalFilters.map(f => 
                        typeof f === 'object' ? f.type.toUpperCase() : f.toUpperCase()
                      ).join(', ')}
                    </div>
                  )}

                  {data.filter.avoidFilters && data.filter.avoidFilters.length > 0 && (
                    <div className="text-xs text-destructive">
                      <span className="font-medium">Avoid: </span>
                      {data.filter.avoidFilters.map(f => f.toUpperCase()).join(', ')}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">{data.filter.reason}</p>
                </>
              ) : (
                <>
                  <div className="p-3 rounded-md bg-muted/30 border border-muted-foreground/10">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-sm">No Filter Needed</span>
                    </div>
                  </div>
                  
                  {data.filter.secondaryFilter && (() => {
                    const secondaryType = typeof data.filter.secondaryFilter === 'object' 
                      ? data.filter.secondaryFilter?.type 
                      : data.filter.secondaryFilter;
                    
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

                  {data.filter.optionalFilters && data.filter.optionalFilters.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">Also helpful: </span>
                      {data.filter.optionalFilters.map(f => 
                        typeof f === 'object' ? f.type.toUpperCase() : f.toUpperCase()
                      ).join(', ')}
                    </div>
                  )}

                  {data.filter.avoidFilters && data.filter.avoidFilters.length > 0 && (
                    <div className="text-xs text-destructive">
                      <span className="font-medium">Avoid: </span>
                      {data.filter.avoidFilters.map(f => f.toUpperCase()).join(', ')}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">{data.filter.reason}</p>
                </>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="imaging" className="border-b-0">
          <AccordionTrigger className="py-2 text-sm hover:no-underline" data-testid="accordion-imaging-visibility">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4" />
              <span>Imaging</span>
              <Badge 
                variant="outline" 
                className={cn("text-xs", imagingConfig.bg, imagingConfig.border, imagingConfig.text)}
              >
                {imagingConfig.label}
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2 pt-1">
              <div className={cn("p-3 rounded-md border", imagingConfig.bg, imagingConfig.border)}>
                <div className="flex items-center gap-2 mb-2">
                  <Zap className={cn("w-4 h-4", imagingConfig.text)} />
                  <span className={cn("text-sm font-medium", imagingConfig.text)}>
                    {data.imaging.preferredCamera === 'astrocam' ? 'Dedicated Camera' : 
                     data.imaging.preferredCamera === 'smartphone' ? 'Smartphone' : 
                     data.imaging.preferredCamera === 'dslr' ? 'DSLR' : 'Any Camera'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Exposure:</span>
                    <p className="font-mono">{data.imaging.settings.exposureRange}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Gain/ISO:</span>
                    <p className="font-mono">{data.imaging.settings.gainOrIso}</p>
                  </div>
                  {data.imaging.settings.frames && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Frames:</span>
                      <p className="font-mono">{data.imaging.settings.frames}</p>
                    </div>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{data.imaging.settings.notes}</p>
              <p className="text-xs text-muted-foreground">{data.imaging.reason}</p>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

function VisibilityCard({ 
  object, 
  visibility, 
  isSelected,
  isEphemeris,
  conditionsScore,
  hasGoodPosition,
  nightWindowData,
  moonInterference,
  useObservableHours,
  onClick 
}: { 
  object: CelestialObject;
  visibility: VisibilityWindow;
  isSelected: boolean;
  isEphemeris?: boolean;
  conditionsScore: number | null;
  hasGoodPosition?: boolean;
  nightWindowData?: NightWindowAltitudes;
  moonInterference?: MoonInterferenceData;
  useObservableHours?: boolean;
  onClick: () => void;
}) {
  const currentAlt = visibility.currentAltitude;
  
  // Use the most relevant altitude for quality highlighting:
  // - If night window data exists, use night max (since that's what matters for planning)
  // - Otherwise use current altitude
  const relevantAlt = nightWindowData ? nightWindowData.nightMaxAltitude : currentAlt;
  const { quality } = getAltitudeQuality(relevantAlt);
  
  const qualityColors = {
    excellent: "ring-chart-2",
    good: "ring-chart-4",
    fair: "ring-chart-5",
    poor: "ring-destructive",
    below_horizon: "ring-muted",
  };
  
  const isPlanetOrMoon = object.category === "planet" || object.category === "moon";
  
  // Helper to get altitude color class
  const getAltColor = (alt: number) => 
    alt >= 40 ? "text-chart-2" :
    alt >= 20 ? "text-chart-4" :
    alt > 0 ? "text-chart-5" :
    "text-muted-foreground";
  
  return (
    <Card 
      className={cn(
        "cursor-pointer hover-elevate",
        isSelected && `ring-2 ${qualityColors[quality]}`
      )}
      onClick={onClick}
      data-testid={`card-visibility-${object.catalogId}`}
    >
      <CardContent className="p-3 sm:p-4">
        {/* Header: Name row with badges - wraps on mobile */}
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1 mb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs text-muted-foreground">{object.catalogId}</span>
              {isEphemeris && (
                <span title="Real-time position">
                  <Globe2 className="w-3 h-3 text-chart-4" />
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-medium text-sm sm:text-base line-clamp-2 sm:truncate">{object.name}</h3>
              {object.isHot && (
                <Sparkles className="w-3.5 h-3.5 text-chart-4 shrink-0" />
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {moonInterference && (
              <MoonInterferenceBadge interference={moonInterference} compact />
            )}
            {conditionsScore !== null && (
              <ConditionsQualityBadge score={conditionsScore} compact />
            )}
          </div>
        </div>
        
        {/* Three altitude values row - wraps on very narrow screens */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2 text-[10px] font-mono" data-testid={`altitude-metrics-${object.catalogId}`}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-0.5">
                <span className="text-muted-foreground uppercase">Now</span>
                <span className={getAltColor(currentAlt)}>
                  {currentAlt > 0 ? "+" : ""}{currentAlt.toFixed(0)}°
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
                <span className={getAltColor(visibility.maxAltitude)}>
                  {visibility.maxAltitude.toFixed(0)}°
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Maximum altitude at transit</p>
              {visibility.transitTime && (
                <p className="text-muted-foreground">at {format(visibility.transitTime, "HH:mm")}</p>
              )}
            </TooltipContent>
          </Tooltip>
          {nightWindowData && (
            <>
              <span className="text-muted-foreground/40">|</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-0.5">
                    <Moon className="w-2.5 h-2.5 text-muted-foreground" />
                    <span className={getAltColor(nightWindowData.nightMaxAltitude)}>
                      {nightWindowData.nightMaxAltitude.toFixed(0)}°
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Max altitude during night window</p>
                  {nightWindowData.nightBestTime && (
                    <p className="text-muted-foreground">at {format(nightWindowData.nightBestTime, "HH:mm")}</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
        
        <div className="flex items-center flex-wrap gap-2 text-xs text-muted-foreground">
          {isPlanetOrMoon && <Badge variant="secondary" className="text-[10px] py-0">{object.category === "moon" ? "Moon" : "Planet"}</Badge>}
          {hasGoodPosition && (
            <Badge variant="secondary" className="text-[10px] py-0 bg-chart-2/10 text-chart-2 border-chart-2/30">
              <Eye className="w-3 h-3 mr-0.5" />
              Positioned
            </Badge>
          )}
          {visibility.isCircumpolar && <Badge variant="secondary">Circumpolar</Badge>}
          {visibility.neverRises && <Badge variant="secondary">Never rises</Badge>}
        </div>
      </CardContent>
    </Card>
  );
}

function DetailedVisibility({ 
  object, 
  visibility,
  bortle,
  location,
  isEphemeris,
  moonIllumination,
  onBack,
  isInWatchlist,
  onAddToWatchlist,
  isWatchlistPending,
  telescopeId,
  opticalModifier
}: { 
  object: CelestialObject;
  visibility: VisibilityWindow;
  bortle: number;
  location: Location | null;
  isEphemeris?: boolean;
  moonIllumination?: number;
  onBack?: () => void;
  isInWatchlist?: boolean;
  onAddToWatchlist?: () => void;
  isWatchlistPending?: boolean;
  telescopeId?: string;
  opticalModifier?: OpticalModifierSpecs | null;
}) {
  const { quality, description } = getAltitudeQuality(visibility.currentAltitude);
  
  const raDecimal = useMemo(() => {
    if (!object.rightAscension) return NaN;
    const match = object.rightAscension.match(/(\d+)h\s*(\d+)m/);
    if (match) {
      return parseFloat(match[1]) + parseFloat(match[2]) / 60;
    }
    return parseFloat(object.rightAscension);
  }, [object.rightAscension]);
  
  const decDecimal = useMemo(() => {
    if (!object.declination) return NaN;
    const match = object.declination.match(/([+-]?)(\d+)[°]\s*(\d+)[′']/);
    if (match) {
      const sign = match[1] === '-' ? -1 : 1;
      return sign * (parseFloat(match[2]) + parseFloat(match[3]) / 60);
    }
    return parseFloat(object.declination);
  }, [object.declination]);
  
  return (
    <Card>
      <CardHeader>
        {onBack && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onBack}
            className="w-fit -ml-2 mb-2 lg:hidden"
            data-testid="button-back-to-list"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to list
          </Button>
        )}
        <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-4">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Star className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
              <span className="line-clamp-2 sm:truncate">{object.name}</span>
              {object.isHot && (
                <Sparkles className="w-4 h-4 text-chart-4 shrink-0" />
              )}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              <span className="inline-flex flex-wrap gap-x-1">
                <span>{object.catalogId}</span>
                <span className="text-muted-foreground/50">&bull;</span>
                <span>{object.constellation}</span>
                <span className="text-muted-foreground/50">&bull;</span>
                <span>{object.category.replace("_", " ")}</span>
                {object.magnitude && (
                  <>
                    <span className="text-muted-foreground/50">&bull;</span>
                    <span>mag {object.magnitude}</span>
                  </>
                )}
              </span>
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onAddToWatchlist && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={onAddToWatchlist}
                    disabled={isInWatchlist || isWatchlistPending}
                    data-testid={`button-watchlist-detail-${object.catalogId}`}
                  >
                    {isInWatchlist ? (
                      <CheckCircle2 className="w-4 h-4 text-chart-2" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isInWatchlist ? "In Watch List" : "Add to Watch List"}
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-xs sm:text-sm cursor-help",
                    quality === "excellent" && "border-chart-2 text-chart-2",
                    quality === "good" && "border-chart-4 text-chart-4",
                    quality === "fair" && "border-chart-5 text-chart-5",
                    quality === "poor" && "border-destructive text-destructive",
                    quality === "below_horizon" && "border-muted text-muted-foreground"
                  )}
                  data-testid={`badge-altitude-quality-${object.catalogId}`}
                >
                  <ArrowUp className="w-3 h-3 mr-1" />
                  {visibility.currentAltitude.toFixed(0)}° {quality === "below_horizon" ? "" : `(${quality.charAt(0).toUpperCase() + quality.slice(1)})`}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">Current Altitude</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <BortleVisibilityCard object={object} bortle={bortle} />

        <div className="grid sm:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h4 className="font-medium text-sm">Current Position</h4>
            <AltitudeIndicator altitude={visibility.currentAltitude} />
            <CompassDisplay azimuth={visibility.currentAzimuth} />
          </div>
          
          <div className="space-y-4">
            <h4 className="font-medium text-sm">Today's Times</h4>
            {visibility.isCircumpolar ? (
              <div className="p-3 rounded-md bg-chart-2/10 border border-chart-2/30">
                <div className="flex items-center gap-2">
                  <Moon className="w-4 h-4 text-chart-2" />
                  <span className="text-sm font-medium">Circumpolar Object</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  This object never sets from your location and is visible all night.
                </p>
              </div>
            ) : visibility.neverRises ? (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/30">
                <div className="flex items-center gap-2">
                  <SunIcon className="w-4 h-4 text-destructive" />
                  <span className="text-sm font-medium">Never Visible</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  This object never rises above the horizon from your location.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibility.riseTime && (
                  <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                    <div className="flex items-center gap-2">
                      <Sunrise className="w-4 h-4 text-chart-4" />
                      <span className="text-sm">Rise</span>
                    </div>
                    <span className="font-mono">{format(visibility.riseTime, "HH:mm")}</span>
                  </div>
                )}
                {visibility.transitTime && (
                  <div className="flex items-center justify-between p-2 rounded-md bg-primary/10">
                    <div className="flex items-center gap-2">
                      <ArrowUp className="w-4 h-4 text-primary" />
                      <span className="text-sm">Transit (highest)</span>
                    </div>
                    <span className="font-mono">{format(visibility.transitTime, "HH:mm")}</span>
                  </div>
                )}
                {visibility.setTime && (
                  <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                    <div className="flex items-center gap-2">
                      <Sunset className="w-4 h-4 text-chart-5" />
                      <span className="text-sm">Set</span>
                    </div>
                    <span className="font-mono">{format(visibility.setTime, "HH:mm")}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {location && location.latitude != null && location.longitude != null && !isNaN(raDecimal) && !isNaN(decDecimal) && (
          <>
            <Separator />
            <AltitudeChart
              catalogId={object.catalogId}
              name={object.name}
              ra={raDecimal}
              dec={decDecimal}
              latitude={location.latitude}
              longitude={location.longitude}
            />
          </>
        )}

        <Separator />

        <div className="grid sm:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Max Altitude</span>
            <p className="font-mono">{visibility.maxAltitude.toFixed(1)}°</p>
          </div>
          <div>
            <span className="text-muted-foreground">Right Ascension</span>
            <p className="font-mono">{object.rightAscension}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Declination</span>
            <p className="font-mono">{object.declination}</p>
          </div>
        </div>

        {object.bestMonths && object.bestMonths.length > 0 && (
          <>
            <Separator />
            <div>
              <span className="text-sm text-muted-foreground">Best Viewing Months</span>
              <div className="flex flex-wrap gap-1 mt-2">
                {object.bestMonths.map((month) => (
                  <Badge key={month} variant="secondary" className="uppercase">
                    {month}
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}

        {object.description && (
          <>
            <Separator />
            <p className="text-sm text-muted-foreground">{object.description}</p>
          </>
        )}

        <Separator />

        <div>
          <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
            <Telescope className="w-4 h-4" />
            Equipment Recommendations
          </h4>
          <EquipmentRecommendationsSection 
            objectId={isEphemeris ? undefined : object.id} 
            catalogId={isEphemeris ? object.catalogId : undefined}
            moonIllumination={object.category === 'moon' ? moonIllumination : undefined}
            objectSize={object.size}
            telescopeId={telescopeId}
            opticalModifier={opticalModifier}
          />
        </div>

        <Separator />

        <Button className="w-full" asChild data-testid="button-observe-now">
          <Link href="/wizard">
            <Telescope className="w-4 h-4 mr-2" />
            Observe Now
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function TimeScrubber({
  value,
  onChange,
  isPlaying,
  onPlayPause,
  onReset,
}: {
  value: number;
  onChange: (value: number) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  onReset: () => void;
}) {
  const getTimeFromValue = (val: number) => {
    const baseDate = startOfDay(new Date());
    const hours = Math.floor(val);
    const minutes = Math.round((val - hours) * 60);
    return setMinutes(setHours(baseDate, hours), minutes);
  };

  const displayTime = getTimeFromValue(value);
  const isNightTime = value >= 18 || value < 6;

  return (
    <div className="border rounded-lg p-3 bg-card space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Time Simulation</span>
          <Badge variant={isNightTime ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
            {isNightTime ? "Night" : "Day"}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-lg font-mono font-semibold tabular-nums">
            {format(displayTime, "HH:mm")}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={onReset}
            data-testid="button-time-reset"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button
            variant={isPlaying ? "default" : "ghost"}
            size="icon"
            onClick={onPlayPause}
            data-testid="button-time-play"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
        </div>
      </div>
      
      <Slider
        value={[value]}
        onValueChange={([val]) => onChange(val)}
        min={0}
        max={24}
        step={0.25}
        data-testid="slider-time"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>
    </div>
  );
}

export default function SkyTonight() {
  const searchParams = useSearch();
  const [, setLocation] = useLocation();
  const selectParam = new URLSearchParams(searchParams).get('select');
  
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [selectedTelescopeId, setSelectedTelescopeId] = useState<string>("");
  const [selectedModifierId, setSelectedModifierId] = useState<string>("none");
  const [selectedObjectId, setSelectedObjectId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"altitude" | "name">("altitude");
  
  const [filterWow, setFilterWow] = useState(false);
  const [filterConditions, setFilterConditions] = useState<Set<ConditionsQuality>>(new Set());
  const [filterWellPositioned, setFilterWellPositioned] = useState(false);
  const [filterMoonlight, setFilterMoonlight] = useState<Set<MoonInterferenceLevel>>(new Set());
  const [filterCategories, setFilterCategories] = useState<Set<string>>(new Set());
  const [filterMonths, setFilterMonths] = useState<Set<string>>(new Set());
  
  const [useObservableHours, setUseObservableHours] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('skytonight-observable-hours');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });
  
  useEffect(() => {
    localStorage.setItem('skytonight-observable-hours', String(useObservableHours));
  }, [useObservableHours]);
  
  const [timeValue, setTimeValue] = useState(() => {
    const now = new Date();
    return now.getHours() + now.getMinutes() / 60;
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [useTimeScrubber, setUseTimeScrubber] = useState(false);

  const simulatedDate = useMemo(() => {
    if (!useTimeScrubber) return new Date();
    const base = startOfDay(new Date());
    const hours = Math.floor(timeValue);
    const minutes = Math.round((timeValue - hours) * 60);
    return setMinutes(setHours(base, hours), minutes);
  }, [useTimeScrubber, timeValue]);

  const handleTimeReset = useCallback(() => {
    const now = new Date();
    setTimeValue(now.getHours() + now.getMinutes() / 60);
    setIsPlaying(false);
    setUseTimeScrubber(false);
  }, []);

  const handlePlayPause = useCallback(() => {
    setIsPlaying(prev => !prev);
    if (!useTimeScrubber) {
      setUseTimeScrubber(true);
    }
  }, [useTimeScrubber]);

  useEffect(() => {
    if (!isPlaying || !useTimeScrubber) return;
    const interval = setInterval(() => {
      setTimeValue(prev => {
        const next = prev + 0.25;
        if (next >= 24) return 0;
        return next;
      });
    }, 500);
    return () => clearInterval(interval);
  }, [isPlaying, useTimeScrubber]);

  useEffect(() => {
    if (!useTimeScrubber) {
      setIsPlaying(false);
    }
  }, [useTimeScrubber]);
  
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const { data: watchlistItems = [] } = useQuery<WatchlistItem[]>({
    queryKey: ['/api/watchlist'],
    enabled: isAuthenticated,
  });

  const isInWatchlist = useCallback((objectId: number) => {
    return watchlistItems.some(item => item.objectId === objectId);
  }, [watchlistItems]);

  const addToWatchlistMutation = useMutation({
    mutationFn: async (objectId: number) => {
      return apiRequest('POST', '/api/watchlist', { objectId, priority: 'medium', notes: '' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
      toast({ title: "Added to Watch List" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add to watch list", variant: "destructive" });
    },
  });

  const { data: locations, isLoading: locationsLoading } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
    enabled: !!user,
  });

  const { data: equipment } = useQuery<{ telescopes: Array<{ id: number; name: string; aperture: number; focalLength: number; type?: string | null; obstructionRatio?: number | null }> }>({
    queryKey: ["/api/equipment"],
    enabled: !!user,
  });

  const { data: opticalModifiers } = useQuery<Array<{ id: number; name: string; factor: number; type: string }>>({
    queryKey: ["/api/optical-modifiers"],
    enabled: !!user,
  });

  const selectedModifier = useMemo(() => {
    if (!opticalModifiers || selectedModifierId === "none") return null;
    const modifier = opticalModifiers.find(m => m.id.toString() === selectedModifierId);
    return modifier ? { factor: modifier.factor, type: modifier.type as 'focal_reducer' | 'coma_corrector', name: modifier.name } : null;
  }, [opticalModifiers, selectedModifierId]);

  const { data: userPreferences } = useQuery<{ favoriteTelescopeId: number | null; favoriteLocationId: number | null }>({
    queryKey: ["/api/user/preferences"],
    enabled: !!user,
  });

  const { data: objects, isLoading: objectsLoading } = useQuery<CelestialObject[]>({
    queryKey: ["/api/objects"],
    enabled: !!user,
  });

  // Query for tonight's conditions - this enables reactive updates when conditions change
  const { data: conditionsData } = useQuery<{ id: number; date: string; cloudCover: number; seeing: number; transparency: number; humidity: number; jetStream: number } | null>({
    queryKey: ["/api/night-conditions/tonight"],
    enabled: !!user,
    staleTime: 30000,
  });

  // Create a conditions fingerprint for cache busting - changes when conditions are updated
  const conditionsFingerprint = conditionsData 
    ? `${conditionsData.id}-${conditionsData.cloudCover}-${conditionsData.seeing}-${conditionsData.transparency}`
    : 'none';

  // Auto-select favorite location on page load (important for Dashboard navigation)
  useEffect(() => {
    if (locations?.length && !selectedLocationId) {
      const favoriteLocation = locations.find(l => l.isFavorite && l.latitude && l.longitude);
      const firstValidLocation = locations.find(l => l.latitude && l.longitude);
      const locationToSelect = favoriteLocation || firstValidLocation;
      if (locationToSelect) {
        setSelectedLocationId(locationToSelect.id.toString());
      }
    }
  }, [locations, selectedLocationId]);

  // Auto-select favorite telescope on page load
  useEffect(() => {
    if (equipment?.telescopes?.length && !selectedTelescopeId) {
      const favoriteId = userPreferences?.favoriteTelescopeId;
      const favoriteTelescope = favoriteId ? equipment.telescopes.find(t => t.id === favoriteId) : null;
      const telescopeToSelect = favoriteTelescope || equipment.telescopes[0];
      if (telescopeToSelect) {
        setSelectedTelescopeId(telescopeToSelect.id.toString());
      }
    }
  }, [equipment?.telescopes, userPreferences?.favoriteTelescopeId, selectedTelescopeId]);

  const selectedLocation = useMemo(() => {
    if (!locations || !selectedLocationId) return null;
    return locations.find(l => l.id.toString() === selectedLocationId) ?? null;
  }, [locations, selectedLocationId]);

  const selectedTelescope = useMemo(() => {
    if (!equipment?.telescopes || !selectedTelescopeId) return null;
    return equipment.telescopes.find(t => t.id.toString() === selectedTelescopeId) ?? null;
  }, [equipment?.telescopes, selectedTelescopeId]);

  const { data: ephemerisData, isLoading: ephemerisLoading } = useQuery<EphemerisResponse>({
    queryKey: ["/api/ephemeris", selectedLocation?.latitude, selectedLocation?.longitude],
    enabled: !!selectedLocation?.latitude && !!selectedLocation?.longitude,
    queryFn: async () => {
      const res = await fetch(`/api/ephemeris?latitude=${selectedLocation!.latitude}&longitude=${selectedLocation!.longitude}`);
      if (!res.ok) throw new Error("Failed to fetch ephemeris");
      return res.json();
    },
    staleTime: 60000,
    refetchInterval: 60000,
  });

  const { data: tonightData } = useQuery<TonightRecommendationsResponse>({
    queryKey: ["/api/recommendations/tonight", selectedLocationId, conditionsFingerprint],
    enabled: isAuthenticated && !!selectedLocationId,
    queryFn: async () => {
      const res = await fetch(`/api/recommendations/tonight?locationId=${selectedLocationId}&limit=50`);
      if (!res.ok) throw new Error("Failed to fetch tonight recommendations");
      return res.json();
    },
    staleTime: 30000,
    refetchOnMount: 'always',
  });

  const tonightRecommendationsMap = useMemo(() => {
    if (!tonightData?.recommendations) return new Map<string, TonightRecommendation>();
    const map = new Map<string, TonightRecommendation>();
    tonightData.recommendations.forEach(r => map.set(r.catalogId, r));
    return map;
  }, [tonightData]);
  
  const overallConditionsScore = tonightData?.context?.conditionsScore ?? null;
  const hasConditionsLogged = tonightData?.context?.hasConditionsLogged ?? false;

  const observationWindow = useMemo(() => {
    if (!ephemerisData?.observationWindow) return null;
    const ow = ephemerisData.observationWindow;
    
    const startStr = ow.astronomicalDusk || ow.nauticalDusk || ow.civilDusk || ow.sunset;
    const endStr = ow.astronomicalDawn || ow.nauticalDawn || ow.civilDawn || ow.sunrise;
    
    if (!startStr || !endStr) return null;
    
    const start = new Date(startStr);
    const end = new Date(endStr);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    
    return {
      start,
      end,
      hasAstronomicalNight: !!ow.astronomicalDusk && !!ow.astronomicalDawn,
    };
  }, [ephemerisData?.observationWindow]);

  const visibilityData = useMemo(() => {
    if (!selectedLocation?.latitude || !selectedLocation?.longitude) return [];
    
    const results: Array<{
      object: CelestialObject;
      visibility: VisibilityWindow;
      isEphemeris?: boolean;
      moonIllumination?: number;
      conditionsScore: number | null;
      hasGoodPosition: boolean;
      nightWindowData?: NightWindowAltitudes;
      moonInterference?: MoonInterferenceData;
    }> = [];
    
    const globalMoonIllumination = tonightData?.context?.moonIllumination ?? 50;
    
    // Extract Moon's position from ephemeris for separation calculations
    const moonBody = ephemerisData?.bodies?.find(b => b.catalogId === 'Moon');
    const moonRA = moonBody?.raDecimal ?? null;
    const moonDec = moonBody?.decDecimal ?? null;
    const moonAltitude = moonBody?.altitude ?? undefined;
    
    if (ephemerisData?.bodies) {
      for (const body of ephemerisData.bodies) {
        if (body.catalogId === 'Sun') continue;
        
        const matchingObject = objects?.find(o => o.catalogId === body.catalogId);
        
        const syntheticObject: CelestialObject = {
          id: -1000 - results.length,
          userId: null,
          catalogId: body.catalogId,
          name: body.name,
          category: body.category as any,
          constellation: body.constellation,
          magnitude: matchingObject?.magnitude ?? null,
          size: matchingObject?.size ?? null,
          rightAscension: body.rightAscension,
          declination: body.declination,
          difficulty: matchingObject?.difficulty ?? "easy",
          moonInterference: matchingObject?.moonInterference ?? 0,
          isHot: matchingObject?.isHot ?? true,
          bestMonths: null,
          separation: matchingObject?.separation ?? null,
          description: matchingObject?.description ?? 
            (body.category === 'moon' 
              ? `Current illumination: ${body.moonIllumination?.toFixed(0)}%` 
              : `Current elongation from Sun: ${body.elongation?.toFixed(1)}°`),
        };
        
        let ephemerisVisibility: VisibilityWindow;
        if (useTimeScrubber && body.rightAscension && body.declination) {
          ephemerisVisibility = calculateVisibility(
            body.rightAscension,
            body.declination,
            selectedLocation.latitude,
            selectedLocation.longitude,
            simulatedDate
          );
        } else {
          ephemerisVisibility = {
            currentAltitude: body.altitude,
            currentAzimuth: body.azimuth,
            riseTime: body.riseTime ? new Date(body.riseTime) : null,
            setTime: body.setTime ? new Date(body.setTime) : null,
            transitTime: body.transitTime ? new Date(body.transitTime) : null,
            maxAltitude: body.altitude,
            isCircumpolar: false,
            neverRises: false,
          };
        }
        
        const bortleStatus = getBortleVisibilityComment(syntheticObject, selectedLocation.bortle).status;
        
        let nightWindowData: NightWindowAltitudes | undefined;
        const hasValidCoords = typeof body.rightAscension === 'number' && typeof body.declination === 'number' && 
                               !isNaN(body.rightAscension) && !isNaN(body.declination);
        
        if (observationWindow && hasValidCoords) {
          const transitTimeForCalc = body.transitTime ? new Date(body.transitTime) : null;
          nightWindowData = calculateNightWindowAltitudes(
            body.rightAscension,
            body.declination,
            selectedLocation.latitude,
            selectedLocation.longitude,
            observationWindow.start,
            observationWindow.end,
            25, // wellPositionedThreshold
            transitTimeForCalc,
            ephemerisVisibility.maxAltitude
          );
          if (nightWindowData.sampleCount === 0 || isNaN(nightWindowData.nightMaxAltitude)) {
            nightWindowData = undefined;
          }
        }
        
        const hasGoodPosition = useObservableHours && nightWindowData
          ? nightWindowData.nightWellPositioned && bortleStatus !== "difficult"
          : ephemerisVisibility.currentAltitude >= 25 && bortleStatus !== "difficult";
        
        const recommendation = tonightRecommendationsMap.get(body.catalogId);
        const conditionsScore = recommendation?.conditionsScore ?? overallConditionsScore;
        
        // Use server-calculated moonInterference when available for consistency
        let moonInterference: MoonInterferenceData;
        if (recommendation?.moonInterference) {
          const config = getMoonInterferenceLevelConfig(recommendation.moonInterference);
          const scoreMap = { none: 0, low: 3, moderate: 6, high: 9 };
          moonInterference = {
            level: recommendation.moonInterference,
            score: scoreMap[recommendation.moonInterference],
            separation: recommendation.moonSeparation,
            illumination: globalMoonIllumination,
            message: config.description,
          };
        } else {
          // Fallback to client calculation for objects without recommendations
          const isPlanetOrMoonType = body.category === "planet" || body.category === "moon";
          let bodySeparation: number | null = null;
          if (moonRA !== null && moonDec !== null && body.raDecimal !== undefined && body.decDecimal !== undefined) {
            bodySeparation = calculateAngularSeparation(body.raDecimal, body.decDecimal, moonRA, moonDec);
          }
          moonInterference = calculateMoonInterference(
            body.moonIllumination ?? globalMoonIllumination,
            bodySeparation,
            moonAltitude,
            isPlanetOrMoonType
          );
        }
        
        results.push({
          object: syntheticObject,
          visibility: ephemerisVisibility,
          isEphemeris: true,
          moonIllumination: body.moonIllumination ?? undefined,
          conditionsScore,
          hasGoodPosition,
          nightWindowData,
          moonInterference,
        });
      }
    }
    
    if (objects) {
      const ephemerisCatalogIds = new Set(ephemerisData?.bodies?.map(b => b.catalogId) || []);
      
      for (const obj of objects) {
        if (ephemerisCatalogIds.has(obj.catalogId)) continue;
        
        if (!obj.rightAscension || !obj.declination) continue;
        
        const visibility = calculateVisibility(
          obj.rightAscension,
          obj.declination,
          selectedLocation.latitude,
          selectedLocation.longitude,
          simulatedDate
        );
        
        const bortleStatus = getBortleVisibilityComment(obj, selectedLocation.bortle).status;
        
        let nightWindowData: NightWindowAltitudes | undefined;
        if (observationWindow) {
          nightWindowData = calculateNightWindowAltitudes(
            obj.rightAscension,
            obj.declination,
            selectedLocation.latitude,
            selectedLocation.longitude,
            observationWindow.start,
            observationWindow.end,
            25, // wellPositionedThreshold
            visibility.transitTime,
            visibility.maxAltitude
          );
          if (nightWindowData.sampleCount === 0 || isNaN(nightWindowData.nightMaxAltitude)) {
            nightWindowData = undefined;
          }
        }
        
        const hasGoodPosition = useObservableHours && nightWindowData
          ? nightWindowData.nightWellPositioned && bortleStatus !== "difficult"
          : visibility.currentAltitude >= 25 && bortleStatus !== "difficult";
        
        const recommendation = tonightRecommendationsMap.get(obj.catalogId);
        const conditionsScore = recommendation?.conditionsScore ?? overallConditionsScore;
        
        // Use server-calculated moonInterference when available for consistency
        let objMoonInterference: MoonInterferenceData;
        if (recommendation?.moonInterference) {
          const config = getMoonInterferenceLevelConfig(recommendation.moonInterference);
          const scoreMap = { none: 0, low: 3, moderate: 6, high: 9 };
          objMoonInterference = {
            level: recommendation.moonInterference,
            score: scoreMap[recommendation.moonInterference],
            separation: recommendation.moonSeparation,
            illumination: globalMoonIllumination,
            message: config.description,
          };
        } else {
          // Fallback to client calculation for objects without recommendations
          const isPlanetOrMoonType = obj.category === "planet" || obj.category === "moon";
          let objSeparation: number | null = null;
          if (moonRA !== null && moonDec !== null && obj.rightAscension && obj.declination) {
            objSeparation = calculateMoonSeparationFromStrings(obj.rightAscension, obj.declination, moonRA, moonDec);
          }
          objMoonInterference = calculateMoonInterference(
            globalMoonIllumination,
            objSeparation,
            moonAltitude,
            isPlanetOrMoonType
          );
        }
        
        results.push({
          object: obj,
          visibility,
          isEphemeris: false,
          conditionsScore,
          hasGoodPosition,
          nightWindowData,
          moonInterference: objMoonInterference,
        });
      }
    }
    
    return results
      .filter(item => {
        if (searchQuery !== "" && 
            !item.object.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
            !item.object.catalogId.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false;
        }
        if (filterWow && !item.object.isHot) return false;
        if (filterConditions.size > 0) {
          if (item.conditionsScore === null) return false;
          const quality = getConditionsQuality(item.conditionsScore);
          if (!filterConditions.has(quality)) return false;
        }
        if (filterWellPositioned && !item.hasGoodPosition) return false;
        if (filterMoonlight.size > 0) {
          if (!item.moonInterference) return false;
          if (!filterMoonlight.has(item.moonInterference.level)) return false;
        }
        if (filterCategories.size > 0) {
          if (!filterCategories.has(item.object.category)) return false;
        }
        if (filterMonths.size > 0) {
          const objectMonths = item.object.bestMonths;
          if (!objectMonths || objectMonths.length === 0) {
            if (item.isEphemeris) return true;
            return false;
          }
          const monthMap: Record<string, string> = {
            january: 'jan', jan: 'jan',
            february: 'feb', feb: 'feb',
            march: 'mar', mar: 'mar',
            april: 'apr', apr: 'apr',
            may: 'may',
            june: 'jun', jun: 'jun',
            july: 'jul', jul: 'jul',
            august: 'aug', aug: 'aug',
            september: 'sep', sep: 'sep',
            october: 'oct', oct: 'oct',
            november: 'nov', nov: 'nov',
            december: 'dec', dec: 'dec',
          };
          const normalizedMonths = objectMonths.map(m => monthMap[m.toLowerCase()] || m.toLowerCase());
          const hasMatchingMonth = normalizedMonths.some(m => filterMonths.has(m));
          if (!hasMatchingMonth) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "altitude") {
          if (useObservableHours) {
            const aAlt = a.nightWindowData?.nightMaxAltitude ?? a.visibility.currentAltitude;
            const bAlt = b.nightWindowData?.nightMaxAltitude ?? b.visibility.currentAltitude;
            return bAlt - aAlt;
          }
          return b.visibility.currentAltitude - a.visibility.currentAltitude;
        }
        return a.object.name.localeCompare(b.object.name);
      });
  }, [objects, selectedLocation, ephemerisData, searchQuery, sortBy, filterWow, filterConditions, filterWellPositioned, filterMoonlight, filterCategories, filterMonths, tonightRecommendationsMap, tonightData, overallConditionsScore, simulatedDate, useTimeScrubber, useObservableHours, observationWindow]);

  const selectedVisibility = useMemo(() => {
    if (!selectedObjectId) return null;
    return visibilityData.find(v => v.object.id === selectedObjectId) ?? null;
  }, [visibilityData, selectedObjectId]);

  // Auto-select object from URL parameter (e.g., from Dashboard "Best for Tonight" widget)
  useEffect(() => {
    if (selectParam && visibilityData.length > 0 && !selectedObjectId) {
      const matchingItem = visibilityData.find(v => v.object.catalogId === selectParam);
      if (matchingItem) {
        setSelectedObjectId(matchingItem.object.id);
        // Clear the URL parameter to avoid re-selecting on navigation
        setLocation('/sky-tonight', { replace: true });
      }
    }
  }, [selectParam, visibilityData, selectedObjectId, setLocation]);

  const isLoading = locationsLoading || objectsLoading || (selectedLocation && ephemerisLoading);
  const showDetailsOnMobile = selectedObjectId !== null;

  const handleClearSelection = () => {
    setSelectedObjectId(null);
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">Sky Tonight</h1>
          <p className="text-sm sm:text-base text-muted-foreground">See what's visible from your location tonight</p>
        </div>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            {locationsLoading ? (
              <Skeleton className="h-9 flex-1" />
            ) : locations?.length ? (
              <Select value={selectedLocationId} onValueChange={(v) => {
                setSelectedLocationId(v);
                setSelectedObjectId(null);
              }}>
                <SelectTrigger className="flex-1 h-9" data-testid="select-location-visibility">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id.toString()} disabled={!loc.latitude || !loc.longitude}>
                      {loc.name} (Bortle {loc.bortle})
                      {!loc.latitude || !loc.longitude ? " - no coords" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
                <Link href="/locations">Add a location</Link>
              </Button>
            )}
          </div>
          
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Telescope className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            {equipment?.telescopes?.length ? (
              <Select value={selectedTelescopeId} onValueChange={setSelectedTelescopeId}>
                <SelectTrigger className="flex-1 h-9" data-testid="select-telescope-visibility">
                  <SelectValue placeholder="Select telescope" />
                </SelectTrigger>
                <SelectContent>
                  {equipment.telescopes.map((t) => (
                    <SelectItem key={t.id} value={t.id.toString()}>
                      {t.name} ({t.aperture}mm)
                      {userPreferences?.favoriteTelescopeId === t.id && " ★"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
                <Link href="/equipment">Add equipment</Link>
              </Button>
            )}
          </div>

          {opticalModifiers && opticalModifiers.length > 0 && (
            <div className="flex items-center gap-2 min-w-[180px]">
              <Layers className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <Select value={selectedModifierId} onValueChange={setSelectedModifierId}>
                <SelectTrigger className="flex-1 h-9" data-testid="select-modifier-visibility">
                  <SelectValue placeholder="No modifier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Modifier</SelectItem>
                  {opticalModifiers.map((m) => (
                    <SelectItem key={m.id} value={m.id.toString()}>
                      {m.name} ({m.factor}×)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        
        {selectedLocation && !selectedLocation.latitude && (
          <p className="text-sm text-chart-5 mt-2">
            This location needs coordinates. <Link href="/locations" className="underline">Add them here</Link>
          </p>
        )}
      </Card>

      {selectedLocation && selectedLocation.latitude && selectedLocation.longitude && (
        <>
          <Card className={cn(showDetailsOnMobile && "hidden lg:block")}>
            <CardContent className="p-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search objects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-visibility"
                  />
                </div>
                
                <Separator orientation="vertical" className="h-6 hidden sm:block" />
                
                <Button
                  variant={filterWow ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterWow(!filterWow)}
                  className={cn(
                    "gap-1.5",
                    filterWow && "bg-chart-4 hover:bg-chart-4/90"
                  )}
                  data-testid="button-filter-wow-visibility"
                >
                  <Sparkles className="w-4 h-4" />
                  Wow
                </Button>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={filterConditions.size > 0 ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "gap-1.5",
                        filterConditions.size > 0 && "bg-primary hover:bg-primary/90"
                      )}
                      disabled={!isAuthenticated || !hasConditionsLogged}
                      data-testid="button-filter-conditions-visibility"
                    >
                      <CloudSun className="w-4 h-4" />
                      Conditions
                      {filterConditions.size > 0 && (
                        <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] bg-background/20">
                          {filterConditions.size}
                        </Badge>
                      )}
                      <ChevronDown className="w-3 h-3 ml-0.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3" align="start">
                    <div className="space-y-3">
                      <div className="font-medium text-sm">Filter by Conditions Quality</div>
                      <p className="text-xs text-muted-foreground">
                        Select which quality levels to show. Based on tonight's logged conditions.
                      </p>
                      <div className="space-y-2">
                        {(["excellent", "good", "fair", "poor", "very_poor"] as ConditionsQuality[]).map((quality) => {
                          const config = getConditionsConfig(quality);
                          const isChecked = filterConditions.has(quality);
                          return (
                            <label
                              key={quality}
                              className={cn(
                                "flex items-center gap-3 p-2 rounded-md cursor-pointer hover-elevate",
                                isChecked && config.bg
                              )}
                            >
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={(checked) => {
                                  const newSet = new Set(filterConditions);
                                  if (checked) {
                                    newSet.add(quality);
                                  } else {
                                    newSet.delete(quality);
                                  }
                                  setFilterConditions(newSet);
                                }}
                                data-testid={`checkbox-conditions-${quality}`}
                              />
                              <div className="flex items-center gap-2 flex-1">
                                <CloudSun className={cn("w-4 h-4", config.text)} />
                                <span className={cn("text-sm font-medium", config.text)}>
                                  {config.label}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                      {filterConditions.size > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setFilterConditions(new Set())}
                          className="w-full text-muted-foreground"
                        >
                          Clear selection
                        </Button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                
                <Button
                  variant={filterWellPositioned ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterWellPositioned(!filterWellPositioned)}
                  className={cn(
                    "gap-1.5",
                    filterWellPositioned && "bg-chart-2 hover:bg-chart-2/90"
                  )}
                  data-testid="button-filter-well-positioned-visibility"
                >
                  <Eye className="w-4 h-4" />
                  Well Positioned
                </Button>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={filterMoonlight.size > 0 ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "gap-1.5",
                        filterMoonlight.size > 0 && "bg-chart-5 hover:bg-chart-5/90"
                      )}
                      data-testid="button-filter-moonlight-visibility"
                    >
                      <Moon className="w-4 h-4" />
                      Moonlight
                      {filterMoonlight.size > 0 && (
                        <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] bg-background/20">
                          {filterMoonlight.size}
                        </Badge>
                      )}
                      <ChevronDown className="w-3 h-3 ml-0.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3" align="start">
                    <div className="space-y-3">
                      <div className="font-medium text-sm">Filter by Moonlight Interference</div>
                      <p className="text-xs text-muted-foreground">
                        Select moonlight interference levels to show. Based on moon illumination and position.
                      </p>
                      <div className="space-y-2">
                        {(["none", "low", "moderate", "high"] as MoonInterferenceLevel[]).map((level) => {
                          const config = getMoonInterferenceLevelConfig(level);
                          const isChecked = filterMoonlight.has(level);
                          return (
                            <label
                              key={level}
                              className={cn(
                                "flex items-center gap-3 p-2 rounded-md cursor-pointer hover-elevate",
                                isChecked && config.bg
                              )}
                            >
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={(checked) => {
                                  const newSet = new Set(filterMoonlight);
                                  if (checked) {
                                    newSet.add(level);
                                  } else {
                                    newSet.delete(level);
                                  }
                                  setFilterMoonlight(newSet);
                                }}
                                data-testid={`checkbox-moonlight-${level}`}
                              />
                              <div className="flex items-center gap-2 flex-1">
                                <Moon className={cn("w-4 h-4", config.text)} />
                                <span className={cn("text-sm font-medium", config.text)}>
                                  {config.label}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                      {filterMoonlight.size > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setFilterMoonlight(new Set())}
                          className="w-full text-muted-foreground"
                        >
                          Clear selection
                        </Button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                
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
                      data-testid="button-filter-category-visibility"
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

                {/* Best Viewing Month Filter */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={filterMonths.size > 0 ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "gap-1.5",
                        filterMonths.size > 0 && "bg-chart-4 hover:bg-chart-4/90"
                      )}
                      data-testid="button-filter-month-visibility"
                    >
                      <CalendarDays className="w-4 h-4" />
                      <span className="hidden sm:inline">Month</span>
                      {filterMonths.size > 0 && (
                        <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] bg-background/20">
                          {filterMonths.size}
                        </Badge>
                      )}
                      <ChevronDown className="w-3 h-3 ml-0.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-3" align="start">
                    <div className="space-y-3">
                      <div className="font-medium text-sm">Best Viewing Month</div>
                      <p className="text-xs text-muted-foreground">
                        Filter objects by their optimal viewing months.
                      </p>
                      <div className="grid grid-cols-3 gap-1">
                        {[
                          { value: "jan", label: "Jan" },
                          { value: "feb", label: "Feb" },
                          { value: "mar", label: "Mar" },
                          { value: "apr", label: "Apr" },
                          { value: "may", label: "May" },
                          { value: "jun", label: "Jun" },
                          { value: "jul", label: "Jul" },
                          { value: "aug", label: "Aug" },
                          { value: "sep", label: "Sep" },
                          { value: "oct", label: "Oct" },
                          { value: "nov", label: "Nov" },
                          { value: "dec", label: "Dec" },
                        ].map(({ value, label }) => {
                          const isChecked = filterMonths.has(value);
                          return (
                            <label
                              key={value}
                              className={cn(
                                "flex items-center justify-center gap-1 px-2 py-1.5 rounded-md cursor-pointer hover-elevate text-sm",
                                isChecked && "bg-chart-4/20 text-chart-4 font-medium"
                              )}
                            >
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={(checked) => {
                                  const newSet = new Set(filterMonths);
                                  if (checked) {
                                    newSet.add(value);
                                  } else {
                                    newSet.delete(value);
                                  }
                                  setFilterMonths(newSet);
                                }}
                                className="sr-only"
                                data-testid={`checkbox-month-${value}`}
                              />
                              <span>{label}</span>
                            </label>
                          );
                        })}
                      </div>
                      {filterMonths.size > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setFilterMonths(new Set())}
                          className="w-full text-muted-foreground"
                        >
                          Clear selection
                        </Button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>

                <Separator orientation="vertical" className="h-6" />
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={useObservableHours ? "default" : "outline"}
                      size="sm"
                      onClick={() => setUseObservableHours(!useObservableHours)}
                      className={cn(
                        "gap-1.5",
                        useObservableHours && "bg-primary hover:bg-primary/90"
                      )}
                      data-testid="button-toggle-observable-hours"
                    >
                      <Telescope className="w-4 h-4" />
                      <span className="hidden sm:inline">Obs Window</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="font-medium mb-1">
                      {useObservableHours ? "Observable Hours Mode (ON)" : "Real-Time Mode (OFF)"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {useObservableHours 
                        ? "Showing positions and sorting based on tonight's dark hours. 'Well Positioned' means the object reaches 25°+ altitude during astronomical night."
                        : "Showing current real-time positions. Toggle ON to see what's actually observable tonight."}
                    </p>
                    {observationWindow && useObservableHours && (
                      <p className="text-xs mt-2 text-muted-foreground">
                        Tonight: {format(observationWindow.start, "HH:mm")} - {format(observationWindow.end, "HH:mm")}
                        {!observationWindow.hasAstronomicalNight && " (nautical twilight)"}
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
                
                {/* Sort Icon Button */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8" data-testid="button-sort-visibility">
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
                        Sort by Altitude
                      </button>
                      <button
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm rounded-md hover-elevate",
                          sortBy === "name" && "bg-accent"
                        )}
                        onClick={() => setSortBy("name")}
                      >
                        Sort by Name
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <HelpCircle className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-4" align="end">
                    <div className="space-y-4">
                      <div className="font-medium">Understanding Filters</div>
                      
                      <div className="space-y-3 text-sm">
                        <div className="flex items-start gap-2">
                          <Sparkles className="w-4 h-4 text-chart-4 mt-0.5 shrink-0" />
                          <div>
                            <span className="font-medium">Wow:</span>
                            <span className="text-muted-foreground ml-1">
                              Impressive must-see targets like planets, famous nebulae, and showpiece objects.
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-start gap-2">
                          <CloudSun className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                          <div>
                            <span className="font-medium">Conditions:</span>
                            <span className="text-muted-foreground ml-1">
                              Filter by weather quality scores. Based on tonight's logged cloud cover, seeing, humidity, and moon phase.
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-start gap-2">
                          <Eye className="w-4 h-4 text-chart-2 mt-0.5 shrink-0" />
                          <div>
                            <span className="font-medium">Well Positioned:</span>
                            <span className="text-muted-foreground ml-1">
                              Objects above 25° altitude and visible from your Bortle {selectedLocation?.bortle} sky.
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-start gap-2">
                          <Moon className="w-4 h-4 text-chart-5 mt-0.5 shrink-0" />
                          <div>
                            <span className="font-medium">Moonlight:</span>
                            <span className="text-muted-foreground ml-1">
                              Filter by moonlight interference level. None/Low is ideal for DSOs, while planets are unaffected.
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-start gap-2">
                          <Telescope className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                          <div>
                            <span className="font-medium">Obs Window:</span>
                            <span className="text-muted-foreground ml-1">
                              When ON, positions and "Well Positioned" are based on tonight's dark hours (astro twilight). When OFF, shows real-time positions.
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <Separator />
                      
                      <div className="space-y-2 text-xs text-muted-foreground">
                        <div className="font-medium text-foreground">Conditions Quality Levels</div>
                        <div className="grid grid-cols-2 gap-1">
                          <span className="text-chart-2">Excellent: 80-100%</span>
                          <span className="text-chart-4">Good: 60-79%</span>
                          <span className="text-chart-5">Fair: 40-59%</span>
                          <span className="text-orange-500">Poor: 20-39%</span>
                          <span className="text-destructive">Very Poor: 0-19%</span>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                
                {(filterWow || filterConditions.size > 0 || filterWellPositioned || filterMoonlight.size > 0) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFilterWow(false);
                      setFilterConditions(new Set());
                      setFilterWellPositioned(false);
                      setFilterMoonlight(new Set());
                    }}
                    className="text-muted-foreground"
                    data-testid="button-clear-filters-visibility"
                  >
                    Clear all
                  </Button>
                )}
              </div>
              
              {!hasConditionsLogged && isAuthenticated && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-sm text-muted-foreground">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    Log tonight's conditions in the <a href="/sessions" className="text-primary underline">Sessions</a> page to enable conditions-based filtering.
                  </span>
                </div>
              )}
              
              <Separator />
              
              <div className="flex items-center gap-4">
                <Button
                  variant={useTimeScrubber ? "default" : "outline"}
                  size="sm"
                  onClick={() => setUseTimeScrubber(!useTimeScrubber)}
                  className="gap-2"
                  data-testid="button-toggle-time-scrubber"
                >
                  <Clock className="w-4 h-4" />
                  {useTimeScrubber ? "Using Simulated Time" : "Use Time Scrubber"}
                </Button>
                {useTimeScrubber && (
                  <Badge variant="secondary" className="font-mono">
                    {format(simulatedDate, "HH:mm")}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {useTimeScrubber && (
            <TimeScrubber
              value={timeValue}
              onChange={(val) => setTimeValue(val)}
              isPlaying={isPlaying}
              onPlayPause={handlePlayPause}
              onReset={handleTimeReset}
            />
          )}

          <div className="grid lg:grid-cols-2 gap-6">
            <div className={cn("space-y-4", showDetailsOnMobile && "hidden lg:block")}>
              <h2 className="text-lg font-semibold">
                Objects ({visibilityData.length})
              </h2>
              {objectsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
                </div>
              ) : visibilityData.length > 0 ? (
                <div className="space-y-2 max-h-[600px] overflow-y-auto overflow-x-hidden pr-1 sm:pr-2">
                  {visibilityData.map(({ object, visibility, isEphemeris, conditionsScore, hasGoodPosition, nightWindowData, moonInterference }) => (
                    <VisibilityCard
                      key={object.id}
                      object={object}
                      visibility={visibility}
                      isSelected={selectedObjectId === object.id}
                      isEphemeris={isEphemeris}
                      conditionsScore={conditionsScore}
                      hasGoodPosition={hasGoodPosition}
                      nightWindowData={nightWindowData}
                      moonInterference={moonInterference}
                      useObservableHours={useObservableHours}
                      onClick={() => setSelectedObjectId(object.id)}
                    />
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-8 text-center">
                    <Star className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-muted-foreground mb-2">
                      {(filterWow || filterConditions.size > 0 || filterWellPositioned || filterMoonlight.size > 0) 
                        ? "No objects match your filters"
                        : "No objects found"}
                    </p>
                    {(filterWow || filterConditions.size > 0 || filterWellPositioned || filterMoonlight.size > 0) && (
                      <p className="text-sm text-muted-foreground">
                        Try relaxing some filters to see more objects
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            <div className={cn(!showDetailsOnMobile && "hidden lg:block")}>
              {selectedVisibility ? (
                <div className="lg:sticky lg:top-4">
                  <DetailedVisibility 
                    object={selectedVisibility.object} 
                    visibility={selectedVisibility.visibility}
                    bortle={selectedLocation.bortle}
                    location={selectedLocation}
                    isEphemeris={selectedVisibility.isEphemeris}
                    moonIllumination={selectedVisibility.moonIllumination}
                    onBack={handleClearSelection}
                    isInWatchlist={isAuthenticated ? isInWatchlist(selectedVisibility.object.id) : undefined}
                    onAddToWatchlist={isAuthenticated ? () => addToWatchlistMutation.mutate(selectedVisibility.object.id) : undefined}
                    isWatchlistPending={isAuthenticated ? addToWatchlistMutation.isPending : undefined}
                    telescopeId={selectedTelescopeId}
                    opticalModifier={selectedModifier}
                  />
                </div>
              ) : (
                <Card>
                  <CardContent className="py-16 text-center">
                    <Info className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-medium mb-2">Select an object</h3>
                    <p className="text-muted-foreground max-w-md mx-auto">
                      Click on an object from the list to see detailed visibility information.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          <Card className={cn(showDetailsOnMobile && "hidden lg:block")}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Info className="w-5 h-5" />
                Understanding Visibility
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div className="p-3 rounded-md bg-chart-2/10 border border-chart-2/30">
                  <span className="font-medium text-chart-2">Excellent (60°+)</span>
                  <p className="text-muted-foreground mt-1">Near zenith, minimal atmospheric distortion</p>
                </div>
                <div className="p-3 rounded-md bg-chart-4/10 border border-chart-4/30">
                  <span className="font-medium text-chart-4">Good (40-60°)</span>
                  <p className="text-muted-foreground mt-1">Good viewing with slight haze</p>
                </div>
                <div className="p-3 rounded-md bg-chart-5/10 border border-chart-5/30">
                  <span className="font-medium text-chart-5">Fair (20-40°)</span>
                  <p className="text-muted-foreground mt-1">Noticeable atmospheric effects</p>
                </div>
                <div className="p-3 rounded-md bg-destructive/10 border border-destructive/30">
                  <span className="font-medium text-destructive">Poor (0-20°)</span>
                  <p className="text-muted-foreground mt-1">Heavy distortion, reduced contrast</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
