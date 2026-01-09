import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AltitudeChart } from "@/components/AltitudeChart";
import { Link } from "wouter";
import {
  Sunrise,
  Sunset,
  Clock,
  Star,
  ArrowUp,
  Moon,
  Sun as SunIcon,
  Eye,
  AlertTriangle,
  CheckCircle,
  XCircle,
  MapPin,
  Telescope,
  Sparkles,
  Circle,
  Camera,
  Filter,
  Zap,
  Settings2,
  Bookmark,
  BookmarkCheck,
  Loader2,
  Info,
  Plus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { WatchlistItem } from "@shared/schema";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { calculateVisibility, getAltitudeQuality, getCardinalDirection, VisibilityWindow } from "@/lib/astronomy";
import { 
  calculateEnhancedSuitability, 
  getSuitabilityBadgeStyles, 
  getSuitabilityBadgeLabel,
  type EnhancedSuitabilityScore,
  type OpticalModifierSpecs,
} from "@/lib/equipmentRecommendation";
import { EquipmentRecommendationModal } from "@/components/EquipmentRecommendationModal";
import type { CelestialObject, Location } from "@shared/schema";

interface EphemerisBody {
  catalogId: string;
  name: string;
  category: string;
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

interface EphemerisResponse {
  timestamp: string;
  observer: { latitude: number; longitude: number };
  bodies: EphemerisBody[];
  observationWindow: {
    astronomicalDusk: string;
    astronomicalDawn: string;
    sunset: string;
    sunrise: string;
  };
}

interface ObjectDetailSheetProps {
  object: CelestialObject | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opticalModifier?: OpticalModifierSpecs | null;
}

interface EquipmentRecommendation {
  objectId: number;
  objectName: string;
  objectCategory: string;
  objectSeparation?: number | null; // For double stars: separation in arcseconds
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
    obstructionRatio?: number | null;
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

function AltitudeIndicator({ altitude }: { altitude: number }) {
  const { quality, description } = getAltitudeQuality(altitude);

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
      <div className="relative w-14 h-14">
        <div className="absolute inset-0 rounded-full border-2 border-muted flex items-center justify-center">
          <div
            className="w-1 h-5 bg-primary rounded-full origin-bottom"
            style={{
              transform: `rotate(${azimuth}deg) translateY(-25%)`,
              transformOrigin: "center bottom",
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
      message: `Bright object (mag ${magnitude}) - easily visible from any location`,
    };
  }

  if (category === "double_star") {
    if (magnitude < 4) {
      return { status: "excellent", message: `Bright double star - excellent from Bortle ${bortle}` };
    }
    return { status: "good", message: `Double star visibility depends on separation and seeing conditions` };
  }

  const limitingMagnitudes: Record<number, number> = {
    1: 7.6, 2: 7.1, 3: 6.6, 4: 6.2, 5: 5.6, 6: 5.1, 7: 4.6, 8: 4.1, 9: 4.0,
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
      message: `Excellent visibility from Bortle ${bortle} - this ${category.replace("_", " ")} is ${Math.abs(magnitude - limitingMag).toFixed(1)} mag brighter than your limit`,
    };
  } else if (margin >= 0.5) {
    return {
      status: "good",
      message: `Good visibility from Bortle ${bortle} - comfortably within your limiting magnitude`,
    };
  } else if (margin >= -0.5) {
    return {
      status: "challenging",
      message: `Challenging from Bortle ${bortle} - near your limiting magnitude. Use averted vision.`,
    };
  } else {
    return {
      status: "difficult",
      message: `Difficult from Bortle ${bortle} - object exceeds your limiting magnitude. Consider a darker site.`,
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
      label: "Excellent Visibility",
    },
    good: {
      icon: Eye,
      bg: "bg-chart-4/10",
      border: "border-chart-4/30",
      text: "text-chart-4",
      label: "Good Visibility",
    },
    challenging: {
      icon: AlertTriangle,
      bg: "bg-chart-5/10",
      border: "border-chart-5/30",
      text: "text-chart-5",
      label: "Challenging",
    },
    difficult: {
      icon: XCircle,
      bg: "bg-destructive/10",
      border: "border-destructive/30",
      text: "text-destructive",
      label: "Difficult",
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

function EquipmentRecommendationsSection({ objectId, objectSize, opticalModifier }: { objectId: number; objectSize?: string | null; opticalModifier?: OpticalModifierSpecs | null }) {
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [enhancedSuitability, setEnhancedSuitability] = useState<EnhancedSuitabilityScore | null>(null);
  
  const { data, isLoading, error } = useQuery<EquipmentRecommendation>({
    queryKey: ['/api/objects', objectId, 'recommendations'],
    queryFn: async () => {
      const res = await fetch(`/api/objects/${objectId}/recommendations`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to fetch recommendations');
      }
      return res.json();
    },
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

  const hasEquipment = data.telescope || data.eyepiece;

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
          <AccordionTrigger className="py-2 text-sm hover:no-underline" data-testid="accordion-eyepiece">
            <div className="flex items-center gap-2 flex-1">
              <Circle className="w-4 h-4" />
              <span>Your Eyepiece</span>
              {data.eyepiece && data.telescope && (() => {
                const suitability = calculateEnhancedSuitability(
                  { aperture: data.telescope.aperture, focalLength: data.telescope.focalLength, type: data.telescope.type, obstructionRatio: data.telescope.obstructionRatio ?? undefined },
                  { focalLength: data.eyepiece.focalLength, apparentFov: data.eyepiece.apparentFov ?? undefined },
                  { category: data.objectCategory, angularSize: objectSize, separation: data.objectSeparation ?? undefined },
                  { 
                    seeingScore: data.hasConditionsLogged ? data.nightContext.totalScore / 10 : undefined,
                    bortle: data.location?.bortle,
                    moonIllumination: data.moonIllumination ?? undefined,
                  },
                  data.eyepiece.barlow ? { factor: data.eyepiece.barlow.factor } : undefined,
                  opticalModifier ?? undefined
                );
                return (
                  <Badge 
                    variant="outline"
                    className={cn("text-xs ml-auto mr-2", getSuitabilityBadgeStyles(suitability.level))}
                    data-testid="badge-eyepiece-suitability"
                  >
                    {getSuitabilityBadgeLabel(suitability.level)} ({suitability.score}%)
                  </Badge>
                );
              })()}
            </div>
          </AccordionTrigger>
          <AccordionContent>
            {!hasEquipment ? (
              <div className="space-y-2 pt-1">
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
                        <Link href="/equipment" data-testid="link-add-equipment">
                          <Plus className="w-3.5 h-3.5 mr-1.5" />
                          Add Equipment
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : data.eyepiece && data.telescope ? (
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
                            { aperture: data.telescope!.aperture, focalLength: data.telescope!.focalLength, type: data.telescope!.type, obstructionRatio: data.telescope!.obstructionRatio ?? undefined },
                            { focalLength: data.eyepiece!.focalLength, apparentFov: data.eyepiece!.apparentFov ?? undefined },
                            { category: data.objectCategory, angularSize: objectSize, separation: data.objectSeparation ?? undefined },
                            { 
                              seeingScore: data.hasConditionsLogged ? data.nightContext.totalScore / 10 : undefined,
                              bortle: data.location?.bortle,
                              moonIllumination: data.moonIllumination ?? undefined,
                            },
                            data.eyepiece!.barlow ? { factor: data.eyepiece!.barlow.factor } : undefined,
                            opticalModifier ?? undefined
                          );
                          setEnhancedSuitability(suitability);
                          setShowInfoModal(true);
                        }}
                        data-testid="button-eyepiece-info"
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
                        { aperture: data.telescope!.aperture, focalLength: data.telescope!.focalLength, type: data.telescope!.type, obstructionRatio: data.telescope!.obstructionRatio ?? undefined },
                        { focalLength: data.eyepiece!.focalLength, apparentFov: data.eyepiece!.apparentFov ?? undefined },
                        { category: data.objectCategory, angularSize: objectSize, separation: data.objectSeparation ?? undefined },
                        { 
                          seeingScore: data.hasConditionsLogged ? data.nightContext.totalScore / 10 : undefined,
                          bortle: data.location?.bortle,
                          moonIllumination: data.moonIllumination ?? undefined,
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
                    { aperture: data.telescope!.aperture, focalLength: data.telescope!.focalLength, type: data.telescope!.type, obstructionRatio: data.telescope!.obstructionRatio ?? undefined },
                    { focalLength: data.eyepiece!.focalLength, apparentFov: data.eyepiece!.apparentFov ?? undefined },
                    { category: data.objectCategory, angularSize: objectSize, separation: data.objectSeparation ?? undefined },
                    { 
                      seeingScore: data.hasConditionsLogged ? data.nightContext.totalScore / 10 : undefined,
                      bortle: data.location?.bortle,
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
        
        {showInfoModal && enhancedSuitability && data.eyepiece && data.telescope && (
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
          <AccordionTrigger className="py-2 text-sm hover:no-underline" data-testid="accordion-filter">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              <span>Filter Recommendation</span>
              {data.filter.useFilter && (
                <Badge variant="outline" className="text-xs bg-chart-4/10 border-chart-4/30 text-chart-4">
                  Suggested
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 pt-1">
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
                              <Link href="/equipment" data-testid="link-add-filter">
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
                      {data.filter.optionalFilters.map((f: any) => 
                        typeof f === 'object' ? f.type.toUpperCase() : f.toUpperCase()
                      ).join(', ')}
                    </div>
                  )}

                  {data.filter.avoidFilters && data.filter.avoidFilters.length > 0 && (
                    <div className="text-xs text-destructive">
                      <span className="font-medium">Avoid: </span>
                      {data.filter.avoidFilters.map((f: string) => f.toUpperCase()).join(', ')}
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
                      {data.filter.optionalFilters.map((f: any) => 
                        typeof f === 'object' ? f.type.toUpperCase() : f.toUpperCase()
                      ).join(', ')}
                    </div>
                  )}

                  {data.filter.avoidFilters && data.filter.avoidFilters.length > 0 && (
                    <div className="text-xs text-destructive">
                      <span className="font-medium">Avoid: </span>
                      {data.filter.avoidFilters.map((f: string) => f.toUpperCase()).join(', ')}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">{data.filter.reason}</p>
                </>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="imaging" className="border-b-0">
          <AccordionTrigger className="py-2 text-sm hover:no-underline" data-testid="accordion-imaging">
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

const categoryLabels: Record<string, string> = {
  planet: "Planet",
  moon: "Moon",
  nebula: "Nebula",
  emission_nebula: "Emission Nebula",
  reflection_nebula: "Reflection Nebula",
  dark_nebula: "Dark Nebula",
  mixed_nebula: "Mixed Nebula",
  open_cluster: "Open Cluster",
  globular_cluster: "Globular Cluster",
  planetary_nebula: "Planetary Nebula",
  galaxy: "Galaxy",
  double_star: "Double Star",
  asterism: "Asterism",
  supernova_remnant: "Supernova Remnant",
  comet: "Comet",
  meteor_shower: "Meteor Shower",
};

export function ObjectDetailSheet({ object, open, onOpenChange, opticalModifier }: ObjectDetailSheetProps) {
  const { toast } = useToast();
  
  const { data: locations } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
    enabled: open,
  });

  const { data: watchlistItems } = useQuery<WatchlistItem[]>({
    queryKey: ['/api/watchlist'],
    enabled: open,
  });

  const isInWatchlist = useMemo(() => {
    if (!object || !watchlistItems) return false;
    return watchlistItems.some(item => item.objectId === object.id);
  }, [object, watchlistItems]);

  const addToWatchlistMutation = useMutation({
    mutationFn: async (objectId: number) => {
      return apiRequest('POST', '/api/watchlist', { objectId, priority: 'medium', notes: '' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
      toast({ 
        title: "Added to Watch List", 
        description: `${object?.name || 'Object'} added to your watch list. Calculate observation windows on the Watch List page.`,
      });
    },
    onError: () => {
      toast({ 
        title: "Error", 
        description: "Failed to add to watch list", 
        variant: "destructive",
      });
    },
  });

  const favoriteLocation = useMemo(() => {
    if (!locations) return null;
    return locations.find((l) => l.isFavorite) || locations[0] || null;
  }, [locations]);

  const hasValidLocation =
    favoriteLocation && favoriteLocation.latitude != null && favoriteLocation.longitude != null;

  const isEphemerisObject = object?.category === 'planet' || object?.category === 'moon';

  const shouldFetchEphemeris = open && hasValidLocation && isEphemerisObject && 
    favoriteLocation?.latitude != null && favoriteLocation?.longitude != null;

  const { data: ephemerisData, isLoading: ephemerisLoading } = useQuery<EphemerisResponse>({
    queryKey: ["/api/ephemeris", favoriteLocation?.latitude, favoriteLocation?.longitude],
    enabled: !!shouldFetchEphemeris,
    queryFn: async () => {
      const res = await fetch(`/api/ephemeris?latitude=${favoriteLocation!.latitude}&longitude=${favoriteLocation!.longitude}`);
      if (!res.ok) throw new Error("Failed to fetch ephemeris");
      return res.json();
    },
    staleTime: 60000,
  });

  const ephemerisBody = useMemo(() => {
    if (!ephemerisData?.bodies || !object) return null;
    return ephemerisData.bodies.find((b: EphemerisBody) => b.catalogId === object.catalogId) || null;
  }, [ephemerisData, object]);

  const visibility = useMemo<VisibilityWindow | null>(() => {
    if (!object || !hasValidLocation || !favoriteLocation) return null;
    if (favoriteLocation.latitude == null || favoriteLocation.longitude == null) return null;

    if (isEphemerisObject && ephemerisBody) {
      return {
        currentAltitude: ephemerisBody.altitude,
        currentAzimuth: ephemerisBody.azimuth,
        riseTime: ephemerisBody.riseTime ? new Date(ephemerisBody.riseTime) : null,
        setTime: ephemerisBody.setTime ? new Date(ephemerisBody.setTime) : null,
        transitTime: ephemerisBody.transitTime ? new Date(ephemerisBody.transitTime) : null,
        isCircumpolar: false,
        neverRises: false,
        maxAltitude: ephemerisBody.altitude,
      };
    }

    if (!object.rightAscension || !object.declination) return null;

    try {
      return calculateVisibility(
        object.rightAscension,
        object.declination,
        favoriteLocation.latitude,
        favoriteLocation.longitude,
        new Date()
      );
    } catch {
      return null;
    }
  }, [object, favoriteLocation, hasValidLocation, isEphemerisObject, ephemerisBody]);

  const { quality } = visibility ? getAltitudeQuality(visibility.currentAltitude) : { quality: "below_horizon" as const };

  const raDecimal = useMemo(() => {
    if (ephemerisBody) return ephemerisBody.raDecimal;
    if (!object?.rightAscension) return NaN;
    const match = object.rightAscension.match(/(\d+)h\s*(\d+)m/);
    if (match) {
      return parseFloat(match[1]) + parseFloat(match[2]) / 60;
    }
    return parseFloat(object.rightAscension);
  }, [object?.rightAscension, ephemerisBody]);

  const decDecimal = useMemo(() => {
    if (ephemerisBody) return ephemerisBody.decDecimal;
    if (!object?.declination) return NaN;
    const match = object.declination.match(/([+-]?)(\d+)[°]\s*(\d+)[′']/);
    if (match) {
      const sign = match[1] === "-" ? -1 : 1;
      return sign * (parseFloat(match[2]) + parseFloat(match[3]) / 60);
    }
    return parseFloat(object.declination);
  }, [object?.declination, ephemerisBody]);

  const displayRA = useMemo(() => {
    if (ephemerisBody) return ephemerisBody.rightAscension;
    return object?.rightAscension || null;
  }, [object?.rightAscension, ephemerisBody]);

  const displayDec = useMemo(() => {
    if (ephemerisBody) return ephemerisBody.declination;
    return object?.declination || null;
  }, [object?.declination, ephemerisBody]);

  const displayConstellation = useMemo(() => {
    if (ephemerisBody) return ephemerisBody.constellation;
    return object?.constellation || null;
  }, [object?.constellation, ephemerisBody]);

  if (!object) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="sheet-object-detail">
        <SheetHeader className="pb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <Star className="w-5 h-5" />
                {object.name}
                {object.isHot && (
                  <Sparkles className="w-4 h-4 text-chart-4" data-testid={`icon-wow-detail-${object.catalogId}`} />
                )}
              </SheetTitle>
              <SheetDescription>
                {object.catalogId} · {categoryLabels[object.category] || object.category}
                {displayConstellation && ` · ${displayConstellation}`}
              </SheetDescription>
            </div>
            {visibility && (
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0",
                  quality === "excellent" && "border-chart-2 text-chart-2",
                  quality === "good" && "border-chart-4 text-chart-4",
                  quality === "fair" && "border-chart-5 text-chart-5",
                  quality === "poor" && "border-destructive text-destructive",
                  quality === "below_horizon" && "border-muted text-muted-foreground"
                )}
              >
                {quality === "below_horizon" ? "Below Horizon" : quality.charAt(0).toUpperCase() + quality.slice(1)}
              </Badge>
            )}
          </div>
        </SheetHeader>

        <div className="space-y-5">
          {!hasValidLocation ? (
            <div className="p-4 rounded-md bg-muted/50 text-center">
              <MapPin className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
              <p className="text-sm font-medium">No location configured</p>
              <p className="text-xs text-muted-foreground mb-3">
                Add a location with coordinates to see visibility data
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link href="/locations" data-testid="link-add-location">
                  Add Location
                </Link>
              </Button>
            </div>
          ) : (isEphemerisObject && ephemerisLoading) || !visibility ? (
            <div className="space-y-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-24" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4" />
                <span>Viewing from {favoriteLocation.name}</span>
                {favoriteLocation.bortle && (
                  <Badge variant="outline" className="text-xs">Bortle {favoriteLocation.bortle}</Badge>
                )}
              </div>

              {favoriteLocation.bortle && (
                <BortleVisibilityCard object={object} bortle={favoriteLocation.bortle} />
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Current Position</h4>
                  <AltitudeIndicator altitude={visibility.currentAltitude} />
                  <CompassDisplay azimuth={visibility.currentAzimuth} />
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Today's Times</h4>
                  {visibility.isCircumpolar ? (
                    <div className="p-3 rounded-md bg-chart-2/10 border border-chart-2/30">
                      <div className="flex items-center gap-2">
                        <Moon className="w-4 h-4 text-chart-2" />
                        <span className="text-sm font-medium">Circumpolar</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Visible all night from your location.
                      </p>
                    </div>
                  ) : visibility.neverRises ? (
                    <div className="p-3 rounded-md bg-destructive/10 border border-destructive/30">
                      <div className="flex items-center gap-2">
                        <SunIcon className="w-4 h-4 text-destructive" />
                        <span className="text-sm font-medium">Never Visible</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Never rises from your location.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {visibility.riseTime && (
                        <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                          <div className="flex items-center gap-2">
                            <Sunrise className="w-4 h-4 text-chart-4" />
                            <span className="text-sm">Rise</span>
                          </div>
                          <span className="font-mono text-sm">{format(visibility.riseTime, "HH:mm")}</span>
                        </div>
                      )}
                      {visibility.transitTime && (
                        <div className="flex items-center justify-between p-2 rounded-md bg-primary/10">
                          <div className="flex items-center gap-2">
                            <ArrowUp className="w-4 h-4 text-primary" />
                            <span className="text-sm">Transit</span>
                          </div>
                          <span className="font-mono text-sm">{format(visibility.transitTime, "HH:mm")}</span>
                        </div>
                      )}
                      {visibility.setTime && (
                        <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                          <div className="flex items-center gap-2">
                            <Sunset className="w-4 h-4 text-chart-5" />
                            <span className="text-sm">Set</span>
                          </div>
                          <span className="font-mono text-sm">{format(visibility.setTime, "HH:mm")}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {hasValidLocation && !isNaN(raDecimal) && !isNaN(decDecimal) && favoriteLocation && (
                <>
                  <Separator />
                  <AltitudeChart
                    catalogId={object.catalogId}
                    name={object.name}
                    ra={raDecimal}
                    dec={decDecimal}
                    latitude={favoriteLocation.latitude!}
                    longitude={favoriteLocation.longitude!}
                  />
                </>
              )}
            </>
          )}

          <Separator />

          <div>
            <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
              <Telescope className="w-4 h-4" />
              Equipment Recommendations
            </h4>
            <EquipmentRecommendationsSection objectId={object.id} objectSize={object.size} opticalModifier={opticalModifier} />
          </div>

          <Separator />

          <div className="grid grid-cols-3 gap-3 text-sm">
            {visibility && (
              <div>
                <span className="text-muted-foreground text-xs">Max Alt</span>
                <p className="font-mono">{visibility.maxAltitude.toFixed(1)}°</p>
              </div>
            )}
            {object.rightAscension && (
              <div>
                <span className="text-muted-foreground text-xs">RA</span>
                <p className="font-mono text-xs">{object.rightAscension}</p>
              </div>
            )}
            {object.declination && (
              <div>
                <span className="text-muted-foreground text-xs">Dec</span>
                <p className="font-mono text-xs">{object.declination}</p>
              </div>
            )}
            {object.magnitude != null && (
              <div>
                <span className="text-muted-foreground text-xs">Magnitude</span>
                <p className="font-mono">{object.magnitude.toFixed(1)}</p>
              </div>
            )}
            {object.size && (
              <div>
                <span className="text-muted-foreground text-xs">Size</span>
                <p className="font-mono text-xs">{object.size}</p>
              </div>
            )}
            {object.separation != null && (
              <div>
                <span className="text-muted-foreground text-xs">Separation</span>
                <p className="font-mono">{object.separation.toFixed(1)}"</p>
              </div>
            )}
            {object.difficulty && (
              <div>
                <span className="text-muted-foreground text-xs">Difficulty</span>
                <p className="capitalize">{object.difficulty}</p>
              </div>
            )}
          </div>

          {object.bestMonths && object.bestMonths.length > 0 && (
            <>
              <Separator />
              <div>
                <span className="text-sm text-muted-foreground">Best Viewing Months</span>
                <div className="flex flex-wrap gap-1 mt-2">
                  {object.bestMonths.map((month) => (
                    <Badge key={month} variant="secondary" className="uppercase text-xs">
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

          <div className="space-y-2">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" asChild>
                <Link href="/sky-tonight" data-testid="link-open-visibility-tool">
                  <Eye className="w-4 h-4 mr-2" />
                  Sky Tonight
                </Link>
              </Button>
              <Button variant="outline" size="sm" className="flex-1" asChild>
                <Link href="/wizard" data-testid="link-start-observation">
                  <Telescope className="w-4 h-4 mr-2" />
                  Observe Now
                </Link>
              </Button>
            </div>
            <Button 
              variant={isInWatchlist ? "secondary" : "outline"} 
              size="sm" 
              className="w-full"
              disabled={isInWatchlist || addToWatchlistMutation.isPending}
              onClick={() => object && addToWatchlistMutation.mutate(object.id)}
              data-testid="button-add-to-watchlist"
            >
              {addToWatchlistMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : isInWatchlist ? (
                <BookmarkCheck className="w-4 h-4 mr-2" />
              ) : (
                <Bookmark className="w-4 h-4 mr-2" />
              )}
              {isInWatchlist ? "In Watch List" : "Add to Watch List"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
